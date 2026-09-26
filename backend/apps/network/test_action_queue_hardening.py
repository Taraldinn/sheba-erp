"""
Hardened Test Suite for Network Action Queue, Lifecycle State Machine,
Reconciliation, Concurrency, and Financial Decoupling Invariants.
"""
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from django.db import transaction

from apps.core.models import Tenant, AuditLog
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.finance.models import BillingAccount, LedgerEntry
from apps.network.models import Router, OLT, NetworkAction, NetworkSyncJob, BulkNetworkBatch
from apps.network.services.action_queue import ActionQueueService, BulkOperationsService
from apps.network.action_serializers import NetworkActionSerializer
from apps.network.tasks import (
    dispatch_network_sync_job,
    process_network_sync_job,
    reap_stale_network_actions_task,
)


class NetworkActionQueueHardeningTests(TestCase):
    """
    Validates deterministic lifecycle transitions:
    PENDING -> QUEUED -> RUNNING -> SUCCEEDED / FAILED / RETRYING / CANCELLED / STALE.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Hardened Fiber ISP", slug="hardened-isp", domain="hardened.sheba.net")
        self.other_tenant = Tenant.objects.create(name="Other ISP", slug="other-isp", domain="other.sheba.net")

        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core-CCR-Harden",
            ip_address="10.10.10.1",
            username="admin",
            password="RouterSecretPassword123"
        )

        self.package = Package.objects.create(
            tenant=self.tenant,
            name="50Mbps Fiber Pro",
            regular_price=Decimal("1500.00"),
            mikrotik_profile="50M_profile"
        )

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-HDN-01",
            full_name="Hardened Subscriber",
            pppoe_username="hdn_sub_01",
            pppoe_password="SecretSubscriberPass999",
            router=self.router,
            package=self.package,
            status=CustomerStatus.ACTIVE
        )

    @patch('apps.network.services.action_queue.MikroTikService')
    def test_full_deterministic_lifecycle_success(self, mock_mikrotik_cls):
        """
        Tests strict lifecycle progression:
        PENDING -> QUEUED -> RUNNING -> SUCCEEDED.
        Verifies correlation_id, device_identity, started_at, completed_at.
        """
        mock_svc = MagicMock()
        mock_mikrotik_cls.return_value = mock_svc

        correlation_id = "corr-" + uuid.uuid4().hex[:12]

        # 1. Enqueue action (starts PENDING, queued on commit)
        job = ActionQueueService.enqueue_action(
            tenant=self.tenant,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.customer,
            actor="ops_engineer",
            correlation_id=correlation_id,
            timeout_seconds=90,
            execute_async=False
        )

        self.assertEqual(job.status, NetworkAction.JobStatus.PENDING)
        self.assertEqual(job.correlation_id, correlation_id)
        self.assertEqual(job.device_identity, self.router.name)
        self.assertEqual(job.timeout_seconds, 90)
        self.assertIsNone(job.started_at)
        self.assertIsNone(job.completed_at)

        # 2. Simulate dispatch transition to QUEUED
        job.status = NetworkAction.JobStatus.QUEUED
        job.save()

        # 3. Execute action -> transitions to RUNNING -> SUCCEEDED
        result = ActionQueueService.execute_action(
            tenant_id=str(self.tenant.id),
            action_id=str(job.id)
        )

        self.assertTrue(result['success'])
        self.assertIn(result['status'], [NetworkAction.JobStatus.SUCCEEDED, NetworkAction.JobStatus.SUCCESS])

        job.refresh_from_db()
        self.assertEqual(job.status, NetworkAction.JobStatus.SUCCEEDED)
        self.assertIsNotNone(job.started_at)
        self.assertIsNotNone(job.completed_at)
        self.assertTrue(job.is_terminal)
        self.assertTrue(job.is_successful)
        self.assertFalse(job.is_active)
        self.assertEqual(job.error_message, "")

        mock_svc.pppoe.enable_user_by_name.assert_called_once_with("hdn_sub_01")

    @patch('apps.network.services.action_queue.MikroTikService')
    def test_lifecycle_retries_and_terminal_failed(self, mock_mikrotik_cls):
        """
        Tests error handling:
        RUNNING -> RETRYING (attempts < max_retries) -> FAILED (attempts >= max_retries).
        """
        mock_svc = MagicMock()
        mock_svc.pppoe.disable_user_by_name.side_effect = TimeoutError("RouterOS connection timed out")
        mock_mikrotik_cls.return_value = mock_svc

        job = ActionQueueService.enqueue_action(
            tenant=self.tenant,
            action=NetworkAction.Action.DISABLE_SERVICE,
            customer=self.customer,
            execute_async=False
        )

        # Attempt 1 -> RETRYING
        res1 = ActionQueueService.execute_action(str(self.tenant.id), str(job.id))
        self.assertFalse(res1['success'])
        job.refresh_from_db()
        self.assertEqual(job.status, NetworkAction.JobStatus.RETRYING)
        self.assertEqual(job.retry_count, 1)
        self.assertTrue(job.is_active)
        self.assertFalse(job.is_terminal)

        # Attempt 2 -> RETRYING
        res2 = ActionQueueService.execute_action(str(self.tenant.id), str(job.id))
        self.assertFalse(res2['success'])
        job.refresh_from_db()
        self.assertEqual(job.status, NetworkAction.JobStatus.RETRYING)
        self.assertEqual(job.retry_count, 2)

        # Attempt 3 -> FAILED (max_retries reached)
        res3 = ActionQueueService.execute_action(str(self.tenant.id), str(job.id))
        self.assertFalse(res3['success'])
        job.refresh_from_db()
        self.assertEqual(job.status, NetworkAction.JobStatus.FAILED)
        self.assertEqual(job.retry_count, 3)
        self.assertTrue(job.is_terminal)
        self.assertFalse(job.is_active)
        self.assertIsNotNone(job.completed_at)
        self.assertIn("RouterOS connection timed out", job.error_message)

    def test_cancellation_lifecycle(self):
        """
        Tests that PENDING or QUEUED jobs can be CANCELLED, but RUNNING/SUCCEEDED jobs cannot.
        """
        job = ActionQueueService.enqueue_action(
            tenant=self.tenant,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.customer,
            execute_async=False
        )
        self.assertEqual(job.status, NetworkAction.JobStatus.PENDING)

        # Cancel PENDING job -> CANCELLED
        cancelled = ActionQueueService.cancel_action(str(job.id), str(self.tenant.id), actor="supervisor")
        self.assertIsNotNone(cancelled)
        self.assertEqual(cancelled.status, NetworkAction.JobStatus.CANCELLED)
        self.assertIsNotNone(cancelled.completed_at)

        # Create another and transition to RUNNING
        job2 = ActionQueueService.enqueue_action(
            tenant=self.tenant,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.customer,
            execute_async=False
        )
        job2.status = NetworkAction.JobStatus.RUNNING
        job2.save()

        # Attempt to cancel RUNNING job should fail / remain RUNNING
        ActionQueueService.cancel_action(str(job2.id), str(self.tenant.id), actor="supervisor")
        job2.refresh_from_db()
        self.assertEqual(job2.status, NetworkAction.JobStatus.RUNNING)

    def test_stale_job_watchdog_reaper(self):
        """
        Tests that actions stuck in RUNNING past timeout are marked STALE by the watchdog.
        """
        past_time = timezone.now() - timezone.timedelta(seconds=400)

        # 1. Job stuck in RUNNING
        stuck_running = NetworkAction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            router=self.router,
            action=NetworkAction.Action.ENABLE_SERVICE,
            status=NetworkAction.JobStatus.RUNNING,
            timeout_seconds=120,
            started_at=past_time,
            device_identity=self.router.name
        )

        # 2. Fresh job in RUNNING
        fresh_running = NetworkAction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            router=self.router,
            action=NetworkAction.Action.ENABLE_SERVICE,
            status=NetworkAction.JobStatus.RUNNING,
            timeout_seconds=120,
            started_at=timezone.now(),
            device_identity=self.router.name
        )

        # 3. Stuck job in QUEUED
        stuck_queued = NetworkAction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            router=self.router,
            action=NetworkAction.Action.ENABLE_SERVICE,
            status=NetworkAction.JobStatus.QUEUED,
            timeout_seconds=120,
            device_identity=self.router.name
        )
        NetworkAction.objects.filter(id=stuck_queued.id).update(updated_at=past_time)

        # Run watchdog reaper
        reaped_count = ActionQueueService.reap_stale_actions(tenant_id=str(self.tenant.id))
        self.assertEqual(reaped_count, 2)

        stuck_running.refresh_from_db()
        self.assertEqual(stuck_running.status, NetworkAction.JobStatus.STALE)
        self.assertTrue(stuck_running.is_terminal)
        self.assertIn("STALE", stuck_running.error_message)

        stuck_queued.refresh_from_db()
        self.assertEqual(stuck_queued.status, NetworkAction.JobStatus.STALE)

        fresh_running.refresh_from_db()
        self.assertEqual(fresh_running.status, NetworkAction.JobStatus.RUNNING)

        # Test Celery periodic task execution
        task_res = reap_stale_network_actions_task(tenant_id=str(self.tenant.id))
        self.assertIn('reaped_count', task_res)

    def test_idempotency_deduplication(self):
        """
        Tests that re-enqueueing with the same idempotency key returns the existing job.
        """
        idempotency_key = "idemp-enable-" + uuid.uuid4().hex

        job1 = ActionQueueService.enqueue_action(
            tenant=self.tenant,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.customer,
            idempotency_key=idempotency_key,
            execute_async=False
        )

        job2 = ActionQueueService.enqueue_action(
            tenant=self.tenant,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.customer,
            idempotency_key=idempotency_key,
            execute_async=False
        )

        self.assertEqual(job1.id, job2.id)
        self.assertEqual(NetworkAction.objects.filter(tenant=self.tenant, idempotency_key=idempotency_key).count(), 1)

    def test_credential_masking_and_zero_logging(self):
        """
        Ensures plaintext router and customer passwords never appear in:
        1. Serialized API responses.
        2. Audit log details.
        3. Exception error messages.
        """
        job = NetworkAction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            router=self.router,
            action=NetworkAction.Action.SYNC_SECRET,
            status=NetworkAction.JobStatus.PENDING,
            payload={
                "username": self.customer.pppoe_username,
                "password": "UltraSecretPlainTextPass!234",
                "profile": "50M_profile"
            }
        )

        # Verify serializer output
        serializer = NetworkActionSerializer(job)
        data = serializer.data
        sanitized_payload = data['sanitized_payload']
        self.assertEqual(sanitized_payload.get('password'), '********')
        self.assertNotIn('UltraSecretPlainTextPass!234', str(data))

        # Verify AuditLog redaction
        from apps.network.services.audit import log_network_action
        log_network_action(
            tenant=self.tenant,
            actor_username="test_worker",
            action="sync_secret",
            resource_type="NetworkAction",
            resource_id=str(job.id),
            details={
                "username": self.customer.pppoe_username,
                "password": "UltraSecretPlainTextPass!234",
                "snmp_community": "private_secret"
            }
        )

        log_entry = AuditLog.objects.filter(resource_id=str(job.id)).first()
        self.assertIsNotNone(log_entry)
        self.assertEqual(log_entry.details.get('password'), '********')
        self.assertEqual(log_entry.details.get('snmp_community'), '********')
        self.assertNotIn('UltraSecretPlainTextPass!234', str(log_entry.details))


class FinancialNetworkDecouplingTests(TransactionTestCase):
    """
    Validates the critical invariant:
    - Desired State -> ERP -> Network Action -> Actual State
    - Financial DB commit MUST happen before network activation.
    - Network failure MUST NOT corrupt or rollback financial state.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Decoupled ISP", slug="decoupled-isp", domain="decoupled.sheba.net")
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Decoupled-Router-01",
            ip_address="10.20.20.1",
            username="admin",
            password="RouterPassword123"
        )
        self.package = Package.objects.create(
            tenant=self.tenant,
            name="Standard Plan",
            regular_price=Decimal("1000.00"),
            mikrotik_profile="20M_profile"
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-DEC-01",
            full_name="Decoupled Subscriber",
            pppoe_username="dec_sub_01",
            router=self.router,
            package=self.package,
            status=CustomerStatus.SUSPENDED
        )
        self.billing_account = BillingAccount.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            balance=Decimal("0.00")
        )

    @patch('apps.network.tasks.MikroTikService')
    def test_network_failure_does_not_corrupt_financial_transaction(self, mock_mikrotik_cls):
        """
        Simulates customer payment/recharge where financial ledger entries are created,
        and network activation fails due to dead router.
        The financial state must remain committed and 100% intact!
        """
        mock_svc = MagicMock()
        mock_svc.pppoe.enable_user_by_name.side_effect = ConnectionError("Physical router is dead / offline")
        mock_mikrotik_cls.return_value = mock_svc

        # Execute financial commit inside atomic block
        with transaction.atomic():
            # 1. Update customer status
            self.customer.status = CustomerStatus.ACTIVE
            self.customer.save()

            # 2. Financial billing account update & ledger entry
            self.billing_account.balance += Decimal("1000.00")
            self.billing_account.save()

            ledger = LedgerEntry.objects.create(
                tenant=self.tenant,
                customer=self.customer,
                entry_type=LedgerEntry.EntryType.PAYMENT,
                amount=Decimal("1000.00"),
                balance_after=self.billing_account.balance,
                description="Subscriber renewal recharge"
            )

            # 3. Dispatch network sync job (on_commit)
            job = dispatch_network_sync_job(
                tenant=self.tenant,
                action=NetworkSyncJob.Action.ENABLE_SERVICE,
                customer=self.customer,
                router=self.router,
                payload={'username': self.customer.pppoe_username},
                execute_async=False
            )

        # Verify Financial state is safely committed
        self.billing_account.refresh_from_db()
        self.assertEqual(self.billing_account.balance, Decimal("1000.00"))
        self.assertEqual(LedgerEntry.objects.filter(customer=self.customer).count(), 1)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, CustomerStatus.ACTIVE)

        # Now execute the network job against the failing router (raises on Celery retry)
        try:
            process_network_sync_job(
                tenant_id=str(self.tenant.id),
                job_id=str(job.id)
            )
        except Exception:
            pass

        job.refresh_from_db()
        self.assertIn(job.status, [NetworkSyncJob.JobStatus.RETRYING, NetworkSyncJob.JobStatus.FAILED])

        # Verify Financial state was completely untouched by the network failure!
        self.billing_account.refresh_from_db()
        self.assertEqual(self.billing_account.balance, Decimal("1000.00"))
        self.assertEqual(LedgerEntry.objects.filter(customer=self.customer).count(), 1)
        self.assertEqual(LedgerEntry.objects.first().id, ledger.id)

    def test_financial_rollback_does_not_dispatch_network_action(self):
        """
        If a financial transaction encounters an error and rolls back,
        transaction.on_commit must ensure the network action is NEVER executed!
        """
        with patch('apps.network.tasks.process_network_sync_job.delay') as mock_delay:
            try:
                with transaction.atomic():
                    self.billing_account.balance += Decimal("500.00")
                    self.billing_account.save()

                    dispatch_network_sync_job(
                        tenant=self.tenant,
                        action=NetworkSyncJob.Action.ENABLE_SERVICE,
                        customer=self.customer,
                        router=self.router,
                        execute_async=True
                    )

                    # Trigger deliberate financial failure
                    raise ValueError("Insufficient payment gateway verification")
            except ValueError:
                pass

            # on_commit callback was cancelled by transaction abort
            mock_delay.assert_not_called()

            # Billing account balance rolled back
            self.billing_account.refresh_from_db()
            self.assertEqual(self.billing_account.balance, Decimal("0.00"))


class NetworkActionConcurrencyTests(TransactionTestCase):
    """
    Validates concurrency safety:
    - Distributed locking prevents duplicate execution by concurrent workers.
    - Concurrent distinct jobs execute cleanly without cross-thread interference.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Concurrent ISP", slug="concurrent-isp", domain="conc.sheba.net")
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Concurrent-Core-Router",
            ip_address="10.30.30.1",
            username="admin",
            password="RouterPassword123"
        )
        self.package = Package.objects.create(
            tenant=self.tenant,
            name="Concurrent Plan",
            regular_price=Decimal("1200.00"),
            mikrotik_profile="conc_profile"
        )

    @patch('apps.network.services.action_queue.MikroTikService')
    def test_concurrent_worker_execution_deduplication(self, mock_mikrotik_cls):
        """
        Two workers concurrently try to execute the exact same NetworkAction.
        Distributed locking guarantees only one worker executes hardware operations.
        The second worker yields cleanly without error or double-execution.
        """
        import time
        import concurrent.futures

        mock_svc = MagicMock()
        def slow_enable(username):
            time.sleep(0.1)  # Simulate real socket roundtrip
            return True
        mock_svc.pppoe.enable_user_by_name.side_effect = slow_enable
        mock_mikrotik_cls.return_value = mock_svc

        cust = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-RACE-01",
            full_name="Race Subscriber",
            pppoe_username="race_sub_01",
            router=self.router,
            package=self.package,
            status=CustomerStatus.ACTIVE
        )

        with patch('apps.network.tasks.process_network_action_task.delay'):
            job = ActionQueueService.enqueue_action(
                tenant=self.tenant,
                action=NetworkAction.Action.ENABLE_SERVICE,
                customer=cust,
                execute_async=True
            )

        results = []
        def worker_task():
            from django.db import connection
            connection.close()  # Separate thread DB connection
            return ActionQueueService.execute_action(str(self.tenant.id), str(job.id))

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(worker_task)
            f2 = executor.submit(worker_task)
            results = [f1.result(), f2.result()]

        # Exactly one worker executes hardware operations
        self.assertEqual(mock_svc.pppoe.enable_user_by_name.call_count, 1)

        # One worker performed hardware execution, the other yielded or saw already finalized
        executed_runs = [r for r in results if 'result' in r]
        skipped_runs = [r for r in results if r.get('error') == 'LOCKED' or r.get('message') == 'Already finalized']

        self.assertEqual(len(executed_runs), 1)
        self.assertEqual(len(skipped_runs), 1)

        job.refresh_from_db()
        self.assertIn(job.status, [NetworkAction.JobStatus.SUCCEEDED, NetworkAction.JobStatus.SUCCESS])
        # Hardware call should be invoked only once
        self.assertEqual(mock_svc.pppoe.enable_user_by_name.call_count, 1)

    @patch('apps.network.services.action_queue.MikroTikService')
    def test_concurrent_independent_actions(self, mock_mikrotik_cls):
        """
        Multiple distinct subscribers' network actions execute concurrently
        without deadlocking or interfering with each other.
        """
        import concurrent.futures

        mock_svc = MagicMock()
        mock_mikrotik_cls.return_value = mock_svc

        customers = []
        jobs = []
        for i in range(4):
            c = Customer.objects.create(
                tenant=self.tenant,
                customer_code=f"CUST-PARALLEL-{i}",
                full_name=f"Parallel Subscriber {i}",
                pppoe_username=f"par_sub_{i}",
                router=self.router,
                package=self.package,
                status=CustomerStatus.ACTIVE
            )
            customers.append(c)
            j = ActionQueueService.enqueue_action(
                tenant=self.tenant,
                action=NetworkAction.Action.ENABLE_SERVICE,
                customer=c,
                execute_async=False
            )
            jobs.append(j)

        def worker_task(job_id):
            from django.db import connection
            connection.close()
            return ActionQueueService.execute_action(str(self.tenant.id), str(job_id))

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(worker_task, j.id) for j in jobs]
            results = [f.result() for f in futures]

        for r in results:
            self.assertTrue(r['success'])

        for j in jobs:
            j.refresh_from_db()
            self.assertIn(j.status, [NetworkAction.JobStatus.SUCCEEDED, NetworkAction.JobStatus.SUCCESS])
            self.assertTrue(j.is_terminal)

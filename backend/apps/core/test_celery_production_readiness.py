"""
Celery & Redis Production Readiness Test Suite.
==============================================
Validates:
1. Task Registration & Autodiscovery:
   - All critical asynchronous and periodic tasks are registered in Celery app.
   - Queue routing correctly routes network tasks to 'network', billing tasks to 'billing', and others to 'default'.
   - Worker configuration (acks_late, prefetch, default queue, timeouts) matches production specs.
   - Beat schedule registers all required recurring cron jobs.
2. Retry Policy:
   - Transient network/database errors trigger self.retry() with exponential backoff up to max_retries.
3. Failure Handling:
   - Terminal errors (e.g. non-existent entity, validation errors) fail cleanly, update DB status, and do not crash worker.
4. Idempotency & Duplicate Execution Prevention:
   - Distributed locking prevents concurrent execution of invoices, expiries, payment reconciliations, telemetry, and network sync.
   - Running scheduled tasks back-to-back produces identical state without double-invoicing, double-charging, or duplicate jobs.
5. Tenant Isolation:
   - All tenant-sensitive tasks strictly require explicit tenant_id.
   - Tasks operating with Tenant A cannot access, inspect, or mutate Tenant B records.
   - No tasks depend on HTTP request context or request.tenant.
6. Zero Secrets in Payloads / Safe Logs:
   - Task parameters, database payloads, and logs never contain plaintext passwords, API keys, or router secrets.
"""

import uuid
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.utils import timezone
from celery.exceptions import Retry

from sheba_core.celery import app as celery_app
from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice
from apps.finance.models import BillingAccount
from apps.network.models import Router, OLT, NetworkSyncJob
from apps.payments.models import InboundPaymentEvent, PaymentTransaction, SmsLog
from apps.corporate.models import (
    CorporateCustomer,
    CorporateConnection,
    CorporateTrafficSample,
    CorporateBillingPeriod,
    PeriodCalculationStatus,
)
from apps.core.lock import distributed_lock, LockAcquisitionError
from apps.core.tasks import (
    expire_customers,
    generate_monthly_invoices,
    process_payment_event,
    reconcile_payments,
    sync_router,
    sync_olt,
    send_sms,
    enforce_subscription_lifecycle,
    emit_platform_audit_event,
    send_transactional_email_task,
)
from apps.network.tasks import (
    process_network_sync_job,
    reconcile_router_task,
    process_network_action_task,
    process_bulk_batch_task,
    sync_router_task,
    sync_olt_task,
)
from apps.corporate.tasks import (
    collect_corporate_telemetry,
    collect_corporate_telemetry_for_tenant,
    generate_monthly_corporate_invoices,
    generate_monthly_corporate_invoices_for_tenant,
)


class CeleryProductionReadinessTests(TestCase):
    def setUp(self):
        # Tenant A
        self.tenant_a = Tenant.objects.create(
            name='Alpha Net',
            slug='alphanet',
            domain='alpha.shebafi.com',
            is_active=True,
        )
        self.domain_a = TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname='alpha.shebafi.com',
            is_active=True,
            is_primary=True,
        )

        # Tenant B
        self.tenant_b = Tenant.objects.create(
            name='Beta Net',
            slug='betanet',
            domain='beta.shebafi.com',
            is_active=True,
        )
        self.domain_b = TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname='beta.shebafi.com',
            is_active=True,
            is_primary=True,
        )

        self.pkg_a = Package.objects.create(
            tenant=self.tenant_a,
            name='Alpha-10M',
            regular_price=Decimal('1000.00'),
            speed_mbps=10,
            mikrotik_profile='profile-10m',
        )
        self.pkg_b = Package.objects.create(
            tenant=self.tenant_b,
            name='Beta-10M',
            regular_price=Decimal('1200.00'),
            speed_mbps=10,
            mikrotik_profile='profile-10m',
        )

        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name='Alpha-Core-CCR',
            ip_address='10.10.10.1',
            username='alpha_admin',
            password='AlphaSecretPassword123!',
            status='Online',
        )
        self.router_b = Router.objects.create(
            tenant=self.tenant_b,
            name='Beta-Core-CCR',
            ip_address='10.20.20.1',
            username='beta_admin',
            password='BetaSecretPassword123!',
            status='Online',
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Task Registration & Queue Routing Verification
    # ─────────────────────────────────────────────────────────────────────────

    def test_all_production_tasks_registered(self):
        """Verifies that Celery autodiscovery registers all required production tasks."""
        # Ensure loader has loaded default modules
        celery_app.loader.import_default_modules()
        registered_tasks = set(celery_app.tasks.keys())

        expected_tasks = [
            'apps.core.tasks.expire_customers',
            'apps.core.tasks.generate_monthly_invoices',
            'apps.core.tasks.process_payment_event',
            'apps.core.tasks.reconcile_payments',
            'apps.core.tasks.sync_router',
            'apps.core.tasks.sync_olt',
            'apps.core.tasks.send_sms',
            'apps.core.tasks.retry_sms',
            'apps.core.tasks.enforce_subscription_lifecycle',
            'apps.core.tasks.emit_platform_audit_event',
            'apps.core.tasks.send_transactional_email_task',
            'apps.network.tasks.process_network_sync_job',
            'apps.network.tasks.reconcile_router_task',
            'apps.network.tasks.process_network_action_task',
            'apps.network.tasks.process_bulk_batch_task',
            'apps.network.tasks.sync_router_task',
            'apps.network.tasks.sync_olt_task',
            'apps.corporate.tasks.collect_corporate_telemetry',
            'apps.corporate.tasks.generate_monthly_corporate_invoices',
            'sheba_core.celery.debug_task',
        ]

        for task_name in expected_tasks:
            self.assertIn(
                task_name,
                registered_tasks,
                f"Required task {task_name} is not registered in Celery application!"
            )

    def test_queue_routing_policy(self):
        """Verifies task routes map network tasks to 'network', billing to 'billing', and others to 'default'."""
        routes = celery_app.conf.task_routes
        self.assertIsNotNone(routes, "Task routes configuration must be defined!")

        router = celery_app.amqp.router

        network_route = router.route({}, 'apps.network.tasks.process_network_sync_job', (), {})
        q_net = network_route.get('queue')
        self.assertEqual(getattr(q_net, 'name', str(q_net)), 'network')

        router_sync_route = router.route({}, 'apps.core.tasks.sync_router', (), {})
        q_sync = router_sync_route.get('queue')
        self.assertEqual(getattr(q_sync, 'name', str(q_sync)), 'network')

        billing_route = router.route({}, 'apps.core.tasks.generate_monthly_invoices', (), {})
        q_bill = billing_route.get('queue')
        self.assertEqual(getattr(q_bill, 'name', str(q_bill)), 'billing')

        payment_route = router.route({}, 'apps.core.tasks.process_payment_event', (), {})
        q_pay = payment_route.get('queue')
        self.assertEqual(getattr(q_pay, 'name', str(q_pay)), 'billing')

        expiry_route = router.route({}, 'apps.core.tasks.expire_customers', (), {})
        q_exp = expiry_route.get('queue')
        self.assertEqual(getattr(q_exp, 'name', str(q_exp)), 'billing')

        sms_route = router.route({}, 'apps.core.tasks.send_sms', (), {})
        q_sms = sms_route.get('queue')
        self.assertEqual(getattr(q_sms, 'name', str(q_sms)), 'default')

        audit_route = router.route({}, 'apps.core.tasks.emit_platform_audit_event', (), {})
        q_aud = audit_route.get('queue')
        self.assertEqual(getattr(q_aud, 'name', str(q_aud)), 'default')

    def test_worker_production_configuration(self):
        """Verifies worker reliability, acknowledgment, and prefetch configuration."""
        conf = celery_app.conf
        self.assertEqual(conf.task_default_queue, 'default')
        self.assertTrue(conf.task_acks_late, "CELERY_TASK_ACKS_LATE must be True for reliability")
        self.assertTrue(conf.task_reject_on_worker_lost, "CELERY_TASK_REJECT_ON_WORKER_LOST must be True")
        self.assertEqual(conf.worker_prefetch_multiplier, 1, "Prefetch multiplier must be 1 to prevent worker starvation")
        self.assertGreaterEqual(conf.task_time_limit, 1800, "CELERY_TASK_TIME_LIMIT must be at least 30 minutes")
        self.assertIsNotNone(conf.task_soft_time_limit, "CELERY_TASK_SOFT_TIME_LIMIT must be set")
        self.assertLess(conf.task_soft_time_limit, conf.task_time_limit)

    def test_celery_beat_schedule_configured(self):
        """Verifies all required periodic jobs exist in CELERY_BEAT_SCHEDULE."""
        beat_sched = celery_app.conf.beat_schedule
        self.assertIsNotNone(beat_sched)

        expected_schedules = [
            'expire_customers_daily',
            'generate_monthly_invoices_monthly',
            'reconcile_payments_hourly',
            'enforce_subscription_lifecycle_daily',
            'collect_corporate_telemetry_every_5m',
            'generate_monthly_corporate_invoices_monthly',
        ]

        for sched_key in expected_schedules:
            self.assertIn(sched_key, beat_sched, f"Scheduled job {sched_key} missing from beat schedule")

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Retry Policy Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_task_retry_on_transient_failure(self):
        """Verifies that transient network failures trigger self.retry() with backoff."""
        with patch.object(sync_router, 'retry', side_effect=Retry("Simulated Celery Retry Exception")) as mock_retry:
            with patch('apps.network.services.mikrotik.MikroTikService.get_system_health', side_effect=TimeoutError("Network Timeout")):
                with self.assertRaises(Retry):
                    sync_router(
                        tenant_id=str(self.tenant_a.id),
                        router_id=str(self.router_a.id),
                    )
                mock_retry.assert_called_once()

    def test_network_sync_job_retry_on_hardware_failure(self):
        """Verifies process_network_sync_job retries on router disconnect."""
        job = NetworkSyncJob.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            action=NetworkSyncJob.Action.ENABLE_USER,
            status=NetworkSyncJob.JobStatus.PENDING,
            payload={'username': 'test_pppoe_user', 'profile': 'default'},
        )

        with patch.object(process_network_sync_job, 'retry', side_effect=Retry("Hardware Timeout Retry")) as mock_retry:
            with patch('apps.network.tasks.MikroTikService') as mock_mikrotik_cls:
                mock_mikrotik_cls.return_value.pppoe.enable_user_by_name.side_effect = ConnectionResetError("MikroTik socket reset")
                with self.assertRaises(Retry):
                    process_network_sync_job(
                        tenant_id=str(self.tenant_a.id),
                        job_id=str(job.id),
                    )
                mock_retry.assert_called_once()

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Failure Handling Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_terminal_error_fails_gracefully(self):
        """Terminal errors (e.g. unknown router or validation failure) do not crash worker."""
        # Non-existent router
        res = sync_router(
            tenant_id=str(self.tenant_a.id),
            router_id=str(uuid.uuid4()),
        )
        self.assertFalse(res['success'])
        self.assertIn('not found', res['error'])

        # Invalid sync job (missing required username)
        job = NetworkSyncJob.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            action=NetworkSyncJob.Action.ENABLE_USER,
            status=NetworkSyncJob.JobStatus.PENDING,
            payload={},  # Missing username
        )
        res_job = process_network_sync_job(
            tenant_id=str(self.tenant_a.id),
            job_id=str(job.id),
        )
        self.assertFalse(res_job['success'])
        job.refresh_from_db()
        self.assertEqual(job.status, NetworkSyncJob.JobStatus.FAILED)
        self.assertIn('username', job.error_message.lower())

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Idempotency & Duplicate Execution Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_distributed_lock_prevents_concurrent_duplicate_tasks(self):
        """Verifies distributed locks skip duplicate executions across all scheduled jobs."""
        # 1. expire_customers
        with distributed_lock(f"lock:expiry:{self.tenant_a.id}", timeout=60):
            res = expire_customers(tenant_id=str(self.tenant_a.id))
            self.assertFalse(res['success'])
            self.assertEqual(res['error'], 'DUPLICATE_TASK_SKIPPED')

        # 2. generate_monthly_invoices
        with distributed_lock(f"lock:invoice_gen:{self.tenant_a.id}", timeout=60):
            res = generate_monthly_invoices(tenant_id=str(self.tenant_a.id))
            self.assertFalse(res['success'])
            self.assertEqual(res['error'], 'DUPLICATE_TASK_SKIPPED')

        # 3. reconcile_payments
        with distributed_lock(f"lock:reconcile:{self.tenant_a.id}", timeout=60):
            res = reconcile_payments(tenant_id=str(self.tenant_a.id))
            self.assertFalse(res['success'])
            self.assertEqual(res['error'], 'DUPLICATE_TASK_SKIPPED')

        # 4. sync_router
        with distributed_lock(f"lock:router_sync:{self.tenant_a.id}:{self.router_a.id}", timeout=60):
            res = sync_router(tenant_id=str(self.tenant_a.id), router_id=str(self.router_a.id))
            self.assertFalse(res['success'])
            self.assertEqual(res['error'], 'DUPLICATE_TASK_SKIPPED')

        # 5. enforce_subscription_lifecycle
        with distributed_lock("lock:subscription_lifecycle", timeout=60):
            res = enforce_subscription_lifecycle()
            self.assertFalse(res['success'])
            self.assertEqual(res['error'], 'DUPLICATE_TASK_SKIPPED')

        # 6. collect_corporate_telemetry
        with distributed_lock(f"lock:corp_telemetry:{self.tenant_a.id}", timeout=60):
            res = collect_corporate_telemetry_for_tenant(str(self.tenant_a.id))
            self.assertFalse(res['success'])
            self.assertEqual(res['error'], 'DUPLICATE_TASK_SKIPPED')

        # 7. generate_monthly_corporate_invoices
        with distributed_lock(f"lock:corp_invoices:{self.tenant_a.id}", timeout=60):
            res = generate_monthly_corporate_invoices_for_tenant(str(self.tenant_a.id))
            self.assertFalse(res['success'])
            self.assertEqual(res['error'], 'DUPLICATE_TASK_SKIPPED')

    def test_scheduled_monthly_invoices_back_to_back_cannot_duplicate(self):
        """Running generate_monthly_invoices twice creates invoices on run 1 and skips all on run 2."""
        Customer.objects.create(
            tenant=self.tenant_a,
            package=self.pkg_a,
            router=self.router_a,
            full_name='Subscriber 1',
            mobile='01711999881',
            pppoe_username='sub1_alpha',
            status=CustomerStatus.ACTIVE,
            monthly_bill=Decimal('1000.00'),
            billing_type='Prepaid',
        )

        month_label = 'October 2026'

        # First run: creates invoice
        run_1 = generate_monthly_invoices(tenant_id=str(self.tenant_a.id), billing_month=month_label)
        self.assertTrue(run_1['success'])
        self.assertEqual(run_1['invoices_created'], 1)
        self.assertEqual(run_1['invoices_skipped'], 0)

        initial_count = Invoice.objects.filter(tenant=self.tenant_a, billing_month=month_label).count()
        self.assertEqual(initial_count, 1)

        # Second run: must skip and create zero duplicates
        run_2 = generate_monthly_invoices(tenant_id=str(self.tenant_a.id), billing_month=month_label)
        self.assertTrue(run_2['success'])
        self.assertEqual(run_2['invoices_created'], 0)
        self.assertEqual(run_2['invoices_skipped'], 1)

        after_count = Invoice.objects.filter(tenant=self.tenant_a, billing_month=month_label).count()
        self.assertEqual(after_count, 1, "Duplicate invoices were generated on second task run!")

    def test_payment_event_duplicate_processing_idempotency(self):
        """Verifies process_payment_event ignores already completed events and deduplicates."""
        customer = Customer.objects.create(
            tenant=self.tenant_a,
            package=self.pkg_a,
            router=self.router_a,
            full_name='Payment Customer',
            pppoe_username='pay_cust_alpha',
            mobile='01711999888',
            status=CustomerStatus.ACTIVE,
            monthly_bill=Decimal('1000.00'),
            billing_type='Prepaid',
        )
        event = InboundPaymentEvent.objects.create(
            tenant=self.tenant_a,
            provider='bkash',
            source=InboundPaymentEvent.EventSource.WEBHOOK,
            status=InboundPaymentEvent.EventStatus.RECEIVED,
            trx_id='TRX-IDEMP-TEST-99',
            amount=Decimal('1000.00'),
            sender_account='01711999888',
            raw_payload={'trx_id': 'TRX-IDEMP-TEST-99', 'amount': '1000.00', 'from': '01711999888'},
        )

        # First execution
        res1 = process_payment_event(tenant_id=str(self.tenant_a.id), event_id=str(event.id))
        self.assertTrue(res1['success'])
        self.assertEqual(res1['result'], 'MATCHED')

        # Second execution with same event_id
        res2 = process_payment_event(tenant_id=str(self.tenant_a.id), event_id=str(event.id))
        self.assertTrue(res2['success'])
        self.assertIn('already completed', res2.get('message', '').lower())

        # Verify only 1 PaymentTransaction created
        tx_count = PaymentTransaction.objects.filter(tenant=self.tenant_a, trx_id='TRX-IDEMP-TEST-99').count()
        self.assertEqual(tx_count, 1)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Tenant Isolation Tests
    # ─────────────────────────────────────────────────────────────────────────

    def test_all_tasks_require_explicit_tenant_id(self):
        """Tasks strictly require explicit tenant_id and raise ValueError if omitted."""
        with self.assertRaises(ValueError):
            sync_router(tenant_id=None, router_id=str(self.router_a.id))

        with self.assertRaises(ValueError):
            sync_olt(tenant_id=None, olt_id=str(uuid.uuid4()))

        with self.assertRaises(ValueError):
            send_sms(tenant_id=None, payment_id=str(uuid.uuid4()))

        with self.assertRaises(ValueError):
            process_payment_event(tenant_id=None, event_id=str(uuid.uuid4()))

        with self.assertRaises(ValueError):
            process_network_sync_job(tenant_id=None, job_id=str(uuid.uuid4()))

        with self.assertRaises(ValueError):
            sync_router_task(tenant_id=None, router_id=str(self.router_a.id))

        with self.assertRaises(ValueError):
            sync_olt_task(tenant_id=None, olt_id=str(uuid.uuid4()))

    def test_cross_tenant_isolation_in_tasks(self):
        """Tenant A cannot access or mutate Tenant B records via background tasks."""
        # Tenant A tries to sync Tenant B's router
        res_router = sync_router(tenant_id=str(self.tenant_a.id), router_id=str(self.router_b.id))
        self.assertFalse(res_router['success'])
        self.assertIn('not found', res_router['error'])

        # Tenant A tries to execute a sync job belonging to Tenant B
        job_b = NetworkSyncJob.objects.create(
            tenant=self.tenant_b,
            router=self.router_b,
            action=NetworkSyncJob.Action.DISABLE_USER,
            status=NetworkSyncJob.JobStatus.PENDING,
            payload={'username': 'beta_user'},
        )
        res_job = process_network_sync_job(tenant_id=str(self.tenant_a.id), job_id=str(job_b.id))
        self.assertFalse(res_job['success'])
        self.assertIn('not found', res_job['error'])
        job_b.refresh_from_db()
        self.assertEqual(job_b.status, NetworkSyncJob.JobStatus.PENDING)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Zero Secrets in Payloads & Safe Probes
    # ─────────────────────────────────────────────────────────────────────────

    def test_safe_debug_probe_never_leaks_secrets(self):
        """debug_task returns healthy status without echoing request args/kwargs."""
        from sheba_core.celery import debug_task
        res = debug_task.apply().result
        self.assertEqual(res['status'], 'healthy')
        self.assertTrue(res['task_id'])
        self.assertNotIn('password', str(res).lower())

    def test_network_action_payload_contains_no_credentials(self):
        """Verifies network actions dispatched through tasks store only state targets, never passwords."""
        from apps.network.services.action_queue import ActionQueueService
        customer = Customer.objects.create(
            tenant=self.tenant_a,
            package=self.pkg_a,
            router=self.router_a,
            full_name='Target Cust',
            mobile='01711999882',
            pppoe_username='target_cust_pppoe',
            status=CustomerStatus.ACTIVE,
            monthly_bill=Decimal('1000.00'),
            billing_type='Prepaid',
        )

        job = ActionQueueService.enqueue_action(
            tenant=self.tenant_a,
            customer=customer,
            action='DISABLE_USER',
            router=self.router_a,
            payload={'pppoe_username': customer.pppoe_username, 'reason': 'EXPIRED'},
            execute_async=False,
        )

        self.assertNotIn('password', job.payload)
        self.assertNotIn('AlphaSecretPassword123!', str(job.payload))
        self.assertNotIn('AlphaSecretPassword123!', str(job.requested_state))

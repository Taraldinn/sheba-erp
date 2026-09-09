"""
Phase 13: Tests for Network Action Queue & Bulk Operations.
Verifies action lifecycles (PENDING, PROCESSING, SUCCESS, FAILED, RETRYING, CANCELLED),
idempotency, retries, distributed locking, bulk validation/preview/queue/execute,
multi-tenant isolation, and RBAC enforcement.
"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.network.models import Router, NetworkAction, BulkNetworkBatch
from apps.network.services.action_queue import ActionQueueService, BulkOperationsService

User = get_user_model()


class ActionQueueAndBulkOperationsTests(TestCase):
    def setUp(self):
        # 1. Tenants
        self.tenant_a = Tenant.objects.create(name="ISP Alpha", slug="alpha", domain="alpha.sheba.net")
        self.tenant_b = Tenant.objects.create(name="ISP Beta", slug="beta", domain="beta.sheba.net")

        # 2. Users & Roles
        self.user_admin = User.objects.create_user(username="admin_ops", password="password123")
        self.user_viewer = User.objects.create_user(username="viewer_ops", password="password123")
        self.user_tenant_b = User.objects.create_user(username="beta_ops", password="password123")

        StaffProfile.objects.create(user=self.user_admin, tenant=self.tenant_a, role=UserRole.ADMIN)
        StaffProfile.objects.create(user=self.user_viewer, tenant=self.tenant_a, role=UserRole.BILLING_OPERATOR)
        StaffProfile.objects.create(user=self.user_tenant_b, tenant=self.tenant_b, role=UserRole.ADMIN)

        # 3. Router & Packages
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name="Core-CCR-Alpha",
            ip_address="10.10.10.1",
            api_port=443,
            username="admin",
            password="secret",
            status="Online",
        )
        self.pkg_10m = Package.objects.create(
            tenant=self.tenant_a,
            name="10Mbps Premium",
            mikrotik_profile="profile_10m",
            regular_price=800.00
        )
        self.pkg_20m = Package.objects.create(
            tenant=self.tenant_a,
            name="20Mbps Ultra",
            mikrotik_profile="profile_20m",
            regular_price=1200.00
        )

        # 4. Customers
        self.cust_1 = Customer.objects.create(
            tenant=self.tenant_a,
            full_name="Subscriber One",
            customer_code="CUST-001",
            pppoe_username="sub_001",
            pppoe_password="pass1",
            router=self.router_a,
            package=self.pkg_10m,
            status=CustomerStatus.ACTIVE,
            area_zone="Gulshan"
        )
        self.cust_2 = Customer.objects.create(
            tenant=self.tenant_a,
            full_name="Subscriber Two",
            customer_code="CUST-002",
            pppoe_username="sub_002",
            pppoe_password="pass2",
            router=self.router_a,
            package=self.pkg_10m,
            status=CustomerStatus.EXPIRED,
            area_zone="Gulshan"
        )
        self.cust_no_router = Customer.objects.create(
            tenant=self.tenant_a,
            full_name="No Router Sub",
            customer_code="CUST-003",
            pppoe_username="sub_003",
            router=None,
            status=CustomerStatus.ACTIVE,
        )
        self.cust_no_username = Customer.objects.create(
            tenant=self.tenant_a,
            full_name="No Username Sub",
            customer_code="CUST-004",
            pppoe_username="",
            router=self.router_a,
            status=CustomerStatus.ACTIVE,
        )

        self.client_admin = APIClient()
        self.client_admin.force_authenticate(user=self.user_admin)
        self.client_admin.defaults['HTTP_HOST'] = 'alpha.sheba.net'

        self.client_viewer = APIClient()
        self.client_viewer.force_authenticate(user=self.user_viewer)
        self.client_viewer.defaults['HTTP_HOST'] = 'alpha.sheba.net'

        self.client_beta = APIClient()
        self.client_beta.force_authenticate(user=self.user_tenant_b)
        self.client_beta.defaults['HTTP_HOST'] = 'beta.sheba.net'

    @patch('apps.network.services.action_queue.MikroTikService')
    def test_action_lifecycle_success(self, mock_mikrotik_cls):
        """Tests standard happy path: enqueue -> execute -> SUCCESS."""
        mock_svc = MagicMock()
        mock_mikrotik_cls.return_value = mock_svc

        job = ActionQueueService.enqueue_action(
            tenant=self.tenant_a,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.cust_1,
            actor="admin_ops",
            execute_async=False
        )
        self.assertEqual(job.status, NetworkAction.JobStatus.PENDING)
        self.assertEqual(job.target_name, "sub_001")

        result = ActionQueueService.execute_action(
            tenant_id=str(self.tenant_a.id),
            action_id=str(job.id)
        )
        self.assertTrue(result['success'])
        self.assertEqual(result['status'], 'SUCCESS')

        job.refresh_from_db()
        self.assertEqual(job.status, NetworkAction.JobStatus.SUCCESS)
        self.assertIsNotNone(job.completed_at)
        mock_svc.pppoe.enable_user_by_name.assert_called_once_with("sub_001")

    @patch('apps.network.services.action_queue.MikroTikService')
    def test_action_retry_on_failure(self, mock_mikrotik_cls):
        """Tests that transient failures mark RETRYING and increment retry_count before FAILED."""
        mock_svc = MagicMock()
        mock_svc.pppoe.disable_user_by_name.side_effect = ConnectionError("Router unreachable")
        mock_mikrotik_cls.return_value = mock_svc

        job = ActionQueueService.enqueue_action(
            tenant=self.tenant_a,
            action=NetworkAction.Action.DISABLE_SERVICE,
            customer=self.cust_1,
            execute_async=False
        )

        # Attempt 1 -> RETRYING
        res1 = ActionQueueService.execute_action(str(self.tenant_a.id), str(job.id))
        self.assertFalse(res1['success'])
        job.refresh_from_db()
        self.assertEqual(job.status, NetworkAction.JobStatus.RETRYING)
        self.assertEqual(job.retry_count, 1)

        # Attempt 2 -> RETRYING
        ActionQueueService.execute_action(str(self.tenant_a.id), str(job.id))
        job.refresh_from_db()
        self.assertEqual(job.status, NetworkAction.JobStatus.RETRYING)
        self.assertEqual(job.retry_count, 2)

        # Attempt 3 -> FAILED (max_retries reached)
        ActionQueueService.execute_action(str(self.tenant_a.id), str(job.id))
        job.refresh_from_db()
        self.assertEqual(job.status, NetworkAction.JobStatus.FAILED)
        self.assertEqual(job.retry_count, 3)
        self.assertIn("Router unreachable", job.error_message)

    def test_action_cancellation(self):
        """Tests that an operator can cancel a PENDING action."""
        job = ActionQueueService.enqueue_action(
            tenant=self.tenant_a,
            action=NetworkAction.Action.RECONNECT,
            customer=self.cust_1,
            execute_async=False
        )
        self.assertEqual(job.status, NetworkAction.JobStatus.PENDING)

        cancelled_job = ActionQueueService.cancel_action(
            action_id=str(job.id),
            tenant_id=str(self.tenant_a.id),
            actor="admin_ops"
        )
        self.assertIsNotNone(cancelled_job)
        self.assertEqual(cancelled_job.status, NetworkAction.JobStatus.CANCELLED)

        # Ensure execute_action honors cancelled status
        res = ActionQueueService.execute_action(str(self.tenant_a.id), str(job.id))
        self.assertEqual(res.get('status'), NetworkAction.JobStatus.CANCELLED)

    def test_idempotency_key_duplicate_prevention(self):
        """Tests that identical idempotency keys return existing action without duplication."""
        key = "unique-idempotency-key-12345"
        job1 = ActionQueueService.enqueue_action(
            tenant=self.tenant_a,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.cust_1,
            idempotency_key=key,
            execute_async=False
        )
        job2 = ActionQueueService.enqueue_action(
            tenant=self.tenant_a,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.cust_1,
            idempotency_key=key,
            execute_async=False
        )
        self.assertEqual(job1.id, job2.id)
        self.assertEqual(NetworkAction.objects.filter(idempotency_key=key).count(), 1)

    def test_bulk_preview_validation(self):
        """Tests bulk validation correctly partitions eligible vs skipped subscribers."""
        preview = BulkOperationsService.validate_and_preview(
            tenant=self.tenant_a,
            action_type=NetworkAction.Action.CHANGE_PACKAGE,
            filter_criteria={'router_id': str(self.router_a.id)},
            payload={'package_id': str(self.pkg_20m.id)}
        )

        # cust_1 and cust_2 are eligible on router_a
        # cust_no_username is on router_a but skipped due to missing username
        # cust_no_router is not on router_a
        self.assertEqual(preview['eligible_count'], 2)
        self.assertEqual(preview['skipped_count'], 1)
        self.assertEqual(preview['skipped_targets'][0]['reason'], 'Missing PPPoE username')

    @patch('apps.network.services.action_queue.MikroTikService')
    def test_bulk_execution_batch(self, mock_mikrotik_cls):
        """Tests full bulk queue -> execute workflow with results summary."""
        mock_svc = MagicMock()
        mock_mikrotik_cls.return_value = mock_svc

        batch = BulkOperationsService.queue_bulk_operation(
            tenant=self.tenant_a,
            action_type=NetworkAction.Action.DISABLE_SERVICE,
            filter_criteria={'router_id': str(self.router_a.id)},
            actor="admin_ops"
        )
        self.assertEqual(batch.status, BulkNetworkBatch.BatchStatus.QUEUED)
        self.assertEqual(batch.total_count, 2)
        self.assertEqual(batch.actions.count(), 2)

        # Execute the bulk batch
        results = BulkOperationsService.execute_bulk_batch(
            tenant_id=str(self.tenant_a.id),
            batch_id=str(batch.id)
        )
        self.assertTrue(results['success'])
        self.assertEqual(results['status'], BulkNetworkBatch.BatchStatus.COMPLETED)
        self.assertEqual(results['success_count'], 2)
        self.assertEqual(results['failure_count'], 0)

        batch.refresh_from_db()
        self.assertEqual(batch.status, BulkNetworkBatch.BatchStatus.COMPLETED)
        self.assertEqual(batch.success_count, 2)

    def test_tenant_isolation(self):
        """Verifies that Tenant Beta cannot see or modify actions of Tenant Alpha."""
        job_alpha = ActionQueueService.enqueue_action(
            tenant=self.tenant_a,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.cust_1,
            execute_async=False
        )

        # Tenant Beta trying to GET Tenant Alpha's action list
        resp = self.client_beta.get('/api/v1/network/actions/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Should contain 0 items for Beta
        results = resp.data if isinstance(resp.data, list) else resp.data.get('results', [])
        self.assertEqual(len(results), 0)

        # Tenant Beta trying to retry Tenant Alpha's action
        resp_retry = self.client_beta.post(f'/api/v1/network/actions/{job_alpha.id}/retry/')
        self.assertEqual(resp_retry.status_code, status.HTTP_404_NOT_FOUND)

    def test_rbac_permissions(self):
        """Verifies that operators without CanControlDevices cannot enqueue, retry, or confirm bulk actions."""
        job = ActionQueueService.enqueue_action(
            tenant=self.tenant_a,
            action=NetworkAction.Action.ENABLE_SERVICE,
            customer=self.cust_1,
            execute_async=False
        )

        # Viewer can view queue
        resp_view = self.client_viewer.get('/api/v1/network/actions/')
        self.assertEqual(resp_view.status_code, status.HTTP_200_OK)

        # Viewer cannot retry
        resp_retry = self.client_viewer.post(f'/api/v1/network/actions/{job.id}/retry/')
        self.assertEqual(resp_retry.status_code, status.HTTP_403_FORBIDDEN)

        # Viewer cannot trigger bulk confirm
        resp_bulk = self.client_viewer.post('/api/v1/network/bulk/confirm/', {
            'action_type': 'DISABLE_SERVICE',
            'filter_criteria': {'router_id': str(self.router_a.id)}
        }, format='json')
        self.assertEqual(resp_bulk.status_code, status.HTTP_403_FORBIDDEN)

    @patch('apps.network.services.action_queue.distributed_lock')
    def test_distributed_locking_action(self, mock_dist_lock):
        """Verifies distributed locking prevents dual concurrent execution."""
        from apps.core.lock import LockAcquisitionError
        mock_dist_lock.side_effect = LockAcquisitionError("Lock busy")

        job = ActionQueueService.enqueue_action(
            tenant=self.tenant_a,
            action=NetworkAction.Action.RECONNECT,
            customer=self.cust_1,
            execute_async=False
        )
        res = ActionQueueService.execute_action(str(self.tenant_a.id), str(job.id))
        self.assertFalse(res['success'])
        self.assertEqual(res['error'], 'LOCKED')

    def test_enqueue_api_action(self):
        """Tests that operators can enqueue a single action via POST /api/v1/network/actions/enqueue/."""
        resp = self.client_admin.post('/api/v1/network/actions/enqueue/', {
            'action': 'ENABLE_SERVICE',
            'customer_id': str(self.cust_1.id),
            'idempotency_key': 'api-test-key-99',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['status'], 'PENDING')
        self.assertEqual(resp.data['customer_name'], 'Subscriber One')

    def test_cancel_bulk_batch_api(self):
        """Tests cancelling a bulk batch via POST /api/v1/network/bulk/<id>/cancel/."""
        batch = BulkOperationsService.queue_bulk_operation(
            tenant=self.tenant_a,
            action_type=NetworkAction.Action.DISABLE_SERVICE,
            filter_criteria={'router_id': str(self.router_a.id)},
            actor="admin_ops"
        )
        self.assertEqual(batch.status, BulkNetworkBatch.BatchStatus.QUEUED)

        resp = self.client_admin.post(f'/api/v1/network/bulk/{batch.id}/cancel/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['status'], 'CANCELLED')
        batch.refresh_from_db()
        self.assertEqual(batch.status, BulkNetworkBatch.BatchStatus.CANCELLED)

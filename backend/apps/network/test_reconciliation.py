"""
Tests for Phase 12 — MikroTik Reconciliation + PPPoE Operations.
Tests:
- Matched secrets
- Missing secrets in router
- Unknown / orphan secrets
- Profile mismatch detection
- Status mismatch detection
- Router mismatch detection
- Safe sync actions
- Tenant isolation
- Permission denial (RBAC)
- Failed router handling
- Retries
- Concurrent reconciliation locking
"""
from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus, ConnectionType
from apps.billing.models import Package
from apps.network.models import (
    Router,
    PPPoESecretItem,
    ReconciliationRun,
    ReconciliationStatus,
    NetworkSyncJob,
)
from apps.network.services.reconciliation import ReconciliationService


class ReconciliationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenants
        self.tenant_a = Tenant.objects.create(name='Tenant Alpha', slug='alpha')
        self.tenant_b = Tenant.objects.create(name='Tenant Beta', slug='beta')

        # Admin user for Tenant A
        self.admin_user = User.objects.create_user(username='admin_a', password='password123')
        self.admin_profile = StaffProfile.objects.create(
            tenant=self.tenant_a,
            user=self.admin_user,
            role=UserRole.ADMIN,
            phone='01700000001'
        )

        # Billing Operator (Read metrics only, cannot control devices)
        self.billing_user = User.objects.create_user(username='billing_a', password='password123')
        self.billing_profile = StaffProfile.objects.create(
            tenant=self.tenant_a,
            user=self.billing_user,
            role=UserRole.BILLING_OPERATOR,
            phone='01700000002'
        )

        # Tenant B Admin
        self.tenant_b_user = User.objects.create_user(username='admin_b', password='password123')
        self.tenant_b_profile = StaffProfile.objects.create(
            tenant=self.tenant_b,
            user=self.tenant_b_user,
            role=UserRole.ADMIN,
            phone='01700000003'
        )

        self.client.defaults['HTTP_HOST'] = 'alpha.shebafi.com'
        self.client.force_authenticate(user=self.admin_user)

        # Routers for Tenant A
        self.router_1 = Router.objects.create(
            tenant=self.tenant_a,
            name='Core-CCR-East',
            ip_address='10.10.1.1',
            status='Online',
        )
        self.router_2 = Router.objects.create(
            tenant=self.tenant_a,
            name='Core-CCR-West',
            ip_address='10.10.1.2',
            status='Online',
        )

        # Router for Tenant B
        self.router_b = Router.objects.create(
            tenant=self.tenant_b,
            name='Beta-CCR',
            ip_address='10.20.1.1',
            status='Online',
        )

        # Packages
        self.pkg_20m = Package.objects.create(
            tenant=self.tenant_a,
            name='20 Mbps Unlimited',
            speed_mbps=20,
            regular_price=Decimal('1000.00'),
            mikrotik_profile='prof_20m',
        )
        self.pkg_50m = Package.objects.create(
            tenant=self.tenant_a,
            name='50 Mbps Unlimited',
            speed_mbps=50,
            regular_price=Decimal('2000.00'),
            mikrotik_profile='prof_50m',
        )

    def test_matched_secret(self):
        """Customer in ERP perfectly matches MikroTik secret."""
        cust = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-101',
            full_name='Alice Perfect',
            pppoe_username='alice_perfect',
            pppoe_password='secret_password_123',
            router=self.router_1,
            package=self.pkg_20m,
            status=CustomerStatus.ACTIVE,
        )

        mock_secrets = [
            {
                '.id': '*1',
                'name': 'alice_perfect',
                'profile': 'prof_20m',
                'disabled': 'false',
                'service': 'pppoe',
                'comment': 'Customer 101',
            }
        ]

        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.list_secrets', return_value=mock_secrets):
            run = ReconciliationService.reconcile_router(self.router_1, actor_username='admin_a')

        self.assertEqual(run.status, ReconciliationRun.RunStatus.COMPLETED)
        self.assertEqual(run.matched_count, 1)
        self.assertEqual(run.missing_in_router_count, 0)
        self.assertEqual(run.unknown_in_erp_count, 0)

        item = PPPoESecretItem.objects.get(tenant=self.tenant_a, router=self.router_1, username='alice_perfect')
        self.assertEqual(item.reconciliation_status, ReconciliationStatus.MATCHED)
        self.assertEqual(item.router_profile, 'prof_20m')
        self.assertFalse(item.router_disabled)

    def test_missing_secret(self):
        """Customer in ERP has no secret on the assigned router (MISSING_IN_ROUTER)."""
        Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-102',
            full_name='Bob Missing',
            pppoe_username='bob_missing',
            pppoe_password='secret_password_123',
            router=self.router_1,
            package=self.pkg_20m,
            status=CustomerStatus.ACTIVE,
        )

        # Router has 0 secrets
        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.list_secrets', return_value=[]):
            run = ReconciliationService.reconcile_router(self.router_1, actor_username='admin_a')

        self.assertEqual(run.status, ReconciliationRun.RunStatus.COMPLETED)
        self.assertEqual(run.matched_count, 0)
        self.assertEqual(run.missing_in_router_count, 1)

        item = PPPoESecretItem.objects.get(tenant=self.tenant_a, router=self.router_1, username='bob_missing')
        self.assertEqual(item.reconciliation_status, ReconciliationStatus.MISSING_IN_ROUTER)
        self.assertEqual(item.expected_profile, 'prof_20m')

    def test_orphan_secret(self):
        """Secret on router has no matching customer in ERP (UNKNOWN_IN_ERP)."""
        mock_secrets = [
            {
                '.id': '*99',
                'name': 'ghost_subscriber',
                'profile': 'default',
                'disabled': 'false',
                'service': 'pppoe',
                'comment': 'Old manual secret',
            }
        ]

        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.list_secrets', return_value=mock_secrets):
            run = ReconciliationService.reconcile_router(self.router_1, actor_username='admin_a')

        self.assertEqual(run.status, ReconciliationRun.RunStatus.COMPLETED)
        self.assertEqual(run.unknown_in_erp_count, 1)

        item = PPPoESecretItem.objects.get(tenant=self.tenant_a, router=self.router_1, username='ghost_subscriber')
        self.assertEqual(item.reconciliation_status, ReconciliationStatus.UNKNOWN_IN_ERP)
        self.assertIsNone(item.customer)

    def test_profile_mismatch(self):
        """Secret exists on router, but its profile does not match ERP package (PROFILE_MISMATCH)."""
        Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-103',
            full_name='Charlie Upgrade',
            pppoe_username='charlie_up',
            pppoe_password='secret_password_123',
            router=self.router_1,
            package=self.pkg_50m,  # Expects prof_50m
            status=CustomerStatus.ACTIVE,
        )

        mock_secrets = [
            {
                '.id': '*3',
                'name': 'charlie_up',
                'profile': 'prof_20m',  # Old 20m profile!
                'disabled': 'false',
                'service': 'pppoe',
            }
        ]

        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.list_secrets', return_value=mock_secrets):
            run = ReconciliationService.reconcile_router(self.router_1, actor_username='admin_a')

        self.assertEqual(run.status, ReconciliationRun.RunStatus.COMPLETED)
        self.assertEqual(run.profile_mismatch_count, 1)

        item = PPPoESecretItem.objects.get(tenant=self.tenant_a, router=self.router_1, username='charlie_up')
        self.assertEqual(item.reconciliation_status, ReconciliationStatus.PROFILE_MISMATCH)
        self.assertEqual(item.router_profile, 'prof_20m')
        self.assertEqual(item.expected_profile, 'prof_50m')

    def test_status_mismatch(self):
        """Customer is EXPIRED in ERP but secret is still active/enabled on router (STATUS_MISMATCH)."""
        Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-104',
            full_name='Dave Expired',
            pppoe_username='dave_exp',
            pppoe_password='secret_password_123',
            router=self.router_1,
            package=self.pkg_20m,
            status=CustomerStatus.EXPIRED,  # Expects disabled=True
        )

        mock_secrets = [
            {
                '.id': '*4',
                'name': 'dave_exp',
                'profile': 'prof_20m',
                'disabled': 'false',  # Still enabled on router!
                'service': 'pppoe',
            }
        ]

        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.list_secrets', return_value=mock_secrets):
            run = ReconciliationService.reconcile_router(self.router_1, actor_username='admin_a')

        self.assertEqual(run.status, ReconciliationRun.RunStatus.COMPLETED)
        self.assertEqual(run.status_mismatch_count, 1)

        item = PPPoESecretItem.objects.get(tenant=self.tenant_a, router=self.router_1, username='dave_exp')
        self.assertEqual(item.reconciliation_status, ReconciliationStatus.STATUS_MISMATCH)
        self.assertFalse(item.router_disabled)
        self.assertTrue(item.expected_disabled)

    def test_router_mismatch(self):
        """Customer in ERP is assigned to Router 2, but secret was found on Router 1 (ROUTER_MISMATCH)."""
        cust = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-105',
            full_name='Eve West',
            pppoe_username='eve_west',
            pppoe_password='secret_password_123',
            router=self.router_2,  # Assigned to Router 2 in ERP
            package=self.pkg_20m,
            status=CustomerStatus.ACTIVE,
        )

        # Secret is sitting on Router 1
        mock_secrets_r1 = [
            {
                '.id': '*5',
                'name': 'eve_west',
                'profile': 'prof_20m',
                'disabled': 'false',
                'service': 'pppoe',
            }
        ]

        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.list_secrets', return_value=mock_secrets_r1):
            run = ReconciliationService.reconcile_router(self.router_1, actor_username='admin_a')

        self.assertEqual(run.status, ReconciliationRun.RunStatus.COMPLETED)
        self.assertEqual(run.router_mismatch_count, 1)

        item = PPPoESecretItem.objects.get(tenant=self.tenant_a, router=self.router_1, username='eve_west')
        self.assertEqual(item.reconciliation_status, ReconciliationStatus.ROUTER_MISMATCH)
        self.assertEqual(item.customer, cust)

    def test_safe_sync_actions(self):
        """Validates safe synchronization actions: PUSH_TO_ROUTER and SYNC_PROFILE."""
        cust = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-106',
            full_name='Frank Sync',
            pppoe_username='frank_sync',
            pppoe_password='mypassword',
            router=self.router_1,
            package=self.pkg_20m,
            status=CustomerStatus.ACTIVE,
        )

        item = PPPoESecretItem.objects.create(
            tenant=self.tenant_a,
            router=self.router_1,
            customer=cust,
            package=self.pkg_20m,
            username='frank_sync',
            reconciliation_status=ReconciliationStatus.MISSING_IN_ROUTER,
            expected_profile='prof_20m',
            expected_disabled=False,
        )

        # 1. Safe sync: PUSH_TO_ROUTER
        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.create_user', return_value=True) as mock_create:
            url = f'/api/v1/network/reconciliation/items/{item.id}/sync/'
            res = self.client.post(url, {'action': 'PUSH_TO_ROUTER'}, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertTrue(res.data['success'])

            mock_create.assert_called_once()
            item.refresh_from_db()
            self.assertEqual(item.reconciliation_status, ReconciliationStatus.MATCHED)
            self.assertEqual(item.router_profile, 'prof_20m')

        # 2. Safe sync: SYNC_PROFILE
        item.reconciliation_status = ReconciliationStatus.PROFILE_MISMATCH
        item.router_profile = 'prof_10m'
        item.expected_profile = 'prof_50m'
        item.save()

        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.update_user_by_name', return_value=True) as mock_up:
            url = f'/api/v1/network/reconciliation/items/{item.id}/sync/'
            res = self.client.post(url, {'action': 'SYNC_PROFILE'}, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertTrue(res.data['success'])

            item.refresh_from_db()
            self.assertEqual(item.router_profile, 'prof_50m')

    def test_tenant_isolation(self):
        """Tenant B cannot trigger reconciliation or access Tenant A's router secrets."""
        # Tenant A has an item
        item_a = PPPoESecretItem.objects.create(
            tenant=self.tenant_a,
            router=self.router_1,
            username='secret_alpha',
            reconciliation_status=ReconciliationStatus.MATCHED,
        )

        # Switch to Tenant B
        self.client.defaults['HTTP_HOST'] = 'beta.shebafi.com'
        self.client.force_authenticate(user=self.tenant_b_user)

        # Tenant B lists secrets -> should NOT see Tenant A's secret
        res_list = self.client.get('/api/v1/network/reconciliation/secrets/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        usernames = [x['username'] for x in res_list.data.get('results', res_list.data)]
        self.assertNotIn('secret_alpha', usernames)

        # Tenant B attempts to trigger reconciliation on Tenant A's router -> 404
        res_trigger = self.client.post('/api/v1/network/reconciliation/trigger/', {
            'router_id': str(self.router_1.id)
        }, format='json')
        self.assertEqual(res_trigger.status_code, status.HTTP_404_NOT_FOUND)

        # Tenant B attempts safe sync on Tenant A's item -> 404
        res_sync = self.client.post(f'/api/v1/network/reconciliation/items/{item_a.id}/sync/', {
            'action': 'PUSH_TO_ROUTER'
        }, format='json')
        self.assertEqual(res_sync.status_code, status.HTTP_404_NOT_FOUND)

    def test_permission_denial(self):
        """Users without CanControlDevices permission (e.g. Billing Operator) are denied."""
        self.client.force_authenticate(user=self.billing_user)

        # Can view inventory
        res_view = self.client.get('/api/v1/network/reconciliation/secrets/')
        self.assertEqual(res_view.status_code, status.HTTP_200_OK)

        # Denied on triggering reconciliation
        res_trig = self.client.post('/api/v1/network/reconciliation/trigger/', {
            'router_id': str(self.router_1.id)
        }, format='json')
        self.assertEqual(res_trig.status_code, status.HTTP_403_FORBIDDEN)

    def test_failed_router_error(self):
        """Connection timeout or failure on router results in ERROR status and run FAILED."""
        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.list_secrets', side_effect=Exception("Connection timed out after 10s")):
            run = ReconciliationService.reconcile_router(self.router_1, actor_username='admin_a')

        self.assertEqual(run.status, ReconciliationRun.RunStatus.FAILED)
        self.assertIn("Connection timed out", run.error_message)

    def test_concurrent_reconciliation(self):
        """Distributed lock prevents concurrent reconciliation runs on the same router."""
        with patch('apps.network.services.reconciliation.distributed_lock') as mock_lock:
            from apps.core.lock import LockAcquisitionError
            mock_lock.side_effect = LockAcquisitionError("Lock active")

            run = ReconciliationService.reconcile_router(self.router_1, actor_username='admin_a')
            self.assertEqual(run.status, ReconciliationRun.RunStatus.FAILED)
            self.assertIn("already in progress", run.error_message)


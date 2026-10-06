import json
from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus, CustomerService, CustomerSubscription, BillingCycle
from apps.billing.models import Package
from apps.network.models import (
    Router,
    NetworkProfile,
    NetworkProfileStatus,
    PPPoESecretItem,
    PPPoEAccount,
    PPPoEStatus,
    ProvisioningStatus,
    ReconciliationRun,
    ReconciliationStatus,
)
from apps.network.services.provisioning import ProvisioningService


class Phase4NetworkProvisioningTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenants
        self.tenant_a = Tenant.objects.create(name='Tenant Alpha', slug='alpha')
        self.tenant_b = Tenant.objects.create(name='Tenant Beta', slug='beta')

        # Staff users
        self.admin_a = User.objects.create_user(username='admin_a', password='password123')
        self.admin_profile_a = StaffProfile.objects.create(
            tenant=self.tenant_a,
            user=self.admin_a,
            role=UserRole.ADMIN,
            phone='01700000001'
        )

        self.admin_b = User.objects.create_user(username='admin_b', password='password123')
        self.admin_profile_b = StaffProfile.objects.create(
            tenant=self.tenant_b,
            user=self.admin_b,
            role=UserRole.ADMIN,
            phone='01700000002'
        )

        # Routers
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name='Core-Router-Alpha',
            ip_address='192.168.88.1',
            api_port=8728,
            username='admin',
            password='secret_password_123',
            api_protocol='API',
            is_active=True
        )

        self.router_b = Router.objects.create(
            tenant=self.tenant_b,
            name='Core-Router-Beta',
            ip_address='10.0.0.1',
            api_port=8728,
            username='admin',
            password='secret_password_456',
            api_protocol='API',
            is_active=True
        )

        # Network Profiles
        self.profile_20m = NetworkProfile.objects.create(
            tenant=self.tenant_a,
            name='20M_Fiber_Plan',
            mikrotik_profile='20M',
            download_rate_mbps=20,
            upload_rate_mbps=20,
            status=NetworkProfileStatus.ACTIVE
        )

        # Packages
        self.package_20m = Package.objects.create(
            tenant=self.tenant_a,
            name='Fiber 20 Mbps',
            speed_mbps=20,
            regular_price=Decimal('1000.00'),
            mikrotik_profile='20M'
        )

        # Customer & Service
        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-001',
            full_name='John Subscriber',
            mobile='01711111111',
            status=CustomerStatus.ACTIVE
        )

        self.service_a = CustomerService.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            package=self.package_20m,
            router=self.router_a,
            service_identifier='john_pppoe',
            status='ACTIVE',
            provisioning_status=ProvisioningStatus.NOT_PROVISIONED
        )

    def test_router_write_only_password(self):
        """Verify that router password is never returned in API GET responses."""
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(f'/api/v1/network/routers/{self.router_a.id}/', HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('password', response.data)
        # Verify raw password is not in string representation of returned dict
        self.assertNotIn('secret_password_123', str(response.data))

    @patch('apps.network.services.mikrotik.MikroTikService.test_connection')
    def test_router_connection_test(self, mock_test):
        """Verify test_connection action works without leaking passwords."""
        mock_test.return_value = (True, "Connection successful to RouterOS 7.15", {"version": "7.15", "cpu_load": 4})
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.post(f'/api/v1/network/routers/{self.router_a.id}/test-connection/', HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertIn("Connection successful", response.data['message'])
        self.assertNotIn('password', response.data)

    def test_router_enable_disable(self):
        """Test enabling and disabling routers."""
        self.client.force_authenticate(user=self.admin_a)
        res_dis = self.client.post(f'/api/v1/network/routers/{self.router_a.id}/disable/', HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(res_dis.status_code, status.HTTP_200_OK)
        self.router_a.refresh_from_db()
        self.assertFalse(self.router_a.is_active)

        res_en = self.client.post(f'/api/v1/network/routers/{self.router_a.id}/enable/', HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(res_en.status_code, status.HTTP_200_OK)
        self.router_a.refresh_from_db()
        self.assertTrue(self.router_a.is_active)

    def test_tenant_isolation_router(self):
        """Tenant B admin cannot access Tenant A router."""
        self.client.force_authenticate(user=self.admin_b)
        response = self.client.get(f'/api/v1/network/routers/{self.router_a.id}/', HTTP_X_TENANT_ID=str(self.tenant_b.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_network_profile_crud(self):
        """Test NetworkProfile creation and tenant scoping."""
        self.client.force_authenticate(user=self.admin_a)
        payload = {
            'name': '50M_Premium',
            'mikrotik_profile': '50M',
            'download_rate_mbps': 50,
            'upload_rate_mbps': 50,
            'priority': 8,
        }
        res = self.client.post('/api/v1/network/profiles/', payload, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['download_rate_mbps'], 50)
        self.assertEqual(res.data['mikrotik_profile'], '50M')

        # Tenant B cannot see it
        self.client.force_authenticate(user=self.admin_b)
        res_b = self.client.get(f"/api/v1/network/profiles/{res.data['id']}/", HTTP_X_TENANT_ID=str(self.tenant_b.id))
        self.assertEqual(res_b.status_code, status.HTTP_404_NOT_FOUND)

    @patch('apps.network.services.mikrotik.pppoe.MikroTikPPPoEService.find_secret_by_name')
    @patch('apps.network.services.mikrotik.MikroTikService.create_pppoe_user')
    @patch('apps.network.services.mikrotik.MikroTikService.update_pppoe_user')
    @patch('apps.network.services.mikrotik.MikroTikService.delete_pppoe_user')
    def test_provisioning_service_lifecycle_success(self, mock_delete, mock_update, mock_create, mock_find):
        """Verify ProvisioningService provision, suspend, resume, and terminate."""
        mock_find.return_value = None
        mock_create.return_value = True
        mock_update.return_value = True
        mock_delete.return_value = True

        # 1. Provision
        res = ProvisioningService.provision_service(self.service_a)
        self.assertTrue(res['success'])
        self.service_a.refresh_from_db()
        self.assertEqual(self.service_a.provisioning_status, ProvisioningStatus.PROVISIONED)

        account = self.service_a.pppoe_account
        self.assertIsNotNone(account)
        self.assertEqual(account.username, 'john_pppoe')
        self.assertEqual(account.status, PPPoEStatus.ACTIVE)
        self.assertEqual(account.provisioning_status, ProvisioningStatus.PROVISIONED)

        # 2. Suspend
        sus_ok = ProvisioningService.suspend_service(self.service_a)
        self.assertTrue(sus_ok['success'])
        self.service_a.refresh_from_db()
        account.refresh_from_db()
        self.assertEqual(account.status, PPPoEStatus.SUSPENDED)
        self.assertEqual(account.provisioning_status, ProvisioningStatus.PROVISIONED)

        # 3. Resume
        res_ok = ProvisioningService.resume_service(self.service_a)
        self.assertTrue(res_ok['success'])
        account.refresh_from_db()
        self.assertEqual(account.status, PPPoEStatus.ACTIVE)

        # 4. Terminate
        term_ok = ProvisioningService.terminate_service(self.service_a)
        self.assertTrue(term_ok['success'])
        account.refresh_from_db()
        self.assertEqual(account.status, PPPoEStatus.TERMINATED)
        self.assertEqual(account.provisioning_status, ProvisioningStatus.DEPROVISIONED)

    @patch('apps.network.services.mikrotik.pppoe.MikroTikPPPoEService.find_secret_by_name')
    def test_provisioning_failure_preserves_business_status(self, mock_find):
        """Verify that a network failure marks provisioning FAILED without mutating business status."""
        mock_find.side_effect = Exception("MikroTik socket timeout")

        res = ProvisioningService.provision_service(self.service_a)
        self.assertFalse(res['success'])
        self.service_a.refresh_from_db()

        # Business status remains ACTIVE
        self.assertEqual(self.service_a.status, 'ACTIVE')
        # Technical provisioning status is FAILED
        self.assertEqual(self.service_a.provisioning_status, ProvisioningStatus.FAILED)
        account = self.service_a.pppoe_account
        self.assertEqual(account.provisioning_status, ProvisioningStatus.FAILED)
        self.assertIn("MikroTik socket timeout", account.last_error)

    def test_pppoe_account_api_no_password_leak(self):
        """Verify PPPoE Account serializer hides password on retrieve and list."""
        account = ProvisioningService.get_or_create_pppoe_account(self.service_a)
        self.client.force_authenticate(user=self.admin_a)

        res = self.client.get(f'/api/v1/network/pppoe/{account.id}/', HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('password', res.data)
        self.assertEqual(res.data['username'], 'john_pppoe')
        self.assertEqual(res.data['customer_name'], 'John Subscriber')

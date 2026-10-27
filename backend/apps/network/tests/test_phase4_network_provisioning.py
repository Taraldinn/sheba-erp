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
        # Bugfix: the service must be provisioned with an explicit password
        # — the previous implementation used a hardcoded ``'123456'`` fallback
        # when neither ``password`` nor the customer's ``pppoe_password`` was
        # set, which silently shipped a known default to MikroTik. The
        # provisioning service now refuses that case, so the test must pass a
        # real password explicitly.
        res = ProvisioningService.provision_service(self.service_a, password='secur3-p@ssw0rd')
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

        # Bugfix: the provisioning service now requires an explicit password
        # to push a PPPoE secret to MikroTik. Pass one so this test can
        # still exercise the "router call fails" path.
        res = ProvisioningService.provision_service(self.service_a, password='secur3-p@ssw0rd')
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

class ProvisioningServicePasswordTests(TestCase):
    """Bugfix regression: PPPoE provisioning must NEVER silently write a
    hardcoded default password like ``'123456'`` to MikroTik. If neither the
    caller-supplied password nor the customer's ``pppoe_password`` is set,
    provisioning must refuse with an explicit error so the operator is
    forced to set a real credential.
    """
    def setUp(self) -> None:
        from apps.core.models import Tenant
        from apps.authentication.models import StaffProfile, UserRole
        from django.contrib.auth.models import User
        from apps.network.models import Router
        from apps.customers.models import Customer, ServiceType, CustomerService

        self.tenant = Tenant.objects.create(name='Tenant Pwd', slug='pwdtest', domain='pwdtest.local')
        self.staff = User.objects.create_user(username='staff_pwd', password='opensesame')
        StaffProfile.objects.create(user=self.staff, tenant=self.tenant, role=UserRole.ADMIN)

        self.router = Router.objects.create(
            tenant=self.tenant, name='R-PWD', ip_address='10.0.0.1', api_protocol='REST', https_port=443, status='Online',
        )
        # Customer with NO pppoe_password set.
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code='C-PWD-1',
            full_name='Pwd Tester',
            mobile='+8801700000099',
            pppoe_username='pwd_user_1',
            pppoe_password='',  # intentionally empty
            connection_type='PPPoE',
            router=self.router,
        )
        self.service = CustomerService.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            service_identifier='pwd_user_1',
            service_type=ServiceType.BROADBAND,
            status='ACTIVE',
        )

    def test_provisioning_refuses_when_no_password_set(self):
        """Without an explicit password and an empty ``pppoe_password`` on
        the customer, ``ProvisioningService.provision_service`` must refuse
        rather than silently write ``'123456'`` to MikroTik.
        """
        from unittest.mock import patch
        from apps.network.services.provisioning import ProvisioningService

        with patch('apps.network.services.mikrotik.MikroTikService.create_pppoe_user') as mock_create:
            res = ProvisioningService.provision_service(self.service)

        self.assertFalse(res.get('success'))
        # MikroTik must NEVER have been contacted.
        mock_create.assert_not_called()
        # The error message must explicitly call out the missing password.
        self.assertIn('password', (res.get('error') or '').lower())

    def test_provisioning_succeeds_when_password_explicit(self):
        """When the operator passes an explicit ``password`` argument the
        provisioning must go through normally.
        """
        from unittest.mock import patch
        from apps.network.services.provisioning import ProvisioningService

        with patch('apps.network.services.mikrotik.MikroTikService.create_pppoe_user') as mock_create, \
             patch('apps.network.services.mikrotik.MikroTikPPPoEService.find_secret_by_name') as mock_find:
            mock_create.return_value = True
            mock_find.return_value = None
            res = ProvisioningService.provision_service(self.service, password='explic!t-pass-1')

        self.assertTrue(res.get('success'))
        mock_create.assert_called_once()
        # And the persisted password on the PPPoE row is the one we gave.
        from apps.network.models import PPPoESecretItem
        pppoe = PPPoESecretItem.objects.get(service=self.service)
        self.assertEqual(pppoe.password, 'explic!t-pass-1')

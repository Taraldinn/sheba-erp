from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, CompanySetting, Notification
from apps.authentication.models import Role, Permission, StaffMembership, UserRole


class FullStackPhase2ApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create Tenant A
        self.tenant_a = Tenant.objects.create(
            name='Alpha ISP Broadband',
            slug='alpha-isp',
            domain='alpha.example.com',
            subscription_status='active',
            is_active=True,
            plan='Growth',
        )
        self.setting_a = CompanySetting.objects.create(
            tenant=self.tenant_a,
            company_name='Alpha ISP Broadband',
            theme_mode='dark',
            accent_color='indigo',
            support_phone='+8801700000001',
            support_email='support@alpha.isp',
            logo_url='https://alpha.example.com/logo.png',
            favicon_url='https://alpha.example.com/favicon.ico',
        )

        # Create Tenant B
        self.tenant_b = Tenant.objects.create(
            name='Beta Networks',
            slug='beta-net',
            domain='beta.example.com',
            subscription_status='active',
            is_active=True,
            plan='Enterprise',
        )
        self.setting_b = CompanySetting.objects.create(
            tenant=self.tenant_b,
            company_name='Beta Networks',
            theme_mode='light',
            accent_color='emerald',
            support_phone='+8801700000002',
            support_email='support@beta.net',
        )

        # Super Admin user (Control Plane)
        self.super_admin = User.objects.create_superuser(
            username='platform_admin',
            email='admin@shebafi.xyz',
            password='supersecretpass',
        )

        # Tenant A staff member
        self.user_a = User.objects.create_user(
            username='staff_alpha',
            email='staff@alpha.isp',
            password='staffpassword123',
        )
        self.perm_cust_read = Permission.objects.create(
            codename='customer.read',
            name='Read Customers',
            module='customers',
        )
        self.role_admin_a = Role.objects.create(
            tenant=self.tenant_a,
            name='Admin',
        )
        self.role_admin_a.permissions.add(self.perm_cust_read)

        self.membership_a = StaffMembership.objects.create(
            user=self.user_a,
            tenant=self.tenant_a,
            role=self.role_admin_a,
            scope=StaffMembership.Scope.GLOBAL,
            is_active=True,
        )

        # Tenant B staff member
        self.user_b = User.objects.create_user(
            username='staff_beta',
            email='staff@beta.net',
            password='staffpassword123',
        )
        self.membership_b = StaffMembership.objects.create(
            user=self.user_b,
            tenant=self.tenant_b,
            scope=StaffMembership.Scope.TENANT,
            is_active=True,
        )

    # ── Phase 4: Tenant Resolution API ──────────────────────────────────────────

    def test_tenant_resolve_by_slug(self):
        url = f'/api/v1/tenants/resolve/{self.tenant_a.slug}/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['slug'], 'alpha-isp')
        self.assertEqual(data['name'], 'Alpha ISP Broadband')
        self.assertEqual(data['status'], 'active')
        self.assertEqual(data['is_active'], True)
        self.assertEqual(data['logo'], 'https://alpha.example.com/logo.png')
        self.assertEqual(data['branding']['theme_mode'], 'dark')
        self.assertEqual(data['branding']['accent_color'], 'indigo')
        self.assertIn('customers', data['enabled_modules'])
        self.assertIn('billing', data['enabled_modules'])

    def test_tenant_resolve_by_query_param(self):
        url = f'/api/v1/tenants/resolve/?slug={self.tenant_b.slug}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['slug'], 'beta-net')
        self.assertEqual(data['branding']['accent_color'], 'emerald')

    def test_tenant_resolve_not_found(self):
        url = '/api/v1/tenants/resolve/non-existent-isp/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json()['code'], 'TENANT_NOT_FOUND')

    # ── Phase 6: Current User & Context API ─────────────────────────────────────

    def test_current_user_super_admin_context(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get('/api/v1/auth/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['username'], 'platform_admin')
        self.assertEqual(data['role'], 'SUPER_ADMIN')
        self.assertIn('SUPER_ADMIN', data['portal_access'])
        self.assertIn('*', data['permissions'])
        self.assertEqual(data['organization']['id'], 'platform')

    def test_current_user_tenant_staff_context(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/v1/auth/me/', HTTP_X_TENANT_ID='alpha-isp')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['username'], 'staff_alpha')
        self.assertEqual(data['role'], 'Admin')
        self.assertIn('customer.read', data['permissions'])
        self.assertIn('ISP_ADMIN', data['portal_access'])
        self.assertEqual(data['tenant']['slug'], 'alpha-isp')
        self.assertTrue(data['capabilities']['customers'])

    # ── Phase 13: Notification API & Isolation ─────────────────────────────────

    def test_notifications_crud_and_tenant_isolation(self):
        # Create notification for Tenant A
        notif_a = Notification.objects.create(
            tenant=self.tenant_a,
            user=self.user_a,
            title='MikroTik Core Alert',
            message='Router Core-1 high CPU load',
            category='network',
            priority=Notification.Priority.HIGH,
        )

        # Create notification for Tenant B
        notif_b = Notification.objects.create(
            tenant=self.tenant_b,
            user=self.user_b,
            title='Invoice Past Due',
            message='Customer B overdue notice',
            category='billing',
            priority=Notification.Priority.NORMAL,
        )

        # Tenant A user logs in and queries notifications
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/v1/notifications/', HTTP_X_TENANT_ID='alpha-isp')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.json().get('results', response.json())
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(notif_a.id))

        # Check unread count
        count_resp = self.client.get('/api/v1/notifications/unread-count/', HTTP_X_TENANT_ID='alpha-isp')
        self.assertEqual(count_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(count_resp.json()['unread_count'], 1)

        # Mark as read
        read_resp = self.client.post(f'/api/v1/notifications/{notif_a.id}/mark-as-read/', HTTP_X_TENANT_ID='alpha-isp')
        self.assertEqual(read_resp.status_code, status.HTTP_200_OK)
        notif_a.refresh_from_db()
        self.assertTrue(notif_a.is_read)

        # Unread count should now be 0
        count_resp2 = self.client.get('/api/v1/notifications/unread-count/', HTTP_X_TENANT_ID='alpha-isp')
        self.assertEqual(count_resp2.json()['unread_count'], 0)

        # Security check: Tenant A MUST NOT access or see Tenant B notification
        leak_resp = self.client.get(f'/api/v1/notifications/{notif_b.id}/', HTTP_X_TENANT_ID='alpha-isp')
        self.assertEqual(leak_resp.status_code, status.HTTP_404_NOT_FOUND)

    # ── Phase 14: Global Search API ─────────────────────────────────────────────

    def test_global_search_tenant_isolation(self):
        # Authenticate Tenant A staff
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/v1/search/?q=alpha', HTTP_X_TENANT_ID='alpha-isp')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('results', data)

        # Authenticate Super Admin on control plane
        self.client.force_authenticate(user=self.super_admin)
        sa_response = self.client.get('/api/v1/search/?q=alpha')
        self.assertEqual(sa_response.status_code, status.HTTP_200_OK)
        sa_data = sa_response.json()
        self.assertTrue(any(r['type'] == 'tenant' and 'Alpha' in r['title'] for r in sa_data['results']))

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
from django.core import mail

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import StaffProfile, StaffMembership, Role, Permission, UserRole
from apps.authentication.services.rbac import seed_default_roles_for_tenant, ensure_permission_catalog


class IspTenantAccountsAndRolesTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Seed global permissions
        ensure_permission_catalog()

        # Tenant A (Alpha ISP)
        self.tenant_a = Tenant.objects.create(
            name='Alpha Net',
            slug='alpha',
            domain='alpha.shebafi.xyz',
            contact_email='admin@alpha.net',
            is_active=True
        )
        self.domain_a = TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname='alpha.shebafi.xyz',
            is_active=True,
            is_primary=True
        )

        # Tenant B (Beta Net)
        self.tenant_b = Tenant.objects.create(
            name='Beta Net',
            slug='beta',
            domain='beta.shebafi.xyz',
            contact_email='admin@beta.net',
            is_active=True
        )
        self.domain_b = TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname='beta.shebafi.xyz',
            is_active=True,
            is_primary=True
        )

        # Seed default roles for tenants
        seed_default_roles_for_tenant(self.tenant_a)
        seed_default_roles_for_tenant(self.tenant_b)

        self.role_admin_a = Role.objects.get(tenant=self.tenant_a, name='Admin')
        self.role_admin_b = Role.objects.get(tenant=self.tenant_b, name='Admin')

        # ISP Admin User for Tenant A
        self.isp_user = User.objects.create_user(
            username='isp_owner',
            password='password123',
            email='owner@alpha.net',
            first_name='Alpha',
            last_name='Owner'
        )
        self.token_isp = Token.objects.create(user=self.isp_user)
        StaffMembership.objects.create(
            user=self.isp_user,
            tenant=self.tenant_a,
            role=self.role_admin_a,
            is_active=True
        )
        StaffProfile.objects.create(
            user=self.isp_user,
            tenant=self.tenant_a,
            role=UserRole.ADMIN,
            is_active=True
        )

        # Tenant admin account provisioned for tenant A
        self.tenant_admin_user = User.objects.create_user(
            username='alpha_admin',
            password='sheba1234',
            email='admin@alpha.net',
            first_name='Alpha',
            last_name='Admin'
        )
        StaffMembership.objects.create(
            user=self.tenant_admin_user,
            tenant=self.tenant_a,
            role=self.role_admin_a,
            is_active=True
        )
        StaffProfile.objects.create(
            user=self.tenant_admin_user,
            tenant=self.tenant_a,
            role=UserRole.ADMIN,
            is_active=True
        )

    def test_isp_admin_gets_tenant_credentials(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_isp.key}')
        resp = self.client.get(f'/api/v1/auth/my-tenants/{self.tenant_a.id}/credentials/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        data = resp.json()
        self.assertIn('admin_username', data)
        self.assertEqual(data['admin_username'], 'alpha_admin')
        self.assertEqual(data['contact_email'], 'admin@alpha.net')
        self.assertEqual(data['default_password_hint'], 'sheba1234')

    def test_isp_admin_sets_tenant_password(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_isp.key}')
        mail.outbox.clear()
        resp = self.client.post(
            f'/api/v1/auth/my-tenants/{self.tenant_a.id}/set-password/',
            data={'new_password': 'SuperSecretPassword99!'},
            format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        # Verify the tenant admin user can now authenticate with the new password
        self.tenant_admin_user.refresh_from_db()
        self.assertTrue(self.tenant_admin_user.check_password('SuperSecretPassword99!'))
        self.assertTrue(any('Security Alert: Your Password Was Changed' in m.subject for m in mail.outbox))

    def test_isp_admin_generates_auto_login_token(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_isp.key}')
        resp = self.client.post(
            f'/api/v1/auth/my-tenants/{self.tenant_a.id}/auto-login-token/',
            format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        data = resp.json()
        self.assertIn('token', data)
        self.assertIn('launch_url', data)
        self.assertTrue(len(data['token']) > 10)

    def test_isp_admin_lists_and_creates_accounts_for_tenant(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_isp.key}')
        mail.outbox.clear()
        # 1. Create Account
        new_account_data = {
            'username': 'john_billing',
            'password': 'BillingPass123!',
            'email': 'john@alpha.net',
            'first_name': 'John',
            'last_name': 'Doe',
            'phone': '01711112222',
            'role_id': str(self.role_admin_a.id)
        }
        create_resp = self.client.post(
            f'/api/v1/auth/my-tenants/{self.tenant_a.id}/accounts/',
            data=new_account_data,
            format='json'
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.content)
        created_user = User.objects.get(username='john_billing')
        self.assertTrue(created_user.check_password('BillingPass123!'))

        membership = StaffMembership.objects.filter(user=created_user, tenant=self.tenant_a).first()
        self.assertIsNotNone(membership)
        self.assertEqual(membership.role.id, self.role_admin_a.id)

        # Verify credentials email dispatched to new user
        credentials_email = next((m for m in mail.outbox if 'john@alpha.net' in m.to), None)
        self.assertIsNotNone(credentials_email)
        self.assertIn('Your Access Credentials', credentials_email.subject)

        # 2. List Accounts
        list_resp = self.client.get(f'/api/v1/auth/my-tenants/{self.tenant_a.id}/accounts/')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK, list_resp.content)
        items = list_resp.json().get('items', [])
        usernames = [it['username'] for it in items]
        self.assertIn('john_billing', usernames)
        self.assertIn('alpha_admin', usernames)

    def test_isp_admin_resets_tenant_account_password(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_isp.key}')
        # Create user to reset
        user = User.objects.create_user(username='tech_staff', password='old_password')
        StaffMembership.objects.create(user=user, tenant=self.tenant_a, role=self.role_admin_a, is_active=True)
        StaffProfile.objects.create(user=user, tenant=self.tenant_a, role=UserRole.STAFF, is_active=True)

        resp = self.client.post(
            f'/api/v1/auth/my-tenants/{self.tenant_a.id}/accounts/{user.id}/reset-password/',
            data={'new_password': 'BrandNewPass2026!'},
            format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        user.refresh_from_db()
        self.assertTrue(user.check_password('BrandNewPass2026!'))

    def test_isp_admin_creates_custom_role_for_tenant(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_isp.key}')
        # 1. Get permissions
        perm_resp = self.client.get('/api/v1/auth/my-tenants/permissions/')
        self.assertEqual(perm_resp.status_code, status.HTTP_200_OK, perm_resp.content)
        perms = perm_resp.json().get('items', [])
        self.assertTrue(len(perms) > 0)
        selected_perm_ids = [perms[0]['id']]

        # 2. Create custom role
        role_resp = self.client.post(
            f'/api/v1/auth/my-tenants/{self.tenant_a.id}/roles/',
            data={
                'name': 'Fiber Field Tech',
                'description': 'Handles on-site fiber splicing and router installs',
                'permission_ids': selected_perm_ids,
            },
            format='json'
        )
        self.assertEqual(role_resp.status_code, status.HTTP_201_CREATED, role_resp.content)
        new_role = Role.objects.get(tenant=self.tenant_a, name='Fiber Field Tech')
        self.assertEqual(new_role.permissions.count(), 1)

        # 3. List roles for tenant A
        roles_list_resp = self.client.get(f'/api/v1/auth/my-tenants/{self.tenant_a.id}/roles/')
        self.assertEqual(roles_list_resp.status_code, status.HTTP_200_OK)
        role_names = [r['name'] for r in roles_list_resp.json().get('items', [])]
        self.assertIn('Fiber Field Tech', role_names)

    def test_unauthorized_user_denied_access_to_foreign_tenant(self):
        # User only belongs to Tenant A, tries to access Tenant B
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_isp.key}')

        # Credentials of B
        resp1 = self.client.get(f'/api/v1/auth/my-tenants/{self.tenant_b.id}/credentials/')
        self.assertEqual(resp1.status_code, status.HTTP_403_FORBIDDEN)

        # Set password of B
        resp2 = self.client.post(
            f'/api/v1/auth/my-tenants/{self.tenant_b.id}/set-password/',
            data={'new_password': 'HackPassword123!'},
            format='json'
        )
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)

        # Create account in B
        resp3 = self.client.post(
            f'/api/v1/auth/my-tenants/{self.tenant_b.id}/accounts/',
            data={'username': 'hacker', 'password': 'pass', 'role_id': str(self.role_admin_b.id)},
            format='json'
        )
        self.assertEqual(resp3.status_code, status.HTTP_403_FORBIDDEN)

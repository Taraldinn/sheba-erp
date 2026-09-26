"""
Stage 2 — Tenant-Aware Authentication Test Suite
=================================================
Verifies strict architectural invariants for Stage 2:
  Host -> Tenant -> User -> StaffMembership -> active membership

Scenarios covered:
  1. user + correct tenant -> allowed (200 OK)
  2. user + wrong tenant -> denied (403 Forbidden, CROSS_TENANT_LOGIN)
  3. inactive membership -> denied (403 Forbidden, MEMBERSHIP_INACTIVE)
  4. inactive tenant -> denied (403 Forbidden, TENANT_INACTIVE)
  5. central admin -> control plane allowed (200 OK)
  6. ISP staff -> control plane denied (403 Forbidden, CONTROL_PLANE_ACCESS_DENIED)
  7. Token authentication cannot bypass tenant isolation (403 on foreign tenant)
  8. Token authentication rejected on inactive membership (403)
  9. Token authentication rejected on inactive tenant (403)
 10. Token authentication control-plane isolation (ISP staff token rejected on /api/v1/saas/*)
 11. Multi-tenant user membership allowed on affiliated tenants, denied on unaffiliated tenants
 12. StaffMembership authoritative over StaffProfile (deactivated membership blocks access)
 13. ISP staff cannot authenticate on unconfigured domain without tenant context (403)
"""

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import StaffProfile, StaffMembership, Role, UserRole
from apps.customers.models import Customer
from apps.billing.models import Package


class TenantAwareAuthenticationStage2Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenant A (Alpha ISP)
        self.tenant_a = Tenant.objects.create(
            name='Alpha ISP',
            slug='alpha',
            domain='alpha.shebafi.com',
            is_active=True
        )
        self.domain_a = TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname='alpha.shebafi.com',
            is_active=True,
            is_primary=True
        )

        # Tenant B (Beta Telecom)
        self.tenant_b = Tenant.objects.create(
            name='Beta Telecom',
            slug='beta',
            domain='beta.shebafi.com',
            is_active=True
        )
        self.domain_b = TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname='beta.shebafi.com',
            is_active=True,
            is_primary=True
        )

        # Tenant C (Gamma Fiber)
        self.tenant_c = Tenant.objects.create(
            name='Gamma Fiber',
            slug='gamma',
            domain='gamma.shebafi.com',
            is_active=True
        )
        self.domain_c = TenantDomain.objects.create(
            tenant=self.tenant_c,
            hostname='gamma.shebafi.com',
            is_active=True,
            is_primary=True
        )

        # Staff user for Tenant A
        self.user_a = User.objects.create_user(
            username='staff_alpha',
            password='password123',
            email='alpha@sheba.test'
        )
        self.profile_a = StaffProfile.objects.create(
            user=self.user_a,
            tenant=self.tenant_a,
            role=UserRole.ADMIN
        )
        # Note: signal auto-creates StaffMembership; fetch it
        self.membership_a = StaffMembership.objects.get(user=self.user_a, tenant=self.tenant_a)

        # Staff user for Tenant B
        self.user_b = User.objects.create_user(
            username='staff_beta',
            password='password123',
            email='beta@sheba.test'
        )
        self.profile_b = StaffProfile.objects.create(
            user=self.user_b,
            tenant=self.tenant_b,
            role=UserRole.ADMIN
        )
        self.membership_b = StaffMembership.objects.get(user=self.user_b, tenant=self.tenant_b)

        # Central Super Administrator
        self.superadmin = User.objects.create_superuser(
            username='central_superadmin',
            password='supersecret123',
            email='admin@shebafi.xyz'
        )

        # Seed minimal data for business endpoint tests
        self.pkg_a = Package.objects.create(
            tenant=self.tenant_a,
            name='Alpha 10M',
            regular_price=500.00
        )
        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            pppoe_username='customer_alpha_01',
            full_name='Alpha Subscriber',
            package=self.pkg_a
        )

        self.pkg_b = Package.objects.create(
            tenant=self.tenant_b,
            name='Beta 20M',
            regular_price=1000.00
        )
        self.customer_b = Customer.objects.create(
            tenant=self.tenant_b,
            pppoe_username='customer_beta_01',
            full_name='Beta Subscriber',
            package=self.pkg_b
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. user + correct tenant -> allowed
    # ─────────────────────────────────────────────────────────────────────────
    def test_login_user_correct_tenant_allowed(self):
        """Staff of Tenant A logging into alpha.shebafi.com succeeds with 200 OK."""
        response = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff_alpha', 'password': 'password123'},
            HTTP_HOST='alpha.shebafi.com'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['username'], 'staff_alpha')
        self.assertEqual(response.data['tenant']['slug'], 'alpha')
        self.assertIsNotNone(response.data.get('membership'))
        self.assertEqual(response.data['membership']['is_active'], True)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. user + wrong tenant -> denied
    # ─────────────────────────────────────────────────────────────────────────
    def test_login_user_wrong_tenant_denied(self):
        """Staff of Tenant A attempting login on beta.shebafi.com is rejected with 403."""
        response = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff_alpha', 'password': 'password123'},
            HTTP_HOST='beta.shebafi.com'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), 'CROSS_TENANT_LOGIN')

    # ─────────────────────────────────────────────────────────────────────────
    # 3. inactive membership -> denied
    # ─────────────────────────────────────────────────────────────────────────
    def test_login_inactive_membership_denied(self):
        """Staff user with is_active=False on StaffMembership is rejected with 403."""
        self.membership_a.is_active = False
        self.membership_a.save(update_fields=['is_active'])

        response = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff_alpha', 'password': 'password123'},
            HTTP_HOST='alpha.shebafi.com'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), 'MEMBERSHIP_INACTIVE')

    # ─────────────────────────────────────────────────────────────────────────
    # 4. inactive tenant -> denied
    # ─────────────────────────────────────────────────────────────────────────
    def test_login_inactive_tenant_denied(self):
        """User attempting login on a suspended tenant domain is rejected with 403."""
        self.tenant_a.is_active = False
        self.tenant_a.save(update_fields=['is_active'])

        response = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff_alpha', 'password': 'password123'},
            HTTP_HOST='alpha.shebafi.com'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), 'TENANT_INACTIVE')

    # ─────────────────────────────────────────────────────────────────────────
    # 5. central admin -> control plane allowed
    # ─────────────────────────────────────────────────────────────────────────
    def test_control_plane_login_central_admin_allowed(self):
        """Platform superadmin authenticating on SaaS control plane is allowed (200 OK)."""
        # A. SaaS Login endpoint
        saas_resp = self.client.post(
            '/api/v1/saas/auth/login/',
            {'username': 'central_superadmin', 'password': 'supersecret123'},
            HTTP_HOST='admin.shebafi.xyz'
        )
        self.assertEqual(saas_resp.status_code, status.HTTP_200_OK)
        self.assertIn('token', saas_resp.data)
        self.assertEqual(saas_resp.data['user']['role'], 'PLATFORM_SUPER_ADMIN')

        # B. Standard auth login on control plane domain
        core_resp = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'central_superadmin', 'password': 'supersecret123'},
            HTTP_HOST='admin.shebafi.xyz'
        )
        self.assertEqual(core_resp.status_code, status.HTTP_200_OK)
        self.assertIn('token', core_resp.data)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. ISP staff -> control plane denied
    # ─────────────────────────────────────────────────────────────────────────
    def test_control_plane_login_isp_staff_denied(self):
        """ISP employee attempting login on SaaS control plane is rejected with 403."""
        # A. SaaS Login endpoint
        saas_resp = self.client.post(
            '/api/v1/saas/auth/login/',
            {'username': 'staff_alpha', 'password': 'password123'},
            HTTP_HOST='admin.shebafi.xyz'
        )
        self.assertEqual(saas_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(saas_resp.data.get('code'), 'CONTROL_PLANE_ACCESS_DENIED')

        # B. Standard auth login on control plane domain
        core_resp = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff_alpha', 'password': 'password123'},
            HTTP_HOST='admin.shebafi.xyz'
        )
        self.assertEqual(core_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(core_resp.data.get('code'), 'CONTROL_PLANE_ACCESS_DENIED')

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Token auth cannot bypass tenant isolation
    # ─────────────────────────────────────────────────────────────────────────
    def test_token_auth_cannot_bypass_tenant_isolation(self):
        """A token issued to Tenant A's staff cannot access Tenant B's API endpoints."""
        token_a, _ = Token.objects.get_or_create(user=self.user_a)
        auth_headers_a = {'HTTP_AUTHORIZATION': f'Token {token_a.key}'}

        # A. Access own tenant -> 200 OK
        resp_own = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='alpha.shebafi.com',
            **auth_headers_a
        )
        self.assertEqual(resp_own.status_code, status.HTTP_200_OK)

        resp_me_own = self.client.get(
            '/api/v1/auth/me/',
            HTTP_HOST='alpha.shebafi.com',
            **auth_headers_a
        )
        self.assertEqual(resp_me_own.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_me_own.data['username'], 'staff_alpha')
        self.assertIsNotNone(resp_me_own.data.get('membership'))

        # B. Access foreign tenant with same token -> 403 Forbidden!
        resp_foreign = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='beta.shebafi.com',
            **auth_headers_a
        )
        self.assertEqual(resp_foreign.status_code, status.HTTP_403_FORBIDDEN)

        resp_me_foreign = self.client.get(
            '/api/v1/auth/me/',
            HTTP_HOST='beta.shebafi.com',
            **auth_headers_a
        )
        self.assertEqual(resp_me_foreign.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Token auth inactive membership denied
    # ─────────────────────────────────────────────────────────────────────────
    def test_token_auth_inactive_membership_denied(self):
        """Deactivating StaffMembership immediately invalidates token access."""
        token_a, _ = Token.objects.get_or_create(user=self.user_a)
        auth_headers_a = {'HTTP_AUTHORIZATION': f'Token {token_a.key}'}

        # Verify initial access
        resp_init = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='alpha.shebafi.com',
            **auth_headers_a
        )
        self.assertEqual(resp_init.status_code, status.HTTP_200_OK)

        # Deactivate membership
        self.membership_a.is_active = False
        self.membership_a.save(update_fields=['is_active'])

        # Now access must be rejected with 403
        resp_blocked = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='alpha.shebafi.com',
            **auth_headers_a
        )
        self.assertEqual(resp_blocked.status_code, status.HTTP_403_FORBIDDEN)

        resp_me_blocked = self.client.get(
            '/api/v1/auth/me/',
            HTTP_HOST='alpha.shebafi.com',
            **auth_headers_a
        )
        self.assertEqual(resp_me_blocked.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Token auth inactive tenant denied
    # ─────────────────────────────────────────────────────────────────────────
    def test_token_auth_inactive_tenant_denied(self):
        """Suspending a tenant immediately blocks token access on business endpoints."""
        token_a, _ = Token.objects.get_or_create(user=self.user_a)
        auth_headers_a = {'HTTP_AUTHORIZATION': f'Token {token_a.key}'}

        # Suspend Tenant A
        self.tenant_a.is_active = False
        self.tenant_a.save(update_fields=['is_active'])

        resp = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='alpha.shebafi.com',
            **auth_headers_a
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 10. Token auth control-plane isolation
    # ─────────────────────────────────────────────────────────────────────────
    def test_token_auth_control_plane_isolation(self):
        """ISP staff token cannot access SaaS control plane endpoints."""
        token_staff, _ = Token.objects.get_or_create(user=self.user_a)
        token_super, _ = Token.objects.get_or_create(user=self.superadmin)

        staff_headers = {'HTTP_AUTHORIZATION': f'Token {token_staff.key}'}
        super_headers = {'HTTP_AUTHORIZATION': f'Token {token_super.key}'}

        # ISP staff blocked from SaaS tenants API
        resp_staff_tenants = self.client.get(
            '/api/v1/saas/tenants/',
            HTTP_HOST='admin.shebafi.xyz',
            **staff_headers
        )
        self.assertEqual(resp_staff_tenants.status_code, status.HTTP_403_FORBIDDEN)

        # ISP staff blocked from SaaS me endpoint
        resp_staff_me = self.client.get(
            '/api/v1/saas/auth/me/',
            HTTP_HOST='admin.shebafi.xyz',
            **staff_headers
        )
        self.assertEqual(resp_staff_me.status_code, status.HTTP_403_FORBIDDEN)

        # Central superadmin allowed on SaaS tenants API
        resp_super_tenants = self.client.get(
            '/api/v1/saas/tenants/',
            HTTP_HOST='admin.shebafi.xyz',
            **super_headers
        )
        self.assertEqual(resp_super_tenants.status_code, status.HTTP_200_OK)

        # Central superadmin allowed on SaaS me endpoint
        resp_super_me = self.client.get(
            '/api/v1/saas/auth/me/',
            HTTP_HOST='admin.shebafi.xyz',
            **super_headers
        )
        self.assertEqual(resp_super_me.status_code, status.HTTP_200_OK)

    # ─────────────────────────────────────────────────────────────────────────
    # 11. Multi-tenant user membership handling
    # ─────────────────────────────────────────────────────────────────────────
    def test_multi_tenant_user_membership(self):
        """A consultant belonging to both Tenant A and Tenant B can access both, but not Tenant C."""
        consultant = User.objects.create_user(
            username='consultant_it',
            password='password123',
            email='consultant@it.test'
        )
        # Create active memberships in Tenant A and Tenant B with explicit roles
        role_a = self.membership_a.role or self.tenant_a.roles.filter(name__in=['Admin', 'Support Staff']).first()
        role_b = self.membership_b.role or self.tenant_b.roles.filter(name__in=['Admin', 'Support Staff']).first()
        StaffMembership.objects.create(
            user=consultant,
            tenant=self.tenant_a,
            role=role_a,
            is_active=True
        )
        StaffMembership.objects.create(
            user=consultant,
            tenant=self.tenant_b,
            role=role_b,
            is_active=True
        )

        token_c, _ = Token.objects.get_or_create(user=consultant)
        headers = {'HTTP_AUTHORIZATION': f'Token {token_c.key}'}

        # Access Tenant A -> allowed
        resp_a = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='alpha.shebafi.com',
            **headers
        )
        self.assertEqual(resp_a.status_code, status.HTTP_200_OK)

        # Access Tenant B -> allowed
        resp_b = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='beta.shebafi.com',
            **headers
        )
        self.assertEqual(resp_b.status_code, status.HTTP_200_OK)

        # Access Tenant C (no membership) -> 403 Forbidden!
        resp_c = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='gamma.shebafi.com',
            **headers
        )
        self.assertEqual(resp_c.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 12. StaffMembership authoritative over StaffProfile
    # ─────────────────────────────────────────────────────────────────────────
    def test_staff_profile_sync_to_staff_membership(self):
        """StaffProfile creation mirrors to StaffMembership; StaffMembership is authoritative."""
        user_new = User.objects.create_user(
            username='new_staff_01',
            password='password123'
        )
        profile_new = StaffProfile.objects.create(
            user=user_new,
            tenant=self.tenant_a,
            role=UserRole.BILLING_OPERATOR,
            is_active=True
        )

        # Verify StaffMembership was automatically created via signal
        membership = StaffMembership.objects.filter(user=user_new, tenant=self.tenant_a).first()
        self.assertIsNotNone(membership)
        self.assertTrue(membership.is_active)

        # Deactivate StaffMembership while leaving StaffProfile active
        membership.is_active = False
        membership.save(update_fields=['is_active'])

        token_new, _ = Token.objects.get_or_create(user=user_new)
        headers = {'HTTP_AUTHORIZATION': f'Token {token_new.key}'}

        # Must be rejected because StaffMembership is authoritative!
        resp = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='alpha.shebafi.com',
            **headers
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 13. Tenant domain required for ISP staff authentication
    # ─────────────────────────────────────────────────────────────────────────
    def test_login_tenant_domain_required_for_isp_staff(self):
        """ISP staff cannot log in through an unconfigured/unknown domain without tenant context."""
        response = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff_alpha', 'password': 'password123'},
            HTTP_HOST='unconfigured.example.com'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), 'TENANT_DOMAIN_REQUIRED')

    # ─────────────────────────────────────────────────────────────────────────
    # 14. Control plane logout invalidates token
    # ─────────────────────────────────────────────────────────────────────────
    def test_control_plane_logout_invalidates_token(self):
        """SaaS superadmin logout invalidates token so subsequent calls return 401."""
        login_resp = self.client.post(
            '/api/v1/saas/auth/login/',
            {'username': 'central_superadmin', 'password': 'supersecret123'},
            HTTP_HOST='admin.shebafi.xyz'
        )
        self.assertEqual(login_resp.status_code, status.HTTP_200_OK)
        token = login_resp.data['token']
        headers = {
            'HTTP_AUTHORIZATION': f'Token {token}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }

        # Session is valid
        me_resp = self.client.get('/api/v1/saas/auth/me/', **headers)
        self.assertEqual(me_resp.status_code, status.HTTP_200_OK)

        # Logout
        logout_resp = self.client.post('/api/v1/saas/auth/logout/', **headers)
        self.assertEqual(logout_resp.status_code, status.HTTP_200_OK)

        # Token must now be invalidated
        me_after = self.client.get('/api/v1/saas/auth/me/', **headers)
        self.assertEqual(me_after.status_code, status.HTTP_401_UNAUTHORIZED)

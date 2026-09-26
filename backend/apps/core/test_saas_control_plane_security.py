"""
apps/core/test_saas_control_plane_security.py — SaaS Control-Plane vs Tenant-Plane Security Boundary

Validates ALL of the following security properties:

  1. Anonymous callers rejected with 401/403 on ALL 14 control-plane endpoints.
  2. Tenant staff users (even ISP tenant admins) blocked with 403 on ALL control-plane endpoints.
  3. Tenant API Application keys blocked with 401/403 on ALL control-plane endpoints.
  4. Dual-token callers (API Key + Staff token) blocked with 403 on ALL control-plane endpoints.
  5. Central Superadmin (is_superuser=True, no StaffMembership) explicitly authorized (200 OK).
  6. Destructive control-plane mutations (create tenant, toggle domain, revoke key) blocked for tenant users.
  7. Tenant-plane endpoints enforce strict tenant context; cross-tenant data is invisible.
  8. /api/v1/saas/health/ is properly guarded by IsCentralAdmin.
  9. Superadmin is never blocked by having an empty StaffMembership set.
 10. ISP user with no memberships at all is still rejected from control-plane.
 11. Suspended tenants are rejected from tenant-plane APIs with 403.
 12. Unknown domain requests return 404 TENANT_NOT_FOUND for tenant-plane paths.
 13. Control-plane POST mutations require superadmin identity.
 14. API key caller with no scopes is rejected from tenant-plane endpoints.

Architecture invariants:
  - Single Django runtime + shared PostgreSQL (no separate projects/DBs).
  - request.tenant is the sole authoritative tenant context — no header override.
  - IsCentralAdmin rejects ANY caller presenting an API key, api_token, or application.
  - IsCentralAdmin rejects ANY non-superuser, even if they have no StaffMembership.
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import (
    Tenant,
    TenantDomain,
    TenantSubscription,
    SaaSPackage,
    ApiApplication,
)
from apps.authentication.models import StaffProfile, StaffMembership, Role, UserRole
from apps.customers.models import Customer, CustomerStatus


# ═══════════════════════════════════════════════════════════════════════════════
# Section A — Exhaustive authorization tests for all SaaS control-plane endpoints
# ═══════════════════════════════════════════════════════════════════════════════

class SaaSControlPlaneSecurityBoundaryTests(TestCase):
    """
    Exhaustive authorization tests for all 14 SaaS control-plane endpoints.
    Each test runs every endpoint as a subTest so failures are pinpointed precisely.
    """

    CONTROL_PLANE_ENDPOINTS = [
        '/api/v1/saas/overview/',
        '/api/v1/saas/health/',
        '/api/v1/saas/tenants/',
        '/api/v1/saas/domains/',
        '/api/v1/saas/requests/',
        '/api/v1/saas/packages/',
        '/api/v1/saas/subscriptions/',
        '/api/v1/saas/payments/',
        '/api/v1/saas/backups/',
        '/api/v1/saas/users/',
        '/api/v1/saas/audit-logs/',
        '/api/v1/saas/api-credentials/',
        '/api/v1/saas/applications/',
        '/api/v1/saas/auth/me/',
    ]

    def setUp(self):
        self.client = APIClient()

        # ─── 1. Provision Central Superadmin ───
        self.superadmin = User.objects.create_superuser(
            username='central_platform_admin',
            email='admin@shebafi.net',
            password='PlatformMasterPassword123!',
        )
        self.superadmin_token, _ = Token.objects.get_or_create(user=self.superadmin)
        self.superadmin_headers = {
            'HTTP_AUTHORIZATION': f'Token {self.superadmin_token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }

        # ─── 2. Provision ISP Tenant & Staff Member ───
        self.tenant = Tenant.objects.create(
            name='SpeedNet Broadband',
            slug='speednet',
            is_active=True,
            subscription_status='active',
        )
        self.tenant_domain = TenantDomain.objects.create(
            tenant=self.tenant,
            hostname='speednet.shebafi.net',
            is_primary=True,
            is_active=True,
            verified=True,
        )

        self.isp_admin_user = User.objects.create_user(
            username='admin_speednet',
            password='SpeedNetPassword123!',
        )
        self.isp_admin_token, _ = Token.objects.get_or_create(user=self.isp_admin_user)
        self.admin_role, _ = Role.objects.get_or_create(
            tenant=self.tenant,
            name='Admin',
            defaults={'description': 'ISP Administrator'},
        )
        self.membership = StaffMembership.objects.create(
            user=self.isp_admin_user,
            tenant=self.tenant,
            role=self.admin_role,
            is_active=True,
        )
        self.isp_staff_headers = {
            'HTTP_AUTHORIZATION': f'Token {self.isp_admin_token.key}',
            'HTTP_HOST': 'speednet.shebafi.net',
        }

        # ─── 3. Provision Tenant API Application Key ───
        self.app, self.raw_api_key = ApiApplication.create_application(
            tenant=self.tenant,
            name='SpeedNet Customer Portal',
            created_by=self.superadmin,
            rate_limit=1000,
        )
        self.app_only_headers = {
            'HTTP_X_API_KEY': self.raw_api_key,
            'HTTP_HOST': 'speednet.shebafi.net',
        }
        self.dual_token_headers = {
            'HTTP_X_API_KEY': self.raw_api_key,
            'HTTP_AUTHORIZATION': f'Token {self.isp_admin_token.key}',
            'HTTP_HOST': 'speednet.shebafi.net',
        }

    # ─── Test 1: Anonymous access blocked ─────────────────────────────────────

    def test_anonymous_access_denied_for_all_control_plane_endpoints(self):
        """Anonymous callers must be rejected with 401/403 across all control plane routes."""
        for endpoint in self.CONTROL_PLANE_ENDPOINTS:
            with self.subTest(endpoint=endpoint):
                resp = self.client.get(endpoint, HTTP_HOST='admin.shebafi.xyz')
                self.assertIn(
                    resp.status_code,
                    [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
                    f"Anonymous request to {endpoint} returned {resp.status_code}",
                )

    # ─── Test 2: Tenant staff blocked ─────────────────────────────────────────

    def test_tenant_staff_blocked_from_all_control_plane_endpoints(self):
        """Authenticated tenant staff (even ISP Admins) must receive 403 on all control plane routes."""
        for endpoint in self.CONTROL_PLANE_ENDPOINTS:
            with self.subTest(endpoint=endpoint):
                resp = self.client.get(endpoint, **self.isp_staff_headers)
                self.assertEqual(
                    resp.status_code,
                    status.HTTP_403_FORBIDDEN,
                    f"Tenant staff user was not forbidden from {endpoint}; got {resp.status_code}",
                )

    # ─── Test 3: API Key blocked ───────────────────────────────────────────────

    def test_tenant_application_key_blocked_from_all_control_plane_endpoints(self):
        """API Application keys must receive 401/403 across all control plane routes."""
        for endpoint in self.CONTROL_PLANE_ENDPOINTS:
            with self.subTest(endpoint=endpoint):
                resp = self.client.get(endpoint, **self.app_only_headers)
                self.assertIn(
                    resp.status_code,
                    [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
                    f"Application key caller was not blocked from {endpoint}; got {resp.status_code}",
                )

    # ─── Test 4: Dual-token blocked ────────────────────────────────────────────

    def test_dual_token_staff_blocked_from_all_control_plane_endpoints(self):
        """Dual-token calls (API key + staff token) must receive 403 across all control plane routes."""
        for endpoint in self.CONTROL_PLANE_ENDPOINTS:
            with self.subTest(endpoint=endpoint):
                resp = self.client.get(endpoint, **self.dual_token_headers)
                self.assertEqual(
                    resp.status_code,
                    status.HTTP_403_FORBIDDEN,
                    f"Dual-token staff caller was not forbidden from {endpoint}; got {resp.status_code}",
                )

    # ─── Test 5: Superadmin authorized ────────────────────────────────────────

    def test_central_superadmin_authorized_for_all_control_plane_endpoints(self):
        """Central platform superadmin must be authorized (200 OK) for all control plane list routes."""
        for endpoint in self.CONTROL_PLANE_ENDPOINTS:
            with self.subTest(endpoint=endpoint):
                resp = self.client.get(endpoint, **self.superadmin_headers)
                self.assertEqual(
                    resp.status_code,
                    status.HTTP_200_OK,
                    f"Superadmin was denied access to {endpoint}; got {resp.status_code} ({resp.content})",
                )

    # ─── Test 6: Destructive mutations blocked for tenant users ───────────────

    def test_control_plane_destructive_actions_blocked_for_tenant_users(self):
        """Mutations on control plane resources (creating tenants, revoking keys, toggle domain) are 403."""
        # 1. Attempt creating a new tenant as tenant admin
        tenant_create_resp = self.client.post(
            '/api/v1/saas/tenants/',
            {'name': 'Rogue ISP', 'slug': 'rogue', 'admin_username': 'rogue_admin'},
            format='json',
            **self.isp_staff_headers,
        )
        self.assertEqual(tenant_create_resp.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Attempt toggling domain verification as tenant admin
        domain_toggle_resp = self.client.post(
            f'/api/v1/saas/domains/{self.tenant_domain.id}/toggle-verify/',
            format='json',
            **self.isp_staff_headers,
        )
        self.assertEqual(domain_toggle_resp.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Attempt revoking application as tenant admin
        app_revoke_resp = self.client.post(
            f'/api/v1/saas/applications/{self.app.id}/revoke/',
            format='json',
            **self.isp_staff_headers,
        )
        self.assertEqual(app_revoke_resp.status_code, status.HTTP_403_FORBIDDEN)

    # ─── Test 7: Tenant plane isolation ───────────────────────────────────────

    def test_tenant_plane_isolation_guaranteed(self):
        """Tenant plane resources operate exclusively within tenant boundaries."""
        # Create customer in speednet
        Customer.objects.create(
            tenant=self.tenant,
            customer_code='CUST-SPEED-1',
            full_name='Speed Customer',
            pppoe_username='speed_cust',
            pppoe_password='secretpassword',
            mobile='01811111111',
            status=CustomerStatus.ACTIVE,
        )

        # Tenant 2
        tenant2 = Tenant.objects.create(name='Other ISP', slug='otherisp', is_active=True)
        TenantDomain.objects.create(
            tenant=tenant2,
            hostname='otherisp.shebafi.net',
            is_primary=True,
            is_active=True,
            verified=True,
        )
        Customer.objects.create(
            tenant=tenant2,
            customer_code='CUST-OTHER-1',
            full_name='Other Customer',
            pppoe_username='other_cust',
            pppoe_password='otherpassword',
            mobile='01822222222',
            status=CustomerStatus.ACTIVE,
        )

        # Tenant 1 staff queries customers — only their own data visible
        resp = self.client.get('/api/v1/customers/', **self.isp_staff_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        results = data if isinstance(data, list) else data.get('results', [])
        usernames = [c['pppoe_username'] for c in results]

        self.assertIn('speed_cust', usernames)
        self.assertNotIn('other_cust', usernames)

    # ─── Test 8: /api/v1/saas/health/ is protected ────────────────────────────

    def test_saas_health_endpoint_requires_central_admin(self):
        """/api/v1/saas/health/ must be explicitly guarded by IsCentralAdmin."""
        # Anonymous
        resp = self.client.get('/api/v1/saas/health/', HTTP_HOST='admin.shebafi.xyz')
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # Tenant staff blocked
        resp = self.client.get('/api/v1/saas/health/', **self.isp_staff_headers)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # API key blocked
        resp = self.client.get('/api/v1/saas/health/', **self.app_only_headers)
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # Superadmin allowed
        resp = self.client.get('/api/v1/saas/health/', **self.superadmin_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn('status', data)
        self.assertIn('database', data)
        self.assertIn('redis', data)
        self.assertIn('tenants_total', data)

    # ─── Test 9: Superadmin not blocked by empty membership ───────────────────

    def test_superadmin_with_no_memberships_has_full_control_plane_access(self):
        """A superuser with zero StaffMembership records must still reach all control-plane endpoints."""
        # Verify superadmin has no memberships
        self.assertFalse(
            StaffMembership.objects.filter(user=self.superadmin, is_active=True).exists(),
            "Central superadmin must not hold any StaffMembership records",
        )
        for endpoint in self.CONTROL_PLANE_ENDPOINTS:
            with self.subTest(endpoint=endpoint):
                resp = self.client.get(endpoint, **self.superadmin_headers)
                self.assertEqual(
                    resp.status_code,
                    status.HTTP_200_OK,
                    f"Superadmin without memberships was denied {endpoint}; got {resp.status_code}",
                )

    # ─── Test 10: Non-superuser with no memberships blocked ───────────────────

    def test_ordinary_user_with_no_memberships_blocked_from_control_plane(self):
        """A normal (non-superuser) user with zero memberships cannot access control-plane."""
        orphan = User.objects.create_user(username='orphan_user', password='password')
        token, _ = Token.objects.get_or_create(user=orphan)
        orphan_headers = {
            'HTTP_AUTHORIZATION': f'Token {token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }
        for endpoint in self.CONTROL_PLANE_ENDPOINTS:
            with self.subTest(endpoint=endpoint):
                resp = self.client.get(endpoint, **orphan_headers)
                self.assertIn(
                    resp.status_code,
                    [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
                    f"Orphan user was not blocked from {endpoint}; got {resp.status_code}",
                )

    # ─── Test 11: API key with no scopes blocked from tenant-plane ────────────

    def test_api_key_with_no_scopes_blocked_from_tenant_plane(self):
        """An API Application with no permission scopes cannot access tenant-plane APIs."""
        # Create an application with empty permissions
        app_no_scopes, raw_key = ApiApplication.create_application(
            tenant=self.tenant,
            name='No-Scope Portal',
            created_by=self.superadmin,
            permissions=[],
            rate_limit=100,
        )
        headers = {
            'HTTP_X_API_KEY': raw_key,
            'HTTP_HOST': 'speednet.shebafi.net',
        }
        # Should not be able to list customers without scopes
        resp = self.client.get('/api/v1/customers/', **headers)
        self.assertIn(
            resp.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
            f"No-scope API key was not blocked from /api/v1/customers/; got {resp.status_code}",
        )

    # ─── Test 12: Superadmin control-plane POST mutations succeed ─────────────

    def test_superadmin_can_create_saas_package(self):
        """Central superadmin can successfully create a SaaS platform package."""
        payload = {
            'name': 'Enterprise Plus',
            'code': 'ENT_PLUS',
            'description': 'Top-tier SaaS plan',
            'monthly_price': '49999.00',
            'yearly_price': '499999.00',
            'max_subscribers': 50000,
            'max_routers': 500,
            'max_custom_domains': 20,
            'features': ['white-label', 'analytics', 'api-access'],
            'is_active': True,
            'is_public': True,
        }
        resp = self.client.post(
            '/api/v1/saas/packages/',
            payload,
            format='json',
            **self.superadmin_headers,
        )
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        data = resp.json()
        self.assertEqual(data.get('code'), 'ENT_PLUS')

    def test_tenant_staff_blocked_from_creating_saas_package(self):
        """Tenant staff cannot create SaaS platform packages."""
        payload = {
            'name': 'Rogue Package',
            'code': 'ROGUE',
            'description': 'Should be blocked',
            'monthly_price': '100.00',
            'yearly_price': '1000.00',
            'max_subscribers': 100,
            'max_routers': 5,
            'is_active': True,
        }
        resp = self.client.post(
            '/api/v1/saas/packages/',
            payload,
            format='json',
            **self.isp_staff_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # ─── Test 13: Superadmin can toggle tenant status ─────────────────────────

    def test_superadmin_can_toggle_tenant_status(self):
        """Central superadmin can toggle tenant active/inactive status."""
        # Create a second tenant to manipulate
        t = Tenant.objects.create(
            name='Toggle Test ISP',
            slug='toggle-test',
            is_active=True,
            subscription_status='active',
        )
        resp = self.client.post(
            f'/api/v1/saas/tenants/{t.id}/toggle-status/',
            format='json',
            **self.superadmin_headers,
        )
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        t.refresh_from_db()
        self.assertFalse(t.is_active, "Tenant should have been deactivated by superadmin toggle")

    def test_tenant_staff_cannot_toggle_tenant_status(self):
        """ISP tenant admin cannot toggle tenant status via control plane."""
        t = Tenant.objects.create(
            name='Toggle Test ISP 2',
            slug='toggle-test-2',
            is_active=True,
        )
        resp = self.client.post(
            f'/api/v1/saas/tenants/{t.id}/toggle-status/',
            format='json',
            **self.isp_staff_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        t.refresh_from_db()
        self.assertTrue(t.is_active, "Tenant must not be modified by tenant staff")

    # ─── Test 14: IDOR immunity on tenant resources ───────────────────────────

    def test_tenant_staff_cannot_read_another_tenants_saas_subscription(self):
        """Tenant staff cannot access SaaS subscriptions of another tenant via control-plane."""
        pkg = SaaSPackage.objects.create(
            name='Growth', code='GROWTH', monthly_price=Decimal('15000.00'),
            yearly_price=Decimal('150000.00'), max_subscribers=1000, max_routers=10,
        )
        tenant2 = Tenant.objects.create(name='Secret ISP', slug='secret-isp', is_active=True)
        sub = TenantSubscription.objects.create(
            tenant=tenant2,
            package=pkg,
            billing_cycle='monthly',
            price=Decimal('15000.00'),
            status='active',
        )
        # Tenant staff calling control-plane subscriptions endpoint
        resp = self.client.get(
            f'/api/v1/saas/subscriptions/{sub.id}/',
            **self.isp_staff_headers,
        )
        self.assertEqual(
            resp.status_code,
            status.HTTP_403_FORBIDDEN,
            "Tenant staff must not access SaaS subscriptions of another tenant",
        )

    # ─── Test 15: API key blocked from control-plane POST mutations ───────────

    def test_api_key_cannot_create_tenant(self):
        """An API Application key cannot register a new ISP tenant."""
        payload = {'name': 'Hijack ISP', 'slug': 'hijack', 'admin_username': 'hijack_admin'}
        resp = self.client.post(
            '/api/v1/saas/tenants/',
            payload,
            format='json',
            **self.app_only_headers,
        )
        self.assertIn(
            resp.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
            f"API key was not blocked from POST /api/v1/saas/tenants/; got {resp.status_code}",
        )

    def test_api_key_cannot_revoke_application(self):
        """An API Application key cannot revoke another application."""
        app2, _ = ApiApplication.create_application(
            tenant=self.tenant,
            name='Portal App 2',
            created_by=self.superadmin,
            rate_limit=500,
        )
        resp = self.client.post(
            f'/api/v1/saas/applications/{app2.id}/revoke/',
            format='json',
            **self.app_only_headers,
        )
        self.assertIn(
            resp.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
            f"API key was not blocked from revoking application; got {resp.status_code}",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Section B — Suspended/Unknown tenant security tests
# ═══════════════════════════════════════════════════════════════════════════════

class TenantSuspensionAndUnknownDomainTests(TestCase):
    """
    Validates middleware-level security: suspended tenants and unknown domains
    are properly rejected before reaching any view logic.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_superuser(
            username='super_for_suspension',
            email='super@shebafi.net',
            password='SuperPassword123!',
        )

    def test_suspended_tenant_blocked_on_tenant_plane(self):
        """Suspended tenants receive 403 TENANT_INACTIVE on tenant-plane APIs."""
        tenant = Tenant.objects.create(
            name='Suspended ISP',
            slug='suspended-isp',
            is_active=False,  # suspended
        )
        TenantDomain.objects.create(
            tenant=tenant,
            hostname='suspended.shebafi.net',
            is_primary=True,
            is_active=True,
            verified=True,
        )
        user = User.objects.create_user(username='suspended_admin', password='Password123!')
        role = Role.objects.create(tenant=tenant, name='Admin')
        StaffMembership.objects.create(user=user, tenant=tenant, role=role, is_active=True)
        token, _ = Token.objects.get_or_create(user=user)

        resp = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='suspended.shebafi.net',
            HTTP_AUTHORIZATION=f'Token {token.key}',
        )
        # Middleware returns 403 TENANT_INACTIVE before the view is reached
        self.assertEqual(
            resp.status_code,
            status.HTTP_403_FORBIDDEN,
            f"Suspended tenant was not blocked; got {resp.status_code}",
        )

    def test_unknown_domain_returns_404_on_tenant_plane(self):
        """A request to an unrecognized domain is rejected with 404 TENANT_NOT_FOUND."""
        resp = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='completely-unknown-domain.example.com',
        )
        self.assertEqual(
            resp.status_code,
            status.HTTP_404_NOT_FOUND,
            f"Unknown domain was not rejected; got {resp.status_code}",
        )

    def test_control_plane_path_bypasses_tenant_resolution(self):
        """Control-plane paths (/api/v1/saas/) bypass tenant resolution entirely."""
        # Even from an unknown domain, the middleware allows /api/v1/saas/ through
        # (but IsCentralAdmin still guards it, so anonymous = 401)
        resp = self.client.get(
            '/api/v1/saas/overview/',
            HTTP_HOST='completely-unknown-domain.example.com',
        )
        # Must be 401 (auth required), not 404 (tenant not found)
        self.assertNotEqual(
            resp.status_code,
            status.HTTP_404_NOT_FOUND,
            "Control-plane path must not return 404 TENANT_NOT_FOUND",
        )
        self.assertIn(
            resp.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Section C — Per-endpoint GET + POST matrix for superadmin authorization
# ═══════════════════════════════════════════════════════════════════════════════

class SuperadminPerEndpointAuthorizationMatrix(TestCase):
    """
    Explicitly verifies superadmin GET access to every control-plane endpoint,
    and tenant staff POST-blocking on every mutable endpoint.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_superuser(
            username='matrix_superadmin',
            email='matrix@shebafi.net',
            password='MatrixPassword123!',
        )
        self.sa_token, _ = Token.objects.get_or_create(user=self.superadmin)
        self.sa_headers = {
            'HTTP_AUTHORIZATION': f'Token {self.sa_token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }

        self.tenant = Tenant.objects.create(
            name='Matrix ISP',
            slug='matrix-isp',
            is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=self.tenant,
            hostname='matrix.shebafi.net',
            is_primary=True,
            is_active=True,
            verified=True,
        )
        isp_user = User.objects.create_user(
            username='matrix_staff',
            password='MatrixStaffPass123!',
        )
        role = Role.objects.create(tenant=self.tenant, name='Admin')
        StaffMembership.objects.create(
            user=isp_user,
            tenant=self.tenant,
            role=role,
            is_active=True,
        )
        isp_token, _ = Token.objects.get_or_create(user=isp_user)
        self.isp_headers = {
            'HTTP_AUTHORIZATION': f'Token {isp_token.key}',
            'HTTP_HOST': 'matrix.shebafi.net',
        }

    def test_superadmin_get_saas_overview(self):
        resp = self.client.get('/api/v1/saas/overview/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn('kpis', data)

    def test_superadmin_get_saas_health(self):
        resp = self.client.get('/api/v1/saas/health/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn('status', data)
        self.assertIn('database', data)

    def test_superadmin_get_saas_tenants(self):
        resp = self.client.get('/api/v1/saas/tenants/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_domains(self):
        resp = self.client.get('/api/v1/saas/domains/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_requests(self):
        resp = self.client.get('/api/v1/saas/requests/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_packages(self):
        resp = self.client.get('/api/v1/saas/packages/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_subscriptions(self):
        resp = self.client.get('/api/v1/saas/subscriptions/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_payments(self):
        resp = self.client.get('/api/v1/saas/payments/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_backups(self):
        resp = self.client.get('/api/v1/saas/backups/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_users(self):
        resp = self.client.get('/api/v1/saas/users/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_audit_logs(self):
        resp = self.client.get('/api/v1/saas/audit-logs/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_api_credentials(self):
        resp = self.client.get('/api/v1/saas/api-credentials/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_applications(self):
        resp = self.client.get('/api/v1/saas/applications/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_superadmin_get_saas_auth_me(self):
        resp = self.client.get('/api/v1/saas/auth/me/', **self.sa_headers)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertTrue(data.get('is_superuser'))
        self.assertEqual(data.get('role'), 'PLATFORM_SUPER_ADMIN')

    def test_tenant_staff_blocked_post_saas_tenants(self):
        resp = self.client.post(
            '/api/v1/saas/tenants/',
            {'name': 'Attempt', 'slug': 'attempt'},
            format='json',
            **self.isp_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_tenant_staff_blocked_post_saas_packages(self):
        resp = self.client.post(
            '/api/v1/saas/packages/',
            {'name': 'Attempt', 'code': 'ATT', 'monthly_price': '100', 'yearly_price': '1000'},
            format='json',
            **self.isp_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_tenant_staff_blocked_post_saas_subscriptions(self):
        resp = self.client.post(
            '/api/v1/saas/subscriptions/',
            {'tenant': str(self.tenant.id), 'billing_cycle': 'monthly'},
            format='json',
            **self.isp_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_tenant_staff_blocked_post_saas_payments(self):
        resp = self.client.post(
            '/api/v1/saas/payments/',
            {'tenant': str(self.tenant.id), 'amount': '5000'},
            format='json',
            **self.isp_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_tenant_staff_blocked_post_saas_applications(self):
        resp = self.client.post(
            '/api/v1/saas/applications/',
            {'tenant': str(self.tenant.id), 'name': 'Hijack App'},
            format='json',
            **self.isp_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_tenant_staff_blocked_post_saas_api_credentials(self):
        resp = self.client.post(
            '/api/v1/saas/api-credentials/',
            {'tenant': str(self.tenant.id)},
            format='json',
            **self.isp_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

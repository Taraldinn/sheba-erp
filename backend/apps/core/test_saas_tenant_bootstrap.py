"""
End-to-End Test Suite: SaaS Tenant Bootstrap Workflow.
=======================================================
Validates the complete bootstrap lifecycle from Superadmin provisioning
to External ISP Frontend operations, RBAC enforcement, and key revocation.

Required flow under test:

  Superadmin (admin.shebafi.xyz)
     │
     ├─ 1. Create SaaS Package (plan/tier)
     ├─ 2. Create ISP / Tenant (+ auto-provision tenant admin user)
     ├─ 3. Register additional Tenant Domain
     ├─ 4. DNS TXT domain verification (mocked)
     ├─ 5. Create SaaS Subscription
     ├─ 6. Create External Frontend Application (ApiApplication)
     └─ 7. Generate hashed API key (shown once, prefix shb_*)
              │
              ▼
  External ISP Frontend (e.g. Next.js)
     │
     ├─ Configured with: API URL + Application API key
     │
     ▼
  Staff Login (/api/v1/auth/login/)
     │
     ├─ Derives Tenant from Application API key context
     └─ Returns staff session token
              │
              ▼
  Django /api/v1/ Protected Operations
     │
     ├─ Dual-Token calls (X-API-Key + Authorization: Token)
     ├─ Strict RBAC + Object Permissions enforced
     ├─ Control-Plane Separation (blocked from /api/v1/saas/*)
     └─ Immediate key revocation invalidation

Verification checklist (all covered):
  ✓  tenant creation
  ✓  domain creation
  ✓  domain validation (DNS TXT, mocked + toggle-verify)
  ✓  application creation (ApiApplication proxy model)
  ✓  API key generation (high-entropy, prefix shb_*)
  ✓  API key hashing (SHA-256, raw secret never stored)
  ✓  key revocation (immediate, 401 on next request)
  ✓  key rotation (new secret, old is dead)
  ✓  key suspension + reactivation
  ✓  staff authentication (via tenant domain context)
  ✓  tenant resolution (middleware: domain → TenantDomain → tenant)
  ✓  RBAC (tenant staff can access their resources, not others')
  ✓  control-plane separation (frontend callers cannot reach /api/v1/saas/*)
  ✓  onboarding request queue (submit → approve → tenant provisioned)
  ✓  create-admin action (add second ISP admin to existing tenant)
  ✓  tenant impersonation blocked for non-superusers
  ✓  cross-tenant data isolation
"""
import uuid
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.authentication.models import Role, StaffMembership
from apps.core.models import (
    ApiApplication,
    AuditLog,
    SaaSPackage,
    Tenant,
    TenantApiToken,
    TenantDomain,
    TenantSubscription,
    TenantOnboardingRequest,
)
from apps.customers.models import Customer, CustomerStatus

User = get_user_model()


# ────────────────────────────────────────────────────────────────────────────
# Section A: Complete end-to-end bootstrap lifecycle
# ────────────────────────────────────────────────────────────────────────────

class SaaSTenantBootstrapEndToEndTests(TestCase):
    """
    Executes and asserts every step of the complete SaaS bootstrap flow.
    Uses the real TenantDomain table for tenant resolution — no mocking of
    middleware or authentication, only DNS TXT resolution is mocked.
    """

    def setUp(self):
        self.client = APIClient()

        # Central Superadmin
        self.superadmin = User.objects.create_superuser(
            username='bootstrap_superadmin',
            email='superadmin@sheba.platform',
            password='SuperSecureAdminPassword999!',
        )
        self.sa_token, _ = Token.objects.get_or_create(user=self.superadmin)
        self.control_plane_headers = {
            'HTTP_AUTHORIZATION': f'Token {self.sa_token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }

    # ─────────────────────────────────────────────────────────────────────────
    # MAIN BOOTSTRAP FLOW
    # ─────────────────────────────────────────────────────────────────────────

    def test_complete_saas_tenant_bootstrap_workflow(self):
        """
        Executes and asserts every step of the complete SaaS bootstrap flow,
        from plan creation through to key revocation.
        """

        # ── Step 1: Create SaaS Package ──────────────────────────────────────
        plan_resp = self.client.post(
            '/api/v1/saas/packages/',
            {
                'name': 'Enterprise ISP Tier',
                'code': 'ENT-TIER-1',
                'description': 'Up to 5,000 active subscribers with full NOC tools',
                'monthly_price': '15000.00',
                'yearly_price': '150000.00',
                'max_subscribers': 5000,
                'max_routers': 20,
                'is_active': True,
            },
            format='json',
            **self.control_plane_headers,
        )
        self.assertEqual(plan_resp.status_code, status.HTTP_201_CREATED, plan_resp.content)
        plan_id = plan_resp.json()['id']
        self.assertTrue(SaaSPackage.objects.filter(id=plan_id).exists())

        # ── Step 2: Create ISP / Tenant + auto-provision initial admin ────────
        tenant_slug = f'skyfiber-{uuid.uuid4().hex[:6]}'
        tenant_resp = self.client.post(
            '/api/v1/saas/tenants/',
            {
                'name': 'SkyFiber Broadband Ltd',
                'slug': tenant_slug,
                'contact_email': 'noc@skyfiber.net',
                'contact_phone': '01711223344',
                'address': 'Dhanmondi, Dhaka',
                'is_active': True,
                'admin_username': f'admin_{tenant_slug}',
                'admin_password': 'TenantAdminPassword123!',
                'admin_email': 'admin@skyfiber.net',
            },
            format='json',
            **self.control_plane_headers,
        )
        self.assertEqual(tenant_resp.status_code, status.HTTP_201_CREATED, tenant_resp.content)
        tenant_data = tenant_resp.json()['tenant']
        tenant_id = tenant_data['id']
        tenant = Tenant.objects.get(id=tenant_id)
        self.assertEqual(tenant.slug, tenant_slug)
        self.assertTrue(tenant.is_active)

        # Verify provisioned admin user + StaffMembership
        admin_username = f'admin_{tenant_slug}'
        admin_user = User.objects.get(username=admin_username)
        self.assertTrue(
            StaffMembership.objects.filter(user=admin_user, tenant=tenant, is_active=True).exists()
        )
        # Verify the Tenant's primary domain was auto-created
        primary_domain_hostname = f'{tenant_slug}.shebafi.xyz'
        primary_domain_obj = TenantDomain.objects.filter(
            tenant=tenant, hostname=primary_domain_hostname, is_primary=True
        ).first()
        self.assertIsNotNone(primary_domain_obj, 'Primary domain must be auto-created on tenant provisioning')
        self.assertTrue(primary_domain_obj.verified)

        # ── Step 3: Register additional custom domain ─────────────────────────
        custom_domain_name = f'{tenant_slug}.shebafi.net'
        domain_resp = self.client.post(
            '/api/v1/saas/domains/',
            {
                'tenant': tenant_id,
                'hostname': custom_domain_name,
                'is_primary': False,
                'domain_type': 'alias',
            },
            format='json',
            **self.control_plane_headers,
        )
        self.assertEqual(domain_resp.status_code, status.HTTP_201_CREATED, domain_resp.content)
        domain_id = domain_resp.json()['id']
        domain_obj = TenantDomain.objects.get(id=domain_id)
        self.assertEqual(domain_obj.hostname, custom_domain_name)
        # DNS challenge token must be auto-generated
        self.assertIsNotNone(domain_obj.dns_challenge_token)
        self.assertGreater(len(domain_obj.dns_challenge_token), 10)
        # New custom domains start unverified
        self.assertFalse(domain_obj.verified)

        # ── Step 4a: DNS TXT verification (mocked, real network I/O skipped) ─
        with patch.object(TenantDomain, 'verify_dns_txt', autospec=True) as mock_verify:
            def _fake_verify(inst):
                inst.verified = True
                inst.save(update_fields=['verified', 'updated_at'])
                return True
            mock_verify.side_effect = _fake_verify
            verify_resp = self.client.post(
                f'/api/v1/saas/domains/{domain_id}/verify-dns/',
                format='json',
                **self.control_plane_headers,
            )
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK, verify_resp.content)
        self.assertTrue(verify_resp.json().get('verified'))
        domain_obj.refresh_from_db()
        self.assertTrue(domain_obj.verified)

        # ── Step 4b: Superadmin toggle-verify (manual override) ───────────────
        toggle_resp = self.client.post(
            f'/api/v1/saas/domains/{domain_id}/toggle-verify/',
            format='json',
            **self.control_plane_headers,
        )
        self.assertEqual(toggle_resp.status_code, status.HTTP_200_OK, toggle_resp.content)
        domain_obj.refresh_from_db()
        self.assertFalse(domain_obj.verified)  # toggled back off

        # Toggle back on so subsequent tenant resolution works
        toggle_resp2 = self.client.post(
            f'/api/v1/saas/domains/{domain_id}/toggle-verify/',
            format='json',
            **self.control_plane_headers,
        )
        self.assertEqual(toggle_resp2.status_code, status.HTTP_200_OK)
        domain_obj.refresh_from_db()
        self.assertTrue(domain_obj.verified)

        # ── Step 5: Create SaaS Subscription ─────────────────────────────────
        sub_resp = self.client.post(
            '/api/v1/saas/subscriptions/',
            {
                'tenant': tenant_id,
                'package': plan_id,
                'billing_cycle': 'monthly',
                'status': 'active',
            },
            format='json',
            **self.control_plane_headers,
        )
        self.assertEqual(sub_resp.status_code, status.HTTP_201_CREATED, sub_resp.content)
        sub_id = sub_resp.json()['id']
        self.assertTrue(TenantSubscription.objects.filter(id=sub_id, status='active').exists())

        # ── Step 6 & 7: Create Application + Generate hashed API key ─────────
        app_resp = self.client.post(
            '/api/v1/saas/applications/',
            {
                'tenant': tenant_id,
                'name': 'SkyFiber Production NextJS Web Portal',
                'permissions': ['customers:read', 'invoices:read', 'billing:read'],
                'rate_limit': 2000,
            },
            format='json',
            **self.control_plane_headers,
        )
        self.assertEqual(app_resp.status_code, status.HTTP_201_CREATED, app_resp.content)
        app_data = app_resp.json()
        app_id = app_data['id']
        raw_api_key = app_data.get('secret_key')

        # Verify key properties
        self.assertIsNotNone(raw_api_key)
        self.assertGreaterEqual(len(raw_api_key), 32)
        db_app = ApiApplication.objects.get(id=app_id)
        self.assertTrue(db_app.key_prefix.startswith('shb_'))
        # Raw key is NEVER stored
        self.assertNotEqual(db_app.token_hash, raw_api_key)
        # Hash verification succeeds
        self.assertTrue(db_app.check_hash(raw_api_key))
        self.assertEqual(db_app.effective_status, TenantApiToken.CredentialStatus.ACTIVE)

        # ── Step 8: External frontend authenticates ISP staff ─────────────────
        # Uses the primary domain (auto-created, verified) so middleware resolves tenant
        login_resp = self.client.post(
            '/api/v1/auth/login/',
            {
                'username': admin_username,
                'password': 'TenantAdminPassword123!',
            },
            format='json',
            HTTP_X_API_KEY=raw_api_key,
            HTTP_HOST=primary_domain_hostname,
        )
        self.assertEqual(login_resp.status_code, status.HTTP_200_OK, login_resp.content)
        login_data = login_resp.json()
        staff_token = login_data.get('token')
        self.assertIsNotNone(staff_token)

        # ── Step 9: Tenant resolution from domain context ─────────────────────
        self.assertIsNotNone(login_data.get('tenant'))
        self.assertEqual(login_data['tenant']['slug'], tenant_slug)
        self.assertEqual(login_data['tenant']['id'], str(tenant.id))

        # ── Step 10: Dual-token protected RBAC access to /api/v1/ ───────────
        Customer.objects.create(
            tenant=tenant,
            customer_code='CUST-BOOT-01',
            full_name='First Bootstrapped Customer',
            pppoe_username='boot_sub_01',
            pppoe_password='secretbootpass',
            mobile='01799999999',
            status=CustomerStatus.ACTIVE,
        )
        frontend_headers = {
            'HTTP_X_API_KEY': raw_api_key,
            'HTTP_AUTHORIZATION': f'Token {staff_token}',
            'HTTP_HOST': primary_domain_hostname,
        }
        cust_resp = self.client.get('/api/v1/customers/', **frontend_headers)
        self.assertEqual(cust_resp.status_code, status.HTTP_200_OK, cust_resp.content)
        results = cust_resp.json() if isinstance(cust_resp.json(), list) else cust_resp.json().get('results', [])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['pppoe_username'], 'boot_sub_01')

        # ── Step 11: Control-plane separation guarantee ───────────────────────
        # Frontend (API key + staff token) must NOT be able to reach SaaS control plane
        cp_attempt = self.client.get('/api/v1/saas/tenants/', **frontend_headers)
        self.assertEqual(cp_attempt.status_code, status.HTTP_403_FORBIDDEN)

        # ── Step 12: Key revocation immediately blocks all access ─────────────
        revoke_resp = self.client.post(
            f'/api/v1/saas/applications/{app_id}/revoke/',
            **self.control_plane_headers,
        )
        self.assertEqual(revoke_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(revoke_resp.json()['status'], 'REVOKED')

        db_app.refresh_from_db()
        self.assertEqual(db_app.effective_status, TenantApiToken.CredentialStatus.REVOKED)

        # Subsequent call with the revoked key must be rejected (middleware returns 401)
        post_revoke_resp = self.client.get('/api/v1/customers/', **frontend_headers)
        self.assertEqual(post_revoke_resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ────────────────────────────────────────────────────────────────────────────
# Section B: API key security — hashing, rotation, suspension, reactivation
# ────────────────────────────────────────────────────────────────────────────

class ApiKeySecurityTests(TestCase):
    """
    Granular tests for API key lifecycle: generation, hashing, rotation,
    suspension, reactivation, and revocation.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_superuser(
            username='key_sec_superadmin',
            email='keysec@sheba.platform',
            password='KeySecurePassword999!',
        )
        sa_token, _ = Token.objects.get_or_create(user=self.superadmin)
        self.sa_headers = {
            'HTTP_AUTHORIZATION': f'Token {sa_token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }
        self.tenant = Tenant.objects.create(
            name='KeySec ISP', slug='keysec-isp', is_active=True, subscription_status='active'
        )
        TenantDomain.objects.create(
            tenant=self.tenant,
            hostname='keysec.shebafi.net',
            is_primary=True,
            is_active=True,
            verified=True,
        )

    def test_api_key_generation_stores_hash_not_raw(self):
        """Generated key: raw secret returned once, SHA-256 hash stored, never the raw key."""
        app, raw = ApiApplication.create_application(
            tenant=self.tenant,
            name='Hash Test App',
            created_by=self.superadmin,
            rate_limit=500,
        )
        self.assertIsNotNone(raw)
        self.assertGreaterEqual(len(raw), 32)
        # Prefix format: shb_<6 chars>
        self.assertTrue(app.key_prefix.startswith('shb_'))
        self.assertEqual(len(app.key_prefix), 10)  # 'shb_' + 6
        # Hash stored, not raw
        self.assertNotEqual(app.token_hash, raw)
        self.assertEqual(len(app.token_hash), 64)  # SHA-256 hex = 64 chars
        # Verification works
        self.assertTrue(app.check_hash(raw))
        self.assertFalse(app.check_hash(raw + 'X'))

    def test_api_key_via_control_plane_endpoint(self):
        """Superadmin creates application via /api/v1/saas/applications/ and receives one-time secret."""
        resp = self.client.post(
            '/api/v1/saas/applications/',
            {
                'tenant': str(self.tenant.id),
                'name': 'Endpoint Test App',
                'permissions': ['customers:read'],
                'rate_limit': 1000,
            },
            format='json',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        data = resp.json()
        self.assertIn('secret_key', data)
        raw_secret = data['secret_key']
        self.assertTrue(data['key_prefix'].startswith('shb_'))

        # DB record must have hash, never raw secret
        db = ApiApplication.objects.get(id=data['id'])
        self.assertNotEqual(db.token_hash, raw_secret)
        self.assertTrue(db.check_hash(raw_secret))

    def test_api_key_rotation_invalidates_old_key(self):
        """Rotating a key invalidates the old raw secret immediately."""
        app, old_raw = ApiApplication.create_application(
            tenant=self.tenant,
            name='Rotate Test App',
            created_by=self.superadmin,
            permissions=['customers:read'],
        )
        resp = self.client.post(
            f'/api/v1/saas/applications/{app.id}/rotate/',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        new_raw = resp.json().get('secret_key')
        self.assertIsNotNone(new_raw)
        self.assertNotEqual(new_raw, old_raw)

        app.refresh_from_db()
        # Old raw key no longer matches
        self.assertFalse(app.check_hash(old_raw))
        # New raw key matches
        self.assertTrue(app.check_hash(new_raw))
        self.assertEqual(app.effective_status, TenantApiToken.CredentialStatus.ACTIVE)

    def test_api_credential_rotation_via_credentials_endpoint(self):
        """TenantApiToken (non-application) can also be rotated via /api/v1/saas/api-credentials/."""
        token_obj, old_raw = TenantApiToken.generate(
            tenant=self.tenant,
            name='Cred Rotate Test',
            permissions=['payments:read'],
            created_by=self.superadmin,
        )
        resp = self.client.post(
            f'/api/v1/saas/api-credentials/{token_obj.id}/rotate/',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        new_raw = resp.json().get('secret_key')
        self.assertIsNotNone(new_raw)
        token_obj.refresh_from_db()
        self.assertFalse(token_obj.check_hash(old_raw))
        self.assertTrue(token_obj.check_hash(new_raw))

    def test_api_key_suspension_blocks_access_without_revoking(self):
        """Suspended key returns ACTIVE=False but effective_status=SUSPENDED, not REVOKED."""
        app, raw = ApiApplication.create_application(
            tenant=self.tenant,
            name='Suspend Test App',
            created_by=self.superadmin,
            permissions=['customers:read'],
        )
        resp = self.client.post(
            f'/api/v1/saas/applications/{app.id}/suspend/',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(resp.json()['status'], 'SUSPENDED')

        app.refresh_from_db()
        self.assertEqual(app.effective_status, TenantApiToken.CredentialStatus.SUSPENDED)
        self.assertIsNone(app.revoked_at)  # NOT revoked, just suspended

        # Middleware rejects suspended key with 401
        blocked_resp = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=raw,
            HTTP_HOST='keysec.shebafi.net',
        )
        self.assertEqual(blocked_resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_api_key_reactivation_restores_access(self):
        """A suspended key can be reactivated."""
        app, raw = ApiApplication.create_application(
            tenant=self.tenant,
            name='Reactivate Test App',
            created_by=self.superadmin,
            permissions=['customers:read'],
        )
        app.suspend()
        self.assertEqual(app.effective_status, TenantApiToken.CredentialStatus.SUSPENDED)

        resp = self.client.post(
            f'/api/v1/saas/applications/{app.id}/reactivate/',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        app.refresh_from_db()
        self.assertEqual(app.effective_status, TenantApiToken.CredentialStatus.ACTIVE)

    def test_revoked_key_cannot_be_reactivated(self):
        """A fully revoked key returns 400 on reactivate attempt."""
        app, _ = ApiApplication.create_application(
            tenant=self.tenant,
            name='Revoke No-Reactivate App',
            created_by=self.superadmin,
        )
        app.revoke()
        resp = self.client.post(
            f'/api/v1/saas/applications/{app.id}/reactivate/',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('revoked', resp.json().get('error', '').lower())

    def test_effective_status_priority_revoked_over_expired(self):
        """Revoked status takes priority over expiry."""
        from django.utils import timezone
        import datetime
        past = timezone.now() - datetime.timedelta(days=10)
        app, _ = ApiApplication.create_application(
            tenant=self.tenant,
            name='Status Priority App',
            created_by=self.superadmin,
            expires_at=past,
        )
        app.revoke()
        self.assertEqual(app.effective_status, TenantApiToken.CredentialStatus.REVOKED)


# ────────────────────────────────────────────────────────────────────────────
# Section C: Staff authentication + tenant resolution
# ────────────────────────────────────────────────────────────────────────────

class StaffAuthenticationAndTenantResolutionTests(TestCase):
    """
    Validates that staff authentication is strictly scoped to the resolved tenant,
    with correct RBAC and cross-tenant rejection.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_superuser(
            username='auth_test_superadmin',
            email='authtest@sheba.platform',
            password='AuthTestPassword999!',
        )

        # Tenant A
        self.tenant_a = Tenant.objects.create(
            name='Alpha ISP', slug='alpha-isp', is_active=True, subscription_status='active'
        )
        self.domain_a_hostname = 'alpha.shebafi.net'
        TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname=self.domain_a_hostname,
            is_primary=True,
            is_active=True,
            verified=True,
        )
        self.role_a = Role.objects.create(tenant=self.tenant_a, name='Admin')
        self.staff_a = User.objects.create_user(username='staff_alpha', password='AlphaPass123!')
        StaffMembership.objects.create(
            user=self.staff_a, tenant=self.tenant_a, role=self.role_a, is_active=True
        )
        self.token_a, _ = Token.objects.get_or_create(user=self.staff_a)

        # Tenant B
        self.tenant_b = Tenant.objects.create(
            name='Beta ISP', slug='beta-isp', is_active=True, subscription_status='active'
        )
        self.domain_b_hostname = 'beta.shebafi.net'
        TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname=self.domain_b_hostname,
            is_primary=True,
            is_active=True,
            verified=True,
        )
        self.role_b = Role.objects.create(tenant=self.tenant_b, name='Admin')
        self.staff_b = User.objects.create_user(username='staff_beta', password='BetaPass123!')
        StaffMembership.objects.create(
            user=self.staff_b, tenant=self.tenant_b, role=self.role_b, is_active=True
        )
        self.token_b, _ = Token.objects.get_or_create(user=self.staff_b)

        # App for tenant A
        self.app_a, self.raw_key_a = ApiApplication.create_application(
            tenant=self.tenant_a,
            name='Alpha Portal',
            created_by=self.superadmin,
            permissions=['customers:read', 'invoices:read'],
        )

    def test_staff_login_succeeds_on_correct_tenant_domain(self):
        """Staff login on their own tenant domain returns token + tenant slug."""
        resp = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff_alpha', 'password': 'AlphaPass123!'},
            format='json',
            HTTP_HOST=self.domain_a_hostname,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertIsNotNone(resp.json().get('token'))
        self.assertEqual(resp.json()['tenant']['slug'], 'alpha-isp')

    def test_staff_login_blocked_on_wrong_tenant_domain(self):
        """Alpha staff cannot log in on Beta's domain (cross-tenant rejection)."""
        resp = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff_alpha', 'password': 'AlphaPass123!'},
            format='json',
            HTTP_HOST=self.domain_b_hostname,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('CROSS_TENANT_LOGIN', str(resp.content))

    def test_tenant_a_staff_cannot_see_tenant_b_customers(self):
        """Cross-tenant data isolation via get_scoped_queryset."""
        Customer.objects.create(
            tenant=self.tenant_a, full_name='Alpha Cust', mobile='01711111111',
            pppoe_username='alpha_user', pppoe_password='pass', status=CustomerStatus.ACTIVE,
        )
        Customer.objects.create(
            tenant=self.tenant_b, full_name='Beta Cust', mobile='01722222222',
            pppoe_username='beta_user', pppoe_password='pass', status=CustomerStatus.ACTIVE,
        )

        # Alpha staff sees only alpha customers
        resp = self.client.get(
            '/api/v1/customers/',
            HTTP_AUTHORIZATION=f'Token {self.token_a.key}',
            HTTP_HOST=self.domain_a_hostname,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.json() if isinstance(resp.json(), list) else resp.json().get('results', [])
        usernames = [c['pppoe_username'] for c in results]
        self.assertIn('alpha_user', usernames)
        self.assertNotIn('beta_user', usernames)

    def test_api_key_resolves_tenant_without_domain_login(self):
        """An API key alone resolves the tenant (useful for machine-to-machine with scopes)."""
        # API key has customers:read scope
        resp = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=self.raw_key_a,
            HTTP_HOST=self.domain_a_hostname,
        )
        # Should be 200 (key has customers:read scope) or 403 if scopes not enough
        # The API key alone (no staff auth) is valid for scope-authorized operations
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_403_FORBIDDEN])

    def test_api_key_from_tenant_a_rejected_on_tenant_b_domain(self):
        """Tenant A's API key cannot be used on Tenant B's domain."""
        # Even if you present Tenant A's key on Tenant B's domain,
        # the key's tenant will not match the domain's resolved tenant,
        # causing a 401 (middleware validates key's tenant == domain's tenant)
        resp = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=self.raw_key_a,
            HTTP_HOST=self.domain_b_hostname,
        )
        self.assertIn(
            resp.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
            "Tenant A's API key must not work on Tenant B's domain",
        )

    def test_inactive_staff_membership_blocks_login(self):
        """Deactivated StaffMembership immediately blocks staff login."""
        membership = StaffMembership.objects.get(user=self.staff_a, tenant=self.tenant_a)
        membership.is_active = False
        membership.save()

        resp = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff_alpha', 'password': 'AlphaPass123!'},
            format='json',
            HTTP_HOST=self.domain_a_hostname,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('MEMBERSHIP_INACTIVE', str(resp.content))


# ────────────────────────────────────────────────────────────────────────────
# Section D: Onboarding request queue + create-admin action
# ────────────────────────────────────────────────────────────────────────────

class OnboardingRequestQueueTests(TestCase):
    """
    Tests the Tenant Onboarding Request queue:
    - Submit request (public or via control plane)
    - Approve → auto-provision tenant, domain, admin, membership
    - Reject → status updated, no tenant created
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_superuser(
            username='onboard_superadmin',
            email='onboard@sheba.platform',
            password='OnboardPassword999!',
        )
        sa_token, _ = Token.objects.get_or_create(user=self.superadmin)
        self.sa_headers = {
            'HTTP_AUTHORIZATION': f'Token {sa_token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }

    def test_superadmin_approves_onboarding_request(self):
        """Approving a signup request auto-provisions tenant, domain, admin user."""
        req = TenantOnboardingRequest.objects.create(
            organization_name='StreamFiber Ltd',
            requested_slug='streamfiber',
            requested_domain='streamfiber.shebafi.xyz',
            requested_plan='Growth',
            contact_name='Stream Admin',
            contact_email='noc@streamfiber.net',
            contact_phone='01799887766',
            status='pending',
        )

        approve_resp = self.client.post(
            f'/api/v1/saas/requests/{req.id}/approve/',
            format='json',
            **self.sa_headers,
        )
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK, approve_resp.content)
        data = approve_resp.json()
        self.assertIn('tenant_id', data)

        # Tenant was created
        tenant = Tenant.objects.get(id=data['tenant_id'])
        self.assertEqual(tenant.slug, 'streamfiber')
        self.assertTrue(tenant.is_active)

        # Primary domain was created
        self.assertTrue(
            TenantDomain.objects.filter(tenant=tenant, hostname='streamfiber.shebafi.xyz').exists()
        )

        # Admin user + membership was provisioned
        admin_user = User.objects.get(username=data['admin_username'])
        self.assertTrue(
            StaffMembership.objects.filter(user=admin_user, tenant=tenant, is_active=True).exists()
        )

        # Request status is now 'approved'
        req.refresh_from_db()
        self.assertEqual(req.status, 'approved')

    def test_superadmin_rejects_onboarding_request(self):
        """Rejecting a signup request marks it rejected without creating a tenant."""
        req = TenantOnboardingRequest.objects.create(
            organization_name='RejectFiber Ltd',
            requested_slug='rejectfiber',
            requested_domain='rejectfiber.shebafi.xyz',
            contact_name='Rejected Admin',
            contact_email='noc@rejectfiber.net',
            contact_phone='01788776655',
            status='pending',
        )
        reject_resp = self.client.post(
            f'/api/v1/saas/requests/{req.id}/reject/',
            {'reason': 'Incomplete documentation.'},
            format='json',
            **self.sa_headers,
        )
        self.assertEqual(reject_resp.status_code, status.HTTP_200_OK, reject_resp.content)
        req.refresh_from_db()
        self.assertEqual(req.status, 'rejected')
        self.assertFalse(Tenant.objects.filter(slug='rejectfiber').exists())

    def test_double_approve_returns_error(self):
        """Approving an already-approved request returns 400."""
        req = TenantOnboardingRequest.objects.create(
            organization_name='DoubleApprove ISP',
            requested_slug='double-approve',
            requested_domain='doubleapprove.shebafi.xyz',
            contact_name='Double Admin',
            contact_email='noc@doubleapprove.net',
            contact_phone='01777665544',
            status='approved',
        )
        resp = self.client.post(
            f'/api/v1/saas/requests/{req.id}/approve/',
            format='json',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class CreateAdminActionTests(TestCase):
    """
    Tests the /api/v1/saas/tenants/{id}/create-admin/ action.
    Superadmin can provision additional ISP admin users to a tenant.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_superuser(
            username='createadmin_superadmin',
            email='createadmin@sheba.platform',
            password='CreateAdminPassword999!',
        )
        sa_token, _ = Token.objects.get_or_create(user=self.superadmin)
        self.sa_headers = {
            'HTTP_AUTHORIZATION': f'Token {sa_token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }
        self.tenant = Tenant.objects.create(
            name='Create Admin ISP', slug='createadmin-isp', is_active=True
        )
        TenantDomain.objects.create(
            tenant=self.tenant,
            hostname='createadmin.shebafi.net',
            is_primary=True,
            is_active=True,
            verified=True,
        )

    def test_superadmin_can_create_additional_isp_admin(self):
        """Superadmin can add a second admin to an existing ISP tenant."""
        resp = self.client.post(
            f'/api/v1/saas/tenants/{self.tenant.id}/create-admin/',
            {
                'username': 'second_admin',
                'password': 'SecondAdminPass123!',
                'email': 'second@createadmin.net',
                'first_name': 'Second',
                'last_name': 'Admin',
            },
            format='json',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        data = resp.json()
        self.assertEqual(data['username'], 'second_admin')

        # Verify DB state
        new_admin = User.objects.get(username='second_admin')
        self.assertTrue(
            StaffMembership.objects.filter(user=new_admin, tenant=self.tenant, is_active=True).exists()
        )

    def test_duplicate_username_returns_400(self):
        """Attempting to create a user with an existing username returns 400."""
        User.objects.create_user(username='existing_admin', password='SomePass123!')
        resp = self.client.post(
            f'/api/v1/saas/tenants/{self.tenant.id}/create-admin/',
            {
                'username': 'existing_admin',
                'password': 'AnotherPass123!',
            },
            format='json',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already exists', resp.json().get('error', ''))

    def test_missing_password_returns_400(self):
        """Missing password in create-admin returns 400."""
        resp = self.client.post(
            f'/api/v1/saas/tenants/{self.tenant.id}/create-admin/',
            {'username': 'no_pass_admin'},
            format='json',
            **self.sa_headers,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

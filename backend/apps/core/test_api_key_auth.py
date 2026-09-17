import datetime
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, TenantDomain, TenantApiToken, AuditLog
from apps.customers.models import Customer
from apps.authentication.models import UserRole, StaffMembership, Role, Permission

User = get_user_model()


class ApiKeyAuthenticationAndScopeTests(TestCase):
    """
    Comprehensive test suite verifying API key authentication, lifecycle enforcement,
    granular permission scopes, tenant isolation, and Super Admin credential management.
    """

    def setUp(self):
        # 1. Setup Tenant A (Alpha)
        self.tenant_a = Tenant.objects.create(
            name="Alpha Telecom",
            slug="alpha",
            domain="alpha.shebafi.test",
            is_active=True,
        )
        self.domain_a = TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname="alpha.shebafi.test",
            is_active=True,
            is_primary=True,
        )
        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            full_name="Alice Customer",
            pppoe_username="alice_alpha",
            pppoe_password="password123",
            mobile="01711111111",
            status="Active",
        )

        # 2. Setup Tenant B (Beta)
        self.tenant_b = Tenant.objects.create(
            name="Beta Net",
            slug="beta",
            domain="beta.shebafi.test",
            is_active=True,
        )
        self.domain_b = TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname="beta.shebafi.test",
            is_active=True,
            is_primary=True,
        )
        self.customer_b = Customer.objects.create(
            tenant=self.tenant_b,
            full_name="Bob Customer",
            pppoe_username="bob_beta",
            pppoe_password="password123",
            mobile="01722222222",
            status="Active",
        )

        # 3. Setup Super Admin
        self.super_admin = User.objects.create_superuser(
            username="superadmin",
            email="admin@sheba.test",
            password="StrongAdminPassword123!",
        )
        self.admin_token, _ = Token.objects.get_or_create(user=self.super_admin)

        # 4. Generate API Key for Tenant A
        self.token_a, self.raw_secret_a = TenantApiToken.generate(
            tenant=self.tenant_a,
            name="Alpha Mobile App BFF",
            permissions=["customers:read", "billing:read"],
            created_by=self.super_admin,
            rate_limit=500,
        )

        self.client = APIClient()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. API KEY AUTHENTICATION & HEADERS
    # ─────────────────────────────────────────────────────────────────────────
    def test_01_authenticated_via_x_api_key(self):
        """API client can authenticate via X-API-Key header."""
        response = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=self.raw_secret_a,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should return Tenant A customer only
        data = response.json()
        results = data if isinstance(data, list) else data.get('results', [])
        usernames = [c['pppoe_username'] for c in results]
        self.assertIn("alice_alpha", usernames)
        self.assertNotIn("bob_beta", usernames)

    def test_02_authenticated_via_authorization_api_key(self):
        """API client can authenticate via Authorization: Api-Key header."""
        response = self.client.get(
            '/api/v1/customers/',
            HTTP_AUTHORIZATION=f"Api-Key {self.raw_secret_a}",
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        results = data if isinstance(data, list) else data.get('results', [])
        usernames = [c['pppoe_username'] for c in results]
        self.assertIn("alice_alpha", usernames)

    def test_03_invalid_api_key_rejected(self):
        """Invalid or corrupted API keys are rejected with 401."""
        response = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY="shb_invalid_key_that_does_not_exist",
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_04_revoked_api_key_rejected(self):
        """Revoked credentials immediately fail authentication."""
        self.token_a.revoke()
        response = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=self.raw_secret_a,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("revoked", str(response.content))

    def test_05_expired_api_key_rejected(self):
        """Expired credentials fail authentication."""
        self.token_a.expires_at = timezone.now() - datetime.timedelta(days=1)
        self.token_a.save()

        response = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=self.raw_secret_a,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("expired", str(response.content))

    def test_06_suspended_api_key_rejected(self):
        """Suspended credentials fail authentication."""
        self.token_a.suspend()

        response = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=self.raw_secret_a,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("suspended", str(response.content))

    # ─────────────────────────────────────────────────────────────────────────
    # 2. TENANT ISOLATION
    # ─────────────────────────────────────────────────────────────────────────
    def test_07_strict_cross_tenant_isolation(self):
        """Credential for Tenant A cannot read or modify Tenant B resources."""
        # Querying specific customer of Tenant B with Tenant A's key
        response = self.client.get(
            f'/api/v1/customers/{self.customer_b.id}/',
            HTTP_X_API_KEY=self.raw_secret_a,
            HTTP_HOST='api.shebafi.test',
        )
        # Must return 404 Not Found (tenant scoped filter returns none)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. GRANULAR PERMISSION SCOPES
    # ─────────────────────────────────────────────────────────────────────────
    def test_08_scope_permission_checks(self):
        """API key with customers:read can read but is rejected when writing without customers:write."""
        # 1. Read is permitted
        read_resp = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=self.raw_secret_a,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(read_resp.status_code, status.HTTP_200_OK)

        # 2. Write (POST) is rejected because token_a only has ['customers:read', 'billing:read']
        write_resp = self.client.post(
            '/api/v1/customers/',
            {
                "full_name": "Intruder",
                "pppoe_username": "intruder_user",
                "pppoe_password": "password123",
                "mobile": "01799999999",
            },
            format='json',
            HTTP_X_API_KEY=self.raw_secret_a,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(write_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("customers:write", str(write_resp.content))

    def test_09_wildcard_scope_allows_all(self):
        """API key with '*' wildcard scope can read and write."""
        wildcard_token, wildcard_secret = TenantApiToken.generate(
            tenant=self.tenant_a,
            name="Full Access Key",
            permissions=["*"],
            created_by=self.super_admin,
        )
        read_resp = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=wildcard_secret,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(read_resp.status_code, status.HTTP_200_OK)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. SUPER ADMIN ENDPOINTS BLOCK API KEYS
    # ─────────────────────────────────────────────────────────────────────────
    def test_10_api_key_cannot_access_saas_control_plane(self):
        """API keys are unconditionally blocked from accessing /api/v1/saas/* endpoints."""
        response = self.client.get(
            '/api/v1/saas/tenants/',
            HTTP_X_API_KEY=self.raw_secret_a,
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. SUPER ADMIN API CREDENTIAL MANAGEMENT CRUD
    # ─────────────────────────────────────────────────────────────────────────
    def test_11_super_admin_manage_api_credentials(self):
        """Super Admin can generate, list, rotate, suspend, and revoke ISP credentials."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')

        # 1. List credentials
        list_resp = self.client.get('/api/v1/saas/api-credentials/', HTTP_HOST='admin.shebafi.test')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        keys = list_resp.json()
        results = keys if isinstance(keys, list) else keys.get('results', [])
        self.assertTrue(len(results) >= 1)

        # Verify secret_key is NOT exposed in list response
        for item in results:
            self.assertNotIn('secret_key', item)
            self.assertIn('key_prefix', item)

        # 2. Create new credential for Tenant B
        create_resp = self.client.post(
            '/api/v1/saas/api-credentials/',
            {
                "tenant": str(self.tenant_b.id),
                "name": "Beta Web Portal BFF",
                "permissions": ["customers:read", "customers:write", "billing:read"],
                "rate_limit": 2000,
            },
            format='json',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        created_data = create_resp.json()
        new_secret = created_data.get('secret_key')
        self.assertIsNotNone(new_secret)
        self.assertTrue(new_secret.startswith("shb_") or len(new_secret) > 20)
        new_token_id = created_data['id']

        # Verify audit log was created
        audit_exists = AuditLog.objects.filter(
            action='api_credential_created',
            resource_id=new_token_id
        ).exists()
        self.assertTrue(audit_exists)

        # 3. Rotate credential
        rotate_resp = self.client.post(
            f'/api/v1/saas/api-credentials/{new_token_id}/rotate/',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(rotate_resp.status_code, status.HTTP_200_OK)
        rotated_data = rotate_resp.json()
        rotated_secret = rotated_data.get('secret_key')
        self.assertIsNotNone(rotated_secret)
        self.assertNotEqual(new_secret, rotated_secret)

        # Old secret fails, new rotated secret succeeds
        self.client.credentials()  # clear super admin token
        old_call = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=new_secret,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(old_call.status_code, status.HTTP_401_UNAUTHORIZED)

        new_call = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=rotated_secret,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(new_call.status_code, status.HTTP_200_OK)

        # 4. Suspend credential
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')
        suspend_resp = self.client.post(
            f'/api/v1/saas/api-credentials/{new_token_id}/suspend/',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(suspend_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(suspend_resp.json()['status'], 'SUSPENDED')

        # 5. Reactivate credential
        reactivate_resp = self.client.post(
            f'/api/v1/saas/api-credentials/{new_token_id}/reactivate/',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(reactivate_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(reactivate_resp.json()['status'], 'ACTIVE')

        # 6. Revoke credential
        revoke_resp = self.client.post(
            f'/api/v1/saas/api-credentials/{new_token_id}/revoke/',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(revoke_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(revoke_resp.json()['status'], 'REVOKED')

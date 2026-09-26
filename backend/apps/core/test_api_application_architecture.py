"""
Test Suite: Secure API Application + API Key Architecture.

Verifies the end-to-end architecture and security invariants:
    Central Control Plane
            │
            ▼
        ISP/Tenant
            │
            ▼
    External ISP Frontend (Next.js / Mobile)
            │
            ▼
       Django /api/v1/

Invariants Verified:
1. API key identifies frontend application and binds tenant context.
2. API key MUST NOT bypass staff authentication (application key alone cannot access staff resources).
3. API key MUST NOT bypass RBAC (staff user permissions and roles enforced).
4. API key MUST NOT bypass object permissions (cannot access other tenants' objects).
5. API key MUST NOT select arbitrary tenant_id (derived strictly from cryptographic match).
6. API key MUST NOT access another tenant (cross-tenant staff tokens rejected with CROSS_TENANT_APPLICATION_ACCESS).
7. API key MUST NOT become a superadmin credential (strictly blocked from /api/v1/saas/*).
8. Full 8-step lifecycle flow:
    - ISP creation
    - Application registration
    - One-time secret display
    - Login via application context
    - Tenant derivation
    - Dual-token protected calls
    - Key rotation, suspension, reactivation, revocation
    - Comprehensive audit logging
"""

import datetime
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, TenantDomain, ApiApplication, TenantApiToken, AuditLog
from apps.customers.models import Customer
from apps.authentication.models import UserRole, StaffMembership, Role, Permission

User = get_user_model()


class ApiApplicationArchitectureTests(TestCase):
    """
    End-to-End architectural verification for External ISP Frontend Applications
    and Dual-Token Authentication.
    """

    def setUp(self):
        # 1. Superadmin (Central Control Plane)
        self.superadmin = User.objects.create_superuser(
            username="central_superadmin",
            email="superadmin@shebafi.test",
            password="SuperPassword123!",
        )
        self.superadmin_token, _ = Token.objects.get_or_create(user=self.superadmin)

        # 2. Tenant Alpha (ISP A)
        self.tenant_alpha = Tenant.objects.create(
            name="Alpha Broadband",
            slug="alpha",
            domain="alpha.shebafi.test",
            is_active=True,
        )
        self.domain_alpha = TenantDomain.objects.create(
            tenant=self.tenant_alpha,
            hostname="alpha.shebafi.test",
            is_active=True,
            is_primary=True,
        )

        # 3. Tenant Beta (ISP B)
        self.tenant_beta = Tenant.objects.create(
            name="Beta Fiber",
            slug="beta",
            domain="beta.shebafi.test",
            is_active=True,
        )
        self.domain_beta = TenantDomain.objects.create(
            tenant=self.tenant_beta,
            hostname="beta.shebafi.test",
            is_active=True,
            is_primary=True,
        )

        # 4. Roles for Tenant Alpha
        self.role_admin_alpha = Role.objects.create(
            tenant=self.tenant_alpha,
            name="Admin",
            description="Full ISP Administrator",
        )
        self.perm_cust_view, _ = Permission.objects.get_or_create(
            codename="customer.view",
            defaults={"name": "View Customers", "module": "customers"},
        )
        self.perm_cust_create, _ = Permission.objects.get_or_create(
            codename="customer.create",
            defaults={"name": "Create Customers", "module": "customers"},
        )
        self.perm_staff_manage, _ = Permission.objects.get_or_create(
            codename="staff.manage",
            defaults={"name": "Manage Staff", "module": "staff"},
        )
        self.role_admin_alpha.permissions.add(self.perm_cust_view, self.perm_cust_create, self.perm_staff_manage)

        self.role_operator_alpha = Role.objects.create(
            tenant=self.tenant_alpha,
            name="Operator",
            description="Read-only Operator",
        )
        self.role_operator_alpha.permissions.add(self.perm_cust_view)

        # 5. Staff Users in Tenant Alpha
        self.staff_admin_alpha = User.objects.create_user(
            username="alice_admin",
            email="alice@alpha.test",
            password="AlicePassword123!",
        )
        self.membership_admin_alpha = StaffMembership.objects.create(
            user=self.staff_admin_alpha,
            tenant=self.tenant_alpha,
            role=self.role_admin_alpha,
            is_active=True,
        )
        self.token_admin_alpha, _ = Token.objects.get_or_create(user=self.staff_admin_alpha)

        self.staff_op_alpha = User.objects.create_user(
            username="arthur_op",
            email="arthur@alpha.test",
            password="ArthurPassword123!",
        )
        self.membership_op_alpha = StaffMembership.objects.create(
            user=self.staff_op_alpha,
            tenant=self.tenant_alpha,
            role=self.role_operator_alpha,
            is_active=True,
        )
        self.token_op_alpha, _ = Token.objects.get_or_create(user=self.staff_op_alpha)

        # 6. Staff User in Tenant Beta (Cross-tenant user)
        self.role_admin_beta = Role.objects.create(
            tenant=self.tenant_beta,
            name="Admin",
            description="Beta Administrator",
        )
        self.staff_beta = User.objects.create_user(
            username="bob_beta_staff",
            email="bob@beta.test",
            password="BobPassword123!",
        )
        self.membership_beta = StaffMembership.objects.create(
            user=self.staff_beta,
            tenant=self.tenant_beta,
            role=self.role_admin_beta,
            is_active=True,
        )
        self.token_beta, _ = Token.objects.get_or_create(user=self.staff_beta)

        # 7. Customer Data
        self.customer_alpha = Customer.objects.create(
            tenant=self.tenant_alpha,
            full_name="Alpha Customer 1",
            pppoe_username="alpha_user_01",
            pppoe_password="pppoepassword1",
            mobile="01710000001",
            status="Active",
        )
        self.customer_beta = Customer.objects.create(
            tenant=self.tenant_beta,
            full_name="Beta Customer 1",
            pppoe_username="beta_user_01",
            pppoe_password="pppoepassword2",
            mobile="01720000002",
            status="Active",
        )

        self.client = APIClient()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. 8-STEP LIFECYCLE FLOW
    # ─────────────────────────────────────────────────────────────────────────
    def test_complete_8_step_architecture_flow(self):
        """
        Validates the authoritative 8-step flow:
        1. Superadmin creates ISP (self.tenant_alpha).
        2. Superadmin creates application via POST /api/v1/saas/applications/.
        3. System generates API key, stores SHA-256 hash.
        4. Secret is shown once in response.
        5. External frontend stores API URL + key.
        6. Staff user authenticates normally via POST /api/v1/auth/login/.
        7. Django derives tenant from trusted application context.
        8. Normal RBAC / object permissions apply with dual-token calls.
        """
        # Step 2: Superadmin creates application for Alpha
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.superadmin_token.key}')
        app_resp = self.client.post(
            '/api/v1/saas/applications/',
            {
                "tenant": str(self.tenant_alpha.id),
                "name": "Alpha NextJS Web Portal",
                "permissions": [],  # Frontend application has no machine scopes; requires staff login
                "rate_limit": 1000,
            },
            format='json',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(app_resp.status_code, status.HTTP_201_CREATED)
        app_data = app_resp.json()

        # Step 3 & 4: System generated key; secret is shown ONCE
        raw_app_secret = app_data.get('secret_key')
        self.assertIsNotNone(raw_app_secret)
        self.assertTrue(len(raw_app_secret) > 20)
        app_id = app_data['id']

        # Ensure subsequent retrieval DOES NOT return the raw secret
        get_app_resp = self.client.get(
            f'/api/v1/saas/applications/{app_id}/',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(get_app_resp.status_code, status.HTTP_200_OK)
        self.assertNotIn('secret_key', get_app_resp.json())
        self.assertEqual(get_app_resp.json()['key_prefix'], app_data['key_prefix'])

        # Verify DB stores hash, never plaintext
        db_app = ApiApplication.objects.get(id=app_id)
        self.assertNotEqual(db_app.token_hash, raw_app_secret)
        self.assertTrue(db_app.check_hash(raw_app_secret))

        # Clear superadmin credentials
        self.client.credentials()

        # Step 5 & 6: External frontend uses API key to authenticate staff user
        login_resp = self.client.post(
            '/api/v1/auth/login/',
            {
                "username": "alice_admin",
                "password": "AlicePassword123!",
            },
            format='json',
            HTTP_X_API_KEY=raw_app_secret,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(login_resp.status_code, status.HTTP_200_OK)
        login_data = login_resp.json()
        staff_token = login_data.get('token')
        self.assertIsNotNone(staff_token)

        # Step 7: Django derived tenant from trusted application context
        self.assertEqual(login_data['tenant']['slug'], 'alpha')
        self.assertEqual(login_data['tenant']['id'], str(self.tenant_alpha.id))

        # Step 8: Normal RBAC and object permissions apply
        # Call customer list with dual tokens: X-API-Key + Authorization: Token
        customers_resp = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=raw_app_secret,
            HTTP_AUTHORIZATION=f'Token {staff_token}',
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(customers_resp.status_code, status.HTTP_200_OK)
        cust_list = customers_resp.json()
        results = cust_list if isinstance(cust_list, list) else cust_list.get('results', [])
        usernames = [c['pppoe_username'] for c in results]
        self.assertIn("alpha_user_01", usernames)
        self.assertNotIn("beta_user_01", usernames)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. INVARIANT: APPLICATION KEY ALONE CANNOT BYPASS STAFF AUTHENTICATION
    # ─────────────────────────────────────────────────────────────────────────
    def test_api_key_alone_cannot_bypass_staff_authentication(self):
        """
        An API key with permissions=[] identifies the frontend application.
        It MUST NOT allow unauthenticated access to staff-protected endpoints.
        """
        app, raw_secret = ApiApplication.create_application(
            tenant=self.tenant_alpha,
            name="Alpha Mobile App",
            permissions=[],  # Empty machine scopes
            created_by=self.superadmin,
        )

        # Calling customer endpoint with application API key alone (no staff token)
        response = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=raw_secret,
            HTTP_HOST='api.shebafi.test',
        )
        # Must be rejected with 403 Forbidden
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. INVARIANT: CROSS-TENANT STAFF ACCESS REJECTION
    # ─────────────────────────────────────────────────────────────────────────
    def test_cross_tenant_staff_token_rejected_on_application(self):
        """
        A staff user from Tenant Beta cannot use their token through Tenant Alpha's
        application key. Must be rejected with CROSS_TENANT_APPLICATION_ACCESS.
        """
        app_alpha, raw_secret_alpha = ApiApplication.create_application(
            tenant=self.tenant_alpha,
            name="Alpha Portal",
            created_by=self.superadmin,
        )

        response = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_AUTHORIZATION=f'Token {self.token_beta.key}',
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("CROSS_TENANT_APPLICATION_ACCESS", str(response.content))

    def test_cross_tenant_login_rejected_via_application(self):
        """
        A staff user belonging only to Tenant Beta cannot log in via Tenant Alpha's
        application key context.
        """
        app_alpha, raw_secret_alpha = ApiApplication.create_application(
            tenant=self.tenant_alpha,
            name="Alpha Portal",
            created_by=self.superadmin,
        )

        response = self.client.post(
            '/api/v1/auth/login/',
            {
                "username": "bob_beta_staff",
                "password": "BobPassword123!",
            },
            format='json',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("CROSS_TENANT_LOGIN", str(response.content))

    # ─────────────────────────────────────────────────────────────────────────
    # 4. INVARIANT: RBAC & OBJECT PERMISSIONS ENFORCEMENT
    # ─────────────────────────────────────────────────────────────────────────
    def test_rbac_strictly_enforced_through_application(self):
        """
        Staff user with read-only operator role can read customers but is blocked
        from creating customers or accessing staff management endpoints.
        """
        app_alpha, raw_secret_alpha = ApiApplication.create_application(
            tenant=self.tenant_alpha,
            name="Alpha Portal",
            created_by=self.superadmin,
        )

        # Arthur Operator reads customers -> Allowed
        read_resp = self.client.get(
            '/api/v1/customers/',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_AUTHORIZATION=f'Token {self.token_op_alpha.key}',
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(read_resp.status_code, status.HTTP_200_OK)

        # Arthur Operator tries to create customer -> Forbidden by RBAC
        write_resp = self.client.post(
            '/api/v1/customers/',
            {
                "customer_code": "CUST-UNAUTH-01",
                "full_name": "Unauthorized Customer",
                "pppoe_username": "unauthorized_user",
                "pppoe_password": "password123",
                "mobile": "01788888888",
            },
            format='json',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_AUTHORIZATION=f'Token {self.token_op_alpha.key}',
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(write_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Arthur Operator tries to access admin settings -> Forbidden by RBAC
        settings_resp = self.client.get(
            '/api/v1/settings/',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_AUTHORIZATION=f'Token {self.token_op_alpha.key}',
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(settings_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_object_permissions_strictly_enforced_through_application(self):
        """
        Staff user in Tenant Alpha cannot access Tenant Beta objects through the application.
        """
        app_alpha, raw_secret_alpha = ApiApplication.create_application(
            tenant=self.tenant_alpha,
            name="Alpha Portal",
            created_by=self.superadmin,
        )

        # Access Beta's customer
        response = self.client.get(
            f'/api/v1/customers/{self.customer_beta.id}/',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_AUTHORIZATION=f'Token {self.token_admin_alpha.key}',
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. INVARIANT: CANNOT SELECT ARBITRARY TENANT ID
    # ─────────────────────────────────────────────────────────────────────────
    def test_cannot_override_or_spoof_tenant_id(self):
        """
        Passing tenant_id in query params or request body does NOT redirect the operation
        to another tenant. The derived tenant is strictly the application's bound tenant.
        """
        app_alpha, raw_secret_alpha = ApiApplication.create_application(
            tenant=self.tenant_alpha,
            name="Alpha Portal",
            created_by=self.superadmin,
        )

        # Attempt to create customer specifying tenant_id of Beta
        create_resp = self.client.post(
            f'/api/v1/customers/?tenant={self.tenant_beta.id}',
            {
                "customer_code": "CUST-SPOOF-01",
                "full_name": "Spoofed Customer",
                "pppoe_username": "spoofed_user",
                "pppoe_password": "password123",
                "mobile": "01733333333",
                "tenant": str(self.tenant_beta.id),
                "tenant_id": str(self.tenant_beta.id),
            },
            format='json',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_AUTHORIZATION=f'Token {self.token_admin_alpha.key}',
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        created_cust = Customer.objects.get(pppoe_username="spoofed_user")
        # MUST belong to Tenant Alpha, NOT Tenant Beta!
        self.assertEqual(created_cust.tenant_id, self.tenant_alpha.id)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. INVARIANT: APPLICATION KEY CANNOT BECOME SUPERADMIN CREDENTIAL
    # ─────────────────────────────────────────────────────────────────────────
    def test_application_key_cannot_access_control_plane(self):
        """
        Application API keys are unconditionally forbidden from SaaS Control Plane /api/v1/saas/*.
        """
        app_alpha, raw_secret_alpha = ApiApplication.create_application(
            tenant=self.tenant_alpha,
            name="Alpha Portal",
            created_by=self.superadmin,
        )

        # 1. API key alone
        resp1 = self.client.get(
            '/api/v1/saas/tenants/',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(resp1.status_code, status.HTTP_403_FORBIDDEN)

        # 2. API key + staff token
        resp2 = self.client.get(
            '/api/v1/saas/tenants/',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_AUTHORIZATION=f'Token {self.token_admin_alpha.key}',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)

        # 3. API key + superadmin token
        resp3 = self.client.get(
            '/api/v1/saas/tenants/',
            HTTP_X_API_KEY=raw_secret_alpha,
            HTTP_AUTHORIZATION=f'Token {self.superadmin_token.key}',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(resp3.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. LIFECYCLE MANAGEMENT: ROTATE, SUSPEND, REACTIVATE, REVOKE & AUDIT LOGS
    # ─────────────────────────────────────────────────────────────────────────
    def test_application_lifecycle_and_audit_logging(self):
        """
        Full lifecycle testing via SaaS Control Plane endpoints:
        - Creation & Audit Log
        - Rotation & Audit Log
        - Suspension & Audit Log
        - Reactivation & Audit Log
        - Revocation & Audit Log
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.superadmin_token.key}')

        # 1. Create Application
        create_resp = self.client.post(
            '/api/v1/saas/applications/',
            {
                "tenant": str(self.tenant_alpha.id),
                "name": "Alpha Lifecycle App",
                "rate_limit": 500,
            },
            format='json',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        app_id = create_resp.json()['id']
        key_1 = create_resp.json()['secret_key']

        self.assertTrue(
            AuditLog.objects.filter(
                action='api_application_created',
                resource_id=app_id
            ).exists()
        )

        # 2. Rotate Key
        rotate_resp = self.client.post(
            f'/api/v1/saas/applications/{app_id}/rotate/',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(rotate_resp.status_code, status.HTTP_200_OK)
        key_2 = rotate_resp.json()['secret_key']
        self.assertNotEqual(key_1, key_2)

        self.assertTrue(
            AuditLog.objects.filter(
                action='api_application_rotated',
                resource_id=app_id
            ).exists()
        )

        # Old key immediately fails
        self.client.credentials()
        old_call = self.client.post(
            '/api/v1/auth/login/',
            {"username": "alice_admin", "password": "AlicePassword123!"},
            format='json',
            HTTP_X_API_KEY=key_1,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(old_call.status_code, status.HTTP_401_UNAUTHORIZED)

        # New key succeeds
        new_call = self.client.post(
            '/api/v1/auth/login/',
            {"username": "alice_admin", "password": "AlicePassword123!"},
            format='json',
            HTTP_X_API_KEY=key_2,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(new_call.status_code, status.HTTP_200_OK)

        # 3. Suspend Application
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.superadmin_token.key}')
        suspend_resp = self.client.post(
            f'/api/v1/saas/applications/{app_id}/suspend/',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(suspend_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(suspend_resp.json()['status'], 'SUSPENDED')

        self.assertTrue(
            AuditLog.objects.filter(
                action='api_application_suspended',
                resource_id=app_id
            ).exists()
        )

        # Suspended key fails authentication
        self.client.credentials()
        suspended_call = self.client.post(
            '/api/v1/auth/login/',
            {"username": "alice_admin", "password": "AlicePassword123!"},
            format='json',
            HTTP_X_API_KEY=key_2,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(suspended_call.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("suspended", str(suspended_call.content))

        # 4. Reactivate Application
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.superadmin_token.key}')
        reactivate_resp = self.client.post(
            f'/api/v1/saas/applications/{app_id}/reactivate/',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(reactivate_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(reactivate_resp.json()['status'], 'ACTIVE')

        self.assertTrue(
            AuditLog.objects.filter(
                action='api_application_reactivated',
                resource_id=app_id
            ).exists()
        )

        # Reactivated key succeeds
        self.client.credentials()
        active_call = self.client.post(
            '/api/v1/auth/login/',
            {"username": "alice_admin", "password": "AlicePassword123!"},
            format='json',
            HTTP_X_API_KEY=key_2,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(active_call.status_code, status.HTTP_200_OK)

        # 5. Revoke Application
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.superadmin_token.key}')
        revoke_resp = self.client.post(
            f'/api/v1/saas/applications/{app_id}/revoke/',
            HTTP_HOST='admin.shebafi.test',
        )
        self.assertEqual(revoke_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(revoke_resp.json()['status'], 'REVOKED')

        self.assertTrue(
            AuditLog.objects.filter(
                action='api_application_revoked',
                resource_id=app_id
            ).exists()
        )

        # Revoked key fails authentication permanently
        self.client.credentials()
        revoked_call = self.client.post(
            '/api/v1/auth/login/',
            {"username": "alice_admin", "password": "AlicePassword123!"},
            format='json',
            HTTP_X_API_KEY=key_2,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(revoked_call.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("revoked", str(revoked_call.content))

    def test_expired_application_key_rejected(self):
        """Expired application credentials immediately fail authentication."""
        app, raw_secret = ApiApplication.create_application(
            tenant=self.tenant_alpha,
            name="Alpha Expired App",
            expires_at=timezone.now() - datetime.timedelta(hours=1),
            created_by=self.superadmin,
        )

        response = self.client.post(
            '/api/v1/auth/login/',
            {"username": "alice_admin", "password": "AlicePassword123!"},
            format='json',
            HTTP_X_API_KEY=raw_secret,
            HTTP_HOST='api.shebafi.test',
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("expired", str(response.content))

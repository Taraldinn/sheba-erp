"""
Stage 10 — S10.4: Tenant Isolation Final Gate Test Suite.
Verifies IDOR immunity, cross-tenant read/write/delete rejection,
cross-tenant FK validation, custom actions, header tampering, and API Key isolation.
Follows the same patterns as test_tenant_isolation_stage1.py (TenantDomain + force_authenticate).
"""

from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model

from apps.core.models import Tenant, TenantDomain, TenantApiToken
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.network.models import Router
from apps.authentication.models import StaffMembership, Role

User = get_user_model()


def _make_tenant(name, slug, domain):
    t = Tenant.objects.create(name=name, slug=slug, domain=domain, is_active=True)
    TenantDomain.objects.create(tenant=t, hostname=domain, is_active=True, is_primary=True)
    return t


def _make_staff(tenant, username):
    user = User.objects.create_user(username=username, password="password123")
    role = Role.objects.create(tenant=tenant, name="Admin")
    StaffMembership.objects.create(user=user, tenant=tenant, role=role, is_active=True)
    return user


def _make_package(tenant, name, speed_mbps=10):
    return Package.objects.create(
        tenant=tenant, name=name,
        speed_mbps=speed_mbps,
        regular_price=Decimal("500.00"),
        mikrotik_profile=name.lower().replace(" ", "_"),
    )


def _make_router(tenant, name, ip):
    return Router.objects.create(tenant=tenant, name=name, ip_address=ip, username="admin")


def _make_customer(tenant, full_name, mobile, pppoe_username, package, router):
    return Customer.objects.create(
        tenant=tenant, full_name=full_name, mobile=mobile,
        pppoe_username=pppoe_username, pppoe_password="pass123",
        package=package, router=router, status=CustomerStatus.ACTIVE,
    )


class Stage10TenantIsolationGateTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # ── Tenant A ──────────────────────────────────────────────
        self.tenant_a = _make_tenant("Alpha Telecom", "alpha", "alpha.shebafi.com")
        self.user_a = _make_staff(self.tenant_a, "staff_alpha_s10")
        self.package_a = _make_package(self.tenant_a, "Alpha 10M")
        self.router_a = _make_router(self.tenant_a, "Alpha-Edge-01", "10.0.1.1")
        self.customer_a = _make_customer(
            self.tenant_a, "Alice Alpha", "01711111111",
            "alice_alpha_s10", self.package_a, self.router_a,
        )

        # ── Tenant B ──────────────────────────────────────────────
        self.tenant_b = _make_tenant("Beta Networks", "beta", "beta.shebafi.com")
        self.user_b = _make_staff(self.tenant_b, "staff_beta_s10")
        self.package_b = _make_package(self.tenant_b, "Beta 20M", speed_mbps=20)
        self.router_b = _make_router(self.tenant_b, "Beta-Edge-01", "10.0.2.1")
        self.customer_b = _make_customer(
            self.tenant_b, "Bob Beta", "01822222222",
            "bob_beta_s10", self.package_b, self.router_b,
        )

        # ── API Key for Tenant A ───────────────────────────────────
        self.api_token_a, self.raw_api_key_a = TenantApiToken.generate(
            tenant=self.tenant_a, name="Alpha BFF Key",
            permissions=["*"], created_by=self.user_a,
        )

    # ── 1. Cross-tenant READ ──────────────────────────────────────

    def test_01_cross_tenant_read_denied(self):
        """Tenant A staff cannot read Tenant B's customer via GET."""
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.get(
            f"/api/v1/customers/{self.customer_b.id}/",
            HTTP_HOST="alpha.shebafi.com",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_02_cross_tenant_list_isolation(self):
        """Tenant A list view never includes Tenant B customers."""
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.get("/api/v1/customers/", HTTP_HOST="alpha.shebafi.com")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [str(c["id"]) for c in resp.data.get("results", resp.data)]
        self.assertIn(str(self.customer_a.id), ids)
        self.assertNotIn(str(self.customer_b.id), ids)

    # ── 2. Cross-tenant WRITE ─────────────────────────────────────

    def test_03_cross_tenant_write_denied(self):
        """Tenant A cannot PATCH Tenant B's customer."""
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.patch(
            f"/api/v1/customers/{self.customer_b.id}/",
            {"full_name": "Hacked Bob"}, format="json",
            HTTP_HOST="alpha.shebafi.com",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.customer_b.refresh_from_db()
        self.assertEqual(self.customer_b.full_name, "Bob Beta")

    # ── 3. Cross-tenant DELETE ────────────────────────────────────

    def test_04_cross_tenant_delete_denied(self):
        """Tenant A cannot DELETE Tenant B's customer."""
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.delete(
            f"/api/v1/customers/{self.customer_b.id}/",
            HTTP_HOST="alpha.shebafi.com",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Customer.objects.filter(id=self.customer_b.id).exists())

    # ── 4. Cross-tenant FK assignment rejected ────────────────────

    def test_05_cross_tenant_fk_rejected_by_clean(self):
        """Customer.clean() rejects cross-tenant FK for package."""
        c = Customer(
            tenant=self.tenant_a,
            full_name="Malicious Actor",
            mobile="01999999999",
            pppoe_username="malicious_user_s10",
            pppoe_password="pass",
            package=self.package_b,  # belongs to Tenant B!
            router=self.router_a,
        )
        with self.assertRaises(ValidationError):
            c.full_clean()

    # ── 5. Custom action cross-tenant ─────────────────────────────

    def test_06_cross_tenant_custom_action_denied(self):
        """Recharge action cross-tenant must return 404."""
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.post(
            f"/api/v1/customers/{self.customer_b.id}/recharge/",
            {"months": 1, "payment_method": "cash"}, format="json",
            HTTP_HOST="alpha.shebafi.com",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # ── 6. API Key tenant isolation ───────────────────────────────

    def test_07_api_key_tenant_bound_isolation(self):
        """API Key requests are scoped to the bound tenant only."""
        self.client.credentials(HTTP_X_API_KEY=self.raw_api_key_a)
        resp = self.client.get("/api/v1/customers/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [str(c["id"]) for c in resp.data.get("results", resp.data)]
        self.assertIn(str(self.customer_a.id), ids)
        self.assertNotIn(str(self.customer_b.id), ids)

        # Cross-tenant detail via API key must 404
        resp = self.client.get(f"/api/v1/customers/{self.customer_b.id}/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # ── 7. Client-controlled tenant headers ignored ───────────────

    def test_08_client_tenant_header_tampering_ignored(self):
        """Sending X-Tenant-ID or ?tenant_id= cannot escape sandbox."""
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.get(
            f"/api/v1/customers/?tenant_id={self.tenant_b.id}",
            HTTP_X_TENANT_ID=str(self.tenant_b.id),
            HTTP_HOST="alpha.shebafi.com",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [str(c["id"]) for c in resp.data.get("results", resp.data)]
        self.assertNotIn(str(self.customer_b.id), ids)

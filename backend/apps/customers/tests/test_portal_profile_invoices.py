import json
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice
from apps.network.models import Router, UserSession
from apps.customers.jwt import generate_customer_jwt


class CustomerPortalProfileInvoicesTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenant 1
        self.tenant_1 = Tenant.objects.create(name="Delta Net", slug="delta", is_active=True)
        TenantDomain.objects.create(tenant=self.tenant_1, hostname="delta.localhost", is_primary=True)

        # Tenant 2
        self.tenant_2 = Tenant.objects.create(name="Echo Net", slug="echo", is_active=True)
        TenantDomain.objects.create(tenant=self.tenant_2, hostname="echo.localhost", is_primary=True)

        # Packages
        self.pkg_1 = Package.objects.create(
            tenant=self.tenant_1,
            name="Mega 20M",
            mikrotik_profile="profile_20m",
            speed_mbps=20,
            upload_speed_mbps=20,
            validity_days=30,
            regular_price=Decimal("800.00"),
            is_active=True
        )
        self.pkg_inactive = Package.objects.create(
            tenant=self.tenant_1,
            name="Old 5M",
            mikrotik_profile="profile_5m",
            speed_mbps=5,
            upload_speed_mbps=5,
            validity_days=30,
            regular_price=Decimal("400.00"),
            is_active=False
        )

        # Routers
        self.router_1 = Router.objects.create(
            tenant=self.tenant_1,
            name="Delta Core BRAS",
            ip_address="10.0.0.1",
            username="admin",
            password="secret_router_pass"
        )

        # Customer 1 (Delta)
        self.cust_1 = Customer.objects.create(
            tenant=self.tenant_1,
            customer_code="CUST-D1",
            full_name="Abul Kalam",
            mobile="01811112233",
            email="abul@example.com",
            pppoe_username="abul_delta",
            pppoe_password="plain_secret_password_never_expose",
            package=self.pkg_1,
            router=self.router_1,
            monthly_bill=Decimal("800.00"),
            due_amount=Decimal("800.00"),
            advance_amount=Decimal("0.00"),
            expiry_date=timezone.localdate() + timezone.timedelta(days=2),
            status=CustomerStatus.ACTIVE
        )

        # Customer 2 (Delta - other customer)
        self.cust_2 = Customer.objects.create(
            tenant=self.tenant_1,
            customer_code="CUST-D2",
            full_name="Jamal Uddin",
            mobile="01899998877",
            pppoe_username="jamal_delta",
            pppoe_password="jamal_secret_pwd",
            package=self.pkg_1,
            monthly_bill=Decimal("800.00"),
            due_amount=Decimal("0.00"),
            status=CustomerStatus.ACTIVE
        )

        # Invoices
        self.inv_1 = Invoice.objects.create(
            tenant=self.tenant_1,
            customer=self.cust_1,
            invoice_no="INV-DELTA-1001",
            billing_month="September 2026",
            package_name=self.pkg_1.name,
            package_amount=Decimal("800.00"),
            previous_due=Decimal("0.00"),
            discount=Decimal("0.00"),
            total_payable=Decimal("800.00"),
            due_amount=Decimal("800.00"),
            status=Invoice.InvoiceStatus.UNPAID,
            due_date=timezone.localdate() + timezone.timedelta(days=5)
        )

        self.inv_2 = Invoice.objects.create(
            tenant=self.tenant_1,
            customer=self.cust_2,
            invoice_no="INV-DELTA-1002",
            billing_month="September 2026",
            package_name=self.pkg_1.name,
            package_amount=Decimal("800.00"),
            previous_due=Decimal("0.00"),
            discount=Decimal("0.00"),
            total_payable=Decimal("800.00"),
            due_amount=Decimal("0.00"),
            paid_amount=Decimal("800.00"),
            status=Invoice.InvoiceStatus.PAID
        )

        self.token_1 = generate_customer_jwt(self.cust_1)

    def test_get_profile_success_and_credentials_shielded(self):
        """Customer profile is returned with accurate billing info and zero password leakage."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_1}")
        response = self.client.get(
            "/api/v1/portal/profile/",
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data["pppoe_username"], "abul_delta")
        self.assertEqual(data["full_name"], "Abul Kalam")
        self.assertEqual(Decimal(data["due_amount"]), Decimal("800.00"))
        # Security assertion: ensure pppoe_password, router credentials or OLT keys never exist
        self.assertNotIn("pppoe_password", data)
        self.assertNotIn("password", data)
        self.assertNotIn("secret_router_pass", json.dumps(data))

    def test_get_packages_filters_active_and_tenant(self):
        """Only active packages belonging to the customer's tenant are returned."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_1}")
        response = self.client.get(
            "/api/v1/portal/packages/",
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        pkgs = response.data
        self.assertEqual(len(pkgs), 1)
        self.assertEqual(pkgs[0]["name"], "Mega 20M")

    def test_session_diagnostics_offline_and_online(self):
        """Session diagnostics returns offline when disconnected, and live stats when online."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_1}")

        # 1. Offline check
        res_offline = self.client.get(
            "/api/v1/portal/session/",
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res_offline.status_code, status.HTTP_200_OK)
        self.assertFalse(res_offline.data["is_online"])

        # 2. Simulate active UserSession
        UserSession.objects.create(
            tenant=self.tenant_1,
            router=self.router_1,
            username=self.cust_1.pppoe_username,
            ip_address="100.64.10.45",
            mac_address="AA:BB:CC:DD:EE:FF",
            uptime="1d 04:30:12",
            bytes_in=1500000000,
            bytes_out=500000000
        )

        res_online = self.client.get(
            "/api/v1/portal/session/",
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res_online.status_code, status.HTTP_200_OK)
        self.assertTrue(res_online.data["is_online"])
        self.assertEqual(res_online.data["ip_address"], "100.64.10.45")
        self.assertEqual(res_online.data["bytes_in"], 1500000000)

    def test_invoices_strictly_scoped_to_customer(self):
        """Customer only receives their own invoices (IDOR protection)."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_1}")
        response = self.client.get(
            "/api/v1/portal/invoices/",
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["invoice_no"], "INV-DELTA-1001")

        # Attempt to access another customer's invoice directly returns 404
        idor_response = self.client.get(
            f"/api/v1/portal/invoices/{self.inv_2.id}/",
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(idor_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_notifications_display_expiry_and_due(self):
        """Customer receives reminder notifications when due or near expiry."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_1}")
        response = self.client.get(
            "/api/v1/portal/notifications/",
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notifs = response.data["notifications"]
        self.assertGreaterEqual(len(notifs), 1)
        titles = [n["title"] for n in notifs]
        self.assertIn("Pending Bill Due", titles)

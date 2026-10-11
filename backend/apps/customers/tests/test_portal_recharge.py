import json
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Recharge
from apps.network.models import Router
from apps.payments.models import PaymentTransaction, TransactionStatus
from apps.customers.jwt import generate_customer_jwt


class CustomerPortalRechargeTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenant
        self.tenant = Tenant.objects.create(name="Solar Telecom", slug="solar", is_active=True)
        TenantDomain.objects.create(tenant=self.tenant, hostname="solar.localhost", is_primary=True)

        # Router
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Solar BRAS 1",
            ip_address="192.168.10.1",
            username="admin",
            password="router_pass"
        )

        # Package
        self.package = Package.objects.create(
            tenant=self.tenant,
            name="Gold 50M",
            mikrotik_profile="profile_gold",
            speed_mbps=50,
            upload_speed_mbps=50,
            validity_days=30,
            regular_price=Decimal("1500.00")
        )

        # Customer with advance credit
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-SOLAR-01",
            full_name="Tanvir Ahmed",
            mobile="01722334455",
            pppoe_username="tanvir_solar",
            pppoe_password="tanvir_password",
            package=self.package,
            router=self.router,
            monthly_bill=Decimal("1500.00"),
            due_amount=Decimal("0.00"),
            advance_amount=Decimal("2000.00"),
            expiry_date=timezone.localdate() + timezone.timedelta(days=1),
            status=CustomerStatus.ACTIVE
        )

        self.token = generate_customer_jwt(self.customer)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def test_recharge_with_sufficient_advance_balance(self):
        """Customer recharges using available advance balance; expiry is extended and advance deducted."""
        old_expiry = self.customer.expiry_date
        response = self.client.post(
            "/api/v1/portal/recharge/",
            {},
            HTTP_HOST="solar.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(Decimal(response.data["amount_deducted"]), Decimal("1500.00"))
        self.assertEqual(Decimal(response.data["remaining_advance"]), Decimal("500.00"))

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.advance_amount, Decimal("500.00"))
        self.assertEqual(self.customer.expiry_date, old_expiry + timezone.timedelta(days=30))

        # Check Recharge record created
        rech = Recharge.objects.filter(customer=self.customer).first()
        self.assertIsNotNone(rech)
        self.assertEqual(rech.amount, Decimal("1500.00"))
        self.assertEqual(rech.payment_method, "Advance Balance")

    def test_recharge_with_insufficient_advance_balance(self):
        """Customer without enough advance credit gets HTTP 402 with online payment redirect."""
        self.customer.advance_amount = Decimal("200.00")
        self.customer.save(update_fields=["advance_amount"])

        response = self.client.post(
            "/api/v1/portal/recharge/",
            {},
            HTTP_HOST="solar.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_402_PAYMENT_REQUIRED)
        self.assertTrue(response.data["insufficient_balance"])
        self.assertEqual(response.data["payment_url"], "/api/v1/portal/payments/bkash/create/")

    def test_recharge_and_payment_history_endpoints(self):
        """Recharge history and payment history return lists correctly scoped to the customer."""
        # Create Recharge record
        Recharge.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            package=self.package,
            amount=Decimal("1500.00"),
            validity_days=30,
            old_expiry=timezone.localdate(),
            new_expiry=timezone.localdate() + timezone.timedelta(days=30),
            payment_method="Advance Balance",
            trx_id="ADV-TEST-01"
        )

        # Create PaymentTransaction record
        PaymentTransaction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal("1500.00"),
            trx_id="TXN-SOLAR-001",
            payment_method="bKash",
            status=TransactionStatus.SUCCESS
        )

        # 1. Recharge history
        rech_res = self.client.get(
            "/api/v1/portal/recharge/history/",
            HTTP_HOST="solar.localhost"
        )
        self.assertEqual(rech_res.status_code, status.HTTP_200_OK)
        recharges = rech_res.data["recharges"]
        self.assertEqual(len(recharges), 1)
        self.assertEqual(recharges[0]["trx_id"], "ADV-TEST-01")

        # 2. Payment history
        pay_res = self.client.get(
            "/api/v1/portal/payments/history/",
            HTTP_HOST="solar.localhost"
        )
        self.assertEqual(pay_res.status_code, status.HTTP_200_OK)
        payments = pay_res.data["payments"]
        self.assertEqual(len(payments), 1)
        self.assertEqual(payments[0]["trx_id"], "TXN-SOLAR-001")

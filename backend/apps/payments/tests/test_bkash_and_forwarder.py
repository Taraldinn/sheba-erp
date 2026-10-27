import json
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice, Recharge
from apps.network.models import Router, NetworkSyncJob
from apps.payments.models import PaymentGateway, GatewayProvider, PaymentTransaction, InboundPaymentEvent
from apps.customers.jwt import generate_customer_jwt


class BKashAndForwarderPaymentTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenant setup
        self.tenant = Tenant.objects.create(name="Prime Fiber", slug="prime", is_active=True)
        TenantDomain.objects.create(tenant=self.tenant, hostname="prime.localhost", is_primary=True)

        # Router
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Prime Core MikroTik",
            ip_address="192.168.88.1",
            username="admin",
            password="router_secret"
        )

        # Package
        self.package = Package.objects.create(
            tenant=self.tenant,
            name="Turbo 30M",
            mikrotik_profile="profile_turbo",
            speed_mbps=30,
            upload_speed_mbps=30,
            validity_days=30,
            regular_price=Decimal("1000.00")
        )

        # Customer with expired status and due amount
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-PRIME-101",
            full_name="Mahmudur Rahman",
            mobile="01711223344",
            pppoe_username="mahmud_prime",
            pppoe_password="plain_secret_pwd",
            package=self.package,
            router=self.router,
            monthly_bill=Decimal("1000.00"),
            due_amount=Decimal("1000.00"),
            advance_amount=Decimal("0.00"),
            expiry_date=timezone.localdate() - timezone.timedelta(days=2),
            status=CustomerStatus.EXPIRED
        )

        # Gateway
        self.gateway = PaymentGateway.objects.create(
            tenant=self.tenant,
            provider=GatewayProvider.BKASH,
            title="bKash Merchant Checkout",
            is_active=True,
            is_sandbox=True,
            app_key="test_app_key",
            app_secret="test_app_secret",
            username="test_username",
            password="test_password"
        )

        self.token = generate_customer_jwt(self.customer)

    def test_bkash_tokenized_checkout_create_and_execute(self):
        """Customer initiates checkout and executes payment; verify balance offset and line restoration."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

        # 1. Create Checkout
        create_res = self.client.post(
            "/api/v1/portal/payments/bkash/create/",
            {"amount": "1000.00"},
            HTTP_HOST="prime.localhost"
        )
        self.assertEqual(create_res.status_code, status.HTTP_200_OK)
        self.assertTrue(create_res.data["success"])
        payment_id = create_res.data["payment_id"]
        self.assertIsNotNone(payment_id)
        self.assertTrue(create_res.data["bkash_url"].startswith("https://"))

        # 2. Execute Checkout
        exec_res = self.client.post(
            "/api/v1/portal/payments/bkash/execute/",
            {"payment_id": payment_id},
            HTTP_HOST="prime.localhost"
        )
        self.assertEqual(exec_res.status_code, status.HTTP_200_OK)
        self.assertTrue(exec_res.data["success"])
        trx_id = exec_res.data["trx_id"]
        self.assertIsNotNone(trx_id)

        # Check database records
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.due_amount, Decimal("0.00"))
        self.assertEqual(self.customer.status, CustomerStatus.ACTIVE)
        self.assertGreater(self.customer.expiry_date, timezone.localdate())

        # Verify PaymentTransaction created
        txn = PaymentTransaction.objects.filter(trx_id=trx_id).first()
        self.assertIsNotNone(txn)
        self.assertEqual(txn.amount, Decimal("1000.00"))
        self.assertEqual(txn.payment_method, "bKash")

        # Verify Recharge record
        recharge = Recharge.objects.filter(trx_id=trx_id).first()
        self.assertIsNotNone(recharge)

    def test_bkash_paybill_query_and_settle(self):
        """bKash App queries subscriber bill and executes instant settlement (v1.4 compliant)."""
        # 1. Query Bill
        query_res = self.client.post(
            "/api/v1/payments/bkash/paybill/query/",
            {
                "UserName": "test_username",
                "Password": "test_password",
                "CustomerNo": "CUST-PRIME-101"
            },
            HTTP_HOST="prime.localhost"
        )
        self.assertEqual(query_res.status_code, status.HTTP_200_OK)
        self.assertEqual(query_res.data["ErrorCode"], "200")
        self.assertEqual(query_res.data["ErrorMsg"], "Successful")
        self.assertEqual(query_res.data["ConsumerName"], "Mahmudur Rahman")
        self.assertEqual(query_res.data["BillAmount"], "1000.00")
        self.assertTrue("QueryTime" in query_res.data)

        # 2. Settle Bill
        pay_res = self.client.post(
            "/api/v1/payments/bkash/paybill/pay/",
            {
                "UserName": "test_username",
                "Password": "test_password",
                "CustomerNo": "CUST-PRIME-101",
                "Amount": "1000.00",
                "TrxId": "BKA_PAYBILL_998811"
            },
            HTTP_HOST="prime.localhost"
        )
        self.assertEqual(pay_res.status_code, status.HTTP_200_OK)
        self.assertEqual(pay_res.data["ErrorCode"], "200")
        self.assertEqual(pay_res.data["ErrorMsg"], "Successful")
        self.assertEqual(pay_res.data["TotalAmount"], "1000.00")
        self.assertEqual(pay_res.data["TrxId"], "BKA_PAYBILL_998811")
        self.assertTrue("MiddlewarePayTime" in pay_res.data)

        # Verify customer refreshed
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.due_amount, Decimal("0.00"))
        self.assertEqual(self.customer.status, CustomerStatus.ACTIVE)

        # 3. Idempotency test (duplicate payment returns success 200 without double balance crediting)
        dup_res = self.client.post(
            "/api/v1/payments/bkash/paybill/pay/",
            {
                "UserName": "test_username",
                "Password": "test_password",
                "CustomerNo": "CUST-PRIME-101",
                "Amount": "1000.00",
                "TrxId": "BKA_PAYBILL_998811"
            },
            HTTP_HOST="prime.localhost"
        )
        self.assertEqual(dup_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dup_res.data["ErrorCode"], "200")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.advance_amount, Decimal("0.00"))

    def test_manual_forwarder_webhook_auto_match_by_reference(self):
        """Forwarder app sends reference_id matching customer_code; auto-matches & restores line."""
        payload = {
            "sender_account": "01799887766",
            "reference_id": "CUST-PRIME-101",
            "amount": 1000.00,
            "trx_id": "MFS99112233",
            "provider": "bKash"
        }
        res = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            payload,
            HTTP_HOST="prime.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "matched")
        self.assertTrue(res.data["matched"])

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.due_amount, Decimal("0.00"))
        self.assertEqual(self.customer.status, CustomerStatus.ACTIVE)

    def test_manual_forwarder_unmatched_and_customer_claim(self):
        """Unmatched SMS forwarder event can be claimed by customer via Portal."""
        # 1. Forwarder app posts payment without recognized reference
        payload = {
            "sender_account": "01900000000",
            "reference_id": "UNKNOWN_REF",
            "amount": 1000.00,
            "trx_id": "TRX_UNMATCHED_77",
            "provider": "Nagad"
        }
        fwd_res = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            payload,
            HTTP_HOST="prime.localhost"
        )
        self.assertEqual(fwd_res.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(fwd_res.data["status"], "unmatched")
        self.assertFalse(fwd_res.data["matched"])

        # Customer is still expired
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, CustomerStatus.EXPIRED)

        # 2. Customer logs into portal and claims the TrxID
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")
        claim_res = self.client.post(
            "/api/v1/portal/payments/claim/",
            {"trx_id": "TRX_UNMATCHED_77"},
            HTTP_HOST="prime.localhost"
        )
        self.assertEqual(claim_res.status_code, status.HTTP_200_OK)
        self.assertTrue(claim_res.data["success"])

        # Now customer is active with zero due
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.due_amount, Decimal("0.00"))
        self.assertEqual(self.customer.status, CustomerStatus.ACTIVE)

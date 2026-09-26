import hmac
import hashlib
import json
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice, Recharge
from apps.network.models import Router
from apps.payments.models import (
    PaymentGateway, GatewayProvider, PaymentTransaction,
    InboundPaymentEvent, PaymentAttempt, PaymentAttemptStatus
)
from apps.customers.jwt import generate_customer_jwt


class InboundWebhookSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenant A
        self.tenant_a = Tenant.objects.create(name="ISP Alpha", slug="alpha", is_active=True)
        TenantDomain.objects.create(tenant=self.tenant_a, hostname="alpha.localhost", is_primary=True)

        # Tenant B
        self.tenant_b = Tenant.objects.create(name="ISP Beta", slug="beta", is_active=True)
        TenantDomain.objects.create(tenant=self.tenant_b, hostname="beta.localhost", is_primary=True)

        # Router for Tenant A
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name="Alpha MikroTik",
            ip_address="192.168.1.1",
            username="admin",
            password="secret_pass"
        )

        # Package for Tenant A
        self.package_a = Package.objects.create(
            tenant=self.tenant_a,
            name="Alpha 20M",
            speed_mbps=20,
            regular_price=Decimal("1000.00"),
            validity_days=30
        )

        # Customer for Tenant A
        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="CUST-ALPHA-01",
            full_name="Tanvir Ahmed",
            mobile="01711000111",
            pppoe_username="tanvir_alpha",
            package=self.package_a,
            router=self.router_a,
            monthly_bill=Decimal("1000.00"),
            due_amount=Decimal("1000.00"),
            advance_amount=Decimal("0.00"),
            status=CustomerStatus.ACTIVE
        )

        # Customer for Tenant B
        self.customer_b = Customer.objects.create(
            tenant=self.tenant_b,
            customer_code="CUST-BETA-99",
            full_name="Kamrul Hasan",
            mobile="01822000222",
            pppoe_username="kamrul_beta",
            monthly_bill=Decimal("1500.00"),
            due_amount=Decimal("1500.00"),
            status=CustomerStatus.ACTIVE
        )

        # Invoice for Tenant A
        self.invoice_a = Invoice.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            invoice_no="INV-ALPHA-1001",
            billing_month="September 2026",
            package_name=self.package_a.name,
            package_amount=Decimal("1000.00"),
            total_payable=Decimal("1000.00"),
            due_amount=Decimal("1000.00"),
            status=Invoice.InvoiceStatus.UNPAID
        )

        # Invoice for Tenant B
        self.invoice_b = Invoice.objects.create(
            tenant=self.tenant_b,
            customer=self.customer_b,
            invoice_no="INV-BETA-2001",
            billing_month="September 2026",
            package_name="Beta 20M",
            package_amount=Decimal("1500.00"),
            total_payable=Decimal("1500.00"),
            due_amount=Decimal("1500.00"),
            status=Invoice.InvoiceStatus.UNPAID
        )

        # Gateway with webhook secret for Tenant A
        self.webhook_secret = "alpha_super_secret_signing_key_443"
        self.gateway_a = PaymentGateway.objects.create(
            tenant=self.tenant_a,
            provider=GatewayProvider.BKASH,
            title="Alpha bKash",
            is_active=True,
            is_sandbox=True,
            app_key="app_key_a",
            app_secret="app_secret_a",
            username="bkash_alpha_user",
            password="bkash_alpha_pass",
            webhook_secret=self.webhook_secret
        )

    def _generate_hmac_signature(self, payload_dict: dict, secret: str) -> str:
        body_bytes = json.dumps(payload_dict, separators=(',', ':')).encode('utf-8')
        return hmac.new(secret.encode('utf-8'), body_bytes, hashlib.sha256).hexdigest()

    def test_valid_webhook_with_signature(self):
        """Valid webhook signed with correct HMAC-SHA256 signature is processed successfully."""
        payload = {
            "sender_account": "01711000111",
            "reference_id": "CUST-ALPHA-01",
            "amount": "1000.00",
            "trx_id": "TXN-VALID-SIG-01",
            "provider": "bKash",
            "currency": "BDT"
        }
        sig = self._generate_hmac_signature(payload, self.webhook_secret)

        res = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data=payload,
            format='json',
            HTTP_HOST="alpha.localhost",
            HTTP_X_WEBHOOK_SIGNATURE=sig
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "matched")
        self.assertTrue(res.data["matched"])
        self.assertEqual(res.data["trx_id"], "TXN-VALID-SIG-01")

        # Verify PaymentTransaction and balance update
        self.assertTrue(PaymentTransaction.objects.filter(trx_id="TXN-VALID-SIG-01").exists())
        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.due_amount, Decimal("0.00"))

    def test_invalid_signature_rejected(self):
        """Webhook with an invalid signature is rejected with HTTP 401 Unauthorized."""
        payload = {
            "sender_account": "01711000111",
            "reference_id": "CUST-ALPHA-01",
            "amount": "1000.00",
            "trx_id": "TXN-INVALID-SIG-99",
            "provider": "bKash"
        }
        bad_sig = "deadbeef_invalid_signature_1234567890abcdef"

        res = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data=payload,
            format='json',
            HTTP_HOST="alpha.localhost",
            HTTP_X_WEBHOOK_SIGNATURE=bad_sig
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Invalid webhook signature", res.data["error"])
        # Ensure no transaction or balance mutation occurred
        self.assertFalse(PaymentTransaction.objects.filter(trx_id="TXN-INVALID-SIG-99").exists())

    def test_duplicate_webhook_handled_idempotently(self):
        """Duplicate webhook submissions return idempotent response without double-crediting."""
        payload = {
            "sender_account": "01711000111",
            "reference_id": "CUST-ALPHA-01",
            "amount": "1000.00",
            "trx_id": "TXN-DUP-CHECK-77",
            "provider": "bKash"
        }
        sig = self._generate_hmac_signature(payload, self.webhook_secret)

        # First call: Succeeded & settled
        res1 = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data=payload,
            format='json',
            HTTP_HOST="alpha.localhost",
            HTTP_X_WEBHOOK_SIGNATURE=sig
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data["status"], "matched")

        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.due_amount, Decimal("0.00"))
        self.assertEqual(self.customer_a.advance_amount, Decimal("0.00"))

        # Second call: Duplicate TrxID
        res2 = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data=payload,
            format='json',
            HTTP_HOST="alpha.localhost",
            HTTP_X_WEBHOOK_SIGNATURE=sig
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data.get("idempotent"))
        self.assertIn("already been processed", res2.data["message"])

        # Customer advance balance must NOT increase (no double crediting)
        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.advance_amount, Decimal("0.00"))
        self.assertEqual(PaymentTransaction.objects.filter(trx_id="TXN-DUP-CHECK-77").count(), 1)

    def test_replay_attack_rejected(self):
        """Replay attack with expired timestamp is rejected with HTTP 400."""
        # Timestamp from 10 minutes ago (> 300s drift)
        old_timestamp = int((timezone.now() - timezone.timedelta(seconds=600)).timestamp())
        payload = {
            "sender_account": "01711000111",
            "reference_id": "CUST-ALPHA-01",
            "amount": "1000.00",
            "trx_id": "TXN-REPLAY-EXPIRED-01",
            "provider": "bKash",
            "timestamp": old_timestamp
        }

        res = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data=payload,
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("clock skew too high", res.data["error"])

    def test_replay_duplicate_request_id_detected(self):
        """Immediate replay of identical request fingerprint triggers 409 Conflict."""
        current_ts = int(timezone.now().timestamp())
        payload = {
            "sender_account": "01711000111",
            "reference_id": "CUST-ALPHA-01",
            "amount": "1000.00",
            "trx_id": "TXN-REPLAY-CACHE-99",
            "provider": "bKash",
            "timestamp": current_ts
        }

        # First delivery
        res1 = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data=payload,
            format='json',
            HTTP_HOST="alpha.localhost",
            HTTP_X_REQUEST_ID="REQ-UUID-12345"
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Immediate identical replay
        res2 = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data=payload,
            format='json',
            HTTP_HOST="alpha.localhost",
            HTTP_X_REQUEST_ID="REQ-UUID-12345"
        )
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("replay detected", res2.data["error"].lower())

    def test_wrong_amount_rejected(self):
        """Invalid amounts (negative, zero, or mismatching invoice) are rejected."""
        # 1. Negative amount
        res_neg = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data={
                "sender_account": "01711000111",
                "reference_id": "CUST-ALPHA-01",
                "amount": "-500.00",
                "trx_id": "TXN-NEG-AMT-01",
                "provider": "bKash"
            },
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Amount must be at least", res_neg.data["error"])

        # 2. Non-numeric amount
        res_nan = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data={
                "sender_account": "01711000111",
                "reference_id": "CUST-ALPHA-01",
                "amount": "not_a_valid_number",
                "trx_id": "TXN-NAN-AMT-02",
                "provider": "bKash"
            },
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res_nan.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Mismatching amount against targeted invoice
        res_inv_mismatch = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data={
                "sender_account": "01711000111",
                "reference_id": "CUST-ALPHA-01",
                "invoice_id": str(self.invoice_a.id),
                "amount": "500.00",  # Invoice due is 1000.00
                "trx_id": "TXN-INV-MISMATCH-03",
                "provider": "bKash"
            },
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res_inv_mismatch.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Amount mismatch", res_inv_mismatch.data["error"])

    def test_wrong_currency_rejected(self):
        """Non-BDT currencies (USD, EUR, INR) are strictly rejected with HTTP 400."""
        res = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data={
                "sender_account": "01711000111",
                "reference_id": "CUST-ALPHA-01",
                "amount": "1000.00",
                "trx_id": "TXN-USD-01",
                "provider": "bKash",
                "currency": "USD"
            },
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Unsupported currency 'USD'", res.data["error"])

    def test_wrong_customer_rejected(self):
        """Cross-tenant or invalid customer_id in webhook is rejected with HTTP 404."""
        # Attempting to associate Customer B (from Tenant B) on Tenant A's webhook
        res = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data={
                "customer_id": str(self.customer_b.id),
                "amount": "1000.00",
                "trx_id": "TXN-WRONG-CUST-01",
                "provider": "bKash"
            },
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("Customer not found under this tenant", res.data["error"])

    def test_unknown_transaction_search_and_claim(self):
        """Searching or claiming an unknown transaction ID returns HTTP 404."""
        # bKash search
        search_res = self.client.post(
            "/api/v1/payments/bkash/paybill/search/",
            data={
                "UserName": "bkash_alpha_user",
                "Password": "bkash_alpha_pass",
                "TrxId": "NON_EXISTENT_TRX_999"
            },
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(search_res.status_code, status.HTTP_200_OK)
        self.assertEqual(search_res.data["ErrorCode"], "404")
        self.assertEqual(search_res.data["ErrorMsg"], "Data not found")

        # Customer portal claim
        token = generate_customer_jwt(self.customer_a)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        claim_res = self.client.post(
            "/api/v1/portal/payments/claim/",
            data={"trx_id": "NON_EXISTENT_TRX_999"},
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(claim_res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(claim_res.data["success"])

    def test_cross_tenant_attempt_rejected(self):
        """Caller specifying tenant_id of Tenant B on Tenant A endpoint is blocked."""
        # 1. Forwarder webhook cross-tenant attempt
        res_fwd = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data={
                "tenant_id": str(self.tenant_b.id),  # Malicious override attempt
                "sender_account": "01711000111",
                "reference_id": "CUST-ALPHA-01",
                "amount": "1000.00",
                "trx_id": "TXN-CROSS-TENANT-01",
                "provider": "bKash"
            },
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res_fwd.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cross-tenant access prohibited", res_fwd.data["error"])

        # 2. bKash PayBill cross-tenant attempt
        res_pay = self.client.post(
            "/api/v1/payments/bkash/paybill/pay/",
            data={
                "UserName": "bkash_alpha_user",
                "Password": "bkash_alpha_pass",
                "CustomerNo": "CUST-ALPHA-01",
                "Amount": "1000.00",
                "TrxId": "TXN-CROSS-BKASH-02",
                "tenant_id": str(self.tenant_b.id)
            },
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res_pay.data["ErrorCode"], "403")
        self.assertIn("Cross-tenant access prohibited", res_pay.data["ErrorMsg"])

        # 3. Cross-tenant invoice ID mapping
        res_inv = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data={
                "invoice_id": str(self.invoice_b.id),  # Invoice belonging to Tenant B
                "amount": "1500.00",
                "trx_id": "TXN-CROSS-INV-03",
                "provider": "bKash"
            },
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res_inv.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("Invoice not found under this tenant", res_inv.data["error"])

    def test_sanitization_of_secrets_in_payload(self):
        """Ensure sensitive fields like password and token are masked before persistence in events and transactions."""
        # 1. Unmatched event sanitization
        payload = {
            "sender_account": "01999887766",  # Unrecognized phone
            "reference_id": "UNKNOWN-REF-UNMATCHED",
            "amount": "1000.00",
            "trx_id": "TXN-SANITIZE-01",
            "provider": "bKash",
            "password": "plain_password_leak_attempt",
            "app_secret": "raw_secret_leak_attempt",
            "token": "bearer_token_leak"
        }
        res = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data=payload,
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        event_id = res.data["event_id"]

        event = InboundPaymentEvent.objects.get(id=event_id)
        # Verify raw_payload does NOT contain the plain secrets
        self.assertNotIn("plain_password_leak_attempt", event.raw_payload)
        self.assertNotIn("raw_secret_leak_attempt", event.raw_payload)
        self.assertNotIn("bearer_token_leak", event.raw_payload)
        # Verify masking
        self.assertIn("••••••••", event.raw_payload)

        # 2. Matched transaction sanitization
        matched_payload = {
            "sender_account": "01711000111",  # Matches Customer A
            "reference_id": "CUST-ALPHA-01",
            "amount": "1000.00",
            "trx_id": "TXN-SANITIZE-02",
            "provider": "bKash",
            "password": "plain_secret_in_matched_payment"
        }
        res_matched = self.client.post(
            "/api/v1/payments/forwarder/webhook/",
            data=matched_payload,
            format='json',
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(res_matched.status_code, status.HTTP_200_OK)
        txn = PaymentTransaction.objects.get(trx_id="TXN-SANITIZE-02")
        self.assertNotIn("plain_secret_in_matched_payment", str(txn.raw_payload))
        self.assertIn("••••••••", str(txn.raw_payload))

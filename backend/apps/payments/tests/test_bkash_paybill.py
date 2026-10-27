import json
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone

from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice, Recharge
from apps.network.models import Router
from apps.payments.models import PaymentGateway, GatewayProvider, PaymentTransaction


class BKashPayBillIntegrationTests(TestCase):
    """
    Tests for bKash PayBill Outbound Interface compliance
    with Partner Integration Guide v1.4 (Jan 30, 2024).
    """

    def setUp(self):
        self.client = APIClient()

        # Tenant setup
        self.tenant = Tenant.objects.create(name="Delta Net", slug="delta", is_active=True)
        TenantDomain.objects.create(tenant=self.tenant, hostname="delta.localhost", is_primary=True)

        # Core Router & Package
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Delta Core BNG",
            ip_address="10.0.0.1",
            username="admin",
            password="pwd"
        )
        self.package = Package.objects.create(
            tenant=self.tenant,
            name="Mega 20M",
            mikrotik_profile="profile_mega",
            speed_mbps=20,
            validity_days=30,
            regular_price=Decimal("800.00")
        )

        # Customer 1: Has outstanding due of 800 BDT
        self.due_customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CID-9878",
            full_name="Amena Khatun",
            mobile="017111928374",
            pppoe_username="amena_k",
            pppoe_password="sec",
            package=self.package,
            router=self.router,
            monthly_bill=Decimal("800.00"),
            due_amount=Decimal("800.00"),
            advance_amount=Decimal("0.00"),
            expiry_date=timezone.localdate() - timezone.timedelta(days=1),
            status=CustomerStatus.EXPIRED
        )

        # Customer 2: Fully paid active subscriber
        self.paid_customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CID-PAID-001",
            full_name="Rafiqul Islam",
            mobile="01811223344",
            pppoe_username="rafiq_delta",
            pppoe_password="sec",
            package=self.package,
            router=self.router,
            monthly_bill=Decimal("800.00"),
            due_amount=Decimal("0.00"),
            advance_amount=Decimal("0.00"),
            expiry_date=timezone.localdate() + timezone.timedelta(days=25),
            status=CustomerStatus.ACTIVE
        )

        # Gateway configured with credentials from bKash documentation sample
        self.gateway = PaymentGateway.objects.create(
            tenant=self.tenant,
            provider=GatewayProvider.BKASH,
            title="bKash PayBill Biller",
            is_active=True,
            is_sandbox=False,
            username="bKash",
            password="K38MO3"
        )

    # -------------------------------------------------------------
    # 1.1 Check Bill Tests
    # -------------------------------------------------------------

    def test_check_bill_success_official_route(self):
        """1.1 Check Bill returns 200 with subscriber bill on official /api/queryBill/ route."""
        res = self.client.post(
            "/api/queryBill/",
            {
                "UserName": "bKash",
                "Password": "K38MO3",
                "CustomerNo": "CID-9878",
                "BillMonth": "092026",
                "Amount": "800"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "200")
        self.assertEqual(res.data["ErrorMsg"], "Successful")
        self.assertEqual(res.data["ConsumerName"], "Amena Khatun")
        self.assertEqual(res.data["BillAmount"], "800.00")
        self.assertEqual(res.data["BillMonth"], "092026")
        self.assertTrue("QueryTime" in res.data)

    def test_check_bill_with_aliases(self):
        """Check bill succeeds with AccNo, MeterNo, BillNo, RefID aliases."""
        for alias in ["AccNo", "MeterNo", "BillNo", "RefID"]:
            res = self.client.post(
                "/api/v1/payments/bkash/paybill/query/",
                {
                    "UserName": "bKash",
                    "Password": "K38MO3",
                    alias: "CID-9878"
                },
                HTTP_HOST="delta.localhost"
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data["ErrorCode"], "200")
            self.assertEqual(res.data["ConsumerName"], "Amena Khatun")

    def test_check_bill_already_paid_code_436(self):
        """1.1 Check Bill returns ErrorCode 436 'Already paid' if subscriber has zero due and active status."""
        res = self.client.post(
            "/api/queryBill/",
            {
                "UserName": "bKash",
                "Password": "K38MO3",
                "CustomerNo": "CID-PAID-001"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "436")
        self.assertEqual(res.data["ErrorMsg"], "Already paid")

    def test_check_bill_data_not_found_code_404(self):
        """1.1 Check Bill returns ErrorCode 404 'Data not found' when subscriber does not exist."""
        res = self.client.post(
            "/api/queryBill/",
            {
                "UserName": "bKash",
                "Password": "K38MO3",
                "CustomerNo": "NON-EXISTENT-ID"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "404")
        self.assertEqual(res.data["ErrorMsg"], "Data not found")

    def test_check_bill_authentication_failed_code_403(self):
        """1.1 Check Bill returns ErrorCode 403 'Authentication failed' on incorrect password."""
        res = self.client.post(
            "/api/queryBill/",
            {
                "UserName": "bKash",
                "Password": "WRONG_PASSWORD",
                "CustomerNo": "CID-9878"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "403")
        self.assertEqual(res.data["ErrorMsg"], "Authentication failed")

    def test_check_bill_mandatory_field_missing_code_406(self):
        """1.1 Check Bill returns ErrorCode 406 'Mandatory Field missing' when missing username or customer id."""
        # Missing CustomerNo
        res1 = self.client.post(
            "/api/queryBill/",
            {
                "UserName": "bKash",
                "Password": "K38MO3"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data["ErrorCode"], "406")
        self.assertEqual(res1.data["ErrorMsg"], "Mandatory Field missing")

        # Missing Password
        res2 = self.client.post(
            "/api/queryBill/",
            {
                "UserName": "bKash",
                "CustomerNo": "CID-9878"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["ErrorCode"], "406")

    # -------------------------------------------------------------
    # 1.2 Bill Payment Tests
    # -------------------------------------------------------------

    def test_bill_payment_success_and_financial_settlement(self):
        """1.2 Bill Payment settles due amount, records recharge and ledger, and returns 200."""
        payload = {
            "UserName": "bKash",
            "Password": "K38MO3",
            "CustomerNo": "CID-9878",
            "BillMonth": "092026",
            "Amount": "800.00",
            "UserMobileNumber": "017111928374",
            "TrxId": "5C8300HJ6V",
            "PayTime": "20260917123000"
        }
        res = self.client.post(
            "/api/payBill/",
            payload,
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "200")
        self.assertEqual(res.data["ErrorMsg"], "Successful")
        self.assertEqual(res.data["ConsumerName"], "Amena Khatun")
        self.assertEqual(res.data["TotalAmount"], "800.00")
        self.assertEqual(res.data["TrxId"], "5C8300HJ6V")
        self.assertTrue("MiddlewarePayTime" in res.data)
        self.assertTrue("RefNumber" in res.data)

        # Verify DB updates
        self.due_customer.refresh_from_db()
        self.assertEqual(self.due_customer.due_amount, Decimal("0.00"))
        self.assertEqual(self.due_customer.status, CustomerStatus.ACTIVE)
        self.assertGreater(self.due_customer.expiry_date, timezone.localdate())

        # Verify PaymentTransaction record
        txn = PaymentTransaction.objects.filter(trx_id="5C8300HJ6V").first()
        self.assertIsNotNone(txn)
        self.assertEqual(txn.amount, Decimal("800.00"))
        self.assertEqual(txn.payment_method, "bKash PayBill")

        # Verify Recharge record
        recharge = Recharge.objects.filter(trx_id="5C8300HJ6V").first()
        self.assertIsNotNone(recharge)
        self.assertEqual(recharge.amount, Decimal("800.00"))

    def test_bill_payment_idempotency(self):
        """1.2 Repeating duplicate TrxId returns ErrorCode 200 without double balance deduction."""
        payload = {
            "UserName": "bKash",
            "Password": "K38MO3",
            "CustomerNo": "CID-9878",
            "Amount": "800.00",
            "TrxId": "DUP_TRX_12345"
        }
        # First attempt
        res1 = self.client.post("/api/payBill/", payload, HTTP_HOST="delta.localhost")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data["ErrorCode"], "200")

        self.due_customer.refresh_from_db()
        self.assertEqual(self.due_customer.advance_amount, Decimal("0.00"))

        # Second duplicate attempt
        res2 = self.client.post("/api/payBill/", payload, HTTP_HOST="delta.localhost")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["ErrorCode"], "200")
        self.assertEqual(res2.data["TrxId"], "DUP_TRX_12345")

        self.due_customer.refresh_from_db()
        # Must not double-credit advance balance
        self.assertEqual(self.due_customer.advance_amount, Decimal("0.00"))

    def test_bill_payment_minimum_amount_code_438(self):
        """1.2 Bill Payment returns ErrorCode 438 'Minimum amount not paid' if amount < 10 BDT."""
        res = self.client.post(
            "/api/payBill/",
            {
                "UserName": "bKash",
                "Password": "K38MO3",
                "CustomerNo": "CID-9878",
                "Amount": "5.00",
                "TrxId": "LOW_AMT_TRX"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "438")
        self.assertEqual(res.data["ErrorMsg"], "Minimum amount not paid")

    def test_bill_payment_data_mismatch_code_435(self):
        """1.2 Bill Payment returns ErrorCode 435 'Data Mismatch' on unparseable non-numeric amount."""
        res = self.client.post(
            "/api/payBill/",
            {
                "UserName": "bKash",
                "Password": "K38MO3",
                "CustomerNo": "CID-9878",
                "Amount": "INVALID_AMOUNT_ABC",
                "TrxId": "BAD_AMT_TRX"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "435")
        self.assertEqual(res.data["ErrorMsg"], "Data Mismatch")

    # -------------------------------------------------------------
    # 1.3 Transaction Search Query Tests
    # -------------------------------------------------------------

    def test_transaction_search_success(self):
        """1.3 Transaction Search Query returns 200 with transaction status and ref number."""
        # Create completed transaction
        txn = PaymentTransaction.objects.create(
            tenant=self.tenant,
            customer=self.due_customer,
            amount=Decimal("800.00"),
            trx_id="SEARCH_TRX_99",
            payment_method="bKash PayBill"
        )

        res = self.client.post(
            "/api/searchTransaction/",
            {
                "UserName": "bKash",
                "Password": "K38MO3",
                "TrxId": "SEARCH_TRX_99"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "200")
        self.assertEqual(res.data["ErrorMsg"], "Successful")
        self.assertEqual(res.data["TotalAmount"], "800.00")
        self.assertEqual(res.data["TrxId"], "SEARCH_TRX_99")
        self.assertEqual(res.data["RefNumber"], str(txn.id))
        self.assertTrue("MiddlewarePayTime" in res.data)

    def test_transaction_search_not_found_code_404(self):
        """1.3 Transaction Search Query returns 404 'Data not found' when TrxId does not exist."""
        res = self.client.post(
            "/api/searchTransaction/",
            {
                "UserName": "bKash",
                "Password": "K38MO3",
                "TrxId": "NON_EXISTENT_TRX_999"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "404")
        self.assertEqual(res.data["ErrorMsg"], "Data not found")

    def test_transaction_search_missing_fields_code_406(self):
        """1.3 Transaction Search Query returns 406 when TrxId or credentials omitted."""
        res = self.client.post(
            "/api/searchTransaction/",
            {
                "UserName": "bKash",
                "Password": "K38MO3"
            },
            HTTP_HOST="delta.localhost"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["ErrorCode"], "406")
        self.assertEqual(res.data["ErrorMsg"], "Mandatory Field missing")

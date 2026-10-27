import datetime
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError

from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router
from apps.finance.models import BillingAccount, LedgerEntry, InvoiceLine
from apps.billing.models import Invoice
from apps.corporate.models import (
    CorporateCustomer,
    CorporateCustomerStatus,
    CorporateConnection,
    ConnectionStatus,
    CorporateBillingPeriod,
    PeriodCalculationStatus,
)
from apps.corporate.services.p95_calculator import P95CalculationEngine
from apps.corporate.services.telemetry import TelemetryIngestService
from apps.corporate.services.billing import CorporateBillingService


class CorporateBillingServiceTests(TestCase):
    """
    Unit tests for Corporate Invoicing and Financial Ledger integration.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Apex Enterprise ISP", slug="apex-ent", is_active=True)

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-CORP-001",
            full_name="Beximco Communications Ltd.",
            mobile="+8801711444555",
            pppoe_username="beximco_corp",
            status=CustomerStatus.ACTIVE,
        )

        self.corp_cust = CorporateCustomer.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            company_name="Beximco Communications Ltd.",
            contact_person="Finance Director",
            billing_contact_email="finance@beximco.com",
            billing_contact_phone="+8801711444555",
            committed_bandwidth_mbps=100,  # 100 Mbps CIR
            burst_rate_per_mbps=Decimal("300.00"),  # 300 BDT/Mbps overage
            base_monthly_fee=Decimal("50000.00"),
            credit_terms_days=15,
            status=CorporateCustomerStatus.ACTIVE,
        )

        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Apex Core Router 1",
            ip_address="10.0.0.1",
            username="admin",
            password="pwd"
        )

        self.conn = CorporateConnection.objects.create(
            tenant=self.tenant,
            corporate_customer=self.corp_cust,
            circuit_id="CKT-BEX-01",
            name="Primary Fiber Trunk",
            service_location="Dhanmondi HQ",
            router=self.router,
            interface_name="sfp1",
            committed_bandwidth_mbps=100,
            status=ConnectionStatus.ACTIVE,
        )

    def test_invoice_creation_with_burst_and_ledger(self):
        """
        Calculates p95 with burst overage, finalizes period,
        verifies Invoice, InvoiceLines, LedgerEntry, and BillingAccount.
        """
        base_time = datetime.datetime(2026, 9, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        period_end = base_time + datetime.timedelta(seconds=100 * 300)

        period = CorporateBillingPeriod.objects.create(
            tenant=self.tenant,
            corporate_customer=self.corp_cust,
            period_start=base_time,
            period_end=period_end,
            status=PeriodCalculationStatus.OPEN,
        )

        # Ingest 100 samples from 1 Mbps up to 150 Mbps
        samples = []
        for i in range(1, 101):
            ts = base_time + datetime.timedelta(seconds=(i - 1) * 300)
            bps = int(i * 1.5 * 1_000_000)  # 1.5 Mbps to 150 Mbps
            samples.append({
                'tenant': self.tenant,
                'connection': self.conn,
                'timestamp': ts,
                'inbound_bps': bps,
                'outbound_bps': bps // 2,
            })
        TelemetryIngestService.bulk_ingest(samples)

        # Finalize and Invoice
        invoice = CorporateBillingService.finalize_period_and_invoice(period, actor_username="corp_admin")

        self.assertIsNotNone(invoice)
        self.assertTrue(invoice.invoice_no.startswith("CORP-INV-"))
        self.assertEqual(invoice.customer, self.customer)
        self.assertEqual(invoice.tenant, self.tenant)

        # Check period update
        period.refresh_from_db()
        self.assertEqual(period.status, PeriodCalculationStatus.INVOICED)
        self.assertEqual(period.invoice, invoice)
        self.assertIsNotNone(period.finalized_at)

        # Verify InvoiceLines
        lines = InvoiceLine.objects.filter(invoice=invoice)
        self.assertEqual(lines.count(), 2)

        # Base CIR line
        line1 = lines.filter(description__icontains="Corporate Base CIR").first()
        self.assertIsNotNone(line1)
        self.assertEqual(line1.unit_price, Decimal("50000.00"))
        self.assertEqual(line1.total, Decimal("50000.00"))

        # Burstable Overage line
        line2 = lines.filter(description__icontains="95th Percentile Burst Overage").first()
        self.assertIsNotNone(line2)
        self.assertEqual(line2.unit_price, Decimal("300.00"))
        # 95th percentile of 1.5 to 150 Mbps is 142.500 Mbps -> burst is 42.500 Mbps
        self.assertEqual(line2.quantity, Decimal("42.500"))
        self.assertEqual(line2.total, Decimal("12750.00"))  # 42.5 * 300 = 12750.00

        # Total invoice payable = 50000 + 12750 = 62750.00
        self.assertEqual(invoice.total_payable, Decimal("62750.00"))

        # Verify single-ledger LedgerEntry
        ledger_entry = LedgerEntry.objects.filter(
            tenant=self.tenant,
            customer=self.customer,
            entry_type=LedgerEntry.EntryType.INVOICE,
            reference_id=str(invoice.id)
        ).first()
        self.assertIsNotNone(ledger_entry)
        self.assertEqual(ledger_entry.amount, Decimal("62750.00"))
        self.assertEqual(ledger_entry.created_by, "corp_admin")

        # Verify BillingAccount balance
        account = BillingAccount.objects.get(tenant=self.tenant, customer=self.customer)
        self.assertEqual(account.total_invoiced, Decimal("62750.00"))
        self.assertEqual(account.balance, Decimal("-62750.00"))

    def test_invoice_creation_without_burst(self):
        """
        When traffic is strictly within CIR (e.g. 50 Mbps < 100 Mbps CIR),
        only 1 itemized line (Base CIR) is created and burst charge is 0.
        """
        base_time = datetime.datetime(2026, 9, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        period_end = base_time + datetime.timedelta(seconds=100 * 300)

        period = CorporateBillingPeriod.objects.create(
            tenant=self.tenant,
            corporate_customer=self.corp_cust,
            period_start=base_time,
            period_end=period_end,
            status=PeriodCalculationStatus.OPEN,
        )

        samples = []
        for i in range(1, 101):
            ts = base_time + datetime.timedelta(seconds=(i - 1) * 300)
            samples.append({
                'tenant': self.tenant,
                'connection': self.conn,
                'timestamp': ts,
                'inbound_bps': 40_000_000,
                'outbound_bps': 20_000_000,
            })
        TelemetryIngestService.bulk_ingest(samples)

        invoice = CorporateBillingService.finalize_period_and_invoice(period, actor_username="corp_admin")

        period.refresh_from_db()
        self.assertEqual(period.burst_mbps, Decimal("0.000"))
        self.assertEqual(period.burst_charge, Decimal("0.00"))
        self.assertEqual(period.total_payable, Decimal("50000.00"))

        lines = InvoiceLine.objects.filter(invoice=invoice)
        self.assertEqual(lines.count(), 1)
        self.assertIn("Corporate Base CIR", lines[0].description)

    def test_reject_invoicing_with_insufficient_data(self):
        """
        Cannot invoice a period that failed the 80% coverage quality gate.
        """
        base_time = datetime.datetime(2026, 9, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        period_end = base_time + datetime.timedelta(seconds=100 * 300)

        period = CorporateBillingPeriod.objects.create(
            tenant=self.tenant,
            corporate_customer=self.corp_cust,
            period_start=base_time,
            period_end=period_end,
            status=PeriodCalculationStatus.OPEN,
        )

        # Ingest only 50 samples out of 100
        samples = []
        for i in range(1, 51):
            ts = base_time + datetime.timedelta(seconds=(i - 1) * 300)
            samples.append({
                'tenant': self.tenant,
                'connection': self.conn,
                'timestamp': ts,
                'inbound_bps': 40_000_000,
                'outbound_bps': 20_000_000,
            })
        TelemetryIngestService.bulk_ingest(samples)

        with self.assertRaises(ValidationError) as ctx:
            CorporateBillingService.finalize_period_and_invoice(period)

        self.assertIn("Insufficient sample coverage", str(ctx.exception))

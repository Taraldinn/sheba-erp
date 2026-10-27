import datetime
from decimal import Decimal
from django.test import TestCase

from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router
from apps.corporate.models import (
    CorporateCustomer,
    CorporateCustomerStatus,
    BillingCycle,
    AggregationPolicy,
    CorporateConnection,
    ConnectionStatus,
    CorporateTrafficSample,
    CorporateBillingPeriod,
    PeriodCalculationStatus,
)
from apps.corporate.services.p95_calculator import P95CalculationEngine
from apps.corporate.services.telemetry import TelemetryIngestService


class P95CalculationEngineTests(TestCase):
    """
    Tests for the deterministic 95th-percentile (p95) bandwidth calculation engine.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Apex Enterprise ISP", slug="apex-ent", is_active=True)

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-ENT-001",
            full_name="Square Pharmaceuticals Ltd.",
            mobile="+8801711222333",
            pppoe_username="square_pharma",
            status=CustomerStatus.ACTIVE,
        )

        self.corp_cust = CorporateCustomer.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            company_name="Square Pharmaceuticals Ltd.",
            contact_person="VP Infrastructure",
            billing_contact_email="it@squarepharma.com",
            billing_contact_phone="+8801711222333",
            committed_bandwidth_mbps=50,  # 50 Mbps CIR
            burst_rate_per_mbps=Decimal("500.00"),  # 500 BDT per Mbps over CIR
            base_monthly_fee=Decimal("15000.00"),
            billing_cycle=BillingCycle.CALENDAR_MONTH,
            aggregation_policy=AggregationPolicy.AGGREGATE_SUM,
            status=CorporateCustomerStatus.ACTIVE,
        )

        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Apex Core Agg 1",
            ip_address="10.0.0.1",
            username="admin",
            password="pwd"
        )

        self.conn1 = CorporateConnection.objects.create(
            tenant=self.tenant,
            corporate_customer=self.corp_cust,
            circuit_id="CKT-SQ-001",
            name="Plant 1 Primary Circuit",
            service_location="Gazipur Industrial Zone",
            router=self.router,
            interface_name="sfp-sfpplus1",
            committed_bandwidth_mbps=50,
            status=ConnectionStatus.ACTIVE,
        )

    def test_p95_deterministic_calculation_with_fixture(self):
        """
        Creates exactly 100 samples of 5-minute buckets (from 1 Mbps up to 100 Mbps).
        Verifies rank index ceil(0.95 * 100) - 1 = 94, giving exactly 95.000 Mbps.
        Verifies CIR=50 Mbps -> burst=45.000 Mbps -> burst charge=22,500.00 -> total=37,500.00.
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

        # Generate 100 samples: 1 Mbps to 100 Mbps
        samples = []
        for i in range(1, 101):
            ts = base_time + datetime.timedelta(seconds=(i - 1) * 300)
            bps = i * 1_000_000
            samples.append({
                'tenant': self.tenant,
                'connection': self.conn1,
                'timestamp': ts,
                'inbound_bps': bps,
                'outbound_bps': bps // 2,
            })
        TelemetryIngestService.bulk_ingest(samples)

        # Execute calculation
        res = P95CalculationEngine.calculate_period(period)

        self.assertEqual(res.status, PeriodCalculationStatus.CALCULATED)
        self.assertEqual(res.total_samples, 100)
        self.assertEqual(res.coverage_percent, Decimal("100.00"))
        self.assertEqual(res.p95_billable_mbps, Decimal("95.000"))
        self.assertEqual(res.p95_inbound_mbps, Decimal("95.000"))
        self.assertEqual(res.p95_outbound_mbps, Decimal("47.500"))
        self.assertEqual(res.committed_mbps, 50)
        self.assertEqual(res.burst_mbps, Decimal("45.000"))
        self.assertEqual(res.base_charge, Decimal("15000.00"))
        self.assertEqual(res.burst_charge, Decimal("22500.00"))
        self.assertEqual(res.total_payable, Decimal("37500.00"))

    def test_p95_coverage_quality_gate(self):
        """
        Period requires 100 buckets.
        With only 70 buckets (70% < 80%), calculation sets INSUFFICIENT_DATA and does not bill.
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

        # Ingest only 70 samples
        samples = []
        for i in range(1, 71):
            ts = base_time + datetime.timedelta(seconds=(i - 1) * 300)
            samples.append({
                'tenant': self.tenant,
                'connection': self.conn1,
                'timestamp': ts,
                'inbound_bps': 20_000_000,
                'outbound_bps': 30_000_000,
            })
        TelemetryIngestService.bulk_ingest(samples)

        res = P95CalculationEngine.calculate_period(period)
        self.assertEqual(res.status, PeriodCalculationStatus.INSUFFICIENT_DATA)
        self.assertEqual(res.coverage_percent, Decimal("70.00"))
        self.assertIn("below required 80% gate", res.calculation_metadata['gate_error'])

    def test_multi_circuit_bandwidth_aggregation(self):
        """
        Tests two circuits belonging to the same customer.
        At each 5-min bucket, bandwidth is aggregated (summed across circuits)
        before taking max(inbound, outbound).
        """
        conn2 = CorporateConnection.objects.create(
            tenant=self.tenant,
            corporate_customer=self.corp_cust,
            circuit_id="CKT-SQ-002",
            name="Plant 2 Secondary Circuit",
            service_location="Pabna Facility",
            router=self.router,
            interface_name="sfp-sfpplus2",
            committed_bandwidth_mbps=50,
            status=ConnectionStatus.ACTIVE,
        )

        base_time = datetime.datetime(2026, 9, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        period_end = base_time + datetime.timedelta(seconds=100 * 300)

        period = CorporateBillingPeriod.objects.create(
            tenant=self.tenant,
            corporate_customer=self.corp_cust,
            period_start=base_time,
            period_end=period_end,
            status=PeriodCalculationStatus.OPEN,
        )

        # Connection 1: 40 Mbps inbound, 20 Mbps outbound for 100 buckets
        # Connection 2: 30 Mbps inbound, 60 Mbps outbound for 100 buckets
        # Aggregated sum at each bucket:
        # Inbound = 40 + 30 = 70 Mbps
        # Outbound = 20 + 60 = 80 Mbps
        # Bucket max = 80 Mbps
        samples = []
        for i in range(1, 101):
            ts = base_time + datetime.timedelta(seconds=(i - 1) * 300)
            samples.append({
                'tenant': self.tenant,
                'connection': self.conn1,
                'timestamp': ts,
                'inbound_bps': 40_000_000,
                'outbound_bps': 20_000_000,
            })
            samples.append({
                'tenant': self.tenant,
                'connection': conn2,
                'timestamp': ts,
                'inbound_bps': 30_000_000,
                'outbound_bps': 60_000_000,
            })
        TelemetryIngestService.bulk_ingest(samples)

        res = P95CalculationEngine.calculate_period(period)
        self.assertEqual(res.status, PeriodCalculationStatus.CALCULATED)
        self.assertEqual(res.total_samples, 100)
        self.assertEqual(res.p95_inbound_mbps, Decimal("70.000"))
        self.assertEqual(res.p95_outbound_mbps, Decimal("80.000"))
        self.assertEqual(res.p95_billable_mbps, Decimal("80.000"))
        self.assertEqual(res.burst_mbps, Decimal("30.000"))  # 80 - 50 CIR = 30 Mbps burst
        self.assertEqual(res.burst_charge, Decimal("15000.00"))  # 30 * 500 = 15,000.00
        self.assertEqual(res.total_payable, Decimal("30000.00"))  # 15000 base + 15000 burst

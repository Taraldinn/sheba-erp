import datetime
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone

from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router
from apps.corporate.models import (
    CorporateCustomer,
    CorporateCustomerStatus,
    CorporateConnection,
    ConnectionStatus,
    CorporateTrafficSample,
    CorporateBillingPeriod,
    PeriodCalculationStatus,
)
from apps.corporate.tasks import (
    collect_corporate_telemetry_for_tenant,
    calculate_corporate_p95_period_task,
    generate_monthly_corporate_invoices_for_tenant,
)
from apps.corporate.services.telemetry import TelemetryIngestService


class CorporateTaskTests(TestCase):
    """
    Unit tests verifying Celery background tasks for telemetry polling,
    period calculation, and monthly invoice generation.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Apex Enterprise ISP", slug="apex-ent", is_active=True)

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-TASK-001",
            full_name="Prime Bank Ltd.",
            mobile="+8801711555666",
            pppoe_username="prime_bank",
            status=CustomerStatus.ACTIVE,
        )

        self.corp_cust = CorporateCustomer.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            company_name="Prime Bank Ltd.",
            contact_person="CTO",
            billing_contact_email="cto@primebank.com",
            billing_contact_phone="+8801711555666",
            committed_bandwidth_mbps=100,
            burst_rate_per_mbps=Decimal("350.00"),
            base_monthly_fee=Decimal("40000.00"),
            credit_terms_days=30,
            status=CorporateCustomerStatus.ACTIVE,
        )

        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Apex Aggregator 1",
            ip_address="10.0.0.1",
            username="admin",
            password="pwd"
        )

        self.conn = CorporateConnection.objects.create(
            tenant=self.tenant,
            corporate_customer=self.corp_cust,
            circuit_id="CKT-PB-001",
            name="HQ Primary Link",
            service_location="Motijheel C/A",
            router=self.router,
            interface_name="sfp-sfpplus1",
            committed_bandwidth_mbps=100,
            status=ConnectionStatus.ACTIVE,
        )

    def test_collect_telemetry_task(self):
        res1 = collect_corporate_telemetry_for_tenant(str(self.tenant.id))
        self.assertTrue(res1['success'])
        self.assertEqual(res1['samples_created'], 1)

        # Immediate rerun within same 5-min bucket should skip duplicate
        res2 = collect_corporate_telemetry_for_tenant(str(self.tenant.id))
        self.assertTrue(res2['success'])
        self.assertEqual(res2['samples_created'], 0)

        # Verify sample exists in DB
        sample = CorporateTrafficSample.objects.filter(connection=self.conn).first()
        self.assertIsNotNone(sample)
        self.assertGreater(sample.inbound_bps, 0)
        self.assertGreater(sample.outbound_bps, 0)

    def test_calculate_p95_task(self):
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
                'inbound_bps': 80_000_000,
                'outbound_bps': 40_000_000,
            })
        TelemetryIngestService.bulk_ingest(samples)

        task_res = calculate_corporate_p95_period_task(str(period.id))
        self.assertTrue(task_res['success'])
        self.assertEqual(task_res['status'], PeriodCalculationStatus.CALCULATED)
        self.assertEqual(task_res['p95_billable_mbps'], '80.000')

    def test_generate_monthly_corporate_invoices_task(self):
        # Create a period that has already ended
        past_start = timezone.now() - datetime.timedelta(days=32)
        past_end = timezone.now() - datetime.timedelta(days=2)

        period = CorporateBillingPeriod.objects.create(
            tenant=self.tenant,
            corporate_customer=self.corp_cust,
            period_start=past_start,
            period_end=past_end,
            status=PeriodCalculationStatus.OPEN,
        )

        # Ingest samples
        samples = []
        # Need >= 80% coverage
        total_buckets = int((past_end - past_start).total_seconds() // 300)
        for i in range(total_buckets):
            ts = past_start + datetime.timedelta(seconds=i * 300)
            samples.append({
                'tenant': self.tenant,
                'connection': self.conn,
                'timestamp': ts,
                'inbound_bps': 50_000_000,
                'outbound_bps': 25_000_000,
            })
        TelemetryIngestService.bulk_ingest(samples)

        task_res = generate_monthly_corporate_invoices_for_tenant(str(self.tenant.id))
        self.assertTrue(task_res['success'])
        self.assertEqual(task_res['invoiced_count'], 1)

        period.refresh_from_db()
        self.assertEqual(period.status, PeriodCalculationStatus.INVOICED)
        self.assertIsNotNone(period.invoice)

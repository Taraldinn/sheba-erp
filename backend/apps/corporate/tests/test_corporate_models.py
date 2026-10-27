import uuid
import datetime
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.db import IntegrityError, transaction

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
    ConnectionType,
    CorporateIPPool,
    CorporateIPAddress,
    IPAddressStatus,
    CorporateVLAN,
    CorporateTrafficSample,
    TelemetryCollectionStatus,
    CorporateBillingPeriod,
    PeriodCalculationStatus,
)


class CorporateModelTests(TestCase):
    """
    Unit tests verifying data integrity, multi-tenancy, and constraints
    for Stage 11 Corporate / Enterprise models.
    """

    def setUp(self):
        # Tenant A
        self.tenant_a = Tenant.objects.create(name="Apex Enterprise ISP", slug="apex-ent", is_active=True)
        # Tenant B
        self.tenant_b = Tenant.objects.create(name="Vertex Telecom", slug="vertex-tel", is_active=True)

        # Base Customers
        self.base_cust_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="CUST-ACME-01",
            full_name="ACME Corporation",
            mobile="+8801711000000",
            pppoe_username="acme_corp_user",
            status=CustomerStatus.ACTIVE
        )
        self.base_cust_b = Customer.objects.create(
            tenant=self.tenant_b,
            customer_code="CUST-GLOBEX-01",
            full_name="Globex Inc",
            mobile="+8801711999999",
            pppoe_username="globex_corp_user",
            status=CustomerStatus.ACTIVE
        )

        # Routers
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name="Apex Core Aggregator 1",
            ip_address="10.0.0.1",
            username="admin",
            password="securepassword"
        )
        self.router_b = Router.objects.create(
            tenant=self.tenant_b,
            name="Vertex Border Gateway 1",
            ip_address="10.10.0.1",
            username="admin",
            password="securepassword"
        )

    def test_create_corporate_customer(self):
        corp_cust = CorporateCustomer.objects.create(
            tenant=self.tenant_a,
            customer=self.base_cust_a,
            company_name="ACME Holdings Ltd.",
            contact_person="John Doe",
            billing_contact_email="billing@acme.com",
            billing_contact_phone="+8801711000000",
            committed_bandwidth_mbps=100,
            burst_rate_per_mbps=Decimal("150.00"),
            base_monthly_fee=Decimal("25000.00"),
            billing_cycle=BillingCycle.CALENDAR_MONTH,
            aggregation_policy=AggregationPolicy.AGGREGATE_SUM,
            status=CorporateCustomerStatus.ACTIVE,
        )
        self.assertIsNotNone(corp_cust.id)
        self.assertEqual(corp_cust.tenant, self.tenant_a)
        self.assertEqual(corp_cust.customer, self.base_cust_a)
        self.assertEqual(corp_cust.committed_bandwidth_mbps, 100)
        self.assertEqual(corp_cust.burst_rate_per_mbps, Decimal("150.00"))
        self.assertEqual(corp_cust.base_monthly_fee, Decimal("25000.00"))

    def test_corporate_customer_unique_per_tenant(self):
        CorporateCustomer.objects.create(
            tenant=self.tenant_a,
            customer=self.base_cust_a,
            company_name="ACME Holdings Ltd.",
            contact_person="John Doe",
            billing_contact_email="billing@acme.com",
            billing_contact_phone="+8801711000000",
            status=CorporateCustomerStatus.ACTIVE,
        )
        # Creating another corporate profile for same base customer in same tenant should fail (1:1 constraint)
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                CorporateCustomer.objects.create(
                    tenant=self.tenant_a,
                    customer=self.base_cust_a,
                    company_name="ACME Clone",
                    contact_person="Jane Doe",
                    billing_contact_email="billing2@acme.com",
                    billing_contact_phone="+8801711000001",
                    status=CorporateCustomerStatus.ACTIVE,
                )

    def test_create_corporate_connection(self):
        corp_cust = CorporateCustomer.objects.create(
            tenant=self.tenant_a,
            customer=self.base_cust_a,
            company_name="ACME Holdings Ltd.",
            contact_person="John Doe",
            billing_contact_email="billing@acme.com",
            billing_contact_phone="+8801711000000",
            status=CorporateCustomerStatus.ACTIVE,
        )
        conn = CorporateConnection.objects.create(
            tenant=self.tenant_a,
            corporate_customer=corp_cust,
            circuit_id="CKT-ACME-001",
            name="Head Office Leased Line",
            service_location="100 Tech Park, Building A",
            connection_type=ConnectionType.LEASED_LINE,
            router=self.router_a,
            interface_name="sfp-sfpplus1",
            committed_bandwidth_mbps=100,
            burst_bandwidth_cap_mbps=200,
            status=ConnectionStatus.ACTIVE,
        )
        self.assertIsNotNone(conn.id)
        self.assertEqual(conn.circuit_id, "CKT-ACME-001")
        self.assertEqual(conn.committed_bandwidth_mbps, 100)
        self.assertEqual(conn.burst_bandwidth_cap_mbps, 200)

        # Uniqueness of circuit_id within tenant
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                CorporateConnection.objects.create(
                    tenant=self.tenant_a,
                    corporate_customer=corp_cust,
                    circuit_id="CKT-ACME-001",  # duplicate circuit ID in same tenant
                    name="Branch Office",
                    service_location="200 Tech Park",
                    status=ConnectionStatus.ACTIVE,
                )

        # Same circuit ID in different tenant should succeed
        corp_cust_b = CorporateCustomer.objects.create(
            tenant=self.tenant_b,
            customer=self.base_cust_b,
            company_name="Globex Corp",
            contact_person="Hank Scorpio",
            billing_contact_email="scorpio@globex.com",
            billing_contact_phone="+8801711999999",
            status=CorporateCustomerStatus.ACTIVE,
        )
        conn_b = CorporateConnection.objects.create(
            tenant=self.tenant_b,
            corporate_customer=corp_cust_b,
            circuit_id="CKT-ACME-001",  # allowed in tenant B
            name="Globex HQ Link",
            service_location="Globex HQ",
            status=ConnectionStatus.ACTIVE,
        )
        self.assertEqual(conn_b.tenant, self.tenant_b)

    def test_ip_pool_and_address_lifecycle(self):
        pool = CorporateIPPool.objects.create(
            tenant=self.tenant_a,
            name="ACME Dedicated Subnet",
            network_cidr="198.51.100.0/29",
            gateway="198.51.100.1",
        )
        ip = CorporateIPAddress.objects.create(
            tenant=self.tenant_a,
            pool=pool,
            ip_address="198.51.100.2",
            status=IPAddressStatus.AVAILABLE,
        )
        self.assertEqual(ip.status, IPAddressStatus.AVAILABLE)

        # Uniqueness of IP within tenant
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                CorporateIPAddress.objects.create(
                    tenant=self.tenant_a,
                    pool=pool,
                    ip_address="198.51.100.2",
                    status=IPAddressStatus.AVAILABLE,
                )

    def test_vlan_assignment_uniqueness(self):
        vlan = CorporateVLAN.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            vlan_id=1001,
            name="ACME Dedicated VLAN",
            description="VLAN for ACME HQ",
        )
        self.assertEqual(vlan.vlan_id, 1001)

        # Same router + same vlan_id in same tenant cannot be created twice
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                CorporateVLAN.objects.create(
                    tenant=self.tenant_a,
                    router=self.router_a,
                    vlan_id=1001,
                    name="ACME Duplicate VLAN",
                )

        # Same vlan_id on DIFFERENT router in tenant A is permitted
        router_a2 = Router.objects.create(
            tenant=self.tenant_a,
            name="Apex Core Aggregator 2",
            ip_address="10.0.0.2",
            username="admin",
            password="pwd"
        )
        vlan2 = CorporateVLAN.objects.create(
            tenant=self.tenant_a,
            router=router_a2,
            vlan_id=1001,
            name="ACME Secondary VLAN",
        )
        self.assertIsNotNone(vlan2.id)

    def test_traffic_sample_and_billing_period(self):
        corp_cust = CorporateCustomer.objects.create(
            tenant=self.tenant_a,
            customer=self.base_cust_a,
            company_name="ACME Holdings Ltd.",
            contact_person="John Doe",
            billing_contact_email="billing@acme.com",
            billing_contact_phone="+8801711000000",
            status=CorporateCustomerStatus.ACTIVE,
        )
        conn = CorporateConnection.objects.create(
            tenant=self.tenant_a,
            corporate_customer=corp_cust,
            circuit_id="CKT-SAMPLE-01",
            name="Sample Circuit",
            service_location="HQ",
            status=ConnectionStatus.ACTIVE,
        )
        now = timezone.now()
        sample = CorporateTrafficSample.objects.create(
            tenant=self.tenant_a,
            connection=conn,
            timestamp=now,
            inbound_bps=50_000_000,
            outbound_bps=80_000_000,
            inbound_bytes=1875000000,
            outbound_bytes=3000000000,
            collection_status=TelemetryCollectionStatus.SUCCESS,
        )
        self.assertEqual(sample.inbound_bps, 50_000_000)
        self.assertEqual(sample.outbound_bps, 80_000_000)

        # Billing Period
        start_date = datetime.datetime(2026, 9, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        end_date = datetime.datetime(2026, 9, 30, 23, 59, 59, tzinfo=datetime.timezone.utc)
        period = CorporateBillingPeriod.objects.create(
            tenant=self.tenant_a,
            corporate_customer=corp_cust,
            period_start=start_date,
            period_end=end_date,
            status=PeriodCalculationStatus.OPEN,
        )
        self.assertEqual(period.status, PeriodCalculationStatus.OPEN)

        # Unique period per customer
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                CorporateBillingPeriod.objects.create(
                    tenant=self.tenant_a,
                    corporate_customer=corp_cust,
                    period_start=start_date,
                    period_end=end_date,
                    status=PeriodCalculationStatus.OPEN,
                )


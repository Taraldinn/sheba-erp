import datetime
from decimal import Decimal
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router
from apps.authentication.models import Role, Permission, StaffMembership
from apps.authentication.services.rbac import ensure_permission_catalog
from apps.corporate.models import (
    CorporateCustomer,
    CorporateCustomerStatus,
    CorporateConnection,
    ConnectionStatus,
    CorporateIPPool,
    CorporateIPAddress,
    IPAddressStatus,
    CorporateVLAN,
    CorporateTrafficSample,
    CorporateBillingPeriod,
    PeriodCalculationStatus,
)
from apps.corporate.services.telemetry import TelemetryIngestService

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class CorporateAPITests(TestCase):
    """
    End-to-end integration tests for Corporate REST API endpoints.
    """

    def setUp(self):
        self.client = APIClient()
        ensure_permission_catalog()

        # Tenant A
        self.tenant_a = Tenant.objects.create(name="Apex Enterprise ISP", slug="apex-ent", is_active=True)
        self.domain_a = TenantDomain.objects.create(tenant=self.tenant_a, hostname="apex.shebafi.xyz", is_active=True)

        # Tenant B
        self.tenant_b = Tenant.objects.create(name="Vertex Telecom", slug="vertex-tel", is_active=True)
        self.domain_b = TenantDomain.objects.create(tenant=self.tenant_b, hostname="vertex.shebafi.xyz", is_active=True)

        # User in Tenant A with full corporate permissions
        self.user_a = User.objects.create_user(username="apex_admin", password="password123")
        self.role_a = Role.objects.create(tenant=self.tenant_a, name="Corporate Director")
        corp_perms = Permission.objects.filter(module__in=['corporate', 'customers', 'billing', 'network'])
        self.role_a.permissions.set(corp_perms)
        self.membership_a = StaffMembership.objects.create(
            user=self.user_a, tenant=self.tenant_a, role=self.role_a, is_active=True
        )

        # Base Customer in Tenant A
        self.base_cust_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="CUST-ACME-01",
            full_name="ACME Holdings Inc",
            mobile="+8801711000000",
            pppoe_username="acme_corp",
            status=CustomerStatus.ACTIVE,
        )

        # Router in Tenant A
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name="Apex Core Agg 1",
            ip_address="10.0.0.1",
            username="admin",
            password="pwd"
        )

        # Pre-seed a CorporateCustomer in Tenant A
        self.corp_cust_a = CorporateCustomer.objects.create(
            tenant=self.tenant_a,
            customer=self.base_cust_a,
            company_name="ACME Holdings Inc",
            contact_person="Director Tech",
            billing_contact_email="tech@acme.com",
            billing_contact_phone="+8801711000000",
            committed_bandwidth_mbps=100,
            burst_rate_per_mbps=Decimal("400.00"),
            base_monthly_fee=Decimal("30000.00"),
            credit_terms_days=30,
            status=CorporateCustomerStatus.ACTIVE,
        )

        # Host-based authentication header
        self.client.force_authenticate(user=self.user_a)
        self.extra = {'HTTP_HOST': 'apex.shebafi.xyz'}

    def test_list_corporate_customers(self):
        resp = self.client.get('/api/v1/corporate/customers/', **self.extra)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        results = data.get('results', data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['company_name'], "ACME Holdings Inc")
        self.assertEqual(results[0]['committed_bandwidth_mbps'], 100)

    def test_corporate_customer_summary(self):
        resp = self.client.get(f'/api/v1/corporate/customers/{self.corp_cust_a.id}/summary/', **self.extra)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data['company_name'], "ACME Holdings Inc")
        self.assertIn('total_committed_cir_mbps', data)
        self.assertIn('assigned_ips', data)

    def test_connection_lifecycle_and_actions(self):
        # 1. Create connection
        post_data = {
            'corporate_customer': str(self.corp_cust_a.id),
            'circuit_id': 'CKT-ACME-PRIMARY',
            'name': 'Primary Fiber Link',
            'service_location': 'Gulshan 2, Tower A',
            'connection_type': 'LEASED_LINE',
            'router': str(self.router_a.id),
            'interface_name': 'sfp-sfpplus1',
            'committed_bandwidth_mbps': 100,
            'burst_bandwidth_cap_mbps': 200,
            'status': 'ACTIVE',
        }
        resp = self.client.post('/api/v1/corporate/connections/', data=post_data, format='json', **self.extra)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        conn_id = resp.json()['id']

        # 2. Create IP pool & populate hosts
        pool = CorporateIPPool.objects.create(
            tenant=self.tenant_a,
            name="Dedicated Pool 1",
            network_cidr="198.51.100.0/29",
            gateway="198.51.100.1",
        )
        pop_resp = self.client.post(f'/api/v1/corporate/ip-pools/{pool.id}/populate-hosts/', **self.extra)
        self.assertEqual(pop_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(pop_resp.json()['created_count'], 5)

        # 3. Action allocate-ip on connection
        alloc_resp = self.client.post(
            f'/api/v1/corporate/connections/{conn_id}/allocate-ip/',
            data={'pool_id': str(pool.id), 'notes': 'Primary WAN interface'},
            format='json',
            **self.extra
        )
        self.assertEqual(alloc_resp.status_code, status.HTTP_201_CREATED)
        allocated_ip = alloc_resp.json()['ip_address']
        self.assertEqual(allocated_ip, "198.51.100.2")

        # 4. Action assign-vlan on connection
        vlan_resp = self.client.post(
            f'/api/v1/corporate/connections/{conn_id}/assign-vlan/',
            data={
                'router_id': str(self.router_a.id),
                'vlan_id': 1050,
                'name': 'VLAN-ACME-1050',
                'interface_name': 'sfp-sfpplus1',
            },
            format='json',
            **self.extra
        )
        self.assertEqual(vlan_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(vlan_resp.json()['vlan_id'], 1050)

        # 5. Action release-vlan
        rel_vlan_resp = self.client.post(f'/api/v1/corporate/connections/{conn_id}/release-vlan/', **self.extra)
        self.assertEqual(rel_vlan_resp.status_code, status.HTTP_200_OK)

    def test_telemetry_mrtg_graph_endpoint(self):
        conn = CorporateConnection.objects.create(
            tenant=self.tenant_a,
            corporate_customer=self.corp_cust_a,
            circuit_id="CKT-GRAPH-01",
            name="Graph Test Circuit",
            service_location="NOC",
            status=ConnectionStatus.ACTIVE,
        )

        now = timezone.now()
        for i in range(10):
            ts = now - datetime.timedelta(minutes=5 * (10 - i))
            CorporateTrafficSample.objects.create(
                tenant=self.tenant_a,
                connection=conn,
                timestamp=ts,
                inbound_bps=50_000_000,
                outbound_bps=30_000_000,
            )

        resp = self.client.get(
            f'/api/v1/corporate/telemetry/mrtg-graph/?connection_id={conn.id}&hours=24',
            **self.extra
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data['total_points'], 10)
        self.assertEqual(len(data['points']), 10)
        self.assertEqual(data['points'][0]['inbound_mbps'], 50.0)
        self.assertEqual(data['points'][0]['outbound_mbps'], 30.0)

    def test_billing_period_calculation_and_invoicing_api(self):
        conn = CorporateConnection.objects.create(
            tenant=self.tenant_a,
            corporate_customer=self.corp_cust_a,
            circuit_id="CKT-BILL-01",
            name="Billing Test Circuit",
            service_location="DC1",
            status=ConnectionStatus.ACTIVE,
        )

        base_time = datetime.datetime(2026, 9, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        period_end = base_time + datetime.timedelta(seconds=100 * 300)

        period = CorporateBillingPeriod.objects.create(
            tenant=self.tenant_a,
            corporate_customer=self.corp_cust_a,
            period_start=base_time,
            period_end=period_end,
            status=PeriodCalculationStatus.OPEN,
        )

        # Ingest 100 samples from 1 to 100 Mbps
        samples = []
        for i in range(1, 101):
            ts = base_time + datetime.timedelta(seconds=(i - 1) * 300)
            bps = i * 1_500_000  # 1.5 to 150 Mbps
            samples.append({
                'tenant': self.tenant_a,
                'connection': conn,
                'timestamp': ts,
                'inbound_bps': bps,
                'outbound_bps': bps // 2,
            })
        TelemetryIngestService.bulk_ingest(samples)

        # 1. Trigger calculate action
        calc_resp = self.client.post(f'/api/v1/corporate/billing-periods/{period.id}/calculate/', **self.extra)
        self.assertEqual(calc_resp.status_code, status.HTTP_200_OK)
        calc_data = calc_resp.json()
        self.assertEqual(calc_data['status'], 'CALCULATED')
        self.assertEqual(calc_data['p95_billable_mbps'], '142.500')
        self.assertEqual(calc_data['burst_mbps'], '42.500')

        # 2. Trigger finalize-invoice action
        inv_resp = self.client.post(f'/api/v1/corporate/billing-periods/{period.id}/finalize-invoice/', **self.extra)
        self.assertEqual(inv_resp.status_code, status.HTTP_200_OK)
        inv_data = inv_resp.json()
        self.assertTrue(inv_data['invoice_no'].startswith("CORP-INV-"))
        self.assertEqual(inv_data['status'], 'INVOICED')

    def test_multi_tenant_isolation(self):
        # A request to Tenant B trying to retrieve Tenant A's corporate customer must return 404
        extra_b = {'HTTP_HOST': 'vertex.shebafi.xyz'}
        resp = self.client.get(f'/api/v1/corporate/customers/{self.corp_cust_a.id}/', **extra_b)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

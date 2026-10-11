"""
Phase 20 Test Suite: Authoritative Network Topology + Impact Analysis.
Validates the chain: Internet → Router → POP → OLT → PON → ONU → Customer.
Verifies drill-down pagination, health indicators, multi-tier blast-radius calculations,
and strict multi-tenant isolation.
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.network.models import Router, OLT, ONU, UserSession, POPBranch
from apps.network.services.topology import NetworkTopologyService

User = get_user_model()


class Phase20TopologyAndImpactTests(TestCase):
    def setUp(self):
        # Tenant A setup
        self.tenant = Tenant.objects.create(name="Phase20 ISP", slug="phase20", domain="phase20.sheba.net")
        self.user = User.objects.create_user(username="phase20_admin", password="password123")
        StaffProfile.objects.create(user=self.user, tenant=self.tenant, role=UserRole.ADMIN)

        # Tenant B setup (for tenant isolation tests)
        self.tenant_b = Tenant.objects.create(name="Rival ISP", slug="rival", domain="rival.sheba.net")
        self.user_b = User.objects.create_user(username="rival_admin", password="password123")
        StaffProfile.objects.create(user=self.user_b, tenant=self.tenant_b, role=UserRole.ADMIN)

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_HOST'] = 'phase20.sheba.net'

        # Packages
        self.package_50mbps = Package.objects.create(
            tenant=self.tenant,
            name="Super 50Mbps",
            speed_mbps=50,
            regular_price=Decimal("1200.00")
        )
        self.package_20mbps = Package.objects.create(
            tenant=self.tenant,
            name="Standard 20Mbps",
            speed_mbps=20,
            regular_price=Decimal("800.00")
        )

        # 1. Router
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core-BNG-01",
            ip_address="172.16.0.1",
            status="Online",
            cpu_usage=35,
            memory_usage=45,
            active_pppoe_count=2
        )

        # 2. POP linked to Router
        self.pop = POPBranch.objects.create(
            tenant=self.tenant,
            name="Dhanmondi POP",
            code="POP-DHM",
            location="Dhanmondi 27",
            status="Active",
            upstream_router=self.router,
            power_backup="Generator"
        )

        # 3. OLT linked to POP and Router
        self.olt = OLT.objects.create(
            tenant=self.tenant,
            name="Huawei-MA5800-X7",
            brand="Huawei",
            ip_address="192.168.10.1",
            pop_branch=self.pop,
            upstream_router=self.router,
            status="Online",
            total_onus=4,
            online_onus=3
        )

        # 4. Customers subscribed to package on Router
        self.customer1 = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-001",
            full_name="Rafiqul Islam",
            pppoe_username="rafiq_dhm",
            pppoe_password="pass",
            mobile="01711000001",
            router=self.router,
            package=self.package_50mbps,
            monthly_bill=Decimal("1200.00"),
            status=CustomerStatus.ACTIVE
        )
        self.customer2 = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-002",
            full_name="Fatema Begum",
            pppoe_username="fatema_dhm",
            pppoe_password="pass",
            mobile="01711000002",
            router=self.router,
            package=self.package_20mbps,
            monthly_bill=Decimal("800.00"),
            status=CustomerStatus.ACTIVE
        )
        self.customer3 = Customer.objects.create(
            tenant=self.tenant,
            customer_code="CUST-003",
            full_name="Zubair Ahmed",
            pppoe_username="zubair_dhm",
            pppoe_password="pass",
            mobile="01711000003",
            router=self.router,
            package=self.package_20mbps,
            monthly_bill=Decimal("800.00"),
            status=CustomerStatus.ACTIVE
        )

        # 5. ONUs on PON ports bound to customers
        self.onu1 = ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            pon_port="GPON0/1",
            serial_number="HWTC12345601",
            mac_address="A0:B1:C2:D3:E4:01",
            status="Online",
            optical_status="Normal",
            rx_power=Decimal("-21.50"),
            customer=self.customer1
        )
        self.onu2 = ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            pon_port="GPON0/1",
            serial_number="HWTC12345602",
            mac_address="A0:B1:C2:D3:E4:02",
            status="Online",
            optical_status="Warning",
            rx_power=Decimal("-28.50"),  # Optical warning (< -27 dBm)
            customer=self.customer2
        )
        self.onu3 = ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            pon_port="GPON0/2",
            serial_number="HWTC12345603",
            mac_address="A0:B1:C2:D3:E4:03",
            status="Online",
            optical_status="Normal",
            rx_power=Decimal("-22.10"),
            customer=self.customer3
        )

        # Live session for Customer 1 and 2
        UserSession.objects.create(
            tenant=self.tenant,
            router=self.router,
            username="rafiq_dhm",
            ip_address="100.64.0.10",
            mac_address="A0:B1:C2:D3:E4:01"
        )
        UserSession.objects.create(
            tenant=self.tenant,
            router=self.router,
            username="fatema_dhm",
            ip_address="100.64.0.11",
            mac_address="A0:B1:C2:D3:E4:02"
        )

        # Tenant B device to ensure strict tenant isolation
        self.router_b = Router.objects.create(
            tenant=self.tenant_b,
            name="Rival-Core-Router",
            ip_address="10.200.0.1",
            status="Online"
        )
        self.pop_b = POPBranch.objects.create(
            tenant=self.tenant_b,
            name="Rival POP",
            code="POP-RIV",
            upstream_router=self.router_b
        )
        self.customer_b = Customer.objects.create(
            tenant=self.tenant_b,
            customer_code="RIV-001",
            full_name="Rival Customer",
            pppoe_username="rival_user",
            pppoe_password="password",
            mobile="01999999999",
            monthly_bill=Decimal("5000.00"),
            router=self.router_b
        )

    def test_authoritative_hierarchy_structure(self):
        """
        Verify the chain: Internet → Router → POP → OLT → PON.
        """
        res = self.client.get('/api/v1/network/topology/hierarchy/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        # Root: Internet
        root = data['authoritative_hierarchy']
        self.assertEqual(root['type'], 'Internet')
        self.assertEqual(root['total_routers'], 1)
        self.assertEqual(root['total_pops'], 1)
        self.assertEqual(root['total_olts'], 1)
        self.assertEqual(root['total_customers'], 3)
        self.assertEqual(root['online_customers'], 2)

        # Tier 1: Router
        routers = root['children']
        self.assertEqual(len(routers), 1)
        r_node = routers[0]
        self.assertEqual(r_node['name'], 'Core-BNG-01')
        self.assertEqual(r_node['health'], 'Online')
        self.assertEqual(r_node['pop_count'], 1)

        # Tier 2: POP
        pops = r_node['children']
        self.assertEqual(len(pops), 1)
        pop_node = pops[0]
        self.assertEqual(pop_node['name'], 'Dhanmondi POP')
        self.assertEqual(pop_node['health'], 'Degraded')  # on Generator
        self.assertEqual(pop_node['olt_count'], 1)

        # Tier 3: OLT
        olts = pop_node['children']
        self.assertEqual(len(olts), 1)
        olt_node = olts[0]
        self.assertEqual(olt_node['name'], 'Huawei-MA5800-X7')
        self.assertEqual(olt_node['brand'], 'Huawei')
        self.assertEqual(olt_node['pon_count'], 2)

        # Tier 4: PON
        pons = olt_node['children']
        self.assertEqual(len(pons), 2)
        pon1 = next(p for p in pons if p['name'] == 'GPON0/1')
        self.assertEqual(pon1['total_onus'], 2)
        self.assertEqual(pon1['alarm_onus'], 1)  # onu2 has -28.5 dBm
        self.assertEqual(pon1['health'], 'Warning')
        self.assertEqual(pon1['customer_count'], 2)

    def test_router_to_pop_relationship(self):
        """
        Verify Router → POP authoritative relationship via POPBranch.upstream_router.
        """
        self.assertEqual(self.pop.upstream_router, self.router)
        self.assertIn(self.pop, self.router.downstream_pops.all())

    def test_olt_to_pop_and_onu_relationships(self):
        """
        Verify OLT → POP, ONU → OLT, and ONU → Customer relationships.
        """
        self.assertEqual(self.olt.pop_branch, self.pop)
        self.assertEqual(self.onu1.olt, self.olt)
        self.assertEqual(self.onu1.customer, self.customer1)
        self.assertEqual(self.customer1.router, self.router)
        self.assertEqual(self.customer1.package, self.package_50mbps)

    def test_topology_drilldown_pon_paginated(self):
        """
        Verify on-demand paginated drilldown protects large ISP datasets.
        """
        res = self.client.get(f'/api/v1/network/topology/drilldown/?node_type=pon&node_id={self.olt.id}_GPON0/1&page=1&page_size=1')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        self.assertEqual(data['node_type'], 'pon')
        self.assertEqual(data['total_count'], 2)
        self.assertEqual(data['total_pages'], 2)
        self.assertEqual(len(data['results']), 1)

        item = data['results'][0]
        self.assertIn('serial_number', item)
        self.assertIn('customer', item)
        self.assertIsNotNone(item['customer'])
        self.assertEqual(item['customer']['router_name'], 'Core-BNG-01')

    def test_topology_drilldown_onu_details(self):
        """
        Verify drilldown into a single ONU returns full customer and authoritative path.
        """
        res = self.client.get(f'/api/v1/network/topology/drilldown/?node_type=onu&node_id={self.onu1.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        self.assertEqual(data['node_type'], 'onu')
        self.assertEqual(data['customer']['pppoe_username'], 'rafiq_dhm')
        self.assertTrue(data['customer']['is_online'])
        self.assertEqual(data['authoritative_path']['router'], 'Core-BNG-01')
        self.assertEqual(data['authoritative_path']['pop'], 'Dhanmondi POP')
        self.assertEqual(data['authoritative_path']['olt'], 'Huawei-MA5800-X7')

    def test_router_failure_impact_analysis(self):
        """
        Simulate Router failure:
        Router DOWN → affected POPs → affected OLTs → affected ONUs → affected customers.
        """
        res = self.client.post('/api/v1/network/topology/impact/', data={
            'target_type': 'router',
            'target_id': str(self.router.id)
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        summary = data['impact_summary']
        # All 3 customers are under this router
        self.assertEqual(summary['total_subscribers_affected'], 3)
        self.assertEqual(summary['online_subscribers_affected'], 2)
        self.assertEqual(summary['offline_subscribers'], 1)

        # MRR: 1200 + 800 + 800 = 2800.00
        self.assertEqual(summary['mrr_at_risk'], '2800.00')
        self.assertEqual(summary['currency'], 'BDT')
        self.assertEqual(summary['dependent_olts_count'], 1)

        # Package breakdown
        breakdown = {p['package_name']: p['subscribers_count'] for p in data['package_breakdown']}
        self.assertEqual(breakdown['Super 50Mbps'], 1)
        self.assertEqual(breakdown['Standard 20Mbps'], 2)

    def test_olt_failure_impact_analysis(self):
        """
        Simulate OLT failure:
        OLT DOWN → affected PONs → affected ONUs → affected customers.
        """
        res = self.client.post('/api/v1/network/topology/impact/', data={
            'target_type': 'olt',
            'target_id': str(self.olt.id)
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        summary = data['impact_summary']
        self.assertEqual(summary['total_subscribers_affected'], 3)
        self.assertEqual(summary['dependent_olts_count'], 1)
        self.assertEqual(summary['dependent_pons_count'], 2)
        self.assertEqual(summary['mrr_at_risk'], '2800.00')

    def test_pop_failure_impact_analysis(self):
        """
        Simulate POP failure:
        POP DOWN → affected OLTs → affected ONUs → affected customers.
        """
        res = self.client.post('/api/v1/network/topology/impact/', data={
            'target_type': 'pop',
            'target_id': str(self.pop.id)
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        summary = data['impact_summary']
        self.assertEqual(summary['total_subscribers_affected'], 3)
        self.assertEqual(summary['dependent_olts_count'], 1)

    def test_pon_failure_impact_analysis(self):
        """
        Simulate PON port failure (only GPON0/1):
        Only affects ONUs on GPON0/1 (Customer 1 & 2), NOT Customer 3 on GPON0/2.
        """
        res = self.client.post('/api/v1/network/topology/impact/', data={
            'target_type': 'pon',
            'target_id': f"{self.olt.id}_GPON0/1"
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        summary = data['impact_summary']
        self.assertEqual(summary['total_subscribers_affected'], 2)
        self.assertEqual(summary['mrr_at_risk'], '2000.00')  # 1200 + 800

    def test_tenant_isolation_topology_and_impact(self):
        """
        Strict Tenant Isolation: Tenant B's router cannot be queried or impacted by Tenant A.
        """
        # 1. Attempt to drilldown Tenant B's router from Tenant A
        res_drill = self.client.get(f'/api/v1/network/topology/drilldown/?node_type=router&node_id={self.router_b.id}')
        self.assertEqual(res_drill.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Attempt to simulate failure on Tenant B's router from Tenant A
        res_impact = self.client.post('/api/v1/network/topology/impact/', data={
            'target_type': 'router',
            'target_id': str(self.router_b.id)
        }, format='json')
        self.assertEqual(res_impact.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Verify Tenant B's hierarchy only shows Tenant B's assets
        client_b = APIClient()
        client_b.force_authenticate(user=self.user_b)
        client_b.defaults['HTTP_HOST'] = 'rival.sheba.net'

        res_b = client_b.get('/api/v1/network/topology/hierarchy/')
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        root_b = res_b.data['authoritative_hierarchy']
        self.assertEqual(root_b['total_routers'], 1)
        self.assertEqual(root_b['children'][0]['name'], 'Rival-Core-Router')
        self.assertEqual(root_b['total_customers'], 1)

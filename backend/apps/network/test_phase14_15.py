"""
Comprehensive Tests for Phase 14 (Live Sessions & Topology) and Phase 15 (OLT/ONU Reconciliation).
"""

import uuid
from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.utils import timezone
from django.core.cache import cache
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.core.models import Tenant
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.network.models import (
    Router, OLT, ONU, UserSession, UserSessionHistory,
    POPBranch, OLTReconciliationRun
)
from apps.network.services.live_sessions import LiveSessionService
from apps.network.services.topology import NetworkTopologyService
from apps.network.services.olt_reconciliation import OLTReconciliationService

User = get_user_model()


class Phase14LiveSessionsAndTopologyTests(TestCase):
    def setUp(self):
        cache.clear()
        self.tenant = Tenant.objects.create(name="Fardin ISP", slug="fardin", domain="fardin.sheba.net")
        self.other_tenant = Tenant.objects.create(name="Rival ISP", slug="rival", domain="rival.sheba.net")

        self.user = User.objects.create_user(username="netadmin", password="password123")
        StaffProfile.objects.create(user=self.user, tenant=self.tenant, role=UserRole.ADMIN)

        self.unauth_user = User.objects.create_user(username="viewer", password="password123")
        StaffProfile.objects.create(user=self.unauth_user, tenant=self.tenant, role=UserRole.SUPPORT_STAFF)

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_HOST'] = 'fardin.sheba.net'

        self.pop = POPBranch.objects.create(
            tenant=self.tenant,
            name="Banani NOC",
            code="POP-BANANI",
            latitude=Decimal("23.7937"),
            longitude=Decimal("90.4066"),
            total_capacity=2000
        )

        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core-BNG-1",
            ip_address="10.10.10.1",
            latitude=Decimal("23.7940"),
            longitude=Decimal("90.4070"),
            status="Online",
            active_pppoe_count=5
        )

        self.olt = OLT.objects.create(
            tenant=self.tenant,
            name="VSOL-Banani-OLT",
            ip_address="10.10.10.20",
            upstream_router=self.router,
            pop_branch=self.pop,
            latitude=Decimal("23.7950"),
            longitude=Decimal("90.4080"),
            pon_ports_count=8,
            status="Online"
        )

        self.pkg = Package.objects.create(
            tenant=self.tenant,
            name="50Mbps Fiber Ultra",
            speed_mbps=50,
            regular_price=Decimal("1500.00")
        )

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            router=self.router,
            package=self.pkg,
            full_name="Abir Hasan",
            customer_code="CUST-1001",
            pppoe_username="abir_hasan",
            mobile="01711223344",
            onu_mac_or_sn="VSOL01A2F1",
            monthly_bill=Decimal("1500.00"),
            status=CustomerStatus.ACTIVE,
            latitude=Decimal("23.7960"),
            longitude=Decimal("90.4090")
        )

        self.session = UserSession.objects.create(
            tenant=self.tenant,
            router=self.router,
            username="abir_hasan",
            ip_address="100.64.0.15",
            mac_address="E0:67:B3:01:A2:F1",
            caller_id="E0:67:B3:01:A2:F1",
            uptime="2d 04:12:00",
            bytes_in=1500000000,
            bytes_out=500000000,
            connected_at=timezone.now() - timezone.timedelta(hours=52)
        )

        self.onu = ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            customer=self.customer,
            customer_name=self.customer.full_name,
            pon_port="EPON0/1",
            onu_index=1,
            serial_number="VSOL01A2F1",
            mac_address="E0:67:B3:01:A2:F1",
            rx_power=Decimal("-18.50"),
            tx_power=Decimal("2.20"),
            distance_meters=850,
            status="Online"
        )

    def test_live_sessions_cached_and_enriched(self):
        """Phase 14: Verifies live PPPoE sessions list with correlation to Customer records and Redis cache."""
        res = self.client.get('/api/v1/network/live-sessions/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['count'], 1)
        session_item = data['sessions'][0]
        self.assertEqual(session_item['username'], 'abir_hasan')
        self.assertEqual(session_item['customer_name'], 'Abir Hasan')
        self.assertEqual(session_item['customer_code'], 'CUST-1001')
        self.assertEqual(session_item['ip_address'], '100.64.0.15')
        self.assertTrue(session_item['is_online'])

        # Check second call hits cache
        res2 = self.client.get('/api/v1/network/live-sessions/')
        self.assertEqual(res2.status_code, 200)
        self.assertTrue(res2.json().get('from_cache', False))

    def test_session_search(self):
        """Phase 14: Verifies instant session search across username, name, IP, and MAC."""
        res = self.client.get('/api/v1/network/live-sessions/?search=100.64.0')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['count'], 1)

        res_none = self.client.get('/api/v1/network/live-sessions/?search=nonexistent')
        self.assertEqual(res_none.status_code, 200)
        self.assertEqual(res_none.json()['count'], 0)

    @patch('apps.network.services.mikrotik.MikroTikService.disconnect_session')
    def test_terminate_session_flow(self, mock_disconnect):
        """Phase 14: Terminating session drops on MikroTik, records PostgreSQL UserSessionHistory, and invalidates cache."""
        mock_disconnect.return_value = True

        res = self.client.post('/api/v1/network/live-sessions/terminate/', {
            'username': 'abir_hasan',
            'router_id': str(self.router.id)
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['success'])
        mock_disconnect.assert_called_once_with('abir_hasan')

        # UserSession deleted from active table
        self.assertFalse(UserSession.objects.filter(tenant=self.tenant, username='abir_hasan').exists())

        # Stored in PostgreSQL UserSessionHistory
        history = UserSessionHistory.objects.filter(tenant=self.tenant, username='abir_hasan').first()
        self.assertIsNotNone(history)
        self.assertEqual(history.customer, self.customer)
        self.assertEqual(history.ip_address, '100.64.0.15')
        self.assertEqual(history.terminate_cause, 'Admin-Reset')
        self.assertGreater(history.duration_seconds, 0)

    def test_customer_session_telemetry_and_history(self):
        """Phase 14: Verifies customer network status panel with active & historical records."""
        # Create an old historical record
        UserSessionHistory.objects.create(
            tenant=self.tenant,
            router=self.router,
            customer=self.customer,
            username=self.customer.pppoe_username,
            ip_address="100.64.0.12",
            connected_at=timezone.now() - timezone.timedelta(days=2),
            disconnected_at=timezone.now() - timezone.timedelta(days=1),
            duration_seconds=86400,
            bytes_in=1000000000,
            bytes_out=300000000,
            terminate_cause="Lost-Carrier"
        )

        res = self.client.get(f'/api/v1/network/live-sessions/customer/{self.customer.id}/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['is_online'])
        self.assertIsNotNone(data['active_session'])
        self.assertEqual(data['active_session']['username'], 'abir_hasan')
        self.assertEqual(len(data['session_history']), 1)
        self.assertEqual(data['session_history'][0]['ip_address'], '100.64.0.12')
        self.assertGreater(data['aggregates']['total_bytes'], 0)

    def test_network_topology_graph(self):
        """Phase 14: Multi-tier topology graph returns POP, Router, OLT, PON, and link edges."""
        res = self.client.get('/api/v1/network/topology/')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        nodes = data['graph']['nodes']
        edges = data['graph']['edges']
        node_types = {n['type'] for n in nodes}

        self.assertIn('POP', node_types)
        self.assertIn('Router', node_types)
        self.assertIn('OLT', node_types)
        self.assertIn('PON-Port', node_types)
        self.assertGreater(len(edges), 0)
        self.assertEqual(data['summary']['total_customers'], 1)

    def test_geographical_fiber_map(self):
        """Phase 14: Geographical Fiber Map returns GeoJSON FeatureCollection with valid Point and LineString features."""
        res = self.client.get('/api/v1/network/geo-map/')
        self.assertEqual(res.status_code, 200)
        geojson = res.json()

        self.assertEqual(geojson['type'], 'FeatureCollection')
        categories = {f['properties']['category'] for f in geojson['features']}
        self.assertIn('POP', categories)
        self.assertIn('Router', categories)
        self.assertIn('OLT', categories)
        self.assertIn('Customer', categories)
        self.assertIn('FiberLink', categories)

    def test_path_and_impact_analysis(self):
        """Phase 14: Path and impact simulation calculates affected subscribers, MRR at risk, and downstream equipment."""
        res = self.client.get(f'/api/v1/network/impact-analysis/?target_type=router&target_id={self.router.id}')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data['target_type'], 'router')
        self.assertEqual(data['impact_summary']['total_subscribers_affected'], 1)
        self.assertEqual(data['impact_summary']['online_subscribers_affected'], 1)
        self.assertEqual(Decimal(data['impact_summary']['mrr_at_risk']), Decimal("1500.00"))
        self.assertGreater(len(data['path_trace']), 0)
        self.assertEqual(len(data['downstream_hardware']['olts']), 1)

    def test_terminate_session_malformed_router_id(self):
        """Phase 14: Malformed router_id is rejected with DRF 400 Bad Request."""
        res = self.client.post('/api/v1/network/live-sessions/terminate/', {
            'username': 'abir_hasan',
            'router_id': 'not-a-valid-uuid'
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('router_id', res.json())

    @patch('apps.network.services.mikrotik.MikroTikService.disconnect_session')
    def test_terminate_session_failure_on_router_error(self, mock_disconnect):
        """Phase 14: Failed disconnect returns 400 and does NOT delete session or create history."""
        mock_disconnect.return_value = False

        res = self.client.post('/api/v1/network/live-sessions/terminate/', {
            'username': 'abir_hasan',
            'router_id': str(self.router.id)
        })
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.json().get('success', True))

        # Session should still be active
        self.assertTrue(UserSession.objects.filter(tenant=self.tenant, username='abir_hasan').exists())
        # No history record created
        self.assertFalse(UserSessionHistory.objects.filter(tenant=self.tenant, username='abir_hasan').exists())

    def test_unlinked_pop_reports_zero_impact(self):
        """Phase 14: Unlinked POP reports zero affected subscribers without falling back to all tenant customers."""
        empty_pop = POPBranch.objects.create(
            tenant=self.tenant,
            name="Empty Rural POP",
            code="POP-RURAL"
        )
        res = self.client.get(f'/api/v1/network/impact-analysis/?target_type=pop&target_id={empty_pop.id}')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['impact_summary']['total_subscribers_affected'], 0)
        self.assertEqual(Decimal(data['impact_summary']['mrr_at_risk']), Decimal("0.00"))


class Phase15OLTONUReconciliationTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Fardin ISP", slug="fardin", domain="fardin.sheba.net")
        self.other_tenant = Tenant.objects.create(name="Other ISP", slug="other", domain="other.sheba.net")

        self.user = User.objects.create_user(username="fiberadmin", password="password123")
        StaffProfile.objects.create(user=self.user, tenant=self.tenant, role=UserRole.ADMIN)

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_HOST'] = 'fardin.sheba.net'

        self.olt = OLT.objects.create(
            tenant=self.tenant,
            name="Huawei-MA5683T",
            brand="HUAWEI",
            ip_address="10.20.30.2",
            pon_ports_count=16,
            status="Online"
        )

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            full_name="Tanvir Ahmed",
            customer_code="CUST-2002",
            pppoe_username="tanvir_fiber",
            mobile="01819998877",
            onu_mac_or_sn="VSOL01A2F1",
            monthly_bill=Decimal("2000.00"),
            status=CustomerStatus.ACTIVE
        )

        # Existing matched ONU in ERP
        self.onu_matched = ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            customer=self.customer,
            customer_name=self.customer.full_name,
            pon_port="EPON0/1",
            onu_index=1,
            serial_number="VSOL01A2F1",
            mac_address="E0:67:B3:01:A2:F1",
            rx_power=Decimal("-18.40"),
            status="Online",
            reconciliation_status="MATCHED"
        )

        # Existing ONU in ERP that is missing from physical OLT
        self.onu_missing = ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            pon_port="EPON0/1",
            onu_index=99,
            serial_number="ABSENT999",
            mac_address="AA:BB:CC:DD:EE:99",
            rx_power=Decimal("-20.00"),
            status="Online",
            reconciliation_status="MATCHED"
        )

    @patch('apps.network.services.olt.client.GenericSNMPOLTClient.discover_onus')
    def test_olt_hardware_reconciliation(self, mock_discover):
        """Phase 15: Hardware audit discovers MATCHED, UNKNOWN_IN_ERP, and MISSING_IN_OLT."""
        mock_discover.return_value = [
            {
                'pon_port': 'EPON0/1',
                'onu_index': 1,
                'mac_address': 'E0:67:B3:01:A2:F1',
                'serial_number': 'VSOL01A2F1',
                'rx_power': -18.40,
                'tx_power': 2.30,
                'distance_meters': 850,
                'status': 'Online'
            },
            {
                'pon_port': 'EPON0/1',
                'onu_index': 2,
                'mac_address': 'E0:67:B3:01:A2:F2',
                'serial_number': 'VSOL01A2F2',
                'rx_power': -29.50,  # Optical alert (< -27.00 dBm)
                'tx_power': 2.15,
                'distance_meters': 1420,
                'status': 'Online'
            }
        ]

        run = OLTReconciliationService.reconcile_olt_hardware(self.olt, actor_username="fiberadmin")

        self.assertEqual(run.status, OLTReconciliationRun.RunStatus.COMPLETED)
        self.assertEqual(run.matched_count, 1)  # VSOL01A2F1
        self.assertEqual(run.unknown_in_erp_count, 1)  # VSOL01A2F2
        self.assertEqual(run.missing_in_olt_count, 1)  # ABSENT999
        self.assertEqual(run.optical_alarm_count, 1)  # -29.50 dBm

        # Verify missing ONU was marked offline
        self.onu_missing.refresh_from_db()
        self.assertEqual(self.onu_missing.status, 'Offline')
        self.assertEqual(self.onu_missing.reconciliation_status, 'MISSING_IN_OLT')

        # Verify new unknown ONU was registered in ERP
        new_onu = ONU.objects.filter(tenant=self.tenant, serial_number='VSOL01A2F2').first()
        self.assertIsNotNone(new_onu)
        self.assertEqual(new_onu.reconciliation_status, 'UNKNOWN_IN_ERP')

    def test_onu_auto_match_engine(self):
        """Phase 15: Auto-matching engine matches candidate UNKNOWN ONUs to ERP Customers via serial/MAC."""
        # Create unassigned candidate ONU with serial matching self.customer.onu_mac_or_sn
        candidate_onu = ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            pon_port="EPON0/1",
            onu_index=3,
            serial_number="VSOL01A2F1",
            mac_address="E0:67:B3:01:A2:F1",
            reconciliation_status="UNKNOWN_IN_ERP"
        )

        # 1. Dry run preview
        preview = OLTReconciliationService.auto_match_onus(self.olt, dry_run=True)
        self.assertEqual(preview['matched_count'], 1)
        self.assertEqual(preview['matches'][0]['customer_id'], str(self.customer.id))
        self.assertEqual(preview['matches'][0]['confidence'], 100)

        # Candidate ONU remains unbound after dry run
        candidate_onu.refresh_from_db()
        self.assertIsNone(candidate_onu.customer)

        # 2. Execution run
        res = self.client.post('/api/v1/network/onus/auto-match/', {
            'olt_id': str(self.olt.id),
            'dry_run': False
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['matched_count'], 1)

        candidate_onu.refresh_from_db()
        self.assertEqual(candidate_onu.customer, self.customer)
        self.assertTrue(candidate_onu.auto_matched)
        self.assertEqual(candidate_onu.reconciliation_status, 'MATCHED')

    @patch('apps.network.services.olt.client.GenericSNMPOLTClient.reboot_onu')
    def test_onu_reboot_action(self, mock_reboot):
        """Phase 15: Remote reboot action sends instruction to OLT driver."""
        mock_reboot.return_value = True

        res = self.client.post(f'/api/v1/network/onus/{self.onu_matched.id}/reboot/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['success'])
        mock_reboot.assert_called_once_with('EPON0/1', 1)

    @patch('apps.network.services.olt.client.GenericSNMPOLTClient.reboot_onu')
    def test_onu_reboot_failure_response(self, mock_reboot):
        """Phase 15: False reboot result returns success: False and preserves status without setting Online."""
        mock_reboot.return_value = False
        self.onu_matched.status = "Offline"
        self.onu_matched.save(update_fields=['status'])

        res = self.client.post(f'/api/v1/network/onus/{self.onu_matched.id}/reboot/')
        self.assertEqual(res.status_code, 502)
        self.assertFalse(res.json()['success'])

        self.onu_matched.refresh_from_db()
        self.assertEqual(self.onu_matched.status, "Offline")

    def test_onu_bind_and_unbind(self):
        """Phase 15: Manual customer binding and unbinding on ONU."""
        new_cust = Customer.objects.create(
            tenant=self.tenant,
            full_name="Rasel Mia",
            pppoe_username="rasel_m",
            monthly_bill=Decimal("1200.00")
        )

        # Bind
        res_bind = self.client.post(f'/api/v1/network/onus/{self.onu_missing.id}/bind/', {
            'customer_id': str(new_cust.id)
        })
        self.assertEqual(res_bind.status_code, 200)
        self.onu_missing.refresh_from_db()
        self.assertEqual(self.onu_missing.customer, new_cust)
        self.assertEqual(self.onu_missing.reconciliation_status, 'MATCHED')

        # Unbind
        res_unbind = self.client.post(f'/api/v1/network/onus/{self.onu_missing.id}/unbind/')
        self.assertEqual(res_unbind.status_code, 200)
        self.onu_missing.refresh_from_db()
        self.assertIsNone(self.onu_missing.customer)
        self.assertEqual(self.onu_missing.reconciliation_status, 'UNKNOWN_IN_ERP')

    def test_tenant_isolation_violation_blocked(self):
        """Phase 15: Cannot bind an ONU to a customer belonging to another tenant."""
        foreign_cust = Customer.objects.create(
            tenant=self.other_tenant,
            full_name="Foreign Customer",
            pppoe_username="foreign_u",
            monthly_bill=Decimal("1000.00")
        )

        res = self.client.post(f'/api/v1/network/onus/{self.onu_matched.id}/bind/', {
            'customer_id': str(foreign_cust.id)
        })
        self.assertEqual(res.status_code, 404)

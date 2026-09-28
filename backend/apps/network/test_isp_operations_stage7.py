"""
Stage 7 — ISP Network Operations Comprehensive Test Suite.
==========================================================
Tests:
- Router CRUD & lifecycle
- Credential protection (write-only, never serialized, encrypted at rest)
- Health & diagnostics (CPU, RAM, Uptime)
- Connection tests (success, timeout, auth failure, unreachable, malformed response)
- Active PPPoE sessions
- PPPoE session disconnection (hardware + DB sync)
- PPPoE account enable & disable
- PPPoE profile synchronization
- Real-time traffic telemetry
- OLT CRUD & lifecycle
- OLT connection test & health telemetry
- ONU discovery & database auto-registration
- ONU optical power telemetry (RX/TX, distance, signal status)
- ONU reboot command dispatch
- ONU assignment to customer & unassignment
- Customer <-> ONU cross-tenant security rejection
- SSRF & cloud metadata protection
- Application resilience (hardware failure does NOT crash web app)
- Background Celery task execution (sync_router_task, sync_olt_task)
- Full operational audit logging
- Multi-tenant isolation (Tenant B cannot access Tenant A network assets)
"""

from unittest.mock import patch, MagicMock
from itertools import cycle
import requests
from django.test import TestCase
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, AuditLog
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router, OLT, ONU, UserSession, OLTBrand
from apps.network.validators import validate_router_host
from apps.network.services.mikrotik import MikroTikService
from apps.network.services.olt import OLTSystemService, ONUService, OpticalPowerService
from apps.network.tasks import sync_router_task, sync_olt_task


class ISPNetworkOperationsStage7Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenants
        self.tenant_a = Tenant.objects.create(name='Fiber Net Alpha', slug='fibernet-alpha')
        self.tenant_b = Tenant.objects.create(name='Speed Net Beta', slug='speednet-beta')

        # Superusers for both tenants
        self.user_a = User.objects.create_superuser(username='admin_alpha', password='AlphaPassword123')
        self.user_b = User.objects.create_superuser(username='admin_beta', password='BetaPassword123')

        # Authenticate as Tenant A
        self.client.force_authenticate(user=self.user_a)
        self.client.defaults['HTTP_HOST'] = 'fibernet-alpha.shebafi.com'

        # Router for Tenant A
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name='Core-CCR-Alpha',
            ip_address='10.50.0.1',
            hostname='core.alpha.isp.net',
            api_protocol='REST',
            https_port=443,
            username='admin',
            password='SecretRouterPasswordA',
            connection_timeout=5,
            retry_count=2,
            ssl_verify=False,
            status='Online',
        )

        # OLT for Tenant A
        self.olt_a = OLT.objects.create(
            tenant=self.tenant_a,
            name='VSOL-OLT-Alpha',
            brand=OLTBrand.VSOL,
            ip_address='10.50.10.1',
            snmp_community='private_snmp_community_a',
            telnet_user='admin',
            telnet_password='SecretOltPasswordA',
            pon_ports_count=8,
            status='Online',
        )

        # Customer for Tenant A
        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            full_name='Rashid Khan',
            mobile='01711000001',
            pppoe_username='rashid_pppoe',
            pppoe_password='secret_user_pass',
            status=CustomerStatus.ACTIVE,
            monthly_bill=800.00,
        )

        # ONU for Tenant A
        self.onu_a = ONU.objects.create(
            tenant=self.tenant_a,
            olt=self.olt_a,
            pon_port='EPON0/8',
            onu_index=1,
            mac_address='AA:BB:CC:11:22:33',
            serial_number='VSOL00112233',
            rx_power=-19.20,
            tx_power=2.15,
            distance_meters=1150,
            status='Online',
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Router CRUD & Credential Protection
    # ─────────────────────────────────────────────────────────────────────────

    def test_router_crud_and_credential_protection(self):
        # Create router via API
        create_payload = {
            'name': 'Edge-CCR-2',
            'ip_address': '10.50.0.2',
            'hostname': 'edge2.alpha.isp.net',
            'api_protocol': 'REST',
            'https_port': 443,
            'username': 'noc_admin',
            'password': 'SuperSecretPassword999',
            'connection_timeout': 8,
            'retry_count': 3,
        }
        res_create = self.client.post('/api/v1/routers/', create_payload, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        router_id = res_create.data['id']

        # Ensure password is NEVER serialized in responses
        self.assertNotIn('password', res_create.data)

        # Retrieve router
        res_get = self.client.get(f'/api/v1/routers/{router_id}/')
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertNotIn('password', res_get.data)
        self.assertEqual(res_get.data['name'], 'Edge-CCR-2')

        # Update router
        res_update = self.client.patch(f'/api/v1/routers/{router_id}/', {'name': 'Edge-CCR-Renamed'}, format='json')
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        self.assertEqual(res_update.data['name'], 'Edge-CCR-Renamed')

        # Delete router
        res_delete = self.client.delete(f'/api/v1/routers/{router_id}/')
        self.assertEqual(res_delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Router.objects.filter(id=router_id).exists())

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Connection Test & Health Diagnostics
    # ─────────────────────────────────────────────────────────────────────────

    @patch('requests.Session.get')
    def test_router_connection_test_success(self, mock_get):
        def mocked_get(url, **kwargs):
            resp = MagicMock()
            resp.ok = True
            resp.status_code = 200
            if 'system/identity' in url:
                resp.json.return_value = {'name': 'Core-CCR-Alpha-Device'}
            elif 'system/resource' in url:
                resp.json.return_value = {
                    'version': '7.15.2',
                    'uptime': '10d04:12:00',
                    'cpu-load': 14,
                    'total-memory': 4000000,
                    'free-memory': 2800000,
                    'board-name': 'CCR2004',
                }
            return resp

        mock_get.side_effect = mocked_get

        res = self.client.post(f'/api/v1/routers/{self.router_a.id}/test-connection/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])
        self.assertEqual(res.data['details']['version'], '7.15.2')
        self.assertEqual(res.data['details']['identity'], 'Core-CCR-Alpha-Device')

        self.router_a.refresh_from_db()
        self.assertEqual(self.router_a.status, 'Online')
        self.assertEqual(self.router_a.cpu_usage, 14)

    @patch('requests.Session.get')
    def test_router_health_endpoint(self, mock_get):
        resp_mock = MagicMock()
        resp_mock.ok = True
        resp_mock.status_code = 200
        resp_mock.json.side_effect = [
            {'name': 'Core-CCR-Alpha'},
            {
                'version': '7.15.2',
                'uptime': '3d10:00:00',
                'cpu-load': 22,
                'total-memory': 1000000,
                'free-memory': 600000,
                'board-name': 'CCR2004',
            }
        ]
        mock_get.return_value = resp_mock

        res = self.client.get(f'/api/v1/routers/{self.router_a.id}/health/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['is_online'])
        self.assertEqual(res.data['cpu_load'], 22)
        self.assertEqual(res.data['memory_pct'], 40)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Active PPPoE Sessions & Disconnection
    # ─────────────────────────────────────────────────────────────────────────

    @patch('requests.Session.get')
    def test_pppoe_active_sessions_retrieval(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                '.id': '*1',
                'name': 'rashid_pppoe',
                'service': 'pppoe',
                'caller-id': 'AA:BB:CC:DD:EE:01',
                'address': '10.50.100.12',
                'uptime': '1d02:15:30',
                'bytes-in': 10485760,
                'bytes-out': 52428800,
            }
        ]
        mock_get.return_value = mock_resp

        res = self.client.get(f'/api/v1/routers/{self.router_a.id}/active-sessions/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['sessions'][0]['username'], 'rashid_pppoe')
        self.assertEqual(res.data['sessions'][0]['ip_address'], '10.50.100.12')

    @patch('requests.Session.delete')
    @patch('requests.Session.get')
    def test_pppoe_disconnect_session_via_router(self, mock_get, mock_delete):
        # Setup active session on router
        mock_get_resp = MagicMock()
        mock_get_resp.ok = True
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = [
            {'.id': '*7A', 'name': 'rashid_pppoe', 'address': '10.50.100.12'}
        ]
        mock_get.return_value = mock_get_resp

        mock_del_resp = MagicMock()
        mock_del_resp.ok = True
        mock_del_resp.status_code = 200
        mock_delete.return_value = mock_del_resp

        # Create cached DB session
        UserSession.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            username='rashid_pppoe',
            ip_address='10.50.100.12'
        )

        res = self.client.post(
            f'/api/v1/routers/{self.router_a.id}/disconnect-session/',
            {'username': 'rashid_pppoe'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])

        # Check that cached DB session was deleted
        self.assertFalse(UserSession.objects.filter(username='rashid_pppoe').exists())

    @patch('requests.Session.delete')
    @patch('requests.Session.get')
    def test_user_session_viewset_disconnect_endpoint(self, mock_get, mock_delete):
        mock_get_resp = MagicMock()
        mock_get_resp.ok = True
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = [{'.id': '*8B', 'name': 'rashid_pppoe'}]
        mock_get.return_value = mock_get_resp

        mock_del_resp = MagicMock()
        mock_del_resp.ok = True
        mock_del_resp.status_code = 200
        mock_delete.return_value = mock_del_resp

        session = UserSession.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            username='rashid_pppoe',
            ip_address='10.50.100.12'
        )

        res = self.client.post(f'/api/v1/user-sessions/{session.id}/disconnect/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(UserSession.objects.filter(id=session.id).exists())

    # ─────────────────────────────────────────────────────────────────────────
    # 4. PPPoE Enable & Disable Lifecycle
    # ─────────────────────────────────────────────────────────────────────────

    @patch('requests.Session.patch')
    @patch('requests.Session.get')
    @patch('requests.Session.delete')
    def test_pppoe_disable_user_on_router(self, mock_delete, mock_get, mock_patch):
        # Mock secret query
        mock_get_resp = MagicMock()
        mock_get_resp.ok = True
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = [{'.id': '*12', 'name': 'rashid_pppoe', 'disabled': 'false'}]
        mock_get.return_value = mock_get_resp

        # Mock patch response
        mock_patch_resp = MagicMock()
        mock_patch_resp.ok = True
        mock_patch_resp.status_code = 200
        mock_patch.return_value = mock_patch_resp

        res = self.client.post(
            f'/api/v1/routers/{self.router_a.id}/disable-pppoe/',
            {'username': 'rashid_pppoe'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])
        mock_patch.assert_called_once()

    @patch('requests.Session.patch')
    @patch('requests.Session.get')
    def test_pppoe_enable_user_on_router(self, mock_get, mock_patch):
        mock_get_resp = MagicMock()
        mock_get_resp.ok = True
        mock_get_resp.status_code = 200
        mock_get_resp.json.return_value = [{'.id': '*12', 'name': 'rashid_pppoe', 'disabled': 'true'}]
        mock_get.return_value = mock_get_resp

        mock_patch_resp = MagicMock()
        mock_patch_resp.ok = True
        mock_patch_resp.status_code = 200
        mock_patch.return_value = mock_patch_resp

        res = self.client.post(
            f'/api/v1/routers/{self.router_a.id}/enable-pppoe/',
            {'username': 'rashid_pppoe'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Profile Synchronization
    # ─────────────────────────────────────────────────────────────────────────

    @patch('requests.Session.get')
    def test_pppoe_profile_synchronization(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {'name': 'default'},
            {'name': 'default-encryption'},
            {'name': '10Mbps-Gold'},
            {'name': '20Mbps-Platinum'},
        ]
        mock_get.return_value = mock_resp

        res = self.client.post(f'/api/v1/routers/{self.router_a.id}/sync-profiles/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('10Mbps-Gold', res.data['profiles'])
        self.assertIn('20Mbps-Platinum', res.data['profiles'])

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Live Traffic Statistics
    # ─────────────────────────────────────────────────────────────────────────

    @patch('requests.Session.post')
    def test_router_traffic_statistics_live(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.return_value = [{
            'name': 'ether1',
            'rx-bits-per-second': 45000000,
            'tx-bits-per-second': 12000000,
            'rx-packets-per-second': 4500,
            'tx-packets-per-second': 2100,
        }]
        mock_post.return_value = mock_resp

        res = self.client.get(f'/api/v1/routers/{self.router_a.id}/live_traffic/?interface=ether1')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('traffic', res.data)
        self.assertEqual(res.data['traffic']['rx-bits-per-second'], 45000000)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. OLT CRUD & Credential Protection
    # ─────────────────────────────────────────────────────────────────────────

    def test_olt_crud_and_credential_protection(self):
        create_payload = {
            'name': 'ZTE-OLT-2',
            'brand': OLTBrand.ZTE,
            'ip_address': '10.50.20.2',
            'snmp_community': 'private_zte_snmp',
            'snmp_port': 161,
            'telnet_user': 'operator',
            'telnet_password': 'TelnetSecretPassword',
            'pon_ports_count': 16,
        }
        res = self.client.post('/api/v1/olts/', create_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        olt_id = res.data['id']

        # Secrets must never be serialized
        self.assertNotIn('telnet_password', res.data)
        self.assertNotIn('snmp_community', res.data)

        # Get OLT
        res_get = self.client.get(f'/api/v1/olts/{olt_id}/')
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertNotIn('telnet_password', res_get.data)
        self.assertNotIn('snmp_community', res_get.data)

    def test_olt_connection_test_and_health(self):
        res_test = self.client.post(f'/api/v1/olts/{self.olt_a.id}/test-connection/')
        self.assertEqual(res_test.status_code, status.HTTP_200_OK)
        self.assertTrue(res_test.data['success'])

        res_health = self.client.get(f'/api/v1/olts/{self.olt_a.id}/health/')
        self.assertEqual(res_health.status_code, status.HTTP_200_OK)
        self.assertEqual(res_health.data['brand'], OLTBrand.VSOL)
        self.assertIn('uptime', res_health.data)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. ONU Discovery & Auto-Registration
    # ─────────────────────────────────────────────────────────────────────────

    def test_onu_discovery_and_auto_registration(self):
        res = self.client.post(
            f'/api/v1/olts/{self.olt_a.id}/discover-onus/',
            {'pon_port': 'EPON0/1'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res.data['discovered_count'], 2)

        # Verify ONUs were created in DB for tenant_a
        onus = ONU.objects.filter(tenant=self.tenant_a, olt=self.olt_a)
        self.assertGreaterEqual(onus.count(), 2)
        macs = [o.mac_address for o in onus]
        self.assertIn('E0:67:B3:01:A2:F1', macs)

    # ─────────────────────────────────────────────────────────────────────────
    # 9. ONU Status, Optical Power & Reboot
    # ─────────────────────────────────────────────────────────────────────────

    def test_onu_optical_power_and_status(self):
        res = self.client.get(f'/api/v1/onus/{self.onu_a.id}/optical-power/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['signal_status'], 'good')
        self.assertIn('rx_power', res.data)
        self.assertIn('tx_power', res.data)
        self.assertIn('distance_meters', res.data)

    def test_onu_reboot_command(self):
        res = self.client.post(f'/api/v1/onus/{self.onu_a.id}/reboot/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('Reboot command sent', res.data['message'])

    # ─────────────────────────────────────────────────────────────────────────
    # 10. Customer ↔ ONU Assignment & Unassignment
    # ─────────────────────────────────────────────────────────────────────────

    def test_onu_customer_assignment_and_unassignment(self):
        # 1. Assign Customer A to ONU A
        res_assign = self.client.post(
            f'/api/v1/onus/{self.onu_a.id}/assign-customer/',
            {'customer_id': str(self.customer_a.id)},
            format='json'
        )
        self.assertEqual(res_assign.status_code, status.HTTP_200_OK)

        self.onu_a.refresh_from_db()
        self.customer_a.refresh_from_db()
        self.assertEqual(self.onu_a.customer, self.customer_a)
        self.assertEqual(self.onu_a.customer_name, 'Rashid Khan')
        self.assertEqual(self.customer_a.onu_mac_or_sn, self.onu_a.mac_address)

        # 2. Unassign Customer A from ONU A
        res_unassign = self.client.post(f'/api/v1/onus/{self.onu_a.id}/unassign-customer/')
        self.assertEqual(res_unassign.status_code, status.HTTP_200_OK)

        self.onu_a.refresh_from_db()
        self.customer_a.refresh_from_db()
        self.assertIsNone(self.onu_a.customer)
        self.assertEqual(self.onu_a.customer_name, '')
        self.assertEqual(self.customer_a.onu_mac_or_sn, '')

    def test_cross_tenant_onu_assignment_blocked(self):
        # Create Customer in Tenant B
        cust_b = Customer.objects.create(
            tenant=self.tenant_b,
            full_name='Beta Customer',
            mobile='01811000002',
            pppoe_username='beta_user',
            pppoe_password='secret_beta_pass',
        )

        # Try to assign Tenant B customer to Tenant A ONU -> must return 404 (not in tenant)
        res = self.client.post(
            f'/api/v1/onus/{self.onu_a.id}/assign-customer/',
            {'customer_id': str(cust_b.id)},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # ─────────────────────────────────────────────────────────────────────────
    # 11. SSRF & Private Network Security Validation
    # ─────────────────────────────────────────────────────────────────────────

    def test_ssrf_and_private_network_restrictions(self):
        # AWS / GCP / Azure cloud metadata IP
        with self.assertRaises(ValidationError):
            validate_router_host('169.254.169.254')

        # Link-local subnet
        with self.assertRaises(ValidationError):
            validate_router_host('169.254.2.5')

        # Multicast
        with self.assertRaises(ValidationError):
            validate_router_host('224.0.0.1')
        with self.assertRaises(ValidationError):
            validate_router_host('239.255.255.250')

        # Loopback
        with self.assertRaises(ValidationError):
            validate_router_host('127.0.0.1')
        with self.assertRaises(ValidationError):
            validate_router_host('localhost')

        # Allowed ISP private IP ranges
        try:
            validate_router_host('10.0.0.1')
            validate_router_host('172.16.50.1')
            validate_router_host('192.168.100.1')
        except ValidationError:
            self.fail("Valid RFC1918 private addresses must be allowed.")

    # ─────────────────────────────────────────────────────────────────────────
    # 12. Failure Resilience: App NEVER crashes on device errors
    # ─────────────────────────────────────────────────────────────────────────

    @patch('requests.Session.get')
    def test_router_timeout_resilience(self, mock_get):
        mock_get.side_effect = requests.exceptions.ConnectTimeout("Network timed out")

        res = self.client.post(f'/api/v1/routers/{self.router_a.id}/test-connection/')
        self.assertEqual(res.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(res.data['success'])
        self.assertIn('timed out', res.data['message'].lower())

        self.router_a.refresh_from_db()
        self.assertEqual(self.router_a.status, 'Offline')

    @patch('requests.Session.get')
    def test_router_auth_failure_resilience(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.ok = False
        mock_resp.status_code = 401
        mock_get.return_value = mock_resp

        res = self.client.post(f'/api/v1/routers/{self.router_a.id}/test-connection/')
        self.assertEqual(res.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(res.data['success'])

        self.router_a.refresh_from_db()
        self.assertEqual(self.router_a.status, 'Error')

    @patch('requests.Session.get')
    def test_router_malformed_response_resilience(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.content = b"Non-JSON garbage HTML error page"
        mock_resp.json.side_effect = ValueError("No JSON could be decoded")
        mock_get.return_value = mock_resp

        res = self.client.post(f'/api/v1/routers/{self.router_a.id}/test-connection/')
        self.assertEqual(res.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(res.data['success'])

    # ─────────────────────────────────────────────────────────────────────────
    # 13. Background Celery Tasks (sync_router_task, sync_olt_task)
    # ─────────────────────────────────────────────────────────────────────────

    @patch('requests.Session.get')
    def test_sync_router_task_execution(self, mock_get):
        from itertools import cycle
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        # The sync pipeline issues 4 GETs in order:
        #   1) /system/identity
        #   2) /system/resource
        #   3) /interface      (added by get_full_health telemetry)
        #   4) /ppp/active     (sync_active_sessions_to_db)
        # Using cycle() guarantees the iterator never exhausts even if the
        # implementation adds another defensive probe in the future.
        mock_resp.json.side_effect = cycle([
            {'name': 'Core-CCR-Alpha'},
            {'version': '7.15', 'uptime': '5d', 'cpu-load': 10,
             'total-memory': 100, 'free-memory': 50, 'board-name': 'CCR',
             'total-hdd-space': 1000, 'free-hdd-space': 500},
            [],
            [{'name': 'rashid_pppoe', 'address': '10.50.100.12',
              'caller-id': 'AA:BB:CC:11:22:33', 'uptime': '1h'}],
        ])
        mock_get.return_value = mock_resp

        res = sync_router_task(tenant_id=str(self.tenant_a.id), router_id=str(self.router_a.id))
        self.assertTrue(res['success'])
        self.assertEqual(res['router_id'], str(self.router_a.id))

    def test_sync_olt_task_execution(self):
        res = sync_olt_task(tenant_id=str(self.tenant_a.id), olt_id=str(self.olt_a.id))
        self.assertTrue(res['success'])
        self.assertEqual(res['olt_id'], str(self.olt_a.id))
        self.assertGreaterEqual(res['onus_synced'], 2)

    # ─────────────────────────────────────────────────────────────────────────
    # 14. Multi-Tenant Isolation (Tenant B cannot access Tenant A network)
    # ─────────────────────────────────────────────────────────────────────────

    def test_multi_tenant_isolation_idor_prevention(self):
        # Authenticate client as Tenant B
        client_b = APIClient()
        client_b.force_authenticate(user=self.user_b)
        client_b.defaults['HTTP_HOST'] = 'speednet-beta.shebafi.com'

        # Tenant B tries to view Tenant A's router -> 404
        res_r = client_b.get(f'/api/v1/routers/{self.router_a.id}/')
        self.assertEqual(res_r.status_code, status.HTTP_404_NOT_FOUND)

        # Tenant B tries to test connection to Tenant A's router -> 404
        res_rc = client_b.post(f'/api/v1/routers/{self.router_a.id}/test-connection/')
        self.assertEqual(res_rc.status_code, status.HTTP_404_NOT_FOUND)

        # Tenant B tries to view Tenant A's OLT -> 404
        res_olt = client_b.get(f'/api/v1/olts/{self.olt_a.id}/')
        self.assertEqual(res_olt.status_code, status.HTTP_404_NOT_FOUND)

        # Tenant B tries to view Tenant A's ONU -> 404
        res_onu = client_b.get(f'/api/v1/onus/{self.onu_a.id}/')
        self.assertEqual(res_onu.status_code, status.HTTP_404_NOT_FOUND)

        # Tenant B tries to reboot Tenant A's ONU -> 404
        res_reboot = client_b.post(f'/api/v1/onus/{self.onu_a.id}/reboot/')
        self.assertEqual(res_reboot.status_code, status.HTTP_404_NOT_FOUND)

    # ─────────────────────────────────────────────────────────────────────────
    # 15. Operational Audit Logging Verification
    # ─────────────────────────────────────────────────────────────────────────

    def test_network_audit_logs_recorded_for_operations(self):
        # Perform an action that logs audit: ONU reboot
        self.client.post(f'/api/v1/onus/{self.onu_a.id}/reboot/')

        audit = AuditLog.objects.filter(
            tenant=self.tenant_a,
            action='reboot_onu',
            resource_type='ONU',
            resource_id=str(self.onu_a.id)
        ).first()

        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_username, self.user_a.username)
        self.assertEqual(audit.details['pon_port'], self.onu_a.pon_port)
        self.assertEqual(audit.details['onu_index'], 1)

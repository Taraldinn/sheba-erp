from decimal import Decimal
from unittest.mock import MagicMock, patch
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth.models import User
from apps.core.models import Tenant
from apps.network.models import OLT, ONU
from apps.network.services.olt.drivers import (
    BaseOLTDriver,
    BDCOMEponDriver,
    VSOLGponDriver,
    VSOLEponDriver,
)
from apps.network.services.olt.monitor import OLTMonitorService


class OLTMonitorDriverParsingTestCase(TestCase):
    def test_strip_telnet_negotiations(self):
        raw = b"Hello\xFF\xFA\x18\x00\xFF\xF0 World\xFF\xFB\x01 Test\xFF\xF4"
        stripped = BaseOLTDriver.strip_telnet_negotiations(raw)
        self.assertEqual(stripped, b"Hello World Test")

    def test_render_virtual_line(self):
        # Line with carriage return resetting cursor
        line1 = "Original Line\rOverwritten"
        rendered1 = BaseOLTDriver.render_virtual_line(line1)
        self.assertTrue(rendered1.startswith("Overwritten"))

        # Line with ANSI escape movement ESC[...C
        line2 = "Prefix\x1b[10CSuffix"
        rendered2 = BaseOLTDriver.render_virtual_line(line2)
        self.assertEqual(rendered2[:6], "Prefix")
        self.assertEqual(rendered2[10:16], "Suffix")

    def test_vsol_gpon_virtual_line_parsing(self):
        tenant = Tenant.objects.create(name="ISP Test", slug="isp_test")
        olt = OLT.objects.create(
            tenant=tenant,
            name="VSOL GPON 1",
            brand="VSOL",
            access_mode="GPON",
            ip_address="10.10.10.10",
        )
        driver = VSOLGponDriver(olt)

        # Mock execute_command returns
        show_state = """
GPON0/1:1   enable   enable   working   D011a63ad6f9
GPON0/1:2   enable   enable   logging   D011a63ad6fa
GPON0/2:1   enable   enable   working   E067b301a2f1
"""
        rx_power_p1 = """
OnuIndex   ONU_Rx    OLT_Rx
1          -19.45    -2.10
2          -31.50    -3.20
"""
        rx_power_p2 = """
OnuIndex   ONU_Rx    OLT_Rx
1          -22.10    -2.05
"""
        mac_table = """
  100   3068:9314:e93c   Dynamic   GPON 0/1:001   Aging
  200   bc62:ce08:32ec   Dynamic   GPON 0/2:001   Aging
"""

        def mock_exec(cmd, wait_time=3, max_pages=20):
            if "show onu state all" in cmd:
                return show_state
            if "Show pon onu all rx-power" in cmd:
                if "0/1" in cmd or "gpon 0/1" in getattr(mock_exec, 'last_intf', ''):
                    return rx_power_p1
                return rx_power_p2
            if "show mac address-table" in cmd:
                return mac_table
            if "interface gpon" in cmd:
                mock_exec.last_intf = cmd
                return ""
            return ""

        driver.execute_command = mock_exec
        driver._telnet_connect = MagicMock(return_value=True)
        driver._telnet_disconnect = MagicMock()

        data = driver.vsol_gpon_get_all_data(max_ports=8)
        self.assertEqual(len(data['onu_list']), 3)

        # Verify formatting and statuses
        onu1 = next(o for o in data['onu_list'] if o['onu_id'] == '1:1')
        self.assertEqual(onu1['status'], 'active')
        self.assertEqual(onu1['mac'], 'D0:11:A6:3A:D6:F9')

        onu2 = next(o for o in data['onu_list'] if o['onu_id'] == '1:2')
        self.assertEqual(onu2['status'], 'offline')

        # Check optical power
        self.assertEqual(data['power']['1:1']['rx_power'], '-19.45')
        self.assertEqual(data['power']['1:2']['rx_power'], '-31.50')

        # Check learned MAC table
        self.assertIn('1:1', data['mactable'])
        self.assertEqual(data['mactable']['1:1'][0]['mac'], '30:68:93:14:E9:3C')
        self.assertEqual(data['mactable']['1:1'][0]['vlan'], '100')


class OLTMonitorServiceTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Sheba Fiber", slug="sheba_fiber")
        self.olt = OLT.objects.create(
            tenant=self.tenant,
            name="BDCOM Main OLT",
            brand="BDCOM",
            access_mode="EPON",
            ip_address="172.25.29.18",
            pon_ports_count=4
        )

    def test_sync_olt_persists_telemetry_and_mactable(self):
        mock_raw_data = {
            'onu_list': [
                {'onu_id': '1:1', 'port': '1', 'index': 1, 'mac': 'A0:7D:02:27:16:24', 'status': 'active', 'pon_port': 'EPON0/1'},
                {'onu_id': '1:2', 'port': '1', 'index': 2, 'mac': 'A0:7D:02:27:16:25', 'status': 'active', 'pon_port': 'EPON0/1'},
                {'onu_id': '2:1', 'port': '2', 'index': 1, 'mac': 'B0:8E:03:38:27:30', 'status': 'offline', 'pon_port': 'EPON0/2'},
            ],
            'power': {
                '1:1': {'rx_power': '-18.50', 'tx_power': '2.20', 'temperature': '42.0'},
                '1:2': {'rx_power': '-32.10', 'tx_power': '1.80', 'temperature': '44.5'},  # Poor signal
                '2:1': {'rx_power': 'N/A', 'tx_power': 'N/A', 'temperature': 'N/A'},
            },
            'uptime': {
                '1:1': '14d 06:12:00',
                '1:2': '2d 01:45:00',
                '2:1': '',
            },
            'mactable': {
                '1:1': [{'mac': 'BC:62:CE:08:32:EC', 'vlan': '501'}],
                '1:2': [{'mac': 'BC:62:CE:08:32:ED', 'vlan': '502'}],
            }
        }

        with patch('apps.network.services.olt.monitor.get_olt_driver') as mock_get_driver:
            mock_driver = MagicMock()
            mock_driver.monitor_all_onus.return_value = mock_raw_data
            mock_get_driver.return_value = mock_driver

            svc = OLTMonitorService(tenant=self.tenant)
            res = svc.sync_olt(self.olt)

            self.assertEqual(res['total_onus'], 3)
            self.assertEqual(res['online_onus'], 2)
            self.assertEqual(res['offline_onus'], 1)
            self.assertEqual(res['poor_signal'], 1)
            self.assertEqual(res['ports']['1']['online'], 2)
            self.assertEqual(res['ports']['2']['offline'], 1)

            # Check database records
            onu1 = ONU.objects.get(olt=self.olt, pon_port='EPON0/1', onu_index=1)
            self.assertEqual(onu1.status, 'Online')
            self.assertEqual(onu1.rx_power, Decimal('-18.50'))
            self.assertEqual(onu1.temperature, Decimal('42.0'))
            self.assertEqual(onu1.uptime, '14d 06:12:00')
            self.assertEqual(onu1.signal_quality, 'Good')
            self.assertEqual(len(onu1.mactable), 1)
            self.assertEqual(onu1.mactable[0]['mac'], 'BC:62:CE:08:32:EC')

            onu2 = ONU.objects.get(olt=self.olt, pon_port='EPON0/1', onu_index=2)
            self.assertEqual(onu2.signal_quality, 'Poor')

            onu3 = ONU.objects.get(olt=self.olt, pon_port='EPON0/2', onu_index=1)
            self.assertEqual(onu3.status, 'Offline')
            self.assertEqual(onu3.signal_quality, 'Offline')

    def test_monitor_summary_and_mac_search(self):
        # Create ONUs directly in DB
        ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            pon_port="EPON0/1",
            onu_index=1,
            mac_address="A0:7D:02:27:16:24",
            customer_name="Rahim Uddin",
            status="Online",
            rx_power=Decimal("-21.40"),
            mactable=[{"mac": "CC:46:D6:78:9A:BC", "vlan": 120}]
        )
        ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            pon_port="EPON0/1",
            onu_index=2,
            mac_address="A0:7D:02:27:16:25",
            customer_name="Karim Khan",
            status="Online",
            rx_power=Decimal("-31.00"),  # Poor signal
            mactable=[]
        )

        svc = OLTMonitorService(tenant=self.tenant)
        summary = svc.get_monitor_summary(self.tenant)

        self.assertEqual(summary['total_onus'], 2)
        self.assertEqual(summary['active_onus'], 2)
        self.assertEqual(summary['poor_signal'], 1)
        self.assertIn(str(self.olt.id), summary['olt_summary'])

        # Cross-OLT MAC Search by learned CPE MAC
        results = svc.search_mac(self.tenant, "CC:46:D6:78:9A:BC")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['customer_name'], "Rahim Uddin")
        self.assertEqual(results[0]['vlan'], 120)

        # Cross-OLT MAC Search by ONU hardware MAC
        results_hw = svc.search_mac(self.tenant, "A0:7D:02:27:16:25")
        self.assertEqual(len(results_hw), 1)
        self.assertEqual(results_hw[0]['customer_name'], "Karim Khan")


class OLTMonitorApiEndpointsTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="ISP Enterprise", slug="isp-ent")
        self.user = User.objects.create_superuser(
            username="netadmin",
            password="testpassword123"
        )
        self.olt = OLT.objects.create(
            tenant=self.tenant,
            name="Core VSOL",
            brand="VSOL",
            access_mode="EPON",
            ip_address="10.20.30.40"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_HOST'] = f"{self.tenant.slug}.shebafi.com"

    def test_monitor_summary_endpoint(self):
        url = reverse('olt-monitor-summary')
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('total_onus', resp.data)
        self.assertIn('olt_summary', resp.data)

    def test_mac_search_endpoint(self):
        ONU.objects.create(
            tenant=self.tenant,
            olt=self.olt,
            pon_port="EPON0/1",
            onu_index=1,
            mac_address="AA:BB:CC:DD:EE:FF",
            status="Online",
            mactable=[{"mac": "11:22:33:44:55:66", "vlan": 55}]
        )
        url = reverse('olt-mac-search') + "?mac=11:22:33:44:55:66"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['mac'], "11:22:33:44:55:66")

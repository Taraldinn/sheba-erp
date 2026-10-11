"""
Tests for Phase 21 Advanced Health diagnostic endpoints and
MikroTikDiagnosticsService.
"""
from datetime import datetime, timezone as dt_tz
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import StaffProfile, UserRole
from apps.core.models import Tenant
from apps.network.models import (
    NetworkSyncJob,
    Router,
    RouterPingResult,
)
from apps.network.services.mikrotik import MikroTikDiagnosticsService

User = get_user_model()


class MikroTikDiagnosticsServiceTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Diag ISP', slug='diag', domain='diag.sheba.net'
        )
        self.router = Router.objects.create(
            tenant=self.tenant,
            name='Edge-1',
            ip_address='10.20.30.1',
            status='Online',
        )

    @patch('apps.network.services.mikrotik.diagnostics.MikroTikRESTClient.from_router')
    def test_arp_neighbor_route_log_returned(self, mock_from_router):
        client = mock_from_router.return_value.__enter__.return_value
        client.get.side_effect = lambda endpoint, params=None: {
            '/ip/arp': [
                {'address': '10.20.30.50', 'mac-address': 'AA:BB:CC:00:00:01',
                 'interface': 'ether2', 'dynamic': 'true', 'complete': 'true'}
            ],
            '/ip/neighbor': [
                {'address': '10.20.30.2', 'identity': 'switch-1',
                 'platform': 'MikroTik', 'version': '7.10', 'interface': 'sfp-sfpplus1'}
            ],
            '/ip/route': [
                {'dst-address': '0.0.0.0/0', 'gateway': '10.20.30.254',
                 'interface': 'ether1', 'distance': 1, 'active': 'true'}
            ],
            '/log': [
                {'time': 'jan/01/2025 10:00:00', 'topics': 'system',
                 'message': 'router started'}
            ],
        }.get(endpoint, [])

        diag = MikroTikDiagnosticsService(self.router)
        self.assertEqual(diag.get_arp_table()[0]['address'], '10.20.30.50')
        self.assertEqual(diag.get_neighbor_list()[0]['identity'], 'switch-1')
        self.assertEqual(diag.get_route_table()[0]['gateway'], '10.20.30.254')
        self.assertEqual(diag.get_log_tail()[0]['message'], 'router started')

    @patch('apps.network.services.mikrotik.diagnostics.MikroTikRESTClient.from_router')
    def test_ping_persists_result(self, mock_from_router):
        client = mock_from_router.return_value.__enter__.return_value
        client.post.return_value = [
            {'sent': 4, 'received': 4, 'min-rtt': 1.2, 'avg-rtt': 1.5, 'max-rtt': 1.9}
        ]
        diag = MikroTikDiagnosticsService(self.router)
        result = diag.ping('8.8.8.8', count=4)
        self.assertEqual(result['status'], 'SUCCESS')
        self.assertEqual(result['received'], 4)
        self.assertAlmostEqual(result['avg_latency_ms'], 1.5)


class RouterAdvancedHealthAPITests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Advanced ISP', slug='adv', domain='adv.sheba.net'
        )
        self.admin = User.objects.create_user(username='superadmin', password='pw')
        StaffProfile.objects.create(user=self.admin, tenant=self.tenant, role=UserRole.ADMIN)
        self.support = User.objects.create_user(username='supportguy', password='pw')
        StaffProfile.objects.create(
            user=self.support, tenant=self.tenant, role=UserRole.SUPPORT_STAFF
        )
        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'adv.sheba.net'
        self.router = Router.objects.create(
            tenant=self.tenant,
            name='Core-RTR',
            ip_address='10.0.0.1',
            status='Online',
            latitude=Decimal('23.0'),
            longitude=Decimal('90.0'),
        )

    @patch('apps.network.services.mikrotik.diagnostics.MikroTikDiagnosticsService.get_arp_table')
    @patch('apps.network.services.mikrotik.diagnostics.MikroTikDiagnosticsService.get_neighbor_list')
    @patch('apps.network.services.mikrotik.diagnostics.MikroTikDiagnosticsService.get_route_table')
    @patch('apps.network.services.mikrotik.diagnostics.MikroTikDiagnosticsService.get_log_tail')
    @patch('apps.network.services.mikrotik.interfaces.MikroTikInterfaceService.get_interface_counters_extended')
    def test_admin_can_fetch_advanced_health(
        self, mock_extended, mock_log, mock_route, mock_neighbor, mock_arp,
    ):
        mock_extended.return_value = [
            {'name': 'ether1', 'type': 'ether', 'running': True,
             'disabled': False, 'rx_bytes': 1000, 'tx_bytes': 2000,
             'rx_errors': 0, 'tx_errors': 0, 'rx_drop': 0, 'tx_drop': 0,
             'link_downs': 0, 'rx_rate_bps': 0, 'tx_rate_bps': 0,
             'mac_address': '', 'mtu': 1500,
             'last_link_up_time': '', 'last_link_down_time': '', 'comment': ''}
        ]
        mock_arp.return_value = []
        mock_neighbor.return_value = []
        mock_route.return_value = []
        mock_log.return_value = [{'time': '10:00', 'topics': 'system', 'message': 'ok'}]

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            f'/api/v1/network/diagnostics/routers/{self.router.id}/'
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['router_name'], 'Core-RTR')
        self.assertEqual(len(body['interfaces']), 1)
        self.assertEqual(body['interfaces'][0]['name'], 'ether1')
        self.assertIn('arp', body)
        self.assertIn('neighbors', body)
        self.assertIn('routes', body)
        self.assertIn('log_tail', body)
        self.assertEqual(body['log_tail'][0]['message'], 'ok')

    @patch('apps.network.services.mikrotik.diagnostics.MikroTikRESTClient.from_router')
    def test_support_staff_blocked(self, mock_from_router):
        self.client.force_authenticate(user=self.support)
        res = self.client.get(
            f'/api/v1/network/diagnostics/routers/{self.router.id}/'
        )
        self.assertEqual(res.status_code, 403)

    @patch('apps.network.services.mikrotik.diagnostics.MikroTikRESTClient.from_router')
    def test_ping_endpoint_creates_row(self, mock_from_router):
        client = mock_from_router.return_value.__enter__.return_value
        client.post.return_value = [{'sent': 4, 'received': 4, 'avg-rtt': 2.0}]
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            f'/api/v1/network/diagnostics/routers/{self.router.id}/ping/',
            {'target': '8.8.8.8', 'count': 4},
            format='json',
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(RouterPingResult.objects.count(), 1)
        row = RouterPingResult.objects.first()
        self.assertEqual(row.target, '8.8.8.8')
        self.assertEqual(row.status, 'SUCCESS')

    def test_ping_invalid_payload(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            f'/api/v1/network/diagnostics/routers/{self.router.id}/ping/',
            {'target': ''},
            format='json',
        )
        self.assertEqual(res.status_code, 400)

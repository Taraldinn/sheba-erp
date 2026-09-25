"""
Tests for the two networking migration deltas:

  Delta 1: `BandwidthDailyUsage` roll-up service (legacy `daily_traffic` parity).
  Delta 2: Multi-method online subscriber detection (gated behind a feature flag).

These run against the standard Django test DB and do NOT touch real routers —
MikroTik hardware calls are bypassed via the `MikroTikService`/`RouterClient`
boundary (existing tests in this app prove that pattern works).
"""
import uuid
from datetime import date, timedelta
from unittest import mock

from django.test import TestCase, override_settings

from apps.billing.models import BandwidthDailyUsage
from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import (
    OLT,
    OLTBrand,
    POPBranch,
    Router,
    UserSession,
)
from apps.network.services.bandwidth_rollup import (
    aggregate_router_bandwidth,
    get_customer_bandwidth_summary,
)
from apps.network.services.online_detection import (
    OnlineStatus,
    get_online_status,
)


def _make_tenant(slug: str = 'tenant-rollup') -> Tenant:
    return Tenant.objects.create(name=f'T {slug}', slug=slug)


def _make_router(tenant: Tenant, name: str = 'R-1') -> Router:
    return Router.objects.create(
        tenant=tenant,
        name=name,
        ip_address='10.0.0.1',
        hostname='',
        username='admin',
        password='x',
        api_port=443,
        api_protocol='REST',
    )


def _make_customer(tenant: Tenant, router: Router, uname: str, status=CustomerStatus.ACTIVE) -> Customer:
    return Customer.objects.create(
        tenant=tenant,
        router=router,
        customer_code=f'C-{uuid.uuid4().hex[:6]}',
        full_name=f'Customer {uname}',
        pppoe_username=uname,
        pppoe_password='secret',
        status=status,
    )


class BandwidthRollupTests(TestCase):
    """Delta 1: legacy `daily_traffic` parity."""

    def setUp(self):
        self.tenant = _make_tenant('rollup')
        self.router = _make_router(self.tenant)
        self.customer = _make_customer(self.tenant, self.router, 'rollup1')
        UserSession.objects.create(
            tenant=self.tenant,
            router=self.router,
            username='rollup1',
            ip_address='100.64.0.5',
            bytes_in=1_000_000,
            bytes_out=4_000_000,
        )

    def test_first_run_persists_full_counter(self):
        stats = aggregate_router_bandwidth(self.router)
        self.assertEqual(stats['rows_updated'], 1)
        row = BandwidthDailyUsage.objects.get(customer=self.customer)
        self.assertEqual(row.rx_bytes, 1_000_000)
        self.assertEqual(row.tx_bytes, 4_000_000)

    def test_second_run_records_only_delta(self):
        aggregate_router_bandwidth(self.router)

        # Simulate an active session with new counter values (cumulative).
        sess = UserSession.objects.get(username='rollup1')
        sess.bytes_in = 1_500_000
        sess.bytes_out = 5_500_000
        sess.save(update_fields=['bytes_in', 'bytes_out'])

        aggregate_router_bandwidth(self.router)
        row = BandwidthDailyUsage.objects.get(customer=self.customer)
        self.assertEqual(row.rx_bytes, 1_000_000 + 500_000)
        self.assertEqual(row.tx_bytes, 4_000_000 + 1_500_000)

    def test_offline_customer_not_touched(self):
        """Customers with no live UserSession row should be skipped."""
        offline = _make_customer(
            self.tenant, self.router, 'offline1',
            status=CustomerStatus.EXPIRED,
        )
        # No UserSession created for this username.
        aggregate_router_bandwidth(self.router)
        self.assertFalse(
            BandwidthDailyUsage.objects.filter(customer=offline).exists()
        )

    def test_summary_helper_returns_daily_breakdown(self):
        aggregate_router_bandwidth(self.router)
        summary = get_customer_bandwidth_summary(self.customer, days=7)
        self.assertIn('totals', summary)
        self.assertEqual(summary['totals']['rx_bytes'], 1_000_000)
        self.assertEqual(summary['totals']['tx_bytes'], 4_000_000)
        self.assertEqual(len(summary['daily']), 1)


@override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
class MultiMethodOnlineDetectionTests(TestCase):
    """Delta 2: PPPoE → DHCP → static-ARP fallback."""

    def setUp(self):
        self.tenant = _make_tenant('online')
        self.router = _make_router(self.tenant)

    def test_feature_flag_disabled_returns_none(self):
        with override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=False):
            self.assertIsNone(get_online_status(self.router, 'anyone'))

    def test_pppoe_tier_wins_when_active(self):
        pppoe_payload = [{'.id': '*a', 'name': 'demo', 'address': '10.0.0.5', 'caller-id': 'AA:BB'}]
        dhcp_payload, sq_payload, arp_payload = [], [], []

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            rc.from_router.return_value.__enter__.return_value.get.side_effect = [
                pppoe_payload, dhcp_payload, sq_payload, arp_payload,
            ]
            status_ = get_online_status(self.router, 'demo')

        self.assertTrue(status_.online)
        self.assertEqual(status_.method, 'pppoe')
        self.assertEqual(status_.ip_address, '10.0.0.5')

    def test_dhcp_fallback_used_when_pppoe_misses(self):
        pppoe_payload = []
        dhcp_payload = [{
            '.id': '*d', 'host-name': 'demo', 'mac-address': 'CC:DD',
            'address': '10.0.0.6', 'status': 'bound',
        }]
        sq_payload, arp_payload = [], []

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            rc.from_router.return_value.__enter__.return_value.get.side_effect = [
                pppoe_payload, dhcp_payload, sq_payload, arp_payload,
            ]
            status_ = get_online_status(self.router, 'demo')

        self.assertTrue(status_.online)
        self.assertEqual(status_.method, 'dhcp')

    def test_static_arp_fallback_when_no_pppoe_no_dhcp(self):
        pppoe_payload = []
        dhcp_payload = []
        sq_payload = [{'name': 'demo', 'target': '10.0.0.7/32'}]
        arp_payload = [{
            '.id': '*r', 'address': '10.0.0.7', 'mac-address': 'EE:FF',
        }]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            rc.from_router.return_value.__enter__.return_value.get.side_effect = [
                pppoe_payload, dhcp_payload, sq_payload, arp_payload,
            ]
            status_ = get_online_status(self.router, 'demo')

        self.assertTrue(status_.online)
        self.assertEqual(status_.method, 'static_arp')

    def test_returns_none_when_no_tier_matches(self):
        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            rc.from_router.return_value.__enter__.return_value.get.side_effect = [
                [], [], [], [],
            ]
            self.assertIsNone(get_online_status(self.router, 'nobody'))

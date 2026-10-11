"""
Hardened Test Suite for Multi-Method Online Subscriber Detection.
================================================================
Audits and verifies:
1. Deterministic Tier Precedence: PPPoE (Tier 1) -> DHCP (Tier 2) -> Static ARP (Tier 3).
2. Safe Default Feature Flag (NETWORK_ENABLE_MULTIMETHOD_ONLINE).
3. PPPoE Online Detection (Exact username match).
4. DHCP Online Detection & Hostname Verification (Never match unrelated lease).
5. Static ARP Online Detection (Queue target -> Active, complete, non-disabled ARP).
6. Conflicting Results (Strict deterministic precedence: PPPoE > DHCP > Static ARP).
7. All Tiers Offline (Returns None).
8. Missing Router Data (None, missing IP/credentials, inactive router).
9. Malformed MikroTik REST Responses & Error Payloads (HTML, error dicts, garbage).
10. Router Connection Timeout / Network Failure Resilience (Timeout, connection errors).
11. Disabled Feature Flag (Returns None immediately without querying router).
12. Tenant and Router Scoping Isolation (Never allow cross-tenant query).
"""
import uuid
from unittest import mock

from django.test import TestCase, override_settings

from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router
from apps.network.services.online_detection import (
    OnlineStatus,
    get_online_status,
)


class MultiMethodOnlineDetectionHardeningTests(TestCase):
    """
    Validates deterministic precedence, uncompromised tier fallbacks,
    malformed response resilience, and tenant/router isolation.
    """

    def setUp(self):
        self.tenant_a = Tenant.objects.create(
            name="Online ISP A",
            slug=f"online-a-{uuid.uuid4().hex[:6]}",
            domain=f"online-a-{uuid.uuid4().hex[:6]}.sheba.net"
        )
        self.tenant_b = Tenant.objects.create(
            name="Online ISP B",
            slug=f"online-b-{uuid.uuid4().hex[:6]}",
            domain=f"online-b-{uuid.uuid4().hex[:6]}.sheba.net"
        )
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name="Core-MikroTik-A",
            ip_address="10.50.50.1",
            username="admin",
            password="RouterPassword123"
        )
        self.router_b = Router.objects.create(
            tenant=self.tenant_b,
            name="Core-MikroTik-B",
            ip_address="10.60.60.1",
            username="admin",
            password="RouterPassword456"
        )
        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            customer_code=f"C-ONL-{uuid.uuid4().hex[:6]}",
            full_name="Subscriber Alpha",
            pppoe_username="sub_alpha",
            status=CustomerStatus.ACTIVE,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Feature Flag Safety
    # ─────────────────────────────────────────────────────────────────────────

    def test_feature_flag_disabled_by_default_returns_none(self):
        """When NETWORK_ENABLE_MULTIMETHOD_ONLINE is False, returns None immediately without calling router."""
        with override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=False):
            with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
                status = get_online_status(self.router_a, "sub_alpha")
                self.assertIsNone(status)
                rc.assert_not_called()

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Tier 1: PPPoE Precedence
    # ─────────────────────────────────────────────────────────────────────────

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_pppoe_online_exact_match(self):
        """Active PPPoE session marks subscriber online with method='pppoe'."""
        pppoe_payload = [{
            '.id': '*1',
            'name': 'sub_alpha',
            'address': '100.64.0.10',
            'caller-id': '00:11:22:33:44:55',
            'uptime': '2h15m',
        }]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.return_value = pppoe_payload

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNotNone(status)
        self.assertTrue(status.online)
        self.assertEqual(status.method, 'pppoe')
        self.assertEqual(status.ip_address, '100.64.0.10')
        self.assertEqual(status.mac_address, '00:11:22:33:44:55')

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_pppoe_mismatched_username_not_matched(self):
        """PPPoE session for a different user must not match."""
        pppoe_payload = [{
            '.id': '*1',
            'name': 'other_user',
            'address': '100.64.0.10',
            'caller-id': '00:11:22:33:44:55',
        }]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.return_value = pppoe_payload

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Conflicting Results & Strict Deterministic Precedence
    # ─────────────────────────────────────────────────────────────────────────

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_conflicting_tiers_pppoe_wins_over_dhcp_and_arp(self):
        """
        If subscriber appears in PPPoE, DHCP, and ARP with differing IP/MAC,
        PPPoE MUST win deterministically.
        """
        pppoe_payload = [{
            '.id': '*1', 'name': 'sub_alpha', 'address': '100.64.0.10', 'caller-id': '11:11:11:11:11:11'
        }]
        dhcp_payload = [{
            '.id': '*2', 'host-name': 'sub_alpha', 'address': '192.168.1.50', 'mac-address': '22:22:22:22:22:22', 'status': 'bound'
        }]
        queue_payload = [{'name': 'sub_alpha', 'target': '172.16.0.5/32'}]
        arp_payload = [{'address': '172.16.0.5', 'mac-address': '33:33:33:33:33:33'}]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload, arp_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNotNone(status)
        self.assertEqual(status.method, 'pppoe')
        self.assertEqual(status.ip_address, '100.64.0.10')
        self.assertEqual(status.mac_address, '11:11:11:11:11:11')

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_conflicting_tiers_dhcp_wins_over_static_arp(self):
        """
        When PPPoE misses, but both DHCP and Static ARP match with different IPs,
        DHCP MUST win deterministically.
        """
        pppoe_payload = []
        dhcp_payload = [{
            '.id': '*2', 'host-name': 'sub_alpha', 'address': '192.168.1.50', 'mac-address': '22:22:22:22:22:22', 'status': 'bound'
        }]
        queue_payload = [{'name': 'sub_alpha', 'target': '172.16.0.5/32'}]
        arp_payload = [{'address': '172.16.0.5', 'mac-address': '33:33:33:33:33:33'}]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload, arp_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNotNone(status)
        self.assertEqual(status.method, 'dhcp')
        self.assertEqual(status.ip_address, '192.168.1.50')
        self.assertEqual(status.mac_address, '22:22:22:22:22:22')

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Tier 2: DHCP Lease & Hostname Verification
    # ─────────────────────────────────────────────────────────────────────────

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_dhcp_online_when_pppoe_absent(self):
        """When PPPoE misses, a bound DHCP lease with matching hostname/comment marks online."""
        pppoe_payload = []
        dhcp_payload = [{
            '.id': '*d1',
            'host-name': 'sub_alpha',
            'address': '192.168.10.100',
            'mac-address': 'AA:BB:CC:DD:EE:FF',
            'status': 'bound',
        }]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNotNone(status)
        self.assertTrue(status.online)
        self.assertEqual(status.method, 'dhcp')
        self.assertEqual(status.ip_address, '192.168.10.100')
        self.assertEqual(status.mac_address, 'AA:BB:CC:DD:EE:FF')

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_dhcp_matches_via_comment_or_active_hostname(self):
        """DHCP matches if comment or active-host-name matches subscriber username."""
        pppoe_payload = []
        dhcp_payload = [{
            '.id': '*d2',
            'comment': 'sub_alpha',
            'address': '192.168.10.101',
            'mac-address': 'AA:BB:CC:DD:EE:01',
            'status': 'bound',
        }]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNotNone(status)
        self.assertEqual(status.method, 'dhcp')
        self.assertEqual(status.ip_address, '192.168.10.101')

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_dhcp_never_matches_unrelated_lease(self):
        """
        CRITICAL: If router returns all leases or an unrelated lease,
        we MUST NEVER mark the subscriber online with someone else's IP/MAC!
        """
        pppoe_payload = []
        dhcp_payload = [{
            '.id': '*d99',
            'host-name': 'someone_else',
            'address': '192.168.10.250',
            'mac-address': '99:99:99:99:99:99',
            'status': 'bound',
        }]
        queue_payload = []

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_dhcp_unbound_lease_is_ignored(self):
        """DHCP lease with status 'waiting', 'busy', or 'testing' is not bound and thus offline."""
        pppoe_payload = []
        dhcp_payload = [{
            '.id': '*d1',
            'host-name': 'sub_alpha',
            'address': '192.168.10.100',
            'mac-address': 'AA:BB:CC:DD:EE:FF',
            'status': 'waiting',
        }]
        queue_payload = []

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_dhcp_disabled_or_invalid_lease_is_ignored(self):
        """DHCP lease marked disabled or invalid is offline."""
        pppoe_payload = []
        dhcp_payload = [{
            '.id': '*d1',
            'host-name': 'sub_alpha',
            'address': '192.168.10.100',
            'mac-address': 'AA:BB:CC:DD:EE:FF',
            'status': 'bound',
            'disabled': 'true',
        }]
        queue_payload = []

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_dhcp_dummy_mac_or_invalid_ip_ignored(self):
        """DHCP lease with all-zero MAC or 0.0.0.0 IP is rejected as dummy/unusable."""
        pppoe_payload = []
        dhcp_payload = [{
            '.id': '*d1',
            'host-name': 'sub_alpha',
            'address': '0.0.0.0',
            'mac-address': '00:00:00:00:00:00',
            'status': 'bound',
        }]
        queue_payload = []

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Tier 3: Static Queue Target & Active ARP
    # ─────────────────────────────────────────────────────────────────────────

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_static_arp_online_exact_match(self):
        """When PPPoE and DHCP miss, a simple-queue target with active ARP marks online."""
        pppoe_payload = []
        dhcp_payload = []
        queue_payload = [{'name': 'sub_alpha', 'target': '10.10.10.55/32'}]
        arp_payload = [{
            '.id': '*a1',
            'address': '10.10.10.55',
            'mac-address': 'FE:DC:BA:98:76:54',
            'interface': 'ether2',
            'disabled': 'false',
        }]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload, arp_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNotNone(status)
        self.assertTrue(status.online)
        self.assertEqual(status.method, 'static_arp')
        self.assertEqual(status.ip_address, '10.10.10.55')
        self.assertEqual(status.mac_address, 'FE:DC:BA:98:76:54')

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_static_arp_disabled_or_incomplete_is_offline(self):
        """Disabled or invalid ARP entries must NOT mark subscriber online."""
        pppoe_payload = []
        dhcp_payload = []
        queue_payload = [{'name': 'sub_alpha', 'target': '10.10.10.55/32'}]
        arp_payload = [{
            '.id': '*a1',
            'address': '10.10.10.55',
            'mac-address': 'FE:DC:BA:98:76:54',
            'disabled': 'true',
        }]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload, arp_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_static_arp_incomplete_flag_or_dummy_mac_is_offline(self):
        """ARP entry with complete='false' or status='incomplete' or dummy MAC is rejected."""
        pppoe_payload = []
        dhcp_payload = []
        queue_payload = [{'name': 'sub_alpha', 'target': '10.10.10.55/32'}]
        arp_payload = [{
            '.id': '*a1',
            'address': '10.10.10.55',
            'mac-address': '00:00:00:00:00:00',
            'complete': 'false',
            'status': 'incomplete',
        }]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload, arp_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_static_queue_disabled_is_offline(self):
        """Disabled simple queue does not match."""
        pppoe_payload = []
        dhcp_payload = []
        queue_payload = [{'name': 'sub_alpha', 'target': '10.10.10.55/32', 'disabled': 'true'}]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_static_queue_subnet_target_rejected(self):
        """
        CRITICAL: If simple queue target is an entire subnet (/24),
        do NOT match arbitrary ARP entries on that subnet to this subscriber.
        """
        pppoe_payload = []
        dhcp_payload = []
        # Target is a /24 subnet rather than a single host
        queue_payload = [{'name': 'sub_alpha', 'target': '192.168.1.0/24'}]

        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [pppoe_payload, dhcp_payload, queue_payload]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. All Offline
    # ─────────────────────────────────────────────────────────────────────────

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_all_tiers_offline_returns_none(self):
        """When all tiers return empty/unmatched results, returns None."""
        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = [[], [], []]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Missing Router Data & Inactive Router
    # ─────────────────────────────────────────────────────────────────────────

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_missing_router_data_returns_none(self):
        """None router, router with empty host or empty credentials safely returns None."""
        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            self.assertIsNone(get_online_status(None, "sub_alpha"))

            # Router without IP
            empty_ip_router = Router(tenant=self.tenant_a, name="No-IP", ip_address="", username="admin")
            self.assertIsNone(get_online_status(empty_ip_router, "sub_alpha"))

            # Router without username
            empty_user_router = Router(tenant=self.tenant_a, name="No-User", ip_address="10.1.1.1", username="")
            self.assertIsNone(get_online_status(empty_user_router, "sub_alpha"))

            # Inactive router
            inactive_router = Router(tenant=self.tenant_a, name="Inactive", ip_address="10.1.1.1", username="admin", is_active=False)
            self.assertIsNone(get_online_status(inactive_router, "sub_alpha"))

            rc.assert_not_called()

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Fault Tolerance: Malformed Responses & Exceptions
    # ─────────────────────────────────────────────────────────────────────────

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_malformed_router_response_handled_gracefully(self):
        """Dict error responses ({'error': 404}), HTML strings, or lists of non-dicts do not crash."""
        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            # Router returns error dicts or garbage HTML
            client.get.side_effect = [
                {'error': 404, 'message': 'not found'},
                '<html><head><title>502 Bad Gateway</title></head></html>',
                [{'error': 500, 'detail': 'internal failure'}],
                ['Invalid non-JSON string', 123, None],
                None,
            ]

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_timeout_and_socket_errors_handled_gracefully(self):
        """Connection timeouts on any tier are caught safely and yield None."""
        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            client = rc.from_router.return_value.__enter__.return_value
            client.get.side_effect = TimeoutError("Router unreachable")

            status = get_online_status(self.router_a, "sub_alpha")

        self.assertIsNone(status)

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_empty_or_whitespace_username_returns_none(self):
        """Blank or whitespace usernames return None without querying router."""
        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient') as rc:
            self.assertIsNone(get_online_status(self.router_a, ""))
            self.assertIsNone(get_online_status(self.router_a, "   "))
            self.assertIsNone(get_online_status(self.router_a, None))
            rc.assert_not_called()

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Tenant and Router Scoping Isolation
    # ─────────────────────────────────────────────────────────────────────────

    @override_settings(NETWORK_ENABLE_MULTIMETHOD_ONLINE=True)
    def test_tenant_scoping_isolation(self):
        """
        Detection is strictly scoped to the specified router and tenant.
        Mismatched tenant returns None immediately without calling router.
        """
        with mock.patch('apps.network.services.online_detection.MikroTikRESTClient.from_router') as mock_from_router:
            mock_client = mock.MagicMock()
            mock_from_router.return_value.__enter__.return_value = mock_client
            mock_client.get.return_value = []

            # 1. Matching tenant succeeds and queries router_a
            status = get_online_status(self.router_a, "sub_alpha", tenant=self.tenant_a)
            self.assertIsNone(status)  # offline
            mock_from_router.assert_called_with(self.router_a)

            mock_from_router.reset_mock()

            # 2. Mismatched tenant (querying router_a with tenant_b) blocked immediately
            status = get_online_status(self.router_a, "sub_alpha", tenant=self.tenant_b)
            self.assertIsNone(status)
            mock_from_router.assert_not_called()

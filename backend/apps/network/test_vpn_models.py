from django.test import TestCase
from django.core.exceptions import ValidationError
from apps.core.models import Tenant
from apps.network.models import OLT, Router, WireGuardConfig, WireGuardSubnet

class WireGuardModelTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core-Mikrotik-1",
            ip_address="192.168.1.1",
            username="admin"
        )

    def test_create_wireguard_config_tenant_default(self):
        cfg = WireGuardConfig.objects.create(
            tenant=self.tenant,
            router=None,
            wg_ip="10.255.0.2/30",
            mik_public_key="mik_pub_key_123=",
            vps_public_key="vps_pub_key_456=",
            endpoint_ip="103.145.120.5",
            endpoint_port=51820,
            router_name="Default Hub"
        )
        self.assertEqual(cfg.wg_ip, "10.255.0.2/30")
        self.assertIsNone(cfg.router)
        self.assertFalse(cfg.is_reachable)

    def test_create_wireguard_config_router_specific(self):
        cfg = WireGuardConfig.objects.create(
            tenant=self.tenant,
            router=self.router,
            wg_ip="10.255.0.6/30",
            mik_public_key="mik_pub_key_789=",
            vps_public_key="vps_pub_key_456=",
            endpoint_ip="103.145.120.5",
            endpoint_port=51820,
            router_name="Router 1 Specific"
        )
        self.assertEqual(cfg.router, self.router)

    def test_create_wireguard_subnet(self):
        cfg = WireGuardConfig.objects.create(
            tenant=self.tenant,
            wg_ip="10.255.0.2/30",
            mik_public_key="pubkey=",
            vps_public_key="vpskey=",
            endpoint_ip="103.145.120.5"
        )
        subnet = WireGuardSubnet.objects.create(
            tenant=self.tenant,
            vpn_config=cfg,
            subnet="172.25.28.0/24",
            label="OLT Subnet BDCOM"
        )
        self.assertEqual(subnet.subnet, "172.25.28.0/24")
        self.assertEqual(subnet.vpn_config, cfg)

    def test_cross_tenant_related_devices_are_rejected(self):
        other = Tenant.objects.create(name="Other ISP", slug="other-isp")
        other_router = Router.objects.create(tenant=other, name="Other router", ip_address="192.168.2.1")
        with self.assertRaises(ValidationError):
            WireGuardConfig.objects.create(
                tenant=self.tenant, router=other_router, wg_ip="10.255.0.2/30",
                mik_public_key="pub=", vps_public_key="vps=", endpoint_ip="192.0.2.1",
            )

    def test_cross_tenant_subnet_relationships_are_rejected(self):
        other = Tenant.objects.create(name="Other ISP", slug="other-isp")
        cfg = WireGuardConfig.objects.create(tenant=self.tenant, wg_ip="10.255.0.2/30", mik_public_key="pub=", vps_public_key="vps=", endpoint_ip="192.0.2.1")
        other_olt = OLT.objects.create(tenant=other, name="Other OLT", ip_address="192.168.2.2")
        with self.assertRaises(ValidationError):
            WireGuardSubnet.objects.create(tenant=self.tenant, vpn_config=cfg, olt=other_olt, subnet="172.25.28.0/24")

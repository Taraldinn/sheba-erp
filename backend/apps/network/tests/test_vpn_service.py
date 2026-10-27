from django.test import TestCase
from apps.core.models import Tenant
from apps.network.models import WireGuardConfig, WireGuardSubnet
from apps.network.services.vpn import WireGuardService

class WireGuardServiceTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.raw_private_key = "aGVsbG8td2lyZWd1YXJkLXByaXZhdGUta2V5LTEyMw=="
        self.enc_key = WireGuardService.encrypt_private_key(self.raw_private_key, self.tenant.id)
        self.config = WireGuardConfig.objects.create(
            tenant=self.tenant,
            wg_ip="10.255.0.2/30",
            mik_public_key="mik_pub_key=",
            mik_private_key_enc=self.enc_key,
            mik_private_key_set=True,
            vps_public_key="vps_pub_key=",
            endpoint_ip="103.145.120.5",
            endpoint_port=51820,
            allowed_ips="0.0.0.0/0",
            router_name="NOC-Main-Router"
        )
        WireGuardSubnet.objects.create(
            tenant=self.tenant,
            vpn_config=self.config,
            subnet="172.25.28.0/24",
            label="OLT 1"
        )

    def test_encryption_and_decryption(self):
        decrypted = WireGuardService.decrypt_private_key(self.enc_key, self.tenant.id)
        self.assertEqual(decrypted, self.raw_private_key)

    def test_script_generation(self):
        script = WireGuardService.generate_mikrotik_script(self.config)
        self.assertIn('/interface wireguard add name="wg-', script)
        self.assertIn(self.raw_private_key, script)
        self.assertIn('address=10.255.0.2/30', script)
        self.assertIn('endpoint-address=103.145.120.5', script)
        self.assertIn('dst-address=172.25.28.0/24', script)
        self.assertIn('action=masquerade', script)

import json
from rest_framework.test import APITestCase
from django.utils import timezone
from apps.core.models import Tenant, CompanySetting
from apps.customers.models import Customer
from apps.network.models import UserSession, Router
from apps.customers.jwt import generate_customer_jwt


class PortalTelemetryAndFunboxTestCase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="FiberLink", slug="fiberlink")
        CompanySetting.objects.create(
            tenant=self.tenant,
            company_name="FiberLink ISP",
            payment_tutorial_video="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            funbox_links=[
                {"name": "BDIX Movie Server", "url": "http://10.16.100.1", "category": "FTP", "icon": "film"},
                {"name": "Live TV Portal", "url": "http://tv.bdix.net", "category": "TV", "icon": "tv"}
            ]
        )
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core Router 1",
            ip_address="192.168.1.1",
            username="admin",
            password="password",
            status="Offline"
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            full_name="Karim Khan",
            pppoe_username="karim_fl",
            mobile="01799887766",
            status="ACTIVE",
            router=self.router
        )
        self.token = generate_customer_jwt(self.customer)
        self.session = UserSession.objects.create(
            tenant=self.tenant,
            router=self.router,
            username="karim_fl",
            ip_address="10.10.20.55",
            mac_address="AA:BB:CC:DD:EE:FF",
            bytes_in=150000000,
            bytes_out=50000000
        )

    def test_get_portal_settings(self):
        res = self.client.get("/api/v1/portal/settings/", HTTP_HOST="fiberlink.shebafi.com", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["company_name"], "FiberLink ISP")
        self.assertIn("payment_tutorial_video", res.data)

    def test_get_funbox_links(self):
        res = self.client.get("/api/v1/portal/funbox/", HTTP_HOST="fiberlink.shebafi.com", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)
        self.assertEqual(res.data[0]["name"], "BDIX Movie Server")

    def test_funbox_links_validation(self):
        from django.core.exceptions import ValidationError
        from apps.core.models import validate_funbox_links
        with self.assertRaises(ValidationError):
            validate_funbox_links("not-a-list")
        with self.assertRaises(ValidationError):
            validate_funbox_links({"name": "dict"})
        # Should not raise for list
        validate_funbox_links([])
        validate_funbox_links([{"name": "test"}])

    def test_get_live_traffic_unavailable(self):
        # When router telemetry is not reachable and no direct session rates exist, returns None
        res = self.client.get("/api/v1/portal/traffic/", HTTP_HOST="fiberlink.shebafi.com", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["is_online"])
        self.assertIsNone(res.data["download_mbps"])
        self.assertIsNone(res.data["upload_mbps"])

    def test_get_live_traffic_measured_via_cache(self):
        from django.core.cache import cache
        from apps.network.services.live_sessions import LiveSessionService
        cache_key = LiveSessionService.get_cache_key(str(self.tenant.id), str(self.router.id))
        cache.set(cache_key, [{
            'username': 'karim_fl',
            'rx_rate_bps': 25000000,
            'tx_rate_bps': 10000000,
        }])
        res = self.client.get("/api/v1/portal/traffic/", HTTP_HOST="fiberlink.shebafi.com", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["is_online"])
        self.assertEqual(res.data["download_mbps"], 25.0)
        self.assertEqual(res.data["upload_mbps"], 10.0)

    from unittest.mock import patch

    @patch('apps.network.services.mikrotik.MikroTikService.get_traffic_stats')
    def test_get_live_traffic_measured_via_router(self, mock_traffic):
        self.router.status = 'Online'
        self.router.save()
        mock_traffic.return_value = {
            'rx-bits-per-second': 30000000,
            'tx-bits-per-second': 15000000,
        }
        res = self.client.get("/api/v1/portal/traffic/", HTTP_HOST="fiberlink.shebafi.com", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["is_online"])
        self.assertEqual(res.data["download_mbps"], 30.0)
        self.assertEqual(res.data["upload_mbps"], 15.0)

    def test_get_session_logs(self):
        res = self.client.get("/api/v1/portal/sessions/", HTTP_HOST="fiberlink.shebafi.com", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["ip_address"], "10.10.20.55")
        self.assertTrue(res.data[0]["is_active"])

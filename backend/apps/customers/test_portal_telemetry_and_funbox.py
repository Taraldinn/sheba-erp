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
            funbox_links=json.dumps([
                {"name": "BDIX Movie Server", "url": "http://10.16.100.1", "category": "FTP", "icon": "film"},
                {"name": "Live TV Portal", "url": "http://tv.bdix.net", "category": "TV", "icon": "tv"}
            ])
        )
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core Router 1",
            ip_address="192.168.1.1",
            username="admin",
            password="password"
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

    def test_get_live_traffic(self):
        res = self.client.get("/api/v1/portal/traffic/", HTTP_HOST="fiberlink.shebafi.com", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["is_online"])
        self.assertIn("download_mbps", res.data)
        self.assertIn("upload_mbps", res.data)

    def test_get_session_logs(self):
        res = self.client.get("/api/v1/portal/sessions/", HTTP_HOST="fiberlink.shebafi.com", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["ip_address"], "10.10.20.55")
        self.assertTrue(res.data[0]["is_active"])

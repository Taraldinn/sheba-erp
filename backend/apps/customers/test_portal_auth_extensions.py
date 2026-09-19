from rest_framework.test import APITestCase
from django.contrib.auth.hashers import make_password
from apps.core.models import Tenant
from apps.customers.models import Customer
from apps.customers.jwt import generate_customer_jwt


class PortalAuthExtensionsTestCase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="SpeedNet", slug="speednet")
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            full_name="Tanvir Hossain",
            pppoe_username="tanvir_speed",
            mobile="01711223344",
            pppoe_password="plain_password_123",
            portal_password=make_password("secure_pass_456"),
            status="ACTIVE",
        )

    def test_login_with_portal_password_success(self):
        res = self.client.post("/api/v1/portal/auth/login/", {
            "username": "tanvir_speed",
            "password": "secure_pass_456"
        }, HTTP_HOST="speednet.shebafi.com", format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("token", res.data)
        self.assertEqual(res.data["customer"]["username"], "tanvir_speed")

    def test_login_with_fallback_pppoe_password_success(self):
        cust2 = Customer.objects.create(
            tenant=self.tenant,
            full_name="Rahim Mia",
            pppoe_username="rahim_pppoe",
            mobile="01899001122",
            pppoe_password="pppoe_secret_99",
            status="ACTIVE",
        )
        res = self.client.post("/api/v1/portal/auth/login/", {
            "username": "rahim_pppoe",
            "password": "pppoe_secret_99"
        }, HTTP_HOST="speednet.shebafi.com", format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("token", res.data)

    def test_login_with_invalid_credentials_fails(self):
        res = self.client.post("/api/v1/portal/auth/login/", {
            "username": "tanvir_speed",
            "password": "wrong_password"
        }, HTTP_HOST="speednet.shebafi.com", format="json")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data.get("code"), "INVALID_CREDENTIALS")

    def test_change_password_success(self):
        token = generate_customer_jwt(self.customer)
        res = self.client.post(
            "/api/v1/portal/auth/change-password/",
            {
                "current_password": "secure_pass_456",
                "new_password": "new_super_secret_789"
            },
            HTTP_HOST="speednet.shebafi.com",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.customer.refresh_from_db()
        from django.contrib.auth.hashers import check_password
        self.assertTrue(check_password("new_super_secret_789", self.customer.portal_password))

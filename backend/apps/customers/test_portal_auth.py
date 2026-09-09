import json
import time
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework import status
from django.core.cache import cache
from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.customers.jwt import generate_customer_jwt, decode_customer_jwt
from apps.customers.authentication import CustomerJWTAuthentication


class CustomerPortalAuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

        from apps.core.models import TenantDomain

        # Create Tenant A
        self.tenant_a = Tenant.objects.create(
            name="Alpha Telecom",
            slug="alpha",
            is_active=True
        )
        TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname="alpha.localhost",
            is_primary=True
        )

        # Create Tenant B
        self.tenant_b = Tenant.objects.create(
            name="Beta Fiber",
            slug="beta",
            is_active=True
        )
        TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname="beta.localhost",
            is_primary=True
        )

        self.package_a = Package.objects.create(
            tenant=self.tenant_a,
            name="Starter 10M",
            mikrotik_profile="starter_profile",
            speed_mbps=10,
            upload_speed_mbps=10,
            validity_days=30,
            regular_price=500.00
        )

        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="CUST-101",
            full_name="Kamrul Hasan",
            mobile="01711000111",
            email="kamrul@example.com",
            pppoe_username="kamrul_net",
            pppoe_password="secret_password_123",
            package=self.package_a,
            monthly_bill=500.00,
            due_amount=0.00,
            status=CustomerStatus.ACTIVE
        )

    def tearDown(self):
        cache.clear()

    def test_jwt_generation_and_valid_decoding(self):
        """Valid token encodes customer and tenant claims and decodes properly."""
        token = generate_customer_jwt(self.customer_a)
        self.assertIsInstance(token, str)
        claims = decode_customer_jwt(token, tenant_id=self.tenant_a.id)
        self.assertIsNotNone(claims)
        self.assertEqual(claims.get("customer_id"), str(self.customer_a.id))
        self.assertEqual(claims.get("tenant_id"), str(self.tenant_a.id))
        self.assertEqual(claims.get("pppoe_username"), self.customer_a.pppoe_username)

    def test_jwt_cross_tenant_rejection(self):
        """Token issued for Tenant A is rejected when accessed under Tenant B."""
        token = generate_customer_jwt(self.customer_a)
        claims = decode_customer_jwt(token, tenant_id=self.tenant_b.id)
        self.assertIsNone(claims)

    def test_request_otp_success_in_debug_mode(self):
        """Requesting OTP returns debug_otp in DEBUG mode and stores key in cache."""
        with override_settings(DEBUG=True):
            response = self.client.post(
                "/api/v1/portal/auth/request-otp/",
                {"identifier": "01711000111"},
                HTTP_HOST="alpha.localhost"
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertTrue(response.data.get("success"))
            debug_otp = response.data.get("debug_otp")
            self.assertIsNotNone(debug_otp)
            self.assertEqual(len(debug_otp), 6)

            # Verify cache key exists
            cached_otp = cache.get(f"otp:{self.tenant_a.id}:{self.customer_a.id}")
            self.assertEqual(cached_otp, debug_otp)

    def test_request_otp_by_pppoe_username(self):
        """Customer can request OTP using PPPoE username."""
        with override_settings(DEBUG=True):
            response = self.client.post(
                "/api/v1/portal/auth/request-otp/",
                {"identifier": "kamrul_net"},
                HTTP_HOST="alpha.localhost"
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertTrue(response.data.get("success"))

    def test_request_otp_rate_limiting(self):
        """Exceeding 3 OTP requests in 10 minutes returns HTTP 429."""
        with override_settings(DEBUG=True):
            for _ in range(3):
                res = self.client.post(
                    "/api/v1/portal/auth/request-otp/",
                    {"identifier": "01711000111"},
                    HTTP_HOST="alpha.localhost"
                )
                self.assertEqual(res.status_code, status.HTTP_200_OK)

            # 4th request must be throttled
            throttled_res = self.client.post(
                "/api/v1/portal/auth/request-otp/",
                {"identifier": "01711000111"},
                HTTP_HOST="alpha.localhost"
            )
            self.assertEqual(throttled_res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_verify_otp_success_returns_jwt_and_clears_cache(self):
        """Correct OTP returns JWT and removes OTP key from cache."""
        otp_code = "654321"
        cache.set(f"otp:{self.tenant_a.id}:{self.customer_a.id}", otp_code, timeout=300)

        response = self.client.post(
            "/api/v1/portal/auth/verify-otp/",
            {"identifier": "01711000111", "otp": otp_code},
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("success"))
        token = response.data.get("token")
        self.assertIsNotNone(token)

        # Cache key must be deleted
        self.assertIsNone(cache.get(f"otp:{self.tenant_a.id}:{self.customer_a.id}"))

    def test_verify_otp_invalid_code_rejected(self):
        """Wrong OTP returns HTTP 400."""
        cache.set(f"otp:{self.tenant_a.id}:{self.customer_a.id}", "111222", timeout=300)
        response = self.client.post(
            "/api/v1/portal/auth/verify-otp/",
            {"identifier": "01711000111", "otp": "999999"},
            HTTP_HOST="alpha.localhost"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("code"), "INVALID_OTP")

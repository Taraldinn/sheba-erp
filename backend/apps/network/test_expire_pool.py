from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.core.models import Tenant
from apps.billing.models import Package
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router
from apps.customers.router_sync import sync_customer_to_router

User = get_user_model()


class ExpirePoolTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test ISP", slug="test-isp")
        self.user = User.objects.create_user(
            username="netadmin", email="netadmin@test.com", password="password123"
        )
        self.package = Package.objects.create(
            tenant=self.tenant,
            name="20Mbps Starter",
            speed_mbps=20,
            regular_price=800,
            mikrotik_profile="profile_20m"
        )
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core-Mikrotik-01",
            ip_address="192.168.88.1",
            api_protocol="REST",
            username="admin",
            password="secretpassword",
            expire_pool_enabled=True,
            expire_pool_name="expired_pool",
            expire_profile_name="sheba_expired_profile",
            expire_rate_limit="32k/32k",
            expire_pool_network="172.31.250.10-172.31.250.250",
            expire_local_address="172.31.250.1",
            expire_redirect_url="http://172.31.250.1:8080/portal?expired=true",
            expire_walled_garden="bkash.com, nagad.com.bd, sslcommerz.com, rocket",
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            full_name="Mahmudul Hasan",
            pppoe_username="hasan_user",
            pppoe_password="pppoepassword",
            package=self.package,
            router=self.router,
            status=CustomerStatus.EXPIRED,
            monthly_bill=800,
        )

    def test_router_expire_pool_script_generation(self):
        """Verifies that generate_mikrotik_expire_pool_script produces all 5 layers of RouterOS config."""
        script = self.router.generate_mikrotik_expire_pool_script()
        self.assertIn('/ip pool add name="expired_pool"', script)
        self.assertIn('ranges="172.31.250.10-172.31.250.250"', script)
        self.assertIn('/ppp profile add name="sheba_expired_profile"', script)
        self.assertIn('rate-limit="32k/32k"', script)
        self.assertIn('local-address="172.31.250.1"', script)
        self.assertIn('remote-address="expired_pool"', script)
        self.assertIn('/ip firewall address-list add list="allowed_payment_gateways" address="bkash.com"', script)
        self.assertIn('/ip firewall address-list add list="allowed_payment_gateways" address="nagad.com.bd"', script)
        self.assertIn('/ip firewall nat add chain=dstnat', script)
        self.assertIn('redirect to-ports=8080', script)
        self.assertIn('/ip proxy set enabled=yes port=8080', script)
        self.assertIn('redirect-to="http://172.31.250.1:8080/portal?expired=true"', script)

    @patch("apps.network.services.mikrotik.MikroTikService")
    def test_sync_customer_to_router_expired_with_expire_pool(self, mock_mikrotik_cls):
        """When user is expired and router has expire pool enabled, user is throttled, NOT disabled."""
        mock_svc = MagicMock()
        mock_svc.is_rest = True
        mock_svc.is_api = False
        mock_svc.is_radius = False
        mock_svc.pppoe.find_secret_by_name.return_value = {"name": "hasan_user"}
        mock_mikrotik_cls.return_value = mock_svc

        res = sync_customer_to_router(self.customer)
        self.assertTrue(res['synced'])
        self.assertEqual(res['profile'], 'sheba_expired_profile')
        self.assertFalse(res['disabled'])  # NOT disabled!
        self.assertTrue(res['in_expire_pool'])

        # Verify that update_pppoe_user was called with expire profile and disabled=False
        mock_svc.update_pppoe_user.assert_called_once_with(
            "hasan_user",
            password="pppoepassword",
            profile="sheba_expired_profile",
            disabled=False,
            comment="Sheba: Mahmudul Hasan [EXPIRE-POOL]"
        )

        # Active session must be dropped once so the CPE reconnects into the throttled pool
        mock_svc.disconnect_session.assert_called_once_with("hasan_user")

    @patch("apps.network.services.mikrotik.MikroTikService")
    def test_sync_customer_to_router_expired_without_expire_pool(self, mock_mikrotik_cls):
        """When router has expire pool disabled, expired user is disabled/disconnected."""
        self.router.expire_pool_enabled = False
        self.router.save()

        mock_svc = MagicMock()
        mock_svc.is_rest = True
        mock_svc.is_api = False
        mock_svc.is_radius = False
        mock_svc.pppoe.find_secret_by_name.return_value = {"name": "hasan_user"}
        mock_mikrotik_cls.return_value = mock_svc

        res = sync_customer_to_router(self.customer)
        self.assertTrue(res['synced'])
        self.assertTrue(res['disabled'])  # Hard disabled!
        self.assertFalse(res['in_expire_pool'])

        mock_svc.update_pppoe_user.assert_called_once_with(
            "hasan_user",
            password="pppoepassword",
            profile="profile_20m",
            disabled=True,
            comment="Sheba: Mahmudul Hasan"
        )
        mock_svc.disconnect_session.assert_called_once_with("hasan_user")

    @patch("apps.network.services.mikrotik.MikroTikService")
    def test_sync_customer_active_restores_full_speed(self, mock_mikrotik_cls):
        """When user is Active, secret profile is restored to customer.package.mikrotik_profile."""
        self.customer.status = CustomerStatus.ACTIVE
        self.customer.save()

        mock_svc = MagicMock()
        mock_svc.is_rest = True
        mock_svc.is_api = False
        mock_svc.is_radius = False
        mock_svc.pppoe.find_secret_by_name.return_value = {"name": "hasan_user"}
        mock_mikrotik_cls.return_value = mock_svc

        res = sync_customer_to_router(self.customer)
        self.assertTrue(res['synced'])
        self.assertEqual(res['profile'], 'profile_20m')
        self.assertFalse(res['disabled'])
        self.assertFalse(res['in_expire_pool'])

        mock_svc.update_pppoe_user.assert_called_once_with(
            "hasan_user",
            password="pppoepassword",
            profile="profile_20m",
            disabled=False,
            comment="Sheba: Mahmudul Hasan"
        )

    @patch("apps.network.views.MikroTikService")
    def test_expire_pool_api_get_and_post(self, mock_mikrotik_cls):
        """Tests GET and POST /api/v1/routers/<id>/expire-pool/ endpoint."""
        from rest_framework.test import APIClient

        superuser = User.objects.create_superuser(
            username="super_netadmin", email="super_netadmin@test.com", password="password123"
        )

        client = APIClient()
        client.force_authenticate(user=superuser)
        client.defaults['HTTP_HOST'] = 'test-isp.shebafi.com'

        mock_svc = MagicMock()
        mock_svc.provision_expire_pool.return_value = {"success": True}
        mock_mikrotik_cls.return_value = mock_svc

        # 1. GET
        url = f"/api/v1/routers/{self.router.id}/expire-pool/"
        response = client.get(url, HTTP_X_TENANT_ID=str(self.tenant.id))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["router_id"], str(self.router.id))
        self.assertTrue(data["expire_pool_enabled"])
        self.assertEqual(data["expire_rate_limit"], "32k/32k")
        self.assertEqual(data["stats"]["expired_subscribers"], 1)
        self.assertIn('/ip pool add name="expired_pool"', data["script"])

        # 2. POST update to 20k/50k
        payload = {
            "expire_pool_enabled": True,
            "expire_rate_limit": "20k/50k",
            "expire_pool_network": "172.31.250.20-172.31.250.200",
            "provision_to_router": True
        }
        post_resp = client.post(url, payload, format="json", HTTP_X_TENANT_ID=str(self.tenant.id))
        self.assertEqual(post_resp.status_code, 200)
        updated_data = post_resp.json()
        self.assertEqual(updated_data["expire_rate_limit"], "20k/50k")
        self.assertEqual(updated_data["expire_pool_network"], "172.31.250.20-172.31.250.200")
        self.assertTrue(updated_data["provision_result"]["success"])

        # Reload from DB and verify persisted
        self.router.refresh_from_db()
        self.assertEqual(self.router.expire_rate_limit, "20k/50k")
        self.assertEqual(self.router.expire_pool_network, "172.31.250.20-172.31.250.200")


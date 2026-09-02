from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant
from apps.network.models import Router, OLT


class NetworkSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Net ISP', slug='net-isp')
        self.user = User.objects.create_superuser(username='netadmin', password='password123')
        self.client.force_authenticate(user=self.user)

    def test_network_credentials_not_in_response(self):
        # Create router with sensitive password
        router = Router.objects.create(
            tenant=self.tenant,
            name='Core CCR2004',
            ip_address='192.168.88.1',
            username='admin',
            password='UltraSecretRouterPassword123'
        )

        response = self.client.get(f'/api/v1/routers/{router.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('password', response.data, 'Router password must never leak in API response!')
        self.assertEqual(response.data['name'], 'Core CCR2004')

        # Create OLT with sensitive telnet password
        olt = OLT.objects.create(
            tenant=self.tenant,
            name='Huawei OLT MA5608T',
            ip_address='10.10.10.1',
            telnet_username='root',
            telnet_password='UltraSecretOltPassword456'
        )

        response = self.client.get(f'/api/v1/olts/{olt.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('telnet_password', response.data, 'OLT password must never leak in API response!')
        self.assertEqual(response.data['name'], 'Huawei OLT MA5608T')

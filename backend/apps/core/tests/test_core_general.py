from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant, CompanySetting


class CoreAndHealthTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(
            name='Test ISP',
            slug='testisp',
            domain='testisp.localhost'
        )

    def test_health_check_endpoint(self):
        url = reverse('health-check')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'healthy')
        self.assertEqual(response.data['system'], 'Sheba ISP ERP API')

    def test_company_settings(self):
        setting = CompanySetting.objects.create(
            tenant=self.tenant,
            company_name='Test Sheba Fi'
        )
        self.assertEqual(str(setting), "Settings for Test Sheba Fi (testisp)")

    def test_readiness_probe(self):
        url = reverse('readiness')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'ready')
        self.assertEqual(response.data['db'], 'ok')
        self.assertEqual(response.data['version'], '2.0.0')


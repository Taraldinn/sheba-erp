from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from apps.core.models import Tenant, Organization, OrganizationMembership


class TenantUserProvisioningTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name='Test ISP', slug='test-isp')
        self.tenant = Tenant.objects.create(organization=self.org, name='Test ISP Tenant', slug='test-isp')
        self.owner = User.objects.create_user(username='isp_owner', email='owner@test.com', password='password123')
        OrganizationMembership.objects.create(organization=self.org, user=self.owner, role='OWNER')
        self.client.force_authenticate(user=self.owner)

    def test_owner_can_provision_tenant_user(self):
        resp = self.client.post(f'/api/v1/saas/tenants/{self.tenant.id}/staff-accounts/', {
            'username': 'technician1',
            'email': 'tech@test.com',
            'password': 'SecurePassword123!',
            'first_name': 'Rahim',
            'last_name': 'Uddin',
            'role': 'ISP_STAFF'
        })
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(User.objects.filter(username='technician1').exists())

import datetime
from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Recharge


class CustomerTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Demo ISP', slug='demo-isp')
        self.user = User.objects.create_superuser(username='superadmin', password='adminpassword')
        self.client.force_authenticate(user=self.user)

        self.package = Package.objects.create(
            tenant=self.tenant,
            name='Test 20M Package',
            mikrotik_profile='20M_Profile',
            speed_mbps=20,
            regular_price=600.00
        )

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code='CUST-100',
            full_name='Anisur Rahman',
            mobile='01799887766',
            pppoe_username='anis_test',
            pppoe_password='secretpppoepass',
            package=self.package,
            monthly_bill=600.00,
            due_amount=600.00,
            status=CustomerStatus.EXPIRED,
            expiry_date=timezone.now().date() - datetime.timedelta(days=1)
        )

    def test_customer_recharge_flow(self):
        url = f"/api/v1/customers/{self.customer.id}/recharge/"
        response = self.client.post(url, {
            'amount': '600.00',
            'discount': '0.00',
            'validity_days': 30,
            'payment_method': 'Cash'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, CustomerStatus.ACTIVE)
        self.assertEqual(self.customer.due_amount, 0.00)
        self.assertTrue(self.customer.expiry_date >= timezone.now().date())
        self.assertEqual(Recharge.objects.filter(customer=self.customer).count(), 1)

    def test_customer_query_endpoint(self):
        self.client.logout()
        url = reverse('customer-query') + f"?query={self.customer.pppoe_username}"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['pppoe_username'], 'anis_test')
        self.assertEqual(response.data['name'], 'Anisur Rahman')

    def test_unauthorized_customer_access(self):
        self.client.logout()
        response = self.client.get(f"/api/v1/customers/{self.customer.id}/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_tenant_isolation(self):
        # Create second isolated tenant and user
        tenant_b = Tenant.objects.create(name='Other ISP', slug='other-isp')
        user_b = User.objects.create_user(username='other_staff', password='password123')
        from apps.authentication.models import StaffProfile, UserRole
        StaffProfile.objects.create(user=user_b, tenant=tenant_b, role=UserRole.ADMIN)

        # Authenticate as user_b belonging to tenant B
        self.client.force_authenticate(user=user_b)

        # Attempt to access tenant A's customer by ID (IDOR attack vector)
        response = self.client.get(f"/api/v1/customers/{self.customer.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        # Attempt to list customers — must NOT see tenant A's customers
        list_response = self.client.get("/api/v1/customers/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        ids = [c['id'] for c in list_response.data.get('results', list_response.data)]
        self.assertNotIn(str(self.customer.id), ids)


from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.authentication.models import StaffProfile, UserRole


class AuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='staff_test',
            password='securepassword123',
            email='staff@test.com'
        )
        self.profile = StaffProfile.objects.create(
            user=self.user,
            role=UserRole.BILLING_OPERATOR
        )

    def test_login_success(self):
        url = reverse('auth-login')
        response = self.client.post(url, {
            'username': 'staff_test',
            'password': 'securepassword123'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['username'], 'staff_test')

    def test_login_invalid_password(self):
        url = reverse('auth-login')
        response = self.client.post(url, {
            'username': 'staff_test',
            'password': 'wrongpassword'
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

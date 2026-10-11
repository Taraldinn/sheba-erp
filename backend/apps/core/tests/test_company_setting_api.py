"""
Tests for CompanySetting API:
- GET /api/v1/settings/current/ (Auto-initialization + scoped retrieval)
- PATCH /api/v1/settings/current/ (Partial updates for billing, profile, SMS, and network)
- POST /api/v1/settings/test-sms/ (Interactive test SMS simulation)
- Strict Multi-Tenant Isolation
"""
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, TenantDomain, CompanySetting
from apps.authentication.models import StaffProfile, StaffMembership, Role, UserRole


class CompanySettingAPITests(TestCase):
    def setUp(self):
        # Tenant 1: Apex Fiber
        self.tenant1 = Tenant.objects.create(
            name='Apex Fiber Ltd',
            slug='apexfiber',
            domain='apexfiber.shebafi.xyz',
            is_active=True
        )
        TenantDomain.objects.create(
            tenant=self.tenant1,
            hostname='apexfiber.shebafi.xyz',
            is_primary=True,
            is_active=True,
            verified=True
        )

        # Tenant 2: Beacon Broadband
        self.tenant2 = Tenant.objects.create(
            name='Beacon Broadband',
            slug='beacon',
            domain='beacon.shebafi.xyz',
            is_active=True
        )
        TenantDomain.objects.create(
            tenant=self.tenant2,
            hostname='beacon.shebafi.xyz',
            is_primary=True,
            is_active=True,
            verified=True
        )

        # User 1 (Admin of Tenant 1)
        self.user1 = User.objects.create_user(
            username='apex_admin',
            email='admin@apexfiber.net',
            password='Password123!'
        )
        self.token1 = Token.objects.create(user=self.user1)
        self.profile1 = StaffProfile.objects.create(
            user=self.user1,
            tenant=self.tenant1,
            role=UserRole.ADMIN,
            phone='+880 1700-111111'
        )
        admin_role1, _ = Role.objects.get_or_create(tenant=self.tenant1, name='ISP_ADMIN')
        StaffMembership.objects.update_or_create(
            user=self.user1,
            tenant=self.tenant1,
            defaults={'role': admin_role1, 'is_active': True}
        )

        # User 2 (Admin of Tenant 2)
        self.user2 = User.objects.create_user(
            username='beacon_admin',
            email='admin@beacon.net',
            password='Password123!'
        )
        self.token2 = Token.objects.create(user=self.user2)
        self.profile2 = StaffProfile.objects.create(
            user=self.user2,
            tenant=self.tenant2,
            role=UserRole.ADMIN,
            phone='+880 1700-222222'
        )
        admin_role2, _ = Role.objects.get_or_create(tenant=self.tenant2, name='ISP_ADMIN')
        StaffMembership.objects.update_or_create(
            user=self.user2,
            tenant=self.tenant2,
            defaults={'role': admin_role2, 'is_active': True}
        )

        self.client = APIClient()

    def test_01_get_current_settings_auto_initializes(self):
        """GET /api/v1/settings/current/ auto initializes a CompanySetting row for the active tenant."""
        self.assertEqual(CompanySetting.objects.filter(tenant=self.tenant1).count(), 0)

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')
        res = self.client.get(
            '/api/v1/settings/current/',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['company_name'], 'Apex Fiber Ltd')
        self.assertEqual(CompanySetting.objects.filter(tenant=self.tenant1).count(), 1)

    def test_02_patch_current_settings_updates_fields(self):
        """PATCH /api/v1/settings/current/ updates configuration values seamlessly."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')

        patch_data = {
            'company_name': 'Apex Optical Internet',
            'support_phone': '+880 1700-112233',
            'support_email': 'support@apexoptical.com',
            'grace_period_days': 5,
            'promise_max_days': 7,
            'admin_expire_time': '22:00',
            'auto_lock_on_expiry': True,
            'sms_enabled': True,
            'sms_sender_id': 'APEXFIBER',
            'sms_provider': 'BulkSMSBD',
            'default_dns_primary': '1.1.1.1',
            'default_dns_secondary': '8.8.8.8',
            'mikrotik_default_port': 8729
        }

        res = self.client.patch(
            '/api/v1/settings/current/',
            patch_data,
            format='json',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['company_name'], 'Apex Optical Internet')
        self.assertEqual(res.data['support_phone'], '+880 1700-112233')
        self.assertEqual(res.data['grace_period_days'], 5)
        self.assertEqual(res.data['promise_max_days'], 7)
        self.assertEqual(res.data['sms_sender_id'], 'APEXFIBER')
        self.assertEqual(res.data['sms_provider'], 'BulkSMSBD')
        self.assertEqual(res.data['default_dns_primary'], '1.1.1.1')
        self.assertEqual(res.data['mikrotik_default_port'], 8729)

        # Verify in DB
        db_setting = CompanySetting.objects.get(tenant=self.tenant1)
        self.assertEqual(db_setting.company_name, 'Apex Optical Internet')
        self.assertEqual(db_setting.support_email, 'support@apexoptical.com')
        self.assertEqual(db_setting.grace_period_days, 5)

    def test_03_test_sms_endpoint(self):
        """POST /api/v1/settings/test-sms/ validates parameters and confirms dispatch."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')

        # Missing phone should return 400
        fail_res = self.client.post(
            '/api/v1/settings/test-sms/',
            {'message': 'Testing'},
            format='json',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )
        self.assertEqual(fail_res.status_code, status.HTTP_400_BAD_REQUEST)

        # Successful test dispatch
        ok_res = self.client.post(
            '/api/v1/settings/test-sms/',
            {'phone': '+880 1711-000000', 'message': 'Sheba ERP test alert'},
            format='json',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )
        self.assertEqual(ok_res.status_code, status.HTTP_200_OK)
        self.assertEqual(ok_res.data['status'], 'success')
        self.assertEqual(ok_res.data['phone'], '+880 1711-000000')

    def test_04_strict_tenant_isolation(self):
        """Tenant 2 cannot read or modify Tenant 1's settings."""
        # Provision Tenant 1 settings
        CompanySetting.objects.create(
            tenant=self.tenant1,
            company_name='Apex Fiber Private',
            support_email='private@apex.com'
        )

        # Tenant 2 calls current settings
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token2.key}')
        res2 = self.client.get(
            '/api/v1/settings/current/',
            HTTP_HOST='beacon.shebafi.xyz'
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        # Should see Beacon Broadband, not Apex Fiber Private
        self.assertEqual(res2.data['company_name'], 'Beacon Broadband')
        self.assertNotEqual(res2.data['support_email'], 'private@apex.com')

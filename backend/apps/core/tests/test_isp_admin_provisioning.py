"""
Tests for direct ISP Admin provisioning from Super Admin and delegated staff creation.
"""
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import StaffProfile, StaffMembership, Role, UserRole


class ISPAdminProvisioningTests(TestCase):
    def setUp(self):
        # 1. Super Admin
        self.superadmin_user = User.objects.create_superuser(
            username='central_master',
            email='master@shebafi.xyz',
            password='MasterPassword123!'
        )
        self.superadmin_token = Token.objects.create(user=self.superadmin_user)

        # 2. Test Tenant
        self.tenant = Tenant.objects.create(
            name='Apex Fiber Ltd',
            slug='apexfiber',
            domain='apexfiber.shebafi.xyz',
            contact_email='admin@apexfiber.net',
            contact_phone='+880 1711-223344',
            plan='Growth',
            is_active=True
        )
        self.tenant_domain = TenantDomain.objects.create(
            tenant=self.tenant,
            hostname='apexfiber.shebafi.xyz',
            is_primary=True,
            is_active=True,
            verified=True
        )

        self.client = APIClient()

    def test_01_superadmin_creates_isp_admin_via_tenant_endpoint(self):
        """Super Admin directly provisions an ISP Admin for a tenant via /api/v1/saas/tenants/{id}/create-admin/"""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.superadmin_token.key}')
        payload = {
            'username': 'apex_md',
            'password': 'ApexSecurePass123!',
            'email': 'md@apexfiber.net',
            'phone': '+880 1811-998877',
            'first_name': 'Tariq',
            'last_name': 'Hasan'
        }

        res = self.client.post(
            f'/api/v1/saas/tenants/{self.tenant.id}/create-admin/',
            payload,
            format='json',
            HTTP_HOST='admin.shebafi.xyz'
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['username'], 'apex_md')
        self.assertEqual(res.data['role'], 'Admin')

        # Verify DB records
        admin_user = User.objects.get(username='apex_md')
        self.assertTrue(admin_user.is_staff)
        self.assertFalse(admin_user.is_superuser)

        profile = StaffProfile.objects.get(user=admin_user)
        self.assertEqual(profile.tenant, self.tenant)
        self.assertEqual(profile.role, UserRole.ADMIN)

        membership = StaffMembership.objects.get(user=admin_user, tenant=self.tenant)
        self.assertTrue(membership.is_active)
        self.assertIsNotNone(membership.role)
        self.assertIn(membership.role.name, ['Admin', 'ADMIN'])

        # Verify GET /api/v1/saas/tenants/{id}/admins/
        admins_res = self.client.get(
            f'/api/v1/saas/tenants/{self.tenant.id}/admins/',
            HTTP_HOST='admin.shebafi.xyz'
        )
        self.assertEqual(admins_res.status_code, status.HTTP_200_OK)
        self.assertTrue(any(a['username'] == 'apex_md' for a in admins_res.data))

    def test_02_isp_admin_authenticates_and_creates_staff(self):
        """Newly created ISP Admin can log into their ISP tenant and create office staff."""
        # 1. Provision ISP Admin
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.superadmin_token.key}')
        self.client.post(
            f'/api/v1/saas/tenants/{self.tenant.id}/create-admin/',
            {
                'username': 'apex_director',
                'password': 'DirectorPassword123!',
                'email': 'director@apexfiber.net',
                'first_name': 'Kamal',
                'last_name': 'Uddin'
            },
            format='json',
            HTTP_HOST='admin.shebafi.xyz'
        )

        # 2. Login on tenant domain
        self.client.credentials()  # clear superadmin auth
        login_res = self.client.post(
            '/api/v1/auth/login/',
            {
                'username': 'apex_director',
                'password': 'DirectorPassword123!'
            },
            format='json',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertEqual(login_res.data['role'], 'ADMIN')
        self.assertIsNotNone(login_res.data['token'])
        isp_token = login_res.data['token']

        # 3. ISP Admin accesses /api/v1/staff/ and creates a new staff member
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {isp_token}')
        staff_payload = {
            'username': 'field_tech_rahim',
            'password': 'TechPassword123!',
            'first_name': 'Rahim',
            'last_name': 'Mia',
            'role': UserRole.LINE_MAN,
            'phone': '+880 1911-001122',
            'email': 'rahim@apexfiber.net'
        }
        create_staff_res = self.client.post(
            '/api/v1/staff/',
            staff_payload,
            format='json',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )
        self.assertEqual(create_staff_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_staff_res.data['username'], 'field_tech_rahim')

        # Verify created staff in DB
        created_tech = User.objects.get(username='field_tech_rahim')
        tech_profile = StaffProfile.objects.get(user=created_tech)
        self.assertEqual(tech_profile.tenant, self.tenant)
        self.assertEqual(tech_profile.role, UserRole.LINE_MAN)

    def test_03_user_directory_creation_provisions_isp_admin(self):
        """User directory creation with role='TENANT_OWNER' provisions complete StaffMembership and seeds roles."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.superadmin_token.key}')
        payload = {
            'username': 'apex_owner2',
            'password': 'OwnerPassword123!',
            'email': 'owner2@apexfiber.net',
            'role': 'TENANT_OWNER',
            'tenant_id': str(self.tenant.id),
            'phone': '+880 1899-001122'
        }
        res = self.client.post('/api/v1/saas/users/', payload, format='json', HTTP_HOST='admin.shebafi.xyz')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(username='apex_owner2')
        membership = StaffMembership.objects.get(user=user, tenant=self.tenant)
        self.assertTrue(membership.is_active)
        self.assertIn(membership.role.name, ['Admin', 'ADMIN'])


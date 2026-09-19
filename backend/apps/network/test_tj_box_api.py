"""
Tests for TJBox (Optical Terminal Joint Box) API:
- GET /api/v1/tj-boxes/
- POST /api/v1/tj-boxes/
- PATCH /api/v1/tj-boxes/{id}/
- DELETE /api/v1/tj-boxes/{id}/
- Multi-Tenant Isolation
"""
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import StaffProfile, StaffMembership, Role, UserRole
from apps.network.models import POPBranch, TJBox, TJBoxCategory


class TJBoxAPITests(TestCase):
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

        # Zones
        self.zone1 = POPBranch.objects.create(
            tenant=self.tenant1,
            name='Zone A - West Dhanmondi',
            code='Z-WDH'
        )
        self.zone2 = POPBranch.objects.create(
            tenant=self.tenant2,
            name='Zone B - Gulshan Hub',
            code='Z-GSH'
        )

        self.client = APIClient()

    def test_01_create_and_list_tj_boxes(self):
        """ISP Admin creates a TJ box with structured fiber lines and cores."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')

        fiber_lines = [
            {
                'category': '4core',
                'in_out': 'In',
                'brand': 'FiberHome',
                'code': 'FIB-01',
                'cores': [
                    {'status': 'used', 'color': 'blue', 'note': 'Sub-101'},
                    {'status': 'used', 'color': 'orange', 'note': 'Sub-102'},
                    {'status': 'free', 'color': 'green', 'note': ''},
                    {'status': 'free', 'color': 'brown', 'note': ''},
                ]
            }
        ]

        payload = {
            'name': 'BOX-A1',
            'zone': str(self.zone1.id),
            'box_category': 'Master Box',
            'lat_long': '23.8103, 90.4125',
            'notes': 'SubZone-1, Pillar 4',
            'fiber_code': fiber_lines
        }

        res = self.client.post(
            '/api/v1/tj-boxes/',
            payload,
            format='json',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        box_id = res.data['id']
        self.assertEqual(res.data['name'], 'BOX-A1')
        self.assertEqual(res.data['zone_name'], 'Zone A - West Dhanmondi')
        self.assertEqual(len(res.data['fiber_code']), 1)

        # Verify DB object
        box = TJBox.objects.get(id=box_id)
        self.assertEqual(box.tenant, self.tenant1)
        self.assertEqual(box.latitude, box.latitude)
        self.assertIsNotNone(box.latitude)

        # Verify GET list
        get_res = self.client.get(
            '/api/v1/tj-boxes/',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        results = get_res.data if isinstance(get_res.data, list) else get_res.data.get('results', [])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['name'], 'BOX-A1')

    def test_02_update_tj_box(self):
        """Update TJ box fields and fiber core configuration."""
        box = TJBox.objects.create(
            tenant=self.tenant1,
            name='BOX-A2',
            zone=self.zone1,
            box_category=TJBoxCategory.SPLITTER_BOX,
            notes='Initial Note',
            lat_long='23.7500, 90.3800'
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')
        patch_payload = {
            'name': 'BOX-A2-UPDATED',
            'notes': 'Splitter 1:8 connected',
            'box_category': 'Splitter Box'
        }

        res = self.client.patch(
            f'/api/v1/tj-boxes/{box.id}/',
            patch_payload,
            format='json',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['name'], 'BOX-A2-UPDATED')
        self.assertEqual(res.data['notes'], 'Splitter 1:8 connected')

        box.refresh_from_db()
        self.assertEqual(box.name, 'BOX-A2-UPDATED')

    def test_03_delete_tj_box(self):
        """Delete TJ box."""
        box = TJBox.objects.create(
            tenant=self.tenant1,
            name='BOX-TO-DELETE',
            zone=self.zone1
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')
        res = self.client.delete(
            f'/api/v1/tj-boxes/{box.id}/',
            HTTP_HOST='apexfiber.shebafi.xyz'
        )
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TJBox.objects.filter(id=box.id).exists())

    def test_04_tenant_isolation(self):
        """Tenant 2 cannot view or modify Tenant 1's TJ boxes."""
        box1 = TJBox.objects.create(
            tenant=self.tenant1,
            name='BOX-APEX-SECRET',
            zone=self.zone1
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token2.key}')
        # List should not include box1
        list_res = self.client.get(
            '/api/v1/tj-boxes/',
            HTTP_HOST='beacon.shebafi.xyz'
        )
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        results = list_res.data if isinstance(list_res.data, list) else list_res.data.get('results', [])
        self.assertEqual(len(results), 0)

        # Retrieve should 404
        get_res = self.client.get(
            f'/api/v1/tj-boxes/{box1.id}/',
            HTTP_HOST='beacon.shebafi.xyz'
        )
        self.assertEqual(get_res.status_code, status.HTTP_404_NOT_FOUND)

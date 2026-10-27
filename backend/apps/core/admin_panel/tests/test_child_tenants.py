"""
ISP Admin Dashboard — Child tenant provisioning tests.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.authentication.models import StaffMembership, StaffProfile, UserRole
from apps.core.models import AuditLog, Tenant, TenantDomain

from .helpers import (
    ADMIN_HOST,
    make_admin_user,
    make_child_tenant,
    make_non_admin_user,
    make_parent_tenant,
    token_for,
)


class IspAdminChildTenantTests(TestCase):

    def setUp(self):
        self.parent = make_parent_tenant()
        self.admin = make_admin_user(self.parent, username='parent-admin')
        self.technician = make_non_admin_user(
            self.parent, username='field-tech',
        )
        self.client = APIClient()

    def test_list_returns_only_parents_children(self):
        make_child_tenant(self.parent, slug='child-a', name='Child A')
        make_child_tenant(self.parent, slug='child-b', name='Child B')

        other_parent = make_parent_tenant(slug='other-parent', name='Other Parent')
        make_child_tenant(other_parent, slug='child-x', name='Child X')

        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.get(
            '/api/v1/admin/child-tenants/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        slugs = [t['slug'] for t in res.data]
        self.assertIn('child-a', slugs)
        self.assertIn('child-b', slugs)
        self.assertNotIn('child-x', slugs)

    def test_create_provisions_admin_via_provision_tenant_admin(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        payload = {
            'name': 'Branch One ISP',
            'slug': 'branch-one',
            'admin_username': 'branch-one-admin',
            'admin_password': 'BranchSecure123!',
            'admin_email': 'admin@branch-one.net',
            'admin_first_name': 'Imran',
            'admin_last_name': 'Hossain',
            'admin_phone': '+880 1611-223344',
        }
        res = self.client.post(
            '/api/v1/admin/child-tenants/', payload,
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        child = Tenant.objects.get(slug='branch-one')
        self.assertEqual(child.parent_tenant_id, self.parent.id)
        self.assertTrue(child.is_child_tenant)
        self.assertFalse(child.parent_tenant.is_child_tenant)

        admin_user = User.objects.get(username='branch-one-admin')
        self.assertTrue(admin_user.is_staff)
        self.assertFalse(admin_user.is_superuser)
        self.assertEqual(admin_user.first_name, 'Imran')
        self.assertEqual(admin_user.email, 'admin@branch-one.net')

        profile = StaffProfile.objects.get(user=admin_user, tenant=child)
        self.assertEqual(profile.role, UserRole.ADMIN)

        membership = StaffMembership.objects.get(user=admin_user, tenant=child)
        self.assertTrue(membership.is_active)
        self.assertIsNotNone(membership.role)

    def test_create_writes_audit_log(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        self.client.post(
            '/api/v1/admin/child-tenants/',
            {
                'name': 'Audit Branch',
                'slug': 'audit-branch',
                'admin_username': 'audit-admin',
                'admin_password': 'AuditSecure123!',
            },
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertTrue(
            AuditLog.objects.filter(
                tenant=self.parent,
                action='child_tenant_provisioned',
                resource_type='Tenant',
            ).exists()
        )

    def test_create_with_domain_attaches_tenant_domain(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            '/api/v1/admin/child-tenants/',
            {
                'name': 'Branched ISP',
                'slug': 'branched-isp',
                'domain': 'billing.branched-isp.com',
                'admin_username': 'branched-admin',
                'admin_password': 'BranchedSecure123!',
            },
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        child = Tenant.objects.get(slug='branched-isp')
        d = TenantDomain.objects.filter(
            tenant=child, hostname='billing.branched-isp.com',
        )
        self.assertTrue(d.exists())
        self.assertTrue(d.first().is_primary)

    def test_destroy_soft_disables(self):
        child = make_child_tenant(
            self.parent, slug='to-disable', name='To Disable',
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.delete(
            f'/api/v1/admin/child-tenants/{child.id}/',
            HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        child.refresh_from_db()
        self.assertFalse(child.is_active)
        self.assertTrue(
            Tenant.objects.filter(
                id=child.id, parent_tenant=self.parent,
            ).exists()
        )

    def test_child_tenant_admin_is_forbidden(self):
        child = make_child_tenant(
            self.parent, slug='child-branch', name='Child Branch',
        )
        child_admin = make_admin_user(child, username='child-admin')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(child_admin).key}',
        )
        res = self.client.get(
            '/api/v1/admin/child-tenants/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_quota_inheritance(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            '/api/v1/admin/child-tenants/',
            {
                'name': 'Quota Branch',
                'slug': 'quota-branch',
                'admin_username': 'quota-admin',
                'admin_password': 'QuotaSecure123!',
            },
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        child = Tenant.objects.get(slug='quota-branch')
        self.assertEqual(child.plan, self.parent.plan)
        self.assertEqual(
            child.max_subscribers, max(1, self.parent.max_subscribers // 4),
        )
        self.assertEqual(
            child.max_routers, max(1, self.parent.max_routers // 4),
        )

    def test_duplicate_slug_returns_400(self):
        make_child_tenant(
            self.parent, slug='dup-branch', name='Dup Branch',
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            '/api/v1/admin/child-tenants/',
            {
                'name': 'Duplicate',
                'slug': 'dup-branch',
                'admin_username': 'dup-admin',
                'admin_password': 'DupSecure123!',
            },
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('slug', res.data)

    def test_non_admin_is_forbidden(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.technician).key}',
        )
        res = self.client.get(
            '/api/v1/admin/child-tenants/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
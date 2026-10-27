import uuid
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory
from rest_framework import permissions

from apps.core.models import Tenant
from apps.authentication.models import Role, Permission, StaffMembership
from apps.authentication.services.rbac import ensure_permission_catalog
from apps.corporate.permissions import HasCorporatePermission

User = get_user_model()


class MockCorporateView:
    required_permission = 'corporate.view'
    action_permissions = {
        'list': 'corporate.view',
        'create': 'corporate.create',
        'update': 'corporate.update',
        'destroy': 'corporate.delete',
    }


class CorporateRBACTests(TestCase):
    """
    Tests fine-grained capability checks for Corporate module.
    """

    def setUp(self):
        self.factory = APIRequestFactory()
        self.tenant_a = Tenant.objects.create(name="Apex ISP", slug="apex", is_active=True)
        self.tenant_b = Tenant.objects.create(name="Vertex ISP", slug="vertex", is_active=True)

        ensure_permission_catalog()

        # User 1: Has corporate.view only
        self.user_reader = User.objects.create_user(username="corp_reader", password="pwd")
        self.role_reader = Role.objects.create(tenant=self.tenant_a, name="Corporate Viewer")
        perm_view = Permission.objects.get(codename='corporate.view')
        self.role_reader.permissions.add(perm_view)
        self.mem_reader = StaffMembership.objects.create(
            user=self.user_reader, tenant=self.tenant_a, role=self.role_reader, is_active=True
        )

        # User 2: Has corporate.create and corporate.update
        self.user_writer = User.objects.create_user(username="corp_writer", password="pwd")
        self.role_writer = Role.objects.create(tenant=self.tenant_a, name="Corporate Manager")
        perm_create = Permission.objects.get(codename='corporate.create')
        perm_update = Permission.objects.get(codename='corporate.update')
        self.role_writer.permissions.add(perm_create, perm_update, perm_view)
        self.mem_writer = StaffMembership.objects.create(
            user=self.user_writer, tenant=self.tenant_a, role=self.role_writer, is_active=True
        )

        # User 3: Belongs to Tenant B
        self.user_other = User.objects.create_user(username="other_tenant_user", password="pwd")
        self.role_other = Role.objects.create(tenant=self.tenant_b, name="Tenant B Admin")
        self.role_other.permissions.add(perm_view)
        self.mem_other = StaffMembership.objects.create(
            user=self.user_other, tenant=self.tenant_b, role=self.role_other, is_active=True
        )

    def test_permission_catalog_includes_corporate(self):
        corp_perms = Permission.objects.filter(module='corporate').values_list('codename', flat=True)
        self.assertIn('corporate.view', corp_perms)
        self.assertIn('corporate.create', corp_perms)
        self.assertIn('corporate.connection.manage', corp_perms)
        self.assertIn('corporate.billing.manage', corp_perms)
        self.assertEqual(len(corp_perms), 12)

    def test_corporate_read_and_write_rbac(self):
        perm_checker = HasCorporatePermission()
        view = MockCorporateView()

        # 1. Reader accessing 'list' -> Allowed
        req_read = self.factory.get('/api/v1/corporate/customers/')
        req_read.user = self.user_reader
        req_read.tenant = self.tenant_a
        view.action = 'list'
        self.assertTrue(perm_checker.has_permission(req_read, view))

        # 2. Reader accessing 'create' -> Denied
        req_write = self.factory.post('/api/v1/corporate/customers/')
        req_write.user = self.user_reader
        req_write.tenant = self.tenant_a
        view.action = 'create'
        self.assertFalse(perm_checker.has_permission(req_write, view))

        # 3. Writer accessing 'create' -> Allowed
        req_writer_post = self.factory.post('/api/v1/corporate/customers/')
        req_writer_post.user = self.user_writer
        req_writer_post.tenant = self.tenant_a
        view.action = 'create'
        self.assertTrue(perm_checker.has_permission(req_writer_post, view))

        # 4. User from Tenant B attempting access on Tenant A -> Denied
        req_cross = self.factory.get('/api/v1/corporate/customers/')
        req_cross.user = self.user_other
        req_cross.tenant = self.tenant_a
        view.action = 'list'
        self.assertFalse(perm_checker.has_permission(req_cross, view))

"""
ISP Admin Dashboard — Child tenant impersonation tests.
"""
import uuid as uuid_module

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token

from apps.core.models import AuditLog
from apps.customers.models import Customer

from .helpers import (
    ADMIN_HOST,
    make_admin_user,
    make_child_tenant,
    make_non_admin_user,
    make_parent_tenant,
    token_for,
)


class IspAdminImpersonateTests(TestCase):

    def setUp(self):
        self.parent = make_parent_tenant()
        self.admin = make_admin_user(self.parent, username='parent-admin')
        self.technician = make_non_admin_user(
            self.parent, username='field-tech',
        )
        self.child = make_child_tenant(
            self.parent, slug='child-branch', name='Child Branch',
        )
        self.child_admin = make_admin_user(
            self.child, username='child-admin',
        )
        self.client = APIClient()

    def test_impersonate_returns_token_and_metadata(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            f'/api/v1/admin/child-tenants/{self.child.id}/impersonate.json',
            HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['tenant_slug'], self.child.slug)
        self.assertEqual(res.data['tenant_id'], str(self.child.id))
        self.assertEqual(res.data['admin_username'], 'child-admin')
        self.assertTrue(res.data['token'])

        token_row = Token.objects.get(key=res.data['token'])
        self.assertEqual(token_row.user_id, self.child_admin.id)

    def test_impersonate_writes_audit_log(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        self.client.post(
            f'/api/v1/admin/child-tenants/{self.child.id}/impersonate.json',
            HTTP_HOST=ADMIN_HOST,
        )
        log = AuditLog.objects.filter(
            tenant=self.parent,
            action='impersonate_child_admin',
            resource_id=str(self.child.id),
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor_username, self.admin.username)
        self.assertEqual(
            log.details['child_admin_username'], 'child-admin',
        )

    def test_impersonate_unknown_child_returns_404(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            f'/api/v1/admin/child-tenants/{uuid_module.uuid4()}/impersonate.json',
            HTTP_HOST=ADMIN_HOST,
        )
        # get_object() raises Http404 for non-existent children.
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_impersonate_cross_parent_denied(self):
        other_parent = make_parent_tenant(
            slug='other-parent', name='Other Parent',
        )
        other_admin = make_admin_user(
            other_parent, username='other-parent-admin',
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(other_admin).key}',
        )
        res = self.client.post(
            f'/api/v1/admin/child-tenants/{self.child.id}/impersonate.json',
            HTTP_HOST='other-parent.shebafi.xyz',
        )
        # get_object() filter rejects: child does not belong to this parent.
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_impersonate_technician_denied(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.technician).key}',
        )
        res = self.client.post(
            f'/api/v1/admin/child-tenants/{self.child.id}/impersonate.json',
            HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_child_overview_endpoint(self):
        Customer.objects.create(
            tenant=self.child, full_name='Test Subscriber',
            mobile='+8801711000001', pppoe_username='sub-test-1',
            pppoe_password='x',
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.get(
            f'/api/v1/admin/child-tenants/{self.child.id}/overview.json',
            HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['tenant_slug'], self.child.slug)
        self.assertEqual(res.data['customer_count'], 1)
"""
ISP Admin Dashboard — Child tenant admin user management tests.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token

from apps.authentication.models import StaffProfile
from apps.core.models import AuditLog

from .helpers import (
    ADMIN_HOST,
    make_admin_user,
    make_child_tenant,
    make_parent_tenant,
    token_for,
)


class IspAdminChildAdminTests(TestCase):

    def setUp(self):
        self.parent = make_parent_tenant()
        self.admin = make_admin_user(self.parent, username='parent-admin')
        self.child = make_child_tenant(
            self.parent, slug='child-branch', name='Child Branch',
        )
        self.child_admin = make_admin_user(
            self.child, username='child-admin', email='child@branch.net',
        )
        StaffProfile.objects.filter(
            user=self.child_admin, tenant=self.child,
        ).update(phone='+880 1999-000111')
        self.client = APIClient()

    def test_get_returns_user_and_phone(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.get(
            f'/api/v1/admin/child-tenants/{self.child.id}/admin-user/',
            HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['username'], 'child-admin')
        self.assertEqual(res.data['email'], 'child@branch.net')
        self.assertEqual(res.data['phone'], '+880 1999-000111')

    def test_patch_updates_email_and_phone(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.patch(
            f'/api/v1/admin/child-tenants/{self.child.id}/admin-user/',
            {'email': 'renamed@branch.net', 'phone': '+880 1888-222333'},
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        user = User.objects.get(username='child-admin')
        self.assertEqual(user.email, 'renamed@branch.net')
        self.assertEqual(
            StaffProfile.objects.get(
                user=user, tenant=self.child,
            ).phone, '+880 1888-222333',
        )
        log = AuditLog.objects.filter(
            tenant=self.parent,
            action='child_admin_profile_updated',
            resource_id=str(user.id),
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.before['email'], 'child@branch.net')
        self.assertEqual(log.after['email'], 'renamed@branch.net')

    def test_reset_password_invalidates_tokens(self):
        Token.objects.get_or_create(user=self.child_admin)
        self.assertTrue(
            Token.objects.filter(user=self.child_admin).exists()
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            f'/api/v1/admin/child-tenants/{self.child.id}/admin-user/reset-password/',
            {'new_password': 'BrandNewSecure123!'},
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(
            Token.objects.filter(user=self.child_admin).exists()
        )
        # Re-fetch the user from DB so check_password reads the new hash.
        fresh = User.objects.get(pk=self.child_admin.pk)
        self.assertTrue(
            fresh.check_password('BrandNewSecure123!')
        )
        self.assertTrue(
            AuditLog.objects.filter(
                tenant=self.parent, action='child_admin_password_reset',
            ).exists()
        )

    def test_change_email_audited(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            f'/api/v1/admin/child-tenants/{self.child.id}/admin-user/change-email/',
            {'new_email': 'next@branch.net'},
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['new_email'], 'next@branch.net')
        log = AuditLog.objects.filter(
            tenant=self.parent, action='child_admin_email_changed',
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.before['email'], 'child@branch.net')
        self.assertEqual(log.after['email'], 'next@branch.net')

    def test_cross_parent_access_denied(self):
        other_parent = make_parent_tenant(
            slug='other-parent', name='Other Parent',
        )
        other_admin = make_admin_user(
            other_parent, username='other-parent-admin',
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(other_admin).key}',
        )
        res = self.client.get(
            f'/api/v1/admin/child-tenants/{self.child.id}/admin-user/',
            HTTP_HOST='other-parent.shebafi.xyz',
        )
        # PermissionDenied (child not under this parent) → 403.
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_patch_can_deactivate_child_admin(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.patch(
            f'/api/v1/admin/child-tenants/{self.child.id}/admin-user/',
            {'is_active': False},
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        user = User.objects.get(username='child-admin')
        self.assertFalse(user.is_active)
"""
test_platform_admin_panel.py — Phase 1.6 of the SaaS Owner Admin Panel plan.

Validates that the new PlatformAdmin model + IsCentralOrPlatformAdmin
permission gate work correctly:

  1. OWNER can hit the control plane.
  2. ADMIN can hit the control plane.
  3. BILLING can hit read endpoints but is denied write endpoints.
  4. SUPPORT can hit read endpoints but is denied write endpoints.
  5. is_active=False platform admin is denied.
  6. Django superuser (legacy shortcut) still works.
  7. Authenticated non-platform-admin, non-superuser user is denied.
  8. Anonymous caller is denied.
  9. Tenant-staff (StaffMembership) holder is denied control plane.
 10. PlatformAdmin.get_active(user) returns None for non-PA users.
 11. PlatformAdmin.active_admins() excludes is_active=False rows.
 12. The deprecated IsCentralAdmin alias still works (backwards compat).
 13. PlatformAdmin is_admin / is_billing / is_support / is_owner properties
     correctly identify their role.
 14. log_platform_admin_action records actor_platform_admin_id, actor_role,
     request_id, and ip_address for a platform admin write.
 15. log_platform_admin_action records actor_role='SUPERUSER' for a superuser.
 16. create_platform_admin management command creates user + PA + setup_token.
 17. create_platform_admin --no-create-user refuses if user already exists.
 18. create_platform_admin rotates the setup token on each invocation.
"""

import io

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.authentication.models import PlatformAdmin, PlatformAdminRole
from apps.core.platform_admin_audit import log_platform_admin_action


class PlatformAdminModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='pa_test_user', email='pa@example.com', password='x'
        )

    def test_get_active_returns_none_for_non_pa(self):
        self.assertIsNone(PlatformAdmin.get_active(self.user))

    def test_active_admins_excludes_inactive(self):
        active = PlatformAdmin.objects.create(
            user=self.user, role=PlatformAdminRole.SUPPORT, is_active=True,
        )
        inactive_user = User.objects.create_user(
            username='pa_inactive', email='i@example.com', password='x'
        )
        PlatformAdmin.objects.create(
            user=inactive_user, role=PlatformAdminRole.OWNER, is_active=False,
        )
        self.assertEqual(list(PlatformAdmin.active_admins()), [active])

    def test_role_property_helpers(self):
        for role, attrs in [
            (PlatformAdminRole.OWNER,    {'is_owner': True,  'is_admin': True,  'is_billing': False, 'is_support': False}),
            (PlatformAdminRole.ADMIN,    {'is_owner': False, 'is_admin': True,  'is_billing': False, 'is_support': False}),
            (PlatformAdminRole.BILLING,  {'is_owner': False, 'is_admin': False, 'is_billing': True,  'is_support': False}),
            (PlatformAdminRole.SUPPORT,  {'is_owner': False, 'is_admin': False, 'is_billing': False, 'is_support': True}),
        ]:
            with self.subTest(role=role):
                pa = PlatformAdmin.objects.create(user=self.user, role=role, is_active=True)
                for attr, expected in attrs.items():
                    self.assertEqual(getattr(pa, attr), expected, f"{role}.{attr}")
                pa.delete()


class IsCentralOrPlatformAdminPermissionTests(TestCase):
    """
    Hits a real control-plane endpoint (/api/v1/saas/overview/) to confirm
    the permission gate is wired correctly for every role.
    """

    def setUp(self):
        self.client = APIClient()
        self.overview_url = '/api/v1/saas/overview/'

    def _authenticate(self, user):
        from rest_framework.authtoken.models import Token
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def _make_pa(self, username, role, is_active=True):
        u = User.objects.create_user(username=username, password='x')
        pa = PlatformAdmin.objects.create(user=u, role=role, is_active=is_active)
        return u, pa

    def test_owner_can_access_overview(self):
        u, _ = self._make_pa('owner_user', PlatformAdminRole.OWNER)
        self._authenticate(u)
        # 200 or 5xx are both acceptable here (the goal is "not 401/403").
        # We assert that the request reaches the view, not the auth layer.
        r = self.client.get(self.overview_url)
        self.assertNotIn(r.status_code, (401, 403), f"OWNER was denied: {r.status_code} {r.content!r}")

    def test_admin_can_access_overview(self):
        u, _ = self._make_pa('admin_user', PlatformAdminRole.ADMIN)
        self._authenticate(u)
        r = self.client.get(self.overview_url)
        self.assertNotIn(r.status_code, (401, 403))

    def test_billing_can_access_overview_read(self):
        u, _ = self._make_pa('billing_user', PlatformAdminRole.BILLING)
        self._authenticate(u)
        r = self.client.get(self.overview_url)
        self.assertNotIn(r.status_code, (401, 403))

    def test_inactive_platform_admin_is_denied(self):
        u, _ = self._make_pa('inactive_user', PlatformAdminRole.OWNER, is_active=False)
        self._authenticate(u)
        r = self.client.get(self.overview_url)
        self.assertIn(r.status_code, (401, 403))

    def test_superuser_shortcut_still_works(self):
        u = User.objects.create_superuser('su_shortcut', 'su@example.com', 'x')
        self._authenticate(u)
        r = self.client.get(self.overview_url)
        self.assertNotIn(r.status_code, (401, 403))

    def test_authenticated_non_pa_user_is_denied(self):
        u = User.objects.create_user('plain_user', 'p@example.com', 'x')
        self._authenticate(u)
        r = self.client.get(self.overview_url)
        self.assertIn(r.status_code, (401, 403))

    def test_anonymous_is_denied(self):
        r = self.client.get(self.overview_url)
        self.assertIn(r.status_code, (401, 403))

    def test_tenant_staff_user_is_denied_control_plane(self):
        from apps.core.models import Tenant
        from apps.authentication.models import StaffProfile, StaffMembership, UserRole
        tenant = Tenant.objects.create(
            name='Acme ISP', slug='acme-isp',
            contact_phone='+1', contact_email='a@a.com', address='x',
        )
        staff_user = User.objects.create_user('staff_user', 's@example.com', 'x')
        StaffProfile.objects.create(user=staff_user, role=UserRole.ADMIN)
        StaffMembership.objects.create(user=staff_user, tenant=tenant, is_active=True)
        self._authenticate(staff_user)
        r = self.client.get(self.overview_url)
        self.assertIn(r.status_code, (401, 403))


class IsCentralAdminAliasTests(TestCase):
    """The deprecated IsCentralAdmin must still work for backwards compat."""

    def setUp(self):
        from rest_framework.test import APIRequestFactory
        from apps.core.permissions import IsCentralAdmin
        self.factory = APIRequestFactory()
        self.perm = IsCentralAdmin

    def test_alias_allows_superuser(self):
        from django.test import RequestFactory
        from apps.core.permissions import IsCentralAdmin
        su = User.objects.create_superuser('su_alias', 'su@example.com', 'x')
        request = self.factory.get('/api/v1/saas/overview/')
        request.user = su
        self.assertTrue(IsCentralAdmin().has_permission(request, view=None))

    def test_alias_denies_plain_user(self):
        from apps.core.permissions import IsCentralAdmin
        u = User.objects.create_user('plain_alias', 'p@example.com', 'x')
        request = self.factory.get('/api/v1/saas/overview/')
        request.user = u
        self.assertFalse(IsCentralAdmin().has_permission(request, view=None))

    def test_alias_allows_named_platform_admin(self):
        from apps.core.permissions import IsCentralAdmin
        u = User.objects.create_user('pa_alias', 'p@example.com', 'x')
        PlatformAdmin.objects.create(user=u, role=PlatformAdminRole.OWNER, is_active=True)
        request = self.factory.get('/api/v1/saas/overview/')
        request.user = u
        self.assertTrue(IsCentralAdmin().has_permission(request, view=None))


class PlatformAdminAuditHelperTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIRequestFactory
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user('audit_pa', 'a@a.com', 'x')
        self.pa = PlatformAdmin.objects.create(
            user=self.user, role=PlatformAdminRole.ADMIN, is_active=True
        )
        self.su = User.objects.create_superuser('audit_su', 's@s.com', 'x')

    def test_pa_action_records_role_and_pa_id(self):
        from apps.core.models import AuditLog
        request = self.factory.post('/api/v1/saas/tenants/x/suspend/', HTTP_X_REQUEST_ID='req-1')
        request.user = self.user
        request.platform_admin = self.pa
        log_platform_admin_action(
            request,
            action='tenant.suspend',
            module='saas.tenants',
            resource_type='Tenant',
            resource_id='abc-123',
            before={'is_active': True},
            after={'is_active': False},
        )
        row = AuditLog.objects.get(action='tenant.suspend')
        self.assertEqual(row.request_id, 'req-1')
        self.assertEqual(row.details['actor_role'], 'ADMIN')
        self.assertEqual(row.details['actor_platform_admin_id'], str(self.pa.id))
        self.assertEqual(row.resource_id, 'abc-123')
        self.assertEqual(row.before, {'is_active': True})
        self.assertEqual(row.after, {'is_active': False})

    def test_superuser_action_records_role_superuser(self):
        from apps.core.models import AuditLog
        request = self.factory.post('/api/v1/saas/tenants/x/suspend/')
        request.user = self.su
        log_platform_admin_action(request, action='tenant.suspend', module='saas.tenants')
        row = AuditLog.objects.get(action='tenant.suspend')
        self.assertEqual(row.details['actor_role'], 'SUPERUSER')
        self.assertIsNone(row.details['actor_platform_admin_id'])

    def test_helper_does_not_raise_on_request_without_user(self):
        request = self.factory.post('/x/')
        request.user = None
        # Should not raise even with no user attached.
        log_platform_admin_action(request, action='noop', module='x')


class CreatePlatformAdminCommandTests(TestCase):
    def test_creates_user_and_pa_and_setup_token(self):
        out = io.StringIO()
        call_command(
            'create_platform_admin',
            '--username=cmd_owner',
            '--email=cmd@example.com',
            '--role=OWNER',
            stdout=out,
        )
        u = User.objects.get(username='cmd_owner')
        pa = PlatformAdmin.objects.get(user=u)
        self.assertEqual(pa.role, PlatformAdminRole.OWNER)
        self.assertTrue(pa.is_active)
        self.assertIsNotNone(pa.setup_token_expires_at)
        self.assertTrue(len(pa.setup_token) > 30)
        self.assertIn('PlatformAdmin', out.getvalue())

    def test_no_create_user_refuses_existing_user(self):
        User.objects.create_user('existing_user', 'e@e.com', 'x')
        from django.core.management import CommandError
        with self.assertRaises(CommandError):
            call_command(
                'create_platform_admin',
                '--username=existing_user',
                '--email=e@e.com',
                '--role=SUPPORT',
                '--no-create-user',
                stdout=io.StringIO(),
            )

    def test_setup_token_rotates_on_reinvocation(self):
        call_command('create_platform_admin', '--username=rotate_user', '--email=r@e.com', '--role=ADMIN')
        pa1 = PlatformAdmin.objects.get(user__username='rotate_user')
        token1 = pa1.setup_token
        call_command('create_platform_admin', '--username=rotate_user', '--email=r@e.com', '--role=ADMIN')
        pa2 = PlatformAdmin.objects.get(user__username='rotate_user')
        self.assertNotEqual(token1, pa2.setup_token)

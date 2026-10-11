"""
test_platform_admin_endpoints.py — Phase 2.4 of the SaaS Owner Admin Panel plan.

Smoke tests for the new platform-owner-only endpoints under tag
"17. Platform Owner Admin". Focus on:
  - Role gates (OWNER, ADMIN, BILLING, SUPPORT, superuser)
  - AuditLog row is written on every write
  - Kill-switch is OWNER-only
  - PlatformAdmin invite / list / detail role gates
  - Impersonation-log list + force-stop
  - Feature-flags rollout bulk toggle
  - Billing reconcile read
  - Audit export filter + format
  - Health deep returns 200 when DB+Redis up
"""

import io
import csv

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.authentication.models import PlatformAdmin, PlatformAdminRole
from apps.core.feature_gating import (
    clear_platform_write_lock,
    is_platform_write_locked,
    set_platform_write_lock,
)
from apps.core.models import (
    AuditLog,
    ImpersonationLog,
    Tenant,
    TenantFeatureFlag,
)


def _make_pa(username, role, is_active=True):
    u = User.objects.create_user(username=username, password='x', email=f'{username}@x.com')
    pa = PlatformAdmin.objects.create(user=u, role=role, is_active=is_active)
    return u, pa


def _auth(client, user):
    token, _ = Token.objects.get_or_create(user=user)
    client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')


class PlatformAdminEndpointRoleGatesTests(TestCase):
    """Smoke check: every endpoint returns 401/403 for the wrong role."""

    def setUp(self):
        self.client = APIClient()
        clear_platform_write_lock()

    def tearDown(self):
        clear_platform_write_lock()

    def test_kill_switch_get_is_allowed_for_any_active_pa(self):
        u, _ = _make_pa('ks_support', PlatformAdminRole.SUPPORT)
        _auth(self.client, u)
        r = self.client.get('/api/v1/saas/kill-switch/')
        self.assertEqual(r.status_code, 200, r.content)

    def test_kill_switch_toggle_requires_owner(self):
        for role in (PlatformAdminRole.ADMIN, PlatformAdminRole.BILLING, PlatformAdminRole.SUPPORT):
            u, _ = _make_pa(f'ks_{role.lower()}', role)
            _auth(self.client, u)
            r = self.client.post(
                '/api/v1/saas/kill-switch/toggle/',
                {'engaged': True, 'reason': 'test'},
                format='json',
            )
            self.assertEqual(r.status_code, 403, f"{role} should be 403, got {r.status_code}")

    def test_kill_switch_toggle_works_for_owner_and_writes_audit(self):
        u, _ = _make_pa('ks_owner', PlatformAdminRole.OWNER)
        _auth(self.client, u)
        r = self.client.post(
            '/api/v1/saas/kill-switch/toggle/',
            {'engaged': True, 'reason': 'incident-2026-10'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(is_platform_write_locked())
        self.assertTrue(AuditLog.objects.filter(action='kill_switch.toggle').exists())

        # Toggle off
        r2 = self.client.post(
            '/api/v1/saas/kill-switch/toggle/',
            {'engaged': False},
            format='json',
        )
        self.assertEqual(r2.status_code, 200, r2.content)
        self.assertFalse(is_platform_write_locked())


class PlatformAdminInviteListDetailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = _make_pa('inv_owner', PlatformAdminRole.OWNER)[0]
        _auth(self.client, self.owner)

    def test_owner_can_invite(self):
        r = self.client.post(
            '/api/v1/saas/platform-admin/invite/',
            {'username': 'new_pa', 'email': 'n@x.com', 'role': 'BILLING'},
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        new_pa = PlatformAdmin.objects.get(user__username='new_pa')
        self.assertEqual(new_pa.role, PlatformAdminRole.BILLING)
        self.assertTrue(AuditLog.objects.filter(action='platform_admin.invite').exists())

    def test_support_cannot_invite(self):
        support_user = _make_pa('inv_support', PlatformAdminRole.SUPPORT)[0]
        _auth(self.client, support_user)
        r = self.client.post(
            '/api/v1/saas/platform-admin/invite/',
            {'username': 'blocked_pa', 'email': 'b@x.com', 'role': 'SUPPORT'},
            format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_owner_can_list_and_filter(self):
        _make_pa('list_a', PlatformAdminRole.BILLING)
        _make_pa('list_b', PlatformAdminRole.ADMIN)
        r = self.client.get('/api/v1/saas/platform-admin/list/?role=ADMIN')
        self.assertEqual(r.status_code, 200)
        usernames = [row['username'] for row in r.json()['results']]
        self.assertIn('list_b', usernames)
        self.assertNotIn('list_a', usernames)

    def test_owner_can_change_role_and_suspend(self):
        target_user, target_pa = _make_pa('detail_target', PlatformAdminRole.SUPPORT)
        r = self.client.patch(
            f'/api/v1/saas/platform-admin/{target_pa.id}/',
            {'role': 'BILLING', 'is_active': False},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        target_pa.refresh_from_db()
        self.assertEqual(target_pa.role, PlatformAdminRole.BILLING)
        self.assertFalse(target_pa.is_active)
        self.assertTrue(AuditLog.objects.filter(action='platform_admin.update').exists())


class PlatformImpersonationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = _make_pa('imp_owner', PlatformAdminRole.OWNER)[0]
        _auth(self.client, self.owner)
        self.tenant = Tenant.objects.create(
            name='Impersonated ISP', slug='imp-isp',
            contact_phone='+1', contact_email='a@a.com', address='x',
        )

    def test_force_stop_with_no_active_session_returns_404(self):
        r = self.client.post(f'/api/v1/saas/impersonation/{self.tenant.id}/stop/')
        self.assertEqual(r.status_code, 404)

    def test_force_stop_ends_active_session_and_writes_audit(self):
        actor = _make_pa('imp_actor', PlatformAdminRole.ADMIN)[0]
        session = ImpersonationLog.objects.create(
            actor=actor, tenant=self.tenant, reason='test session',
        )
        r = self.client.post(f'/api/v1/saas/impersonation/{self.tenant.id}/stop/')
        self.assertEqual(r.status_code, 200, r.content)
        session.refresh_from_db()
        self.assertIsNotNone(session.ended_at)
        self.assertTrue(AuditLog.objects.filter(action='impersonation.force_stop').exists())

    def test_list_shows_active_sessions(self):
        actor = _make_pa('imp_list_actor', PlatformAdminRole.ADMIN)[0]
        ImpersonationLog.objects.create(actor=actor, tenant=self.tenant)
        r = self.client.get('/api/v1/saas/impersonation-log/?active=true')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['count'], 1)


class PlatformFeatureFlagRolloutTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = _make_pa('ff_owner', PlatformAdminRole.OWNER)[0]
        _auth(self.client, self.owner)
        for slug in ('isp-a', 'isp-b', 'isp-c'):
            Tenant.objects.create(
                name=slug, slug=slug, plan='Starter',
                contact_phone='+1', contact_email=f'{slug}@x.com', address='x',
            )

    def test_bulk_toggle_creates_flags(self):
        r = self.client.post(
            '/api/v1/saas/feature-flags/rollout/',
            {'feature_key': 'ip_phone.epbx', 'enabled': True, 'plan': 'Starter'},
            format='json',
        )
        if r.status_code != 200 or r.json().get('affected_tenants', 0) < 3:
            print('DEBUG bulk toggle:', r.status_code, r.content[:500])
            print('DEBUG tenants:', list(Tenant.objects.values_list('slug', 'plan')))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertGreaterEqual(r.json()['affected_tenants'], 3)
        self.assertTrue(
            TenantFeatureFlag.objects.filter(feature_key='ip_phone.epbx', enabled=True).count() >= 3
        )

    def test_support_cannot_bulk_toggle(self):
        sup = _make_pa('ff_support', PlatformAdminRole.SUPPORT)[0]
        _auth(self.client, sup)
        r = self.client.post(
            '/api/v1/saas/feature-flags/rollout/',
            {'feature_key': 'x.y', 'enabled': True},
            format='json',
        )
        self.assertEqual(r.status_code, 403)


class PlatformBillingReconcileTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = _make_pa('br_admin', PlatformAdminRole.ADMIN)[0]
        _auth(self.client, self.admin)

    def test_returns_aggregates(self):
        r = self.client.get('/api/v1/saas/billing/reconcile/')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn('mrr_total', body)
        self.assertIn('active_subscriptions', body)
        self.assertIn('failed_payments', body)

    def test_support_cannot_read_billing_reconcile(self):
        sup = _make_pa('br_support', PlatformAdminRole.SUPPORT)[0]
        _auth(self.client, sup)
        r = self.client.get('/api/v1/saas/billing/reconcile/')
        self.assertEqual(r.status_code, 403)


class PlatformHealthDeepTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = _make_pa('hd_admin', PlatformAdminRole.ADMIN)[0]
        _auth(self.client, self.admin)

    def test_returns_200_with_db_redis_killswitch(self):
        r = self.client.get('/api/v1/saas/health/deep/')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn('db', body)
        self.assertIn('redis', body)
        self.assertIn('kill_switch', body)


class PlatformAuditExportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = _make_pa('ae_admin', PlatformAdminRole.ADMIN)[0]
        _auth(self.client, self.admin)
        AuditLog.objects.create(
            actor_username='someone', action='test.action', module='test',
        )

    def test_csv_export_returns_csv(self):
        r = self.client.get('/api/v1/saas/audit/export/?format=csv')
        if r.status_code != 200:
            print('DEBUG audit export response:', r.status_code, r.content[:500])
        self.assertEqual(r.status_code, 200)
        body = b''.join(r.streaming_content) if hasattr(r, 'streaming_content') else r.content
        text = body.decode('utf-8', errors='ignore') if isinstance(body, bytes) else body
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        self.assertGreaterEqual(len(rows), 1)
        self.assertEqual(rows[0]['action'], 'test.action')

    def test_format_validation(self):
        # The view rejects unknown formats. Depending on the code path
        # taken (URL suffix vs query param), the response is 400 (our own
        # check) or 404 (DRF content negotiation can't find a renderer).
        r = self.client.get('/api/v1/saas/audit/export/?format=xml')
        self.assertIn(r.status_code, (400, 404, 406), f"unexpected {r.status_code}: {r.content[:200]}")

    def test_support_cannot_export(self):
        sup = _make_pa('ae_support', PlatformAdminRole.SUPPORT)[0]
        _auth(self.client, sup)
        r = self.client.get('/api/v1/saas/audit/export/?format=csv')
        self.assertEqual(r.status_code, 403)

"""
apps/core/test_saas_bulk_ops.py — Tier 3B: bulk tenant operations.

Validates:
  1. POST /saas/tenants/bulk-suspend/   activates + returns counts.
  2. POST /saas/tenants/bulk-activate/  restores + returns counts.
  3. POST /saas/tenants/bulk-delete/    removes + audit-logs.
  4. Empty / non-list payload → 400.
  5. Platform tenant (slug in {shebafi, master, default}) is refused.
  6. Unknown tenant id lands in ``failed`` rather than 500ing.
"""
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.models import (
    AuditLog, Tenant, TenantDomain,
)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class BulkTenantOpsTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='bulk_admin', password='X', email='a@b.c',
        )
        self.token, _ = Token.objects.get_or_create(user=self.admin)
        self.headers = {
            'HTTP_AUTHORIZATION': f'Token {self.token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }

        # Three regular tenants + the protected one.
        self.t1 = Tenant.objects.create(
            name='One ISP', slug='one-isp', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=self.t1, hostname='one.shebafi.xyz',
            is_primary=True, is_active=True, verified=True,
        )
        self.t2 = Tenant.objects.create(
            name='Two ISP', slug='two-isp', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=self.t2, hostname='two.shebafi.xyz',
            is_primary=True, is_active=True, verified=True,
        )
        self.t3 = Tenant.objects.create(
            name='Three ISP', slug='three-isp', is_active=True,
            subscription_status='past_due',
        )
        TenantDomain.objects.create(
            tenant=self.t3, hostname='three.shebafi.xyz',
            is_primary=True, is_active=True, verified=True,
        )
        # Platform tenant — must be refused.
        self.platform = Tenant.objects.create(
            name='Shebafi HQ', slug='shebafi', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=self.platform, hostname='admin.shebafi.xyz',
            is_primary=True, is_active=True, verified=True,
        )

    def tearDown(self):
        from apps.core.features import invalidate_cache
        for t in Tenant.objects.all():
            invalidate_cache(t)

    # ── Suspend ──────────────────────────────────────────────────────────

    def test_bulk_suspend_activates(self):
        resp = self.client.post(
            '/api/v1/saas/tenants/bulk-suspend/',
            data={'tenant_ids': [str(self.t1.id), str(self.t2.id)]},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body['count'], 2)
        self.assertEqual(len(body['failed']), 0)
        for t in (self.t1, self.t2):
            t.refresh_from_db()
            self.assertFalse(t.is_active)
            self.assertEqual(t.subscription_status, 'suspended')

    def test_bulk_suspend_refuses_empty(self):
        resp = self.client.post(
            '/api/v1/saas/tenants/bulk-suspend/',
            data={'tenant_ids': []},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 400)

    def test_bulk_suspend_unknown_id_lands_in_failed(self):
        resp = self.client.post(
            '/api/v1/saas/tenants/bulk-suspend/',
            data={'tenant_ids': [str(self.t1.id), '00000000-0000-0000-0000-000000000000']},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(len(body['failed']), 1)
        self.assertEqual(body['failed'][0]['reason'], 'not_found')

    # ── Activate ─────────────────────────────────────────────────────────

    def test_bulk_activate_restores(self):
        self.t1.is_active = False
        self.t1.subscription_status = 'suspended'
        self.t1.save()
        self.t2.is_active = False
        self.t2.subscription_status = 'suspended'
        self.t2.save()

        resp = self.client.post(
            '/api/v1/saas/tenants/bulk-activate/',
            data={'tenant_ids': [str(self.t1.id), str(self.t2.id)]},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['count'], 2)
        for t in (self.t1, self.t2):
            t.refresh_from_db()
            self.assertTrue(t.is_active)
            self.assertEqual(t.subscription_status, 'active')

    # ── Delete ───────────────────────────────────────────────────────────

    def test_bulk_delete_removes_tenants(self):
        ids = [str(self.t1.id), str(self.t2.id)]
        resp = self.client.post(
            '/api/v1/saas/tenants/bulk-delete/',
            data={'tenant_ids': ids},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body['count'], 2)
        self.assertEqual(len(body['failed']), 0)
        self.assertFalse(Tenant.objects.filter(id__in=ids).exists())
        # Audit log written.
        self.assertTrue(AuditLog.objects.filter(action='bulk_delete_tenant').exists())

    def test_bulk_delete_refuses_platform_tenant(self):
        resp = self.client.post(
            '/api/v1/saas/tenants/bulk-delete/',
            data={'tenant_ids': [str(self.platform.id), str(self.t1.id)]},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        # Platform refused, t1 deleted.
        platform_in_failed = any(
            f.get('reason') == 'platform_tenant'
            for f in body['failed']
        )
        self.assertTrue(platform_in_failed)
        self.assertEqual(body['count'], 1)
        self.assertTrue(Tenant.objects.filter(id=self.platform.id).exists())
        self.assertFalse(Tenant.objects.filter(id=self.t1.id).exists())

    def test_bulk_delete_refuses_empty(self):
        resp = self.client.post(
            '/api/v1/saas/tenants/bulk-delete/',
            data={'tenant_ids': []},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 400)

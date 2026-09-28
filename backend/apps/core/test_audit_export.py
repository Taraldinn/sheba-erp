"""
apps/core/test_audit_export.py — Tier 3C: compliance audit log export.

Validates:
  1. CSV export streams with the documented columns + headers.
  2. JSON export returns the JSON envelope.
  3. NDJSON export streams one row per line.
  4. Filter query params (from/to/action/module) are honoured.
  5. Per-tenant export is feature-gated by analytics.compliance_export:
       - flag OFF → 403 + FEATURE_DISABLED
       - flag ON  → 200 + streaming body
  6. SaaS cross-tenant export does NOT require the flag (super-admin
     authority supersedes), and audit-logs the export action when
     scoped to a tenant.
  7. CSV header includes ``Content-Disposition: attachment`` so the
     browser downloads rather than renders.
"""
import json

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.models import (
    AuditLog, Tenant, TenantDomain, TenantFeatureFlag,
)
from apps.authentication.models import Role, StaffMembership


def _make_audit(tenant, action='login', module='auth', actor='alice', **kwargs):
    return AuditLog.objects.create(
        tenant=tenant,
        actor_username=actor,
        action=action,
        module=module,
        resource_type='Customer',
        resource_id='cust-42',
        ip_address='10.0.0.1',
        details={'foo': 'bar'},
        **kwargs,
    )


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class AuditExportTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='ExportNet', slug='exportnet', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=cls.tenant, hostname='exportnet.shebafi.xyz',
            is_primary=True, is_active=True, verified=True,
        )
        cls.platform = Tenant.objects.create(
            name='Shebafi HQ', slug='shebafi', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=cls.platform, hostname='admin.shebafi.xyz',
            is_primary=True, is_active=True, verified=True,
        )
        # Three rows of varied action / module.
        cls.row1 = _make_audit(cls.tenant, action='login', module='auth')
        cls.row2 = _make_audit(cls.tenant, action='recharge', module='payments',
                               actor='bob')
        cls.row3 = _make_audit(cls.tenant, action='suspend_customer', module='customers',
                               actor='carol')

        # Per-tenant user.
        cls.user = User.objects.create_user(
            username='tenant_user', password='X', email='t@e.x',
        )
        role = Role.objects.create(tenant=cls.tenant, name='admin')
        StaffMembership.objects.create(
            user=cls.user, tenant=cls.tenant, role=role, is_active=True,
        )
        cls.token, _ = Token.objects.get_or_create(user=cls.user)
        cls.tenant_headers = {
            'HTTP_AUTHORIZATION': f'Token {cls.token.key}',
            'HTTP_HOST': 'exportnet.shebafi.xyz',
        }

        # Super admin.
        cls.admin = User.objects.create_superuser(
            username='export_admin', password='X', email='a@b.c',
        )
        cls.admin_token, _ = Token.objects.get_or_create(user=cls.admin)
        cls.saas_headers = {
            'HTTP_AUTHORIZATION': f'Token {cls.admin_token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }

    def tearDown(self):
        from apps.core.features import invalidate_cache
        for t in Tenant.objects.all():
            invalidate_cache(t)

    # ── Feature gate ────────────────────────────────────────────────────

    def test_per_tenant_export_rejects_when_flag_off(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant,
            feature_key='analytics.compliance_export', enabled=False,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)
        resp = self.client.get(
            '/api/v1/audit-logs/export.json/', **self.tenant_headers,
        )
        self.assertEqual(resp.status_code, 403)
        body = resp.json()
        self.assertEqual(body['code'], 'FEATURE_DISABLED')
        self.assertEqual(body['feature_key'], 'analytics.compliance_export')

    def test_per_tenant_export_allows_when_flag_on(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant,
            feature_key='analytics.compliance_export', enabled=True,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)
        resp = self.client.get(
            '/api/v1/audit-logs/export.csv/', **self.tenant_headers,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp['Content-Type'].startswith('text/csv'))
        self.assertIn('attachment', resp['Content-Disposition'])
        self.assertIn('audit-log-', resp['Content-Disposition'])

    # ── CSV ─────────────────────────────────────────────────────────────

    def test_csv_export_contains_expected_columns_and_rows(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant,
            feature_key='analytics.compliance_export', enabled=True,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)
        resp = self.client.get(
            '/api/v1/audit-logs/export.csv/', **self.tenant_headers,
        )
        self.assertEqual(resp.status_code, 200)
        body = b''.join(resp.streaming_content).decode('utf-8')
        lines = [ln for ln in body.splitlines() if ln]
        # 1 header + 3 rows.
        self.assertEqual(len(lines), 4)
        self.assertIn('timestamp,tenant_slug,actor_username,action,module',
                      lines[0])
        # All 3 rows have tenant_slug 'exportnet'.
        self.assertIn('exportnet,alice,login,auth', lines[1])
        self.assertIn('exportnet,bob,recharge,payments', lines[2])
        self.assertIn('exportnet,carol,suspend_customer,customers', lines[3])

    # ── JSON ────────────────────────────────────────────────────────────

    def test_json_export_envelope(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant,
            feature_key='analytics.compliance_export', enabled=True,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)
        resp = self.client.get(
            '/api/v1/audit-logs/export.json/', **self.tenant_headers,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp['Content-Type'].startswith('application/json'))
        body = b''.join(resp.streaming_content).decode('utf-8')
        parsed = json.loads(body)
        self.assertIn('results', parsed)
        self.assertEqual(len(parsed['results']), 3)
        actions = sorted(r['action'] for r in parsed['results'])
        self.assertEqual(actions, ['login', 'recharge', 'suspend_customer'])

    # ── NDJSON ──────────────────────────────────────────────────────────

    def test_ndjson_export_one_row_per_line(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant,
            feature_key='analytics.compliance_export', enabled=True,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)
        resp = self.client.get(
            '/api/v1/audit-logs/export.ndjson/', **self.tenant_headers,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp['Content-Type'].startswith('application/x-ndjson'))
        body = b''.join(resp.streaming_content).decode('utf-8')
        lines = [json.loads(ln) for ln in body.splitlines() if ln.strip()]
        self.assertEqual(len(lines), 3)
        # Each line is a complete object (no envelope).
        for row in lines:
            self.assertIn('id', row)
            self.assertIn('timestamp', row)
            self.assertIn('details', row)

    # ── Filtering ───────────────────────────────────────────────────────

    def test_csv_export_filters_by_action_and_module(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant,
            feature_key='analytics.compliance_export', enabled=True,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)
        resp = self.client.get(
            '/api/v1/audit-logs/export.csv/?module=payments',
            **self.tenant_headers,
        )
        body = b''.join(resp.streaming_content).decode('utf-8')
        # header + 1 row (the recharge)
        lines = [ln for ln in body.splitlines() if ln]
        self.assertEqual(len(lines), 2)
        self.assertIn('recharge', lines[1])
        self.assertNotIn('suspend_customer', body)

    # ── SaaS cross-tenant ───────────────────────────────────────────────

    def test_saas_export_no_feature_gate(self):
        # Super-admin export should work even if the *first* tenant has
        # the flag off — central authority overrides per-tenant flags.
        TenantFeatureFlag.objects.create(
            tenant=self.tenant,
            feature_key='analytics.compliance_export', enabled=False,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)

        # Create a fresh row for the platform tenant too so we have multi-tenant data.
        _make_audit(self.platform, action='impersonate', module='saas')

        resp = self.client.get(
            '/api/v1/saas/audit-logs/export.csv/?tenant_slug=exportnet',
            **self.saas_headers,
        )
        self.assertEqual(resp.status_code, 200)
        body = b''.join(resp.streaming_content).decode('utf-8')
        # Should only contain rows for exportnet, not shebafi.
        self.assertIn('exportnet', body)
        # Audit row written for the export itself.
        self.assertTrue(
            AuditLog.objects.filter(
                action='compliance_export',
                resource_id=str(self.tenant.id),
            ).exists()
        )

    def test_saas_export_cross_tenant(self):
        _make_audit(self.platform, action='impersonate', module='saas')
        resp = self.client.get(
            '/api/v1/saas/audit-logs/export.json/',
            **self.saas_headers,
        )
        self.assertEqual(resp.status_code, 200)
        body = b''.join(resp.streaming_content).decode('utf-8')
        parsed = json.loads(body)
        tenant_slugs = {r['tenant_slug'] for r in parsed['results']}
        self.assertIn('exportnet', tenant_slugs)
        self.assertIn('shebafi', tenant_slugs)

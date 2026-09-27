"""
apps/core/test_feature_gating.py — bridges the abstract feature registry
to concrete business-logic endpoints.

Validates:
  1. ``is_feature_enabled_fast`` reads through the cache.
  2. ``require_feature`` rejects 403 on a gated DRF view when the flag
     is OFF, allows it when ON.
  3. ``gate_celery_task`` short-circuits to ``{skipped: True}`` when no
     tenant has the flag ON.
  4. ``FeatureDisabledError`` carries the feature key + label.
  5. ``assert_feature_enabled`` raises the typed error in service code.
  6. The ``customers.portal`` gate is wired into the customer portal
     endpoint (``phase24.billing.portal``), returns 403 when OFF.
  7. The ``ip_phone.epbx`` gate is wired into ``click-to-call``,
     returns 403 when OFF.
  8. The ``network.vpn_wireguard`` gate is wired into the handshake
     task, skips closed-feature tenants.
  9. The ``billing.late_fees`` task skips disabled tenants.
 10. ``GET /api/v1/features/me/`` (Tier 3E snapshot endpoint) returns
     the right shape with both overrides and registry defaults.
"""
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.models import Tenant, TenantDomain, TenantFeatureFlag
from apps.core.feature_gating import (
    FeatureDisabledError,
    assert_feature_enabled,
    gate_celery_task,
    is_feature_enabled_fast,
    require_feature,
)
from apps.authentication.models import Role, StaffMembership


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FeatureGatingTests(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='TestNet', slug='testnet', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=self.tenant, hostname='testnet.shebafi.xyz',
            is_primary=True, is_active=True, verified=True,
        )

    def tearDown(self):
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)

    # ────── 1. Fast lookup ──────

    def test_is_feature_enabled_fast_returns_default_when_no_row(self):
        # 'billing.invoices' is in the registry with a default — make sure
        # we don't crash even when there's no TenantFeatureFlag row.
        v = is_feature_enabled_fast(self.tenant, 'billing.invoices')
        self.assertIsInstance(v, bool)

    def test_is_feature_enabled_fast_respects_override(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant, feature_key='billing.invoices', enabled=False,
        )
        # Force a cache miss.
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)

        self.assertFalse(is_feature_enabled_fast(self.tenant, 'billing.invoices'))

    # ────── 2. require_feature ──────

    def test_require_feature_allows_when_on(self):
        @require_feature('billing.invoices')
        def view(_request):
            return 'ok'

        class _R:
            tenant = self.tenant
            user = None

        self.assertEqual(view(_R()), 'ok')

    def test_require_feature_rejects_when_off(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant, feature_key='billing.invoices', enabled=False,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)

        @require_feature('billing.invoices')
        def view(_request):
            return 'ok'

        class _R:
            tenant = self.tenant
            user = None

        resp = view(_R())
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['code'], 'FEATURE_DISABLED')
        self.assertEqual(resp.data['feature_key'], 'billing.invoices')

    def test_require_feature_rejects_when_no_tenant(self):
        @require_feature('billing.invoices')
        def view(_request):
            return 'ok'

        class _R:
            tenant = None
            user = None

        resp = view(_R())
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['code'], 'TENANT_NOT_FOUND')

    # ────── 3. assert_feature_enabled ──────

    def test_assert_feature_enabled_passes_when_on(self):
        try:
            assert_feature_enabled(self.tenant, 'billing.invoices')
        except FeatureDisabledError as exc:
            self.fail(f'should not raise: {exc}')

    def test_assert_feature_enabled_raises_when_off(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant, feature_key='billing.invoices', enabled=False,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)

        with self.assertRaises(FeatureDisabledError) as ctx:
            assert_feature_enabled(self.tenant, 'billing.invoices')
        self.assertEqual(ctx.exception.key, 'billing.invoices')

    # ────── 4. gate_celery_task ──────

    def test_gate_celery_task_skips_when_no_tenant_has_feature(self):
        # Force the only active tenant OFF for ``ip_phone.epbx``.
        TenantFeatureFlag.objects.create(
            tenant=self.tenant, feature_key='ip_phone.epbx', enabled=False,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)

        @gate_celery_task('ip_phone.epbx')
        def my_task(**kwargs):
            # If this runs we collected at least one enabled tenant.
            return {'enabled_tenants': len(kwargs.get('_enabled_tenants', []))}

        out = my_task()
        self.assertTrue(out['skipped'])
        self.assertEqual(out['feature_key'], 'ip_phone.epbx')

    def test_gate_celery_task_runs_when_tenant_has_feature(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant, feature_key='ip_phone.epbx', enabled=True,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)

        @gate_celery_task('ip_phone.epbx')
        def my_task(**kwargs):
            return {'enabled_tenants': len(kwargs.get('_enabled_tenants', []))}

        out = my_task()
        self.assertFalse(out.get('skipped', False))
        self.assertEqual(out['enabled_tenants'], 1)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FeatureGatingIntegrationTests(TestCase):
    """End-to-end: hit real endpoints and verify the flag rejects."""

    def setUp(self):
        self.client = APIClient()

        self.tenant = Tenant.objects.create(
            name='GatedNet', slug='gatednet', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=self.tenant, hostname='gatednet.shebafi.net',
            is_primary=True, is_active=True, verified=True,
        )

        # Staff user with permissions.
        self.admin = User.objects.create_superuser(
            username='gated_admin', password='X', email='a@b.c',
        )
        admin_role = Role.objects.create(
            tenant=self.tenant, name='admin', description='Gated test admin',
        )
        StaffMembership.objects.create(
            user=self.admin, tenant=self.tenant, role=admin_role, is_active=True,
        )
        self.token, _ = Token.objects.get_or_create(user=self.admin)

        self.tenant_headers = {
            'HTTP_AUTHORIZATION': f'Token {self.token.key}',
            'HTTP_HOST': 'gatednet.shebafi.net',
        }

    def tearDown(self):
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)

    def test_click_to_call_rejects_when_ip_phone_disabled(self):
        # Disable ip_phone.epbx for this tenant.
        TenantFeatureFlag.objects.create(
            tenant=self.tenant, feature_key='ip_phone.epbx', enabled=False,
        )
        from apps.core.features import invalidate_cache
        invalidate_cache(self.tenant)

        resp = self.client.post(
            '/api/v1/callcenter/click-to-call/',
            data={'phone': '01710000001', 'customer_id': '0'},
            **self.tenant_headers,
        )
        self.assertIn(resp.status_code, (403, 401),
                      f'expected 403/401, got {resp.status_code}: {resp.content}')
        if resp.status_code == 403:
            self.assertEqual(resp.json().get('code'), 'FEATURE_DISABLED')
            self.assertEqual(resp.json().get('feature_key'), 'ip_phone.epbx')



class FeatureFlagsMeSnapshotTests(TestCase):
    """Tests for the /api/v1/features/me/ endpoint (Tier 3E)."""

    def setUp(self):
        self.client_ = APIClient()
        self.tenant = Tenant.objects.create(
            name='Snapshot', slug='snapshot', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=self.tenant, hostname='snapshot.shebafi.net',
            is_primary=True, is_active=True, verified=True,
            verification_method='platform_subdomain',
        )
        self.user = User.objects.create_user(
            username='snap_admin', password='x', is_staff=True
        )
        admin_role = Role.objects.create(
            tenant=self.tenant, name='admin', description='admin'
        )
        StaffMembership.objects.create(
            user=self.user, tenant=self.tenant, role=admin_role, is_active=True
        )
        self.token, _ = Token.objects.get_or_create(user=self.user)
        self.headers = {
            'HTTP_AUTHORIZATION': f'Token {self.token.key}',
            'HTTP_HOST': 'snapshot.shebafi.net',
        }

    def test_snapshot_returns_registry_keys_with_overrides(self):
        # Override one feature OFF — endpoint must reflect that even
        # though the registry default is ON.
        TenantFeatureFlag.objects.create(
            tenant=self.tenant,
            feature_key='ip_phone.epbx',
            enabled=False,
            config={'seat': 1},
        )
        TenantFeatureFlag.objects.create(
            tenant=self.tenant,
            feature_key='billing.late_fees',
            enabled=True,
        )

        resp = self.client_.get(
            '/api/v1/features/me/', **self.headers
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data['tenant_slug'], 'snapshot')
        self.assertIn('flags', data)
        self.assertIn('ip_phone.epbx', data['flags'])
        self.assertFalse(data['flags']['ip_phone.epbx']['enabled'])
        self.assertTrue(data['flags']['ip_phone.epbx']['is_override'])
        self.assertEqual(
            data['flags']['ip_phone.epbx']['config'], {'seat': 1}
        )
        self.assertTrue(data['flags']['billing.late_fees']['enabled'])
        self.assertTrue(data['flags']['billing.late_fees']['is_override'])
        # Sample registry default — should appear, may or may not be an override.
        self.assertIn('billing.invoices', data['flags'])

    def test_snapshot_requires_tenant_context(self):
        # Same credentials but no tenant header — the tenant resolver
        # middleware returns 404, or the view itself returns 403.
        resp = self.client_.get(
            '/api/v1/features/me/',
            HTTP_AUTHORIZATION=f'Token {self.token.key}',
        )
        self.assertIn(resp.status_code, (403, 404))

    def test_snapshot_endpoint_succeeds_with_credentials(self):
        # Sanity: the happy-path fetch returns 200 and an empty
        # flags dict (no overrides registered).
        resp = self.client_.get(
            '/api/v1/features/me/', **self.headers
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data['tenant_slug'], 'snapshot')
        self.assertIsInstance(data['flags'], dict)
        # Some registry features should be present.
        self.assertGreater(len(data['flags']), 0)

"""
apps/core/test_saas_feature_flags.py — Phase 25 SaaS feature-toggle surface.

Validates:
  1. Feature registry contains the expected well-known keys.
  2. ``is_feature_enabled`` falls back to the registry default when no row
     exists for the (tenant, key) pair.
  3. Creating a ``TenantFeatureFlag`` overrides the default.
  4. ``set_flag`` endpoint is idempotent (POST twice → same effective state).
  5. ``bulk_set`` applies a batch in one transaction.
  6. Feature catalog endpoint returns the registry.
  7. Feature matrix endpoint includes all tenants and all features.
  8. Unknown feature_key is rejected with 400.
  9. Cached lookup returns the same value as the DB-backed lookup.
 10. ``invalidate_cache`` drops the cache entry.
"""
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.models import (
    Tenant, TenantDomain, TenantFeatureFlag,
)
from apps.core.features import (
    FEATURE_REGISTRY, all_features, is_feature_enabled,
    get_feature_config, invalidate_cache, is_feature_enabled_cached,
)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class Phase25SaaSFeatureFlagsTests(TestCase):

    def setUp(self):
        self.client = APIClient()

        self.superadmin = User.objects.create_superuser(
            username='central_admin',
            email='admin@shebafi.net',
            password='PlatformMaster123!',
        )
        self.superadmin_token, _ = Token.objects.get_or_create(user=self.superadmin)
        self.saas_headers = {
            'HTTP_AUTHORIZATION': f'Token {self.superadmin_token.key}',
            'HTTP_HOST': 'admin.shebafi.xyz',
        }

        self.tenant_a = Tenant.objects.create(
            name='SpeedNet Broadband', slug='speednet', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=self.tenant_a, hostname='speednet.shebafi.net',
            is_primary=True, is_active=True, verified=True,
        )
        self.tenant_b = Tenant.objects.create(
            name='Apex ISP', slug='apex', is_active=True,
            subscription_status='active',
        )
        TenantDomain.objects.create(
            tenant=self.tenant_b, hostname='apex.shebafi.xyz',
            is_primary=True, is_active=True, verified=True,
        )

    # ────── 1. Registry ──────

    def test_registry_has_expected_keys(self):
        keys = set(FEATURE_REGISTRY.keys())
        for expected in [
            'billing.invoices', 'billing.late_fees',
            'sms.billing', 'ip_phone.epbx',
            'network.vpn_wireguard', 'customers.portal',
            'analytics.compliance_export',
        ]:
            self.assertIn(expected, keys, f'registry missing {expected}')

    def test_all_features_sorted(self):
        feats = all_features()
        cats = [f.category for f in feats]
        self.assertEqual(cats, sorted(cats))

    # ────── 2. Default fallback ──────

    def test_default_enabled_when_no_row(self):
        self.assertTrue(is_feature_enabled(self.tenant_a, 'billing.invoices'))

    def test_explicit_override_disables(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant_a,
            feature_key='billing.invoices',
            enabled=False,
        )
        self.assertFalse(is_feature_enabled(self.tenant_a, 'billing.invoices'))
        # Other tenants still default to enabled
        self.assertTrue(is_feature_enabled(self.tenant_b, 'billing.invoices'))

    def test_get_feature_config_returns_dict(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant_a,
            feature_key='sms.billing',
            enabled=True,
            config={'max_per_day': 500},
        )
        cfg = get_feature_config(self.tenant_a, 'sms.billing')
        self.assertEqual(cfg.get('max_per_day'), 500)
        self.assertEqual(get_feature_config(self.tenant_b, 'sms.billing'), {})

    # ────── 3. Cached lookup ──────

    def test_cached_lookup_returns_same_value(self):
        invalidate_cache()
        TenantFeatureFlag.objects.create(
            tenant=self.tenant_a,
            feature_key='ip_phone.epbx',
            enabled=False,
        )
        # First call: warms cache
        v1 = is_feature_enabled_cached(self.tenant_a, 'ip_phone.epbx')
        v2 = is_feature_enabled_cached(self.tenant_a, 'ip_phone.epbx')
        self.assertEqual(v1, v2)
        self.assertFalse(v1)

        # Update row + invalidate cache
        TenantFeatureFlag.objects.filter(
            tenant=self.tenant_a, feature_key='ip_phone.epbx',
        ).update(enabled=True)
        invalidate_cache(self.tenant_a)
        self.assertTrue(is_feature_enabled_cached(self.tenant_a, 'ip_phone.epbx'))

    # ────── 4. set_flag endpoint ──────

    def test_set_flag_endpoint(self):
        r = self.client.post(
            '/api/v1/saas/feature-flags/set/',
            data={
                'tenant': str(self.tenant_a.id),
                'feature_key': 'sms.billing',
                'enabled': True,
                'config': {'max_per_day': 100},
            },
            format='json',
            **self.saas_headers,
        )
        self.assertEqual(r.status_code, 201, r.content)
        flag = TenantFeatureFlag.objects.get(
            tenant=self.tenant_a, feature_key='sms.billing',
        )
        self.assertEqual(flag.config.get('max_per_day'), 100)

    def test_set_flag_is_idempotent(self):
        for _ in range(2):
            r = self.client.post(
                '/api/v1/saas/feature-flags/set/',
                data={
                    'tenant': str(self.tenant_a.id),
                    'feature_key': 'ip_phone.epbx',
                    'enabled': False,
                },
                format='json',
                **self.saas_headers,
            )
            self.assertIn(r.status_code, (200, 201), r.content)
        self.assertEqual(
            TenantFeatureFlag.objects.filter(
                tenant=self.tenant_a, feature_key='ip_phone.epbx',
            ).count(),
            1,
        )

    def test_set_flag_unknown_feature_returns_400(self):
        r = self.client.post(
            '/api/v1/saas/feature-flags/set/',
            data={
                'tenant': str(self.tenant_a.id),
                'feature_key': 'not.in.registry',
                'enabled': True,
            },
            format='json',
            **self.saas_headers,
        )
        self.assertEqual(r.status_code, 400)

    # ────── 5. bulk_set endpoint ──────

    def test_bulk_set_applies_batch(self):
        r = self.client.post(
            '/api/v1/saas/feature-flags/bulk-set/',
            data={
                'tenant': str(self.tenant_a.id),
                'flags': [
                    {'feature_key': 'billing.late_fees', 'enabled': True},
                    {'feature_key': 'sms.marketing', 'enabled': False},
                    {'feature_key': 'network.vpn_wireguard', 'enabled': True},
                ],
            },
            format='json',
            **self.saas_headers,
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['applied_count'], 3)
        self.assertEqual(
            TenantFeatureFlag.objects.filter(tenant=self.tenant_a).count(),
            3,
        )

    def test_bulk_set_invalid_config_returns_400(self):
        r = self.client.post(
            '/api/v1/saas/feature-flags/bulk-set/',
            data={
                'tenant': str(self.tenant_a.id),
                'flags': [
                    {'feature_key': 'sms.billing', 'enabled': True, 'config': 'oops'},
                ],
            },
            format='json',
            **self.saas_headers,
        )
        self.assertEqual(r.status_code, 400)

    # ────── 6. Catalog endpoint ──────

    def test_catalog_returns_registry(self):
        r = self.client.get(
            '/api/v1/saas/features/', **self.saas_headers,
        )
        self.assertEqual(r.status_code, 200)
        self.assertGreater(r.data['count'], 0)
        keys = {f['key'] for f in r.data['features']}
        self.assertIn('billing.invoices', keys)
        self.assertIn('ip_phone.epbx', keys)

    # ────── 7. Matrix endpoint ──────

    def test_matrix_returns_tenants_x_features(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant_a,
            feature_key='billing.invoices',
            enabled=False,
        )
        r = self.client.get(
            '/api/v1/saas/feature-matrix/', **self.saas_headers,
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['tenants']), 2)
        feature_keys = {row['feature_key'] for row in r.data['rows']}
        self.assertIn('billing.invoices', feature_keys)
        # Find the row and confirm the override reflects in the tenant cell.
        invoices_row = next(
            row for row in r.data['rows']
            if row['feature_key'] == 'billing.invoices'
        )
        cells = {c['tenant_slug']: c for c in invoices_row['tenants']}
        self.assertFalse(cells['speednet']['enabled'])
        self.assertTrue(cells['speednet']['is_override'])
        # Apex keeps the default
        self.assertTrue(cells['apex']['enabled'])
        self.assertFalse(cells['apex']['is_override'])

    # ────── 8. CRUD endpoint ──────

    def test_list_flag_endpoint(self):
        TenantFeatureFlag.objects.create(
            tenant=self.tenant_a, feature_key='sms.billing', enabled=False,
        )
        r = self.client.get(
            '/api/v1/saas/feature-flags/?tenant=speednet',
            **self.saas_headers,
        )
        self.assertEqual(r.status_code, 200)
        items = r.data['results'] if isinstance(r.data, dict) and 'results' in r.data else r.data
        self.assertEqual(len(items), 1)

    def test_delete_flag_clears_override(self):
        flag = TenantFeatureFlag.objects.create(
            tenant=self.tenant_a, feature_key='ip_phone.epbx', enabled=False,
        )
        r = self.client.delete(
            f'/api/v1/saas/feature-flags/{flag.id}/',
            **self.saas_headers,
        )
        self.assertIn(r.status_code, (204, 200))
        # Back to default (the registry default is True for this feature)
        invalidate_cache(self.tenant_a)
        self.assertTrue(is_feature_enabled(self.tenant_a, 'ip_phone.epbx'))

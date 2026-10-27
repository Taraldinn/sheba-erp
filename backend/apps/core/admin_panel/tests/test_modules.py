"""
ISP Admin Dashboard — Module / feature-flag subscription tests.
"""
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core import features as features_module
from apps.core.feature_gating import enabled_features_for
from apps.core.features import FEATURE_REGISTRY
from apps.core.models import AuditLog, TenantFeatureFlag

from .helpers import (
    ADMIN_HOST,
    make_admin_user,
    make_non_admin_user,
    make_parent_tenant,
    token_for,
)


class IspAdminModuleTests(TestCase):

    def setUp(self):
        self.parent = make_parent_tenant()
        self.admin = make_admin_user(self.parent, username='parent-admin')
        self.technician = make_non_admin_user(
            self.parent, username='field-tech',
        )
        self.client = APIClient()

    def test_modules_catalog_lists_all_features(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.get(
            '/api/v1/admin/modules/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        keys = {row['key'] for row in res.data}
        self.assertEqual(keys, set(FEATURE_REGISTRY.keys()))

    def test_subscribe_enables_a_feature(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        target = 'billing.late_fees'
        res = self.client.post(
            '/api/v1/admin/modules/subscribe/',
            {'feature_key': target, 'enabled': True},
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['enabled'])
        self.assertTrue(
            TenantFeatureFlag.objects.filter(
                tenant=self.parent, feature_key=target, enabled=True,
            ).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(
                tenant=self.parent, action='module_subscribed',
                details__feature_key=target,
            ).exists()
        )

    def test_unsubscribe_deletes_flag(self):
        TenantFeatureFlag.objects.create(
            tenant=self.parent, feature_key='billing.late_fees', enabled=True,
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            '/api/v1/admin/modules/billing.late_fees/unsubscribe/',
            HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['unsubscribed'])
        self.assertFalse(
            TenantFeatureFlag.objects.filter(
                tenant=self.parent, feature_key='billing.late_fees',
            ).exists()
        )

    def test_cache_is_invalidated_on_toggle(self):
        enabled_features_for(self.parent)
        TenantFeatureFlag.objects.create(
            tenant=self.parent, feature_key='billing.late_fees', enabled=True,
        )
        features_module.invalidate_cache(self.parent)
        after = enabled_features_for(self.parent)
        late_fees = next(f for f in after if f['key'] == 'billing.late_fees')
        self.assertTrue(late_fees['enabled'])
        self.assertTrue(late_fees['is_override'])

    def test_unknown_feature_returns_400(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.post(
            '/api/v1/admin/modules/subscribe/',
            {'feature_key': 'this.module.does.not.exist'},
            format='json', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('feature_key', res.data)

    def test_subscriptions_matrix_returns_overrides(self):
        TenantFeatureFlag.objects.create(
            tenant=self.parent, feature_key='billing.late_fees', enabled=True,
            config={'late_fee_pct': 5},
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.admin).key}',
        )
        res = self.client.get(
            '/api/v1/admin/modules/subscriptions/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        override_keys = {o['feature_key'] for o in res.data['overrides']}
        self.assertIn('billing.late_fees', override_keys)

    def test_non_admin_is_forbidden(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {token_for(self.technician).key}',
        )
        res = self.client.get(
            '/api/v1/admin/modules/', HTTP_HOST=ADMIN_HOST,
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
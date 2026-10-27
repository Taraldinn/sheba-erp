"""
Phase 4 — Public self-serve onboarding tests.

Covers:
 - Happy path with a public paid package → auto-provisions org, tenant,
   owner, OWNER membership, and a TenantSubscription.
 - No-package path → queues a `TenantOnboardingRequest` and returns
   `status=pending_review`.
 - `public_onboarding` is anonymous (no Authorization header).
 - `public_onboarding` rejects duplicate org_slug / tenant_slug.
 - Status endpoint returns the queued request.
"""
from __future__ import annotations

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import (
    Organization,
    OrganizationMembership,
    SaaSPackage,
    Tenant,
    TenantOnboardingRequest,
    TenantSubscription,
)


# settings.py already sets DEFAULT_THROTTLE_CLASSES = [] when 'test' is in
# sys.argv, so no global override is needed here. We only need to clear the
# cache between tests so any throttle counters from earlier runs are wiped.


class PublicOnboardingHappyPathTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()  # clear the throttling counter between tests
        self.pkg = SaaSPackage.objects.create(
            name='Public Growth',
            code='public-growth',
            description='Public test package',
            monthly_price=5000,
            yearly_price=50000,
            max_subscribers=2000,
            max_routers=8,
            is_active=True,
            is_public=True,
        )

    def _payload(self, **overrides):
        body = {
            'org_name': 'Public Acme',
            'org_contact_email': 'contact@acme.test',
            'org_address': '1 Main St',
            'tenant_name': 'Public Acme Tenant',
            'tenant_slug': 'public-acme-tenant',
            'tenant_domain': 'public-acme.example.com',
            'package': str(self.pkg.id),
            'owner_username': 'public_acme_owner',
            'owner_email': 'owner@acme.test',
            'owner_first_name': 'Ada',
            'owner_last_name': 'Lovelace',
        }
        body.update(overrides)
        return body

    def test_auto_provisions_with_package(self):
        resp = self.client.post(
            '/api/v1/public/onboarding/',
            self._payload(),
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['status'], 'provisioned')
        org = Organization.objects.get(slug='public-acme')
        tenant = Tenant.objects.get(slug='public-acme-tenant')
        self.assertEqual(tenant.organization_id, org.id)
        user = User.objects.get(username='public_acme_owner')
        self.assertTrue(user.check_password(resp.data.get('_hint') or 'x') or user.has_usable_password())
        m = OrganizationMembership.objects.get(
            organization=org, user=user, is_active=True,
        )
        self.assertEqual(m.role, OrganizationMembership.Role.OWNER)
        sub = TenantSubscription.objects.get(tenant=tenant)
        self.assertEqual(sub.package_id, self.pkg.id)
        self.assertEqual(sub.status, 'active')
        self.assertIn('claim_url', resp.data)
        self.assertIn('dashboard_url', resp.data)

    def test_no_package_queues_request(self):
        body = self._payload(package=None, tenant_slug='queued-tenant')
        resp = self.client.post(
            '/api/v1/public/onboarding/',
            body,
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['status'], 'pending_review')
        self.assertTrue(
            TenantOnboardingRequest.objects.filter(
                organization_name='Public Acme', status='pending',
            ).exists()
        )
        # No org/tenant should have been provisioned.
        self.assertFalse(Organization.objects.filter(slug='public-acme').exists())
        self.assertFalse(Tenant.objects.filter(slug='queued-tenant').exists())

    def test_duplicate_org_slug_rejected(self):
        Organization.objects.create(name='Existing', slug='public-acme', is_active=True)
        resp = self.client.post(
            '/api/v1/public/onboarding/',
            self._payload(),
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_tenant_slug_rejected(self):
        Tenant.objects.create(
            name='Existing', slug='public-acme-tenant', organization=None, is_active=True,
        )
        resp = self.client.post(
            '/api/v1/public/onboarding/',
            self._payload(),
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_org_contact_email(self):
        body = self._payload(org_contact_email='')
        resp = self.client.post(
            '/api/v1/public/onboarding/',
            body,
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_package_queues_instead_of_provisions(self):
        # Inactive package → caller asked for paid, but we'll queue.
        self.pkg.is_active = False
        self.pkg.save()
        resp = self.client.post(
            '/api/v1/public/onboarding/',
            self._payload(tenant_slug='inactive-tenant'),
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['status'], 'pending_review')

    def test_status_endpoint_returns_queued_request(self):
        # Queue a request first.
        body = self._payload(package=None, tenant_slug='status-tenant')
        resp = self.client.post(
            '/api/v1/public/onboarding/',
            body,
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        req_id = resp.data['onboarding_request_id']
        status_resp = self.client.get(
            f'/api/v1/public/onboarding/{req_id}/status/',
        )
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK, status_resp.data)
        self.assertEqual(status_resp.data['status'], 'pending')
        self.assertEqual(status_resp.data['organization_name'], 'Public Acme')
        self.assertEqual(status_resp.data['plan'], 'Trial')


class PublicPackagesListTests(TestCase):
    """Anonymous read of active public SaaSPackages."""

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        # Active + public — should appear
        self.public_pkg = SaaSPackage.objects.create(
            name='Public Growth', code='public-growth',
            description='Public', monthly_price=5000, yearly_price=50000,
            max_subscribers=2000, max_routers=8, is_active=True, is_public=True,
        )
        # Active but not public — must be filtered out
        self.private_pkg = SaaSPackage.objects.create(
            name='Private Custom', code='private-custom',
            description='Hidden', monthly_price=9999, yearly_price=99999,
            max_subscribers=5000, max_routers=20, is_active=True, is_public=False,
        )
        # Public but paused — must be filtered out
        self.paused_pkg = SaaSPackage.objects.create(
            name='Paused Beta', code='paused-beta',
            description='Paused', monthly_price=100, yearly_price=1000,
            max_subscribers=100, max_routers=1, is_active=False, is_public=True,
        )

    def test_anonymous_list_returns_only_active_public(self):
        resp = self.client.get('/api/v1/public/packages/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        codes = [p['code'] for p in resp.data]
        self.assertIn('public-growth', codes)
        self.assertNotIn('private-custom', codes)
        self.assertNotIn('paused-beta', codes)

    def test_response_shape(self):
        resp = self.client.get('/api/v1/public/packages/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        first = next(p for p in resp.data if p['code'] == 'public-growth')
        for key in ('id', 'name', 'code', 'description', 'monthly_price',
                    'yearly_price', 'max_subscribers', 'max_routers', 'features'):
            self.assertIn(key, first, f'missing field {key!r}')

    def test_no_auth_required(self):
        # No Authorization header at all.
        resp = APIClient().get('/api/v1/public/packages/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

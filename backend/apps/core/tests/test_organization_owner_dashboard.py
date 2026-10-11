"""
Phase 1 — Saas Owner Dashboard: organization-first backend tests.

Covers:
 - `OrganizationSummarySerializer` returns `tenant_count`,
   `member_count`, `active_subscription_count`, `owner_email`.
 - `POST /api/v1/saas/organizations/create-with-first-tenant/`
   creates the org + first tenant + owner + OWNER membership + subscription.
 - The endpoint is rejected for non-`IsCentralAdmin` (a regular org member).
 - `SaaSTenantSerializer` exposes `organization_id`/`organization_name` in
   the central list.
 - `POST /api/v1/saas/tenants/{id}/move-to-organization/` reassigns.

These tests run against the in-memory SQLite test database and use
Django's APIClient for authenticated requests.
"""
from __future__ import annotations

import uuid

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import (
    Organization,
    OrganizationMembership,
    SaaSPackage,
    Tenant,
    TenantSubscription,
)


CONTROL_HOST = 'admin.shebafi.xyz'


def _make_user(username: str, *, superuser: bool = False) -> User:
    u, _ = User.objects.get_or_create(
        username=username,
        defaults={
            'email': f'{username}@test.local',
            'is_staff': True,
            'is_superuser': superuser,
        },
    )
    if superuser:
        u.is_superuser = True
        u.is_staff = True
    u.set_password('test-pass-1234')
    u.save()
    return u


def _make_package(code: str, *, monthly: int = 5000) -> SaaSPackage:
    return SaaSPackage.objects.create(
        name=f'Pkg {code}',
        code=code,
        description=f'Org-owner test package {code}',
        monthly_price=monthly,
        yearly_price=monthly * 10,
        max_subscribers=500,
        max_routers=5,
        max_custom_domains=2,
        is_active=True,
        is_public=True,
    )


class OrganizationSummarySerializerTests(TestCase):
    def setUp(self):
        self.superuser = _make_user('central', superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(user=self.superuser)

        self.org = Organization.objects.create(
            name='Summary ISP',
            slug='summary-isp',
            contact_email='summary@x.com',
            is_active=True,
            max_tenants=5,
        )
        self.tenant = Tenant.objects.create(
            name='Summary T1',
            slug='summary-t1',
            organization=self.org,
            plan='Growth',
            max_subscribers=2500,
            max_routers=10,
            is_active=True,
        )
        self.owner = _make_user('summary_owner', superuser=False)
        self.owner.email = 'owner@x.com'
        self.owner.save()
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role=OrganizationMembership.Role.OWNER,
            is_active=True,
        )
        self.pkg = _make_package('summary')
        TenantSubscription.objects.create(
            tenant=self.tenant,
            package=self.pkg,
            billing_cycle='monthly',
            price=5000,
            status='active',
        )

    def test_list_includes_denormalized_counts(self):
        resp = self.client.get(
            '/api/v1/saas/organizations/',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        row = next(r for r in resp.data['results'] if r['slug'] == 'summary-isp')
        self.assertEqual(row['tenant_count'], 1)
        self.assertEqual(row['active_tenant_count'], 1)
        self.assertEqual(row['member_count'], 1)
        self.assertEqual(row['active_subscription_count'], 1)
        self.assertEqual(row['owner_email'], 'owner@x.com')

    def test_retrieve_includes_denormalized_counts(self):
        resp = self.client.get(
            f'/api/v1/saas/organizations/{self.org.id}/',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['tenant_count'], 1)
        self.assertEqual(resp.data['member_count'], 1)
        self.assertEqual(resp.data['active_subscription_count'], 1)
        self.assertEqual(resp.data['owner_email'], 'owner@x.com')


class CreateOrganizationWithFirstTenantTests(TestCase):
    def setUp(self):
        self.superuser = _make_user('central', superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(user=self.superuser)
        self.pkg = _make_package('cofwt')

    def _payload(self, **overrides):
        body = {
            'org_name': 'Acme ISP',
            'org_contact_email': 'acme@x.com',
            'org_address': '1 Main St',
            'tenant_name': 'Acme Tenant',
            'tenant_slug': 'acme-tenant',
            'tenant_domain': 'acme.example.com',
            'package': str(self.pkg.id),
            'owner_username': 'acme_owner',
            'owner_email': 'owner@x.com',
            'owner_password': 'sup3r-secret!',
            'owner_first_name': 'Ada',
            'owner_last_name': 'Lovelace',
            'billing_cycle': 'monthly',
        }
        body.update(overrides)
        return body

    def test_creates_org_tenant_owner_membership_and_subscription(self):
        resp = self.client.post(
            '/api/v1/saas/organizations/create-with-first-tenant/',
            self._payload(),
            format='json',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        org = Organization.objects.get(slug='acme-isp')
        tenant = Tenant.objects.get(slug='acme-tenant')
        self.assertEqual(tenant.organization_id, org.id)
        self.assertEqual(tenant.plan, 'Pkg')  # first word of package name
        self.assertEqual(tenant.max_subscribers, self.pkg.max_subscribers)
        user = User.objects.get(username='acme_owner')
        self.assertTrue(user.check_password('sup3r-secret!'))
        m = OrganizationMembership.objects.get(
            organization=org, user=user, is_active=True,
        )
        self.assertEqual(m.role, OrganizationMembership.Role.OWNER)
        sub = TenantSubscription.objects.get(tenant=tenant)
        self.assertEqual(sub.package_id, self.pkg.id)
        self.assertEqual(sub.status, 'active')

    def test_generates_password_when_omitted(self):
        body = self._payload(owner_password='')
        resp = self.client.post(
            '/api/v1/organizations/create-with-first-tenant/' if False
            else '/api/v1/saas/organizations/create-with-first-tenant/',
            body,
            format='json',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIsNotNone(resp.data.get('generated_password'))
        self.assertGreaterEqual(len(resp.data['generated_password']), 12)

    def test_trial_mode_when_no_package(self):
        body = self._payload(package=None, tenant_slug='acme-trial')
        resp = self.client.post(
            '/api/v1/saas/organizations/create-with-first-tenant/',
            body,
            format='json',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        tenant = Tenant.objects.get(slug='acme-trial')
        self.assertEqual(tenant.subscription_status, 'trial')
        sub = TenantSubscription.objects.get(tenant=tenant)
        self.assertEqual(sub.status, 'trial')
        self.assertIsNone(sub.package_id)

    def test_rejects_duplicate_tenant_slug(self):
        Tenant.objects.create(
            name='Existing', slug='acme-tenant', organization=None,
            is_active=True,
        )
        resp = self.client.post(
            '/api/v1/saas/organizations/create-with-first-tenant/',
            self._payload(),
            format='json',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_duplicate_org_slug(self):
        Organization.objects.create(
            name='Already', slug='acme-isp', is_active=True,
        )
        resp = self.client.post(
            '/api/v1/saas/organizations/create-with-first-tenant/',
            self._payload(),
            format='json',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_denied_for_non_central_admin(self):
        regular = _make_user('regular')
        Organization.objects.create(
            name='Forbid', slug='forbid', is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=Organization.objects.get(slug='forbid'),
            user=regular,
            role=OrganizationMembership.Role.OWNER,
            is_active=True,
        )
        self.client.force_authenticate(user=regular)
        resp = self.client.post(
            '/api/v1/saas/organizations/create-with-first-tenant/',
            self._payload(),
            format='json',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class CentralTenantSerializerOrganizationTests(TestCase):
    def setUp(self):
        self.superuser = _make_user('central', superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(user=self.superuser)
        self.org = Organization.objects.create(
            name='Org Central', slug='org-central', is_active=True,
        )
        self.tenant = Tenant.objects.create(
            name='Org Central Tenant',
            slug='org-central-tenant',
            organization=self.org,
            plan='Growth',
            is_active=True,
        )

    def test_central_list_exposes_organization(self):
        resp = self.client.get(
            '/api/v1/saas/tenants/',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        row = next(
            r for r in resp.data['results'] if r['slug'] == 'org-central-tenant'
        )
        self.assertEqual(str(row['organization_id']), str(self.org.id))
        self.assertEqual(row['organization_name'], 'Org Central')
        self.assertEqual(row['organization_slug'], 'org-central')

    def test_filter_by_organization_id(self):
        # Create a second tenant under no organization.
        Tenant.objects.create(
            name='Orphan', slug='orphan-tenant', is_active=True,
        )
        resp = self.client.get(
            f'/api/v1/saas/tenants/?organization={self.org.id}',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        slugs = [t['slug'] for t in resp.data['results']]
        self.assertIn('org-central-tenant', slugs)
        self.assertNotIn('orphan-tenant', slugs)


class MoveTenantToOrganizationTests(TestCase):
    def setUp(self):
        self.superuser = _make_user('central', superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(user=self.superuser)
        self.org_a = Organization.objects.create(
            name='Org A', slug='org-a', is_active=True, max_tenants=5,
        )
        self.org_b = Organization.objects.create(
            name='Org B', slug='org-b', is_active=True, max_tenants=5,
        )
        self.tenant = Tenant.objects.create(
            name='Movable', slug='movable', organization=self.org_a,
            is_active=True,
        )

    def test_move_tenant(self):
        resp = self.client.post(
            f'/api/v1/saas/tenants/{self.tenant.id}/move-to-organization/',
            {'organization_id': str(self.org_b.id)},
            format='json',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.organization_id, self.org_b.id)

    def test_move_to_null_detaches(self):
        resp = self.client.post(
            f'/api/v1/saas/tenants/{self.tenant.id}/move-to-organization/',
            {'organization_id': None},
            format='json',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.tenant.refresh_from_db()
        self.assertIsNone(self.tenant.organization_id)

    def test_move_respects_max_tenants(self):
        # Fill org B to its cap.
        self.org_b.max_tenants = 1
        self.org_b.save()
        other = Tenant.objects.create(
            name='Already There', slug='already-there',
            organization=self.org_b, is_active=True,
        )
        resp = self.client.post(
            f'/api/v1/saas/tenants/{self.tenant.id}/move-to-organization/',
            {'organization_id': str(self.org_b.id)},
            format='json',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

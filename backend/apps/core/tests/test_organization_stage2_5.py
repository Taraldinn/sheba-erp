"""
Stage 2.5 — Organization-admin "tenants under organization" + dashboard tests.

Covers the new org-admin surface (organization_views.py):
    GET   /api/v1/organizations/<id>/dashboard/
    GET   /api/v1/organizations/<id>/tenants/
    POST  /api/v1/organizations/<id>/tenants/         (requires package)
    GET   /api/v1/organizations/<id>/tenants/<tid>/
    POST  /api/v1/organizations/<id>/tenants/<tid>/suspend/
    POST  /api/v1/organizations/<id>/tenants/<tid>/activate/
    GET   /api/v1/organizations/<id>/subscriptions/
    GET   /api/v1/saas/packages/public/

These tests run against the in-memory SQLite test database (configured in
settings.py when 'test' is in sys.argv) and use Django's APIClient for
authenticated requests.
"""
from __future__ import annotations

import secrets
import uuid

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import (
    AuditLog,
    Organization,
    OrganizationMembership,
    SaaSPackage,
    Tenant,
    TenantSubscription,
)


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


def _make_org(slug: str, *, max_tenants: int = 10) -> Organization:
    return Organization.objects.create(
        name=f'Org {slug}',
        slug=slug,
        contact_email=f'{slug}@test.local',
        max_tenants=max_tenants,
    )


def _make_package(code: str, *, monthly: int = 5000) -> SaaSPackage:
    return SaaSPackage.objects.create(
        name=f'Pkg {code}',
        code=code,
        description=f'Stage 2.5 test package {code}',
        monthly_price=monthly,
        yearly_price=monthly * 10,
        max_subscribers=500,
        max_routers=5,
        max_custom_domains=2,
        is_active=True,
        is_public=True,
    )


class Stage25OrganizationDashboardTests(TestCase):
    """GET /api/v1/organizations/<id>/dashboard/"""

    def setUp(self):
        self.org = _make_org('stage25-dash')
        self.pkg = _make_package('STAGE25-DASH')
        self.admin = _make_user('stage25-admin', superuser=True)
        OrganizationMembership.objects.create(
            organization=self.org, user=self.admin,
            role=OrganizationMembership.Role.OWNER, is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_dashboard_returns_kpis(self):
        resp = self.client.get(f'/api/v1/organizations/{self.org.id}/dashboard/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['organization']['slug'], 'stage25-dash')
        self.assertIn('kpis', data)
        k = data['kpis']
        for key in (
            'tenant_count', 'active_tenants', 'suspended_tenants',
            'total_subscribers', 'active_subscribers',
            'mrr_estimated', 'packages_available',
        ):
            self.assertIn(key, k)
        self.assertEqual(k['tenant_count'], 0)
        self.assertEqual(k['packages_available'], 1)

    def test_dashboard_refuses_non_admin(self):
        stranger = _make_user('stage25-stranger')
        c2 = APIClient()
        c2.force_authenticate(stranger)
        resp = c2.get(f'/api/v1/organizations/{self.org.id}/dashboard/')
        self.assertEqual(resp.status_code, 403)

    def test_dashboard_requires_auth(self):
        anon = APIClient()
        resp = anon.get(f'/api/v1/organizations/{self.org.id}/dashboard/')
        self.assertEqual(resp.status_code, 401)

    def test_dashboard_404_for_missing_org(self):
        resp = self.client.get(f'/api/v1/organizations/{uuid.uuid4()}/dashboard/')
        self.assertEqual(resp.status_code, 404)


class Stage25PublicPackagesTests(TestCase):
    """GET /api/v1/saas/packages/public/"""

    def setUp(self):
        self.pkg_active = _make_package('STAGE25-PUB-A')
        self.pkg_inactive = _make_package('STAGE25-PUB-I')
        self.pkg_inactive.is_active = False
        self.pkg_inactive.save()
        self.user = _make_user('stage25-pub-user')

    def test_lists_only_active(self):
        c = APIClient()
        c.force_authenticate(self.user)
        resp = c.get('/api/v1/saas/packages/public/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        codes = [r['code'] for r in data['results']]
        self.assertIn('STAGE25-PUB-A', codes)
        self.assertNotIn('STAGE25-PUB-I', codes)

    def test_public_filter(self):
        c = APIClient()
        c.force_authenticate(self.user)
        resp = c.get('/api/v1/saas/packages/public/?public=1')
        self.assertEqual(resp.status_code, 200)
        for r in resp.json()['results']:
            self.assertTrue(r['is_public'])

    def test_requires_auth(self):
        resp = APIClient().get('/api/v1/saas/packages/public/')
        self.assertEqual(resp.status_code, 401)


class Stage25TenantCreateTests(TestCase):
    """POST /api/v1/organizations/<id>/tenants/ — create a tenant (package required)"""

    def setUp(self):
        self.org = _make_org('stage25-create')
        self.pkg = _make_package('STAGE25-CREATE')
        self.admin = _make_user('stage25-create-admin', superuser=True)
        OrganizationMembership.objects.create(
            organization=self.org, user=self.admin,
            role=OrganizationMembership.Role.OWNER, is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _payload(self, **overrides):
        base = {
            'name': 'ISP One',
            'slug': f'isp-one-{secrets.token_hex(3)}',
            'package': str(self.pkg.id),
            'admin_username': f'admin_{secrets.token_hex(3)}',
            'admin_password': 'Pa55word!',
            'admin_email': 'admin@isp.test',
            'contact_phone': '+88017000000',
            'billing_cycle': 'monthly',
        }
        base.update(overrides)
        return base

    def test_creates_tenant_with_package(self):
        resp = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(), format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertIn('tenant', body)
        self.assertIn('subscription', body)
        self.assertIn('admin', body)
        self.assertEqual(body['subscription']['package_name'], 'Pkg STAGE25-CREATE')
        self.assertEqual(body['tenant']['package_name'], 'Pkg STAGE25-CREATE')
        # Tenant, subscription, admin, token all created
        tenant_id = body['tenant']['id']
        self.assertTrue(Tenant.objects.filter(id=tenant_id).exists())
        self.assertTrue(TenantSubscription.objects.filter(tenant_id=tenant_id).exists())
        self.assertIsNotNone(body['admin']['token'])
        # Admin user has access to the new tenant
        admin_user = User.objects.get(username=body['admin']['username'])
        self.assertTrue(admin_user.is_staff)
        self.assertFalse(admin_user.is_superuser)

    def test_creates_tenant_trial_status(self):
        resp = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(trial_days=7), format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        sub_status = resp.json()['subscription']['status']
        self.assertEqual(sub_status, 'trial')

    def test_creates_tenant_yearly_billing(self):
        resp = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(billing_cycle='yearly'), format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertEqual(body['subscription']['billing_cycle'], 'yearly')

    def test_rejects_missing_package(self):
        payload = self._payload()
        payload.pop('package')
        resp = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=payload, format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('package', str(resp.content).lower())

    def test_rejects_inactive_package(self):
        self.pkg.is_active = False
        self.pkg.save()
        resp = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(), format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_rejects_duplicate_slug(self):
        self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(slug='dup-isp'), format='json',
        )
        resp2 = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(slug='dup-isp'), format='json',
        )
        self.assertEqual(resp2.status_code, 400)

    def test_rejects_duplicate_admin_username(self):
        self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(admin_username='dupadmin'), format='json',
        )
        resp2 = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(admin_username='dupadmin'), format='json',
        )
        self.assertEqual(resp2.status_code, 400)

    def test_enforces_max_tenants_quota(self):
        small_org = _make_org('stage25-quota', max_tenants=1)
        OrganizationMembership.objects.create(
            organization=small_org, user=self.admin,
            role=OrganizationMembership.Role.OWNER, is_active=True,
        )
        # First tenant succeeds
        first = self.client.post(
            f'/api/v1/organizations/{small_org.id}/tenants/',
            data=self._payload(), format='json',
        )
        self.assertEqual(first.status_code, 201)
        # Second tenant fails with quota exceeded
        second = self.client.post(
            f'/api/v1/organizations/{small_org.id}/tenants/',
            data=self._payload(), format='json',
        )
        self.assertEqual(second.status_code, 403)
        self.assertIn('TENANT_QUOTA_EXCEEDED', str(second.content))

    def test_non_admin_cannot_create(self):
        stranger = _make_user('stage25-stranger-create')
        c2 = APIClient()
        c2.force_authenticate(stranger)
        resp = c2.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(), format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_member_role_cannot_create(self):
        member = _make_user('stage25-member-create')
        OrganizationMembership.objects.create(
            organization=self.org, user=member,
            role=OrganizationMembership.Role.MEMBER, is_active=True,
        )
        c2 = APIClient()
        c2.force_authenticate(member)
        resp = c2.post(
            f'/api/v1/organizations/{self.org.id}/tenants/',
            data=self._payload(), format='json',
        )
        self.assertEqual(resp.status_code, 403)


class Stage25TenantListTests(TestCase):
    """GET /api/v1/organizations/<id>/tenants/ — list under org"""

    def setUp(self):
        self.org = _make_org('stage25-list')
        self.pkg = _make_package('STAGE25-LIST')
        self.admin = _make_user('stage25-list-admin', superuser=True)
        OrganizationMembership.objects.create(
            organization=self.org, user=self.admin,
            role=OrganizationMembership.Role.OWNER, is_active=True,
        )
        # Seed two tenants
        self.t1 = Tenant.objects.create(
            name='Isp A', slug='isp-a', organization=self.org,
            plan=self.pkg.name, max_subscribers=100, max_routers=2,
            is_active=True,
        )
        self.t2 = Tenant.objects.create(
            name='Isp B', slug='isp-b', organization=self.org,
            plan=self.pkg.name, max_subscribers=100, max_routers=2,
            is_active=False,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_list_returns_all_under_org(self):
        resp = self.client.get(f'/api/v1/organizations/{self.org.id}/tenants/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['count'], 2)
        slugs = {r['slug'] for r in data['results']}
        self.assertEqual(slugs, {'isp-a', 'isp-b'})

    def test_list_filter_is_active(self):
        resp = self.client.get(
            f'/api/v1/organizations/{self.org.id}/tenants/?is_active=true'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['count'], 1)
        self.assertEqual(resp.json()['results'][0]['slug'], 'isp-a')

    def test_list_search(self):
        resp = self.client.get(
            f'/api/v1/organizations/{self.org.id}/tenants/?search=isp-a'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['count'], 1)


class Stage25TenantDetailAndActionsTests(TestCase):
    """GET / <tid>/ and POST .../suspend/ .../activate/"""

    def setUp(self):
        self.org = _make_org('stage25-detail')
        self.pkg = _make_package('STAGE25-DETAIL')
        self.admin = _make_user('stage25-detail-admin', superuser=True)
        OrganizationMembership.objects.create(
            organization=self.org, user=self.admin,
            role=OrganizationMembership.Role.OWNER, is_active=True,
        )
        self.tenant = Tenant.objects.create(
            name='Detail ISP', slug='detail-isp', organization=self.org,
            plan=self.pkg.name, max_subscribers=100, max_routers=2,
            is_active=True, subscription_status='active',
        )
        TenantSubscription.objects.create(
            tenant=self.tenant, package=self.pkg,
            billing_cycle='monthly', price=self.pkg.monthly_price,
            status='active', start_date='2026-01-01', end_date='2027-01-01',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_detail_returns_full_record(self):
        resp = self.client.get(
            f'/api/v1/organizations/{self.org.id}/tenants/{self.tenant.id}/'
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['slug'], 'detail-isp')
        self.assertEqual(data['package_name'], 'Pkg STAGE25-DETAIL')
        self.assertEqual(data['subscription_status'], 'active')
        self.assertIsNotNone(data['subscription'])
        self.assertEqual(data['subscription']['package_name'], 'Pkg STAGE25-DETAIL')

    def test_detail_404_for_tenant_not_under_org(self):
        other_org = _make_org('stage25-other-org')
        other_tenant = Tenant.objects.create(
            name='Other', slug='other-isp', organization=other_org,
            plan=self.pkg.name, is_active=True,
        )
        resp = self.client.get(
            f'/api/v1/organizations/{self.org.id}/tenants/{other_tenant.id}/'
        )
        self.assertEqual(resp.status_code, 404)

    def test_suspend_flips_status(self):
        resp = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/{self.tenant.id}/suspend/'
        )
        self.assertEqual(resp.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertFalse(self.tenant.is_active)
        self.assertEqual(self.tenant.subscription_status, 'paused')
        sub = TenantSubscription.objects.get(tenant=self.tenant)
        self.assertEqual(sub.status, 'paused')

    def test_activate_restores_status(self):
        # First suspend
        self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/{self.tenant.id}/suspend/'
        )
        # Then activate
        resp = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/{self.tenant.id}/activate/'
        )
        self.assertEqual(resp.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertTrue(self.tenant.is_active)
        self.assertEqual(self.tenant.subscription_status, 'active')

    def test_invalid_action(self):
        resp = self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/{self.tenant.id}/nuke/'
        )
        self.assertEqual(resp.status_code, 400)

    def test_audit_log_recorded(self):
        self.client.post(
            f'/api/v1/organizations/{self.org.id}/tenants/{self.tenant.id}/suspend/'
        )
        self.assertTrue(
            AuditLog.objects.filter(
                tenant=self.tenant, action='organization.tenant.suspend'
            ).exists()
        )


class Stage25OrgSubscriptionsTests(TestCase):
    """GET /api/v1/organizations/<id>/subscriptions/"""

    def setUp(self):
        self.org = _make_org('stage25-subs')
        self.pkg = _make_package('STAGE25-SUBS')
        self.admin = _make_user('stage25-subs-admin', superuser=True)
        OrganizationMembership.objects.create(
            organization=self.org, user=self.admin,
            role=OrganizationMembership.Role.OWNER, is_active=True,
        )
        # Two tenants, each with a subscription
        for i, slug in enumerate(['sub-1', 'sub-2']):
            t = Tenant.objects.create(
                name=f'Sub ISP {i}', slug=slug, organization=self.org,
                plan=self.pkg.name, is_active=True,
            )
            TenantSubscription.objects.create(
                tenant=t, package=self.pkg,
                billing_cycle='monthly', price=self.pkg.monthly_price,
                status='active',
            )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_lists_subscriptions_across_org(self):
        resp = self.client.get(
            f'/api/v1/organizations/{self.org.id}/subscriptions/'
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['count'], 2)
        for row in data['results']:
            self.assertEqual(row['package_name'], 'Pkg STAGE25-SUBS')
            self.assertEqual(row['status'], 'active')

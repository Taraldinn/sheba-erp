"""
Stage 2 — API tests for Organization & OrganizationMembership endpoints.

Covers:
- SaaS super admin can CRUD organizations via /api/v1/saas/organizations/.
- SaaS admin can attach/detach members.
- ISP owner (org OWNER/ADMIN) can list their organizations via
  /api/v1/organizations/me/.
- A non-member cannot read another org's tenants via /me/.
- A regular tenant staff (no org membership) gets 403 on /me/.
- /api/v1/saas/organizations/ is denied to non-superusers (control-plane
  isolation).
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import (
    Organization, OrganizationMembership, Tenant, TenantDomain
)


CONTROL_HOST = 'admin.shebafi.xyz'
ISP_HOST = 'app.shebafi.xyz'


class SaaSOrganizationAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username='central', password='pw12345!', email='central@shebafi.xyz'
        )
        # A non-superuser with org-membership in another org — should be denied.
        self.regular = User.objects.create_user(
            username='regular', password='pw12345!', email='r@sheba.test'
        )
        self.other_org = Organization.objects.create(
            name='Other', slug='other', is_active=True
        )
        OrganizationMembership.objects.create(
            organization=self.other_org, user=self.regular,
            role=OrganizationMembership.Role.OWNER, is_active=True
        )
        self.t1 = Tenant.objects.create(
            name='Acme North', slug='acme-north', domain='acme-north.shebafi.com',
            is_active=True, organization=self.other_org
        )

    def _login_superuser(self):
        self.client.force_authenticate(user=self.superuser)

    def _login_regular(self):
        self.client.force_authenticate(user=self.regular)

    def test_superuser_can_list_organizations(self):
        self._login_superuser()
        resp = self.client.get(
            '/api/v1/saas/organizations/',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['count'], 1)

    def test_regular_user_denied_saas_organizations(self):
        self._login_regular()
        resp = self.client.get(
            '/api/v1/saas/organizations/',
            HTTP_HOST=CONTROL_HOST,
        )
        # The IsCentralAdmin permission denies non-superusers.
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_create_organization(self):
        self._login_superuser()
        resp = self.client.post(
            '/api/v1/saas/organizations/',
            {'name': 'New ISP', 'slug': 'new-isp', 'contact_email': 'n@x.com'},
            format='json', HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(Organization.objects.filter(slug='new-isp').exists())

    def test_superuser_can_add_member(self):
        self._login_superuser()
        org = Organization.objects.create(
            name='Test', slug='test', is_active=True
        )
        user = User.objects.create_user(
            username='new_member', password='pw12345!', email='nm@x.com'
        )
        resp = self.client.post(
            f'/api/v1/saas/organizations/{org.id}/members/',
            {'username': 'new_member', 'role': 'ADMIN'},
            format='json', HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertTrue(
            OrganizationMembership.objects.filter(
                organization=org, user=user, role='ADMIN', is_active=True
            ).exists()
        )

    def test_cannot_remove_last_owner(self):
        self._login_superuser()
        org = Organization.objects.create(
            name='Test2', slug='test2', is_active=True
        )
        user = User.objects.create_user(
            username='owner1', password='pw12345!', email='o1@x.com'
        )
        OrganizationMembership.objects.create(
            organization=org, user=user,
            role=OrganizationMembership.Role.OWNER, is_active=True
        )
        resp = self.client.delete(
            f'/api/v1/saas/organizations/{org.id}/members/{user.id}/',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_delete_organization_with_tenants(self):
        self._login_superuser()
        # self.other_org has self.t1 attached
        resp = self.client.delete(
            f'/api/v1/saas/organizations/{self.other_org.id}/',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Organization.objects.filter(id=self.other_org.id).exists())

    def test_tenants_subaction_returns_owned_tenants(self):
        self._login_superuser()
        resp = self.client.get(
            f'/api/v1/saas/organizations/{self.other_org.id}/tenants/',
            HTTP_HOST=CONTROL_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['slug'], 'acme-north')


class MyOrganizationsAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username='org_owner', password='pw12345!', email='oo@x.com'
        )
        self.member = User.objects.create_user(
            username='org_member', password='pw12345!', email='om@x.com'
        )
        self.outsider = User.objects.create_user(
            username='outsider', password='pw12345!', email='out@x.com'
        )
        self.superuser = User.objects.create_superuser(
            username='central2', password='pw12345!', email='c2@shebafi.xyz'
        )
        self.org_a = Organization.objects.create(
            name='Org A', slug='org-a', is_active=True
        )
        self.org_b = Organization.objects.create(
            name='Org B', slug='org-b', is_active=True
        )
        OrganizationMembership.objects.create(
            organization=self.org_a, user=self.owner,
            role=OrganizationMembership.Role.OWNER, is_active=True
        )
        OrganizationMembership.objects.create(
            organization=self.org_a, user=self.member,
            role=OrganizationMembership.Role.MEMBER, is_active=True
        )
        OrganizationMembership.objects.create(
            organization=self.org_b, user=self.owner,
            role=OrganizationMembership.Role.ADMIN, is_active=True
        )
        self.t1 = Tenant.objects.create(
            name='T1', slug='t1', domain='t1.shebafi.com', is_active=True,
            organization=self.org_a
        )
        self.t2 = Tenant.objects.create(
            name='T2', slug='t2', domain='t2.shebafi.com', is_active=True,
            organization=self.org_b
        )

    def test_owner_sees_both_orgs(self):
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get(
            '/api/v1/organizations/me/', HTTP_HOST=ISP_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 2)
        slugs = sorted(r['organization']['slug'] for r in resp.data['results'])
        self.assertEqual(slugs, ['org-a', 'org-b'])

    def test_member_only_sees_their_org(self):
        self.client.force_authenticate(user=self.member)
        resp = self.client.get(
            '/api/v1/organizations/me/', HTTP_HOST=ISP_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['organization']['slug'], 'org-a')

    def test_outsider_gets_empty(self):
        self.client.force_authenticate(user=self.outsider)
        resp = self.client.get(
            '/api/v1/organizations/me/', HTTP_HOST=ISP_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 0)

    def test_unauthenticated_denied(self):
        resp = self.client.get(
            '/api/v1/organizations/me/', HTTP_HOST=ISP_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_org_detail_denied_to_non_member(self):
        self.client.force_authenticate(user=self.outsider)
        resp = self.client.get(
            f'/api/v1/organizations/{self.org_a.id}/', HTTP_HOST=ISP_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_org_detail_returns_nested_tenants(self):
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get(
            f'/api/v1/organizations/{self.org_a.id}/', HTTP_HOST=ISP_HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['role'], 'OWNER')
        slugs = [t['slug'] for t in resp.data['tenants']]
        self.assertIn('t1', slugs)
        self.assertNotIn('t2', slugs)

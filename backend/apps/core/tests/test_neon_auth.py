"""
Neon Auth ⇄ Django bridge: JWT verification, user linking, org-portal API,
and authorization sync on approval.

Tokens are minted with a locally generated Ed25519 key and the JWKS lookup is
patched to return its public half, so no network is needed.
"""
import time
import uuid
from unittest import mock

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.authentication.models import StaffMembership
from apps.authentication.sessions import CONTEXT_TENANT, resolve_session
from apps.core import neon_auth
from apps.core.models import (
    NeonIdentity,
    Organization,
    OrganizationMembership,
    SaaSPackage,
    Tenant,
    TenantOnboardingRequest,
)

AUTH_URL = 'https://ep-test.neonauth.example.com/neondb/auth'
ORIGIN = 'https://ep-test.neonauth.example.com'

_KEY = Ed25519PrivateKey.generate()
_OTHER_KEY = Ed25519PrivateKey.generate()


def make_token(sub='neon-user-1', email='owner@example.com', name='Owner One', *, key=None,
               alg='EdDSA', iss=ORIGIN, aud=ORIGIN, exp_in=900, **extra):
    now = int(time.time())
    payload = {'sub': sub, 'id': sub, 'email': email, 'name': name, 'emailVerified': True,
               'iat': now, 'exp': now + exp_in, 'iss': iss, 'aud': aud, **extra}
    return jwt.encode(payload, key or _KEY, algorithm=alg)


@override_settings(NEON_AUTH_BASE_URL=AUTH_URL, NEON_AUTH_JWKS_URL='')
class NeonAuthTestBase(TestCase):
    def setUp(self):
        cache.clear()  # reset scoped throttles between tests
        patcher = mock.patch.object(neon_auth, '_get_signing_key', lambda token: _KEY.public_key())
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = APIClient()

    def auth(self, token=None, **kw):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token or make_token(**kw)}')
        return self.client


class JwtVerificationTests(NeonAuthTestBase):
    def test_no_header_is_401(self):
        self.assertEqual(self.client.get('/api/v1/org/me/').status_code, 401)

    def test_valid_token_creates_linked_non_privileged_user(self):
        res = self.auth().get('/api/v1/org/me/')
        self.assertEqual(res.status_code, 200)
        ident = NeonIdentity.objects.get(neon_user_id='neon-user-1')
        u = ident.user
        self.assertEqual(u.email, 'owner@example.com')
        self.assertFalse(u.has_usable_password())
        self.assertFalse(u.is_staff)
        self.assertFalse(u.is_superuser)
        self.assertEqual(res.data['user']['neon_user_id'], 'neon-user-1')

    def test_second_login_reuses_same_user(self):
        self.auth().get('/api/v1/org/me/')
        self.auth().get('/api/v1/org/me/')
        self.assertEqual(NeonIdentity.objects.count(), 1)
        self.assertEqual(User.objects.count(), 1)

    def test_same_email_never_links_to_existing_staff_account(self):
        admin = User.objects.create_superuser('admin', 'owner@example.com', 'pw')
        self.auth(email='owner@example.com').get('/api/v1/org/me/')
        ident = NeonIdentity.objects.get(neon_user_id='neon-user-1')
        self.assertNotEqual(ident.user_id, admin.id)
        self.assertFalse(ident.user.is_superuser)

    def test_rejected_tokens(self):
        bad = {
            'expired': make_token(exp_in=-3600),
            'wrong issuer': make_token(iss='https://evil.example.com'),
            'wrong audience': make_token(aud='https://evil.example.com'),
            'foreign signing key': make_token(key=_OTHER_KEY),
            'banned': make_token(banned=True),
        }
        for label, tok in bad.items():
            with self.subTest(label):
                # foreign key: verification must fail on signature, so don't patch to accept it
                with mock.patch.object(neon_auth, '_get_signing_key', lambda t: _KEY.public_key()):
                    self.assertEqual(self.auth(tok).get('/api/v1/org/me/').status_code, 401)
        self.assertEqual(NeonIdentity.objects.count(), 0)

    def test_hs256_alg_confusion_rejected(self):
        # Attacker signs HS256 using the public key bytes as the secret.
        from cryptography.hazmat.primitives import serialization
        pub = _KEY.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        now = int(time.time())
        tok = jwt.encode({'sub': 'x', 'iat': now, 'exp': now + 600, 'iss': ORIGIN, 'aud': ORIGIN}, pub, algorithm='HS256')
        self.assertEqual(self.auth(tok).get('/api/v1/org/me/').status_code, 401)

    def test_opaque_bearer_is_not_accepted_here(self):
        self.assertEqual(self.auth('not-a-jwt-just-an-opaque-token').get('/api/v1/org/me/').status_code, 401)

    @override_settings(NEON_AUTH_BASE_URL='')
    def test_unconfigured_server_rejects(self):
        self.assertEqual(self.auth().get('/api/v1/org/me/').status_code, 401)

    def test_deactivated_django_user_is_blocked(self):
        self.auth().get('/api/v1/org/me/')
        NeonIdentity.objects.get().user.__class__.objects.update(is_active=False)
        self.assertEqual(self.auth().get('/api/v1/org/me/').status_code, 401)


class OrgOnboardingTests(NeonAuthTestBase):
    def payload(self, **kw):
        return {'org_name': 'Dhaka Broadband', 'org_slug': 'dhaka-net', 'org_contact_phone': '+8801700000000', **kw}

    def test_requires_login(self):
        self.assertEqual(self.client.post('/api/v1/org/onboarding/', self.payload(), format='json').status_code, 401)

    def test_creates_pending_request_owned_by_caller(self):
        res = self.auth().post('/api/v1/org/onboarding/', self.payload(), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        req = TenantOnboardingRequest.objects.get()
        self.assertEqual(req.status, 'pending')
        self.assertEqual(req.requested_by.neon_identity.neon_user_id, 'neon-user-1')
        self.assertEqual(req.contact_email, 'owner@example.com')
        self.assertEqual(req.requested_slug, 'dhaka-net')
        # Nothing is auto-provisioned from this endpoint.
        self.assertEqual(Tenant.objects.count(), 0)
        self.assertEqual(Organization.objects.count(), 0)

    def test_public_package_is_recorded(self):
        pkg = SaaSPackage.objects.create(name='Growth', code='growth')
        res = self.auth().post('/api/v1/org/onboarding/', self.payload(package=str(pkg.id)), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(TenantOnboardingRequest.objects.get().package_id, pkg.id)

    def test_private_package_rejected(self):
        pkg = SaaSPackage.objects.create(name='Secret', code='secret', is_public=False)
        res = self.auth().post('/api/v1/org/onboarding/', self.payload(package=str(pkg.id)), format='json')
        self.assertEqual(res.status_code, 400)

    def test_second_pending_request_conflicts(self):
        self.auth().post('/api/v1/org/onboarding/', self.payload(), format='json')
        res = self.auth().post('/api/v1/org/onboarding/', self.payload(org_slug='other'), format='json')
        self.assertEqual(res.status_code, 409)

    def test_taken_slug_rejected(self):
        Tenant.objects.create(name='X', slug='dhaka-net')
        res = self.auth().post('/api/v1/org/onboarding/', self.payload(), format='json')
        self.assertEqual(res.status_code, 400)

    def test_me_lists_request_and_hides_internal_notes(self):
        self.auth().post('/api/v1/org/onboarding/', self.payload(notes='internal-ish'), format='json')
        data = self.auth().get('/api/v1/org/me/').data
        self.assertEqual(len(data['onboarding_requests']), 1)
        item = data['onboarding_requests'][0]
        self.assertEqual(item['status'], 'pending')
        self.assertEqual(item['rejection_reason'], '')
        self.assertNotIn('admin_notes', item)
        req = TenantOnboardingRequest.objects.get()
        req.status, req.admin_notes = 'rejected', 'Missing payment proof'
        req.save()
        item = self.auth().get('/api/v1/org/me/').data['onboarding_requests'][0]
        self.assertEqual(item['rejection_reason'], 'Missing payment proof')

    def test_user_only_sees_own_requests(self):
        self.auth(sub='a', email='a@x.com').post('/api/v1/org/onboarding/', self.payload(), format='json')
        data = self.auth(sub='b', email='b@x.com').get('/api/v1/org/me/').data
        self.assertEqual(data['onboarding_requests'], [])


class TenantSessionTests(NeonAuthTestBase):
    def setUp(self):
        super().setUp()
        self.tenant = Tenant.objects.create(name='Acme ISP', slug='acme', domain='acme.shebafi.xyz')
        self.user = neon_auth.get_or_create_user(neon_auth.verify_neon_token(make_token()))

    def post(self, tenant_id):
        return self.auth().post('/api/v1/org/tenant-session/', {'tenant_id': str(tenant_id)}, format='json')

    def test_requires_login(self):
        self.assertEqual(APIClient().post('/api/v1/org/tenant-session/', {'tenant_id': str(self.tenant.id)}, format='json').status_code, 401)

    def test_no_membership_is_403(self):
        self.assertEqual(self.post(self.tenant.id).status_code, 403)

    def test_inactive_membership_is_403(self):
        StaffMembership.objects.create(user=self.user, tenant=self.tenant, is_active=False)
        self.assertEqual(self.post(self.tenant.id).status_code, 403)

    def test_other_tenant_is_403(self):
        other = Tenant.objects.create(name='Other', slug='other')
        StaffMembership.objects.create(user=self.user, tenant=self.tenant)
        self.assertEqual(self.post(other.id).status_code, 403)

    def test_suspended_tenant_is_403(self):
        StaffMembership.objects.create(user=self.user, tenant=self.tenant)
        Tenant.objects.filter(pk=self.tenant.pk).update(is_active=False)
        self.assertEqual(self.post(self.tenant.id).status_code, 403)

    def test_active_membership_gets_scoped_tenant_session(self):
        StaffMembership.objects.create(user=self.user, tenant=self.tenant)
        res = self.post(self.tenant.id)
        self.assertEqual(res.status_code, 200, res.data)
        sess = resolve_session(res.data['token'])
        self.assertIsNotNone(sess)
        self.assertEqual(sess.user_id, self.user.id)
        self.assertEqual(sess.tenant_id, self.tenant.id)
        self.assertEqual(sess.context_type, CONTEXT_TENANT)
        self.assertEqual(res.data['tenant_slug'], 'acme')

    def test_me_lists_tenants_user_belongs_to(self):
        StaffMembership.objects.create(user=self.user, tenant=self.tenant)
        data = self.auth().get('/api/v1/org/me/').data
        self.assertEqual([t['slug'] for t in data['tenants']], ['acme'])


class ApprovalAuthorizationSyncTests(NeonAuthTestBase):
    def make_request(self, user):
        return TenantOnboardingRequest.objects.create(
            organization_name='Dhaka Broadband', requested_slug='dhaka-net',
            contact_name='Owner', contact_email='owner@example.com', contact_phone='—',
            requested_by=user,
        )

    def test_neon_requester_becomes_org_owner_and_tenant_joins_org(self):
        user = neon_auth.get_or_create_user(neon_auth.verify_neon_token(make_token()))
        tenant = Tenant.objects.create(name='Dhaka Broadband', slug='dhaka-net')
        org = neon_auth.grant_org_ownership(self.make_request(user), tenant)
        tenant.refresh_from_db()
        self.assertEqual(tenant.organization_id, org.id)
        m = OrganizationMembership.objects.get(user=user, organization=org)
        self.assertEqual(m.role, OrganizationMembership.Role.OWNER)
        self.assertTrue(m.is_active)
        # Idempotent: approving a second tenant for the same org name reuses the org.
        t2 = Tenant.objects.create(name='Second', slug='second')
        self.assertEqual(neon_auth.grant_org_ownership(self.make_request(user), t2).id, org.id)
        self.assertEqual(Organization.objects.count(), 1)

    def test_non_neon_requester_is_untouched(self):
        legacy = User.objects.create_user('isp_user', 'i@x.com', 'pw')
        tenant = Tenant.objects.create(name='T', slug='t')
        self.assertIsNone(neon_auth.grant_org_ownership(self.make_request(legacy), tenant))
        self.assertEqual(Organization.objects.count(), 0)

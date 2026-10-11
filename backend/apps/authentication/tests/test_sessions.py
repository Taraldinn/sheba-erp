"""
apps/authentication/tests_sessions.py — AuthSession model + login/logout.

Tests the four things the tenant-conflict complaints are about:

  1. Login mints a session, not a global Token. Same user logging in
     twice ends up with two distinct session rows (no shared state).
  2. Logout revokes only the *current* session, not every Token.
  3. Cross-tenant session use is rejected at the auth class.
  4. Reseller login is segregated from staff login.
"""
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.authentication.models import Reseller, StaffMembership
from apps.authentication.sessions import (
    CONTEXT_CENTRAL_ADMIN,
    CONTEXT_RESELLER,
    CONTEXT_TENANT,
    AuthSession,
    issue_session,
    resolve_session,
    revoke_session,
)
from apps.authentication.views import LoginView, LogoutView, ResellerLoginView
from apps.core.models import Tenant, TenantDomain
from rest_framework.authtoken.models import Token


def _make_tenant(slug, name='TestNet'):
    return Tenant.objects.create(
        name=name, slug=slug, is_active=True,
        subscription_status='active',
    )


def _attach_domain(tenant, hostname):
    return TenantDomain.objects.create(
        tenant=tenant, hostname=hostname,
        is_primary=True, is_active=True, verified=True,
        verification_method='platform_subdomain',
    )


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class AuthSessionIssuanceTests(TestCase):
    def setUp(self):
        self.tenant_a = _make_tenant('alpha', name='AlphaNet')
        _attach_domain(self.tenant_a, 'alpha.shebafi.xyz')
        self.tenant_b = _make_tenant('bravo', name='BravoNet')
        _attach_domain(self.tenant_b, 'bravo.shebafi.xyz')
        self.user = User.objects.create_user(
            username='admin', password='x', is_staff=True
        )

    def test_login_mints_a_session_row_per_call(self):
        # Two logins for the same user must produce two active sessions.
        s1 = issue_session(user=self.user, tenant_id=str(self.tenant_a.id),
                           context_type=CONTEXT_TENANT)
        s2 = issue_session(user=self.user, tenant_id=str(self.tenant_a.id),
                           context_type=CONTEXT_TENANT)
        self.assertEqual(
            AuthSession.objects.filter(user=self.user, revoked_at__isnull=True)
            .count(),
            2,
        )
        self.assertNotEqual(s1.token, s2.token)
        self.assertTrue(resolve_session(s1.token) is not None)

    def test_logout_revokes_only_current_session(self):
        s1 = issue_session(user=self.user, tenant_id=str(self.tenant_a.id),
                           context_type=CONTEXT_TENANT)
        s2 = issue_session(user=self.user, tenant_id=str(self.tenant_a.id),
                           context_type=CONTEXT_TENANT)
        revoke_session(s1.token)
        # s1 is gone
        self.assertIsNone(resolve_session(s1.token))
        # s2 still works
        self.assertIsNotNone(resolve_session(s2.token))


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class StaffLoginEndToEndTests(TestCase):
    def setUp(self):
        self.client_ = APIClient()
        self.tenant = _make_tenant('alpharun', name='AlphaRun')
        _attach_domain(self.tenant, 'alpharun.shebafi.xyz')

        self.user = User.objects.create_user(
            username='staff_alpha', password='StrongP@ss1', is_staff=True
        )
        StaffMembership.objects.create(
            user=self.user, tenant=self.tenant, role=None, is_active=True,
            scope='tenant',
        )
        self.headers = {
            'HTTP_HOST': 'alpharun.shebafi.xyz',
        }

    def test_staff_login_returns_session_token_and_sets_cookie(self):
        resp = self.client_.post(
            '/api/v1/auth/login/',
            data={'username': 'staff_alpha', 'password': 'StrongP@ss1'},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertIn('token', body)
        self.assertEqual(body['session_context'], 'tenant')
        # A Set-Cookie for sheba_session must be present.
        set_cookie = resp.get('Set-Cookie', '')
        self.assertIn('sheba_session', set_cookie)
        self.assertIn('HttpOnly', set_cookie)
        # Resolved server-side
        self.assertIsNotNone(resolve_session(body.get('session_token') or body['token']))

    def test_staff_logout_revokes_only_current_session(self):
        # Two logins -> two sessions.
        first = self.client_.post(
            '/api/v1/auth/login/',
            data={'username': 'staff_alpha', 'password': 'StrongP@ss1'},
            content_type='application/json', **self.headers,
        ).json()
        second = self.client_.post(
            '/api/v1/auth/login/',
            data={'username': 'staff_alpha', 'password': 'StrongP@ss1'},
            content_type='application/json', **self.headers,
        ).json()
        self.assertEqual(
            AuthSession.objects.filter(
                user=self.user, revoked_at__isnull=True
            ).count(),
            2,
        )
        # Logout using the first session's token.
        auth_client = APIClient()
        auth_client.credentials(
            HTTP_AUTHORIZATION=f'Session {first["session_token"]}',
            HTTP_HOST='alpharun.shebafi.xyz',
        )
        out = auth_client.post('/api/v1/auth/logout/')
        self.assertEqual(out.status_code, 200, out.content)
        # First session revoked, second alive.
        self.assertIsNone(resolve_session(first['token']))
        self.assertIsNotNone(resolve_session(second['session_token']))


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class ResellerLoginTests(TestCase):
    def setUp(self):
        self.client_ = APIClient()
        self.tenant = _make_tenant('alphare', name='AlphaRE')
        _attach_domain(self.tenant, 'alphare.shebafi.xyz')
        self.user = User.objects.create_user(
            username='rev_queenie', password='StrongP@ss1',
        )
        self.reseller = Reseller.objects.create(
            user=self.user, tenant=self.tenant,
            business_name='Queen Internet', is_active=True,
        )

    def test_reseller_login_works_for_reseller_user(self):
        resp = self.client_.post(
            '/api/v1/auth/reseller/login/',
            data={'username': 'rev_queenie', 'password': 'StrongP@ss1'},
            content_type='application/json',
            HTTP_HOST='alphare.shebafi.xyz',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertEqual(body['session_context'], 'reseller')
        self.assertEqual(body['user']['role'], 'RESELLER')

    def test_non_reseller_user_cannot_use_reseller_login(self):
        outsider = User.objects.create_user(
            username='regular', password='StrongP@ss1',
        )
        resp = self.client_.post(
            '/api/v1/auth/reseller/login/',
            data={'username': 'regular', 'password': 'StrongP@ss1'},
            content_type='application/json',
            HTTP_HOST='alphare.shebafi.xyz',
        )
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertEqual(resp.json()['code'], 'NOT_A_RESELLER')


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class CrossTenantSessionGuardTests(TestCase):
    """Cross-context / cross-tenant token smuggling must fail at the
    auth class before reaching the view."""

    def setUp(self):
        self.client_ = APIClient()
        self.alpha = _make_tenant('sigma')
        _attach_domain(self.alpha, 'sigma.shebafi.xyz')
        self.bravo = _make_tenant('tau')
        _attach_domain(self.bravo, 'tau.shebafi.xyz')
        self.user = User.objects.create_user(
            username='spy', password='x', is_staff=True,
        )
        # Active membership in alpha only.
        StaffMembership.objects.create(
            user=self.user, tenant=self.alpha,
            role=None, is_active=True, scope='tenant',
        )

    def test_session_issued_for_alpha_rejected_on_bravo_host(self):
        issued = issue_session(
            user=self.user, tenant_id=str(self.alpha.id),
            context_type=CONTEXT_TENANT,
        )
        rogue = APIClient()
        rogue.credentials(
            HTTP_AUTHORIZATION=f'Session {issued.token}',
            HTTP_HOST='tau.shebafi.xyz',
        )
        out = rogue.get('/api/v1/customers/')
        self.assertIn(out.status_code, (401, 403))
        if out.status_code == 401:
            self.assertEqual(out.json().get('code'), 'CROSS_TENANT_SESSION')


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class CentralAdminSessionTests(TestCase):
    """Central admin sessions are tenant-less and must be rejected
    from tenant-staff endpoints."""

    def setUp(self):
        self.client_ = APIClient()
        self.user = User.objects.create_superuser(
            username='adminhead', password='x', email='a@b.c',
        )

    def test_saas_login_marks_session_as_central_admin(self):
        resp = self.client_.post(
            '/api/v1/saas/auth/login/',
            data={'username': 'adminhead', 'password': 'x'},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertEqual(body['session_context'], 'central_admin')
        # Resolved
        self.assertIsNotNone(resolve_session(body.get('session_token') or body['token']))

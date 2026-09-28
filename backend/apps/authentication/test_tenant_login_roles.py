"""
apps/authentication/test_tenant_login_roles.py
================================================
Multi-role login coverage for tenant subdomain ``*.shebafi.xyz``.

Every ISP (tenant) has four classes of users that hit the SAME
``/api/v1/auth/login/`` endpoint — the role is decided by their
``StaffMembership.role`` (staff / technician / reseller / customer
support) or ``UserRole.CUSTOMER`` for the self-care portal:

    * Staff        -> ``/dashboards/staff``       (role=STAFF)
    * Technician   -> ``/dashboards/technician``  (role=TECHNICIAN)
    * Reseller     -> ``/dashboards/reseller-l1`` (role=RESELLER / RESELLER_L1)
    * Admin        -> ``/``                       (role=ADMIN)
    * Customer     -> ``/portal``                 (seperate endpoint)

The login URL is the same — ``/api/v1/auth/login/`` — and the backend
tenant resolver picks the tenant from ``Host: <slug>.shebafi.xyz``.
Only the redirect URL differs (this is what the frontend uses to
choose the right landing page after the auth flow).
"""

from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from django.test import TestCase

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import (
    StaffProfile,
    StaffMembership,
    UserRole,
)


def _make_tenant(slug, hostname=None):
    tenant = Tenant.objects.create(
        name=f'{slug.title()} ISP',
        slug=slug,
        is_active=True,
    )
    TenantDomain.objects.create(
        tenant=tenant,
        hostname=hostname or f'{slug}.shebafi.xyz',
        is_active=True,
        is_primary=True,
    )
    return tenant


def _make_user(
    tenant,
    username,
    role,
    password='password123',
):
    user = User.objects.create_user(
        username=username,
        password=password,
        email=f'{username}@{tenant.slug}.test',
    )
    StaffProfile.objects.create(
        user=user,
        tenant=tenant,
        role=role,
    )
    # signal may already have created a membership at this stage;
    # update instead of create to keep things idempotent.
    StaffMembership.objects.update_or_create(
        user=user,
        tenant=tenant,
        defaults={'is_active': True, 'role': None},
    )
    return user


class TenantLoginRoleRoutingTests(TestCase):
    """
    Verifies that on a tenant subdomain, the four classes of users
    (admin / staff / technician / reseller) can all hit
    ``/api/v1/auth/login/`` and the backend returns the right
    ``dashboard_url`` for each so the frontend can land them on the
    role-specific dashboard.
    """

    def setUp(self):
        self.client = APIClient()
        self.tenant = _make_tenant('exportnet')
        self.admin = _make_user(self.tenant, 'admin', UserRole.ADMIN)
        self.staff = _make_user(self.tenant, 'staff1', UserRole.STAFF)
        self.tech = _make_user(self.tenant, 'tech1', UserRole.TECHNICIAN)
        self.reseller = _make_user(self.tenant, 'rseller', UserRole.RESELLER)

    def _login(self, username, password='password123'):
        return self.client.post(
            '/api/v1/auth/login/',
            {'username': username, 'password': password},
            HTTP_HOST='exportnet.shebafi.xyz',
        )

    # ---------- happy paths ----------

    def test_admin_login_returns_root_redirect(self):
        res = self._login('admin')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['role'], UserRole.ADMIN)
        self.assertEqual(res.data['dashboard_url'], '/')
        self.assertIn('session_token', res.data)
        # tenant context comes back populated so the frontend can
        # double-check before storing the token.
        self.assertEqual(res.data['tenant']['slug'], 'exportnet')

    def test_staff_login_returns_staff_dashboard(self):
        res = self._login('staff1')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['role'], UserRole.STAFF)
        self.assertEqual(res.data['dashboard_url'], '/dashboards/staff')

    def test_technician_login_returns_technician_dashboard(self):
        """Field / NOC technician gets a dedicated dashboard so they
        only see the tickets + network gear they need — not the
        billing module. Same login endpoint, role decides."""
        res = self._login('tech1')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['role'], UserRole.TECHNICIAN)
        self.assertEqual(res.data['dashboard_url'], '/dashboards/technician')

    def test_reseller_login_returns_reseller_dashboard(self):
        """Reseller (sub-ISP partner) sees the reseller dashboard for
        sub-customer management + bandwidth credit ledger."""
        res = self._login('rseller')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['role'], UserRole.RESELLER)
        self.assertEqual(
            res.data['dashboard_url'], '/dashboards/reseller-l1'
        )

    # ---------- misrouting guards ----------

    def test_user_from_other_tenant_cannot_login_here(self):
        """A user registered against another tenant must NOT be able to
        log in to exportnet.shebafi.xyz — that's the cross-tenant
        guard the login middleware enforces."""
        _make_user(
            _make_tenant('othernet'),
            'other_staff',
            UserRole.STAFF,
        )
        res = self._login('other_staff')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data.get('code'), 'CROSS_TENANT_LOGIN')

    def test_invalid_password_rejected(self):
        res = self._login('staff1', password='wrong')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data.get('code'), 'INVALID_CREDENTIALS')

    def test_unknown_host_without_tenant_is_rejected(self):
        """A login attempt hitting a hostname the backend has no
        tenant record for cannot leak the existence of cross-tenant
        accounts."""
        res = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'staff1', 'password': 'password123'},
            HTTP_HOST='random-host.shebafi.xyz',
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        # Either NO_TENANT_CONTEXT or CROSS_TENANT_LOGIN — both are
        # correct defensives; we don't assert the specific code.

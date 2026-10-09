"""
Shared helpers for ISP Admin Dashboard tests.
"""
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token

from apps.authentication.models import (
    StaffMembership,
    StaffProfile,
    UserRole,
)
from apps.authentication.services.rbac import seed_default_roles_for_tenant
from apps.core.models import Tenant, TenantDomain


# The admin dashboard lives under the SaaS subscriber (parent) tenant's
# own hostname. Using an "admin.*" host would be treated as the central
# control plane by TenantResolutionMiddleware, so we resolve to the
# parent tenant's primary domain instead. RFC 1035-compatible hostnames
# must NOT contain underscores, so we use hyphens.
ADMIN_HOST = 'parent-isp.shebafi.xyz'


def make_parent_tenant(slug='parent-isp', name='Parent ISP Ltd'):
    """Create a top-level SaaS subscriber (parent) tenant."""
    tenant = Tenant.objects.create(
        name=name,
        slug=slug,
        domain=f'{slug}.shebafi.xyz',
        contact_email='admin@parent-isp.net',
        contact_phone='+880 1711-223344',
        plan='Growth',
        max_subscribers=2000,
        max_routers=20,
        is_active=True,
        parent_tenant=None,
    )
    TenantDomain.objects.create(
        tenant=tenant,
        hostname=f'{slug}.shebafi.xyz',
        is_primary=True,
        is_active=True,
        verified=True,
    )
    seed_default_roles_for_tenant(tenant)
    return tenant


def make_child_tenant(parent, slug='child-branch', name='Child Branch ISP'):
    """Create a child tenant directly (without admin user)."""
    child = Tenant.objects.create(
        name=name,
        slug=slug,
        plan=parent.plan,
        max_subscribers=max(1, parent.max_subscribers // 4),
        max_routers=max(1, parent.max_routers // 4),
        is_active=True,
        parent_tenant=parent,
    )
    seed_default_roles_for_tenant(child)
    return child


def make_admin_user(tenant, username='isp-admin', email=None,
                    password='AdminPass123!'):
    """
    Create an authoritative Admin user for the given tenant.

    The ``post_save`` signal on ``StaffProfile`` auto-creates the matching
    ``StaffMembership``, so we only need to provision the User + StaffProfile.
    """
    user = User.objects.create_user(
        username=username,
        email=email or f'{username}@{tenant.slug}.net',
        password=password,
        is_staff=True,
        is_superuser=False,
    )
    StaffProfile.objects.create(
        user=user,
        tenant=tenant,
        role=UserRole.ADMIN,
        is_active=True,
    )
    # Signal ensures the StaffMembership row exists; re-fetch the admin role.
    membership = StaffMembership.objects.get(user=user, tenant=tenant)
    if membership.role is None or membership.role.name != 'Admin':
        admin_role = tenant.roles.filter(name='Admin').first()
        if admin_role is not None:
            membership.role = admin_role
            membership.scope = StaffMembership.Scope.TENANT
            membership.is_active = True
            membership.save()
    return user


def make_non_admin_user(tenant, username='field-tech',
                        password='TechPass123!'):
    """
    Create a non-admin staff user for permission-denial tests.

    Mirrors :func:`make_admin_user` — relies on the StaffProfile post_save
    signal to create the matching StaffMembership.
    """
    user = User.objects.create_user(
        username=username,
        email=f'{username}@{tenant.slug}.net',
        password=password,
        is_staff=True,
        is_superuser=False,
    )
    StaffProfile.objects.create(
        user=user, tenant=tenant,
        role=UserRole.LINE_MAN, is_active=True,
    )
    return user


def token_for(user):
    """Return (or create) the DRF auth token for ``user``."""
    token, _ = Token.objects.get_or_create(user=user)
    return token
"""
Business-logic helpers for the ISP Admin Dashboard.
"""
import logging
from typing import Tuple

from django.contrib.auth.models import User
from django.db import transaction
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ValidationError

from apps.core.cache_invalidation import invalidate_saas_tenant_cache
from apps.core.models import AuditLog, Tenant, TenantDomain
from apps.core.saas_views import provision_tenant_admin

logger = logging.getLogger(__name__)


def create_child_tenant(
    *,
    parent_tenant: Tenant,
    name: str,
    slug: str,
    admin_username: str,
    admin_password: str,
    admin_email: str = '',
    admin_phone: str = '',
    admin_first_name: str = '',
    admin_last_name: str = '',
    domain: str = '',
) -> Tuple[User, Tenant]:
    """
    Create a child Tenant + its authoritative ISP Admin under the parent.

    Reuses ``provision_tenant_admin()`` to guarantee role seeding,
    StaffProfile creation, and StaffMembership wiring. The parent must be a
    top-level SaaS subscriber (``parent_tenant IS NULL``).
    """
    if parent_tenant.is_child_tenant:
        raise ValidationError({
            'detail': (
                'Only a parent (SaaS subscriber) tenant may provision '
                'further tenants.'
            ),
        })

    if Tenant.objects.filter(slug=slug).exists():
        raise ValidationError({
            'slug': 'A tenant with that slug already exists.',
        })

    with transaction.atomic():
        # Split quotas conservatively so the parent can't be exhausted by a
        # single child. Floor 1 keeps the child usable.
        child = Tenant.objects.create(
            name=name,
            slug=slug,
            parent_tenant=parent_tenant,
            plan=parent_tenant.plan,
            max_subscribers=max(1, parent_tenant.max_subscribers // 4),
            max_routers=max(1, parent_tenant.max_routers // 4),
            contact_email=admin_email or parent_tenant.contact_email,
            contact_phone=admin_phone or parent_tenant.contact_phone,
            is_active=True,
        )

        if domain:
            TenantDomain.objects.create(
                tenant=child,
                hostname=domain.strip().lower(),
                is_primary=True,
                domain_type=TenantDomain.DomainType.PRIMARY,
            )

        admin_user = provision_tenant_admin(
            tenant=child,
            username=admin_username,
            password=admin_password,
            email=admin_email,
            phone=admin_phone,
            first_name=admin_first_name,
            last_name=admin_last_name,
        )

        AuditLog.objects.create(
            tenant=parent_tenant,
            actor_username='system',
            action='child_tenant_provisioned',
            module='admin_panel',
            resource_type='Tenant',
            resource_id=str(child.id),
            details={
                'parent_tenant_id': str(parent_tenant.id),
                'child_tenant_id': str(child.id),
                'child_slug': child.slug,
                'admin_username': admin_username,
            },
        )

    invalidate_saas_tenant_cache(
        tenant_id=str(child.id), slug=child.slug,
    )
    return admin_user, child


def impersonate_child_admin(
    *,
    parent_tenant: Tenant,
    child_tenant_id: str,
    actor_user: User,
) -> dict:
    """
    Issue (or refresh) a DRF auth token for the authoritative admin of a
    child tenant so the parent admin can operate the child tenant's core
    app on the parent's behalf.

    Returns: ``{token, tenant_slug, tenant_id, admin_username}``.
    """
    from apps.authentication.models import StaffMembership

    if parent_tenant.is_child_tenant:
        raise ValidationError({
            'detail': 'Impersonation is only allowed from a parent tenant.',
        })

    child = Tenant.objects.filter(
        id=child_tenant_id, parent_tenant=parent_tenant,
    ).first()
    if child is None:
        raise ValidationError({
            'detail': 'Child tenant not found under this parent.',
        })

    membership = (
        StaffMembership.objects
        .filter(
            tenant=child, is_active=True,
            role__name__in=['Admin', 'ADMIN'],
        )
        .select_related('user', 'tenant')
        .first()
    )
    if membership is None or not membership.user.is_active:
        raise ValidationError({
            'detail': 'No active admin membership on child tenant.',
        })

    token, _ = Token.objects.get_or_create(user=membership.user)

    AuditLog.objects.create(
        tenant=parent_tenant,
        actor_username=getattr(actor_user, 'username', 'system'),
        action='impersonate_child_admin',
        module='admin_panel',
        resource_type='Tenant',
        resource_id=str(child.id),
        details={
            'parent_tenant_id': str(parent_tenant.id),
            'child_tenant_id': str(child.id),
            'child_admin_id': membership.user.id,
            'child_admin_username': membership.user.username,
        },
    )

    return {
        'token': token.key,
        'tenant_slug': child.slug,
        'tenant_id': str(child.id),
        'admin_username': membership.user.username,
    }

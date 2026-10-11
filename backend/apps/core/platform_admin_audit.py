"""
platform_admin_audit.py — Phase 1.5 of the SaaS Owner Admin Panel plan.

Consistent AuditLog emission for any control-plane (saas/*) write performed
by a platform admin or superuser. Existing audit calls in saas_views.py
already cover the core fields; this helper adds the platform-admin-specific
columns (actor_platform_admin_id, actor_role) and ensures request_id / ip
are always populated.

Use:

    from apps.core.platform_admin_audit import log_platform_admin_action

    log_platform_admin_action(
        request,
        action='tenant.suspend',
        module='saas.tenants',
        resource_type='Tenant',
        resource_id=str(tenant.id),
        before={'is_active': True},
        after={'is_active': False},
    )

The helper is safe to call even when no platform admin is on the request
(plain superuser): it records `actor_role='SUPERUSER'` and
`actor_platform_admin_id=None`. It never raises — audit emission must not
break the user-facing request.
"""

import logging
import uuid as _uuid

from apps.core.models import AuditLog

logger = logging.getLogger(__name__)


def _resolve_actor(request):
    """Pull PlatformAdmin role (if any) and user off the request."""
    user = getattr(request, 'user', None)
    pa = getattr(request, 'platform_admin', None)
    role = None
    pa_id = None
    if pa is not None:
        role = pa.role
        pa_id = pa.id
    elif user is not None and getattr(user, 'is_superuser', False):
        role = 'SUPERUSER'
    return user, role, pa_id


def _client_ip(request):
    fwd = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if fwd:
        return fwd.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def log_platform_admin_action(
    request,
    *,
    action,
    module,
    resource_type='',
    resource_id='',
    tenant=None,
    before=None,
    after=None,
    details=None,
    target_id=None,
):
    """Write one AuditLog row. Never raises — failures are logged, not propagated."""
    try:
        user, role, pa_id = _resolve_actor(request)
        actor_username = (
            user.get_username() if user is not None and user.is_authenticated else 'system'
        )
        request_id = (
            request.META.get('HTTP_X_REQUEST_ID')
            or request.META.get('X_REQUEST_ID')
            or str(_uuid.uuid4())
        )
        AuditLog.objects.create(
            tenant=tenant,
            actor_username=actor_username,
            action=action,
            module=module,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else '',
            request_id=request_id,
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:1024],
            before=before or {},
            after=after or {},
            target_id=str(target_id) if target_id is not None else (str(resource_id) if resource_id else ''),
            ip_address=_client_ip(request),
            details={
                **(details or {}),
                'actor_platform_admin_id': str(pa_id) if pa_id else None,
                'actor_role': role,
            },
        )
    except Exception as exc:  # pragma: no cover - never break user requests on audit failure
        logger.warning("log_platform_admin_action failed: %s", exc, exc_info=True)

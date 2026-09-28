"""
Feature-gating helpers — the bridge between :mod:`apps.core.features` and the
rest of the codebase.

Three forms of integration:

  1. DRF view decorator:
        @api_view(['POST'])
        @require_feature('ip_phone.epbx')
        def click_to_call(request):
            ...

  2. Service-layer guard:
        def send_invoice_sms(customer, message):
            assert_feature_enabled(customer.tenant, 'sms.billing')
            ...

  3. Celery task decorator:
        @shared_task
        @gate_celery_task('billing.late_fees')
        def apply_late_fees_daily(self=None):
            ...

For DRF decorators we return ``403`` with a stable payload that the SaaS
admin dashboard can read and surface.
"""
from __future__ import annotations

import functools
import logging
from typing import Callable

from rest_framework import status
from rest_framework.response import Response

from .features import (
    FEATURE_REGISTRY,
    invalidate_cache,
    is_feature_enabled,
    is_feature_enabled_cached,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Public helpers
# ─────────────────────────────────────────────────────────────────────────────


def assert_feature_enabled(tenant, key: str) -> None:
    """Raise ``FeatureDisabledError`` if the feature is off for this tenant.

    Use in service-layer code (anything that doesn't have access to the
    DRF request lifecycle).
    """
    if not is_feature_enabled(tenant, key):
        spec = FEATURE_REGISTRY.get(key)
        label = spec.label if spec else key
        raise FeatureDisabledError(
            key=key,
            label=label,
            message=(
                f"Feature '{label}' is disabled for this tenant. "
                'Ask the platform administrator to enable it.'
            ),
        )


def is_feature_enabled_fast(tenant, key: str) -> bool:
    """Cached lookup — safe for hot paths."""
    return is_feature_enabled_cached(tenant, key)


# ─────────────────────────────────────────────────────────────────────────────
# Errors
# ─────────────────────────────────────────────────────────────────────────────


class FeatureDisabledError(Exception):
    def __init__(self, key: str, label: str, message: str):
        self.key = key
        self.label = label
        super().__init__(message)


# ─────────────────────────────────────────────────────────────────────────────
# Decorators
# ─────────────────────────────────────────────────────────────────────────────


def require_feature(key: str) -> Callable:
    """DRF view decorator that rejects the call when the tenant has the
    given feature disabled. The tenant is resolved via
    ``request.tenant`` (set by tenant middleware).

    Usage:
        @api_view(['POST'])
        @permission_classes([IsAuthenticated, IsTenantMember])
        @require_feature('ip_phone.epbx')
        def click_to_call(request):
            ...

    The decorator must run AFTER ``permission_classes`` so the request is
    authenticated first. Order it last in your decorator stack.
    """
    def deco(view: Callable) -> Callable:
        @functools.wraps(view)
        def wrapper(request, *args, **kwargs):
            tenant = getattr(request, 'tenant', None)
            if tenant is None:
                return Response(
                    {
                        'error': 'tenant context missing',
                        'code': 'TENANT_NOT_FOUND',
                        'feature_key': key,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not is_feature_enabled_fast(tenant, key):
                spec = FEATURE_REGISTRY.get(key)
                logger.info(
                    'feature_gate.reject tenant=%s feature=%s',
                    getattr(tenant, 'slug', '?'), key,
                )
                return Response(
                    {
                        'error': (
                            (spec.label if spec else key)
                            + ' is disabled for this tenant.'
                        ),
                        'code': 'FEATURE_DISABLED',
                        'feature_key': key,
                        'feature_label': spec.label if spec else key,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            return view(request, *args, **kwargs)
        return wrapper
    return deco


def gate_celery_task(key: str, *, fail_silently: bool = True) -> Callable:
    """Celery task decorator — short-circuits the task when the feature is
    disabled for *every* tenant. Used by per-tenant cron jobs whose work
    is meaningless without the feature flag.

    The decorator walks every active tenant and checks ``is_feature_enabled``
    for each. If every tenant has the feature off, the task logs a skip and
    returns ``{'skipped': True, 'reason': 'feature_disabled', ...}``.

    For multi-tenant tasks that operate on individual rows, prefer
    :func:`assert_feature_enabled` inside the per-tenant loop instead.
    """
    def deco(task: Callable) -> Callable:
        @functools.wraps(task)
        def wrapper(*args, **kwargs):
            from apps.core.models import Tenant
            tenants = Tenant.objects.filter(is_active=True)
            enabled_tenants = [
                t for t in tenants if is_feature_enabled_fast(t, key)
            ]
            if not enabled_tenants:
                spec = FEATURE_REGISTRY.get(key)
                logger.info(
                    'feature_gate.task_skip task=%s feature=%s',
                    getattr(task, 'name', task.__name__), key,
                )
                return {
                    'skipped': True,
                    'reason': 'feature_disabled',
                    'feature_key': key,
                    'feature_label': spec.label if spec else key,
                    'enabled_tenants': 0,
                }
            # Inject the list of enabled tenants into kwargs for the
            # underlying task so it can iterate only those.
            kwargs.setdefault('_enabled_tenants', enabled_tenants)
            return task(*args, **kwargs)
        return wrapper
    return deco


# ─────────────────────────────────────────────────────────────────────────────
# Admin helpers
# ─────────────────────────────────────────────────────────────────────────────


def enabled_features_for(tenant) -> list[dict]:
    """Snapshot of every feature and its effective state for the tenant.

    Used by SaaS admin views to render the matrix without going to the DB
    per-row. Returns ``[{key, label, enabled, is_override}]``.
    """
    from apps.core.models import TenantFeatureFlag
    rows = []
    overrides = {
        f.feature_key: f for f in TenantFeatureFlag.objects.filter(tenant=tenant)
    }
    for spec in FEATURE_REGISTRY.values():
        flag = overrides.get(spec.key)
        rows.append({
            'key': spec.key,
            'label': spec.label,
            'category': spec.category,
            'enabled': flag.enabled if flag else spec.default_enabled,
            'is_override': bool(flag),
            'config': flag.config if flag else {},
            'paid': spec.paid,
        })
    return rows


def invalidate_tenant_feature_cache(tenant) -> None:
    invalidate_cache(tenant)

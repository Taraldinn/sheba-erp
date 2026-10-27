"""
apps/core/tenancy — Reusable Tenant Base Layer (Plan Phase 5)

Provides:
  - TenantScopedManager: auto-filters querysets by tenant
  - TenantScopedViewSetMixin: enforces tenant scoping in ViewSets
  - TenantScopedSerializerMixin: injects request.tenant on create
  - Custom exceptions: TenantNotFound, TenantInactive
"""
from .exceptions import TenantNotFound, TenantInactive
from .managers import TenantScopedManager
from .mixins import TenantScopedViewSetMixin, TenantScopedSerializerMixin

__all__ = [
    'TenantNotFound',
    'TenantInactive',
    'TenantScopedManager',
    'TenantScopedViewSetMixin',
    'TenantScopedSerializerMixin',
]

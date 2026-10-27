"""
Composite permission for the ISP Admin Dashboard namespace.

The dashboard lives ONLY at the SaaS-subscriber (parent tenant) level.
Child tenants must use the core /api/v1/* namespace, not /api/v1/admin/*.
"""
from rest_framework import permissions

from apps.core.permissions import IsAdminOrManager, IsTenantMember


class IsIspAdminDashboard(IsTenantMember):
    """
    Combines:
      - ``IsTenantMember``  — authenticated staff membership in request.tenant
      - ``IsAdminOrManager`` — Admin / Managing Director role
      - parent-only check   — the request tenant must be the SaaS subscriber
                              (i.e. ``parent_tenant IS NULL``).
    """

    message = (
        'ISP admin dashboard is only available to the Admin / Managing Director '
        'of a top-level SaaS subscriber tenant.'
    )

    def has_permission(self, request, view):
        if not IsTenantMember().has_permission(request, view):
            return False
        if not IsAdminOrManager().has_permission(request, view):
            return False
        tenant = getattr(request, 'tenant', None)
        if tenant is None or tenant.is_child_tenant:
            self.message = (
                'ISP admin dashboard is only available at the SaaS-subscriber '
                '(parent) tenant level. Child tenants must use the core '
                '/api/v1/* endpoints.'
            )
            return False
        return True

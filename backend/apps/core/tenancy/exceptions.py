"""
Custom exceptions for tenant resolution failures (Plan Phase 5).
All exceptions render structured JSON responses.
"""
from django.http import JsonResponse


class TenantNotFound(Exception):
    """Raised when a domain does not resolve to any known tenant."""

    def __init__(self, hostname: str = ''):
        self.hostname = hostname
        super().__init__(f'No active tenant for domain: {hostname}')

    def as_response(self) -> JsonResponse:
        return JsonResponse({
            'error': f'Unrecognized ISP domain: "{self.hostname}". No active tenant configured.',
            'code': 'TENANT_NOT_FOUND',
        }, status=404)


class TenantInactive(Exception):
    """Raised when the resolved tenant exists but is suspended/inactive."""

    def __init__(self, tenant_name: str = ''):
        self.tenant_name = tenant_name
        super().__init__(f'Tenant is inactive: {tenant_name}')

    def as_response(self) -> JsonResponse:
        return JsonResponse({
            'error': f'ISP tenant "{self.tenant_name}" is suspended or inactive.',
            'code': 'TENANT_INACTIVE',
        }, status=403)


class TenantContextMissing(Exception):
    """
    Raised inside ViewSets or services when request.tenant is unexpectedly None.
    This should NEVER reach the client — it indicates a middleware misconfiguration.
    """
    pass

import uuid
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.conf import settings
from django.utils.deprecation import MiddlewareMixin
from .models import Tenant, TenantDomain


class TenantResolutionMiddleware(MiddlewareMixin):
    """
    Domain-Based Tenant Resolution Middleware (Plan Phase B / Phase 4).

    Resolution priority:
      1. TenantDomain table (hostname exact match, active only)
      2. Tenant.domain legacy field exact match
      3. Subdomain slug match against Tenant.slug
      4. localhost / 127.0.0.1 / testserver dev fallback

    Control plane:
      admin.* domains → request.is_control_plane = True, request.tenant = None

    Security rules:
      - Client CANNOT switch tenant via body/query/header
      - Unknown domains on business APIs → 404 TENANT_NOT_FOUND
      - Suspended tenants on business APIs → 403 TENANT_INACTIVE
    """

    PUBLIC_PATHS = (
        '/healthz/',
        '/api/v1/health-check/',
        '/api/v1/auth/',
        '/api/v1/saas/',
        '/api/schema/',
        '/api/docs/',
        '/api/redoc/',
        '/admin/',
    )

    CONTROL_PLANE_PREFIXES = ('admin.', 'control.', 'saas.')

    def _is_public(self, path):
        return path in ('', '/') or any(path.startswith(p) for p in self.PUBLIC_PATHS)

    def process_request(self, request):
        path = request.path_info
        raw_host = request.get_host().split(':')[0].lower()

        # Reset per-request attributes
        request.tenant = None
        request.is_control_plane = False

        # 1. Root API landing, healthz, & SaaS paths — bypass tenant resolution
        if path in ('', '/') or path.startswith('/healthz/'):
            return None

        if path.startswith('/api/v1/saas/'):
            request.is_control_plane = True
            return None

        # 2. Central Control Plane domain identification
        control_domains = getattr(
            settings,
            'CONTROL_PLANE_DOMAINS',
            [
                'admin.shebafi.com', 'admin.shebafi.xyz', 'control.shebafi.xyz',
                'admin.localhost', 'saas.localhost', 'admin.localhost.com',
                'control.localhost.com', 'saas.localhost.com'
            ]
        )
        if raw_host.startswith(self.CONTROL_PLANE_PREFIXES) or raw_host in control_domains:
            request.is_control_plane = True
            return None

        # 3. Domain-based resolution (multi-stage)
        tenant = None

        # A. TenantDomain table — preferred (Plan Phase 4)
        try:
            domain_record = (
                TenantDomain.objects
                .select_related('tenant')
                .filter(hostname__iexact=raw_host, is_active=True)
                .first()
            )
            if domain_record:
                tenant = domain_record.tenant
        except Exception:
            pass  # Table may not exist yet during first migration

        # B. Legacy Tenant.domain field fallback
        if not tenant:
            try:
                tenant = Tenant.objects.filter(domain__iexact=raw_host).first()
            except Exception:
                pass

        # C. Subdomain slug match (e.g., fardin.shebafi.com -> slug="fardin")
        if not tenant:
            parts = raw_host.split('.')
            if len(parts) >= 2 and parts[0] not in ('www', 'api', 'localhost', '127', 'testserver'):
                subdomain = parts[0]
                try:
                    tenant = Tenant.objects.filter(slug__iexact=subdomain).first()
                except Exception:
                    pass

        # D. Localhost / 127.0.0.1 development fallback (active only in local mode)
        if not tenant and raw_host in ('localhost', '127.0.0.1') and getattr(settings, 'IS_LOCAL', False):
            try:
                tenant = Tenant.objects.filter(is_active=True).first()
            except Exception:
                pass

        # 4. Tenant status check
        if tenant:
            if not tenant.is_active:
                if not self._is_public(path):
                    return JsonResponse({
                        'error': f'ISP tenant "{tenant.name}" is suspended or inactive.',
                        'code': 'TENANT_INACTIVE'
                    }, status=403)
            request.tenant = tenant
            return None

        # 5. Unknown domain / missing tenant — allow public paths, reject business APIs
        if self._is_public(path):
            return None

        return JsonResponse({
            'error': f'Unrecognized ISP domain: "{raw_host}". No active tenant configured.',
            'code': 'TENANT_NOT_FOUND'
        }, status=404)

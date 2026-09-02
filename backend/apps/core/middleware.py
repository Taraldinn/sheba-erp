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
        '/api/schema/',
        '/api/docs/',
        '/api/redoc/',
        '/admin/',
    )

    CONTROL_PLANE_PREFIXES = ('admin.', 'control.')

    def process_request(self, request):
        path = request.path_info
        raw_host = request.get_host().split(':')[0].lower()

        request.tenant = None
        request.is_control_plane = False

        # 1. Central Control Plane identification
        if (raw_host.startswith(self.CONTROL_PLANE_PREFIXES)
                or raw_host in getattr(settings, 'CONTROL_PLANE_DOMAINS', ['admin.shebafi.com'])):
            request.is_control_plane = True
            return None

        # 2. Domain-based resolution (multi-stage)
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
            tenant = Tenant.objects.filter(domain__iexact=raw_host).first()

        # C. Subdomain slug match (e.g., fardin.shebafi.com -> slug="fardin")
        if not tenant:
            parts = raw_host.split('.')
            if len(parts) >= 2 and parts[0] not in ('www', 'api', 'localhost', '127', 'testserver'):
                subdomain = parts[0]
                tenant = Tenant.objects.filter(slug__iexact=subdomain).first()

        # D. Dev/test fallback — ONLY on bare localhost/127.0.0.1/testserver
        if not tenant and raw_host in ('localhost', '127.0.0.1', 'testserver'):
            # X-Tenant-ID header convenience for dev/test only
            test_header = request.headers.get('X-Tenant-ID') or request.headers.get('X-Tenant-Key')
            if test_header:
                tenant = (
                    Tenant.objects.filter(slug__iexact=test_header).first()
                    or Tenant.objects.filter(id=test_header).first()
                )
            # Absolute fallback to first active tenant for automated tests
            if not tenant:
                tenant = Tenant.objects.filter(is_active=True).first()

        # 3. Tenant status check
        if tenant:
            if not tenant.is_active:
                if not any(path.startswith(p) for p in self.PUBLIC_PATHS):
                    return JsonResponse({
                        'error': f'ISP tenant "{tenant.name}" is suspended or inactive.',
                        'code': 'TENANT_INACTIVE'
                    }, status=403)
            request.tenant = tenant
            return None

        # 4. Unknown domain — allow public paths, reject business APIs
        if any(path.startswith(p) for p in self.PUBLIC_PATHS):
            return None

        if path.startswith('/api/v1/'):
            return JsonResponse({
                'error': f'Unrecognized ISP domain: "{raw_host}". No active tenant configured.',
                'code': 'TENANT_NOT_FOUND'
            }, status=404)

        return None

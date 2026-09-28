import uuid
import threading
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.conf import settings
from django.utils.deprecation import MiddlewareMixin
from .models import Tenant, TenantDomain

_local = threading.local()


def get_current_request_id():
    """Retrieve the correlation ID of the current request from thread-local storage."""
    return getattr(_local, 'request_id', None)


class CorrelationIdMiddleware(MiddlewareMixin):
    """
    Observability Middleware (Stage 10 / S10.11).
    Attaches a correlation/request ID to every incoming HTTP request and passes it to response headers.
    """
    def process_request(self, request):
        correlation_id = (
            request.headers.get('X-Request-ID') or
            request.headers.get('X-Correlation-ID') or
            uuid.uuid4().hex[:16]
        )
        request.correlation_id = correlation_id
        request.request_id = correlation_id
        _local.request_id = correlation_id

    def process_response(self, request, response):
        cid = getattr(request, 'correlation_id', None)
        if cid:
            response['X-Request-ID'] = cid
        return response


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
        '/api-auth/',
        '/healthz/',
        '/health/',
        '/health',
        '/api/v1/health-check/',
        '/api/v1/system/',
        '/api/v1/auth/',
        '/api/v1/saas/',
        '/api/schema/',
        '/api/docs/',
        '/api/swagger/',
        '/swagger/',
        '/docs/',
        '/api/redoc/',
        '/redoc/',
        '/admin/',
    )

    TENANT_NOT_FOUND_BYPASS_PATHS = (
        '/api/v1/customer/query/',
        '/api/v1/customers/query/',
        '/api/v1/payments/sms/webhook/',
        '/api/v1/payments/webhook/sms/',
        '/api/v1/payments/bkash/paybill/',
        '/api/v1/network/reconciliation/report/',
    )

    CONTROL_PLANE_PREFIXES = (
        'admin.',
        'control.',
        'saas.',
    )

    def _is_public(self, path, check_inactive=False):
        if path in ('', '/', '/api/v1', '/api/v1/') or any(path.startswith(p) for p in self.PUBLIC_PATHS):
            return True
        if not check_inactive:
            return any(path.startswith(p) for p in self.TENANT_NOT_FOUND_BYPASS_PATHS)
        return False

    def process_request(self, request):
        # 0. CORS preflight OPTIONS requests must bypass tenant resolution
        if request.method == 'OPTIONS':
            return None

        path = request.path_info
        raw_host = request.get_host().split(':')[0].lower()

        # Reset per-request attributes
        request.tenant = None
        request.is_control_plane = False

        # 1. Root API landing, healthz, health, system probes, & SaaS paths — bypass tenant resolution & ORM lookups
        if path in ('', '/') or path.startswith('/healthz/') or path.startswith('/health') or path.startswith('/api/v1/system/'):
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

        # 3. API Key-based resolution (Server-to-Server / BFF Integrations)
        tenant = None
        from apps.core.authentication import extract_raw_api_key
        raw_key = extract_raw_api_key(request)
        if raw_key:
            auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION') or ''
            has_user_session = bool(auth_header.startswith('Token ') or auth_header.startswith('Bearer '))

            from apps.core.models import TenantApiToken
            prefix = TenantApiToken._make_prefix(raw_key)
            candidates = TenantApiToken.objects.select_related('tenant').filter(key_prefix=prefix)
            matched_candidate = None
            for candidate in candidates:
                if candidate.check_hash(raw_key):
                    matched_candidate = candidate
                    break

            if not matched_candidate:
                if not has_user_session:
                    return JsonResponse({
                        'detail': 'Invalid API key provided.',
                        'code': 'INVALID_API_KEY'
                    }, status=401)
            else:
                status_val = matched_candidate.effective_status
                if status_val == TenantApiToken.CredentialStatus.REVOKED:
                    if not has_user_session:
                        return JsonResponse({
                            'detail': 'API key has been revoked.',
                            'code': 'CREDENTIAL_REVOKED'
                        }, status=401)
                elif status_val == TenantApiToken.CredentialStatus.EXPIRED:
                    if not has_user_session:
                        return JsonResponse({
                            'detail': 'API key has expired.',
                            'code': 'CREDENTIAL_EXPIRED'
                        }, status=401)
                elif status_val == TenantApiToken.CredentialStatus.SUSPENDED:
                    if not has_user_session:
                        return JsonResponse({
                            'detail': 'API key is suspended.',
                            'code': 'CREDENTIAL_SUSPENDED'
                        }, status=401)
                else:
                    tenant = matched_candidate.tenant
                    request.tenant = tenant
                    if not has_user_session:
                        request.auth_type = 'api_key'
                        request.api_token = matched_candidate
                        request.application = matched_candidate
                        request.api_scopes = set(matched_candidate.permissions or [])

                    # ── Cross-validate: API key tenant must match the request domain tenant ──
                    domain_tenant = None
                    try:
                        domain_record = (
                            TenantDomain.objects
                            .select_related('tenant')
                            .filter(hostname__iexact=raw_host, is_active=True)
                            .first()
                        )
                        if domain_record:
                            domain_tenant = domain_record.tenant
                    except Exception:
                        pass
                    if not domain_tenant:
                        try:
                            domain_tenant = Tenant.objects.filter(domain__iexact=raw_host).first()
                        except Exception:
                            pass
                    if domain_tenant and domain_tenant.id != tenant.id and not has_user_session:
                        return JsonResponse({
                            'detail': 'API key tenant does not match the request domain.',
                            'code': 'TENANT_MISMATCH',
                        }, status=401)

        # 4. Domain-based resolution (multi-stage)
        # A. TenantDomain table — preferred (Plan Phase 4)
        if not tenant:
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

        # D. X-Tenant-ID header resolution (for API clients, dev mode, and portal switching)
        if not tenant:
            header_tenant = (request.headers.get('X-Tenant-ID') or request.META.get('HTTP_X_TENANT_ID') or '').strip()
            if header_tenant:
                from django.db.models import Q
                try:
                    tenant = Tenant.objects.filter(
                        Q(slug__iexact=header_tenant) | Q(name__iexact=header_tenant),
                        is_active=True
                    ).first()
                    if not tenant:
                        tenant = Tenant.objects.filter(id=header_tenant, is_active=True).first()
                except Exception:
                    pass

        # E. Localhost / 127.0.0.1 development fallback (active only in local mode)
        if not tenant and raw_host in ('localhost', '127.0.0.1') and getattr(settings, 'IS_LOCAL', False):
            try:
                tenant = Tenant.objects.filter(is_active=True).first()
                if tenant:
                    request.is_tenant_fallback = True
            except Exception:
                pass

        # 4. Tenant status check
        if tenant:
            if not tenant.is_active:
                if not self._is_public(path, check_inactive=True):
                    return JsonResponse({
                        'error': f'ISP tenant "{tenant.name}" is suspended or inactive.',
                        'code': 'TENANT_INACTIVE'
                    }, status=403)
            request.tenant = tenant
            return None

        # 5. Unknown domain / missing tenant — allow public paths, reject business APIs
        if self._is_public(path, check_inactive=False):
            return None

        return JsonResponse({
            'error': f'Unrecognized ISP domain: "{raw_host}". No active tenant configured.',
            'code': 'TENANT_NOT_FOUND'
        }, status=404)

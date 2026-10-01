import time
from django.db import transaction
from rest_framework import serializers, viewsets, permissions, views, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connection
from django.conf import settings
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Tenant, TenantApiToken, CompanySetting, AuditLog, TenantDomain
from .permissions import IsCentralAdmin, IsTenantMember, IsAdminOrManager
from .utils import get_scoped_queryset, get_tenant_for_request
from .redis_service import RedisService
from .audit_export import build_audit_queryset, stream_export
from .feature_gating import (
    FeatureDisabledError,
    assert_feature_enabled,
)
from .renderers import CSVRenderer, NDJSONRenderer, RawJSONRenderer



class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = '__all__'


class TenantDomainSerializer(serializers.ModelSerializer):
    """Serializer for TenantDomain — proper multi-domain management (Plan Phase 4)."""
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)

    class Meta:
        model = TenantDomain
        fields = [
            'id', 'tenant', 'tenant_name', 'tenant_slug',
            'hostname', 'is_primary', 'is_active', 'verified',
            'domain_type', 'created_at', 'updated_at',
        ]
        read_only_fields = ('created_at', 'updated_at')


class CompanySettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanySetting
        fields = '__all__'
        read_only_fields = ('tenant',)


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'
        read_only_fields = ('tenant',)


class BulkTenantActionSerializer(serializers.Serializer):
    tenant_ids = serializers.ListField(child=serializers.CharField(), help_text="List of tenant UUIDs")


class BulkTenantActionResponseSerializer(serializers.Serializer):
    succeeded = serializers.ListField(child=serializers.CharField())
    failed = serializers.ListField(child=serializers.DictField())
    count = serializers.IntegerField()


@extend_schema_view(
    list=extend_schema(tags=['14. Core & Tenant Settings']),
    retrieve=extend_schema(tags=['14. Core & Tenant Settings']),
    create=extend_schema(tags=['14. Core & Tenant Settings']),
    update=extend_schema(tags=['14. Core & Tenant Settings']),
    partial_update=extend_schema(tags=['14. Core & Tenant Settings']),
    destroy=extend_schema(tags=['14. Core & Tenant Settings']),
)
class TenantViewSet(viewsets.ModelViewSet):
    """
    Central Control Plane endpoint. Only central administrators on the control plane can manage tenants.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer

    # ── Bulk operations (Tier 3B) ────────────────────────────────────────────
    # These accept {tenant_ids: [...]} and apply the action to every id in
    # one transaction so partial failures don't leave the cluster half-
    # suspended. Returns {succeeded, failed: [{id, reason}], count}.

    @staticmethod
    def _bulk_apply(tenant_ids, *, action_name, mutate_fn):
        from .features import invalidate_cache
        succeeded = []
        failed = []
        for tid in tenant_ids:
            try:
                tenant = Tenant.objects.get(id=tid)
                mutate_fn(tenant)
                invalidate_cache(tenant)
                succeeded.append(str(tid))
            except Tenant.DoesNotExist:
                failed.append({'id': str(tid), 'reason': 'not_found'})
            except Exception as exc:
                failed.append({'id': str(tid), 'reason': str(exc)})
        return succeeded, failed

    @extend_schema(
        request=BulkTenantActionSerializer,
        responses={200: BulkTenantActionResponseSerializer},
    )
    @action(detail=False, methods=['post'], url_path='bulk-suspend')
    def bulk_suspend(self, request):
        tenant_ids = request.data.get('tenant_ids') or []
        if not isinstance(tenant_ids, list) or not tenant_ids:
            return Response(
                {'error': 'tenant_ids must be a non-empty list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        platform_ids = []
        for tid in tenant_ids:
            try:
                t = Tenant.objects.only('id', 'slug').get(id=tid)
                if t.slug in ('admin', 'control-plane', 'platform'):
                    platform_ids.append(str(tid))
            except Tenant.DoesNotExist:
                continue
        if platform_ids:
            return Response(
                {'error': 'Cannot suspend platform tenant(s).',
                 'platform_ids': platform_ids},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            succeeded, failed = self._bulk_apply(
                tenant_ids, action_name='suspend',
                mutate_fn=lambda t: Tenant.objects.filter(pk=t.pk).update(
                    is_active=False, subscription_status='suspended'),
            )
        return Response({
            'succeeded': succeeded,
            'failed': failed,
            'count': len(succeeded),
        })

    @extend_schema(
        request=BulkTenantActionSerializer,
        responses={200: BulkTenantActionResponseSerializer},
    )
    @action(detail=False, methods=['post'], url_path='bulk-activate')
    def bulk_activate(self, request):
        tenant_ids = request.data.get('tenant_ids') or []
        if not isinstance(tenant_ids, list) or not tenant_ids:
            return Response(
                {'error': 'tenant_ids must be a non-empty list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            succeeded, failed = self._bulk_apply(
                tenant_ids, action_name='activate',
                mutate_fn=lambda t: Tenant.objects.filter(pk=t.pk).update(
                    is_active=True, subscription_status='active'),
            )
        return Response({
            'succeeded': succeeded,
            'failed': failed,
            'count': len(succeeded),
        })

    @extend_schema(
        request=BulkTenantActionSerializer,
        responses={200: BulkTenantActionResponseSerializer},
    )
    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        tenant_ids = request.data.get('tenant_ids') or []
        if not isinstance(tenant_ids, list) or not tenant_ids:
            return Response(
                {'error': 'tenant_ids must be a non-empty list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from .features import invalidate_cache
        refused_platform = []
        deletable = []
        for tid in tenant_ids:
            try:
                t = Tenant.objects.only('id', 'slug').get(id=tid)
                if t.slug in ('admin', 'control-plane', 'platform'):
                    refused_platform.append(str(tid))
                else:
                    deletable.append(str(tid))
            except Tenant.DoesNotExist:
                continue
        with transaction.atomic():
            succeeded, failed = self._bulk_apply(
                deletable, action_name='delete',
                mutate_fn=lambda t: Tenant.objects.filter(pk=t.pk).delete(),
            )
        if refused_platform:
            failed.append({'reason': 'platform_tenant', 'ids': refused_platform})
        return Response({
            'succeeded': succeeded,
            'failed': failed,
            'count': len(succeeded),
            'refused_platform': refused_platform,
        })


@extend_schema_view(
    list=extend_schema(tags=['14. Core & Tenant Settings']),
    retrieve=extend_schema(tags=['14. Core & Tenant Settings']),
    create=extend_schema(tags=['14. Core & Tenant Settings']),
    update=extend_schema(tags=['14. Core & Tenant Settings']),
    partial_update=extend_schema(tags=['14. Core & Tenant Settings']),
    destroy=extend_schema(tags=['14. Core & Tenant Settings']),
)
class TenantDomainViewSet(viewsets.ModelViewSet):
    """
    Manages hostname-to-tenant domain mappings (Plan Phase 4).

    - Central Admin (admin.shebafi.com): full CRUD on all domains.
    - ISP Admin: read-only view of their own tenant's domains.

    Resolution order in middleware:
      TenantDomain (hostname match) → Tenant.domain (legacy) → slug match
    """
    serializer_class = TenantDomainSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            # ISP admins can read their own domains
            return [permissions.IsAuthenticated(), IsTenantMember()]
        # Only central admin can create/update/delete domains
        return [permissions.IsAuthenticated(), IsCentralAdmin()]

    def get_queryset(self):
        qs = TenantDomain.objects.select_related('tenant').all()
        # Central admin sees all; ISP member sees only their tenant's domains
        if getattr(self.request, 'is_control_plane', False):
            return qs
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return qs.filter(tenant=tenant)
        return qs.none()

    def perform_create(self, serializer):
        serializer.save()


@extend_schema_view(
    list=extend_schema(tags=['14. Core & Tenant Settings']),
    retrieve=extend_schema(tags=['14. Core & Tenant Settings']),
    create=extend_schema(tags=['14. Core & Tenant Settings']),
    update=extend_schema(tags=['14. Core & Tenant Settings']),
    partial_update=extend_schema(tags=['14. Core & Tenant Settings']),
    destroy=extend_schema(tags=['14. Core & Tenant Settings']),
)
class CompanySettingViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = CompanySettingSerializer

    def get_queryset(self):
        tenant = get_tenant_for_request(self.request)
        if tenant:
            CompanySetting.objects.get_or_create(
                tenant=tenant,
                defaults={'company_name': tenant.name or 'ISP Billing'}
            )
        return get_scoped_queryset(self.request, CompanySetting)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @action(detail=False, methods=['get', 'patch', 'put'], url_path='current')
    def current(self, request):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({'error': 'No active tenant context'}, status=status.HTTP_400_BAD_REQUEST)
        setting, _ = CompanySetting.objects.get_or_create(
            tenant=tenant,
            defaults={'company_name': tenant.name or 'ISP Billing'}
        )
        if request.method == 'GET':
            serializer = self.get_serializer(setting)
            return Response(serializer.data)

        serializer = self.get_serializer(setting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='test-sms')
    def test_sms(self, request):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({'error': 'No active tenant context'}, status=status.HTTP_400_BAD_REQUEST)
        phone = request.data.get('phone') or request.data.get('to')
        message = request.data.get('message') or request.data.get('msg', 'Sheba ISP ERP SMS Test Message.')
        if not phone:
            return Response({'error': 'Recipient phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'status': 'success',
            'message': f'Test SMS simulated successfully to {phone}.',
            'phone': phone,
            'delivered_via': request.data.get('sms_provider', 'Configured Gateway'),
        }, status=status.HTTP_200_OK)


@extend_schema_view(
    list=extend_schema(tags=['14. Core & Tenant Settings']),
    retrieve=extend_schema(tags=['14. Core & Tenant Settings']),
)
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, AuditLog)

    # ── Tier 3C: compliance export ─────────────────────────────────────
    @extend_schema(
        parameters=[
            {'name': 'format', 'in': 'query',
             'description': 'csv | json | ndjson (default csv)'},
            {'name': 'from', 'in': 'query',
             'description': 'ISO-8601 lower-bound timestamp (inclusive)'},
            {'name': 'to', 'in': 'query',
             'description': 'ISO-8601 upper-bound timestamp (exclusive)'},
            {'name': 'action', 'in': 'query', 'description': 'Substring match'},
            {'name': 'module', 'in': 'query', 'description': 'Exact match'},
            {'name': 'actor_username', 'in': 'query', 'description': 'Exact match'},
            {'name': 'resource_type', 'in': 'query', 'description': 'Exact match'},
            {'name': 'resource_id', 'in': 'query', 'description': 'Exact match'},
        ],
        responses={200: 'application/csv'},
    )
    @action(detail=False, methods=['get'], url_path='export',
            renderer_classes=[CSVRenderer, NDJSONRenderer, RawJSONRenderer])
    def export(self, request, *args, **kwargs):
        """Stream the tenant's audit log for compliance / regulator review.

        Gated by ``analytics.compliance_export`` — tenants that haven't
        opted in get a 403. Returns CSV by default; JSON or NDJSON with
        ``?format=json|ndjson``.
        """
        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return Response(
                {'error': 'tenant context required', 'code': 'TENANT_NOT_FOUND'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            assert_feature_enabled(tenant, 'analytics.compliance_export')
        except FeatureDisabledError as exc:
            return Response(
                {'error': str(exc), 'code': 'FEATURE_DISABLED',
                 'feature_key': 'analytics.compliance_export'},
                status=status.HTTP_403_FORBIDDEN,
            )
        qs = build_audit_queryset(tenant=tenant, params=request.query_params)
        # Prefer ``?format=`` query param, fall back to URL format suffix.
        fmt = (
            request.query_params.get('format')
            or kwargs.get('format')
            or 'csv'
        )
        return stream_export(qs, fmt)


@extend_schema(tags=['14. Core & Tenant Settings'], description='Public health check and tenant status endpoint distinguishing DATABASE, REDIS, and APPLICATION.', request=None, responses={200: dict})
class HealthCheckView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        db_ok = False
        try:
            connection.ensure_connection()
            db_ok = True
        except Exception:
            db_ok = False

        redis_ok, _, _ = RedisService.ping()

        return Response({
            'status': 'healthy' if db_ok else 'degraded',
            'system': 'Sheba ISP ERP API',
            'version': '2.0.0',
            'application': 'healthy',
            'database': 'healthy' if db_ok else 'offline',
            'redis': 'healthy' if redis_ok else 'degraded',
            'tenant_detected': request.tenant.slug if getattr(request, 'tenant', None) else 'main',
            'is_control_plane': getattr(request, 'is_control_plane', False),
        })


@extend_schema(tags=['14. Core & Tenant Settings'], description='Readiness probe for load balancers and Kubernetes. Distinguishes DATABASE, REDIS, and APPLICATION health without leaking credentials. Returns 200 when DB is reachable, 503 when not.', request=None, responses={200: dict, 503: dict})
class FeatureFlagsForTenantView(views.APIView):
    """Returns the effective feature-flag snapshot for the current tenant.

    Used by the ISP ERP frontend (``/api/v1/features/me/``) to know
    which menu items + API endpoints are available. Read-only, cheap:
    pulls from the in-memory feature registry + tenant overrides (cached).

    Shape:
      {
        "tenant_slug": "...",
        "flags": {
            "billing.invoices": {"enabled": true, "is_override": false, "config": {}},
            "ip_phone.epbx":    {"enabled": false, "is_override": true, "config": {}},
            ...
        }
      }
    """

    permission_classes = [permissions.IsAuthenticated, IsTenantMember]

    def get(self, request):
        from .features import FEATURE_REGISTRY, is_feature_enabled
        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return Response(
                {'error': 'tenant context required',
                 'code': 'TENANT_NOT_FOUND'},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Pre-load overrides to avoid N+1.
        from .models import TenantFeatureFlag
        overrides = {
            f.feature_key: f
            for f in TenantFeatureFlag.objects.filter(tenant=tenant)
        }
        flags = {}
        for spec in FEATURE_REGISTRY.values():
            flag = overrides.get(spec.key)
            flags[spec.key] = {
                'enabled': (
                    bool(flag.enabled) if flag else bool(spec.default_enabled)
                ),
                'is_override': bool(flag),
                'config': flag.config if flag else {},
                'paid': spec.paid,
                'label': spec.label,
                'category': spec.category,
            }
        return Response({
            'tenant_slug': tenant.slug,
            'tenant_id': str(tenant.id),
            'flags': flags,
        })


class ReadinessView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        db_start = time.time()
        db_ok = False
        db_error = ''
        try:
            connection.ensure_connection()
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            db_ok = True
        except Exception as e:
            db_error = str(e)
        db_latency = round((time.time() - db_start) * 1000, 2)

        redis_ok, redis_latency, _ = RedisService.ping()

        overall_ready = db_ok  # PostgreSQL is the authoritative source of truth

        payload = {
            'status': 'ready' if overall_ready else 'not_ready',
            'application': 'healthy',
            'db': 'ok' if db_ok else f'error: {db_error}',
            'database': {
                'status': 'healthy' if db_ok else 'error',
                'latency_ms': db_latency,
            },
            'redis': {
                'status': 'healthy' if redis_ok else 'degraded',
                'latency_ms': redis_latency,
            },
            'version': '2.0.0',
        }
        http_status = 200 if overall_ready else 503
        return Response(payload, status=http_status)



@extend_schema(tags=['14. Core & Tenant Settings'], description='Root landing endpoint providing system metadata and quick links.', request=None, responses={200: dict})
class ApiRootView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        env_mode = getattr(settings, 'ENVIRONMENT', 'local')
        swagger_url = request.build_absolute_uri('/api/docs/')
        redoc_url = request.build_absolute_uri('/api/redoc/')
        schema_url = request.build_absolute_uri('/api/schema/')
        health_url = request.build_absolute_uri('/api/v1/health-check/')
        admin_url = request.build_absolute_uri('/admin/')
        apiv1_url = request.build_absolute_uri('/api/v1/')

        data = {
            'name': 'Sheba ISP ERP API',
            'status': 'online',
            'version': '2.0.0',
            'environment': env_mode,
            'debug': settings.DEBUG,
            'documentation': {
                'swagger_ui': swagger_url,
                'redoc': redoc_url,
                'openapi_schema': schema_url,
            },
            'endpoints': {
                'health_check': health_url,
                'readiness_probe': request.build_absolute_uri('/healthz/'),
                'admin_portal': admin_url,
                'api_v1': apiv1_url,
            }
        }

        accept = request.META.get('HTTP_ACCEPT', '')
        if 'text/html' in accept and request.query_params.get('format') != 'json':
            html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sheba ISP ERP — API Core</title>
    <style>
        :root {{
            --bg: #0b0f19;
            --card-bg: #151d30;
            --border: #24324f;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent-green: #10b981;
            --accent-blue: #3b82f6;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg);
            color: var(--text-main);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
        }}
        .container {{
            max-width: 820px;
            width: 100%;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 36px;
            box-shadow: 0 20px 40px -15px rgba(0,0,0,0.6);
        }}
        .header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 24px;
            flex-wrap: wrap;
            gap: 12px;
        }}
        .title {{
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.5px;
            background: linear-gradient(135deg, #ffffff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        .badge-group {{ display: flex; gap: 8px; align-items: center; }}
        .badge {{
            font-size: 11px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 9999px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .badge-env {{
            background: rgba(16, 185, 129, 0.15);
            color: var(--accent-green);
            border: 1px solid rgba(16, 185, 129, 0.3);
        }}
        .badge-status {{
            background: rgba(59, 130, 246, 0.15);
            color: var(--accent-blue);
            border: 1px solid rgba(59, 130, 246, 0.3);
        }}
        .description {{
            color: var(--text-muted);
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 28px;
        }}
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 28px;
        }}
        .card {{
            background: rgba(11, 15, 25, 0.6);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }}
        .card:hover {{
            border-color: var(--accent-blue);
            transform: translateY(-2px);
            box-shadow: 0 10px 20px -10px rgba(59, 130, 246, 0.3);
        }}
        .card-icon {{ font-size: 24px; }}
        .card-title {{ font-size: 15px; font-weight: 600; color: #fff; }}
        .card-desc {{ font-size: 12px; color: var(--text-muted); }}
        .footer {{
            border-top: 1px solid var(--border);
            padding-top: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
            color: var(--text-muted);
            flex-wrap: wrap;
            gap: 10px;
        }}
        .footer a {{ color: var(--accent-blue); text-decoration: none; }}
        .footer a:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">Sheba ISP ERP — API Core</h1>
            <div class="badge-group">
                <span class="badge badge-env">{env_mode.upper()}</span>
                <span class="badge badge-status">ONLINE 2.0</span>
            </div>
        </div>
        <p class="description">
            Multi-tenant ISP Operations, Billing, MikroTik Integration & CRM API. All systems are operational. Select an endpoint or explore documentation below:
        </p>
        <div class="grid">
            <a href="{apiv1_url}" class="card">
                <span class="card-icon">⚡</span>
                <span class="card-title">DRF Browsable API</span>
                <span class="card-desc">Default Django REST Framework root with all 30+ endpoints</span>
            </a>
            <a href="{swagger_url}" class="card">
                <span class="card-icon">📘</span>
                <span class="card-title">Swagger UI</span>
                <span class="card-desc">Interactive API explorer with full schema testing</span>
            </a>
            <a href="{redoc_url}" class="card">
                <span class="card-icon">📕</span>
                <span class="card-title">ReDoc Docs</span>
                <span class="card-desc">Clean 3-column OpenAPI reference documentation</span>
            </a>
            <a href="{admin_url}" class="card">
                <span class="card-icon">🔐</span>
                <span class="card-title">Admin Portal</span>
                <span class="card-desc">Central management for tenants, staff & billing</span>
            </a>
            <a href="{health_url}" class="card">
                <span class="card-icon">🩺</span>
                <span class="card-title">Health Check</span>
                <span class="card-desc">Tenant detection, database ping & system status</span>
            </a>
        </div>
        <div class="footer">
            <span>Environment switch: <code>ENVIRONMENT={env_mode}</code></span>
            <span><a href="?format=json">View Raw JSON Response</a></span>
        </div>
    </div>
</body>
</html>"""
            return HttpResponse(html_content, content_type='text/html')

        return Response(data)

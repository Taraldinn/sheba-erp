import time
from django.db import transaction
from rest_framework import serializers, viewsets, permissions, views, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connection, models
from django.conf import settings
from django.utils import timezone
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Tenant, TenantApiToken, CompanySetting, AuditLog, TenantDomain, Notification
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


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'tenant', 'user', 'title', 'message',
            'category', 'priority', 'action_url',
            'is_read', 'read_at', 'created_at'
        ]
        read_only_fields = ('tenant', 'user', 'read_at', 'created_at')


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


@extend_schema_view(
    list=extend_schema(tags=['Notifications']),
    retrieve=extend_schema(tags=['Notifications']),
    create=extend_schema(tags=['Notifications']),
    update=extend_schema(tags=['Notifications']),
    partial_update=extend_schema(tags=['Notifications']),
    destroy=extend_schema(tags=['Notifications']),
)
class NotificationViewSet(viewsets.ModelViewSet):
    """
    In-App Notification Management (Plan Phase 13).
    Provides real-time alert listing, unread count tracking, and bulk/single mark-as-read.
    Strictly isolated by tenant and user.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(self.request, 'tenant', None)
        is_control_plane = getattr(self.request, 'is_control_plane', False)

        if is_control_plane or (user.is_superuser and not tenant):
            # Super admins on control plane see platform broadcast notifications or notifications for themselves
            return Notification.objects.filter(
                models.Q(tenant__isnull=True) | models.Q(user=user)
            )

        if not tenant:
            from apps.authentication.models import StaffMembership
            membership = StaffMembership.objects.filter(user=user, is_active=True).first()
            if membership:
                tenant = membership.tenant

        if not tenant:
            return Notification.objects.filter(user=user)

        return Notification.objects.filter(
            tenant=tenant
        ).filter(
            models.Q(user=user) | models.Q(user__isnull=True)
        )

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({'unread_count': count})

    @action(detail=True, methods=['post', 'patch'], url_path='mark-as-read')
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=['is_read', 'read_at'])
        return Response({'status': 'marked_as_read', 'id': str(notification.id)})

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(
            is_read=True, read_at=timezone.now()
        )
        return Response({'status': 'all_marked_as_read', 'count': updated})


@extend_schema(
    tags=['14. Core & Tenant Settings'],
    description='Public pre-flight tenant resolution endpoint. Resolves metadata, branding, and enabled modules without exposing secrets.',
    responses={200: dict, 404: dict}
)
class TenantResolveView(views.APIView):
    """
    Public Pre-Flight Tenant Resolution Endpoint (Plan Phase 4).
    Resolves tenant metadata, branding, and enabled modules by slug or domain without exposing
    secrets or sensitive credentials.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug=None):
        lookup_slug = slug or request.query_params.get('slug')
        hostname = request.query_params.get('domain') or request.query_params.get('hostname')
        
        tenant = None
        if lookup_slug:
            tenant = Tenant.objects.filter(slug__iexact=lookup_slug.strip(), is_active=True).first()
        elif hostname:
            clean_host = hostname.strip().lower().split(':')[0]
            domain_rec = TenantDomain.objects.select_related('tenant').filter(hostname__iexact=clean_host, is_active=True).first()
            if domain_rec:
                tenant = domain_rec.tenant
            if not tenant:
                tenant = Tenant.objects.filter(domain__iexact=clean_host, is_active=True).first()
            if not tenant:
                parts = clean_host.split('.')
                if len(parts) >= 2 and parts[0] not in ('www', 'api', 'localhost', '127', 'testserver', 'admin', 'control', 'saas'):
                    tenant = Tenant.objects.filter(slug__iexact=parts[0], is_active=True).first()
        elif getattr(request, 'tenant', None):
            tenant = request.tenant

        if not tenant:
            return Response({
                'error': f'ISP tenant "{lookup_slug or hostname or "unknown"}" not found or inactive.',
                'code': 'TENANT_NOT_FOUND',
            }, status=status.HTTP_404_NOT_FOUND)

        settings_obj = CompanySetting.objects.filter(tenant=tenant).first()
        
        ACCENT_HEX_MAP = {
            'indigo': '#6366f1',
            'emerald': '#10b981',
            'violet': '#8b5cf6',
            'cyan': '#06b6d4',
            'amber': '#f59e0b',
            'rose': '#f43f5e',
        }
        accent = getattr(settings_obj, 'accent_color', 'indigo') or 'indigo'
        primary_color = ACCENT_HEX_MAP.get(accent, '#6366f1')

        from .features import is_feature_enabled
        enabled_modules = ['dashboard', 'customers', 'billing', 'network', 'tickets', 'reports', 'settings']
        if is_feature_enabled(tenant, 'billing.invoices'):
            enabled_modules.append('invoices')
        if is_feature_enabled(tenant, 'billing.late_fees'):
            enabled_modules.append('late_fees')
        if is_feature_enabled(tenant, 'support.ticketing'):
            enabled_modules.append('support')

        data = {
            'id': str(tenant.id),
            'slug': tenant.slug,
            'name': tenant.name,
            'domain': tenant.domain or f"{tenant.slug}.shebafi.xyz",
            'status': tenant.subscription_status or 'active',
            'is_active': tenant.is_active,
            'logo': getattr(settings_obj, 'logo_url', '') or '',
            'favicon': getattr(settings_obj, 'favicon_url', '') or '',
            'branding': {
                'company_name': getattr(settings_obj, 'company_name', tenant.name) or tenant.name,
                'tagline': getattr(settings_obj, 'tagline', '') or '',
                'theme_mode': getattr(settings_obj, 'theme_mode', 'dark') or 'dark',
                'accent_color': accent,
                'primary_color': primary_color,
                'secondary_color': '#4f46e5',
                'currency_symbol': getattr(settings_obj, 'currency_symbol', '৳') or '৳',
                'currency_code': getattr(settings_obj, 'currency_code', 'BDT') or 'BDT',
                'support_phone': getattr(settings_obj, 'support_phone', '') or tenant.contact_phone or '',
                'support_email': getattr(settings_obj, 'support_email', '') or tenant.contact_email or '',
                'website': getattr(settings_obj, 'website', '') or '',
            },
            'enabled_modules': list(set(enabled_modules)),
        }
        return Response(data, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Search'],
    description='Extensible global search endpoint for Command Menu (Ctrl/Cmd + K). Tenant-isolated.',
    responses={200: dict}
)
class GlobalSearchView(views.APIView):
    """
    Extensible Global Search API Foundation (Plan Phase 14).
    Powers frontend Command Menu (Ctrl/Cmd + K).
    Returns categorized, permission-safe, and tenant-scoped search results.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if not query or len(query) < 2:
            return Response({'query': query, 'count': 0, 'results': []})

        user = request.user
        tenant = getattr(request, 'tenant', None)
        is_control_plane = getattr(request, 'is_control_plane', False) or (user.is_superuser and not tenant)

        results = []

        if is_control_plane:
            from .models import Tenant, SaaSPackage
            from django.contrib.auth.models import User as AuthUser

            for t in Tenant.objects.filter(
                models.Q(name__icontains=query) | models.Q(slug__icontains=query) | models.Q(domain__icontains=query)
            )[:5]:
                results.append({
                    'id': str(t.id),
                    'type': 'tenant',
                    'title': t.name,
                    'subtitle': f"Slug: {t.slug} · Plan: {t.plan} · Status: {t.subscription_status}",
                    'url': f"/tenants?search={t.slug}",
                    'icon': 'building',
                })

            for p in SaaSPackage.objects.filter(
                models.Q(name__icontains=query) | models.Q(code__icontains=query)
            )[:5]:
                results.append({
                    'id': str(p.id),
                    'type': 'package',
                    'title': p.name,
                    'subtitle': f"৳{p.monthly_price}/mo · Code: {p.code}",
                    'url': f"/subscriptions",
                    'icon': 'package',
                })

            for u in AuthUser.objects.filter(
                models.Q(username__icontains=query) | models.Q(email__icontains=query) | models.Q(first_name__icontains=query)
            )[:5]:
                results.append({
                    'id': str(u.id),
                    'type': 'user',
                    'title': u.get_full_name() or u.username,
                    'subtitle': f"@{u.username} · {u.email}",
                    'url': f"/users",
                    'icon': 'user',
                })

        else:
            if not tenant:
                from apps.authentication.models import StaffMembership
                membership = StaffMembership.objects.filter(user=user, is_active=True).first()
                if membership:
                    tenant = membership.tenant

            if tenant:
                try:
                    from apps.customers.models import Customer
                    for c in Customer.objects.filter(tenant=tenant).filter(
                        models.Q(name__icontains=query) | models.Q(username__icontains=query) | models.Q(phone__icontains=query) | models.Q(ip_address__icontains=query)
                    )[:5]:
                        results.append({
                            'id': str(c.id),
                            'type': 'customer',
                            'title': c.name or c.username,
                            'subtitle': f"ID: {c.username} · {c.phone} · IP: {getattr(c, 'ip_address', 'N/A')}",
                            'url': f"/customers?search={c.username}",
                            'icon': 'user',
                        })
                except Exception:
                    pass

                try:
                    from apps.billing.models import Invoice
                    for inv in Invoice.objects.filter(tenant=tenant).filter(
                        models.Q(invoice_number__icontains=query) | models.Q(customer__name__icontains=query)
                    )[:5]:
                        results.append({
                            'id': str(inv.id),
                            'type': 'invoice',
                            'title': f"Invoice #{inv.invoice_number}",
                            'subtitle': f"Customer: {inv.customer.name if inv.customer else 'N/A'} · ৳{inv.total_amount} · {inv.status}",
                            'url': f"/billing?invoice={inv.invoice_number}",
                            'icon': 'file-text',
                        })
                except Exception:
                    pass

                try:
                    from apps.support.models import Ticket
                    for tk in Ticket.objects.filter(tenant=tenant).filter(
                        models.Q(ticket_number__icontains=query) | models.Q(title__icontains=query)
                    )[:5]:
                        results.append({
                            'id': str(tk.id),
                            'type': 'ticket',
                            'title': f"Ticket #{tk.ticket_number}: {tk.title}",
                            'subtitle': f"Status: {tk.status} · Priority: {tk.priority}",
                            'url': f"/tickets?search={tk.ticket_number}",
                            'icon': 'life-buoy',
                        })
                except Exception:
                    pass

                try:
                    from apps.network.models import Router
                    for r in Router.objects.filter(tenant=tenant).filter(
                        models.Q(name__icontains=query) | models.Q(ip_address__icontains=query)
                    )[:5]:
                        results.append({
                            'id': str(r.id),
                            'type': 'router',
                            'title': r.name,
                            'subtitle': f"IP: {r.ip_address} · Model: {getattr(r, 'model', 'MikroTik')}",
                            'url': f"/network?router={r.id}",
                            'icon': 'hard-drive',
                        })
                except Exception:
                    pass

        return Response({
            'query': query,
            'count': len(results),
            'results': results
        }, status=status.HTTP_200_OK)

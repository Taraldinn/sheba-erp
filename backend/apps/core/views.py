from rest_framework import serializers, viewsets, permissions, views
from rest_framework.response import Response
from django.db import connection
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Tenant, TenantApiToken, CompanySetting, AuditLog, TenantDomain
from .permissions import IsCentralAdmin, IsTenantMember, IsAdminOrManager
from .utils import get_scoped_queryset, get_tenant_for_request


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
        return get_scoped_queryset(self.request, CompanySetting)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['14. Core & Tenant Settings']),
    retrieve=extend_schema(tags=['14. Core & Tenant Settings']),
)
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, AuditLog)


@extend_schema(tags=['14. Core & Tenant Settings'], description='Public health check and tenant status endpoint.')
class HealthCheckView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            'status': 'healthy',
            'system': 'Sheba ISP ERP API',
            'version': '2.0.0',
            'tenant_detected': request.tenant.slug if getattr(request, 'tenant', None) else 'main',
            'is_control_plane': getattr(request, 'is_control_plane', False),
        })


@extend_schema(tags=['14. Core & Tenant Settings'], description='Readiness probe for load balancers and Kubernetes. Returns 200 when DB is reachable, 503 when not.')
class ReadinessView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        db_ok = False
        db_error = ''
        try:
            connection.ensure_connection()
            db_ok = True
        except Exception as e:
            db_error = str(e)

        payload = {
            'status': 'ready' if db_ok else 'not_ready',
            'db': 'ok' if db_ok else f'error: {db_error}',
            'version': '2.0.0',
        }
        http_status = 200 if db_ok else 503
        return Response(payload, status=http_status)

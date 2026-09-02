from rest_framework import serializers, viewsets, permissions, views
from rest_framework.response import Response
from django.db import connection
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Tenant, TenantApiToken, CompanySetting, AuditLog
from .permissions import IsCentralAdmin, IsTenantMember, IsAdminOrManager
from .utils import get_scoped_queryset, get_tenant_for_request


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = '__all__'


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

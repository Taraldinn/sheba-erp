from rest_framework import serializers, viewsets, permissions, views
from rest_framework.response import Response
from .models import Tenant, TenantApiToken, CompanySetting, AuditLog


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = '__all__'


class CompanySettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanySetting
        fields = '__all__'


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'


class TenantViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer


class CompanySettingViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CompanySettingSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return CompanySetting.objects.filter(tenant=tenant)
        return CompanySetting.objects.all()


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return AuditLog.objects.filter(tenant=tenant)
        return AuditLog.objects.all()


class HealthCheckView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            'status': 'healthy',
            'system': 'Sheba ISP ERP API',
            'version': '2.0.0',
            'tenant_detected': request.tenant.slug if getattr(request, 'tenant', None) else 'main',
            'mode': 'Django REST Framework'
        })

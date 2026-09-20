"""Tenant-scoped WireGuard configuration API; private keys never leave this module."""
from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import IsTenantMember, IsTechnicalStaff
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.network.models import WireGuardConfig, WireGuardSubnet
from apps.network.serializers import WireGuardConfigSerializer, WireGuardSubnetSerializer
from apps.network.services.vpn import WireGuardService


class WireGuardConfigViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]
    serializer_class = WireGuardConfigSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, WireGuardConfig).select_related('router').prefetch_related('subnets')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @action(detail=True, methods=['get'], url_path='script')
    def script(self, request, pk=None):
        config = self.get_object()
        try:
            return Response({'filename': f"wireguard_{config.router_name.replace(' ', '_')}.rsc", 'script': WireGuardService.generate_mikrotik_script(config)})
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='download-script')
    def download_script(self, request, pk=None):
        config = self.get_object()
        try:
            response = HttpResponse(WireGuardService.generate_mikrotik_script(config), content_type='text/plain; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="wireguard_{config.router_name.replace(" ", "_")}.rsc"'
            return response
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        ok, message, latency_ms = WireGuardService.test_connection(self.get_object())
        return Response({'success': ok, 'message': message, 'latency_ms': latency_ms})


class WireGuardSubnetViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]
    serializer_class = WireGuardSubnetSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, WireGuardSubnet).select_related('olt', 'vpn_config')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

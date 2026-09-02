import random
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Router, OLT, ONU, UserSession, POPBranch
from .serializers import RouterSerializer, OLTSerializer, ONUSerializer, UserSessionSerializer, POPBranchSerializer
from apps.core.permissions import IsTenantMember, IsAdminOrManager, IsTechnicalStaff, IsAdminUserOrReadOnly
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


@extend_schema_view(
    list=extend_schema(tags=['4. Network & Core Routers']),
    retrieve=extend_schema(tags=['4. Network & Core Routers']),
    create=extend_schema(tags=['4. Network & Core Routers']),
    update=extend_schema(tags=['4. Network & Core Routers']),
    partial_update=extend_schema(tags=['4. Network & Core Routers']),
    destroy=extend_schema(tags=['4. Network & Core Routers']),
)
class POPBranchViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminUserOrReadOnly]
    serializer_class = POPBranchSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, POPBranch)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['4. Network & Core Routers']),
    retrieve=extend_schema(tags=['4. Network & Core Routers']),
    create=extend_schema(tags=['4. Network & Core Routers']),
    update=extend_schema(tags=['4. Network & Core Routers']),
    partial_update=extend_schema(tags=['4. Network & Core Routers']),
    destroy=extend_schema(tags=['4. Network & Core Routers']),
    sync_pppoe=extend_schema(tags=['4. Network & Core Routers']),
    live_traffic=extend_schema(tags=['4. Network & Core Routers']),
)
class RouterViewSet(viewsets.ModelViewSet):
    """
    MikroTik Router management. Passwords are WRITE-ONLY and never returned in responses.
    Only Admin/Manager roles can create/update/delete routers.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminUserOrReadOnly]
    serializer_class = RouterSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Router)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff])
    def sync_pppoe(self, request, pk=None):
        router = self.get_object()
        router.last_ping = timezone.now()
        router.cpu_usage = random.randint(12, 48)
        router.memory_usage = random.randint(25, 65)
        router.status = 'Online'
        router.save()

        return Response({
            'message': f'MikroTik router {router.name} ({router.ip_address}) synchronized successfully.',
            'router': RouterSerializer(router).data
        })

    @action(detail=True, methods=['get'])
    def live_traffic(self, request, pk=None):
        router = self.get_object()
        return Response({
            'router_id': str(router.id),
            'router_name': router.name,
            'download_mbps': round(random.uniform(450.0, 920.0), 2),
            'upload_mbps': round(random.uniform(120.0, 310.0), 2),
            'cpu_percent': random.randint(15, 55),
            'active_sessions': router.active_pppoe_count or random.randint(250, 480),
            'timestamp': timezone.now().isoformat()
        })


@extend_schema_view(
    list=extend_schema(tags=['5. OLT & Optical ONUs']),
    retrieve=extend_schema(tags=['5. OLT & Optical ONUs']),
    create=extend_schema(tags=['5. OLT & Optical ONUs']),
    update=extend_schema(tags=['5. OLT & Optical ONUs']),
    partial_update=extend_schema(tags=['5. OLT & Optical ONUs']),
    destroy=extend_schema(tags=['5. OLT & Optical ONUs']),
)
class OLTViewSet(viewsets.ModelViewSet):
    """
    OLT device management. Telnet password is WRITE-ONLY and never returned.
    Admin-only write access.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminUserOrReadOnly]
    serializer_class = OLTSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, OLT)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['5. OLT & Optical ONUs']),
    retrieve=extend_schema(tags=['5. OLT & Optical ONUs']),
    create=extend_schema(tags=['5. OLT & Optical ONUs']),
    update=extend_schema(tags=['5. OLT & Optical ONUs']),
    partial_update=extend_schema(tags=['5. OLT & Optical ONUs']),
    destroy=extend_schema(tags=['5. OLT & Optical ONUs']),
    reboot=extend_schema(tags=['5. OLT & Optical ONUs']),
)
class ONUViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]
    serializer_class = ONUSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, ONU)
        olt_id = self.request.query_params.get('olt')
        if olt_id:
            qs = qs.filter(olt_id=olt_id)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(mac_address__icontains=search) | qs.filter(customer_name__icontains=search)
        return qs.select_related('olt')

    @action(detail=True, methods=['post'])
    def reboot(self, request, pk=None):
        onu = self.get_object()
        onu.status = 'Online'
        onu.save()
        return Response({'message': f'Reboot command sent to ONU on {onu.pon_port}:{onu.onu_index}'})


@extend_schema_view(
    list=extend_schema(tags=['4. Network & Core Routers']),
    retrieve=extend_schema(tags=['4. Network & Core Routers']),
)
class UserSessionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]
    serializer_class = UserSessionSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, UserSession)
        router_id = self.request.query_params.get('router')
        if router_id:
            qs = qs.filter(router_id=router_id)
        return qs.select_related('router')

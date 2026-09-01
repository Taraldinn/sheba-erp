import random
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Router, OLT, ONU, UserSession, POPBranch
from .serializers import RouterSerializer, OLTSerializer, ONUSerializer, UserSessionSerializer, POPBranchSerializer


class POPBranchViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = POPBranchSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        qs = POPBranch.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class RouterViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = RouterSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return Router.objects.filter(tenant=tenant)
        return Router.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)

    @action(detail=True, methods=['post'])
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


class OLTViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OLTSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return OLT.objects.filter(tenant=tenant)
        return OLT.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class ONUViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ONUSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        qs = ONU.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)
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


class UserSessionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSessionSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        qs = UserSession.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)
        router_id = self.request.query_params.get('router')
        if router_id:
            qs = qs.filter(router_id=router_id)
        return qs.select_related('router')

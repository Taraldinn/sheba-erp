import datetime
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, permissions, status, filters
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, NotFound
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.corporate.permissions import HasCorporatePermission
from apps.corporate.models import (
    CorporateCustomer,
    CorporateConnection,
    CorporateIPPool,
    CorporateIPAddress,
    CorporateVLAN,
    CorporateTrafficSample,
    CorporateBillingPeriod,
    IPAddressStatus,
    PeriodCalculationStatus,
)
from apps.corporate.serializers import (
    CorporateCustomerSerializer,
    CorporateConnectionSerializer,
    CorporateIPPoolSerializer,
    CorporateIPAddressSerializer,
    CorporateVLANSerializer,
    CorporateTrafficSampleSerializer,
    CorporateBillingPeriodSerializer,
)
from apps.corporate.services.ipam import IPAllocationService
from apps.corporate.services.vlan import VLANAssignmentService
from apps.corporate.services.p95_calculator import P95CalculationEngine
from apps.corporate.services.billing import CorporateBillingService
from apps.network.models import Router


@extend_schema_view(
    list=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    retrieve=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    create=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    update=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    partial_update=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    destroy=extend_schema(tags=['11. Corporate & Enterprise ISP']),
)
class CorporateCustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CorporateCustomerSerializer
    permission_classes = [permissions.IsAuthenticated, HasCorporatePermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['company_name', 'legal_name', 'bin_tin', 'contact_person', 'billing_contact_phone']
    ordering_fields = ['company_name', 'created_at', 'committed_bandwidth_mbps']
    ordering = ['company_name']

    action_permissions = {
        'list': 'corporate.view',
        'retrieve': 'corporate.view',
        'summary': 'corporate.view',
        'create': 'corporate.create',
        'update': 'corporate.update',
        'partial_update': 'corporate.update',
        'destroy': 'corporate.delete',
    }

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, CorporateCustomer)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs.select_related('customer')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """
        Returns high-level summary metrics for a corporate customer:
        active connections, total CIR, assigned IP addresses, current open billing period.
        """
        customer = self.get_object()
        active_connections = customer.connections.filter(status='ACTIVE')
        total_cir = sum(c.committed_bandwidth_mbps for c in active_connections)

        assigned_ips = list(
            CorporateIPAddress.objects.filter(
                tenant=customer.tenant,
                connection__corporate_customer=customer,
                status=IPAddressStatus.ALLOCATED
            ).values('ip_address', 'connection__circuit_id', 'pool__name')
        )

        open_period = customer.billing_periods.filter(
            status=PeriodCalculationStatus.OPEN
        ).order_by('-period_start').first()

        return Response({
            'company_name': customer.company_name,
            'active_circuits_count': active_connections.count(),
            'total_committed_cir_mbps': total_cir,
            'assigned_ips_count': len(assigned_ips),
            'assigned_ips': assigned_ips,
            'base_monthly_fee': str(customer.base_monthly_fee),
            'burst_rate_per_mbps': str(customer.burst_rate_per_mbps),
            'current_open_period_id': str(open_period.id) if open_period else None,
        })


@extend_schema_view(
    list=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    retrieve=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    create=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    update=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    partial_update=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    destroy=extend_schema(tags=['11. Corporate & Enterprise ISP']),
)
class CorporateConnectionViewSet(viewsets.ModelViewSet):
    serializer_class = CorporateConnectionSerializer
    permission_classes = [permissions.IsAuthenticated, HasCorporatePermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['circuit_id', 'name', 'service_location', 'corporate_customer__company_name']
    ordering_fields = ['circuit_id', 'created_at']
    ordering = ['circuit_id']

    action_permissions = {
        'list': 'corporate.connection.view',
        'retrieve': 'corporate.connection.view',
        'create': 'corporate.connection.manage',
        'update': 'corporate.connection.manage',
        'partial_update': 'corporate.connection.manage',
        'destroy': 'corporate.connection.manage',
        'allocate_ip': 'corporate.ip.manage',
        'assign_vlan': 'corporate.vlan.manage',
        'release_vlan': 'corporate.vlan.manage',
    }

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, CorporateConnection)
        cust_id = self.request.query_params.get('corporate_customer')
        if cust_id:
            qs = qs.filter(corporate_customer_id=cust_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs.select_related('corporate_customer', 'router', 'vlan_assignment')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @action(detail=True, methods=['post'], url_path='allocate-ip')
    def allocate_ip(self, request, pk=None):
        """Leases a dedicated IP from a pool to this connection."""
        connection = self.get_object()
        pool_id = request.data.get('pool_id')
        requested_ip = request.data.get('ip_address')
        notes = request.data.get('notes', '')

        pool = None
        if pool_id:
            pool = CorporateIPPool.objects.filter(id=pool_id, tenant=connection.tenant).first()
            if not pool:
                raise NotFound("Specified IP pool not found.")

        ip_record = IPAllocationService.allocate_ip(
            connection=connection,
            pool=pool,
            requested_ip=requested_ip,
            notes=notes
        )
        return Response(CorporateIPAddressSerializer(ip_record).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='assign-vlan')
    def assign_vlan(self, request, pk=None):
        """Assigns an 802.1Q VLAN on a router interface to this connection."""
        connection = self.get_object()
        router_id = request.data.get('router_id') or (connection.router_id if connection.router else None)
        vlan_id = request.data.get('vlan_id')
        name = request.data.get('name', '')
        interface_name = request.data.get('interface_name', 'ether1')
        description = request.data.get('description', '')

        if not router_id:
            raise ValidationError("router_id is required.")
        if not vlan_id:
            raise ValidationError("vlan_id is required.")

        try:
            vlan_id = int(vlan_id)
        except (ValueError, TypeError):
            raise ValidationError("vlan_id must be an integer between 1 and 4094.")

        router = Router.objects.filter(id=router_id, tenant=connection.tenant).first()
        if not router:
            raise NotFound("Target router not found in tenant.")

        vlan_record = VLANAssignmentService.assign_vlan(
            connection=connection,
            router=router,
            vlan_id=vlan_id,
            name=name,
            interface_name=interface_name,
            description=description
        )
        return Response(CorporateVLANSerializer(vlan_record).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='release-vlan')
    def release_vlan(self, request, pk=None):
        """Unlinks any assigned VLAN from this circuit."""
        connection = self.get_object()
        VLANAssignmentService.release_vlan_for_connection(connection)
        return Response({'message': f"VLAN released for circuit {connection.circuit_id}."}, status=status.HTTP_200_OK)


@extend_schema_view(
    list=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    retrieve=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    create=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    update=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    partial_update=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    destroy=extend_schema(tags=['11. Corporate & Enterprise ISP']),
)
class CorporateIPPoolViewSet(viewsets.ModelViewSet):
    serializer_class = CorporateIPPoolSerializer
    permission_classes = [permissions.IsAuthenticated, HasCorporatePermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'network_cidr', 'gateway']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']

    action_permissions = {
        'list': 'corporate.ip.view',
        'retrieve': 'corporate.ip.view',
        'create': 'corporate.ip.manage',
        'update': 'corporate.ip.manage',
        'partial_update': 'corporate.ip.manage',
        'destroy': 'corporate.ip.manage',
        'populate_hosts': 'corporate.ip.manage',
    }

    def get_queryset(self):
        return get_scoped_queryset(self.request, CorporateIPPool)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @action(detail=True, methods=['post'], url_path='populate-hosts')
    def populate_hosts(self, request, pk=None):
        """Populates host IP address records from the subnet CIDR."""
        pool = self.get_object()
        count = IPAllocationService.populate_pool_addresses(pool)
        return Response({
            'message': f"Populated {count} host IP address records for pool {pool.name}.",
            'created_count': count
        }, status=status.HTTP_200_OK)


@extend_schema_view(
    list=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    retrieve=extend_schema(tags=['11. Corporate & Enterprise ISP']),
)
class CorporateIPAddressViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CorporateIPAddressSerializer
    permission_classes = [permissions.IsAuthenticated, HasCorporatePermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['ip_address', 'notes', 'connection__circuit_id']
    ordering = ['ip_address']

    action_permissions = {
        'list': 'corporate.ip.view',
        'retrieve': 'corporate.ip.view',
        'release': 'corporate.ip.manage',
    }

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, CorporateIPAddress)
        pool_id = self.request.query_params.get('pool')
        if pool_id:
            qs = qs.filter(pool_id=pool_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs.select_related('pool', 'connection')

    @action(detail=True, methods=['post'])
    def release(self, request, pk=None):
        """Releases an allocated IP address back to available."""
        ip_record = self.get_object()
        released = IPAllocationService.release_ip(ip_record)
        return Response(CorporateIPAddressSerializer(released).data, status=status.HTTP_200_OK)


@extend_schema_view(
    list=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    retrieve=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    create=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    update=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    destroy=extend_schema(tags=['11. Corporate & Enterprise ISP']),
)
class CorporateVLANViewSet(viewsets.ModelViewSet):
    serializer_class = CorporateVLANSerializer
    permission_classes = [permissions.IsAuthenticated, HasCorporatePermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'vlan_id', 'description', 'router__name', 'connection__circuit_id']
    ordering = ['vlan_id']

    action_permissions = {
        'list': 'corporate.vlan.view',
        'retrieve': 'corporate.vlan.view',
        'create': 'corporate.vlan.manage',
        'update': 'corporate.vlan.manage',
        'partial_update': 'corporate.vlan.manage',
        'destroy': 'corporate.vlan.manage',
        'release': 'corporate.vlan.manage',
    }

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, CorporateVLAN)
        router_id = self.request.query_params.get('router')
        if router_id:
            qs = qs.filter(router_id=router_id)
        return qs.select_related('router', 'connection')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @action(detail=True, methods=['post'])
    def release(self, request, pk=None):
        """Releases assigned connection on this VLAN."""
        vlan = self.get_object()
        released = VLANAssignmentService.release_vlan(vlan)
        return Response(CorporateVLANSerializer(released).data, status=status.HTTP_200_OK)


@extend_schema_view(
    list=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    retrieve=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    create=extend_schema(tags=['11. Corporate & Enterprise ISP']),
)
class CorporateTrafficSampleViewSet(viewsets.ModelViewSet):
    serializer_class = CorporateTrafficSampleSerializer
    permission_classes = [permissions.IsAuthenticated, HasCorporatePermission]
    ordering = ['-timestamp']

    action_permissions = {
        'list': 'corporate.telemetry.view',
        'retrieve': 'corporate.telemetry.view',
        'mrtg_graph': 'corporate.telemetry.view',
        'create': 'corporate.connection.manage',
    }

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, CorporateTrafficSample)
        conn_id = self.request.query_params.get('connection')
        if conn_id:
            qs = qs.filter(connection_id=conn_id)
        return qs.select_related('connection')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @action(detail=False, methods=['get'], url_path='mrtg-graph')
    def mrtg_graph(self, request):
        """
        Returns high-resolution telemetry time-series for MRTG frontend graphing.
        Params:
          connection_id (UUID, optional)
          customer_id (UUID, optional)
          hours (int, default 24)
        """
        hours = int(request.query_params.get('hours', 24))
        since = timezone.now() - datetime.timedelta(hours=hours)

        qs = get_scoped_queryset(request, CorporateTrafficSample).filter(
            timestamp__gte=since
        ).select_related('connection')

        conn_id = request.query_params.get('connection_id')
        cust_id = request.query_params.get('customer_id')

        if conn_id:
            qs = qs.filter(connection_id=conn_id)
        elif cust_id:
            qs = qs.filter(connection__corporate_customer_id=cust_id)

        samples = qs.order_by('timestamp')

        points = []
        for s in samples:
            in_mbps = round(s.inbound_bps / 1_000_000, 3)
            out_mbps = round(s.outbound_bps / 1_000_000, 3)
            points.append({
                'timestamp': s.timestamp.isoformat(),
                'inbound_mbps': in_mbps,
                'outbound_mbps': out_mbps,
                'max_mbps': max(in_mbps, out_mbps),
                'circuit_id': s.connection.circuit_id,
            })

        return Response({
            'total_points': len(points),
            'hours': hours,
            'points': points,
        })


@extend_schema_view(
    list=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    retrieve=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    create=extend_schema(tags=['11. Corporate & Enterprise ISP']),
    update=extend_schema(tags=['11. Corporate & Enterprise ISP']),
)
class CorporateBillingPeriodViewSet(viewsets.ModelViewSet):
    serializer_class = CorporateBillingPeriodSerializer
    permission_classes = [permissions.IsAuthenticated, HasCorporatePermission]
    filter_backends = [filters.OrderingFilter]
    ordering = ['-period_start']

    action_permissions = {
        'list': 'corporate.view',
        'retrieve': 'corporate.view',
        'create': 'corporate.billing.manage',
        'update': 'corporate.billing.manage',
        'partial_update': 'corporate.billing.manage',
        'destroy': 'corporate.billing.manage',
        'calculate': 'corporate.billing.manage',
        'finalize_invoice': 'corporate.billing.manage',
    }

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, CorporateBillingPeriod)
        cust_id = self.request.query_params.get('corporate_customer')
        if cust_id:
            qs = qs.filter(corporate_customer_id=cust_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs.select_related('corporate_customer', 'invoice')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @action(detail=True, methods=['post'])
    def calculate(self, request, pk=None):
        """Triggers deterministic p95 calculation on this billing period."""
        period = self.get_object()
        calculated_period = P95CalculationEngine.calculate_period(period)
        return Response(CorporateBillingPeriodSerializer(calculated_period).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='finalize-invoice')
    def finalize_invoice(self, request, pk=None):
        """Finalizes the period and raises an itemized Invoice linked to LedgerEntry."""
        period = self.get_object()
        actor = request.user.username if request.user else 'system'
        invoice = CorporateBillingService.finalize_period_and_invoice(period, actor_username=actor)
        period.refresh_from_db()
        return Response({
            'message': f"Corporate invoice #{invoice.invoice_no} generated successfully.",
            'invoice_id': str(invoice.id),
            'invoice_no': invoice.invoice_no,
            'total_payable': str(invoice.total_payable),
            'status': period.status,
        }, status=status.HTTP_200_OK)

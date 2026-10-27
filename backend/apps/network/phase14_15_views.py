"""
API Views for Phase 14 (Live Sessions & Topology) and Phase 15 (OLT/ONU Reconciliation).
Enforces tenant isolation, RBAC capabilities, and backend hardware mediation.
"""

import logging
from rest_framework import views, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.core.permissions import IsTenantMember, IsTechnicalStaff
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.core.authorization import can
from apps.customers.models import Customer
from apps.network.models import Router, OLT, ONU, UserSessionHistory, OLTReconciliationRun
from apps.network.services.live_sessions import LiveSessionService
from apps.network.services.topology import NetworkTopologyService
from apps.network.services.olt_reconciliation import OLTReconciliationService
from apps.network.phase14_15_serializers import (
    LiveSessionItemSerializer, TerminateSessionSerializer,
    UserSessionHistorySerializer, OLTReconciliationRunSerializer,
    ONUBindSerializer, ONUAutoMatchSerializer
)

logger = logging.getLogger(__name__)


class LiveSessionsView(views.APIView):
    """
    Phase 14: Realtime active PPPoE sessions visibility and termination.
    Cached ephemeral state in Redis; never lets frontend connect directly to router.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    @extend_schema(responses={200: LiveSessionItemSerializer(many=True)})
    def get(self, request):
        tenant = get_tenant_for_request(request)
        if not can(request.user, tenant, 'router.view'):
            return Response({'error': 'Permission denied: router.view required.'}, status=status.HTTP_403_FORBIDDEN)

        router_id = request.query_params.get('router')
        search = request.query_params.get('search')
        status_filter = request.query_params.get('status')
        refresh = request.query_params.get('refresh', '').lower() in ('1', 'true', 'yes')

        # If refresh is requested and a router is specified, trigger router sync first
        if refresh and router_id:
            router = Router.objects.filter(id=router_id, tenant=tenant).first()
            if router:
                LiveSessionService.sync_router_live_sessions(router, actor_username=request.user.username)

        result = LiveSessionService.get_active_sessions(
            tenant=tenant,
            router_id=router_id,
            search=search,
            status_filter=status_filter,
            bypass_cache=refresh
        )
        return Response(result, status=status.HTTP_200_OK)


class TerminateSessionView(views.APIView):
    """
    Phase 14: Force terminates an active subscriber session through backend MikroTik service.
    Durable history is saved to PostgreSQL; Redis cache invalidated.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    @extend_schema(request=TerminateSessionSerializer)
    def post(self, request, username=None):
        tenant = get_tenant_for_request(request)
        if not can(request.user, tenant, 'router.manage'):
            return Response({'error': 'Permission denied: router.manage required.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = TerminateSessionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        target_username = username or serializer.validated_data.get('username')
        if not target_username:
            return Response({'error': 'username is required.'}, status=status.HTTP_400_BAD_REQUEST)

        router_id = serializer.validated_data.get('router_id')
        router = Router.objects.filter(id=router_id, tenant=tenant).first() if router_id else None

        result = LiveSessionService.terminate_session(
            tenant=tenant,
            username=target_username,
            actor_username=request.user.username,
            router=router
        )
        status_code = status.HTTP_200_OK if result.get('success') else status.HTTP_400_BAD_REQUEST
        return Response(result, status=status_code)


class CustomerSessionLookupView(views.APIView):
    """
    Phase 14: Realtime customer network status panel & historical session records.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get(self, request, customer_id):
        tenant = get_tenant_for_request(request)
        customer = Customer.objects.filter(id=customer_id, tenant=tenant).first()
        if not customer:
            return Response({'error': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)

        telemetry = LiveSessionService.get_customer_session_telemetry(tenant, customer)
        return Response(telemetry, status=status.HTTP_200_OK)


class UserSessionHistoryListView(views.APIView):
    """
    Phase 14: Historical session records stored in PostgreSQL.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get(self, request):
        tenant = get_tenant_for_request(request)
        qs = UserSessionHistory.objects.filter(tenant=tenant).select_related('router')

        username = request.query_params.get('username')
        if username:
            qs = qs.filter(username__icontains=username)
        router_id = request.query_params.get('router')
        if router_id:
            qs = qs.filter(router_id=router_id)

        qs = qs.order_by('-disconnected_at')
        serializer = UserSessionHistorySerializer(qs[:100], many=True)
        return Response({'count': qs.count(), 'results': serializer.data})


class NetworkTopologyView(views.APIView):
    """
    Phase 14 & 20: Multi-tier hierarchical physical and logical graph
    (Internet -> Router -> POP -> OLT -> PON -> ONU -> Customer).
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get(self, request):
        tenant = get_tenant_for_request(request)
        data = NetworkTopologyService.get_network_topology_graph(tenant)
        hierarchy_data = NetworkTopologyService.get_authoritative_hierarchy(tenant)
        data['authoritative_hierarchy'] = hierarchy_data['authoritative_hierarchy']
        data['chain'] = hierarchy_data['chain']
        return Response(data, status=status.HTTP_200_OK)


class TopologyHierarchyView(views.APIView):
    """
    Phase 20: Read-oriented Authoritative Network Hierarchy Tree:
    Internet → Router → POP → OLT → PON.
    Optimized for large ISPs (returns summary counts down to PON ports).
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get(self, request):
        tenant = get_tenant_for_request(request)
        data = NetworkTopologyService.get_authoritative_hierarchy(tenant)
        return Response(data, status=status.HTTP_200_OK)


class TopologyDrilldownView(views.APIView):
    """
    Phase 20: On-demand paginated drill-down into network nodes.
    Supports node_type in ('pon', 'onu', 'olt', 'pop', 'router').
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get(self, request):
        tenant = get_tenant_for_request(request)
        node_type = request.query_params.get('node_type')
        node_id = request.query_params.get('node_id')

        if not node_type or not node_id:
            return Response(
                {'error': 'Both node_type and node_id query parameters are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', 20)
        search = request.query_params.get('search')

        data = NetworkTopologyService.get_topology_drilldown(
            tenant=tenant,
            node_type=node_type,
            node_id=node_id,
            page=page,
            page_size=page_size,
            search=search
        )
        if 'error' in data:
            return Response(data, status=status.HTTP_404_NOT_FOUND)
        return Response(data, status=status.HTTP_200_OK)


class GeographicalFiberMapView(views.APIView):
    """
    Phase 14: Geographical Fiber Map GeoJSON feature collection.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get(self, request):
        tenant = get_tenant_for_request(request)
        geojson = NetworkTopologyService.get_geographical_fiber_map(tenant)
        return Response(geojson, status=status.HTTP_200_OK)


class PathImpactAnalysisView(views.APIView):
    """
    Phase 14 & 20: Path and Impact Analysis / Blast-Radius Simulation.
    Supports both GET and POST requests.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get(self, request):
        tenant = get_tenant_for_request(request)
        target_type = request.query_params.get('target_type')
        target_id = request.query_params.get('target_id')

        if not target_type or not target_id:
            return Response(
                {'error': 'target_type (pop, router, olt, pon) and target_id are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        analysis = NetworkTopologyService.calculate_path_and_impact(
            tenant=tenant,
            target_type=target_type,
            target_id=target_id
        )
        if 'error' in analysis:
            return Response(analysis, status=status.HTTP_404_NOT_FOUND)
        return Response(analysis, status=status.HTTP_200_OK)

    def post(self, request):
        tenant = get_tenant_for_request(request)
        target_type = request.data.get('target_type') or request.query_params.get('target_type')
        target_id = request.data.get('target_id') or request.query_params.get('target_id')

        if not target_type or not target_id:
            return Response(
                {'error': 'target_type (pop, router, olt, pon) and target_id are required in request body.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        analysis = NetworkTopologyService.calculate_path_and_impact(
            tenant=tenant,
            target_type=target_type,
            target_id=target_id
        )
        if 'error' in analysis:
            return Response(analysis, status=status.HTTP_404_NOT_FOUND)
        return Response(analysis, status=status.HTTP_200_OK)



# ─────────────────────────────────────────────────────────────────────────────
# Phase 15: OLT / ONU Operations & Reconciliation Views
# ─────────────────────────────────────────────────────────────────────────────

class OLTReconciliationRunsView(views.APIView):
    """
    Phase 15: History of OLT hardware reconciliation runs.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def get(self, request):
        tenant = get_tenant_for_request(request)
        olt_id = request.query_params.get('olt')
        qs = OLTReconciliationRun.objects.filter(tenant=tenant).select_related('olt')
        if olt_id:
            qs = qs.filter(olt_id=olt_id)

        qs = qs.order_by('-created_at')
        serializer = OLTReconciliationRunSerializer(qs[:50], many=True)
        return Response({'count': qs.count(), 'results': serializer.data})


class TriggerOLTReconciliationView(views.APIView):
    """
    Phase 15: Triggers a live hardware audit against physical OLT.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def post(self, request, olt_id):
        tenant = get_tenant_for_request(request)
        if not can(request.user, tenant, 'olt.manage'):
            return Response({'error': 'Permission denied: olt.manage required.'}, status=status.HTTP_403_FORBIDDEN)

        olt = OLT.objects.filter(id=olt_id, tenant=tenant).first()
        if not olt:
            return Response({'error': 'OLT not found.'}, status=status.HTTP_404_NOT_FOUND)

        pon_port = request.data.get('pon_port')
        run = OLTReconciliationService.reconcile_olt_hardware(
            olt=olt,
            actor_username=request.user.username,
            pon_port=pon_port
        )
        return Response(OLTReconciliationRunSerializer(run).data, status=status.HTTP_200_OK)


class ONUAutoMatchView(views.APIView):
    """
    Phase 15: Automatically matches unassigned ONUs on an OLT to ERP Customers.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    @extend_schema(request=ONUAutoMatchSerializer)
    def post(self, request):
        tenant = get_tenant_for_request(request)
        if not can(request.user, tenant, 'olt.manage'):
            return Response({'error': 'Permission denied: olt.manage required.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = ONUAutoMatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        olt_id = serializer.validated_data['olt_id']
        dry_run = serializer.validated_data.get('dry_run', False)

        olt = OLT.objects.filter(id=olt_id, tenant=tenant).first()
        if not olt:
            return Response({'error': 'OLT not found.'}, status=status.HTTP_404_NOT_FOUND)

        result = OLTReconciliationService.auto_match_onus(
            olt=olt,
            actor_username=request.user.username,
            dry_run=dry_run
        )
        return Response(result, status=status.HTTP_200_OK)


class ONURebootActionView(views.APIView):
    """
    Phase 15: Sends reboot instruction to ONU via parent OLT client.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def post(self, request, pk):
        tenant = get_tenant_for_request(request)
        if not can(request.user, tenant, 'olt.manage'):
            return Response({'error': 'Permission denied: olt.manage required.'}, status=status.HTTP_403_FORBIDDEN)

        onu = ONU.objects.filter(id=pk, tenant=tenant).select_related('olt').first()
        if not onu:
            return Response({'error': 'ONU not found.'}, status=status.HTTP_404_NOT_FOUND)

        result = OLTReconciliationService.reboot_onu(onu, actor_username=request.user.username)
        status_code = status.HTTP_200_OK if result.get('success') else status.HTTP_502_BAD_GATEWAY
        return Response(result, status=status_code)


class ONUBindActionView(views.APIView):
    """
    Phase 15: Binds an ONU to a customer subscriber.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    @extend_schema(request=ONUBindSerializer)
    def post(self, request, pk):
        tenant = get_tenant_for_request(request)
        if not can(request.user, tenant, 'olt.manage'):
            return Response({'error': 'Permission denied: olt.manage required.'}, status=status.HTTP_403_FORBIDDEN)

        onu = ONU.objects.filter(id=pk, tenant=tenant).first()
        if not onu:
            return Response({'error': 'ONU not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ONUBindSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer_id = serializer.validated_data['customer_id']

        customer = Customer.objects.filter(id=customer_id, tenant=tenant).first()
        if not customer:
            return Response({'error': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)

        result = OLTReconciliationService.bind_customer(onu, customer, actor_username=request.user.username)
        return Response(result, status=status.HTTP_200_OK)


class ONUUnbindActionView(views.APIView):
    """
    Phase 15: Unlinks customer from ONU.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsTechnicalStaff]

    def post(self, request, pk):
        tenant = get_tenant_for_request(request)
        if not can(request.user, tenant, 'olt.manage'):
            return Response({'error': 'Permission denied: olt.manage required.'}, status=status.HTTP_403_FORBIDDEN)

        onu = ONU.objects.filter(id=pk, tenant=tenant).first()
        if not onu:
            return Response({'error': 'ONU not found.'}, status=status.HTTP_404_NOT_FOUND)

        result = OLTReconciliationService.unbind_customer(onu, actor_username=request.user.username)
        return Response(result, status=status.HTTP_200_OK)

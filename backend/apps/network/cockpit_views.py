"""
Views for Network Operations Cockpit (Phase 11).
High-level dashboard, router operational view, OLT operational view, and subscriber network panel.
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema

from apps.core.permissions import IsTenantMember
from apps.core.utils import get_tenant_for_request
from apps.network.permissions import CanViewNetworkMetrics, CanControlDevices
from apps.network.models import Router, OLT
from apps.customers.models import Customer
from apps.network.services.cockpit import (
    get_network_dashboard_overview,
    get_router_operational_detail,
    get_olt_operational_detail,
    get_customer_network_status,
    execute_customer_network_action,
)
from apps.network.cockpit_serializers import (
    NetworkDashboardSerializer,
    CustomerNetworkActionInputSerializer,
)

logger = logging.getLogger(__name__)


class NetworkCockpitDashboardView(APIView):
    """
    GET /api/v1/network/cockpit/dashboard/
    Retrieves the aggregated Network Operations Cockpit overview:
    - Routers (Total, Healthy, Degraded, CPU, Memory, Disk)
    - Customers (Total, Online, Offline, Active, Expired)
    - Pending and Failed Actions count
    - OLT (Healthy, Degraded)
    - ONU (Online, Offline, Optical Alerts)
    - Active PPPoE Session Summary
    - Recent Network Failures
    - POP Branch breakdown & Area Zone summaries
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanViewNetworkMetrics]

    @extend_schema(
        summary="Network Cockpit Dashboard Overview",
        tags=["4. Network & Core Routers"],
        responses={200: NetworkDashboardSerializer}
    )
    def get(self, request):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({"error": "Tenant context required."}, status=status.HTTP_400_BAD_REQUEST)

        pop_id = request.query_params.get('pop_id')
        area = request.query_params.get('area')
        refresh = request.query_params.get('refresh', '').lower() in ['true', '1']

        data = get_network_dashboard_overview(
            tenant=tenant,
            pop_id=pop_id,
            area=area,
            bypass_cache=refresh
        )
        return Response(data, status=status.HTTP_200_OK)


class RouterCockpitDetailView(APIView):
    """
    GET /api/v1/network/cockpit/routers/<pk>/
    Router operational drilldown (Router -> Customers):
    - Router hardware telemetry & uptime
    - Provisioned customers list with online/offline indicators
    - Live active PPPoE sessions
    - Recent sync jobs
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanViewNetworkMetrics]

    @extend_schema(
        summary="Router Operational Cockpit Detail",
        tags=["4. Network & Core Routers"],
    )
    def get(self, request, pk):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({"error": "Tenant context required."}, status=status.HTTP_400_BAD_REQUEST)

        router = get_object_or_404(Router, id=pk, tenant=tenant)
        area = request.query_params.get('area')

        data = get_router_operational_detail(router=router, area=area)
        return Response(data, status=status.HTTP_200_OK)


class OLTCockpitDetailView(APIView):
    """
    GET /api/v1/network/cockpit/olts/<pk>/
    OLT operational drilldown (OLT -> ONUs):
    - OLT metrics & connected ONUs count
    - Optical power histogram (Normal, Warning, Critical/LOS)
    - PON port breakdown
    - Connected ONUs list with optical signal metrics
    - Recent sync jobs
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanViewNetworkMetrics]

    @extend_schema(
        summary="OLT Operational Cockpit Detail",
        tags=["4. Network & Core Routers"],
    )
    def get(self, request, pk):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({"error": "Tenant context required."}, status=status.HTTP_400_BAD_REQUEST)

        olt = get_object_or_404(OLT, id=pk, tenant=tenant)
        data = get_olt_operational_detail(olt=olt)
        return Response(data, status=status.HTTP_200_OK)


class CustomerNetworkStatusView(APIView):
    """
    GET /api/v1/network/cockpit/customers/<pk>/
    Subscriber Network Status Panel (Customer -> Service):
    - Customer profile & credentials
    - Live PPPoE session (IP, MAC, caller ID, uptime, bytes in/out)
    - Assigned MikroTik router details
    - Connected ONU optical telemetry (Rx/Tx power, distance, LOS status)
    - Recent network sync job history
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanViewNetworkMetrics]

    @extend_schema(
        summary="Customer Network Status Panel",
        tags=["4. Network & Core Routers"],
    )
    def get(self, request, pk):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({"error": "Tenant context required."}, status=status.HTTP_400_BAD_REQUEST)

        customer = get_object_or_404(Customer, id=pk, tenant=tenant)
        data = get_customer_network_status(customer=customer)
        return Response(data, status=status.HTTP_200_OK)


class CustomerNetworkActionView(APIView):
    """
    POST /api/v1/network/cockpit/customers/<pk>/action/
    Executes an operational network command for a subscriber:
    - disconnect: drops live PPPoE session
    - sync_profile: re-applies package profile to router
    - reboot_onu: dispatches reboot to subscriber's optical ONU
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanControlDevices]

    @extend_schema(
        summary="Execute Customer Network Operational Action",
        tags=["4. Network & Core Routers"],
        request=CustomerNetworkActionInputSerializer,
    )
    def post(self, request, pk):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({"error": "Tenant context required."}, status=status.HTTP_400_BAD_REQUEST)

        customer = get_object_or_404(Customer, id=pk, tenant=tenant)
        serializer = CustomerNetworkActionInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action_type = serializer.validated_data['action']
        actor_username = request.user.username if request.user else "operator"

        result = execute_customer_network_action(
            customer=customer,
            action_type=action_type,
            actor_username=actor_username
        )

        if result.get("success"):
            return Response(result, status=status.HTTP_200_OK)
        return Response(result, status=status.HTTP_400_BAD_REQUEST)

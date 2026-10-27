"""
Views for Phase 12 — MikroTik PPPoE Reconciliation Operations.
Provides secret inventory filtering, manual and asynchronous reconciliation triggers,
safe discrepancy resolution, and subscriber network identity diagnostics.
"""
import logging
from rest_framework import viewsets, generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Q
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.core.permissions import IsTenantMember
from apps.core.utils import get_tenant_for_request
from apps.customers.models import Customer, PPPoECredentialRescueEvent
from .models import Router, PPPoESecretItem, ReconciliationRun, UserSession
from .permissions import CanViewNetworkMetrics, CanControlDevices
from .services.reconciliation import ReconciliationService
from .tasks import reconcile_router_task
from .reconciliation_serializers import (
    PPPoESecretItemSerializer,
    ReconciliationRunSerializer,
    SafeSyncActionSerializer,
    TriggerReconciliationSerializer,
    PPPoERescueActionSerializer,
)

logger = logging.getLogger(__name__)


@extend_schema_view(
    list=extend_schema(summary="List PPPoE Secret Inventory", tags=["4. Network & Core Routers"]),
    retrieve=extend_schema(summary="Retrieve PPPoE Secret Item Detail", tags=["4. Network & Core Routers"]),
)
class PPPoESecretInventoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Filterable inventory of discovered PPPoE secrets and reconciliation states.
    Strictly scoped to request.tenant.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanViewNetworkMetrics]
    serializer_class = PPPoESecretItemSerializer

    def get_queryset(self):
        tenant = get_tenant_for_request(self.request)
        if not tenant:
            return PPPoESecretItem.objects.none()

        qs = PPPoESecretItem.objects.filter(tenant=tenant).select_related('router', 'customer', 'package')

        # Filter by router
        router_id = self.request.query_params.get('router_id') or self.request.query_params.get('router')
        if router_id:
            qs = qs.filter(router_id=router_id)

        # Filter by reconciliation status
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(reconciliation_status=status_param.upper().strip())

        # Filter by customer area zone
        area = self.request.query_params.get('area')
        if area:
            qs = qs.filter(customer__area_zone__iexact=area)

        # Search by username, customer code, or full name
        search = self.request.query_params.get('search')
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(username__icontains=search) |
                Q(customer__customer_code__icontains=search) |
                Q(customer__full_name__icontains=search)
            )

        return qs.order_by('username')


class ReconciliationRunListView(generics.ListAPIView):
    """
    GET /api/v1/network/reconciliation/runs/
    Audit history of all reconciliation jobs executed for this tenant.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanViewNetworkMetrics]
    serializer_class = ReconciliationRunSerializer

    def get_queryset(self):
        tenant = get_tenant_for_request(self.request)
        if not tenant:
            return ReconciliationRun.objects.none()
        return ReconciliationRun.objects.filter(tenant=tenant).select_related('router').order_by('-created_at')[:50]


class TriggerRouterReconciliationView(APIView):
    """
    POST /api/v1/network/reconciliation/trigger/
    Triggers full reconciliation on a MikroTik router.
    Supports synchronous execution or asynchronous Celery dispatch.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanControlDevices]

    @extend_schema(
        summary="Trigger Router PPPoE Reconciliation",
        tags=["4. Network & Core Routers"],
        request=TriggerReconciliationSerializer,
    )
    def post(self, request):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({"error": "Tenant context required."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = TriggerReconciliationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        router_id = serializer.validated_data['router_id']
        run_async = serializer.validated_data.get('run_async', False)

        router = get_object_or_404(Router, id=router_id, tenant=tenant)
        actor_username = request.user.username if request.user else 'operator'

        if run_async:
            reconcile_router_task.delay(str(tenant.id), str(router.id), actor_username)
            return Response({
                "success": True,
                "message": f"Reconciliation task queued for router '{router.name}'.",
                "router_id": str(router.id),
                "async": True,
            }, status=status.HTTP_202_ACCEPTED)

        # Synchronous execution
        run = ReconciliationService.reconcile_router(router, actor_username=actor_username)
        return Response({
            "success": (run.status == ReconciliationRun.RunStatus.COMPLETED),
            "run_id": str(run.id),
            "status": run.status,
            "total_evaluated": run.total_evaluated,
            "matched": run.matched_count,
            "missing": run.missing_in_router_count,
            "orphans": run.unknown_in_erp_count,
            "profile_mismatches": run.profile_mismatch_count,
            "status_mismatches": run.status_mismatch_count,
            "router_mismatches": run.router_mismatch_count,
            "errors": run.error_count,
            "error_message": run.error_message,
        }, status=status.HTTP_200_OK if run.status == ReconciliationRun.RunStatus.COMPLETED else status.HTTP_400_BAD_REQUEST)


class SafeSyncSecretItemView(APIView):
    """
    POST /api/v1/network/reconciliation/items/<id>/sync/
    Safely resolves a single reconciliation discrepancy:
    - PUSH_TO_ROUTER: creates missing secret on router
    - SYNC_PROFILE: updates profile on router
    - SYNC_STATUS: updates enabled/disabled status on router
    - DISABLE_ORPHAN: disables unknown secret on router
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanControlDevices]

    @extend_schema(
        summary="Safely Synchronize Single Discrepant Secret",
        tags=["4. Network & Core Routers"],
        request=SafeSyncActionSerializer,
    )
    def post(self, request, pk):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({"error": "Tenant context required."}, status=status.HTTP_400_BAD_REQUEST)

        item = get_object_or_404(PPPoESecretItem, id=pk, tenant=tenant)
        serializer = SafeSyncActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action = serializer.validated_data['action']
        actor_username = request.user.username if request.user else 'operator'

        result = ReconciliationService.safe_sync_secret_item(item, action, actor_username=actor_username)
        if result.get('success'):
            return Response(result, status=status.HTTP_200_OK)
        return Response(result, status=status.HTTP_400_BAD_REQUEST)


class CustomerNetworkIdentityView(APIView):
    """
    GET /api/v1/network/reconciliation/customers/<id>/identity/
    Surfaces the subscriber's entire network identity and reconciliation state:
    ERP Customer <-> PPPoE Secret <-> MikroTik Router <-> MikroTik Profile <-> Actual State.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanViewNetworkMetrics]

    @extend_schema(
        summary="Customer Network Identity Diagnostics",
        tags=["4. Network & Core Routers"],
    )
    def get(self, request, customer_id):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({"error": "Tenant context required."}, status=status.HTTP_400_BAD_REQUEST)

        customer = get_object_or_404(Customer, id=customer_id, tenant=tenant)

        # Find secret item if reconciled
        secret_item = PPPoESecretItem.objects.filter(
            tenant=tenant,
            username=customer.pppoe_username
        ).select_related('router').first()

        # Find live active session
        session = UserSession.objects.filter(
            tenant=tenant,
            username=customer.pppoe_username
        ).first()

        return Response({
            "customer": {
                "id": str(customer.id),
                "customer_code": customer.customer_code,
                "full_name": customer.full_name,
                "status": customer.status,
                "area_zone": customer.area_zone,
                "connection_type": customer.connection_type,
            },
            "credentials": {
                "username": customer.pppoe_username,
                "has_password": bool(customer.pppoe_password),
                "static_ip": customer.static_ip or "",
            },
            "package": {
                "id": str(customer.package.id) if customer.package else None,
                "name": customer.package.name if customer.package else "No Package",
                "speed_mbps": customer.package.speed_mbps if customer.package else 0,
                "expected_profile": customer.package.mikrotik_profile if customer.package else "default",
            },
            "router": {
                "id": str(customer.router.id) if customer.router else None,
                "name": customer.router.name if customer.router else "Unassigned",
                "ip_address": customer.router.ip_address if customer.router else "",
                "status": customer.router.status if customer.router else "Unknown",
            },
            "secret_item": PPPoESecretItemSerializer(secret_item).data if secret_item else None,
            "live_session": {
                "is_online": bool(session),
                "ip_address": session.ip_address if session else "",
                "mac_address": session.mac_address if session else "",
                "uptime": session.uptime if session else "0s",
            } if session else {"is_online": False},
        }, status=status.HTTP_200_OK)


class PPPoECredentialRescueView(APIView):
    """
    POST /api/v1/network/reconciliation/customers/<id>/rescue/
    Execute a PPPoE Credential Rescue action (v4.2.2).
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, CanControlDevices]

    @extend_schema(
        summary="Execute PPPoE Credential Rescue",
        tags=["4. Network & Core Routers"],
        request=PPPoERescueActionSerializer,
    )
    def post(self, request, customer_id):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({"error": "Tenant context required."}, status=status.HTTP_400_BAD_REQUEST)

        customer = get_object_or_404(Customer, id=customer_id, tenant=tenant)
        serializer = PPPoERescueActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action = serializer.validated_data['action']
        manual_password = serializer.validated_data.get('manual_password', '')
        save_to_cpe = serializer.validated_data.get('save_to_cpe', False)

        from apps.network.services.mikrotik.service import MikroTikService
        from django.db import transaction

        if not customer.router:
            return Response({"error": "Customer is not assigned to any router."}, status=status.HTTP_400_BAD_REQUEST)

        mk_service = MikroTikService(customer.router)
        new_password = None

        if action == 'USE_CPE':
            if not customer.cpe_pppoe_password:
                return Response({"error": "No CPE PPPoE password stored for this customer."}, status=status.HTTP_400_BAD_REQUEST)
            new_password = customer.cpe_pppoe_password
        elif action == 'USE_DB':
            if not customer.pppoe_password:
                return Response({"error": "No DB PPPoE password stored for this customer."}, status=status.HTTP_400_BAD_REQUEST)
            new_password = customer.pppoe_password
        elif action == 'MANUAL':
            if not manual_password:
                return Response({"error": "Manual password is required for MANUAL action."}, status=status.HTTP_400_BAD_REQUEST)
            new_password = manual_password

        # Update router password before database writes
        try:
            mk_service.update_pppoe_user(customer.pppoe_username, password=new_password)
        except Exception as e:
            logger.error(f"Failed to update PPPoE password on router for {customer.pppoe_username}: {e}")
            return Response({"error": f"Failed to update password on router: {str(e)}"}, status=status.HTTP_502_BAD_GATEWAY)

        # Treat disconnect failures as non-fatal warnings
        try:
            mk_service.disconnect_session(customer.pppoe_username)
        except Exception as e:
            logger.warning(f"Could not disconnect active session for {customer.pppoe_username} on router: {e}")

        with transaction.atomic():
            if action in ['USE_CPE', 'MANUAL']:
                customer.pppoe_password = new_password
                if save_to_cpe and action == 'MANUAL':
                    customer.cpe_pppoe_password = new_password
                customer.save(update_fields=['pppoe_password', 'cpe_pppoe_password'])

            PPPoECredentialRescueEvent.objects.create(
                tenant=tenant,
                customer=customer,
                action=action,
                finding=f"Set password to {action} source",
                performed_by=request.user
            )

        return Response({"message": f"Credential rescue successful via {action}."}, status=status.HTTP_200_OK)

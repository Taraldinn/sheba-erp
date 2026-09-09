"""
Phase 13: Views for Network Action Queue and Bulk Operations.
Implements carrier-grade action tracking, bulk validation/preview/queue,
strict multi-tenant isolation, and RBAC enforcement.
"""
import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q

from apps.core.permissions import IsTenantMember
from apps.network.permissions import CanViewNetworkMetrics, CanControlDevices
from apps.customers.models import Customer
from apps.network.models import Router, NetworkAction, BulkNetworkBatch
from .action_serializers import (
    NetworkActionSerializer,
    BulkPreviewRequestSerializer,
    BulkConfirmRequestSerializer,
    BulkNetworkBatchSerializer,
)
from .services.action_queue import ActionQueueService, BulkOperationsService

logger = logging.getLogger(__name__)


class NetworkActionQueueViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing and managing the Network Action Queue.
    GET /api/v1/network/actions/
    POST /api/v1/network/actions/<id>/retry/
    POST /api/v1/network/actions/<id>/cancel/
    POST /api/v1/network/actions/enqueue/
    """
    serializer_class = NetworkActionSerializer
    permission_classes = [IsTenantMember, CanViewNetworkMetrics]

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if not tenant:
            return NetworkAction.objects.none()

        qs = NetworkAction.objects.filter(tenant=tenant).select_related('customer', 'router').order_by('-created_at')

        # Filter by status
        job_status = self.request.query_params.get('status')
        if job_status:
            qs = qs.filter(status=job_status)

        # Filter by action type
        action_type = self.request.query_params.get('action')
        if action_type:
            qs = qs.filter(action=action_type)

        # Filter by router
        router_id = self.request.query_params.get('router_id')
        if router_id:
            qs = qs.filter(router_id=router_id)

        # Filter by batch
        batch_id = self.request.query_params.get('batch_id')
        if batch_id:
            qs = qs.filter(batch_id=batch_id)

        # Search by customer name, code, target_name, or username
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(target_name__icontains=search) |
                Q(customer__full_name__icontains=search) |
                Q(customer__customer_code__icontains=search) |
                Q(customer__pppoe_username__icontains=search)
            )

        return qs

    @action(detail=False, methods=['post'], permission_classes=[IsTenantMember, CanControlDevices])
    def enqueue(self, request):
        """Manually enqueues a single network action."""
        action_type = request.data.get('action')
        customer_id = request.data.get('customer_id')
        router_id = request.data.get('router_id')
        payload = request.data.get('payload', {})
        idempotency_key = request.data.get('idempotency_key', '')

        if not action_type:
            return Response({'error': 'action is required'}, status=status.HTTP_400_BAD_REQUEST)

        customer = None
        if customer_id:
            customer = Customer.objects.filter(id=customer_id, tenant=request.tenant).first()
            if not customer:
                return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        router = None
        if router_id:
            router = Router.objects.filter(id=router_id, tenant=request.tenant).first()
            if not router:
                return Response({'error': 'Router not found'}, status=status.HTTP_404_NOT_FOUND)

        actor = getattr(request.user, 'username', 'operator')
        job = ActionQueueService.enqueue_action(
            tenant=request.tenant,
            action=action_type,
            customer=customer,
            router=router,
            payload=payload,
            actor=actor,
            idempotency_key=idempotency_key,
            execute_async=True
        )
        return Response(NetworkActionSerializer(job).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[IsTenantMember, CanControlDevices])
    def retry(self, request, pk=None):
        """Retries a failed action."""
        actor = getattr(request.user, 'username', 'operator')
        job = ActionQueueService.retry_action(
            action_id=pk,
            tenant_id=str(request.tenant.id),
            actor=actor
        )
        if not job:
            return Response({'error': 'Action not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(NetworkActionSerializer(job).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsTenantMember, CanControlDevices])
    def cancel(self, request, pk=None):
        """Cancels a pending action."""
        actor = getattr(request.user, 'username', 'operator')
        job = ActionQueueService.cancel_action(
            action_id=pk,
            tenant_id=str(request.tenant.id),
            actor=actor
        )
        if not job:
            return Response({'error': 'Action not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(NetworkActionSerializer(job).data, status=status.HTTP_200_OK)


class BulkOperationsViewSet(viewsets.ViewSet):
    """
    API endpoint for Bulk Operations:
    POST /api/v1/network/bulk/preview/  (Select -> Validate -> Preview)
    POST /api/v1/network/bulk/confirm/  (Confirm -> Queue)
    GET  /api/v1/network/bulk/batches/  (List Batches)
    GET  /api/v1/network/bulk/batches/<id>/ (Batch Status & Results)
    POST /api/v1/network/bulk/batches/<id>/cancel/ (Cancel Batch)
    """
    permission_classes = [IsTenantMember, CanControlDevices]

    @action(detail=False, methods=['post'], url_path='preview')
    def preview(self, request):
        """Step 1 & 2: Select -> Validate -> Preview."""
        serializer = BulkPreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        preview = BulkOperationsService.validate_and_preview(
            tenant=request.tenant,
            action_type=data['action_type'],
            filter_criteria=data.get('filter_criteria'),
            target_ids=data.get('target_ids'),
            payload=data.get('payload')
        )
        return Response(preview, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='confirm')
    def confirm(self, request):
        """Step 3 & 4: Confirm -> Queue."""
        serializer = BulkConfirmRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = getattr(request.user, 'username', 'operator')
        batch = BulkOperationsService.queue_bulk_operation(
            tenant=request.tenant,
            action_type=data['action_type'],
            filter_criteria=data.get('filter_criteria'),
            target_ids=data.get('target_ids'),
            payload=data.get('payload'),
            actor=actor
        )
        return Response(BulkNetworkBatchSerializer(batch).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['get'], url_path='batches')
    def list_batches(self, request):
        """Lists bulk batches for the active tenant."""
        batches = BulkNetworkBatch.objects.filter(
            tenant=request.tenant
        ).select_related('router').order_by('-created_at')[:50]
        return Response(BulkNetworkBatchSerializer(batches, many=True).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='detail')
    def batch_detail(self, request, pk=None):
        """Step 5 & 6: Results inspection."""
        batch = BulkNetworkBatch.objects.filter(
            id=pk,
            tenant=request.tenant
        ).select_related('router').first()
        if not batch:
            return Response({'error': 'Batch not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(BulkNetworkBatchSerializer(batch).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_batch(self, request, pk=None):
        """Cancels an in-flight or queued bulk batch."""
        batch = BulkNetworkBatch.objects.filter(
            id=pk,
            tenant=request.tenant
        ).first()
        if not batch:
            return Response({'error': 'Batch not found'}, status=status.HTTP_404_NOT_FOUND)

        if batch.status in [BulkNetworkBatch.BatchStatus.PENDING, BulkNetworkBatch.BatchStatus.QUEUED, BulkNetworkBatch.BatchStatus.EXECUTING]:
            batch.status = BulkNetworkBatch.BatchStatus.CANCELLED
            batch.save(update_fields=['status', 'updated_at'])

            # Cancel remaining pending child actions
            batch.actions.filter(status=NetworkAction.JobStatus.PENDING).update(
                status=NetworkAction.JobStatus.CANCELLED
            )

        return Response(BulkNetworkBatchSerializer(batch).data, status=status.HTTP_200_OK)

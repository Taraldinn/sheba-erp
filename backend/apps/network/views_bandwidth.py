"""
Read-side views for the daily bandwidth aggregation table.

Mirrors the legacy `daily_traffic` endpoint surface. Frontend subscribers
can hit this from the self-care portal to render usage graphs.
"""
import logging

from rest_framework import permissions, status, views
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter

from apps.core.permissions import IsTenantMember
from apps.core.utils import get_tenant_for_request
from apps.customers.models import Customer
from apps.network.services.bandwidth_rollup import get_customer_bandwidth_summary

logger = logging.getLogger(__name__)


class CustomerBandwidthSummaryView(views.APIView):
    """
    GET /api/v1/network/customers/<id>/bandwidth/?days=30

    Returns aggregated daily bandwidth totals for the requested customer
    (the same data the legacy `daily_traffic` table exposed).
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]

    @extend_schema(
        tags=['4. Network & Core Routers'],
        parameters=[
            OpenApiParameter(
                name='days', location=OpenApiParameter.QUERY,
                type=int, default=30, required=False,
                description='Number of days to return (cap 90).',
            ),
        ],
    )
    def get(self, request, customer_id):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({'error': 'Tenant context required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            days = max(1, min(int(request.query_params.get('days', 30)), 90))
        except (TypeError, ValueError):
            days = 30

        customer = Customer.objects.filter(id=customer_id, tenant=tenant).first()
        if not customer:
            return Response({'error': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(get_customer_bandwidth_summary(customer, days=days))

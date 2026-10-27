"""
Phase 21 — Advanced Health & Diagnostics API views.

These endpoints give admins a one-shot, read-only diagnostic view of a
MikroTik router (interfaces, ARP, neighbors, routing table, log tail,
on-demand ping). Permissions are gated to admins via
``CanViewAdvancedHealth``.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone as dt_tz

from django.utils import timezone
from rest_framework import permissions, views, status
from rest_framework.response import Response

from apps.core.utils import get_tenant_for_request
from apps.network.diagnostics_serializers import (
    RouterAdvancedHealthSerializer,
    RouterPingRequestSerializer,
    RouterPingResultSerializer,
)
from apps.network.models import Router, RouterPingResult
from apps.network.permissions import CanViewAdvancedHealth
from apps.network.services.mikrotik import (
    MikroTikDiagnosticsService,
    MikroTikInterfaceService,
)

logger = logging.getLogger(__name__)


class RouterAdvancedHealthView(views.APIView):
    """
    GET /api/v1/network/diagnostics/routers/<router_id>/

    Returns a consolidated real-time diagnostic snapshot of a router:
    interfaces (extended counters), ARP table, IP neighbor discovery,
    routing table, and the most recent RouterOS log entries.
    """
    permission_classes = [
        permissions.IsAuthenticated,
        CanViewAdvancedHealth,
    ]

    def get(self, request, router_id):
        tenant = get_tenant_for_request(request)
        try:
            router = Router.objects.get(id=router_id, tenant=tenant)
        except Router.DoesNotExist:
            return Response(
                {'detail': 'Router not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        diag = MikroTikDiagnosticsService(router)
        iface = MikroTikInterfaceService(router)

        payload = {
            'router_id': router.id,
            'router_name': router.name,
            'captured_at': timezone.now().isoformat(),
            'interfaces': iface.get_interface_counters_extended(),
            'arp': diag.get_arp_table(),
            'neighbors': diag.get_neighbor_list(),
            'routes': diag.get_route_table(),
            'log_tail': diag.get_log_tail(max_lines=200),
        }
        serializer = RouterAdvancedHealthSerializer(payload)
        return Response(serializer.data)


class RouterPingView(views.APIView):
    """
    POST /api/v1/network/diagnostics/routers/<router_id>/ping/

    Run an on-demand ping from the router to ``target``. Persists a
    ``RouterPingResult`` row so the attempt shows up in the archive.
    """
    permission_classes = [
        permissions.IsAuthenticated,
        CanViewAdvancedHealth,
    ]

    def post(self, request, router_id):
        tenant = get_tenant_for_request(request)
        try:
            router = Router.objects.get(id=router_id, tenant=tenant)
        except Router.DoesNotExist:
            return Response(
                {'detail': 'Router not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        req = RouterPingRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        target = req.validated_data['target'].strip()
        count = req.validated_data.get('count') or 4
        timeout = req.validated_data.get('timeout')

        result = MikroTikDiagnosticsService(router).ping(
            target=target, count=int(count), timeout=timeout
        )

        ran_by = ''
        user = getattr(request, 'user', None)
        if user and getattr(user, 'is_authenticated', False):
            ran_by = user.get_username() if hasattr(user, 'get_username') else str(user)

        try:
            ts_now = timezone.now()
            row = RouterPingResult.objects.create(
                tenant=tenant,
                router=router,
                target=result['target'],
                packet_count=int(result['packet_count'] or count),
                received=int(result['received'] or 0),
                min_latency_ms=result['min_latency_ms'],
                avg_latency_ms=result['avg_latency_ms'],
                max_latency_ms=result['max_latency_ms'],
                status=result['status'],
                raw_output=result['raw_output'] or [],
                ran_by=ran_by,
                ran_at=ts_now,
            )
        except Exception as exc:
            logger.warning(
                'Failed to persist RouterPingResult: %s', exc
            )
            return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(
            RouterPingResultSerializer(row).data,
            status=status.HTTP_201_CREATED,
        )

"""
Phase 21 — Datewise Archive & Export API views.

Provides two read-only endpoints:

  * GET  /api/v1/network/archive/             — paginated, filterable list
    of sessions / actions / interface snapshots within a date range.
  * GET  /api/v1/network/archive/export/      — same query, streamed as
    CSV or JSON with a date-stamped filename.

Both endpoints are admin-only via ``CanExportNetworkArchive``.
"""
from __future__ import annotations

import csv
import io
import json
import logging
from datetime import date, datetime, time, timedelta, timezone as dt_tz

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import permissions, status, views
from rest_framework.response import Response

from apps.core.utils import get_tenant_for_request
from apps.network.models import (
    InterfaceSnapshot,
    NetworkArchiveDay,
    NetworkSyncJob,
    Router,
    RouterPingResult,
    UserSessionHistory,
)
from apps.network.permissions import CanExportNetworkArchive

logger = logging.getLogger(__name__)


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw[:10], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def _resolve_range(params) -> tuple[datetime, datetime]:
    """
    Convert query-param ``date_from`` / ``date_to`` (and optional
    ``date`` for a single-day window) into a [start, end) datetime pair
    in UTC. ``date_to`` is exclusive end-of-day.
    """
    today = timezone.localdate()
    df = _parse_date(params.get('date_from')) or today
    dt_to = _parse_date(params.get('date_to'))
    single = _parse_date(params.get('date'))
    if single:
        df = single
        dt_to = single
    if dt_to is None:
        dt_to = df
    # Convert to UTC datetimes at day boundaries.
    start = datetime.combine(df, time.min, tzinfo=dt_tz.utc)
    end_exclusive = datetime.combine(dt_to + timedelta(days=1), time.min, tzinfo=dt_tz.utc)
    return start, end_exclusive


def _session_rows(tenant, router, start, end, username, limit, offset):
    qs = (
        UserSessionHistory.objects
        .filter(tenant=tenant, disconnected_at__gte=start, disconnected_at__lt=end)
        .select_related('router')
        .order_by('-disconnected_at')
    )
    if router is not None:
        qs = qs.filter(router=router)
    if username:
        qs = qs.filter(username__icontains=username)
    total = qs.count()
    items = qs[offset:offset + limit]
    rows = []
    for r in items:
        rows.append({
            'kind': 'session',
            'id': str(r.id),
            'occurred_at': r.disconnected_at.isoformat() if r.disconnected_at else None,
            'router_id': str(r.router_id),
            'router_name': r.router.name,
            'username': r.username,
            'ip_address': r.ip_address,
            'mac_address': r.mac_address,
            'caller_id': r.caller_id,
            'connected_at': r.connected_at.isoformat() if r.connected_at else None,
            'duration_seconds': r.duration_seconds,
            'bytes_in': r.bytes_in,
            'bytes_out': r.bytes_out,
            'terminate_cause': r.terminate_cause,
        })
    return rows, total


def _action_rows(tenant, router, start, end, username, limit, offset):
    qs = (
        NetworkSyncJob.objects
        .filter(tenant=tenant, created_at__gte=start, created_at__lt=end)
        .select_related('router')
        .order_by('-created_at')
    )
    if router is not None:
        qs = qs.filter(router=router)
    if username:
        qs = qs.filter(
            actor__icontains=username
        ) | qs.filter(target_name__icontains=username)
    total = qs.count()
    items = qs[offset:offset + limit]
    rows = []
    for j in items:
        rows.append({
            'kind': 'action',
            'id': str(j.id),
            'occurred_at': j.created_at.isoformat() if j.created_at else None,
            'router_id': str(j.router_id) if j.router_id else '',
            'router_name': j.router.name if j.router_id else '',
            'action': j.action,
            'status': j.status,
            'actor': j.actor,
            'target_type': j.target_type,
            'target_id': j.target_id,
            'target_name': j.target_name,
            'error_message': j.error_message,
        })
    return rows, total


def _interface_rows(tenant, router, start, end, username, limit, offset):
    # InterfaceSnapshot snapshots are keyed by calendar date, not time.
    df = start.date()
    dt_to = (end - timedelta(days=1)).date()
    qs = (
        InterfaceSnapshot.objects
        .filter(tenant=tenant, snapshot_date__gte=df, snapshot_date__lte=dt_to)
        .select_related('router')
        .order_by('-snapshot_date', '-captured_at')
    )
    if router is not None:
        qs = qs.filter(router=router)
    total = qs.count()
    items = qs[offset:offset + limit]
    rows = []
    for s in items:
        rows.append({
            'kind': 'interface_snapshot',
            'id': str(s.id),
            'occurred_at': s.captured_at.isoformat() if s.captured_at else None,
            'router_id': str(s.router_id),
            'router_name': s.router.name,
            'snapshot_date': s.snapshot_date.isoformat() if s.snapshot_date else None,
            'interfaces': s.interfaces,
            'error_message': s.error_message,
        })
    return rows, total


def _ping_rows(tenant, router, start, end, username, limit, offset):
    qs = (
        RouterPingResult.objects
        .filter(tenant=tenant, ran_at__gte=start, ran_at__lt=end)
        .select_related('router')
        .order_by('-ran_at')
    )
    if router is not None:
        qs = qs.filter(router=router)
    if username:
        qs = qs.filter(target__icontains=username)
    total = qs.count()
    items = qs[offset:offset + limit]
    rows = []
    for p in items:
        rows.append({
            'kind': 'ping',
            'id': str(p.id),
            'occurred_at': p.ran_at.isoformat() if p.ran_at else None,
            'router_id': str(p.router_id),
            'router_name': p.router.name,
            'target': p.target,
            'packet_count': p.packet_count,
            'received': p.received,
            'min_latency_ms': p.min_latency_ms,
            'avg_latency_ms': p.avg_latency_ms,
            'max_latency_ms': p.max_latency_ms,
            'status': p.status,
            'ran_by': p.ran_by,
        })
    return rows, total


_ROW_BUILDERS = {
    'sessions': _session_rows,
    'actions': _action_rows,
    'interfaces': _interface_rows,
    'pings': _ping_rows,
}


class ArchiveQueryView(views.APIView):
    """
    GET /api/v1/network/archive/

    Query params:
      type=sessions|actions|interfaces|pings   (default: sessions)
      date_from=YYYY-MM-DD  date_to=YYYY-MM-DD  date=YYYY-MM-DD
      router_id=<uuid>      username=<substring>
      limit=<int>           offset=<int>
    """
    permission_classes = [
        permissions.IsAuthenticated,
        CanExportNetworkArchive,
    ]

    def get(self, request):
        tenant = get_tenant_for_request(request)
        params = request.query_params

        kind = (params.get('type') or 'sessions').lower()
        builder = _ROW_BUILDERS.get(kind)
        if builder is None:
            return Response(
                {'detail': f'Unsupported type "{kind}". Use one of: {", ".join(_ROW_BUILDERS)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            limit = max(1, min(int(params.get('limit') or 100), 500))
            offset = max(0, int(params.get('offset') or 0))
        except (ValueError, TypeError):
            return Response({'detail': 'limit/offset must be integers.'}, status=400)

        try:
            start, end = _resolve_range(params)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=400)

        router = None
        router_id = params.get('router_id')
        if router_id:
            try:
                router = Router.objects.get(id=router_id, tenant=tenant)
            except Router.DoesNotExist:
                return Response({'detail': 'Router not found.'}, status=404)

        username = params.get('username') or ''

        rows, total = builder(tenant, router, start, end, username, limit, offset)
        return Response({
            'type': kind,
            'count': total,
            'limit': limit,
            'offset': offset,
            'date_from': start.date().isoformat(),
            'date_to': (end - timedelta(days=1)).date().isoformat(),
            'results': rows,
        })


class ArchiveExportView(views.APIView):
    """
    GET /api/v1/network/archive/export/

    Same query as ArchiveQueryView but streams the result as
    ``text/csv`` or ``application/json`` with a date-stamped filename.
    Use ``export_format=csv`` (or ``json``); plain ``format=...`` is
    reserved for DRF content negotiation.
    """
    permission_classes = [
        permissions.IsAuthenticated,
        CanExportNetworkArchive,
    ]

    _CSV_FIELDS = [
        'kind', 'occurred_at', 'router_name', 'username', 'target',
        'action', 'status', 'ip_address', 'mac_address', 'caller_id',
        'connected_at', 'duration_seconds', 'bytes_in', 'bytes_out',
        'terminate_cause', 'packet_count', 'received', 'min_latency_ms',
        'avg_latency_ms', 'max_latency_ms', 'ran_by', 'error_message',
        'snapshot_date', 'interfaces', 'id', 'router_id',
    ]

    def get(self, request):
        tenant = get_tenant_for_request(request)
        params = request.query_params

        kind = (params.get('type') or 'sessions').lower()
        builder = _ROW_BUILDERS.get(kind)
        if builder is None:
            return Response(
                {'detail': f'Unsupported type "{kind}". Use one of: {", ".join(_ROW_BUILDERS)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        fmt = (params.get('export_format') or 'csv').lower()
        if fmt not in ('csv', 'json'):
            return Response({'detail': 'export_format must be csv or json.'}, status=400)

        try:
            start, end = _resolve_range(params)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=400)

        router = None
        router_id = params.get('router_id')
        if router_id:
            try:
                router = Router.objects.get(id=router_id, tenant=tenant)
            except Router.DoesNotExist:
                return Response({'detail': 'Router not found.'}, status=404)

        username = params.get('username') or ''

        # Use large limits for export; iterate via chunked iteration.
        rows, total = builder(tenant, router, start, end, username, limit=10_000, offset=0)

        df = start.date().isoformat()
        dt_to = (end - timedelta(days=1)).date().isoformat()
        filename = f'network-archive-{kind}-{df}_to_{dt_to}.{fmt}'

        if fmt == 'json':
            payload = json.dumps({
                'type': kind,
                'date_from': df,
                'date_to': dt_to,
                'count': total,
                'results': rows,
            }, default=str)
            response = StreamingHttpResponse(
                iter([payload]),
                content_type='application/json; charset=utf-8',
            )
        else:
            buffer = io.StringIO()
            writer = csv.DictWriter(buffer, fieldnames=self._CSV_FIELDS, extrasaction='ignore')
            writer.writeheader()
            for row in rows:
                # Flatten list/dict fields to JSON strings for CSV export.
                flat = dict(row)
                for key in ('interfaces', 'raw_output'):
                    if key in flat and flat[key] not in (None, ''):
                        flat[key] = json.dumps(flat[key], default=str)
                writer.writerow(flat)

            def stream():
                buffer.seek(0)
                yield buffer.getvalue()

            response = StreamingHttpResponse(
                stream(),
                content_type='text/csv; charset=utf-8',
            )

        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

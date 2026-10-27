"""
apps/core/audit_export.py — streaming CSV / JSON export for AuditLog.

Both central control plane (SaaS admin) and per-tenant staff routes hit this
module to emit a regulator-friendly file. Streams so we don't blow memory on
tenants with millions of rows.

Output schemas:

  CSV columns:
    timestamp, tenant_slug, actor_username, action, module,
    resource_type, resource_id, ip_address, request_id, user_agent,
    target_id, details

  JSON shape (line-delimited when ``format='ndjson'`` or pretty when ``format='json'``):
    {
      "id": "uuid",
      "timestamp": "ISO-8601",
      "tenant_slug": "...",
      "actor_username": "...",
      "action": "...",
      "module": "...",
      "resource_type": "...",
      "resource_id": "...",
      "ip_address": "...",
      "request_id": "...",
      "user_agent": "...",
      "target_id": "...",
      "details": {...},
      "before": {...},
      "after": {...}
    }

Filtering (all optional, applied via ``build_audit_queryset``):
  * ``from`` / ``to``  — ISO-8601 datetimes (inclusive lower, exclusive upper)
  * ``action``         — substring match on ``action`` column
  * ``module``         — exact match
  * ``actor_username`` — exact match
  * ``resource_type``  — exact match
  * ``resource_id``    — exact match
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Iterable, Iterator, Optional

from django.db.models import QuerySet
from django.http import StreamingHttpResponse

from .models import AuditLog


# ─────────────────────────────────────────────────────────────────────────────
# Query helper
# ─────────────────────────────────────────────────────────────────────────────


def _parse_dt(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        # Accept ISO-8601 (with or without 'Z' suffix).
        return datetime.fromisoformat(raw.replace('Z', '+00:00'))
    except ValueError:
        return None


def build_audit_queryset(
    *,
    tenant=None,
    tenant_slug: Optional[str] = None,
    qs: Optional[QuerySet[AuditLog]] = None,
    params: Optional[dict] = None,
) -> QuerySet[AuditLog]:
    """Apply the standard filter set. ``qs`` lets callers pre-scope.

    Pass exactly one of:
      * ``tenant`` — Django tenant instance (restricts rows to that tenant)
      * ``tenant_slug`` — restricts rows to that tenant by slug
      * nothing — no tenant restriction (caller is responsible for
        authorization; the central SaaS viewset uses this)
    """
    if qs is None:
        qs = AuditLog.objects.all()
    if tenant is not None:
        qs = qs.filter(tenant=tenant)
    elif tenant_slug:
        qs = qs.filter(tenant__slug=tenant_slug)

    params = params or {}
    dt_from = _parse_dt(params.get('from'))
    if dt_from:
        qs = qs.filter(timestamp__gte=dt_from)
    dt_to = _parse_dt(params.get('to'))
    if dt_to:
        qs = qs.filter(timestamp__lt=dt_to)
    if params.get('action'):
        qs = qs.filter(action__icontains=params['action'])
    if params.get('module'):
        qs = qs.filter(module=params['module'])
    if params.get('actor_username'):
        qs = qs.filter(actor_username=params['actor_username'])
    if params.get('resource_type'):
        qs = qs.filter(resource_type=params['resource_type'])
    if params.get('resource_id'):
        qs = qs.filter(resource_id=params['resource_id'])

    # Stable ordering for deterministic exports.
    return qs.order_by('timestamp')


# ─────────────────────────────────────────────────────────────────────────────
# Row serializer
# ─────────────────────────────────────────────────────────────────────────────


_CSV_FIELDS = (
    'timestamp', 'tenant_slug', 'actor_username', 'action', 'module',
    'resource_type', 'resource_id', 'ip_address', 'request_id', 'user_agent',
    'target_id', 'details',
)


def _row_to_dict(row: AuditLog) -> dict:
    return {
        'id': str(row.id),
        'timestamp': row.timestamp.isoformat(),
        'tenant_slug': row.tenant.slug if row.tenant_id else '',
        'actor_username': row.actor_username,
        'action': row.action,
        'module': row.module,
        'resource_type': row.resource_type,
        'resource_id': row.resource_id,
        'ip_address': row.ip_address or '',
        'request_id': row.request_id,
        'user_agent': row.user_agent,
        'target_id': row.target_id,
        'details': row.details,
        'before': row.before,
        'after': row.after,
    }


def _row_to_csv_dict(row: AuditLog) -> dict:
    d = _row_to_dict(row)
    out = {k: d.get(k, '') for k in _CSV_FIELDS}
    # ``details`` is JSON, render as compact string for CSV consumers.
    out['details'] = json.dumps(out['details'], ensure_ascii=False, default=str)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Streaming response helpers
# ─────────────────────────────────────────────────────────────────────────────


def _chunk_lines(lines: Iterable[str], chunk_size: int = 200) -> Iterator[str]:
    """Buffer ``lines`` so we don't yield one tiny HttpResponse frame per row."""
    buf: list[str] = []
    for line in lines:
        buf.append(line)
        if len(buf) >= chunk_size:
            yield '\n'.join(buf) + '\n'
            buf = []
    if buf:
        yield '\n'.join(buf) + '\n'


def stream_csv(qs: QuerySet[AuditLog]) -> StreamingHttpResponse:
    """Stream CSV with proper headers and a filename that includes the date."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_CSV_FIELDS)
    writer.writeheader()
    header = buf.getvalue()
    buf.seek(0)
    buf.truncate(0)

    def row_iter():
        yield header
        for row in qs.iterator(chunk_size=500):
            writer.writerow(_row_to_csv_dict(row))
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    filename = f"audit-log-{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.csv"
    response = StreamingHttpResponse(row_iter(), content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    # Disable caching so regulators always see fresh data.
    response['Cache-Control'] = 'no-store'
    return response


def stream_json(qs: QuerySet[AuditLog], *, ndjson: bool = False) -> StreamingHttpResponse:
    """Stream JSON. ``ndjson=True`` → line-delimited (one row per line)."""
    if ndjson:
        def line_iter():
            for row in qs.iterator(chunk_size=500):
                yield json.dumps(_row_to_dict(row), ensure_ascii=False, default=str) + '\n'

        filename = f"audit-log-{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.ndjson"
        response = StreamingHttpResponse(line_iter(), content_type='application/x-ndjson')
    else:
        def json_iter():
            yield '{"results": [\n'
            first = True
            for row in qs.iterator(chunk_size=500):
                if not first:
                    yield ',\n'
                first = False
                yield json.dumps(_row_to_dict(row), ensure_ascii=False, default=str)
            yield '\n]}\n'

        filename = f"audit-log-{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.json"
        response = StreamingHttpResponse(json_iter(), content_type='application/json')

    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['Cache-Control'] = 'no-store'
    return response


def stream_export(qs: QuerySet[AuditLog], fmt: str) -> StreamingHttpResponse:
    """Dispatch based on ``fmt`` query param. Defaults to CSV."""
    fmt = (fmt or 'csv').lower()
    if fmt in ('ndjson', 'ndj', 'jsonl'):
        return stream_json(qs, ndjson=True)
    if fmt == 'json':
        return stream_json(qs, ndjson=False)
    return stream_csv(qs)

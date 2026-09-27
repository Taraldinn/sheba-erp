"""
Usage tracking service, ported from
``php-legecy-shebafi/controllers/usage_controller.php`` +
``php-legecy-shebafi/classes/UsageEngine.php``.

Provides:
  * ``sync_router_usage(router)`` — pulls active sessions from the MikroTik
    REST API and persists ``UsageLog`` rows for the current day.
  * ``check_router_online(router)`` — RouterOS identity ping.
  * ``compute_live_rates(router_id, fetch_fn=None)`` — per-session delta
    rate calculation in Mbps (cached under ``traffic_rates``).
  * ``get_usage_charts(router_id|None, days)`` — daily aggregate array
    suitable for the dashboard chart.
  * ``get_usage_reports_data(...)`` — history / top_users / router_wise rollups.

The cache lives in Django's cache framework so it survives process restarts
and avoids the PHP-style on-disk races.
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Callable, Iterable, Optional

from django.core.cache import cache
from django.utils import timezone

from apps.network.models import Router, UsageLog

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Format helpers
# ─────────────────────────────────────────────────────────────────────────────

def format_bytes(n: float) -> str:
    n = max(0.0, float(n or 0))
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if n < 1024.0 or unit == 'TB':
            return f'{n:.2f} {unit}'
        n /= 1024.0
    return f'{n:.2f} TB'


def format_uptime(seconds: int) -> str:
    seconds = max(0, int(seconds or 0))
    if seconds <= 0:
        return '0s'
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    mins, secs = divmod(rem, 60)
    parts = []
    if days:
        parts.append(f'{days}d')
    if hours:
        parts.append(f'{hours}h')
    if mins:
        parts.append(f'{mins}m')
    if secs or not parts:
        parts.append(f'{secs}s')
    return ' '.join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# Router liveness
# ─────────────────────────────────────────────────────────────────────────────

def check_router_online(router: Router, *, timeout: int = 5,
                         ping_fn: Optional[Callable[[Router], bool]] = None) -> bool:
    """Returns True if the router responds. ``ping_fn`` is an injectable seam
    so tests can skip the real MikroTik client."""
    if ping_fn is not None:
        return ping_fn(router)
    try:
        from apps.network.services.mikrotik.client import MikroTikRESTClient
        with MikroTikRESTClient.from_router(router) as client:
            resp = client.get('/system/identity')
        return bool(resp)
    except Exception as exc:
        logger.debug('check_router_online failed for %s: %s', router.id, exc)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Sync active sessions → UsageLog row
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_customer(router: Router, username: str):
    from apps.customers.models import Customer
    return (
        Customer.objects
        .filter(tenant=router.tenant, pppoe_username__iexact=username)
        .first()
    )


def sync_router_usage(router: Router, *,
                      fetch_sessions_fn: Optional[Callable[[Router], list[dict]]] = None
                      ) -> dict:
    """Pulls the latest active session list from the router and writes a
    ``UsageLog`` row per PPPoE user for ``today``.

    ``fetch_sessions_fn(router)`` is injectable; the default uses the existing
    MikroTik REST client at ``/ppp/active``. Returns
    ``{error?, active_sessions, synced_sessions, bytes_uploaded, bytes_downloaded}``.
    """
    if fetch_sessions_fn is None:
        def fetch_sessions_fn(r):
            from apps.network.services.mikrotik.client import MikroTikRESTClient
            with MikroTikRESTClient.from_router(r) as client:
                resp = client.get('/ppp/active')
            if isinstance(resp, list):
                return resp
            if isinstance(resp, dict):
                return [resp]
            return []

    try:
        sessions = fetch_sessions_fn(router)
    except Exception as exc:
        return {'error': str(exc), 'active_sessions': 0, 'synced_sessions': 0,
                'bytes_uploaded': 0, 'bytes_downloaded': 0}

    today = timezone.localdate()
    count = 0
    total_up = 0
    total_down = 0
    for s in sessions or []:
        if not isinstance(s, dict):
            continue
        username = (s.get('name') or '').strip()
        if not username:
            continue
        upload = float(s.get('bytes-in') or 0)
        download = float(s.get('bytes-out') or 0)
        uptime = _parse_uptime_to_seconds(s.get('uptime') or '0s')
        customer = _resolve_customer(router, username)
        UsageLog.objects.update_or_create(
            router=router, username=username, usage_date=today,
            defaults={
                'tenant': router.tenant,
                'customer': customer,
                'upload_bytes': int(upload),
                'download_bytes': int(download),
                'uptime_seconds': int(uptime),
            },
        )
        count += 1
        total_up += upload
        total_down += download
    return {
        'error': None,
        'active_sessions': len(sessions) if isinstance(sessions, list) else 0,
        'synced_sessions': count,
        'bytes_uploaded': total_up,
        'bytes_downloaded': total_down,
    }


_UPTIME_RE = re.compile(r'^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$')


def _parse_uptime_to_seconds(value: str) -> int:
    value = (value or '').strip().lower()
    if not value:
        return 0
    # HH:MM:SS
    if re.match(r'^\d{1,2}:\d{2}:\d{2}$', value):
        h, m, s = (int(x) for x in value.split(':'))
        return h * 3600 + m * 60 + s
    # 1d2h3m4s
    if value.endswith('s'):
        m = _UPTIME_RE.match(value)
        if m and any(m.groups()):
            d = int(m.group(1) or 0); h = int(m.group(2) or 0)
            mn = int(m.group(3) or 0); s = int(m.group(4) or 0)
            return d * 86400 + h * 3600 + mn * 60 + s
    # Plain seconds
    try:
        return int(float(value))
    except ValueError:
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# Live per-session rates
# ─────────────────────────────────────────────────────────────────────────────

def _rates_cache_key(router_id: str, tenant_slug: str) -> str:
    return f'usage:rates:{tenant_slug}:router_{router_id}'


def _sample_cache_key(tenant_slug: str) -> str:
    return f'usage:online:{tenant_slug}'


def _physical_session_id(session: dict) -> str:
    """Build a stable identity key for a session — caller-id + address, or
    the username as a fallback. Mirrors the PHP rate calculation's de-dupe."""
    router_id = int(session.get('router_id') or 0)
    caller = (session.get('caller-id') or '').strip().lower()
    address = (session.get('address') or '').strip()
    user = (session.get('name') or '').strip().lower()
    physical = f'{caller}|{address}' if caller or address else user
    return f'{router_id}|{physical}' if physical else f'{router_id}|user|{user}'


def compute_live_rates(router_id: str, tenant_slug: str, *,
                       now: Optional[float] = None,
                       fetch_sessions_fn: Optional[Callable[[], Iterable[dict]]] = None,
                       sample_writer: Optional[Callable[[list[dict], float, str], None]] = None,
                       ) -> dict:
    """Compute upload/download Mbps for the given router based on per-session
    counter deltas. State lives in Django's cache.

    ``fetch_sessions_fn`` should return the live session list (any iterable
    of dicts) without writing to the DB. ``sample_writer`` is for tests:
    ``sample_writer(rows, timestamp, sample_id)``.
    """
    now = float(now or time.time())
    rates_key = _rates_cache_key(router_id, tenant_slug)
    prev = cache.get(rates_key) or {}

    sample_id = f'{tenant_slug}:{router_id}:{int(now)}'
    sessions = list(fetch_sessions_fn() if fetch_sessions_fn else [])

    current_map = {}
    for s in sessions:
        sid = _physical_session_id(s)
        current_map[sid] = {
            'download': max(0.0, float(s.get('bytes-out') or 0)),
            'upload': max(0.0, float(s.get('bytes-in') or 0)),
        }

    down_speed = 0.0
    up_speed = 0.0
    matched = 0
    same_sample = bool(prev) and prev.get('sample_id') == sample_id

    if not same_sample and prev:
        prev_ts = float(prev.get('sample_ts') or 0)
        time_diff = now - prev_ts
        prev_sessions = prev.get('sessions') or {}
        if 0.5 <= time_diff <= 120.0:
            for sid, cur in current_map.items():
                old = prev_sessions.get(sid)
                if not old:
                    continue
                old_down = float(old.get('download') or 0)
                old_up = float(old.get('upload') or 0)
                cur_down = float(cur['download'])
                cur_up = float(cur['upload'])
                if cur_down >= old_down:
                    down_speed += (cur_down - old_down)
                if cur_up >= old_up:
                    up_speed += (cur_up - old_up)
                matched += 1
            if matched > 0:
                down_speed = (down_speed * 8) / (time_diff * 1_000_000)
                up_speed = (up_speed * 8) / (time_diff * 1_000_000)

    if sample_writer is not None:
        sample_writer(sessions, now, sample_id)

    if not same_sample:
        cache.set(rates_key, {
            'sample_id': sample_id,
            'sample_ts': now,
            'sessions': current_map,
            'down_speed': down_speed,
            'up_speed': up_speed,
        }, timeout=300)

    return {
        'success': True,
        'count': sum(1 for s in sessions if int(s.get('router_id') or 0) == int(router_id) or router_id == '0'),
        'down_speed': round(down_speed, 2),
        'up_speed': round(up_speed, 2),
        'sample_id': sample_id,
        'sample_time': now,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Charts + reports
# ─────────────────────────────────────────────────────────────────────────────

def get_usage_charts(*, tenant=None, days: int = 7) -> dict:
    """Return ``{labels, upload, download}`` arrays of bytes-as-GB for the
    last ``days`` days, with empty date slots zero-filled."""
    qs = UsageLog.objects.all()
    if tenant is not None:
        qs = qs.filter(tenant=tenant)
    start = timezone.localdate() - timedelta(days=days - 1)
    rows = qs.filter(usage_date__gte=start).values('usage_date').annotate(
        up=models_sum('upload_bytes'),
        down=models_sum('download_bytes'),
    )
    by_date = {r['usage_date']: r for r in rows}

    labels, upload, download = [], [], []
    for offset in range(days - 1, -1, -1):
        d = timezone.localdate() - timedelta(days=offset)
        labels.append(d.strftime('%d %b'))
        row = by_date.get(d)
        if row:
            upload.append(round((row['up'] or 0) / 1073741824, 2))
            download.append(round((row['down'] or 0) / 1073741824, 2))
        else:
            upload.append(0)
            download.append(0)
    return {'labels': labels, 'upload': upload, 'download': download}


def _models_sum(field: str):
    """Tiny helper so we avoid an extra apps layer import for ``Sum``.

    Aliased to ``models_sum`` (the public name used by callers) for
    backwards compatibility with internal references."""
    from django.db.models import Sum
    return Sum(field)


# Public alias — callers and tests import ``models_sum``.
models_sum = _models_sum


def get_usage_reports_data(*, tenant=None, report_type: str = 'history',
                            date_from=None, date_to=None,
                            router_id: Optional[str] = None,
                            customer_id: Optional[str] = None) -> dict:
    """Roll-up reports mirroring PHP ``case 'get_usage_reports_data'``."""
    date_from = date_from or (timezone.localdate() - timedelta(days=30))
    date_to = date_to or timezone.localdate()

    qs = UsageLog.objects.filter(usage_date__gte=date_from, usage_date__lte=date_to)
    if tenant is not None:
        qs = qs.filter(tenant=tenant)
    if router_id:
        qs = qs.filter(router_id=router_id)
    if customer_id:
        qs = qs.filter(customer_id=customer_id)

    if report_type == 'top_users':
        return {'records': _report_top_users(qs)}
    if report_type == 'router_wise':
        return {'records': _report_router_wise(qs)}
    return _report_history(qs)


def _report_history(qs):
    rows = (
        qs.select_related('customer', 'router')
        .order_by('-usage_date', '-download_bytes')[:2000]
    )
    formatted = []
    total_up = 0
    total_down = 0
    for r in rows:
        total_up += r.upload_bytes
        total_down += r.download_bytes
        formatted.append({
            'date': r.usage_date.strftime('%d %b %Y'),
            'username': r.username,
            'client_name': (r.customer.full_name if r.customer else 'Deleted Customer'),
            'router_name': r.router.name,
            'upload': format_bytes(r.upload_bytes),
            'download': format_bytes(r.download_bytes),
            'total': format_bytes(r.upload_bytes + r.download_bytes),
            'uptime': format_uptime(r.uptime_seconds),
        })
    return {
        'summary': {
            'total_upload': format_bytes(total_up),
            'total_download': format_bytes(total_down),
            'total_bandwidth': format_bytes(total_up + total_down),
            'total_upload_raw': total_up,
            'total_download_raw': total_down,
        },
        'records': formatted,
    }


def _report_top_users(qs):
    rows = (
        qs.values('customer_id', 'username', 'customer__full_name', 'customer__package__name')
        .annotate(
            up=models_sum('upload_bytes'),
            down=models_sum('download_bytes'),
        )
        .order_by('-up')[:50]
    )
    formatted = []
    for i, row in enumerate(rows, 1):
        up = row['up'] or 0
        down = row['down'] or 0
        formatted.append({
            'rank': i,
            'username': row['username'],
            'client_name': row['customer__full_name'] or 'Deleted Customer',
            'package': row['customer__package__name'] or 'N/A',
            'upload': format_bytes(up),
            'download': format_bytes(down),
            'total': format_bytes(up + down),
        })
    return formatted


def _report_router_wise(qs):
    rows = (
        qs.values('router_id', 'router__name', 'router__ip_address')
        .annotate(
            up=models_sum('upload_bytes'),
            down=models_sum('download_bytes'),
        )
        .order_by('-down')
    )
    formatted = []
    for row in rows:
        up = row['up'] or 0
        down = row['down'] or 0
        formatted.append({
            'router_name': row['router__name'] or 'Deleted Router',
            'ip_address': row['router__ip_address'] or 'N/A',
            'unique_users': qs.filter(router_id=row['router_id']).values('username').distinct().count(),
            'upload': format_bytes(up),
            'download': format_bytes(down),
            'total': format_bytes(up + down),
        })
    return formatted

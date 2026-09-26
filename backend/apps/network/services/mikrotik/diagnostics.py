"""
MikroTik Diagnostics Service — Phase 21 Advanced Health.

Provides admin-facing troubleshooting reads for a MikroTik router:

  * ARP table                — /ip/arp/print
  * IP neighbor discovery    — /ip/neighbor/print
  * Routing table            — /ip/route/print
  * RouterOS log tail        — /log/print
  * On-demand ping           — /ping

All methods follow the existing convention: open a REST client, return
graceful empty values on connectivity / parsing errors so admin UI never
crashes.
"""
from __future__ import annotations

import logging
from typing import Any
from .client import MikroTikRESTClient

logger = logging.getLogger(__name__)


def _safe_str(value: Any, default: str = '') -> str:
    if value is None:
        return default
    return str(value)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value or 0)
    except (ValueError, TypeError):
        return default


def _safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None or value == '':
            return default
        return float(value)
    except (ValueError, TypeError):
        return default


def _ensure_list(resp: Any) -> list:
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        return [resp]
    return []


class MikroTikDiagnosticsService:
    """Read-only troubleshooting helpers for a MikroTik router."""

    def __init__(self, router):
        self.router = router

    # ── network readers ──────────────────────────────────────────────────
    def get_arp_table(self) -> list[dict[str, Any]]:
        """Return a flattened ARP table (``/ip/arp/print``)."""
        try:
            with MikroTikRESTClient.from_router(self.router) as client:
                resp = client.get('/ip/arp')
            rows: list[dict[str, Any]] = []
            for entry in _ensure_list(resp):
                if not isinstance(entry, dict):
                    continue
                rows.append({
                    'address':      _safe_str(entry.get('address')),
                    'mac_address':  _safe_str(entry.get('mac-address')),
                    'interface':    _safe_str(entry.get('interface')),
                    'dynamic':      _safe_str(entry.get('dynamic', 'true')).lower() == 'true',
                    'complete':     _safe_str(entry.get('complete', 'true')).lower() == 'true',
                    'comment':      _safe_str(entry.get('comment')),
                    'published':    _safe_str(entry.get('published', 'false')).lower() == 'true',
                })
            return rows
        except Exception as exc:
            logger.debug('ARP table fetch failed for router %s: %s', self.router.id, exc)
            return []

    def get_neighbor_list(self) -> list[dict[str, Any]]:
        """Return IP/neighbor discovery results (``/ip/neighbor/print``)."""
        try:
            with MikroTikRESTClient.from_router(self.router) as client:
                resp = client.get('/ip/neighbor')
            rows: list[dict[str, Any]] = []
            for entry in _ensure_list(resp):
                if not isinstance(entry, dict):
                    continue
                rows.append({
                    'address':      _safe_str(entry.get('address')),
                    'mac_address':  _safe_str(entry.get('mac-address')),
                    'identity':     _safe_str(entry.get('identity')),
                    'platform':     _safe_str(entry.get('platform')),
                    'board':        _safe_str(entry.get('board')),
                    'version':      _safe_str(entry.get('version')),
                    'interface':    _safe_str(entry.get('interface')),
                    'uptime':       _safe_str(entry.get('uptime')),
                    'last_seen':    _safe_str(entry.get('last-seen')),
                })
            return rows
        except Exception as exc:
            logger.debug('Neighbor fetch failed for router %s: %s', self.router.id, exc)
            return []

    def get_route_table(self) -> list[dict[str, Any]]:
        """Return the IPv4 routing table (``/ip/route/print``)."""
        try:
            with MikroTikRESTClient.from_router(self.router) as client:
                resp = client.get('/ip/route')
            rows: list[dict[str, Any]] = []
            for entry in _ensure_list(resp):
                if not isinstance(entry, dict):
                    continue
                rows.append({
                    'dst_address':  _safe_str(entry.get('dst-address')),
                    'gateway':      _safe_str(entry.get('gateway')),
                    'interface':    _safe_str(entry.get('interface')),
                    'distance':     _safe_int(entry.get('distance', 0)),
                    'scope':        _safe_int(entry.get('scope', 0)),
                    'target_scope': _safe_int(entry.get('target-scope', 0)),
                    'active':       _safe_str(entry.get('active', 'true')).lower() == 'true',
                    'static':       _safe_str(entry.get('static', 'false')).lower() == 'true',
                    'dynamic':      _safe_str(entry.get('dynamic', 'false')).lower() == 'true',
                    'comment':      _safe_str(entry.get('comment')),
                })
            return rows
        except Exception as exc:
            logger.debug('Route table fetch failed for router %s: %s', self.router.id, exc)
            return []

    def get_log_tail(self, max_lines: int = 200) -> list[dict[str, Any]]:
        """Return the most recent ``max_lines`` RouterOS log entries."""
        try:
            with MikroTikRESTClient.from_router(self.router) as client:
                resp = client.get('/log', params={'limit': str(max_lines)})
            rows: list[dict[str, Any]] = []
            for entry in _ensure_list(resp):
                if not isinstance(entry, dict):
                    continue
                rows.append({
                    'time':  _safe_str(entry.get('time')),
                    'topics': _safe_str(entry.get('topics')),
                    'message': _safe_str(entry.get('message')),
                })
            return rows
        except Exception as exc:
            logger.debug('Log tail fetch failed for router %s: %s', self.router.id, exc)
            return []

    # ── on-demand tools ──────────────────────────────────────────────────
    def ping(self, target: str, count: int = 4, timeout: int | None = None) -> dict[str, Any]:
        """
        Run an on-demand ping (``/ping``). Returns a structured summary plus
        the raw per-packet output. Errors degrade gracefully — the caller
        can still persist a record of the attempt.

        Note: RouterOS ``/ping`` returns text, not JSON. We accept whatever
        shape the REST client returns and surface it as ``raw_output``.
        """
        payload: dict[str, Any] = {
            'address': target,
            'count':   max(1, min(int(count or 1), 20)),
        }
        if timeout:
            payload['interval'] = f'{int(timeout)}ms'
        try:
            with MikroTikRESTClient.from_router(self.router) as client:
                resp = client.post('/ping', json_data=payload)
        except Exception as exc:
            logger.debug('Ping failed for router %s: %s', self.router.id, exc)
            return {
                'target': target,
                'status': 'ERROR',
                'received': 0,
                'packet_count': payload['count'],
                'raw_output': [{'error': str(exc)}],
                'min_latency_ms': None,
                'avg_latency_ms': None,
                'max_latency_ms': None,
            }

        raw_lines: list[Any]
        if isinstance(resp, list):
            raw_lines = resp
        elif isinstance(resp, dict):
            raw_lines = [resp]
        else:
            raw_lines = [{'text': _safe_str(resp)}]

        received = 0
        latencies: list[float] = []
        summary_min: float | None = None
        summary_avg: float | None = None
        summary_max: float | None = None
        for line in raw_lines:
            if not isinstance(line, dict):
                continue
            sent = _safe_int(line.get('sent', 0))
            received = _safe_int(line.get('received', 0))
            if sent == 0 and received == 0:
                # Some RouterOS responses only embed "time=<ms>" lines.
                t = _safe_float(line.get('time'))
                if t is not None:
                    received += 1
                    latencies.append(t)
            else:
                # Aggregate latency fields if present. RouterOS may report
                # microseconds — normalise to milliseconds heuristically.
                for key, bucket in (
                    ('min-rtt', 'min'),
                    ('avg-rtt', 'avg'),
                    ('max-rtt', 'max'),
                ):
                    val = _safe_float(line.get(key))
                    if val is None:
                        continue
                    if val > 10_000:  # heuristic: microseconds
                        val = val / 1000.0
                    if bucket == 'min':
                        summary_min = val
                    elif bucket == 'avg':
                        summary_avg = val
                    elif bucket == 'max':
                        summary_max = val
                # Use avg-rtt as the canonical per-call latency for averaging.
                if summary_avg is not None:
                    latencies.append(summary_avg)

        status = 'SUCCESS' if received > 0 else 'TIMEOUT'
        return {
            'target': target,
            'status': status,
            'received': received,
            'packet_count': payload['count'],
            'raw_output': raw_lines,
            'min_latency_ms': summary_min if summary_min is not None else (
                min(latencies) if latencies else None),
            'avg_latency_ms': summary_avg if summary_avg is not None else (
                sum(latencies) / len(latencies) if latencies else None),
            'max_latency_ms': summary_max if summary_max is not None else (
                max(latencies) if latencies else None),
        }

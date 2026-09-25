"""
Live Sessions and Realtime Traffic Service (Phase 14).
Handles active PPPoE sessions, short-lived Redis caching,
customer-to-session lookup, router active sessions,
session termination via MikroTik integration, and durable PostgreSQL history.
"""

import logging
from typing import Optional, Any
from django.core.cache import cache
from django.db import transaction, models
from django.utils import timezone

from apps.core.models import Tenant
from apps.customers.models import Customer
from apps.network.models import Router, UserSession, UserSessionHistory
from apps.network.services.mikrotik import MikroTikService
from apps.network.services.audit import log_network_action
from apps.network.services.bandwidth_rollup import aggregate_router_bandwidth

logger = logging.getLogger(__name__)

CACHE_TTL_SESSIONS = 15  # 15 seconds short-lived cache in Redis
SESSION_ONLINE_THRESHOLD_SECONDS = 120  # Session considered online if seen within 2 minutes


def _safe_int(val: Any, default: int = 0) -> int:
    if val is None or val == '':
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


class LiveSessionService:
    """
    Operator-facing live network visibility and session management.
    Never lets frontend speak directly to router devices.
    """

    @classmethod
    def get_cache_key(cls, tenant_id: str, router_id: Optional[str] = None) -> str:
        return f"live_sessions:{tenant_id}:{router_id or 'all'}"

    @classmethod
    def get_active_sessions(
        cls,
        tenant: Tenant,
        router_id: Optional[str] = None,
        search: Optional[str] = None,
        status_filter: Optional[str] = None,
        bypass_cache: bool = False
    ) -> dict[str, Any]:
        """
        Retrieves active PPPoE sessions. Uses short-lived Redis cache for high frequency.
        Correlates live hardware sessions with ERP Customer records.
        """
        cache_key = cls.get_cache_key(str(tenant.id), router_id)
        if not bypass_cache and not search:
            cached = cache.get(cache_key)
            if cached is not None:
                sessions = cached
                if status_filter:
                    sessions = [s for s in sessions if s.get('status', '').lower() == status_filter.lower()]
                return {
                    'count': len(sessions),
                    'from_cache': True,
                    'sessions': sessions
                }

        # Query database UserSession records scoped to tenant
        qs = UserSession.objects.filter(tenant=tenant).select_related('router')
        if router_id:
            qs = qs.filter(router_id=router_id)

        # Correlate with Customer records in ERP
        usernames = list(qs.values_list('username', flat=True))
        customers_map = {
            c.pppoe_username: c
            for c in Customer.objects.filter(tenant=tenant, pppoe_username__in=usernames).select_related('package')
        }

        now = timezone.now()

        # Build enriched session records
        enriched: list[dict[str, Any]] = []
        for s in qs:
            cust = customers_map.get(s.username)
            raw_rx = getattr(s, 'rx_rate_bps', None)
            raw_tx = getattr(s, 'tx_rate_bps', None)
            rx_rate = int(raw_rx) if raw_rx is not None else None
            tx_rate = int(raw_tx) if raw_tx is not None else None

            rx_rate_formatted = f"{round(rx_rate / 1_000_000, 2)} Mbps" if rx_rate is not None else "n/a"
            tx_rate_formatted = f"{round(tx_rate / 1_000_000, 2)} Mbps" if tx_rate is not None else "n/a"

            # Derive online state and status from last_seen relative to poll interval
            if s.last_seen:
                age_seconds = (now - s.last_seen).total_seconds()
                is_online = age_seconds <= SESSION_ONLINE_THRESHOLD_SECONDS
            else:
                is_online = False
            status_str = 'Online' if is_online else 'Offline'

            item = {
                'id': str(s.id),
                'username': s.username,
                'ip_address': s.ip_address,
                'mac_address': s.mac_address or (cust.mac_address if cust else ''),
                'caller_id': s.caller_id or (cust.mac_address if cust else ''),
                'uptime': s.uptime,
                'bytes_in': s.bytes_in,
                'bytes_out': s.bytes_out,
                'total_bytes': s.bytes_in + s.bytes_out,
                'rx_rate_bps': rx_rate,
                'tx_rate_bps': tx_rate,
                'rx_rate_formatted': rx_rate_formatted,
                'tx_rate_formatted': tx_rate_formatted,
                'connected_at': s.connected_at.isoformat() if s.connected_at else None,
                'last_seen': s.last_seen.isoformat() if s.last_seen else None,
                'is_online': is_online,
                'status': status_str,
                'router_id': str(s.router_id),
                'router_name': s.router.name if s.router else 'Unknown Router',
                'customer_id': str(cust.id) if cust else None,
                'customer_name': cust.full_name if cust else s.username,
                'customer_code': cust.customer_code if cust else '',
                'package_name': cust.package.name if cust and cust.package else 'Default',
                'area_zone': cust.area_zone if cust else '',
            }
            enriched.append(item)

        # Cache base list in Redis
        if not search:
            cache.set(cache_key, enriched, timeout=CACHE_TTL_SESSIONS)

        # Apply search filter in memory
        filtered = enriched
        if search:
            s_low = search.strip().lower()
            filtered = [
                item for item in enriched
                if s_low in item['username'].lower()
                or s_low in item['customer_name'].lower()
                or s_low in item['ip_address']
                or s_low in item['mac_address'].lower()
                or s_low in item['customer_code'].lower()
            ]

        if status_filter:
            filtered = [s for s in filtered if s.get('status', '').lower() == status_filter.lower()]

        return {
            'count': len(filtered),
            'from_cache': False,
            'sessions': filtered
        }

    @classmethod
    def sync_router_live_sessions(cls, router: Router, actor_username: str = 'system') -> int:
        """
        Polls physical MikroTik router for /rest/ppp/active, updates UserSession,
        and saves disconnected sessions into UserSessionHistory.
        """
        tenant = router.tenant
        svc = MikroTikService(router)
        try:
            raw_sessions = svc.get_active_sessions()
        except Exception as exc:
            logger.warning("Failed to query live sessions for router %s: %s", router.id, exc)
            return 0

        current_usernames = set()
        with transaction.atomic():
            for raw in raw_sessions:
                uname = raw.get('name') or raw.get('user')
                if not uname:
                    continue
                current_usernames.add(uname)
                ip = raw.get('address') or '0.0.0.0'
                mac = raw.get('caller-id') or ''
                raw_bin = raw.get('bytes-in')
                if raw_bin is None or raw_bin == '':
                    raw_bin = raw.get('limit-bytes-in')
                bytes_in = _safe_int(raw_bin, 0)

                raw_bout = raw.get('bytes-out')
                if raw_bout is None or raw_bout == '':
                    raw_bout = raw.get('limit-bytes-out')
                bytes_out = _safe_int(raw_bout, 0)

                uptime = raw.get('uptime', '') or ''

                UserSession.objects.update_or_create(
                    tenant=tenant,
                    router=router,
                    username=uname,
                    defaults={
                        'ip_address': ip,
                        'mac_address': mac,
                        'caller_id': mac,
                        'uptime': uptime,
                        'bytes_in': bytes_in,
                        'bytes_out': bytes_out,
                        'last_seen': timezone.now()
                    }
                )

            # Detect previously active sessions that dropped off
            stale_sessions = UserSession.objects.filter(
                tenant=tenant,
                router=router
            ).exclude(username__in=current_usernames)

            # Archive stale sessions to PostgreSQL UserSessionHistory
            history_objs = []
            for stale in stale_sessions:
                cust = Customer.objects.filter(tenant=tenant, pppoe_username=stale.username).first()
                duration = 0
                if stale.connected_at:
                    duration = max(0, int((timezone.now() - stale.connected_at).total_seconds()))

                history_objs.append(
                    UserSessionHistory(
                        tenant=tenant,
                        router=router,
                        customer=cust,
                        username=stale.username,
                        ip_address=stale.ip_address,
                        mac_address=stale.mac_address,
                        caller_id=stale.caller_id,
                        connected_at=stale.connected_at,
                        disconnected_at=timezone.now(),
                        duration_seconds=duration,
                        bytes_in=stale.bytes_in,
                        bytes_out=stale.bytes_out,
                        terminate_cause='Lost-Carrier'
                    )
                )

            if history_objs:
                UserSessionHistory.objects.bulk_create(history_objs)
            stale_sessions.delete()

        # Update router active pppoe count
        router.active_pppoe_count = len(current_usernames)
        router.last_ping = timezone.now()
        router.status = 'Online'
        router.save(update_fields=['active_pppoe_count', 'last_ping', 'status'])

        # Invalidate Redis cache
        cache.delete(cls.get_cache_key(str(tenant.id), str(router.id)))
        cache.delete(cls.get_cache_key(str(tenant.id), None))

        # Roll up the byte deltas into the daily-aggregation table so that
        # monthly bandwidth reports have an authoritative source instead of
        # having to scan raw session history.
        try:
            aggregate_router_bandwidth(router)
        except Exception as exc:
            # Never let aggregation failures break live session sync.
            logger.warning("Daily bandwidth rollup failed for router %s: %s", router.id, exc)

        return len(current_usernames)

    @classmethod
    def terminate_session(
        cls,
        tenant: Tenant,
        username: str,
        actor_username: str = 'operator',
        router: Optional[Router] = None
    ) -> dict[str, Any]:
        """
        Drops active subscriber session on physical MikroTik router,
        records session history in PostgreSQL, and invalidates Redis cache.
        """
        session = UserSession.objects.filter(tenant=tenant, username=username).select_related('router').first()
        target_router = router or (session.router if session else None)

        if not target_router:
            # Check if customer has an assigned router
            cust = Customer.objects.filter(tenant=tenant, pppoe_username=username).select_related('router').first()
            if cust and cust.router:
                target_router = cust.router

        if not target_router:
            return {'success': False, 'error': f"No active router identified for user '{username}'."}

        # 1. Execute disconnect via MikroTik Service
        router_dropped = False
        try:
            svc = MikroTikService(target_router)
            router_dropped = bool(svc.disconnect_session(username))
        except Exception as exc:
            logger.warning("Error disconnecting session on router %s for user %s: %s", target_router.name, username, exc)
            return {
                'success': False,
                'error': f"Failed to disconnect session on router {target_router.name}: {exc}",
                'router_dropped': False
            }

        if not router_dropped:
            return {
                'success': False,
                'error': f"Router {target_router.name} rejected or could not drop session for '{username}'.",
                'router_dropped': False
            }

        # 2. Archive to PostgreSQL UserSessionHistory (only when router_dropped is True)
        cust = Customer.objects.filter(tenant=tenant, pppoe_username=username).first()
        if session:
            duration = max(0, int((timezone.now() - session.connected_at).total_seconds())) if session.connected_at else 0
            UserSessionHistory.objects.create(
                tenant=tenant,
                router=target_router,
                customer=cust,
                username=username,
                ip_address=session.ip_address,
                mac_address=session.mac_address,
                caller_id=session.caller_id,
                connected_at=session.connected_at,
                disconnected_at=timezone.now(),
                duration_seconds=duration,
                bytes_in=session.bytes_in,
                bytes_out=session.bytes_out,
                terminate_cause='Admin-Reset'
            )
            session.delete()

        # 3. Invalidate Redis cache
        cache.delete(cls.get_cache_key(str(tenant.id), str(target_router.id)))
        cache.delete(cls.get_cache_key(str(tenant.id), None))

        # 4. Audit Log
        log_network_action(
            tenant=tenant,
            actor_username=actor_username,
            action='terminate_session',
            resource_type='UserSession',
            resource_id=username,
            details={
                'username': username,
                'router': target_router.name,
                'router_dropped': True
            }
        )

        return {
            'success': True,
            'message': f"Session for '{username}' terminated successfully on router {target_router.name}.",
            'router_dropped': True
        }

    @classmethod
    def get_customer_session_telemetry(cls, tenant: Tenant, customer: Customer) -> dict[str, Any]:
        """
        Returns realtime session info and historical session records for a single customer.
        """
        # Active session
        session = UserSession.objects.filter(
            tenant=tenant,
            username=customer.pppoe_username
        ).select_related('router').first()

        active_data = None
        if session:
            raw_rx = getattr(session, 'rx_rate_bps', None)
            raw_tx = getattr(session, 'tx_rate_bps', None)
            rx_rate = int(raw_rx) if raw_rx is not None else None
            tx_rate = int(raw_tx) if raw_tx is not None else None

            rx_rate_formatted = f"{round(rx_rate / 1_000_000, 2)} Mbps" if rx_rate is not None else "n/a"
            tx_rate_formatted = f"{round(tx_rate / 1_000_000, 2)} Mbps" if tx_rate is not None else "n/a"

            active_data = {
                'id': str(session.id),
                'username': session.username,
                'ip_address': session.ip_address,
                'mac_address': session.mac_address,
                'caller_id': session.caller_id,
                'uptime': session.uptime,
                'bytes_in': session.bytes_in,
                'bytes_out': session.bytes_out,
                'total_bytes': session.bytes_in + session.bytes_out,
                'rx_rate_bps': rx_rate,
                'tx_rate_bps': tx_rate,
                'rx_rate_formatted': rx_rate_formatted,
                'tx_rate_formatted': tx_rate_formatted,
                'connected_at': session.connected_at.isoformat() if session.connected_at else None,
                'last_seen': session.last_seen.isoformat() if session.last_seen else None,
                'router_name': session.router.name if session.router else '',
                'is_online': True
            }

        # Historical sessions
        base_history_qs = UserSessionHistory.objects.filter(
            tenant=tenant,
            username=customer.pppoe_username
        )
        history_qs = base_history_qs.select_related('router').order_by('-disconnected_at')[:20]

        history_list = [
            {
                'id': str(h.id),
                'username': h.username,
                'ip_address': h.ip_address,
                'mac_address': h.mac_address,
                'connected_at': h.connected_at.isoformat() if h.connected_at else None,
                'disconnected_at': h.disconnected_at.isoformat() if h.disconnected_at else None,
                'duration_seconds': h.duration_seconds,
                'duration_formatted': f"{h.duration_seconds // 3600}h {(h.duration_seconds % 3600) // 60}m {h.duration_seconds % 60}s",
                'bytes_in': h.bytes_in,
                'bytes_out': h.bytes_out,
                'total_bytes': h.bytes_in + h.bytes_out,
                'terminate_cause': h.terminate_cause,
                'router_name': h.router.name if h.router else 'Unknown'
            }
            for h in history_qs
        ]

        # Aggregate total consumption across ALL historical sessions
        totals = base_history_qs.aggregate(
            total_in=models.Sum('bytes_in'),
            total_out=models.Sum('bytes_out'),
            total_duration=models.Sum('duration_seconds')
        )

        return {
            'is_online': bool(session),
            'active_session': active_data,
            'session_history': history_list,
            'aggregates': {
                'total_bytes_in': totals['total_in'] or 0,
                'total_bytes_out': totals['total_out'] or 0,
                'total_bytes': (totals['total_in'] or 0) + (totals['total_out'] or 0),
                'total_duration_seconds': totals['total_duration'] or 0,
                'total_sessions_count': base_history_qs.count() + (1 if session else 0)
            }
        }

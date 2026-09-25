"""
Multi-method online subscriber detection (Networking migration delta 2).

Mirrors the legacy `MikrotikApp::stats()` three-tier fallback:

    1. PPPoE active   (/rest/ppp/active?name=<user>)
    2. DHCP lease     (/rest/ip/dhcp-server/lease/print?host-name=<user>)
    3. Static IP      (/rest/queue/simple/print?name=<user> + /rest/ip/arp)

Each tier tries in order; first match wins. This lets the same cockpit work
for deployments that ship DHCP-only or static-IP subscribers (no PPPoE).

The service is gated behind `settings.NETWORK_ENABLE_MULTIMETHOD_ONLINE`.
When the flag is False (default) all callers receive None and fall back to
the legacy PPPoE-only path, so existing deployments are not affected.
"""
import logging
import urllib.parse
from dataclasses import dataclass, field
from typing import Any, Optional

from django.conf import settings

from apps.network.models import Router
from apps.network.services.mikrotik import MikroTikService
from apps.network.services.mikrotik.client import MikroTikRESTClient

logger = logging.getLogger(__name__)


@dataclass
class OnlineStatus:
    online: bool = False
    method: str = ''               # 'pppoe' | 'dhcp' | 'static_arp' | ''
    ip_address: str = ''
    mac_address: str = ''
    raw: dict[str, Any] = field(default_factory=dict)


def _safe_query(client, path: str, **filters) -> list[dict[str, Any]]:
    """Runs a GET against the REST client with safe error handling."""
    if filters:
        path = f"{path}?{urllib.parse.urlencode(filters)}"
    try:
        resp = client.get(path)
    except Exception as exc:
        logger.debug("online_detection GET %s failed: %s", path, exc)
        return []
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        return [resp]
    return []


def _pppoe_check(svc: MikroTikService, username: str) -> Optional[OnlineStatus]:
    """Tier 1: PPPoE /rest/ppp/active?name=<user>"""
    try:
        with MikroTikRESTClient.from_router(svc.router) as client:
            items = _safe_query(client, '/ppp/active', name=username)
            for item in items:
                if (item.get('name') or '').lower() == username.lower():
                    return OnlineStatus(
                        online=True,
                        method='pppoe',
                        ip_address=item.get('address', '') or '',
                        mac_address=item.get('caller-id', '') or '',
                        raw=item,
                    )
    except Exception as exc:
        logger.debug("pppoe_check failed for %s: %s", username, exc)
    return None


def _dhcp_check(svc: MikroTikService, username: str) -> Optional[OnlineStatus]:
    """Tier 2: DHCP /rest/ip/dhcp-server/lease/print?host-name=<user>"""
    try:
        with MikroTikRESTClient.from_router(svc.router) as client:
            items = _safe_query(client, '/ip/dhcp-server/lease/print', **{'host-name': username})
            for item in items:
                status = (item.get('status') or '').lower()
                if status == 'bound':
                    return OnlineStatus(
                        online=True,
                        method='dhcp',
                        ip_address=item.get('address', '') or '',
                        mac_address=item.get('mac-address', '') or '',
                        raw=item,
                    )
    except Exception as exc:
        logger.debug("dhcp_check failed for %s: %s", username, exc)
    return None


def _static_arp_check(svc: MikroTikService, username: str) -> Optional[OnlineStatus]:
    """Tier 3: simple-queue target → ARP."""
    try:
        with MikroTikRESTClient.from_router(svc.router) as client:
            queues = _safe_query(client, '/queue/simple/print', name=username)
            if not queues:
                return None
            target = (queues[0].get('target') or '').split('/')[0]
            if not target:
                return None
            arp_items = _safe_query(client, '/ip/arp/print', address=target)
            for item in arp_items:
                if item.get('address') == target:
                    return OnlineStatus(
                        online=True,
                        method='static_arp',
                        ip_address=target,
                        mac_address=item.get('mac-address', '') or '',
                        raw={'queue': queues[0], 'arp': item},
                    )
    except Exception as exc:
        logger.debug("static_arp_check failed for %s: %s", username, exc)
    return None


def get_online_status(router: Router, username: str) -> Optional[OnlineStatus]:
    """
    Public entry point. Returns OnlineStatus or None when the feature flag is
    disabled OR when none of the three detection tiers matched.

    Callers should fall back to the legacy single-method (PPPoE only) path
    when this returns None.
    """
    if not getattr(settings, 'NETWORK_ENABLE_MULTIMETHOD_ONLINE', False):
        return None

    svc = MikroTikService(router)

    for checker in (_pppoe_check, _dhcp_check, _static_arp_check):
        try:
            result = checker(svc, username)
        except Exception as exc:
            logger.debug("online_detection tier %s raised: %s", checker.__name__, exc)
            result = None
        if result is not None:
            return result

    return None

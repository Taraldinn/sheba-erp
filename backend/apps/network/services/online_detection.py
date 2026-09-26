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
import ipaddress
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


def _is_truthy(val: Any) -> bool:
    """Checks if a RouterOS boolean/string flag is truthy ('true', 'yes', '1', True)."""
    if isinstance(val, bool):
        return val
    return str(val or '').strip().lower() in ('true', 'yes', '1')


def _is_valid_mac(mac: str) -> bool:
    """
    Validates that a MAC address is non-empty, contains valid hex digits,
    and is not an all-zero or all-ones dummy/broadcast address.
    """
    if not mac:
        return False
    mac_clean = str(mac).strip().lower().replace('-', ':')
    if mac_clean in (
        '00:00:00:00:00:00', 'ff:ff:ff:ff:ff:ff',
        '00-00-00-00-00-00', 'ff-ff-ff-ff-ff-ff',
    ):
        return False

    hex_digits = mac_clean.replace(':', '')
    if not hex_digits:
        return False

    # Must contain only valid hex characters
    if not all(c in '0123456789abcdef' for c in hex_digits):
        return False

    # Reject dummy all-zeros or all-ones
    if set(hex_digits) == {'0'} or set(hex_digits) == {'f'}:
        return False

    return True


def _is_valid_host_ip(ip_str: str) -> bool:
    """Validates that ip_str is a valid unicast host IP (not 0.0.0.0, loopback, multicast, etc)."""
    if not ip_str:
        return False
    try:
        addr = ipaddress.ip_address(str(ip_str).strip())
        if addr.is_unspecified or addr.is_loopback or addr.is_multicast or addr.is_reserved:
            return False
        return True
    except ValueError:
        return False


def _extract_single_host_target(target_str: str) -> Optional[str]:
    """
    Extracts target IP if it represents a single host (/32 or no mask).
    Rejects subnets (e.g. /24) to avoid attributing unrelated ARP entries
    on shared subnets to a single subscriber.
    """
    if not target_str:
        return None
    target_clean = str(target_str).strip()
    try:
        net = ipaddress.ip_network(target_clean, strict=False)
        # Ensure it's a single host (/32 IPv4 or /128 IPv6)
        if net.num_addresses != 1:
            logger.debug(
                "Simple queue target %s is a subnet (%d hosts), ignoring for single subscriber",
                target_str,
                net.num_addresses,
            )
            return None
        host_ip = str(net.network_address)
        if not _is_valid_host_ip(host_ip):
            return None
        return host_ip
    except ValueError:
        # Fallback to plain host IP check
        plain = target_clean.split('/')[0].strip()
        if _is_valid_host_ip(plain):
            return plain
        return None


def _safe_query(client: Any, path: str, **filters) -> list[dict[str, Any]]:
    """Runs a GET against the REST client with safe error and malformed response handling."""
    if filters:
        path = f"{path}?{urllib.parse.urlencode(filters)}"
    try:
        resp = client.get(path)
    except Exception as exc:
        logger.debug("online_detection GET %s failed: %s", path, exc)
        return []

    if resp is None:
        return []

    if isinstance(resp, list):
        clean_list = []
        for item in resp:
            if isinstance(item, dict):
                # Filter out error dictionaries returned inside lists
                if 'error' in item or 'detail' in item or 'message' in item:
                    continue
                clean_list.append(item)
        return clean_list

    if isinstance(resp, dict):
        if 'error' in resp or 'detail' in resp or 'message' in resp:
            return []
        return [resp]

    # Non-dict, non-list (e.g. HTML string, int)
    return []


def _pppoe_check(svc: MikroTikService, username: str) -> Optional[OnlineStatus]:
    """
    Tier 1: PPPoE /rest/ppp/active?name=<user>
    Matches active PPPoE session strictly by name.
    """
    clean_uname = username.strip().lower()
    try:
        with MikroTikRESTClient.from_router(svc.router) as client:
            items = _safe_query(client, '/ppp/active', name=username)
            for item in items:
                item_name = str(item.get('name') or '').strip().lower()
                if item_name == clean_uname:
                    return OnlineStatus(
                        online=True,
                        method='pppoe',
                        ip_address=str(item.get('address') or '').strip(),
                        mac_address=str(item.get('caller-id') or '').strip(),
                        raw=item,
                    )
    except Exception as exc:
        logger.debug("pppoe_check failed for %s: %s", username, exc)
    return None


def _dhcp_check(svc: MikroTikService, username: str) -> Optional[OnlineStatus]:
    """
    Tier 2: DHCP /rest/ip/dhcp-server/lease/print?host-name=<user>
    Requires exact hostname/comment match, status == 'bound', non-disabled,
    non-invalid, valid host IP, and valid MAC address.
    """
    clean_uname = username.strip().lower()
    try:
        with MikroTikRESTClient.from_router(svc.router) as client:
            items = _safe_query(client, '/ip/dhcp-server/lease/print', **{'host-name': username})
            for item in items:
                # Check candidate identifier fields
                candidates = {
                    str(item.get(k) or '').strip().lower()
                    for k in ('host-name', 'active-host-name', 'comment')
                    if item.get(k)
                }
                if clean_uname not in candidates:
                    continue

                # Status must be strictly 'bound'
                status = str(item.get('status') or '').strip().lower()
                if status != 'bound':
                    continue

                # Must not be disabled or invalid
                if _is_truthy(item.get('disabled')) or _is_truthy(item.get('invalid')):
                    continue

                ip_addr = str(item.get('address') or '').strip()
                if not _is_valid_host_ip(ip_addr):
                    continue

                mac_addr = str(item.get('mac-address') or '').strip()
                if not _is_valid_mac(mac_addr):
                    continue

                return OnlineStatus(
                    online=True,
                    method='dhcp',
                    ip_address=ip_addr,
                    mac_address=mac_addr,
                    raw=item,
                )
    except Exception as exc:
        logger.debug("dhcp_check failed for %s: %s", username, exc)
    return None


def _static_arp_check(svc: MikroTikService, username: str) -> Optional[OnlineStatus]:
    """
    Tier 3: simple-queue target → ARP.
    Matches active simple queue, ensures target is a valid single-host IP
    (not a shared subnet), and verifies matching active, non-disabled,
    complete ARP entry with valid MAC.
    """
    clean_uname = username.strip().lower()
    try:
        with MikroTikRESTClient.from_router(svc.router) as client:
            queues = _safe_query(client, '/queue/simple/print', name=username)
            matched_queue = None
            for q in queues:
                q_name = str(q.get('name') or '').strip().lower()
                if q_name == clean_uname:
                    # Queue must not be disabled or invalid
                    if _is_truthy(q.get('disabled')) or _is_truthy(q.get('invalid')):
                        continue
                    matched_queue = q
                    break

            if not matched_queue:
                return None

            target_raw = str(matched_queue.get('target') or '').strip()
            target_ip = _extract_single_host_target(target_raw)
            if not target_ip:
                return None

            arp_items = _safe_query(client, '/ip/arp/print', address=target_ip)
            for item in arp_items:
                if str(item.get('address') or '').strip() != target_ip:
                    continue

                # Validate ARP entry is active and not disabled/invalid/incomplete/failed
                if _is_truthy(item.get('disabled')) or _is_truthy(item.get('invalid')):
                    continue

                arp_status = str(item.get('status') or '').strip().lower()
                if arp_status in ('failed', 'incomplete'):
                    continue

                # RouterOS incomplete ARP has complete='false'
                if str(item.get('complete', '')).strip().lower() in ('false', 'no', '0'):
                    continue

                mac_addr = str(item.get('mac-address') or '').strip()
                if not _is_valid_mac(mac_addr):
                    continue

                return OnlineStatus(
                    online=True,
                    method='static_arp',
                    ip_address=target_ip,
                    mac_address=mac_addr,
                    raw={'queue': matched_queue, 'arp': item},
                )
    except Exception as exc:
        logger.debug("static_arp_check failed for %s: %s", username, exc)
    return None


def get_online_status(
    router: Router,
    username: str,
    tenant: Optional[Any] = None,
) -> Optional[OnlineStatus]:
    """
    Public entry point for multi-method online subscriber detection.

    Intended fallback order (deterministic precedence):
        1. PPPoE   (/rest/ppp/active?name=<user>)
        2. DHCP    (/rest/ip/dhcp-server/lease/print?host-name=<user>)
        3. static ARP (/rest/queue/simple/print?name=<user> + /rest/ip/arp)

    Safety & Scoping Rules:
        - Gated behind settings.NETWORK_ENABLE_MULTIMETHOD_ONLINE (default=False).
          When False, returns None immediately without calling the router.
        - Scoped strictly to the provided `router`.
        - If `tenant` is provided, ensures router.tenant_id matches tenant.id;
          cross-tenant requests return None immediately.
        - Guarded against missing router connection parameters (IP, username, active flag).
        - Guarded against false positives: verifies exact hostname/comment,
          active/bound status, valid host IPs, and non-dummy MAC addresses.

    Returns:
        OnlineStatus if subscriber is detected online.
        None if subscriber is offline, feature flag is disabled, or errors occurred.
    """
    if not getattr(settings, 'NETWORK_ENABLE_MULTIMETHOD_ONLINE', False):
        return None

    if not router or not username or not str(username).strip():
        return None

    # Guard against missing router configuration
    effective_host = getattr(router, 'effective_host', None) or getattr(router, 'ip_address', None)
    if not effective_host or not getattr(router, 'username', None):
        logger.debug("online_detection skipped: router %s missing host or credentials", router)
        return None

    if getattr(router, 'is_active', True) is False:
        logger.debug("online_detection skipped: router %s is inactive", router)
        return None

    # Enforce tenant isolation if tenant is specified
    if tenant is not None:
        expected_tenant_id = getattr(tenant, 'id', tenant)
        router_tenant_id = getattr(router, 'tenant_id', None)
        if router_tenant_id is not None and expected_tenant_id is not None:
            if str(router_tenant_id) != str(expected_tenant_id):
                logger.warning(
                    "Tenant isolation blocked online_detection: router %s belongs to tenant %s, not %s",
                    getattr(router, 'id', router),
                    router_tenant_id,
                    expected_tenant_id,
                )
                return None

    svc = MikroTikService(router)
    clean_username = str(username).strip()

    # Deterministic Precedence: PPPoE (Tier 1) -> DHCP (Tier 2) -> Static ARP (Tier 3)
    for checker in (_pppoe_check, _dhcp_check, _static_arp_check):
        try:
            result = checker(svc, clean_username)
        except Exception as exc:
            logger.debug("online_detection tier %s raised: %s", checker.__name__, exc)
            result = None
        if result is not None:
            return result

    return None

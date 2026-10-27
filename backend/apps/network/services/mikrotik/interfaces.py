"""
MikroTik Interface Service.
Handles /rest/interface querying, statuses, MAC addresses, and traffic counters.
"""
import logging
from typing import Any
from .client import MikroTikRESTClient

logger = logging.getLogger(__name__)


def _safe_int(value: Any, default: int = 0) -> int:
    """Parse a value to int, returning default on any error."""
    try:
        return int(value or 0)
    except (ValueError, TypeError):
        return default


def _safe_bool(value: Any) -> bool:
    """Coerce RouterOS 'true'/'false' strings or Python bools to bool."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == 'true'
    return bool(value)


class MikroTikInterfaceService:
    """
    Manages network interfaces on MikroTik routers via RouterOS v7 REST.
    """

    def __init__(self, router):
        self.router = router

    def list_interfaces(self) -> list[dict[str, Any]]:
        """
        Fetches list of raw interface objects from /rest/interface.
        """
        with MikroTikRESTClient.from_router(self.router) as client:
            resp = client.get('/interface')
            if isinstance(resp, list):
                return resp
            if isinstance(resp, dict):
                return [resp]
            return []

    def get_interface_health(self) -> list[dict[str, Any]]:
        """
        Returns structured health data for each router interface from /rest/interface.

        Each entry includes:
          - name, type, running, disabled
          - mac_address, mtu
          - rx_bytes, tx_bytes, rx_errors, tx_errors (cumulative counters)
          - comment (operator notes)

        Returns an empty list on any connectivity or parsing error — callers
        should treat a missing or empty list as 'telemetry unavailable'.
        """
        try:
            with MikroTikRESTClient.from_router(self.router) as client:
                resp = client.get('/interface')

            raw: list = (
                resp
                if isinstance(resp, list)
                else ([resp] if isinstance(resp, dict) else [])
            )

            result = []
            for iface in raw:
                if not isinstance(iface, dict):
                    continue

                result.append({
                    'name':        iface.get('name', ''),
                    'type':        iface.get('type', 'ether'),
                    'running':     _safe_bool(iface.get('running', False)),
                    'disabled':    _safe_bool(iface.get('disabled', False)),
                    'mac_address': iface.get('mac-address', ''),
                    'mtu':         _safe_int(iface.get('mtu', 1500), 1500),
                    'rx_bytes':    _safe_int(iface.get('rx-byte', 0)),
                    'tx_bytes':    _safe_int(iface.get('tx-byte', 0)),
                    'rx_errors':   _safe_int(iface.get('rx-error', 0)),
                    'tx_errors':   _safe_int(iface.get('tx-error', 0)),
                    'comment':     iface.get('comment', ''),
                })
            return result

        except Exception as exc:
            logger.debug(
                "Interface health fetch failed for router %s: %s",
                self.router.id, exc
            )
            return []

    def get_interface_counters_extended(self) -> list[dict[str, Any]]:
        """
        Returns an enriched view of every interface for the Advanced Health
        screen and the daily InterfaceSnapshot archive. Combines
        ``/interface/print`` (state) with ``/interface/monitor-traffic``
        (live rx/tx rate) when available.

        Each entry includes the basic health fields plus:
          - link_downs (cumulative link-down count)
          - rx_drop, tx_drop (drop counters)
          - rx_rate_bps, tx_rate_bps (best-effort live rate, may be 0)
          - last_link_up_time, last_link_down_time
          - comment

        Returns an empty list on any connectivity or parsing error so the
        caller can render an "unavailable" state instead of crashing.
        """
        try:
            with MikroTikRESTClient.from_router(self.router) as client:
                ifaces_resp = client.get('/interface')
                monitor_resp: Any = []
                try:
                    monitor_resp = client.get('/interface/monitor-traffic')
                except Exception:
                    monitor_resp = []

            raw = (
                ifaces_resp
                if isinstance(ifaces_resp, list)
                else ([ifaces_resp] if isinstance(ifaces_resp, dict) else [])
            )

            # Build a lookup of monitor-traffic rows by interface name.
            monitor_by_name: dict[str, dict[str, Any]] = {}
            if isinstance(monitor_resp, list):
                for m in monitor_resp:
                    if isinstance(m, dict) and m.get('name'):
                        monitor_by_name[m['name']] = m

            result: list[dict[str, Any]] = []
            for iface in raw:
                if not isinstance(iface, dict):
                    continue
                name = iface.get('name', '')
                monitor = monitor_by_name.get(name, {}) or {}
                result.append({
                    'name':         name,
                    'type':         iface.get('type', 'ether'),
                    'running':      _safe_bool(iface.get('running', False)),
                    'disabled':     _safe_bool(iface.get('disabled', False)),
                    'mac_address':  iface.get('mac-address', ''),
                    'mtu':          _safe_int(iface.get('mtu', 1500), 1500),
                    'rx_bytes':     _safe_int(iface.get('rx-byte', 0)),
                    'tx_bytes':     _safe_int(iface.get('tx-byte', 0)),
                    'rx_errors':    _safe_int(iface.get('rx-error', 0)),
                    'tx_errors':    _safe_int(iface.get('tx-error', 0)),
                    'rx_drop':      _safe_int(iface.get('rx-drop', 0)),
                    'tx_drop':      _safe_int(iface.get('tx-drop', 0)),
                    'link_downs':   _safe_int(iface.get('link-downs', 0)),
                    'rx_rate_bps':  _safe_int(monitor.get('rx-bits-per-second', 0)),
                    'tx_rate_bps':  _safe_int(monitor.get('tx-bits-per-second', 0)),
                    'last_link_up_time':   iface.get('last-link-up-time', ''),
                    'last_link_down_time': iface.get('last-link-down-time', ''),
                    'comment':      iface.get('comment', ''),
                })
            return result

        except Exception as exc:
            logger.debug(
                "Extended interface counters fetch failed for router %s: %s",
                self.router.id, exc
            )
            return []

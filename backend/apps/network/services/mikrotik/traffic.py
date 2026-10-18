"""
MikroTik Live Traffic & Interface Telemetry Service.
Collects interface traffic, rates, and bandwidth counters from RouterOS v7 REST and binary API.
"""
import logging
from typing import Any, Optional
from .client import MikroTikRESTClient, RouterClient

logger = logging.getLogger(__name__)


class MikroTikTrafficService:
    """
    Collects interface traffic and rates from RouterOS (REST or binary API).
    """

    def __init__(self, router):
        self.router = router

    @property
    def is_rest(self) -> bool:
        return getattr(self.router, 'api_protocol', 'REST') == 'REST'

    def get_interface_traffic(self, interface_name: str) -> dict[str, Any]:
        """Monitors real-time traffic (rx/tx bps, packets) on a specific interface."""
        if not interface_name:
            return {}

        if self.is_rest:
            try:
                with MikroTikRESTClient.from_router(self.router) as client:
                    resp = client.post('/interface/monitor-traffic', json_data={
                        'interface': interface_name,
                        'once': 'true',
                    })
                    if isinstance(resp, list) and resp:
                        return resp[0]
                    if isinstance(resp, dict):
                        return resp
            except Exception as exc:
                logger.debug("REST monitor-traffic failed for %s: %s", interface_name, exc)
            return {}

        # Binary API protocol
        try:
            with RouterClient.from_router(self.router) as client:
                res = client._api.get_binary_resource('/').call('interface/monitor-traffic', {
                    'interface': interface_name.encode('utf-8') if isinstance(interface_name, str) else interface_name,
                    'once': b''
                })
                if isinstance(res, list) and res:
                    row = res[0]
                    normalized: dict[str, Any] = {}
                    for k, v in row.items():
                        k_str = k.decode('utf-8', errors='ignore') if isinstance(k, bytes) else str(k)
                        v_str = v.decode('utf-8', errors='ignore') if isinstance(v, bytes) else str(v)
                        normalized[k_str] = v_str
                    return normalized
        except Exception as exc:
            logger.debug("Binary API monitor-traffic failed for %s: %s", interface_name, exc)
        return {}

    def get_all_interfaces(self) -> list[dict[str, Any]]:
        """Queries interfaces and their cumulative bytes."""
        if self.is_rest:
            try:
                with MikroTikRESTClient.from_router(self.router) as client:
                    resp = client.get('/interface')
                    if isinstance(resp, list):
                        return resp
                    if isinstance(resp, dict):
                        return [resp]
            except Exception as exc:
                logger.debug("REST get_all_interfaces failed: %s", exc)
            return []

        # Binary API protocol
        try:
            with RouterClient.from_router(self.router) as client:
                res = client.run_command('/interface')
                if isinstance(res, list):
                    return res
        except Exception as exc:
            logger.debug("Binary API get_all_interfaces failed: %s", exc)
        return []

    def get_aggregate_traffic(self) -> dict[str, Any]:
        """Calculates or extracts overall bandwidth utilization."""
        interfaces = self.get_all_interfaces()
        total_rx = sum(int(i.get('rx-byte', 0) or i.get('rx_byte', 0) or 0) for i in interfaces)
        total_tx = sum(int(i.get('tx-byte', 0) or i.get('tx_byte', 0) or 0) for i in interfaces)
        return {
            'router_id': str(self.router.id),
            'router_name': self.router.name,
            'interface_count': len(interfaces),
            'total_rx_bytes': total_rx,
            'total_tx_bytes': total_tx,
            'interfaces': [
                {
                    'name': i.get('name'),
                    'type': i.get('type'),
                    'running': str(i.get('running', '')).lower() in ('true', 'yes', '1'),
                    'rx_bytes': int(i.get('rx-byte', 0) or i.get('rx_byte', 0) or 0),
                    'tx_bytes': int(i.get('tx-byte', 0) or i.get('tx_byte', 0) or 0),
                }
                for i in interfaces[:10]
            ]
        }

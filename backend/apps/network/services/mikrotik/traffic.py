"""
MikroTik Live Traffic & Interface Telemetry Service.
Collects interface traffic, rates, and bandwidth counters from RouterOS v7.
"""
import logging
from typing import Any, Optional
from .client import MikroTikRESTClient

logger = logging.getLogger(__name__)


class MikroTikTrafficService:
    """
    Collects interface traffic and rates from RouterOS v7.
    """

    def __init__(self, router):
        self.router = router

    def get_interface_traffic(self, interface_name: str) -> dict[str, Any]:
        """Monitors real-time traffic (rx/tx bps, packets) on a specific interface."""
        with MikroTikRESTClient.from_router(self.router) as client:
            resp = client.post('/interface/monitor-traffic', json_data={
                'interface': interface_name,
                'once': 'true',
            })
            if isinstance(resp, list) and resp:
                return resp[0]
            if isinstance(resp, dict):
                return resp
            return {}

    def get_all_interfaces(self) -> list[dict[str, Any]]:
        """Queries /rest/interface for all interfaces and their cumulative bytes."""
        with MikroTikRESTClient.from_router(self.router) as client:
            resp = client.get('/interface')
            if isinstance(resp, list):
                return resp
            if isinstance(resp, dict):
                return [resp]
            return []

    def get_aggregate_traffic(self) -> dict[str, Any]:
        """Calculates or extracts overall bandwidth utilization."""
        interfaces = self.get_all_interfaces()
        total_rx = sum(int(i.get('rx-byte', 0) or 0) for i in interfaces)
        total_tx = sum(int(i.get('tx-byte', 0) or 0) for i in interfaces)
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
                    'running': i.get('running') in (True, 'true'),
                    'rx_bytes': int(i.get('rx-byte', 0) or 0),
                    'tx_bytes': int(i.get('tx-byte', 0) or 0),
                }
                for i in interfaces[:10]
            ]
        }

"""
MikroTik Live Traffic & Interface Telemetry Service (Phase N7 Foundation).
"""
import logging
from typing import Any
from .client import MikroTikRESTClient

logger = logging.getLogger(__name__)


class MikroTikTrafficService:
    """
    Collects interface traffic and rates from RouterOS v7.
    """

    def __init__(self, router):
        self.router = router

    def get_interface_traffic(self, interface_name: str) -> dict[str, Any]:
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

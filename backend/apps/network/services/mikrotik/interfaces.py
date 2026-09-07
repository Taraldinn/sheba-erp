"""
MikroTik Interface Service (Phase N2 Foundation).
Handles /rest/interface querying, statuses, MAC addresses, and packet counters.
"""
import logging
from typing import Any
from .client import MikroTikRESTClient

logger = logging.getLogger(__name__)


class MikroTikInterfaceService:
    """
    Manages network interfaces on MikroTik routers via RouterOS v7 REST.
    """

    def __init__(self, router):
        self.router = router

    def list_interfaces(self) -> list[dict[str, Any]]:
        """
        Fetches list of interfaces from /rest/interface.
        """
        with MikroTikRESTClient.from_router(self.router) as client:
            resp = client.get('/interface')
            if isinstance(resp, list):
                return resp
            if isinstance(resp, dict):
                return [resp]
            return []

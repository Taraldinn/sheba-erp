"""
MikroTik PPPoE Active Sessions Service (Phase N3 Foundation).
Queries /rest/ppp/active and synchronizes active subscriber sessions.
"""
import logging
from typing import Any
from .client import MikroTikRESTClient

logger = logging.getLogger(__name__)


class MikroTikSessionService:
    """
    Manages active PPPoE subscriber sessions on MikroTik routers via RouterOS v7 REST.
    """

    def __init__(self, router):
        self.router = router

    def get_active_sessions(self) -> list[dict[str, Any]]:
        """
        Retrieves active PPPoE sessions from /rest/ppp/active.
        """
        with MikroTikRESTClient.from_router(self.router) as client:
            resp = client.get('/ppp/active')
            if isinstance(resp, list):
                return resp
            if isinstance(resp, dict):
                return [resp]
            return []

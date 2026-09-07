"""
MikroTik PPPoE User & Profile Management Service (Phase N4 & N5 Foundation).
Controls subscriber credentials, profiles, queues, and disconnection.
"""
import logging
from typing import Any, Optional
from .client import MikroTikRESTClient

logger = logging.getLogger(__name__)


class MikroTikPPPoEService:
    """
    Manages PPPoE secrets (/rest/ppp/secret) and profiles (/rest/ppp/profile) on RouterOS v7.
    """

    def __init__(self, router):
        self.router = router

    def list_secrets(self) -> list[dict[str, Any]]:
        with MikroTikRESTClient.from_router(self.router) as client:
            resp = client.get('/ppp/secret')
            if isinstance(resp, list):
                return resp
            if isinstance(resp, dict):
                return [resp]
            return []

    def create_user(self, username: str, password: str, profile: str = 'default', comment: str = '') -> bool:
        with MikroTikRESTClient.from_router(self.router) as client:
            client.put('/ppp/secret', json_data={
                'name': username,
                'password': password,
                'service': 'pppoe',
                'profile': profile,
                'comment': comment,
            })
            return True

    def disable_user(self, user_id: str) -> bool:
        with MikroTikRESTClient.from_router(self.router) as client:
            client.patch(f'/ppp/secret/{user_id}', json_data={'disabled': 'true'})
            return True

    def enable_user(self, user_id: str) -> bool:
        with MikroTikRESTClient.from_router(self.router) as client:
            client.patch(f'/ppp/secret/{user_id}', json_data={'disabled': 'false'})
            return True

    def disconnect_session(self, session_id: str) -> bool:
        with MikroTikRESTClient.from_router(self.router) as client:
            client.delete(f'/ppp/active/{session_id}')
            return True

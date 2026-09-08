"""
MikroTik PPPoE User & Profile Management Service.
Controls subscriber credentials, profiles, queues, and active session disconnection.
Supports RouterOS v7+ REST API.
"""
import logging
from typing import Any, Optional
from .client import MikroTikRESTClient

logger = logging.getLogger(__name__)


class MikroTikPPPoEService:
    """
    Manages PPPoE secrets (/rest/ppp/secret), profiles (/rest/ppp/profile),
    and active sessions (/rest/ppp/active) on RouterOS v7.
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

    def find_secret_by_name(self, username: str) -> Optional[dict[str, Any]]:
        """Finds a PPPoE secret by username from /rest/ppp/secret."""
        with MikroTikRESTClient.from_router(self.router) as client:
            try:
                resp = client.get(f'/ppp/secret?name={username}')
                items = resp if isinstance(resp, list) else ([resp] if isinstance(resp, dict) else [])
                for item in items:
                    if item.get('name') == username:
                        return item
            except Exception:
                pass

            # Fallback to full list scan if query filter is unsupported
            for secret in self.list_secrets():
                if secret.get('name') == username:
                    return secret
        return None

    def create_user(
        self,
        username: str,
        password: str,
        profile: str = 'default',
        comment: str = '',
        service: str = 'pppoe'
    ) -> bool:
        with MikroTikRESTClient.from_router(self.router) as client:
            client.put('/ppp/secret', json_data={
                'name': username,
                'password': password,
                'service': service,
                'profile': profile,
                'comment': comment,
            })
            logger.info("Created PPPoE user '%s' on %s", username, self.router.name)
            return True

    def update_user_by_name(
        self,
        username: str,
        password: Optional[str] = None,
        profile: Optional[str] = None,
        disabled: Optional[bool] = None,
        comment: Optional[str] = None
    ) -> bool:
        secret = self.find_secret_by_name(username)
        if not secret:
            logger.warning("PPPoE secret '%s' not found on router %s", username, self.router.name)
            return False

        secret_id = secret.get('.id') or secret.get('id') or username
        payload = {}
        if password is not None:
            payload['password'] = password
        if profile is not None:
            payload['profile'] = profile
        if disabled is not None:
            payload['disabled'] = 'true' if disabled else 'false'
        if comment is not None:
            payload['comment'] = comment

        if not payload:
            return True

        with MikroTikRESTClient.from_router(self.router) as client:
            client.patch(f'/ppp/secret/{secret_id}', json_data=payload)
            logger.info("Updated PPPoE user '%s' on %s: %s", username, self.router.name, payload.keys())
            return True

    def disable_user_by_name(self, username: str) -> bool:
        """Disables subscriber secret and disconnects active session if present."""
        ok = self.update_user_by_name(username, disabled=True)
        # Disconnect active session so subscriber is dropped immediately
        try:
            self.disconnect_session_by_username(username)
        except Exception as exc:
            logger.warning("Could not drop session for disabled user '%s': %s", username, exc)
        return ok

    def enable_user_by_name(self, username: str) -> bool:
        """Re-enables subscriber secret on router."""
        return self.update_user_by_name(username, disabled=False)

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

    def disconnect_session_by_username(self, username: str) -> bool:
        """Finds active session for username in /rest/ppp/active and deletes it."""
        with MikroTikRESTClient.from_router(self.router) as client:
            try:
                resp = client.get(f'/ppp/active?name={username}')
                sessions = resp if isinstance(resp, list) else ([resp] if isinstance(resp, dict) else [])
            except Exception:
                sessions = []

            if not sessions:
                # Fallback to full list scan
                resp = client.get('/ppp/active')
                sessions = resp if isinstance(resp, list) else ([resp] if isinstance(resp, dict) else [])

            disconnected = False
            for s in sessions:
                if s.get('name') == username:
                    session_id = s.get('.id') or s.get('id')
                    if session_id:
                        client.delete(f'/ppp/active/{session_id}')
                        logger.info("Disconnected active session for '%s' (id: %s) on %s", username, session_id, self.router.name)
                        disconnected = True
            return disconnected

    def list_profiles(self) -> list[str]:
        """Queries /rest/ppp/profile and returns list of profile names."""
        with MikroTikRESTClient.from_router(self.router) as client:
            resp = client.get('/ppp/profile')
            profiles = resp if isinstance(resp, list) else ([resp] if isinstance(resp, dict) else [])
            return [p.get('name') for p in profiles if isinstance(p, dict) and p.get('name')]

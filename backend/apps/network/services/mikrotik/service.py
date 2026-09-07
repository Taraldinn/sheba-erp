"""
MikroTikService — business-level operations on a RouterOS device (Plan Phase G).

Views call MikroTikService methods.
MikroTikService uses RouterClient internally.
No view should ever import RouterClient directly.

All methods are tenant-aware: the Router object carries the tenant FK,
so credentials are always scoped to the correct ISP.
"""
import logging
from datetime import datetime
from typing import Any, Optional
from django.utils import timezone
from .client import RouterClient, RouterConnectionError, RouterCommandError

logger = logging.getLogger(__name__)


class MikroTikService:
    """
    High-level MikroTik operations for the Sheba ISP ERP.

    Usage:
        svc = MikroTikService(router)  # router is a Router model instance
        ok, msg = svc.test_connection()
        health = svc.get_system_health()
        sessions = svc.get_active_sessions()
        svc.create_pppoe_user(username='fardin001', password='pass', profile='10Mbps')
    """

    def __init__(self, router):
        self.router = router
        self._client = RouterClient.from_router(router)

    # ─── Connection ───────────────────────────────────────────────────────────

    def test_connection(self) -> tuple[bool, str]:
        """Test connectivity to the router. Returns (success, message)."""
        try:
            with RouterClient.from_router(self.router) as client:
                result = client.run_command('/system/identity/print')
                identity = result[0].get('name', 'unknown') if result else 'unknown'
            # Update router status in DB
            self.router.status = 'Online'
            self.router.last_ping = timezone.now()
            self.router.save(update_fields=['status', 'last_ping'])
            return True, f"Connected. Identity: {identity}"
        except (RouterConnectionError, RouterCommandError) as exc:
            self.router.status = 'Error'
            self.router.save(update_fields=['status'])
            return False, str(exc)

    # ─── System Health ────────────────────────────────────────────────────────

    def get_system_health(self) -> dict[str, Any]:
        """
        Retrieve system resource metrics from the router.
        Updates Router.cpu_usage and Router.memory_usage in DB.
        """
        with RouterClient.from_router(self.router) as client:
            resources = client.run_command('/system/resource/print')
        if not resources:
            return {}
        r = resources[0]
        cpu = int(r.get('cpu-load', 0))
        total_mem = int(r.get('total-memory', 1))
        free_mem = int(r.get('free-memory', 0))
        mem_pct = int(((total_mem - free_mem) / total_mem) * 100)

        self.router.cpu_usage = cpu
        self.router.memory_usage = mem_pct
        self.router.status = 'Online'
        self.router.last_ping = timezone.now()
        self.router.save(update_fields=['cpu_usage', 'memory_usage', 'status', 'last_ping'])

        return {
            'cpu_load': cpu,
            'memory_pct': mem_pct,
            'uptime': r.get('uptime'),
            'version': r.get('version'),
            'board': r.get('board-name'),
        }

    # ─── Active PPPoE Sessions ────────────────────────────────────────────────

    def get_active_sessions(self) -> list[dict]:
        """Return list of active PPPoE sessions on the router."""
        with RouterClient.from_router(self.router) as client:
            sessions = client.run_command('/ppp/active/print')
        return [
            {
                'username': s.get('name'),
                'ip_address': s.get('address'),
                'mac_address': s.get('caller-id', ''),
                'uptime': s.get('uptime'),
                'bytes_in': int(s.get('bytes-in', 0)),
                'bytes_out': int(s.get('bytes-out', 0)),
                'service': s.get('service'),
            }
            for s in sessions
        ]

    # ─── PPPoE User Management ────────────────────────────────────────────────

    def create_pppoe_user(
        self,
        username: str,
        password: str,
        profile: str = 'default',
        comment: str = '',
    ) -> bool:
        """Create a PPPoE secret (user) on the router."""
        with RouterClient.from_router(self.router) as client:
            client.run_command(
                '/ppp/secret/add',
                name=username,
                password=password,
                service='pppoe',
                profile=profile,
                comment=comment,
            )
        logger.info("Created PPPoE user '%s' on router %s", username, self.router.name)
        return True

    def update_pppoe_user(
        self,
        username: str,
        password: Optional[str] = None,
        profile: Optional[str] = None,
        disabled: Optional[bool] = None,
    ) -> bool:
        """Update an existing PPPoE user's password, profile, or disabled state."""
        with RouterClient.from_router(self.router) as client:
            resource = client._api.get_resource('/ppp/secret')
            items = resource.get(name=username)
            if not items:
                logger.warning("PPPoE user '%s' not found on %s", username, self.router.name)
                return False
            item_id = items[0]['id']
            kwargs: dict = {}
            if password is not None:
                kwargs['password'] = password
            if profile is not None:
                kwargs['profile'] = profile
            if disabled is not None:
                kwargs['disabled'] = 'yes' if disabled else 'no'
            if kwargs:
                resource.set(id=item_id, **kwargs)
        return True

    def disable_user(self, username: str) -> bool:
        """Disable a PPPoE user (blocks login without deleting the account)."""
        return self.update_pppoe_user(username, disabled=True)

    def enable_user(self, username: str) -> bool:
        """Re-enable a previously disabled PPPoE user."""
        return self.update_pppoe_user(username, disabled=False)

    def disconnect_session(self, username: str) -> bool:
        """Forcefully terminate an active PPPoE session for the given username."""
        try:
            with RouterClient.from_router(self.router) as client:
                active = client.run_command('/ppp/active/print')
                for session in active:
                    if session.get('name') == username:
                        client._api.get_resource('/ppp/active').remove(id=session['id'])
                        logger.info("Disconnected session for '%s' on %s", username, self.router.name)
                        return True
            return False
        except RouterCommandError:
            return False

    # ─── Profile / Queue Sync ─────────────────────────────────────────────────

    def sync_profiles(self) -> list[str]:
        """
        Read all PPPoE profiles from the router.
        Returns a list of profile names.
        """
        with RouterClient.from_router(self.router) as client:
            profiles = client.run_command('/ppp/profile/print')
        return [p.get('name', '') for p in profiles if p.get('name')]

    def sync_active_sessions_to_db(self) -> int:
        """
        Fetch active sessions and upsert them into the UserSession model.
        Returns count of sessions synced.
        """
        from apps.network.models import UserSession
        from django.utils import timezone as tz

        sessions = self.get_active_sessions()
        synced = 0
        for s in sessions:
            UserSession.objects.update_or_create(
                tenant=self.router.tenant,
                router=self.router,
                username=s['username'],
                defaults={
                    'ip_address': s.get('ip_address', ''),
                    'mac_address': s.get('mac_address', ''),
                    'uptime': s.get('uptime', ''),
                    'bytes_in': s.get('bytes_in', 0),
                    'bytes_out': s.get('bytes_out', 0),
                    'last_seen': tz.now(),
                }
            )
            synced += 1
        # Remove stale sessions no longer active
        active_usernames = {s['username'] for s in sessions}
        UserSession.objects.filter(
            tenant=self.router.tenant,
            router=self.router,
        ).exclude(username__in=active_usernames).delete()
        return synced

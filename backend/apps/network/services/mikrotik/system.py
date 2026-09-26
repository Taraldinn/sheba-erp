"""
MikroTikSystemService — RouterOS v7 system resources, identity, health, and connectivity diagnostics.
"""
import logging
from typing import Any, Optional
from django.utils import timezone
from .client import (
    MikroTikRESTClient,
    MikroTikClientError,
    MikroTikAuthError,
    MikroTikTimeoutError,
    MikroTikConnectionError,
    MikroTikResponseError,
)

logger = logging.getLogger(__name__)


class MikroTikSystemService:
    """
    Handles system operations on a MikroTik RouterOS v7 device.
    """

    def __init__(self, router):
        self.router = router

    def _get_client(self) -> MikroTikRESTClient:
        return MikroTikRESTClient.from_router(self.router)

    def _normalize_dict_response(self, data: Any) -> dict[str, Any]:
        """RouterOS REST sometimes returns a dict or a 1-element list depending on firmware."""
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            return data[0]
        if isinstance(data, dict):
            return data
        return {}

    def get_system_identity(self) -> str:
        """
        Retrieves the router's identity name from /rest/system/identity.
        """
        with self._get_client() as client:
            resp = client.get('/system/identity')
            data = self._normalize_dict_response(resp)
            return data.get('name', 'Unknown')

    def get_system_resource(self) -> dict[str, Any]:
        """
        Retrieves raw system resources from /rest/system/resource.
        """
        with self._get_client() as client:
            resp = client.get('/system/resource')
            return self._normalize_dict_response(resp)

    def get_router_version(self) -> str:
        """Retrieves RouterOS firmware version."""
        resource = self.get_system_resource()
        return resource.get('version', '')

    def get_uptime(self) -> str:
        """Retrieves system uptime string (e.g. '2d04:12:30')."""
        resource = self.get_system_resource()
        return resource.get('uptime', '')

    def get_cpu_usage(self) -> int:
        """Retrieves CPU load percentage (0-100)."""
        resource = self.get_system_resource()
        try:
            return int(resource.get('cpu-load', 0))
        except (ValueError, TypeError):
            return 0

    def get_memory_usage(self) -> int:
        """Calculates memory usage percentage (0-100)."""
        resource = self.get_system_resource()
        try:
            total = int(resource.get('total-memory', 1))
            free = int(resource.get('free-memory', 0))
            if total <= 0:
                return 0
            return max(0, min(100, int(((total - free) / total) * 100)))
        except (ValueError, TypeError):
            return 0

    def get_disk_usage(self) -> int:
        """Calculates disk (HDD/NAND) usage percentage (0-100)."""
        resource = self.get_system_resource()
        try:
            total = int(resource.get('total-hdd-space', 1))
            free = int(resource.get('free-hdd-space', 0))
            if total <= 0:
                return 0
            return max(0, min(100, int(((total - free) / total) * 100)))
        except (ValueError, TypeError):
            return 0

    def test_connection(self) -> tuple[bool, str, dict[str, Any]]:
        """
        Tests connectivity and credentials to the router via REST API.
        Returns: (success: bool, message: str, details: dict)
        Updates router status and last_ping in database.
        """
        try:
            with self._get_client() as client:
                identity_resp = client.get('/system/identity')
                resource_resp = client.get('/system/resource')

            ident_data = self._normalize_dict_response(identity_resp)
            res_data = self._normalize_dict_response(resource_resp)

            identity = ident_data.get('name', self.router.name)
            version = res_data.get('version', '')
            uptime = res_data.get('uptime', '')
            cpu = int(res_data.get('cpu-load', 0))

            total_mem = int(res_data.get('total-memory', 1))
            free_mem = int(res_data.get('free-memory', 0))
            mem_pct = max(0, min(100, int(((total_mem - free_mem) / max(1, total_mem)) * 100)))

            total_disk = int(res_data.get('total-hdd-space', 1))
            free_disk = int(res_data.get('free-hdd-space', 0))
            disk_pct = max(0, min(100, int(((total_disk - free_disk) / max(1, total_disk)) * 100)))

            # Update router state in DB
            self.router.status = 'Online'
            self.router.last_ping = timezone.now()
            self.router.cpu_usage = cpu
            self.router.memory_usage = mem_pct
            self.router.disk_usage = disk_pct
            self.router.uptime = uptime
            if version:
                self.router.routeros_version = version
            self.router.save(update_fields=[
                'status', 'last_ping', 'cpu_usage', 'memory_usage',
                'disk_usage', 'uptime', 'routeros_version'
            ])

            details = {
                'router_id': str(self.router.id),
                'name': self.router.name,
                'identity': identity,
                'version': version,
                'board_name': res_data.get('board-name', ''),
                'architecture': res_data.get('architecture-name', ''),
                'cpu_load': cpu,
                'memory_pct': mem_pct,
                'disk_pct': disk_pct,
                'uptime': uptime,
            }
            return True, f"Successfully connected to {identity} (RouterOS {version})", details

        except MikroTikAuthError as exc:
            self.router.status = 'Error'
            self.router.save(update_fields=['status'])
            logger.warning("Auth failure for router %s: %s", self.router.id, exc)
            return False, "Authentication failed. Verify router username and password.", {'error': 'AUTHENTICATION_FAILED'}

        except MikroTikTimeoutError as exc:
            self.router.status = 'Offline'
            self.router.save(update_fields=['status'])
            logger.warning("Timeout connecting to router %s: %s", self.router.id, exc)
            return False, "Connection timed out. Router is unreachable or port is blocked.", {'error': 'TIMEOUT'}

        except MikroTikConnectionError as exc:
            self.router.status = 'Offline'
            self.router.save(update_fields=['status'])
            logger.warning("Connection failure for router %s: %s", self.router.id, exc)
            return False, "Unable to establish connection to router.", {'error': 'CONNECTION_REFUSED'}

        except MikroTikClientError as exc:
            self.router.status = 'Error'
            self.router.save(update_fields=['status'])
            logger.error("MikroTik client error for router %s: %s", self.router.id, exc)
            return False, str(exc), {'error': 'ROUTER_ERROR'}

    def get_full_health(self) -> dict[str, Any]:
        """
        Retrieves complete real-time health metrics from the router and saves them.
        """
        ok, msg, details = self.test_connection()
        if not ok:
            return {
                'status': self.router.status,
                'is_online': False,
                'message': msg,
                'error': details.get('error', 'UNKNOWN_ERROR'),
                'last_ping': self.router.last_ping.isoformat() if self.router.last_ping else None,
            }
        details['status'] = 'Online'
        details['is_online'] = True
        details['message'] = msg
        details['last_ping'] = self.router.last_ping.isoformat() if self.router.last_ping else None

        # Attach live interface telemetry (best-effort — never blocks or raises)
        try:
            from .interfaces import MikroTikInterfaceService
            details['interfaces'] = MikroTikInterfaceService(self.router).get_interface_health()
        except Exception:
            details['interfaces'] = []

        return details

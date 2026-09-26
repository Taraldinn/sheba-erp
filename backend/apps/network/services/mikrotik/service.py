"""
MikroTikService — High-level business operations on a RouterOS device.

Supports RouterOS v7 REST API (default) with fallback to binary API.
Views and Celery tasks call MikroTikService methods.
Frontend never connects to MikroTik directly.
All methods are tenant-scoped through router.tenant.
"""
import logging
import uuid
from datetime import timedelta
from typing import Any, Optional
from django.utils import timezone
from .client import (
    MikroTikRESTClient,
    RouterClient,
    RouterConnectionError,
    RouterCommandError,
    MikroTikClientError,
)
from .system import MikroTikSystemService
from .interfaces import MikroTikInterfaceService
from .sessions import MikroTikSessionService
from .pppoe import MikroTikPPPoEService
from .traffic import MikroTikTrafficService

logger = logging.getLogger(__name__)


class MikroTikService:
    """
    High-level MikroTik operations for Sheba ISP ERP.
    Automatically selects REST or binary API based on router.api_protocol.
    """

    def __init__(self, router):
        self.router = router
        self.protocol = getattr(router, 'api_protocol', 'REST')
        self.is_rest = (self.protocol == 'REST')
        self.is_radius = (self.protocol == 'RADIUS')
        self.is_api = (self.protocol == 'API')
        self.system = MikroTikSystemService(router)
        self.interfaces = MikroTikInterfaceService(router)
        self.sessions = MikroTikSessionService(router)
        self.pppoe = MikroTikPPPoEService(router)
        self.traffic = MikroTikTrafficService(router)

    # ─── Connection Diagnostics ──────────────────────────────────────────────

    def probe_radius_coa(self, timeout: float = 2.0) -> bool:
        """
        Sends an RFC 3576 Disconnect probe to verify if the router is online and
        listening on radius_coa_port. Expects Disconnect-ACK (41) or Disconnect-NAK (42).
        """
        import socket
        import struct
        import hashlib
        import os

        secret = (self.router.radius_secret or '').encode('utf-8')
        if not secret:
            return False

        code = 40  # Disconnect-Request
        identifier = os.urandom(1)[0]
        user_bytes = b"__sheba_probe__"
        user_attr = b'\x01' + bytes([len(user_bytes) + 2]) + user_bytes

        nas_ident = (self.router.nas_identifier or self.router.name or '').encode('utf-8')
        nas_attr = (b'\x20' + bytes([len(nas_ident) + 2]) + nas_ident) if nas_ident else b''

        attrs = user_attr + nas_attr
        length = 20 + len(attrs)
        header_for_hash = struct.pack('!BBH', code, identifier, length) + (b'\x00' * 16) + attrs + secret
        authenticator = hashlib.md5(header_for_hash).digest()
        packet = struct.pack('!BBH', code, identifier, length) + authenticator + attrs

        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.settimeout(timeout)
                port = self.router.radius_coa_port or 3799
                sock.sendto(packet, (self.router.effective_host, port))
                resp, _ = sock.recvfrom(1024)

            if resp and len(resp) >= 20:
                resp_code, resp_id, resp_len = struct.unpack('!BBH', resp[:4])
                if resp_id == identifier and resp_code in (41, 42):
                    expected_auth = hashlib.md5(resp[:4] + authenticator + resp[20:resp_len] + secret).digest()
                    if resp[4:20] == expected_auth:
                        return True
        except Exception:
            pass
        return False

    def test_connection(self) -> tuple[bool, str, dict[str, Any]]:
        """
        Tests connectivity to the router (REST, API, or RADIUS).
        Returns: (success: bool, message: str, details: dict)
        """
        if self.is_rest:
            return self.system.test_connection()

        if self.is_radius:
            try:
                probe_ok = self.probe_radius_coa(timeout=2.0)
                api_ok = False
                details: dict[str, Any] = {
                    'router_id': str(self.router.id),
                    'name': self.router.name,
                    'protocol': 'RADIUS',
                    'auth_port': self.router.radius_auth_port,
                    'acct_port': self.router.radius_acct_port,
                    'coa_port': self.router.radius_coa_port,
                    'nas_identifier': self.router.nas_identifier or self.router.name,
                }
                if self.router.password:
                    try:
                        with RouterClient.from_router(self.router) as client:
                            res = client.run_command('/system/resource')
                            if res:
                                r = res[0]
                                cpu = int(r.get('cpu-load', 0))
                                total_mem = int(r.get('total-memory', 1))
                                free_mem = int(r.get('free-memory', 0))
                                self.router.cpu_usage = cpu
                                self.router.memory_usage = max(0, min(100, int(((total_mem - free_mem) / max(1, total_mem)) * 100)))
                                self.router.uptime = r.get('uptime', '')
                                self.router.routeros_version = r.get('version', '')
                                api_ok = True
                    except Exception:
                        pass

                is_online = probe_ok or api_ok
                if is_online:
                    self.router.status = 'Online'
                    self.router.last_ping = timezone.now()
                    self.router.save()

                    msg = f"RADIUS AAA operational for '{self.router.name}' (CoA port {self.router.radius_coa_port})"
                    if api_ok:
                        msg += " + Live Telemetry linked"
                    return True, msg, details
                else:
                    self.router.status = 'Offline'
                    self.router.save(update_fields=['status'])
                    return False, f"RADIUS probe to '{self.router.name}' failed: no response from router.", details
            except Exception as exc:
                self.router.status = 'Error'
                self.router.save(update_fields=['status'])
                return False, f"RADIUS connection test failed: {exc}", {'error': 'RADIUS_ERROR'}

        # Legacy binary API fallback
        try:
            with RouterClient.from_router(self.router) as client:
                result = client.run_command('/system/identity')
                identity = result[0].get('name', 'unknown') if result else 'unknown'
                resources = client.run_command('/system/resource')
                r = resources[0] if resources else {}
                cpu = int(r.get('cpu-load', 0))
                total_mem = int(r.get('total-memory', 1))
                free_mem = int(r.get('free-memory', 0))
                mem_pct = max(0, min(100, int(((total_mem - free_mem) / max(1, total_mem)) * 100)))
                total_disk = int(r.get('total-hdd-space', 1))
                free_disk = int(r.get('free-hdd-space', 0))
                disk_pct = max(0, min(100, int(((total_disk - free_disk) / max(1, total_disk)) * 100)))
                version = r.get('version', '')
                uptime = r.get('uptime', '')

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
            return True, f"Connected to {identity} (RouterOS {version})", {
                'identity': identity,
                'version': version,
                'cpu_load': cpu,
                'memory_pct': mem_pct,
                'disk_pct': disk_pct,
                'uptime': uptime,
            }
        except (RouterConnectionError, RouterCommandError) as exc:
            self.router.status = 'Error'
            self.router.save(update_fields=['status'])
            return False, str(exc), {'error': 'ROUTER_ERROR'}

    # ─── System Health ────────────────────────────────────────────────────────

    def get_system_health(self) -> dict[str, Any]:
        """
        Retrieves system resource metrics from the router and updates Router model in DB.
        """
        if self.is_rest:
            return self.system.get_full_health()

        if self.is_radius:
            api_ok = False
            if self.router.password:
                try:
                    with RouterClient.from_router(self.router) as client:
                        resources = client.run_command('/system/resource')
                        active_sessions = client.run_command('/ppp/active')
                    if resources:
                        r = resources[0]
                        cpu = int(r.get('cpu-load', 0))
                        total_mem = int(r.get('total-memory', 1))
                        free_mem = int(r.get('free-memory', 0))
                        mem_pct = max(0, min(100, int(((total_mem - free_mem) / max(1, total_mem)) * 100)))
                        total_disk = int(r.get('total-hdd-space', 1))
                        free_disk = int(r.get('free-hdd-space', 0))
                        disk_pct = max(0, min(100, int(((total_disk - free_disk) / max(1, total_disk)) * 100)))
                        uptime = r.get('uptime', '')
                        version = r.get('version', '')
                        active_count = len(active_sessions) if active_sessions else 0
                        self.router.cpu_usage = cpu
                        self.router.memory_usage = mem_pct
                        self.router.disk_usage = disk_pct
                        self.router.uptime = uptime
                        self.router.active_pppoe_count = active_count
                        if version:
                            self.router.routeros_version = version
                        self.router.status = 'Online'
                        self.router.last_ping = timezone.now()
                        self.router.save(update_fields=[
                            'cpu_usage', 'memory_usage', 'disk_usage', 'uptime',
                            'active_pppoe_count', 'routeros_version', 'status', 'last_ping'
                        ])
                        api_ok = True
                except Exception:
                    pass

            probe_ok = False
            if not api_ok:
                probe_ok = self.probe_radius_coa(timeout=1.5)
                if probe_ok:
                    self.router.status = 'Online'
                    self.router.last_ping = timezone.now()
                    self.router.save(update_fields=['status', 'last_ping'])

            is_online = api_ok or probe_ok
            if not is_online:
                self.router.status = 'Offline' if self.router.last_ping else 'Unknown'
                self.router.save(update_fields=['status'])

            return {
                'is_online': is_online,
                'status': self.router.status,
                'protocol': 'RADIUS',
                'cpu_usage': self.router.cpu_usage,
                'cpu_load': self.router.cpu_usage,
                'memory_usage': self.router.memory_usage,
                'memory_pct': self.router.memory_usage,
                'disk_usage': self.router.disk_usage,
                'uptime': self.router.uptime,
                'version': self.router.routeros_version,
                'routeros_version': self.router.routeros_version,
                'active_pppoe_count': self.router.active_pppoe_count,
                'last_ping': self.router.last_ping.isoformat() if self.router.last_ping else None,
            }

        # Legacy binary API fallback
        try:
            with RouterClient.from_router(self.router) as client:
                resources = client.run_command('/system/resource')
                active_sessions = client.run_command('/ppp/active')

            if not resources:
                return {'is_online': False, 'status': self.router.status}
            r = resources[0]
            cpu = int(r.get('cpu-load', 0))
            total_mem = int(r.get('total-memory', 1))
            free_mem = int(r.get('free-memory', 0))
            mem_pct = max(0, min(100, int(((total_mem - free_mem) / max(1, total_mem)) * 100)))

            total_disk = int(r.get('total-hdd-space', 1))
            free_disk = int(r.get('free-hdd-space', 0))
            disk_pct = max(0, min(100, int(((total_disk - free_disk) / max(1, total_disk)) * 100)))

            uptime = r.get('uptime', '')
            version = r.get('version', '')
            active_count = len(active_sessions) if active_sessions else 0

            self.router.cpu_usage = cpu
            self.router.memory_usage = mem_pct
            self.router.disk_usage = disk_pct
            self.router.uptime = uptime
            self.router.active_pppoe_count = active_count
            if version:
                self.router.routeros_version = version
            self.router.status = 'Online'
            self.router.last_ping = timezone.now()
            self.router.save(update_fields=[
                'cpu_usage', 'memory_usage', 'disk_usage', 'uptime',
                'active_pppoe_count', 'routeros_version', 'status', 'last_ping'
            ])

            return {
                'is_online': True,
                'status': 'Online',
                'cpu_usage': cpu,
                'cpu_load': cpu,
                'memory_usage': mem_pct,
                'memory_pct': mem_pct,
                'disk_usage': disk_pct,
                'uptime': uptime,
                'version': version,
                'routeros_version': version,
                'board': r.get('board-name', ''),
                'active_pppoe_count': active_count,
                'last_ping': self.router.last_ping.isoformat() if self.router.last_ping else None,
            }
        except Exception as exc:
            logger.warning("Error fetching binary API health for %s: %s", self.router.id, exc)
            self.router.status = 'Error'
            self.router.save(update_fields=['status'])
            return {
                'is_online': False,
                'status': 'Error',
                'error': str(exc),
            }

    # ─── Active PPPoE Sessions ────────────────────────────────────────────────

    def get_active_sessions(self) -> list[dict[str, Any]]:
        """Return list of active PPPoE sessions on the router."""
        if self.is_rest:
            raw_sessions = self.sessions.get_active_sessions()
            return [
                {
                    'username': s.get('name'),
                    'ip_address': s.get('address'),
                    'mac_address': s.get('caller-id', ''),
                    'uptime': s.get('uptime', ''),
                    'bytes_in': int(s.get('bytes-in', 0)),
                    'bytes_out': int(s.get('bytes-out', 0)),
                    'service': s.get('service', 'pppoe'),
                }
                for s in raw_sessions
            ]

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
        if self.is_rest:
            return self.pppoe.create_user(username, password, profile, comment)

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
        if self.is_rest:
            return self.pppoe.update_user_by_name(username, password=password, profile=profile, disabled=disabled)

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
        if self.is_rest:
            return self.pppoe.disable_user_by_name(username)
        return self.update_pppoe_user(username, disabled=True)

    def enable_user(self, username: str) -> bool:
        if self.is_rest:
            return self.pppoe.enable_user_by_name(username)
        return self.update_pppoe_user(username, disabled=False)

    def delete_pppoe_user(self, username: str) -> bool:
        self.disconnect_session(username)
        if self.is_rest:
            return self.pppoe.delete_user_by_name(username)
        if self.is_api:
            try:
                with RouterClient.from_router(self.router) as client:
                    res = client._api.get_resource('/ppp/secret')
                    items = res.get(name=username)
                    if items:
                        res.remove(id=items[0]['id'])
                        return True
            except Exception as exc:
                logger.warning("Could not delete PPPoE user '%s' on %s: %s", username, self.router.name, exc)
        return True

    def send_radius_disconnect(self, username: str) -> bool:
        """
        Sends an RFC 3576 Disconnect-Request (PoD) UDP packet to MikroTik
        port (default 3799) using the router's radius_secret.
        """
        import socket
        import struct
        import hashlib
        import os

        secret = (self.router.radius_secret or '').encode('utf-8')
        if not secret:
            if self.router.password:
                return self._disconnect_session_api(username)
            return False

        code = 40  # Disconnect-Request
        identifier = os.urandom(1)[0]
        user_bytes = username.encode('utf-8')
        user_attr = b'\x01' + bytes([len(user_bytes) + 2]) + user_bytes

        # Router identification / session identifying attribute
        nas_ident = (self.router.nas_identifier or self.router.name or '').encode('utf-8')
        nas_attr = (b'\x20' + bytes([len(nas_ident) + 2]) + nas_ident) if nas_ident else b''

        attrs = user_attr + nas_attr
        length = 20 + len(attrs)
        header_for_hash = struct.pack('!BBH', code, identifier, length) + (b'\x00' * 16) + attrs + secret
        authenticator = hashlib.md5(header_for_hash).digest()
        packet = struct.pack('!BBH', code, identifier, length) + authenticator + attrs

        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.settimeout(3.0)
                sock.sendto(packet, (self.router.effective_host, self.router.radius_coa_port or 3799))
                resp, _ = sock.recvfrom(1024)

            if not resp or len(resp) < 20:
                return False

            resp_code, resp_id, resp_len = struct.unpack('!BBH', resp[:4])
            if resp_id != identifier:
                logger.warning("RADIUS CoA Disconnect response ID mismatch: expected %d, got %d", identifier, resp_id)
                return False

            if resp_code not in (41, 42):
                logger.warning("RADIUS CoA Disconnect unexpected response code: %d", resp_code)
                return False

            expected_auth = hashlib.md5(resp[:4] + authenticator + resp[20:resp_len] + secret).digest()
            if resp[4:20] != expected_auth:
                logger.warning("RADIUS CoA Disconnect response authenticator validation failed")
                return False

            if resp_code == 41:
                logger.info("Successfully sent RADIUS CoA Disconnect-ACK for '%s' to %s", username, self.router.name)
                return True
            else:
                logger.warning("RADIUS CoA Disconnect-NAK for '%s' from %s", username, self.router.name)
                return False
        except Exception as exc:
            logger.warning("RADIUS CoA Disconnect UDP socket failed for '%s': %s", username, exc)
            if self.router.password:
                return self._disconnect_session_api(username)
            return False

    def _disconnect_session_api(self, username: str) -> bool:
        try:
            with RouterClient.from_router(self.router) as client:
                active = client.run_command('/ppp/active/print')
                for session in active:
                    if session.get('name') == username:
                        client._api.get_resource('/ppp/active').remove(id=session['id'])
                        logger.info("Disconnected session for '%s' on %s", username, self.router.name)
                        return True
            return False
        except (RouterCommandError, Exception) as exc:
            logger.warning("Failed to disconnect session for '%s': %s", username, exc)
            return False

    def disconnect_session(self, username: str) -> bool:
        if self.is_rest:
            return self.pppoe.disconnect_session_by_username(username)
        if self.is_radius:
            return self.send_radius_disconnect(username)
        return self._disconnect_session_api(username)

    def sync_profiles(self) -> list[str]:
        if self.is_rest:
            return self.pppoe.list_profiles()

        with RouterClient.from_router(self.router) as client:
            profiles = client.run_command('/ppp/profile/print')
        return [p.get('name', '') for p in profiles if p.get('name')]

    def upsert_ppp_profile(self, name: str, rate_limit: str = '') -> bool:
        """Provisions or updates a PPP bandwidth speed profile on the router."""
        if self.is_rest:
            return self.pppoe.upsert_profile(name, rate_limit=rate_limit)
        elif self.is_api:
            try:
                with RouterClient.from_router(self.router) as client:
                    res = client._api.get_resource('/ppp/profile')
                    items = res.get(name=name)
                    kwargs = {'name': name}
                    if rate_limit:
                        kwargs['rate-limit'] = rate_limit
                    if items:
                        res.set(id=items[0]['id'], **kwargs)
                    else:
                        client.run_command('/ppp/profile/add', **kwargs)
                return True
            except Exception as exc:
                logger.warning("Could not upsert profile '%s' on %s: %s", name, self.router.name, exc)
                return False
        return True

    def provision_expire_pool(
        self,
        pool_name: str = 'expired_pool',
        pool_network: str = '172.31.250.10-172.31.250.250',
        profile_name: str = 'sheba_expired_profile',
        local_address: str = '172.31.250.1',
        rate_limit: str = '32k/32k',
        redirect_url: str = '',
        walled_garden: str = '',
        pool_ranges: str = None
    ) -> dict[str, Any]:
        """Provisions expire IP pool, throttled profile (10k-50k), and captive redirect on router."""
        if pool_ranges:
            pool_network = pool_ranges
        if self.is_rest:
            return self.pppoe.provision_expire_pool(
                pool_name=pool_name,
                pool_network=pool_network,
                profile_name=profile_name,
                local_address=local_address,
                rate_limit=rate_limit,
                redirect_url=redirect_url,
                walled_garden=walled_garden
            )
        elif self.is_api:
            try:
                with RouterClient.from_router(self.router) as client:
                    # 1. Pool
                    try:
                        client.run_command('/ip/pool/add', name=pool_name, ranges=pool_network)
                    except Exception:
                        pass
                    # 2. Profile
                    try:
                        client.run_command(
                            '/ppp/profile/add',
                            name=profile_name,
                            **{'local-address': local_address, 'remote-address': pool_name, 'rate-limit': rate_limit, 'address-list': 'expired_users'}
                        )
                    except Exception:
                        pass
                return {
                    'success': True,
                    'pool': pool_name,
                    'profile': profile_name,
                    'rate_limit': rate_limit,
                    'router': self.router.name,
                    'message': f"Provisioned expire pool '{pool_name}' ({rate_limit}) via Binary API on {self.router.name}."
                }
            except Exception as exc:
                return {'success': False, 'error': str(exc), 'router': self.router.name}

        return {
            'success': True,
            'pool': pool_name,
            'profile': profile_name,
            'rate_limit': rate_limit,
            'router': self.router.name,
            'message': f"Expire pool configuration active for RADIUS AAA on {self.router.name}."
        }

    def get_unregistered_secrets(self) -> list[dict[str, Any]]:
        """Return RouterOS PPPoE secrets which do not belong to this tenant yet."""
        from apps.customers.models import Customer

        if self.is_rest:
            secrets = self.pppoe.list_secrets()
        else:
            with RouterClient.from_router(self.router) as client:
                secrets = client.run_command('/ppp/secret/print')
        known = set(Customer.objects.filter(tenant=self.router.tenant).values_list('pppoe_username', flat=True))
        return [
            {
                'username': secret.get('name', ''), 'password': secret.get('password', ''),
                'profile': secret.get('profile', 'default'),
                'disabled': str(secret.get('disabled', '')).lower() in ('yes', 'true'),
                'comment': secret.get('comment', ''),
            }
            for secret in secrets
            if secret.get('name') and secret.get('name') not in known
        ]

    def quick_import_secret(self, username: str, password: str = '', profile: str = ''):
        """Create a one-day active ERP subscriber from a discovered RouterOS secret."""
        from apps.billing.models import Package
        from apps.customers.models import Customer, CustomerStatus
        from apps.network.models import PPPoESecretItem, ReconciliationStatus

        if Customer.objects.filter(tenant=self.router.tenant, pppoe_username=username).exists():
            raise ValueError('A customer with this PPPoE username already exists.')
        package = (Package.objects.filter(tenant=self.router.tenant, is_active=True, mikrotik_profile__iexact=profile).first()
                   or Package.objects.filter(tenant=self.router.tenant, is_active=True, name__iexact=profile).first()
                   or Package.objects.filter(tenant=self.router.tenant, is_active=True).first())
        if not package:
            raise ValueError('No active package is available for this tenant; create one before importing subscribers.')
        today = timezone.localdate()
        customer = Customer.objects.create(
            tenant=self.router.tenant, customer_code=f'CUST-{uuid.uuid4().hex[:12].upper()}', full_name=username, mobile='', pppoe_username=username,
            pppoe_password=password, router=self.router, package=package,
            status=CustomerStatus.ACTIVE, bill_date=today, expiry_date=today + timedelta(days=1),
            monthly_bill=package.regular_price,
        )
        PPPoESecretItem.objects.filter(tenant=self.router.tenant, router=self.router, username=username).update(
            customer=customer, package=package, reconciliation_status=ReconciliationStatus.MATCHED,
            last_synced_at=timezone.now(),
        )
        return customer

    def sync_all_clients_to_router(self) -> dict[str, int]:
        """Upsert every assigned subscriber and drop sessions that must be disabled."""
        from apps.customers.models import Customer

        result = {'created': 0, 'updated': 0, 'disabled': 0, 'disconnected': 0, 'failed': 0}
        if self.is_rest:
            secrets = self.pppoe.list_secrets()
        else:
            with RouterClient.from_router(self.router) as client:
                secrets = client.run_command('/ppp/secret/print')
        existing = {s.get('name'): s for s in secrets}
        today = timezone.localdate()
        customers = Customer.objects.filter(tenant=self.router.tenant, router=self.router).select_related('package')
        for customer in customers:
            enabled = customer.status == 'Active' and (not customer.expiry_date or customer.expiry_date >= today)
            profile = customer.package.mikrotik_profile if customer.package else 'default'
            try:
                if customer.pppoe_username in existing:
                    previous_profile = existing[customer.pppoe_username].get('profile', '')
                    self.update_pppoe_user(customer.pppoe_username, profile=profile, disabled=not enabled)
                    result['updated'] += 1
                    if enabled and previous_profile and previous_profile != profile:
                        if self.disconnect_session(customer.pppoe_username):
                            result['disconnected'] += 1
                else:
                    if customer.pppoe_password:
                        self.create_pppoe_user(customer.pppoe_username, customer.pppoe_password, profile)
                        if not enabled:
                            self.disable_user(customer.pppoe_username)
                        result['created'] += 1
                if not enabled:
                    result['disabled'] += 1
                    if self.disconnect_session(customer.pppoe_username):
                        result['disconnected'] += 1
            except Exception:
                logger.exception('Failed syncing PPPoE user %s', customer.pppoe_username)
                result['failed'] += 1
        return result

    def ping(self, target: str, count: int = 4) -> dict[str, Any]:
        """Run a bounded RouterOS ping and normalize the result for the cockpit."""
        count = min(max(int(count), 1), 20)
        if self.is_rest:
            with MikroTikRESTClient.from_router(self.router) as client:
                raw = client.post('/ping', json_data={'address': target, 'count': str(count)})
        else:
            with RouterClient.from_router(self.router) as client:
                raw = client.run_command('/ping', address=target, count=str(count))
        rows = raw if isinstance(raw, list) else [raw]
        times = [float(r.get('time', r.get('avg-rtt', 0)).replace('ms', '')) for r in rows if str(r.get('time', r.get('avg-rtt', ''))).replace('ms', '').replace('.', '', 1).isdigit()]
        received = len(times)
        return {'target': target, 'sent': count, 'received': received, 'packet_loss_percent': round((count - received) * 100 / count, 2), 'min_ms': min(times) if times else None, 'avg_ms': round(sum(times) / received, 2) if received else None, 'max_ms': max(times) if times else None, 'raw': rows}

    def traceroute(self, target: str) -> dict[str, Any]:
        if self.is_rest:
            with MikroTikRESTClient.from_router(self.router) as client:
                raw = client.post('/tool/traceroute', json_data={'address': target, 'count': '1'})
        else:
            with RouterClient.from_router(self.router) as client:
                raw = client.run_command('/tool/traceroute', address=target, count='1')
        rows = raw if isinstance(raw, list) else [raw]
        return {'target': target, 'hops': [{'hop': i + 1, 'address': r.get('address', r.get('host', '*')), 'rtt': r.get('avg-rtt', r.get('time', '')), 'loss': r.get('loss', '0%')} for i, r in enumerate(rows)], 'raw': rows}

    def get_traffic_stats(self, interface_name: Optional[str] = None) -> dict[str, Any]:
        """Retrieves live traffic metrics for an interface or router aggregate."""
        if interface_name:
            return self.traffic.get_interface_traffic(interface_name)
        return self.traffic.get_aggregate_traffic()

    def sync_active_sessions_to_db(self) -> int:
        from apps.network.models import UserSession
        from django.utils import timezone as tz

        sessions = self.get_active_sessions()
        synced = 0
        for s in sessions:
            if not s.get('username'):
                continue
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

        active_usernames = {s['username'] for s in sessions if s.get('username')}
        UserSession.objects.filter(
            tenant=self.router.tenant,
            router=self.router,
        ).exclude(username__in=active_usernames).delete()
        return synced

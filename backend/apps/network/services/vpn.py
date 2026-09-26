"""Safe WireGuard key storage, RouterOS script generation, and TCP probes."""
import base64
import hashlib
import ipaddress
import os
import re
import socket
import time
from typing import Optional, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.utils import timezone

from apps.network.models import WireGuardConfig


class WireGuardService:
    """Private keys are authenticated and bound to the owning tenant as AAD."""

    @staticmethod
    def _key(tenant_id: int) -> bytes:
        secret = getattr(settings, 'SECRET_KEY', '')
        if not secret:
            raise ValueError('WireGuard encryption requires Django SECRET_KEY.')
        return hashlib.sha256(f'wireguard-key-v2:{tenant_id}:{secret}'.encode()).digest()

    @classmethod
    def encrypt_private_key(cls, raw_key: str, tenant_id: int) -> str:
        if not raw_key:
            return ''
        nonce = os.urandom(12)
        encrypted = AESGCM(cls._key(tenant_id)).encrypt(nonce, raw_key.encode(), str(tenant_id).encode())
        return base64.urlsafe_b64encode(nonce + encrypted).decode()

    @classmethod
    def decrypt_private_key(cls, enc_key: str, tenant_id: int) -> Optional[str]:
        if not enc_key:
            return None
        try:
            payload = base64.urlsafe_b64decode(enc_key.encode())
            if len(payload) < 29:
                return None
            return AESGCM(cls._key(tenant_id)).decrypt(payload[:12], payload[12:], str(tenant_id).encode()).decode()
        except Exception:
            return None

    @staticmethod
    def _cidr(value: str, field: str) -> str:
        try:
            return str(ipaddress.ip_network(value, strict=False))
        except ValueError as exc:
            raise ValueError(f'{field} must be a valid IP network in CIDR notation.') from exc

    @staticmethod
    def _interface_cidr(value: str) -> str:
        try:
            return str(ipaddress.ip_interface(value))
        except ValueError as exc:
            raise ValueError('wg_ip must be a valid interface address in CIDR notation.') from exc

    @staticmethod
    def _host(value: str) -> str:
        value = value.strip()
        try:
            return str(ipaddress.ip_address(value))
        except ValueError:
            if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?', value):
                raise ValueError('endpoint_ip must be a valid IP address or hostname.')
            return value

    @staticmethod
    def _quoted(value: str) -> str:
        if '\n' in value or '\r' in value:
            raise ValueError('RouterOS values cannot contain newlines.')
        return value.replace('\\', '\\\\').replace('"', '\\"')

    @classmethod
    def generate_mikrotik_script(cls, config: WireGuardConfig) -> str:
        private_key = cls.decrypt_private_key(config.mik_private_key_enc, config.tenant_id)
        if not private_key:
            raise ValueError('Unable to decrypt WireGuard private key. Please re-save your keys.')
        wg_ip = cls._interface_cidr(config.wg_ip)
        endpoint = cls._host(config.endpoint_ip)
        allowed_ips = ','.join(cls._cidr(v.strip(), 'allowed_ips') for v in config.allowed_ips.split(',') if v.strip())
        if not allowed_ips:
            raise ValueError('allowed_ips is required.')
        if not 1 <= config.endpoint_port <= 65535:
            raise ValueError('endpoint_port must be between 1 and 65535.')
        interface = cls._quoted(f"wg-{str(config.router_id or config.id).replace('-', '')[:12]}")
        peer_comment = cls._quoted(f'Sheba VPN {config.id}')
        lines = [
            f'# Sheba WireGuard profile {config.id}',
            f':if ([:len [/interface wireguard find where name="{interface}"]] = 0) do={{ /interface wireguard add name="{interface}" listen-port=51820 }}',
            f'/interface wireguard set [find where name="{interface}"] private-key="{cls._quoted(private_key)}" listen-port=51820',
            f':if ([:len [/ip address find where interface="{interface}" and address="{wg_ip}"]] = 0) do={{ /ip address add address={wg_ip} interface="{interface}" }}',
            f':if ([:len [/interface wireguard peers find where comment="{peer_comment}"]] = 0) do={{ /interface wireguard peers add interface="{interface}" public-key="{cls._quoted(config.vps_public_key)}" endpoint-address={endpoint} endpoint-port={config.endpoint_port} allowed-address={allowed_ips} persistent-keepalive=25s comment="{peer_comment}" }} else={{ /interface wireguard peers set [find where comment="{peer_comment}"] interface="{interface}" public-key="{cls._quoted(config.vps_public_key)}" endpoint-address={endpoint} endpoint-port={config.endpoint_port} allowed-address={allowed_ips} persistent-keepalive=25s }}',
        ]
        for sub in config.subnets.all():
            subnet = cls._cidr(sub.subnet, 'subnet')
            comment = cls._quoted(f'OLT Subnet: {sub.label or subnet}')
            lines.append(f':if ([:len [/ip firewall nat find where comment="{comment}"]] = 0) do={{ /ip firewall nat add chain=srcnat src-address=10.255.0.0/16 dst-address={subnet} action=masquerade comment="{comment}" }}')
        return '\n'.join(lines)

    @classmethod
    def test_connection(cls, config: WireGuardConfig, timeout: float = 3.0) -> Tuple[bool, str, Optional[float]]:
        """Measure a TCP handshake; UDP connect/send has no reachability semantics."""
        target, port = cls._host(config.endpoint_ip), config.endpoint_port
        started = time.monotonic()
        try:
            with socket.create_connection((target, port), timeout=timeout):
                latency_ms = (time.monotonic() - started) * 1000
            config.is_reachable, config.last_tested_at = True, timezone.now()
            config.save(update_fields=['is_reachable', 'last_tested_at'])
            return True, f'TCP management probe to {target}:{port} succeeded ({latency_ms:.1f}ms).', latency_ms
        except OSError as exc:
            config.is_reachable, config.last_tested_at = False, timezone.now()
            config.save(update_fields=['is_reachable', 'last_tested_at'])
            return False, f'TCP management probe failed: {exc}', None


# Phase 22 helpers (keypair gen, rotate, push, audit, handshakes) live in
# vpn_phase22.py so the original module keeps its single-class focus. They
# are installed onto WireGuardService on import below.
from apps.network.services.vpn_phase22 import install as _install_phase22  # noqa: E402
_install_phase22(WireGuardService)

import ipaddress
import socket
from django.core.exceptions import ValidationError
from django.conf import settings

# Cloud metadata and link-local ranges that must never be targeted by router requests
FORBIDDEN_NETWORKS = [
    ipaddress.ip_network('169.254.0.0/16'),  # IPv4 Link-local & cloud metadata (169.254.169.254)
    ipaddress.ip_network('224.0.0.0/4'),    # Multicast
    ipaddress.ip_network('240.0.0.0/4'),    # Reserved / Future use
    ipaddress.ip_network('fe80::/10'),      # IPv6 Link-local
    ipaddress.ip_network('ff00::/8'),       # IPv6 Multicast
]

LOOPBACK_NETWORKS = [
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('::1/128'),
]


def is_ip_forbidden_for_router(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address, allow_loopback: bool = False) -> tuple[bool, str]:
    """Check if an IP address belongs to forbidden networks."""
    for net in FORBIDDEN_NETWORKS:
        if ip_obj in net:
            return True, f"IP {ip_obj} is in forbidden range ({net}) for network device connections."

    if not allow_loopback:
        for net in LOOPBACK_NETWORKS:
            if ip_obj in net:
                return True, f"Loopback addresses ({ip_obj}) are prohibited for router connections."

    return False, ""


def validate_router_host(host_or_ip: str) -> None:
    """
    Validates that a router IP or hostname is safe from SSRF attacks.
    Prevents targeting internal cloud metadata services (169.254.169.254),
    loopback addresses (unless ALLOW_LOCAL_NETWORK_DEVICES is True),
    or multicast ranges.
    """
    if not host_or_ip:
        raise ValidationError("Router IP address or hostname is required.")

    cleaned_host = host_or_ip.strip()
    allow_loopback = getattr(settings, 'ALLOW_LOCAL_NETWORK_DEVICES', False)

    # First attempt to parse as IP address
    try:
        ip_obj = ipaddress.ip_address(cleaned_host)
        is_forbidden, reason = is_ip_forbidden_for_router(ip_obj, allow_loopback=allow_loopback)
        if is_forbidden:
            raise ValidationError(reason)
        return
    except ValueError:
        # Not a raw IP, might be a hostname/FQDN
        pass

    # If it's a hostname, check known dangerous hostnames
    lowered = cleaned_host.lower()
    if lowered in ['localhost', 'metadata.google.internal', 'instance-data']:
        if not allow_loopback:
            raise ValidationError(f"Hostname '{cleaned_host}' is prohibited for router connections.")

    # Try resolving hostname to verify it does not point to metadata/forbidden IP
    try:
        resolved_ips = socket.getaddrinfo(cleaned_host, None)
        for entry in resolved_ips:
            resolved_ip_str = entry[4][0]
            try:
                ip_obj = ipaddress.ip_address(resolved_ip_str)
                is_forbidden, reason = is_ip_forbidden_for_router(ip_obj, allow_loopback=allow_loopback)
                if is_forbidden:
                    raise ValidationError(f"Host '{cleaned_host}' resolves to forbidden IP: {reason}")
            except ValueError:
                continue
    except (socket.gaierror, socket.herror):
        # Cannot resolve hostname right now (e.g. offline router), allow saving if syntax looks reasonable
        if len(cleaned_host) > 255:
            raise ValidationError("Hostname exceeds maximum length of 255 characters.")


def validate_port(port: int) -> None:
    """Validates that a port is an integer in the valid range [1, 65535]."""
    if not isinstance(port, int) or port < 1 or port > 65535:
        raise ValidationError(f"Port {port} is invalid. Port must be an integer between 1 and 65535.")

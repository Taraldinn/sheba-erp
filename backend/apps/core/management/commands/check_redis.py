"""
Sheba ISP ERP — Redis Connectivity & Diagnostics Management Command
====================================================================
Usage:
    python manage.py check_redis

Designed specifically for debugging containerized and PaaS environments
like Dokploy, Coolify, Docker Compose, and standalone Linux VPS hosts.
"""

import sys
import socket
import time
import urllib.parse
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.core.redis_service import RedisService


def mask_url(url: str) -> str:
    """Masks credentials in a connection URL for safe log/console display."""
    if not url:
        return "(empty)"
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.password:
            masked_netloc = f"{parsed.username or ''}:****@{parsed.hostname}"
            if parsed.port:
                masked_netloc += f":{parsed.port}"
            return urllib.parse.urlunparse(parsed._replace(netloc=masked_netloc))
        return url
    except Exception:
        return "(unparseable URL)"


class Command(BaseCommand):
    help = "Verifies Redis connectivity, network reachability, and operations for Dokploy / Docker environments."

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("=== Sheba ERP Redis Connectivity Diagnostic ==="))

        redis_url = getattr(settings, 'REDIS_URL', '')
        redis_host_env = getattr(settings, 'REDIS_HOST', '')
        redis_port_env = getattr(settings, 'REDIS_PORT', '')
        has_password = bool(getattr(settings, 'REDIS_PASSWORD', ''))

        self.stdout.write(f"Configured REDIS_URL:      {mask_url(redis_url)}")
        self.stdout.write(f"Configured REDIS_HOST:     {redis_host_env or '(not set)'}")
        self.stdout.write(f"Configured REDIS_PORT:     {redis_port_env or '6379'}")
        self.stdout.write(f"Configured REDIS_PASSWORD: {'[SET]' if has_password else '[NOT SET]'}")

        if not redis_url:
            self.stdout.write(self.style.ERROR("\n[ERROR] REDIS_URL is not set and could not be resolved!"))
            self.stdout.write(
                "In Dokploy:\n"
                "  1. If using Dokploy Compose, set: REDIS_URL=redis://redis:6379/0\n"
                "  2. If using Dokploy Database (Redis), set: REDIS_URL=redis://:<password>@<dokploy-service-name>:6379/0\n"
                "     or set REDIS_HOST=<dokploy-service-name>, REDIS_PASSWORD=<password>\n"
            )
            sys.exit(1)

        # Parse target host and port
        try:
            parsed = urllib.parse.urlparse(redis_url)
            host = parsed.hostname or 'localhost'
            port = parsed.port or 6379
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"\n[ERROR] Failed to parse REDIS_URL: {e}"))
            sys.exit(1)

        self.stdout.write(f"Target Host:               {host}")
        self.stdout.write(f"Target Port:               {port}\n")

        # Check for container localhost gotcha
        if host in ('localhost', '127.0.0.1'):
            self.stdout.write(self.style.WARNING(
                "(!) ATTENTION: Target host is 'localhost' / '127.0.0.1'.\n"
                "    Inside a Dokploy or Docker container, 'localhost' refers to the BACKEND container itself,\n"
                "    NOT the Redis container or the host VPS!\n"
                "    - For Dokploy Compose: use 'redis' as the host (e.g. REDIS_URL=redis://redis:6379/0)\n"
                "    - For Dokploy Database: use the Dokploy service name (e.g. REDIS_URL=redis://:<password>@<service-name>:6379/0)\n"
                "    - For VPS host Redis outside Docker: use host.docker.internal or your Docker bridge gateway (172.17.0.1)\n"
            ))

        # 1. DNS Resolution Test
        self.stdout.write(f"1. Testing DNS resolution for '{host}'... ", ending="")
        try:
            ip_addr = socket.gethostbyname(host)
            self.stdout.write(self.style.SUCCESS(f"OK ({ip_addr})"))
        except socket.gaierror as err:
            self.stdout.write(self.style.ERROR(f"FAILED ({err})"))
            self.stdout.write(self.style.ERROR(
                f"\n[DOKPLOY NETWORK ISSUE] Host '{host}' could not be resolved by Docker DNS!\n"
                f"Tips for Dokploy:\n"
                f"  - Make sure your Backend Application and Redis Database are on the SAME Docker network!\n"
                f"    In Dokploy: Go to Application -> Settings -> Network, and attach 'dokploy-network'.\n"
                f"  - Verify that the Redis service name in Dokploy matches '{host}'.\n"
            ))
            sys.exit(1)

        # 2. TCP Socket Connection Test
        self.stdout.write(f"2. Testing TCP socket handshake to {host}:{port}... ", ending="")
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3.0)
        try:
            sock.connect((host, port))
            sock.close()
            self.stdout.write(self.style.SUCCESS("CONNECTED"))
        except Exception as err:
            self.stdout.write(self.style.ERROR(f"FAILED ({err})"))
            self.stdout.write(self.style.ERROR(
                f"\n[CONNECTION REFUSED] Could not open TCP connection to {host}:{port}.\n"
                f"  - Is the Redis container running in Dokploy?\n"
                f"  - Is port {port} exposed on the internal container network?\n"
            ))
            sys.exit(1)

        # 3. Redis PING Probe
        self.stdout.write("3. Testing Redis PING command... ", ending="")
        RedisService.reset_client()
        is_healthy, latency, err = RedisService.ping()
        if is_healthy:
            self.stdout.write(self.style.SUCCESS(f"PONG ({latency}ms)"))
        else:
            self.stdout.write(self.style.ERROR(f"FAILED: {err}"))
            if "NOAUTH" in str(err) or "invalid password" in str(err).lower():
                self.stdout.write(self.style.ERROR(
                    "\n[AUTHENTICATION ERROR] Redis requires authentication or password was invalid.\n"
                    "Please check your REDIS_PASSWORD or the password in REDIS_URL.\n"
                ))
            sys.exit(1)

        # 4. Cache SET / GET / DELETE Test
        self.stdout.write("4. Testing Cache write/read cycle... ", ending="")
        test_key = "sheba:diagnostic:test_probe"
        test_val = {"status": "ok", "timestamp": time.time()}
        if RedisService.set(test_key, test_val, ttl=30):
            read_back = RedisService.get(test_key)
            if read_back and read_back.get("status") == "ok":
                RedisService.delete(test_key)
                self.stdout.write(self.style.SUCCESS("OK"))
            else:
                self.stdout.write(self.style.ERROR(f"FAILED: Value mismatch or read failed: {read_back}"))
                sys.exit(1)
        else:
            self.stdout.write(self.style.ERROR("FAILED to write test key."))
            sys.exit(1)

        # 5. Distributed Lock Test
        self.stdout.write("5. Testing Distributed Lock & Lua release... ", ending="")
        token = RedisService.acquire_lock("diagnostic_probe", timeout=10)
        if token:
            released = RedisService.release_lock("diagnostic_probe", token)
            if released:
                self.stdout.write(self.style.SUCCESS("OK"))
            else:
                self.stdout.write(self.style.WARNING("Lock acquired, but Lua release returned False"))
        else:
            self.stdout.write(self.style.ERROR("FAILED to acquire lock"))
            sys.exit(1)

        # Success Summary
        self.stdout.write(self.style.SUCCESS(
            "\n[SUCCESS] Redis is fully operational and healthy in this Dokploy environment!\n"
        ))

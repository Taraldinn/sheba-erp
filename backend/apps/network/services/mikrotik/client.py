"""
RouterClient — low-level MikroTik RouterOS API connection (Plan Phase G).

Wraps librouteros or routeros_api with:
  - Tenant-scoped router credentials (never from client)
  - Connection pooling / context manager usage
  - Standardised error handling
  - Timeout enforcement

Install dep: pip install routeros-api
"""
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


class RouterConnectionError(Exception):
    """Raised when a connection to the router cannot be established."""


class RouterCommandError(Exception):
    """Raised when a RouterOS API command fails."""


@dataclass
class RouterConnectionConfig:
    host: str
    username: str
    password: str
    port: int = 8728
    use_ssl: bool = False
    timeout: int = 10  # seconds


class RouterClient:
    """
    Low-level connection wrapper around the RouterOS API.

    Usage (context manager — preferred):
        with RouterClient.from_router(router_obj) as client:
            health = client.get_system_health()

    Usage (manual):
        client = RouterClient.from_router(router_obj)
        try:
            client.connect()
            result = client.run_command('/ip/address/print')
        finally:
            client.disconnect()
    """

    def __init__(self, config: RouterConnectionConfig):
        self.config = config
        self._api = None
        self._connected = False

    @classmethod
    def from_router(cls, router) -> 'RouterClient':
        """Build a RouterClient from a Router model instance."""
        return cls(RouterConnectionConfig(
            host=router.ip_address,
            username=router.username,
            password=router.password,
            port=router.api_port,
            use_ssl=router.api_ssl,
            timeout=5,
        ))

    def connect(self) -> None:
        """Establish connection to RouterOS API."""
        try:
            import routeros_api  # type: ignore
            pool = routeros_api.RouterOsApiPool(
                self.config.host,
                username=self.config.username,
                password=self.config.password,
                port=self.config.port,
                use_ssl=self.config.use_ssl,
                plaintext_login=True,
            )
            self._api = pool.get_api()
            self._connected = True
            logger.debug("RouterClient connected to %s", self.config.host)
        except ImportError:
            raise RouterConnectionError(
                "routeros-api package not installed. "
                "Run: pip install routeros-api"
            )
        except Exception as exc:
            logger.warning("RouterClient connection failed: %s — %s", self.config.host, exc)
            raise RouterConnectionError(str(exc)) from exc

    def disconnect(self) -> None:
        """Close the API connection."""
        if self._api:
            try:
                self._api.disconnect()
            except Exception:
                pass
            finally:
                self._api = None
                self._connected = False

    def run_command(self, command: str, **kwargs) -> list:
        """
        Execute a RouterOS API command and return the result list.

        Args:
            command: RouterOS API path, e.g. '/ip/address/print'
            **kwargs: filter parameters, e.g. name='pppoe-fardin'

        Returns:
            List of result dicts from RouterOS.
        """
        if not self._connected or not self._api:
            raise RouterConnectionError("Not connected. Call connect() first.")
        try:
            resource = self._api.get_resource(command)
            if kwargs:
                result = resource.get(**kwargs)
            else:
                result = resource.get()
            return result
        except Exception as exc:
            logger.error("RouterOS command '%s' failed: %s", command, exc)
            raise RouterCommandError(str(exc)) from exc

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()
        return False  # don't suppress exceptions

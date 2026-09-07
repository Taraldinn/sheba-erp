"""
MikroTik Clients — Low-level communication with RouterOS devices.
Supports:
1. MikroTikRESTClient (RouterOS v7+ HTTPS REST API)
2. RouterClient (Legacy RouterOS API port 8728)
"""
import logging
import urllib3
from dataclasses import dataclass
from typing import Any, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

# Suppress self-signed certificate warnings when ssl_verify=False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class MikroTikClientError(Exception):
    """Base exception for MikroTik client errors."""
    pass


class MikroTikConnectionError(MikroTikClientError):
    """Raised when the router cannot be reached."""
    pass


class MikroTikTimeoutError(MikroTikClientError):
    """Raised when request times out."""
    pass


class MikroTikAuthError(MikroTikClientError):
    """Raised when authentication fails (HTTP 401/403)."""
    pass


class MikroTikResponseError(MikroTikClientError):
    """Raised when RouterOS returns a non-2xx status code or error response."""
    def __init__(self, message: str, status_code: Optional[int] = None, response_body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class RouterConnectionError(Exception):
    """Legacy RouterOS API connection error."""
    pass


class RouterCommandError(Exception):
    """Legacy RouterOS API command error."""
    pass


@dataclass
class RouterConnectionConfig:
    host: str
    username: str
    password: str
    port: int = 8728
    use_ssl: bool = False
    timeout: int = 10


class MikroTikRESTClient:
    """
    RouterOS v7+ REST API Client.
    Communicates via HTTPS to RouterOS /rest endpoints.
    
    Security:
    - Passwords are never logged or exposed in exception messages.
    - Uses HTTP Basic Authentication over HTTPS.
    - Connection timeouts and retry policies are enforced.
    """

    def __init__(
        self,
        host: str,
        username: str,
        password: str,
        port: int = 443,
        ssl_verify: bool = False,
        timeout: int = 10,
        retry_count: int = 2,
    ):
        self.host = host.strip()
        self.username = username.strip()
        self.password = password
        self.port = port
        self.ssl_verify = ssl_verify
        self.timeout = max(1, int(timeout))
        self.retry_count = max(0, int(retry_count))
        self.base_url = f"https://{self.host}:{self.port}/rest"

        # Configure session with connection pooling and retries
        self.session = requests.Session()
        self.session.auth = (self.username, self.password)
        self.session.verify = self.ssl_verify
        self.session.headers.update({
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Sheba-ISP-ERP/1.0',
        })

        if self.retry_count > 0:
            retries = Retry(
                total=self.retry_count,
                backoff_factor=0.3,
                status_forcelist=[502, 503, 504],
                raise_on_status=False,
            )
            adapter = HTTPAdapter(max_retries=retries)
            self.session.mount("https://", adapter)
            self.session.mount("http://", adapter)

    @classmethod
    def from_router(cls, router) -> 'MikroTikRESTClient':
        """Constructs a MikroTikRESTClient directly from a Router model instance."""
        host = router.effective_host
        port = router.https_port or 443
        return cls(
            host=host,
            username=router.username,
            password=router.password,
            port=port,
            ssl_verify=router.ssl_verify,
            timeout=router.connection_timeout or 10,
            retry_count=router.retry_count or 2,
        )

    def _build_url(self, endpoint: str) -> str:
        clean_endpoint = endpoint.lstrip('/')
        if clean_endpoint.startswith('rest/'):
            clean_endpoint = clean_endpoint[5:]
        return f"{self.base_url}/{clean_endpoint}"

    def _handle_request_error(self, exc: Exception, endpoint: str) -> None:
        """Translates requests exceptions into MikroTik client exceptions without leaking secrets."""
        if isinstance(exc, requests.exceptions.Timeout):
            raise MikroTikTimeoutError(
                f"Connection to router at {self.host}:{self.port} timed out after {self.timeout}s."
            ) from exc
        if isinstance(exc, requests.exceptions.SSLError):
            raise MikroTikConnectionError(
                f"SSL verification error connecting to router at {self.host}:{self.port}. ({exc})"
            ) from exc
        if isinstance(exc, requests.exceptions.ConnectionError):
            raise MikroTikConnectionError(
                f"Unable to connect to router at {self.host}:{self.port}. Verify IP/port and firewall."
            ) from exc
        raise MikroTikClientError(f"Unexpected error communicating with router: {exc}") from exc

    def _parse_response(self, response: requests.Response, endpoint: str) -> Any:
        if response.status_code in (401, 403):
            raise MikroTikAuthError(
                f"Authentication failed for user '{self.username}' on router {self.host}:{self.port} (HTTP {response.status_code})."
            )

        if not response.ok:
            error_msg = f"RouterOS error {response.status_code} on {endpoint}."
            try:
                err_data = response.json()
                if isinstance(err_data, dict) and 'detail' in err_data:
                    error_msg = f"{error_msg} Detail: {err_data['detail']}"
                elif isinstance(err_data, dict) and 'error' in err_data:
                    error_msg = f"{error_msg} Error: {err_data['error']}"
            except Exception:
                error_msg = f"{error_msg} Body: {response.text[:200]}"
            raise MikroTikResponseError(error_msg, status_code=response.status_code)

        if not response.content:
            return None

        try:
            return response.json()
        except Exception as exc:
            raise MikroTikResponseError(
                f"Invalid JSON returned from RouterOS on {endpoint}: {exc}"
            ) from exc

    def get(self, endpoint: str, params: Optional[dict] = None) -> Any:
        """Perform a GET request to a RouterOS REST endpoint."""
        url = self._build_url(endpoint)
        try:
            resp = self.session.get(url, params=params, timeout=self.timeout)
            return self._parse_response(resp, endpoint)
        except (MikroTikClientError, MikroTikAuthError, MikroTikResponseError):
            raise
        except Exception as exc:
            self._handle_request_error(exc, endpoint)

    def post(self, endpoint: str, json_data: Optional[dict] = None) -> Any:
        """Perform a POST request to a RouterOS REST endpoint."""
        url = self._build_url(endpoint)
        try:
            resp = self.session.post(url, json=json_data, timeout=self.timeout)
            return self._parse_response(resp, endpoint)
        except (MikroTikClientError, MikroTikAuthError, MikroTikResponseError):
            raise
        except Exception as exc:
            self._handle_request_error(exc, endpoint)

    def patch(self, endpoint: str, json_data: Optional[dict] = None) -> Any:
        """Perform a PATCH request to a RouterOS REST endpoint."""
        url = self._build_url(endpoint)
        try:
            resp = self.session.patch(url, json=json_data, timeout=self.timeout)
            return self._parse_response(resp, endpoint)
        except (MikroTikClientError, MikroTikAuthError, MikroTikResponseError):
            raise
        except Exception as exc:
            self._handle_request_error(exc, endpoint)

    def put(self, endpoint: str, json_data: Optional[dict] = None) -> Any:
        """Perform a PUT request to a RouterOS REST endpoint."""
        url = self._build_url(endpoint)
        try:
            resp = self.session.put(url, json=json_data, timeout=self.timeout)
            return self._parse_response(resp, endpoint)
        except (MikroTikClientError, MikroTikAuthError, MikroTikResponseError):
            raise
        except Exception as exc:
            self._handle_request_error(exc, endpoint)

    def delete(self, endpoint: str) -> Any:
        """Perform a DELETE request to a RouterOS REST endpoint."""
        url = self._build_url(endpoint)
        try:
            resp = self.session.delete(url, timeout=self.timeout)
            return self._parse_response(resp, endpoint)
        except (MikroTikClientError, MikroTikAuthError, MikroTikResponseError):
            raise
        except Exception as exc:
            self._handle_request_error(exc, endpoint)

    def close(self) -> None:
        """Closes the underlying requests session."""
        self.session.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False


class RouterClient:
    """
    Legacy RouterOS Binary API connection wrapper (Port 8728).
    Kept for backwards compatibility if Router.api_protocol == 'API'.
    """

    def __init__(self, config: RouterConnectionConfig):
        self.config = config
        self._api = None
        self._connected = False

    @classmethod
    def from_router(cls, router) -> 'RouterClient':
        return cls(RouterConnectionConfig(
            host=router.effective_host,
            username=router.username,
            password=router.password,
            port=router.api_port or 8728,
            use_ssl=router.api_ssl,
            timeout=router.connection_timeout or 5,
        ))

    def connect(self) -> None:
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
        except ImportError:
            raise RouterConnectionError("routeros-api package not installed.")
        except Exception as exc:
            raise RouterConnectionError(str(exc)) from exc

    def disconnect(self) -> None:
        if self._api:
            try:
                self._api.disconnect()
            except Exception:
                pass
            finally:
                self._api = None
                self._connected = False

    def run_command(self, command: str, **kwargs) -> list:
        if not self._connected or not self._api:
            raise RouterConnectionError("Not connected. Call connect() first.")
        try:
            resource = self._api.get_resource(command)
            if kwargs:
                return resource.get(**kwargs)
            return resource.get()
        except Exception as exc:
            raise RouterCommandError(str(exc)) from exc

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()
        return False

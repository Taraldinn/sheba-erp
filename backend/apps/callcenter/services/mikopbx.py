import socket
import ipaddress
import logging
from urllib.parse import urlparse
import requests

logger = logging.getLogger(__name__)


class MikoPBXException(Exception):
    pass


class MikoPBXClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = (base_url or '').rstrip('/')
        self.api_key = api_key

    def _validate_url_and_resolve(self):
        parsed = urlparse(self.base_url)
        if parsed.scheme != 'https':
            raise MikoPBXException("Set a valid MikoPBX HTTPS address.")
        if not parsed.hostname:
            raise MikoPBXException("Invalid MikoPBX URL.")
            
        try:
            addr_infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443)
        except socket.gaierror:
            raise MikoPBXException("Could not resolve the MikoPBX server.")
            
        public_ip_found = False
        for info in addr_infos:
            ip = info[4][0]
            try:
                ip_obj = ipaddress.ip_address(ip)
                if not ip_obj.is_private and not ip_obj.is_reserved and not ip_obj.is_loopback:
                    public_ip_found = True
            except ValueError:
                pass
                
        if not public_ip_found:
            raise MikoPBXException("MikoPBX address must resolve to a public IP.")
        
        return parsed.hostname
        
    def request(self, path: str, query: dict = None) -> list:
        if not self.base_url or not self.api_key:
            raise MikoPBXException("Set a valid MikoPBX HTTPS address and API key first.")
            
        self._validate_url_and_resolve()
        
        url = f"{self.base_url}/pbxcore/api/v3/{path}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json"
        }
        
        try:
            response = requests.get(url, headers=headers, params=query, timeout=(4, 12))
        except requests.exceptions.RequestException as e:
            raise MikoPBXException(f"MikoPBX connection failed: {str(e)}")
            
        if response.status_code in (401, 403):
            raise MikoPBXException("MikoPBX API key lacks access to this endpoint.")
        if response.status_code == 404:
            raise MikoPBXException(f"MikoPBX returned HTTP 404 for /pbxcore/api/v3/{path}. Check the PBX address, reverse proxy routing, and the CDR endpoint in System > API Keys > API Documentation.")
        if response.status_code != 200:
            raise MikoPBXException(f"MikoPBX returned HTTP {response.status_code}.")
            
        try:
            body = response.json()
        except ValueError:
            raise MikoPBXException("MikoPBX returned an invalid JSON response.")
            
        if not isinstance(body, dict) or not body.get('result') or 'data' not in body:
            raise MikoPBXException("MikoPBX returned an unsuccessful API response.")
            
        data = body['data']
        if path == 'cdr' and isinstance(data, dict) and 'records' in data:
            return data['records'] if isinstance(data['records'], list) else []
            
        return data if isinstance(data, list) else []

    @staticmethod
    def _digits(value: str) -> str:
        value = str(value)
        number = "".join(filter(str.isdigit, value))
        if number.startswith('88') and len(number) == 13:
            return number[2:]
        return number

    @classmethod
    def is_visible_call(cls, row: dict, did: str, allowed_extensions: list) -> bool:
        did = cls._digits(did)
        source = cls._digits(row.get('src_num', ''))
        target = cls._digits(row.get('dst_num', ''))
        row_did = cls._digits(row.get('did', ''))
        
        is_inbound = did != '' and (row_did == did or target == did)
        is_outbound = source in allowed_extensions and len(target) >= 10
        
        if not is_inbound and not is_outbound:
            return False
            
        # Tenant isolation: incoming calls need the assigned DID, outgoing calls an assigned extension.
        if is_inbound and allowed_extensions and target not in allowed_extensions:
            channels = f"{row.get('dst_chan', '')} {row.get('src_chan', '')}"
            for extension in allowed_extensions:
                # Basic matching similar to PHP's preg_match
                upper_channels = channels.upper()
                if f"PJSIP/{extension}-" in upper_channels or f"SIP/{extension}-" in upper_channels \
                   or f"PJSIP/{extension}@" in upper_channels or f"SIP/{extension}@" in upper_channels \
                   or f"PJSIP/{extension} " in upper_channels or f"SIP/{extension} " in upper_channels:
                    return True
            return row_did == did and (target == did or target == '')
            
        return is_inbound or is_outbound

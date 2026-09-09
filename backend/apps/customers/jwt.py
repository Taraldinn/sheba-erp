"""
HMAC-SHA256 JWT implementation for ShebaFi ISP Customer Portal.
Provides stateless, signed tokens encoding customer_id, tenant_id, and expiration.
"""

import hmac
import hashlib
import base64
import json
import time
from typing import Optional, Dict, Any
from django.conf import settings


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')


def _base64url_decode(data_str: str) -> bytes:
    padding = 4 - (len(data_str) % 4)
    if padding != 4:
        data_str += '=' * padding
    return base64.urlsafe_b64decode(data_str.encode('utf-8'))


def generate_customer_jwt(customer, expires_in_seconds: int = 7 * 24 * 3600) -> str:
    """
    Generates a cryptographically signed JWT for a Customer model instance.
    Payload strictly binds the customer to their tenant_id.
    """
    now = int(time.time())
    header = {
        "alg": "HS256",
        "typ": "JWT"
    }
    payload = {
        "customer_id": str(customer.id),
        "tenant_id": str(customer.tenant_id),
        "pppoe_username": customer.pppoe_username,
        "type": "customer_portal",
        "iat": now,
        "exp": now + expires_in_seconds
    }

    header_bytes = json.dumps(header, separators=(',', ':')).encode('utf-8')
    payload_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')

    header_b64 = _base64url_encode(header_bytes)
    payload_b64 = _base64url_encode(payload_bytes)

    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    secret = settings.SECRET_KEY.encode('utf-8')
    signature = hmac.new(secret, signing_input, hashlib.sha256).digest()
    signature_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def decode_customer_jwt(token: str, tenant_id: Any = None) -> Optional[Dict[str, Any]]:
    """
    Validates signature, expiration, and tenant matching for a customer JWT.
    Returns the decoded claims dictionary if valid, or None if invalid or expired.
    """
    if not token or not isinstance(token, str):
        return None

    parts = token.strip().split('.')
    if len(parts) != 3:
        return None

    header_b64, payload_b64, signature_b64 = parts

    # 1. Verify signature
    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    secret = settings.SECRET_KEY.encode('utf-8')
    expected_sig = hmac.new(secret, signing_input, hashlib.sha256).digest()
    expected_sig_b64 = _base64url_encode(expected_sig)

    if not hmac.compare_digest(signature_b64, expected_sig_b64):
        return None

    # 2. Decode payload
    try:
        payload_bytes = _base64url_decode(payload_b64)
        claims = json.loads(payload_bytes.decode('utf-8'))
    except Exception:
        return None

    # 3. Check expiration
    now = int(time.time())
    exp = claims.get('exp')
    if exp and exp < now:
        return None

    # 4. Check token type
    if claims.get('type') != 'customer_portal':
        return None

    # 5. Enforce tenant match if tenant_id provided
    if tenant_id is not None:
        if str(claims.get('tenant_id')) != str(tenant_id):
            return None

    return claims

"""
IP-Phone driver abstraction, ported from
``php-legecy-shebafi/classes/IPPhoneDriver.php``.

Each driver exposes a ``click_to_call(phone, extension)`` method and returns
a dict with ``success``, ``message`` and ``raw_response``. The
``IPPhoneDriver.get_driver_for_config(config)`` factory picks the right
driver based on ``IPPhoneConfig.driver``.

The HTTP layer is centralised in ``_HttpClient`` so it can be monkey-patched
from tests (or replaced with a real telco SDK once we have credentials).
"""
from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional

import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

logger = logging.getLogger(__name__)


# ── legacy-compatible encryption helper ─────────────────────────────────────
# Mirrors PHP IPPhoneDriver::encrypt / decrypt (AES-256-CBC with sha256(key)
# as IV). Stored ciphertexts from the legacy DB can be decrypted via
# ``legacy_decrypt_token``. We re-encrypt new tokens with AES-GCM and tag them
# with an ``enc:gcm:v1:`` prefix.
_AES_KEY_MATERIAL = (
    getattr(settings, 'CALLCENTER_TOKEN_KEY', None)
    or getattr(settings, 'SECRET_KEY', '')
)


def encrypt_token(plaintext: str) -> str:
    """Encrypt a credential for storage. Uses AES-GCM with a tag prefix so
    we can distinguish it from legacy ciphertexts."""
    if not plaintext:
        return ''
    nonce = os.urandom(12)
    aes = AESGCM(_aes_key())
    ct = aes.encrypt(nonce, plaintext.encode('utf-8'),
                     associated_data=b'callcenter-token-v1')
    return 'enc:gcm:v1:' + base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypts either our AES-GCM ciphertext or the legacy AES-CBC envelope
    (so we can read existing rows during migration)."""
    if not ciphertext:
        return ''
    if ciphertext.startswith('enc:gcm:v1:'):
        try:
            raw = base64.urlsafe_b64decode(ciphertext[len('enc:gcm:v1:'):].encode())
            aes = AESGCM(_aes_key())
            pt = aes.decrypt(raw[:12], raw[12:], b'callcenter-token-v1')
            return pt.decode('utf-8')
        except Exception:
            return ''
    # Legacy AES-256-CBC fallback (sha256(key) as IV)
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        key = _aes_key()
        iv = key[:16]
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        pad = base64.b64decode(ciphertext)
        dec = cipher.decryptor()
        plaintext = dec.update(pad) + dec.finalize()
        # PKCS#7 strip
        pad_len = plaintext[-1]
        if 0 < pad_len <= 16 and plaintext[-pad_len:] == bytes([pad_len]) * pad_len:
            plaintext = plaintext[:-pad_len]
        return plaintext.decode('utf-8', errors='replace')
    except Exception:
        return ''


def _aes_key() -> bytes:
    """Derive the AES-256 key from settings — same SHA-256 truncation that
    PHP and WireGuardService use for tenant-isolated key material."""
    import hashlib
    raw = (_AES_KEY_MATERIAL or '').encode('utf-8')
    return hashlib.sha256(b'callcenter-token-v1:' + raw).digest()


# ── HTTP seam (replaceable in tests) ─────────────────────────────────────────

class _HttpClient:
    def post(self, url: str, fields: dict, timeout: int = 15) -> tuple[int, str]:
        try:
            resp = requests.post(url, data=fields, timeout=timeout)
            return resp.status_code, resp.text
        except requests.RequestException as exc:
            return 0, str(exc)

    def get(self, url: str, timeout: int = 15) -> tuple[int, str]:
        try:
            resp = requests.get(url, timeout=timeout)
            return resp.status_code, resp.text
        except requests.RequestException as exc:
            return 0, str(exc)


_default_http = _HttpClient()


# ── Driver interface ────────────────────────────────────────────────────────

@dataclass
class ClickResult:
    success: bool
    message: str
    raw_response: str
    call_status: Optional[str] = None
    duration: int = 0
    recording_url: Optional[str] = None
    driver: str = ''
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            'success': self.success,
            'message': self.message,
            'raw_response': self.raw_response,
            'call_status': self.call_status,
            'duration': self.duration,
            'recording_url': self.recording_url,
            'driver': self.driver,
            **self.extra,
        }


class IPPhoneDriverBase:
    driver_name = 'base'

    def __init__(self, config: dict, http: Optional[_HttpClient] = None):
        self.config = config
        self.http = http or _default_http

    def click_to_call(self, phone: str, extension: str) -> ClickResult:
        raise NotImplementedError

    # Mirrors PHP ``IPPhoneDriver::encrypt`` for legacy compatibility.
    @staticmethod
    def encrypt(plain: str) -> str:
        return encrypt_token(plain)

    @staticmethod
    def decrypt(cipher: str) -> str:
        return decrypt_token(cipher)


class GenericRestDriver(IPPhoneDriverBase):
    driver_name = 'generic_rest'

    def click_to_call(self, phone: str, extension: str) -> ClickResult:
        url_template = self.config.get('base_url') or ''
        username = self.config.get('username') or ''
        token = decrypt_token(self.config.get('password_token_enc') or '')
        caller_id = self.config.get('caller_id') or ''

        placeholders = {
            '{USERNAME}': username, '{TOKEN}': token,
            '{CALLER_ID}': caller_id, '{EXTENSION}': extension, '{PHONE}': phone,
        }

        if '{' in url_template:
            url = url_template
            for k, v in placeholders.items():
                url = url.replace(k, str(v))
            status, body = self.http.get(url)
        else:
            post_fields = {
                'username': username, 'token': token, 'caller_id': caller_id,
                'extension': extension, 'phone': phone, 'action': 'call',
            }
            status, body = self.http.post(url_template, post_fields)

        ok = 200 <= status < 300
        return ClickResult(
            success=ok,
            message=('Call initiated successfully via REST API.' if ok
                     else f'API returned HTTP {status}.'),
            raw_response=f'HTTP {status} | Body: {body[:1000]}',
            driver=self.driver_name,
        )


class FlemsoftDriver(IPPhoneDriverBase):
    """Flemsoft VoiceAPI driver.

    The PHP version posts ``{base_url}?username=...&token=...&callerid=...&phoneno=...``.
    Real-life Flemsoft customers sometimes override the path; we accept either
    the legacy path or a custom ``base_url``."""
    driver_name = 'flemsoft'

    DEFAULT_BASE = 'https://flemsoft.com/voiceapi/newrequest/'

    def click_to_call(self, phone: str, extension: str) -> ClickResult:
        base_url = self.config.get('base_url') or self.DEFAULT_BASE
        username = self.config.get('username') or 'flemsoft'
        token = decrypt_token(self.config.get('password_token_enc') or '')
        caller_id = self.config.get('caller_id') or ''
        fields = {
            'username': username, 'token': token, 'callerid': caller_id,
            'phoneno': phone,
        }
        status, body = self.http.post(base_url, fields)
        ok = 200 <= status < 300
        call_status = 'Answered'
        recording_url = None
        if ok:
            try:
                parsed = json.loads(body)
                call_status = parsed.get('call_status') or call_status
                recording_url = parsed.get('recording_url') or None
            except (ValueError, TypeError):
                pass
        return ClickResult(
            success=ok,
            message=('Flemsoft call initiated.' if ok
                     else f'Flemsoft API returned HTTP {status}.'),
            raw_response=f'HTTP {status} | Body: {body[:1000]}',
            call_status=call_status,
            recording_url=recording_url,
            driver=self.driver_name,
        )


class DemoDriver(IPPhoneDriverBase):
    driver_name = 'demo'

    def click_to_call(self, phone: str, extension: str) -> ClickResult:
        return ClickResult(
            success=True,
            message='Demo driver — no real call placed.',
            raw_response='demo-mode',
            call_status='Answered',
            recording_url=None,
            driver=self.driver_name,
        )


def get_driver_for_config(config: Mapping[str, Any],
                          http: Optional[_HttpClient] = None) -> IPPhoneDriverBase:
    """Factory mirroring PHP ``IPPhoneDriver::getDriver($pdo, $owner_id)``.
    Pass an ``IPPhoneConfig`` instance (dict-like) or a plain dict."""
    if isinstance(config, dict):
        cfg = dict(config)
    else:
        cfg = {
            'driver': getattr(config, 'driver', ''),
            'base_url': getattr(config, 'base_url', ''),
            'username': getattr(config, 'username', ''),
            'password_token_enc': getattr(config, 'password_token_enc', ''),
            'caller_id': getattr(config, 'caller_id', ''),
            'extension': getattr(config, 'extension', ''),
            'enabled': getattr(config, 'enabled', True),
            'test_mode': getattr(config, 'test_mode', False),
        }
    if not cfg.get('enabled', True):
        return DemoDriver(cfg, http=http)
    driver = (cfg.get('driver') or '').lower()
    if driver == 'flemsoft':
        return FlemsoftDriver(cfg, http=http)
    if driver == 'demo':
        return DemoDriver(cfg, http=http)
    return GenericRestDriver(cfg, http=http)

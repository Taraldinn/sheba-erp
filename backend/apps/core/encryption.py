import base64
import hashlib
import hmac
import logging
from typing import Union
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from cryptography.fernet import Fernet, MultiFernet, InvalidToken

logger = logging.getLogger(__name__)

_PREFIX = "enc:"


def _derive_fernet_key(key_input: str) -> bytes:
    """
    Derives a valid 32-byte urlsafe base64 Fernet key from any string.
    If the key is already a valid 44-char Fernet key, it is returned directly as bytes.
    """
    key_bytes = key_input.strip().encode('utf-8')
    try:
        # Check if already a valid 32-byte base64-encoded key
        decoded = base64.urlsafe_b64decode(key_bytes)
        if len(decoded) == 32:
            return key_bytes
    except Exception:
        pass

    # Derive deterministic 32-byte key via SHA-256
    digest = hashlib.sha256(key_bytes).digest()
    return base64.urlsafe_b64encode(digest)


def _get_fernet() -> Union[Fernet, MultiFernet]:
    """
    Constructs a Fernet or MultiFernet instance using FIELD_ENCRYPTION_KEY or ENCRYPTION_KEY.
    Supports comma-separated keys for zero-downtime key rotation:
    - Encryption always uses the first (primary) key.
    - Decryption attempts keys in order (primary, then legacy fallback keys).
    """
    is_debug = getattr(settings, 'DEBUG', False)
    field_key = getattr(settings, 'FIELD_ENCRYPTION_KEY', None) or getattr(settings, 'ENCRYPTION_KEY', None)

    if not is_debug:
        if not field_key or not str(field_key).strip():
            raise ImproperlyConfigured(
                "FIELD_ENCRYPTION_KEY must be configured in non-debug mode."
            )
        raw_secret = field_key
    else:
        raw_secret = (
            field_key
            or getattr(settings, 'SECRET_KEY', 'default-dev-key')
            or 'default-dev-key'
        )

    raw_keys = [k.strip() for k in str(raw_secret).split(',') if k.strip()]
    if not raw_keys:
        if not is_debug:
            raise ImproperlyConfigured(
                "FIELD_ENCRYPTION_KEY must contain at least one valid key."
            )
        raw_keys = ['default-dev-key']

    fernet_instances = [Fernet(_derive_fernet_key(k)) for k in raw_keys]

    if len(fernet_instances) == 1:
        return fernet_instances[0]
    return MultiFernet(fernet_instances)


def is_encrypted(text: str) -> bool:
    """Returns True if the string has the encryption prefix."""
    return bool(text and isinstance(text, str) and text.startswith(_PREFIX))


def encrypt_str(text: str) -> str:
    """
    Encrypts a plaintext string using Fernet symmetric encryption.
    If the string is already encrypted (starts with 'enc:'), it returns it unmodified.
    """
    if not text:
        return text
    if is_encrypted(text):
        return text
    f = _get_fernet()
    token = f.encrypt(text.encode('utf-8')).decode('utf-8')
    return f"{_PREFIX}{token}"


def decrypt_str(encrypted_text: str) -> str:
    """
    Decrypts an encrypted string.
    If the string does not have the 'enc:' prefix, it is treated as legacy plaintext
    and returned directly.
    Catches invalid tokens and decrypt errors safely without leaking secrets into logs.
    """
    if not encrypted_text:
        return encrypted_text
    if not is_encrypted(encrypted_text):
        return encrypted_text
    raw_token = encrypted_text[len(_PREFIX):]
    try:
        f = _get_fernet()
        return f.decrypt(raw_token.encode('utf-8')).decode('utf-8')
    except InvalidToken:
        logger.error("Failed to decrypt secret: invalid or corrupted token / wrong encryption key.")
        return ""
    except Exception as exc:
        logger.error("Failed to decrypt secret: decryption exception encountered: %s", type(exc).__name__)
        return ""


def reencrypt_str(encrypted_text: str) -> str:
    """
    Decrypts an encrypted token (using any valid key in the rotation chain)
    and re-encrypts it using the primary key.
    """
    if not encrypted_text:
        return encrypted_text
    plaintext = decrypt_str(encrypted_text)
    if not plaintext:
        return encrypted_text
    # Force new encryption with primary key
    f = _get_fernet()
    # If MultiFernet, rotate() re-encrypts with primary key directly
    if isinstance(f, MultiFernet) and is_encrypted(encrypted_text):
        try:
            raw_token = encrypted_text[len(_PREFIX):]
            rotated = f.rotate(raw_token.encode('utf-8')).decode('utf-8')
            return f"{_PREFIX}{rotated}"
        except Exception:
            pass
    token = f.encrypt(plaintext.encode('utf-8')).decode('utf-8')
    return f"{_PREFIX}{token}"


def mask_credential(value: str, visible_start: int = 0, visible_end: int = 4) -> str:
    """
    Masks a credential string for safe display in metadata or UI.
    Example: '01711223344' -> '•••••••3344'
    Short strings (<= visible_start + visible_end) are fully masked.
    """
    if not value:
        return ""
    val_str = str(value).strip()
    if len(val_str) <= (visible_start + visible_end):
        return "•" * len(val_str) if len(val_str) > 0 else ""
    prefix = val_str[:visible_start] if visible_start > 0 else ""
    suffix = val_str[-visible_end:] if visible_end > 0 else ""
    mask_length = len(val_str) - visible_start - visible_end
    return f"{prefix}{'•' * min(mask_length, 8)}{suffix}"


def constant_time_compare(val1: str, val2: str) -> bool:
    """
    Compares two strings in constant time to prevent timing attack vulnerabilities.
    """
    if not isinstance(val1, (str, bytes)) or not isinstance(val2, (str, bytes)):
        return False
    b1 = val1.encode('utf-8') if isinstance(val1, str) else val1
    b2 = val2.encode('utf-8') if isinstance(val2, str) else val2
    return hmac.compare_digest(b1, b2)


def verify_webhook_signature(provided_signature: str, payload_bytes: bytes, secret: str) -> bool:
    """
    Verifies an HMAC-SHA256 webhook signature using constant-time comparison.
    """
    if not provided_signature or not secret:
        return False
    expected_sig = hmac.new(
        secret.encode('utf-8'),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()
    return constant_time_compare(provided_signature.strip().lower(), expected_sig.lower())

import base64
import hashlib
import logging
from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_PREFIX = "enc:"


def _get_fernet() -> Fernet:
    raw_secret = getattr(settings, 'ENCRYPTION_KEY', None) or getattr(settings, 'SECRET_KEY', 'default-dev-key')
    # Derive a 32-byte URL-safe base64 key using SHA-256
    digest = hashlib.sha256(raw_secret.encode('utf-8')).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_str(text: str) -> str:
    """
    Encrypts a plaintext string using Fernet symmetric encryption.
    If the string is already encrypted (starts with 'enc:'), it returns it unmodified.
    """
    if not text:
        return text
    if text.startswith(_PREFIX):
        return text
    f = _get_fernet()
    token = f.encrypt(text.encode('utf-8')).decode('utf-8')
    return f"{_PREFIX}{token}"


def decrypt_str(encrypted_text: str) -> str:
    """
    Decrypts an encrypted string.
    If the string does not have the 'enc:' prefix, it is treated as legacy plaintext
    and returned directly.
    """
    if not encrypted_text:
        return encrypted_text
    if not encrypted_text.startswith(_PREFIX):
        return encrypted_text
    raw_token = encrypted_text[len(_PREFIX):]
    try:
        f = _get_fernet()
        return f.decrypt(raw_token.encode('utf-8')).decode('utf-8')
    except (InvalidToken, Exception) as exc:
        logger.error("Failed to decrypt secret: %s", exc)
        return ""

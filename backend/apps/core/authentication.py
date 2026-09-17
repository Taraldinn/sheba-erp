"""
backend/apps/core/authentication.py — DRF API Key Authentication Backend.

Supports server-to-server and Backend-For-Frontend (BFF) authentication using
ISP Secret API Keys.

Header conventions:
    X-API-Key: <secret>
    Authorization: Api-Key <secret>
"""

from django.utils import timezone
from rest_framework import authentication, exceptions
from apps.core.models import TenantApiToken


class ApiKeyPrincipal:
    """
    Lightweight principal representing a machine or BFF authenticated via an ISP API Key.
    Fulfills the Django/DRF request.user contract.
    """
    def __init__(self, token: TenantApiToken):
        self.api_token = token
        self.tenant = token.tenant
        self.id = token.id
        self.pk = token.id
        self.username = f"api_key:{token.key_prefix}"
        self.is_authenticated = True
        self.is_staff = False
        self.is_superuser = False
        self.is_active = True
        self.permissions = list(token.permissions or [])

    @property
    def email(self):
        return ""

    def has_perm(self, perm, obj=None):
        return perm in self.permissions or '*' in self.permissions

    def has_module_perms(self, app_label):
        return True

    def __str__(self):
        return f"ApiKeyPrincipal({self.api_token.name}@{self.tenant.slug})"

    def __repr__(self):
        return f"<ApiKeyPrincipal: {self.api_token.key_prefix} ({self.tenant.slug})>"


def extract_raw_api_key(request) -> str | None:
    """
    Extracts raw API key string from X-API-Key or Authorization: Api-Key header.
    """
    x_api_key = request.META.get('HTTP_X_API_KEY')
    if x_api_key:
        return x_api_key.strip()

    auth_header = authentication.get_authorization_header(request).split()
    if auth_header and len(auth_header) == 2:
        prefix = auth_header[0].decode('utf-8', errors='ignore').lower()
        if prefix in ('api-key', 'apikey'):
            return auth_header[1].decode('utf-8', errors='ignore').strip()

    return None


class TenantApiKeyAuthentication(authentication.BaseAuthentication):
    """
    DRF Authentication Backend for ISP Secret API Keys.
    Extracts X-API-Key, verifies the token against stored SHA-256 hash in constant time,
    validates lifecycle status and expiration, and binds tenant & scopes to the request.
    """

    def authenticate(self, request):
        raw_key = extract_raw_api_key(request)
        if not raw_key:
            return None

        # Determine prefix for candidate lookup
        prefix = TenantApiToken._make_prefix(raw_key)

        # Query active candidate tokens by prefix
        candidates = TenantApiToken.objects.select_related('tenant').filter(
            key_prefix=prefix
        )

        matched_token: TenantApiToken | None = None
        for candidate in candidates:
            if candidate.check_hash(raw_key):
                matched_token = candidate
                break

        if not matched_token:
            raise exceptions.AuthenticationFailed(
                detail={"error": "Invalid API key provided.", "code": "INVALID_API_KEY"}
            )

        # Check token lifecycle status
        status = matched_token.effective_status
        if status == TenantApiToken.CredentialStatus.REVOKED:
            raise exceptions.AuthenticationFailed(
                detail={"error": "API key has been revoked.", "code": "CREDENTIAL_REVOKED"}
            )
        if status == TenantApiToken.CredentialStatus.EXPIRED:
            raise exceptions.AuthenticationFailed(
                detail={"error": "API key has expired.", "code": "CREDENTIAL_EXPIRED"}
            )
        if status == TenantApiToken.CredentialStatus.SUSPENDED:
            raise exceptions.AuthenticationFailed(
                detail={"error": "API key is temporarily suspended.", "code": "CREDENTIAL_SUSPENDED"}
            )
        if not matched_token.is_active:
            raise exceptions.AuthenticationFailed(
                detail={"error": "API key is inactive.", "code": "CREDENTIAL_INACTIVE"}
            )

        # Check tenant status
        if not matched_token.tenant.is_active:
            raise exceptions.AuthenticationFailed(
                detail={
                    "error": f'ISP tenant "{matched_token.tenant.name}" is suspended or inactive.',
                    "code": "TENANT_INACTIVE"
                }
            )

        # Update last_used_at timestamp
        now = timezone.now()
        TenantApiToken.objects.filter(id=matched_token.id).update(last_used_at=now)
        matched_token.last_used_at = now

        # Bind context to request
        request.tenant = matched_token.tenant
        request.auth_type = 'api_key'
        request.api_token = matched_token
        request.api_scopes = set(matched_token.permissions or [])

        principal = ApiKeyPrincipal(matched_token)
        return (principal, matched_token)

    def authenticate_header(self, request):
        return 'Api-Key'

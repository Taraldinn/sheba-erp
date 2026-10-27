"""
apps/core/neon_auth.py — Neon Managed Better Auth ⇄ Django bridge.

The Organization portal signs users in with Neon Auth (Google or
email/password). The browser then sends the short-lived Neon JWT to Django:

    Authorization: Bearer <neon jwt>

This module:
  1. verifies that JWT (EdDSA, JWKS, issuer + audience),
  2. maps the Neon account (JWT ``sub``) to one Django ``User`` through
     ``NeonIdentity`` (auto-provisioned on first sight),
  3. exposes a DRF authentication class used ONLY by the ``/api/v1/org/*``
     views (it is deliberately not in DEFAULT_AUTHENTICATION_CLASSES).

Authorization is NOT taken from the JWT. Neon only proves *who* the caller
is; what they may do is decided by Django's own ``OrganizationMembership`` /
``StaffMembership`` rows, exactly like every other user.
"""
from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse

import jwt
from django.conf import settings
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import authentication, exceptions

logger = logging.getLogger(__name__)

_JWT_SHAPE = re.compile(r'^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')


class NeonTokenError(Exception):
    """Raised when a Neon JWT is missing, malformed, expired or untrusted."""


@dataclass(frozen=True)
class NeonClaims:
    sub: str
    email: str
    name: str
    email_verified: bool
    raw: dict[str, Any]


# ── Configuration ─────────────────────────────────────────────────────────


def _base_url() -> str:
    return (getattr(settings, 'NEON_AUTH_BASE_URL', '') or '').strip().rstrip('/')


def neon_issuer() -> str:
    """Issuer == audience == the origin of the Neon Auth URL (no path)."""
    base = _base_url()
    if not base:
        return ''
    parsed = urlparse(base)
    return f'{parsed.scheme}://{parsed.netloc}'


def neon_jwks_url() -> str:
    explicit = (getattr(settings, 'NEON_AUTH_JWKS_URL', '') or '').strip()
    if explicit:
        return explicit
    base = _base_url()
    return f'{base}/.well-known/jwks.json' if base else ''


def is_configured() -> bool:
    return bool(neon_issuer() and neon_jwks_url())


# ── JWT verification ──────────────────────────────────────────────────────

_jwk_clients: dict[str, jwt.PyJWKClient] = {}
_jwk_lock = threading.Lock()


def _get_signing_key(token: str):
    """Resolve the public key for ``token`` from the (cached) Neon JWKS."""
    url = neon_jwks_url()
    with _jwk_lock:
        client = _jwk_clients.get(url)
        if client is None:
            client = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600, timeout=5)
            _jwk_clients[url] = client
    return client.get_signing_key_from_jwt(token).key


def looks_like_jwt(token: str) -> bool:
    return bool(_JWT_SHAPE.match(token or ''))


def verify_neon_token(token: str) -> NeonClaims:
    """Verify signature, expiry, issuer and audience. Raises NeonTokenError."""
    if not is_configured():
        raise NeonTokenError('Neon Auth is not configured on this server.')
    if not looks_like_jwt(token):
        raise NeonTokenError('Malformed token.')
    issuer = neon_issuer()
    try:
        key = _get_signing_key(token)
        payload = jwt.decode(
            token,
            key,
            algorithms=['EdDSA'],  # pin: never accept HS*/none
            issuer=issuer,
            audience=issuer,
            leeway=10,
            options={'require': ['exp', 'iat', 'sub', 'iss', 'aud']},
        )
    except jwt.ExpiredSignatureError as exc:
        raise NeonTokenError('Token expired.') from exc
    except (jwt.PyJWTError, OSError) as exc:
        # PyJWKClientError (unknown kid / JWKS unreachable) is a PyJWTError too.
        logger.info('Neon JWT rejected: %s', exc)
        raise NeonTokenError('Invalid token.') from exc

    if payload.get('banned'):
        raise NeonTokenError('This account is banned.')

    sub = str(payload.get('sub') or '').strip()
    if not sub:
        raise NeonTokenError('Token has no subject.')
    return NeonClaims(
        sub=sub,
        email=str(payload.get('email') or '').strip().lower(),
        name=str(payload.get('name') or '').strip(),
        email_verified=bool(payload.get('emailVerified')),
        raw=payload,
    )


# ── Django user provisioning ──────────────────────────────────────────────


def _unique_username(sub: str) -> str:
    base = 'neon_' + re.sub(r'[^A-Za-z0-9_.-]', '_', sub)[:100]
    candidate, n = base, 1
    while User.objects.filter(username__iexact=candidate).exists():
        n += 1
        candidate = f'{base}_{n}'
    return candidate


def _split_name(full: str, email: str) -> tuple[str, str]:
    full = (full or '').strip() or email.split('@')[0]
    first, _, last = full.partition(' ')
    return first[:150], last.strip()[:150]


def get_or_create_user(claims: NeonClaims) -> User:
    """
    Return the Django user linked to this Neon account, creating it (and the
    ``NeonIdentity`` row) on first sight. Never matches on email.
    """
    from apps.core.models import NeonIdentity

    def _load():
        return NeonIdentity.objects.select_related('user').filter(neon_user_id=claims.sub).first()

    identity = _load()
    if identity is None:
        first, last = _split_name(claims.name, claims.email)
        try:
            with transaction.atomic():
                user = User(
                    username=_unique_username(claims.sub),
                    email=claims.email,
                    first_name=first,
                    last_name=last,
                    is_active=True,
                    is_staff=False,
                    is_superuser=False,
                )
                user.set_unusable_password()
                user.save()
                identity = NeonIdentity.objects.create(
                    neon_user_id=claims.sub,
                    user=user,
                    email=claims.email,
                    email_verified=claims.email_verified,
                    last_seen_at=timezone.now(),
                )
        except IntegrityError:
            # Concurrent first request created it; use that one.
            identity = _load()
            if identity is None:
                raise

    user = identity.user
    if not user.is_active:
        raise exceptions.AuthenticationFailed(
            {'error': 'This account has been deactivated.', 'code': 'ACCOUNT_DISABLED'}
        )

    # Keep the mirror fresh without a write on every request.
    now = timezone.now()
    changed = {}
    if claims.email and identity.email != claims.email:
        changed['email'] = claims.email
    if identity.email_verified != claims.email_verified:
        changed['email_verified'] = claims.email_verified
    if identity.last_seen_at is None or (now - identity.last_seen_at).total_seconds() > 300:
        changed['last_seen_at'] = now
    if changed:
        for k, v in changed.items():
            setattr(identity, k, v)
        identity.save(update_fields=[*changed.keys(), 'updated_at'])
    if claims.email and user.email != claims.email:
        user.email = claims.email
        user.save(update_fields=['email'])
    user.neon_claims = claims  # available to views (e.g. email_verified)
    return user


# ── DRF authentication class ──────────────────────────────────────────────


class NeonJWTAuthentication(authentication.BaseAuthentication):
    """
    ``Authorization: Bearer <neon jwt>`` → linked Django user.

    Returns ``None`` (lets other authenticators run) when the header is absent
    or the bearer value is not JWT-shaped, so opaque session/DRF tokens are
    untouched. A JWT-shaped bearer that fails verification is a hard 401.
    """
    keyword = 'Bearer'

    def authenticate(self, request):
        parts = authentication.get_authorization_header(request).split()
        if len(parts) != 2 or parts[0].lower() != b'bearer':
            return None
        try:
            token = parts[1].decode('ascii')
        except UnicodeError:
            return None
        if not looks_like_jwt(token):
            return None
        try:
            claims = verify_neon_token(token)
        except NeonTokenError as exc:
            raise exceptions.AuthenticationFailed(
                {'error': str(exc), 'code': 'NEON_TOKEN_INVALID'}
            )
        user = get_or_create_user(claims)
        return (user, claims)

    def authenticate_header(self, request):
        return 'Bearer realm="neon-auth"'


# ── Authorization sync on approval ────────────────────────────────────────


def grant_org_ownership(request_obj, tenant) -> Optional[Any]:
    """
    When a platform admin approves an onboarding request that was filed by a
    Neon-linked user, give that user real Django authority over what was
    provisioned: an ``Organization`` they OWN, with the new tenant inside it.
    (The ISP ``StaffMembership`` is granted by the approve view itself.)
    """
    from apps.core.models import NeonIdentity, Organization, OrganizationMembership
    from django.utils.text import slugify

    user_id = getattr(request_obj, 'requested_by_id', None)
    if not user_id or not NeonIdentity.objects.filter(user_id=user_id).exists():
        return None

    existing = (
        OrganizationMembership.objects.filter(
            user_id=user_id, role=OrganizationMembership.Role.OWNER, is_active=True,
            organization__name__iexact=request_obj.organization_name,
        ).select_related('organization').first()
    )
    if existing:
        org = existing.organization
    else:
        base = slugify(request_obj.requested_slug) or slugify(request_obj.organization_name) or 'org'
        slug, n = base, 1
        while Organization.objects.filter(slug=slug).exists():
            n += 1
            slug = f'{base}-{n}'
        org = Organization.objects.create(
            name=request_obj.organization_name,
            slug=slug,
            contact_email=request_obj.contact_email,
            contact_phone=request_obj.contact_phone if request_obj.contact_phone != '—' else '',
            address=request_obj.address or '',
            is_active=True,
        )
        OrganizationMembership.objects.create(
            organization=org,
            user_id=user_id,
            role=OrganizationMembership.Role.OWNER,
            is_active=True,
            accepted_at=timezone.now(),
        )
    if tenant.organization_id != org.id:
        tenant.organization = org
        tenant.save(update_fields=['organization'])
    return org

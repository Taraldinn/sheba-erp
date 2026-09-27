"""
apps/authentication/sessions.py — Per-session auth tokens.

Why this exists
---------------
Django REST Framework's ``Token`` model is *global per user* — the same
token authenticates the user from any number of devices, contexts, or
tenants, and we have no way to revoke a single login without locking
the user out everywhere. In a multi-tenant SaaS that ships to many
ISPs this surfaces as three recurring support complaints:

  1. A tenant admin logs in as staff on their ISP portal at
     ``isp-a.shebafi.xyz`` and then visits the SaaS control plane at
     ``admin.shebafi.xyz`` in the same browser — the second tab picks
     up the *tenant* token, the control plane lets them through with
     wrong-scope credentials, the user now sees another tenant's data.
     ("session distorted")

  2. A user logs out from one device, but a second device on the same
     account remains authenticated indefinitely because we cannot
     invalidate just that session.

  3. Two concurrent logins by the same user get the same token, so the
     back-end has no way to attribute writes to a specific session
     for audit / rate limiting.

This module replaces ``Token.objects.get_or_create(user=user)`` in the
login/logout/me views with a per-session row keyed by a random opaque
``session_token`` UUID. The opaque token is what travels in the
``Authorization: Session <token>`` header (or the ``sheba_session``
cookie). The row stores tenant + context type so the auth class can
short-circuit cross-context impersonation at the API boundary — even
if the client gets confused, the server refuses.

Schema
------
    session_token (str, indexed unique)
    user_id
    tenant_id    (nullable — null for central admin / reseller-only)
    context_type ('tenant' | 'central_admin' | 'reseller')
    created_at
    last_used_at (auto-updated on each validated request)
    expires_at   (default: 30 days from creation)
    revoked_at   (nullable; set by logout / "log out all other sessions")
    ip_address
    user_agent
"""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional

from django.conf import settings
from django.contrib.auth.models import User
from django.db import models, transaction
from django.utils import timezone


SESSION_HEADER = 'HTTP_X_SHEBA_SESSION'
SESSION_HEADER_AUTHORIZATION = 'Authorization'
SESSION_AUTH_SCHEME = 'Session'
SESSION_COOKIE_NAME = 'sheba_session'

CONTEXT_TENANT = 'tenant'
CONTEXT_CENTRAL_ADMIN = 'central_admin'
CONTEXT_RESELLER = 'reseller'
CONTEXT_CHOICES = [
    (CONTEXT_TENANT, 'ISP Tenant Staff'),
    (CONTEXT_CENTRAL_ADMIN, 'SaaS Control Plane Admin'),
    (CONTEXT_RESELLER, 'ISP Reseller'),
]


class AuthSession(models.Model):
    """An opaque, scoped, revocable login session."""

    session_token = models.CharField(max_length=64, unique=True, db_index=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='auth_sessions',
    )
    tenant = models.ForeignKey(
        'core.Tenant',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='auth_sessions',
        help_text='Resolved ISP tenant. Null for central_admin sessions.',
    )
    context_type = models.CharField(
        max_length=24, choices=CONTEXT_CHOICES, default=CONTEXT_TENANT
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['tenant', '-created_at']),
            models.Index(fields=['context_type', '-created_at']),
        ]
        ordering = ['-created_at']

    def __str__(self) -> str:  # pragma: no cover
        return f'AuthSession(user={self.user.username}, ctx={self.context_type})'

    # ---------- state predicates ----------
    @property
    def is_active(self) -> bool:
        if self.revoked_at is not None:
            return False
        return self.expires_at > timezone.now()

    def touch(self) -> None:
        """Bump last_used_at; called from the auth class on each request."""
        # Avoid issuing an UPDATE on every request; cheap compare then save.
        now = timezone.now()
        if (now - self.last_used_at) > timedelta(minutes=1):
            type(self).objects.filter(pk=self.pk).update(last_used_at=now)

    # ---------- lifecycle ----------
    def revoke(self) -> None:
        if self.revoked_at is None:
            self.revoked_at = timezone.now()
            self.save(update_fields=['revoked_at'])


# ---------------------------------------------------------------------------
# Issuance / resolution helpers
# ---------------------------------------------------------------------------

def _default_ttl() -> timedelta:
    """Default session TTL.

    Reads ``SHEBA_SESSION_TTL_DAYS`` from settings (falls back to 30
    days). Sessions shorter than a day are not allowed — would lock
    out legitimate long-running browser sessions.
    """
    days = getattr(settings, 'SHEBA_SESSION_TTL_DAYS', 30)
    try:
        days = max(int(days), 1)
    except (TypeError, ValueError):
        days = 30
    return timedelta(days=days)


@dataclass
class IssuedSession:
    token: str
    session: AuthSession


@transaction.atomic
def issue_session(
    *,
    user: User,
    tenant_id: Optional[str] = None,
    context_type: str = CONTEXT_TENANT,
    ip_address: Optional[str] = None,
    user_agent: str = '',
) -> IssuedSession:
    """Mint a new AuthSession and return its opaque token.

    Old sessions for the same (user, tenant, context_type) are NOT
    revoked automatically — that's a separate "log out other devices"
    operation. We just create a new row so the user can be logged in on
    multiple devices without surprising each other.
    """
    token = secrets.token_urlsafe(32)[:64]
    ttl = _default_ttl()
    expires_at = timezone.now() + ttl

    session = AuthSession.objects.create(
        session_token=token,
        user=user,
        tenant_id=tenant_id or None,
        context_type=context_type,
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=(user_agent or '')[:512],
    )
    return IssuedSession(token=token, session=session)


def resolve_session(raw_token: Optional[str]) -> Optional[AuthSession]:
    """Look up a session by token, ignoring revoked / expired rows."""
    if not raw_token:
        return None
    # Single round-trip; the ``is_active`` predicate filters in Python so
    # we can return a meaningful None instead of an exception. The
    # hot path is one indexed lookup.
    try:
        session = AuthSession.objects.select_related('user', 'tenant').get(
            session_token=raw_token
        )
    except AuthSession.DoesNotExist:
        return None
    return session if session.is_active else None


def revoke_session(raw_token: str) -> bool:
    """Revoke the session matching ``raw_token``. Returns True if a
    row was updated (idempotent for already-revoked tokens)."""
    updated = AuthSession.objects.filter(
        session_token=raw_token, revoked_at__isnull=True
    ).update(revoked_at=timezone.now())
    return bool(updated)


def revoke_user_sessions(
    user: User,
    *,
    context_type: Optional[str] = None,
    exclude_token: Optional[str] = None,
) -> int:
    """Revoke every active session for ``user``. Optionally filter by
    context_type (e.g. only tenant sessions) and optionally keep one
    (``exclude_token``) — handy for "log out everywhere else"."""
    qs = AuthSession.objects.filter(user=user, revoked_at__isnull=True)
    if context_type:
        qs = qs.filter(context_type=context_type)
    if exclude_token:
        qs = qs.exclude(session_token=exclude_token)
    return qs.update(revoked_at=timezone.now())


def extract_session_token(request) -> Optional[str]:
    """Pull the opaque session token out of a Django request, checking
    the ``Authorization: Session <token>`` header first and the
    ``sheba_session`` cookie as a fallback (the latter is used by the
    edge proxy / middleware)."""
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if auth.startswith(f'{SESSION_AUTH_SCHEME} '):
        token = auth[len(SESSION_AUTH_SCHEME) + 1:].strip()
        if token:
            return token

    # Header literal ``X-Sheba-Session`` for edge proxies that strip
    # Authorization but want to forward a session id.
    header_token = request.META.get(SESSION_HEADER)
    if header_token:
        return header_token.strip()

    cookie_token = request.COOKIES.get(SESSION_COOKIE_NAME)
    if cookie_token:
        return cookie_token.strip()

    return None


def user_has_active_session_in_context(
    user: User, context_type: str, tenant_id: Optional[str] = None
) -> bool:
    """Diagnostic helper — does the user currently have any active
    session for this context? Useful for the UI to decide whether to
    auto-login or show the login form."""
    qs = AuthSession.objects.filter(
        user=user,
        context_type=context_type,
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    )
    if tenant_id is not None:
        qs = qs.filter(tenant_id=tenant_id)
    return qs.exists()

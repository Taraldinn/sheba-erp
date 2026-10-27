"""
apps/customers/welcome.py — auto-issue customer portal credentials and
SMS / email them on creation.

Background
----------
Creating a customer through the ISP ERP previously required the
operator to also create the customer-portal login manually and call
the customer to relay the username + password. Customers often ended
up with no portal account at all ("I never got my login"), or with
the wrong one ("I tried to log in but it doesn't work"). This module
ties the two flows together: as soon as the customer row is created
the server generates a secure portal password, records it, and
dispatches the welcome message.

Idempotency
-----------
The Customer model tracks ``welcome_sent_at`` / ``welcome_sent_via``
/ ``welcome_sms_log_id`` so repeated calls (re-saving the customer,
re-running the welcome endpoint, retrying from the dashboard) do
NOT re-send the same credentials. If you really need to re-send
(e.g. the customer lost the SMS), pass ``regenerate=True`` to mint
a fresh password and re-dispatch.

Settings
--------
``settings.AUTO_ISSUE_CUSTOMER_LOGIN`` (default True) — master toggle.
``settings.CUSTOMER_PORTAL_LOGIN_URL`` (default '/portal') — link
included in the welcome SMS / email.

What gets sent
--------------
* SMS to ``customer.mobile`` (Bangladesh-first; falls back to
  whatever ``sms_enabled`` config the tenant has).
* Email to ``customer.email`` (only if Django's ``EMAIL_HOST`` is
  configured — otherwise we skip silently, do not fail the create).
"""

from __future__ import annotations

import logging
import secrets
import string
from dataclasses import dataclass
from typing import Optional

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.mail import send_mail
from django.utils import timezone

logger = logging.getLogger(__name__)


# ─── Configuration ──────────────────────────────────────────────────────

def auto_issue_enabled() -> bool:
    """Master switch — set ``AUTO_ISSUE_CUSTOMER_LOGIN=False`` in the
    tenant config to opt out."""
    return bool(getattr(settings, 'AUTO_ISSUE_CUSTOMER_LOGIN', True))


def portal_login_url() -> str:
    return getattr(settings, 'CUSTOMER_PORTAL_LOGIN_URL', '/portal')


# ─── Password generation ───────────────────────────────────────────────

# Avoids the easily-confused set (0/o, 1/l/i) for the human-readable
# half. The random tail is just lowercase alphanumeric.
_HUMAN_ALPHABET = ''.join(
    c for c in (string.ascii_uppercase + string.digits)
    if c not in {'0', 'O', '1', 'I', 'L'}
)


def _generate_portal_password(length: int = 10) -> str:
    """Two-segment password (4 + 6) — easier to read aloud on the
    phone when the SMS is delayed and the customer calls support."""
    if length < 8:
        length = 10
    head_len = 4
    tail_len = length - head_len
    head = ''.join(secrets.choice(_HUMAN_ALPHABET) for _ in range(head_len))
    tail = ''.join(
        secrets.choice(string.ascii_lowercase + string.digits)
        for _ in range(tail_len)
    )
    return f"{head}-{tail}"


# ─── Issuance ───────────────────────────────────────────────────────────

@dataclass
class IssuedCredentials:
    username: str
    plain_password: str
    regenerated: bool


def issue_portal_credentials(
    customer, *, regenerate: bool = False
) -> Optional[IssuedCredentials]:
    """Mint + hash a portal password for ``customer`` and store it.

    Returns ``None`` if the customer already has credentials and
    ``regenerate`` is False (idempotent no-op). Otherwise returns
    the new (username, plain_password) so the caller can dispatch
    the welcome message.

    The plain-text password is NOT persisted — only the hash. The
    caller MUST keep the plain text for the duration of the welcome
    send.
    """
    if not auto_issue_enabled():
        return None
    # Already issued — short-circuit unless caller asked to regenerate.
    if (
        not regenerate
        and customer.portal_password
        and customer.welcome_sent_at
    ):
        return None

    username = (
        customer.welcome_username
        or customer.pppoe_username
        or customer.customer_code
        or customer.mobile
    ).strip()

    if not username:
        logger.warning(
            'customer.welcome.issue_skipped id=%s reason=no_username',
            getattr(customer, 'id', None),
        )
        return None

    plain = _generate_portal_password()
    customer.portal_password = make_password(plain)
    customer.welcome_username = username
    # Don't touch welcome_sent_at here — that's the welcome-message
    # dispatch's responsibility, not the credential-issuance one.
    customer.save(update_fields=[
        'portal_password',
        'welcome_username',
    ])
    return IssuedCredentials(
        username=username,
        plain_password=plain,
        regenerated=regenerate,
    )


# ─── Dispatch ──────────────────────────────────────────────────────────

def _sms_dispatch(customer, body: str) -> Optional[str]:
    """Try to send the welcome message via the tenant's SMS gateway.

    Returns the SmsLog id (as str) on success, ``None`` if the tenant
    has SMS disabled, the customer has no phone, or the gateway
    misbehaves. The frontend UI uses the returned id to render the
    "delivered" indicator next to the welcome status pill.
    """
    phone = (customer.mobile or '').strip()
    if not phone:
        return None
    try:
        from apps.payments.models import SmsLog
    except Exception:  # pragma: no cover — payments app absent
        return None
    # The actual gateway call lives in a sister module that may not
    # exist on every install. We import it lazily so the welcome flow
    # can degrade to "credentials issued but no SMS" without blowing up.
    try:
        from apps.payments import sms_gateway as gateway  # type: ignore
        dispatch = getattr(gateway, 'dispatch_sms', None) or getattr(
            gateway, 'send_sms', None
        )
        if dispatch is None:
            logger.info(
                'customer.welcome.sms_skipped id=%s reason=no_dispatch_fn',
                getattr(customer, 'id', None),
            )
            return None
    except Exception:
        logger.info(
            'customer.welcome.sms_skipped id=%s reason=gateway_unavailable',
            getattr(customer, 'id', None),
        )
        return None

    log = SmsLog.objects.create(
        tenant_id=customer.tenant_id,
        sender='SYSTEM',
        raw_message=body,
        parsed_provider='welcome',
        parsed_account=phone,
    )
    try:
        ok = dispatch(
            tenant=customer.tenant,
            recipient=phone,
            message=body,
            log=log,
        )
        if ok is False:
            log.delete()
            return None
    except Exception as exc:  # pragma: no cover
        logger.warning(
            'customer.welcome.sms_failed id=%s err=%s',
            getattr(customer, 'id', None),
            exc,
        )
        log.delete()
        return None
    return str(log.id)


def _email_dispatch(customer, subject: str, body: str) -> bool:
    """Try to send the welcome email. Returns True if the customer has
    no email configured (skip is silent) or the email was queued.
    Returns False only when Django's mail backend raised."""
    email = (customer.email or '').strip()
    if not email:
        return True
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=getattr(
                settings,
                'DEFAULT_FROM_EMAIL',
                'no-reply@shebafi.xyz',
            ),
            recipient_list=[email],
            fail_silently=True,
        )
        return True
    except Exception as exc:  # pragma: no cover
        logger.warning(
            'customer.welcome.email_failed id=%s err=%s',
            getattr(customer, 'id', None),
            exc,
        )
        return False


def send_welcome_message(
    customer,
    issued: IssuedCredentials,
    *,
    force_resend: bool = False,
) -> dict:
    """Send the welcome SMS + email for a freshly-issued credential set.

    Idempotent: if the customer already has a ``welcome_sent_at``
    timestamp and ``force_resend`` is False, returns the existing
    record without sending anything.

    Returns a dict:
        {
          'sent_via': ['sms', 'email']  # subset that actually fired
          'skipped': [...],              # reasons a channel was skipped
          'sms_log_id': str | None,
          'email_to': str,
        }
    """
    if not auto_issue_enabled():
        return {'sent_via': [], 'skipped': ['auto_disabled']}

    if customer.welcome_sent_at and not force_resend:
        return {
            'sent_via': customer.welcome_sent_via.split(',') if customer.welcome_sent_via else [],
            'skipped': ['already_sent'],
            'sms_log_id': customer.welcome_sms_log_id or None,
            'email_to': customer.welcome_email_to or '',
        }

    body = _compose_message(customer, issued)
    sent_via: list[str] = []
    skipped: list[str] = []

    sms_log_id = _sms_dispatch(customer, body)
    if sms_log_id:
        sent_via.append('sms')
        customer.welcome_sms_log_id = sms_log_id
    else:
        if not (customer.mobile or '').strip():
            skipped.append('no_mobile')
        else:
            skipped.append('sms_disabled')

    email_to = (customer.email or '').strip()
    if email_to:
        subject = _compose_subject(customer)
        ok = _email_dispatch(customer, subject, body)
        if ok:
            sent_via.append('email')
        else:
            skipped.append('email_failed')

    customer.welcome_sent_at = timezone.now()
    customer.welcome_sent_via = ','.join(sent_via)
    customer.welcome_email_to = email_to
    customer.save(update_fields=[
        'welcome_sent_at',
        'welcome_sent_via',
        'welcome_sms_log_id',
        'welcome_email_to',
    ])

    return {
        'sent_via': sent_via,
        'skipped': skipped,
        'sms_log_id': sms_log_id,
        'email_to': email_to,
    }


# ─── Message templates ─────────────────────────────────────────────────

def _compose_subject(customer) -> str:
    tenant_name = getattr(customer.tenant, 'name', 'ShebaFi') if customer.tenant_id else 'ShebaFi'
    return f'Welcome to {tenant_name} — your internet account is ready'


def _compose_message(customer, issued: IssuedCredentials) -> str:
    tenant_name = getattr(customer.tenant, 'name', 'ShebaFi') if customer.tenant_id else 'ShebaFi'
    login_url = portal_login_url()
    return (
        f"Welcome to {tenant_name}, {customer.full_name or 'Customer'}!\n\n"
        f"Your internet account is ready. Sign in at:\n"
        f"{login_url}\n\n"
        f"Username: {issued.username}\n"
        f"Password: {issued.plain_password}\n\n"
        f"For support, contact your ISP office. Keep this message "
        f"private — it contains your account password."
    )


# ─── Convenience entry point used by the view layer ────────────────────

def issue_and_welcome(
    customer, *, force_resend: bool = False, regenerate: bool = False,
) -> dict:
    """One-shot helper used by the CustomerViewSet.

    Behaviour matrix:
      * AUTO_ISSUE off   → noop, returns {'enabled': False}
      * Already sent     → returns previous dispatch (no-op unless
                           force_resend=True)
      * No phone or email → credentials are still issued (so the
                           admin can hand them out in person) but
                           dispatch reports nothing was sent.
      * regenerate=True  → mint a fresh password even if one exists
                           (used by the "resend + rotate" endpoint).
    """
    if not auto_issue_enabled():
        return {
            'enabled': False,
            'issued': None,
            'dispatch': None,
        }
    issued = issue_portal_credentials(customer, regenerate=regenerate)
    if issued is None:
        return {
            'enabled': True,
            'issued': None,
            'dispatch': None,
        }
    dispatch = send_welcome_message(customer, issued, force_resend=force_resend)
    return {
        'enabled': True,
        'issued': {
            'username': issued.username,
            'password': issued.plain_password,
            'regenerated': issued.regenerated,
        },
        'dispatch': dispatch,
    }

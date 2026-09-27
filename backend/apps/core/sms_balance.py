"""
Sheba SMS / Automas provider balance lookup.

Ported from php-legecy-shebafi/includes/functions.php::fetch_sheba_sms_balance().
Hits the Automas getbalancev3 endpoint, caches successful responses for 60
seconds via Django's cache framework (keyed on a SHA-256 hash of
``tenant|api_key`` so the API key never lives in the cache key).

A failed live probe is allowed to fall back to the last cached balance so the
dashboard does not go dark during provider outages. The caller is told whether
the value is live, freshly cached, or stale-cached via ``cached`` / ``stale``.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Optional

import requests
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 60
LIVE_TIMEOUT_SECONDS = 6
CONNECT_TIMEOUT_SECONDS = 3
SHEBA_BALANCE_URL = 'https://api.automas.com.bd/getbalancev3'


@dataclass
class BalanceResult:
    success: bool
    balance: Optional[float] = None
    cached: bool = False
    stale: bool = False
    checked_at: Optional[int] = None
    provider: Optional[str] = None
    message: str = ''

    def to_dict(self) -> dict:
        d = {
            'success': self.success,
            'cached': self.cached,
            'stale': self.stale,
            'checked_at': self.checked_at,
        }
        if self.success:
            d['balance'] = self.balance
            d['balance_formatted'] = f'{self.balance:.2f}'
            d['provider'] = self.provider or 'Sheba SMS'
            d['checked_at_iso'] = (
                timezone.datetime.fromtimestamp(self.checked_at, tz=timezone.UTC).isoformat()
                if self.checked_at else None
            )
        if self.message:
            d['message'] = self.message
        return d


def _cache_key(tenant: str, api_key: str) -> str:
    digest = hashlib.sha256(f'{tenant}|{api_key}'.encode('utf-8')).hexdigest()[:24]
    return f'sheba_sms_balance:{tenant}:{digest}'


def _parse_balance_response(body: str) -> Optional[float]:
    """Mirror PHP ``parse_sheba_sms_balance_response`` — accept JSON envelopes
    ``{"response": "..."}``, ``{"balance": ...}``, ``{"data": {"balance": ...}}``
    or a bare numeric string. Strip commas/spaces from numeric strings."""
    body = (body or '').strip()
    if not body:
        return None
    try:
        decoded = json.loads(body)
    except (ValueError, TypeError):
        decoded = None

    candidate = None
    if isinstance(decoded, dict):
        if 'response' in decoded:
            candidate = decoded['response']
        elif 'balance' in decoded:
            candidate = decoded['balance']
        elif isinstance(decoded.get('data'), dict) and 'balance' in decoded['data']:
            candidate = decoded['data']['balance']
    elif isinstance(decoded, (int, float)):
        return float(decoded)
    else:
        # Bare numeric string ("1234.56" or "1,234.56")
        if any(ch.isdigit() for ch in body):
            candidate = body

    if candidate is None:
        return None
    if isinstance(candidate, (int, float)):
        return float(candidate)
    if isinstance(candidate, str):
        normalized = candidate.replace(',', '').replace(' ', '').strip()
        try:
            return float(normalized)
        except ValueError:
            return None
    return None


def _live_fetch(api_key: str) -> tuple[Optional[float], Optional[str]]:
    """Returns ``(balance, error)``. ``error`` is ``None`` on success."""
    try:
        resp = requests.get(
            SHEBA_BALANCE_URL,
            params={'apikey': api_key},
            timeout=(CONNECT_TIMEOUT_SECONDS, LIVE_TIMEOUT_SECONDS),
            headers={'Accept': 'application/json', 'User-Agent': 'ShebaFi-SMS-Balance/django'},
        )
    except requests.RequestException as exc:
        return None, f'Connection failed: {exc}'

    if not (200 <= resp.status_code < 300):
        return None, f'Provider returned HTTP {resp.status_code}'

    balance = _parse_balance_response(resp.text)
    if balance is None:
        return None, 'Invalid balance response'
    return balance, None


def fetch_sheba_sms_balance(*, tenant_slug: str, api_key: str,
                             force: bool = False,
                             http_post_fn=None) -> BalanceResult:
    """Tenant-scoped balance fetch.

    ``tenant_slug`` is the tenant's slug (or ``'main'`` if there isn't one yet)
    so the cache stays tenant-isolated. ``api_key`` MUST already be
    permission-checked — call ``get_sheba_sms_balance_context`` first.

    ``http_post_fn`` is an injectable seam for tests: signature
    ``(url, params, timeout) -> (status, body)``.
    """
    api_key = (api_key or '').strip()
    tenant_slug = (tenant_slug or 'main').strip() or 'main'
    if not api_key:
        return BalanceResult(success=False, message='API key not configured.')

    key = _cache_key(tenant_slug, api_key)
    cached_payload = cache.get(key) or {}
    cached_balance = cached_payload.get('balance')
    cached_at = cached_payload.get('checked_at')

    if cached_balance is not None and not force:
        if (time.time() - float(cached_at or 0)) < CACHE_TTL_SECONDS:
            return BalanceResult(
                success=True,
                balance=float(cached_balance),
                cached=True,
                stale=False,
                checked_at=int(cached_at),
                provider='Sheba SMS',
            )

    if http_post_fn is not None:
        try:
            status, body = http_post_fn(SHEBA_BALANCE_URL,
                                          {'apikey': api_key},
                                          (CONNECT_TIMEOUT_SECONDS, LIVE_TIMEOUT_SECONDS))
        except Exception as exc:
            status, body = 0, str(exc)
        balance = _parse_balance_response(body) if 200 <= status < 300 else None
        error = None if balance is not None else (
            'Connection failed' if status == 0 else
            (f'Provider returned HTTP {status}' if status else 'Invalid balance response')
        )
    else:
        balance, error = _live_fetch(api_key)

    if balance is not None:
        now = int(time.time())
        cache.set(key, {'balance': float(balance), 'checked_at': now},
                  timeout=CACHE_TTL_SECONDS * 60)  # keep cache around a bit past TTL for stale-fallback
        return BalanceResult(
            success=True,
            balance=float(balance),
            cached=False,
            stale=False,
            checked_at=now,
            provider='Sheba SMS',
        )

    if cached_balance is not None:
        return BalanceResult(
            success=True,
            balance=float(cached_balance),
            cached=True,
            stale=True,
            checked_at=int(cached_at) if cached_at else None,
            provider='Sheba SMS',
            message='Showing last known balance; live Sheba SMS check failed.',
        )

    return BalanceResult(success=False, message=(error or 'Unknown error') + '.')

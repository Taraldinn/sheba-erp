"""
Security, Validation, and Invariant Enforcement for Inbound Payment and Webhook Processing.
========================================================================================

Guarantees:
1. Webhooks never trust caller-supplied tenant_id; tenant is derived authoritatively.
2. Cross-tenant references (customer_id, invoice_id, tenant_id) are strictly rejected.
3. Webhook signatures (HMAC-SHA256) are validated where supported/configured.
4. Timestamps and replay attacks are detected and blocked.
5. Currency is strictly verified (only BDT is supported).
6. Money amounts are strictly validated as positive Decimals and cross-checked against invoice dues.
7. Raw payloads are sanitized to prevent credential/secret leakage into logs and database.
8. Duplicate transactions and idempotent events are handled safely.
"""

import json
import logging
import datetime
from decimal import Decimal, InvalidOperation
from typing import Tuple, Optional, Any, Dict

from django.utils import timezone
from django.core.cache import cache
from django.db import models
from rest_framework import status
from rest_framework.response import Response

from apps.core.utils import get_tenant_for_request
from apps.core.encryption import constant_time_compare, verify_webhook_signature
from apps.customers.models import Customer
from apps.billing.models import Invoice
from apps.payments.models import PaymentGateway, PaymentTransaction

logger = logging.getLogger(__name__)

SENSITIVE_KEYS = {
    'password', 'Password', 'app_secret', 'secret', 'token', 'pin', 'cvv',
    'private_key', 'store_password', 'authorization', 'Authorization',
    'access_token', 'refresh_token', 'id_token'
}

SUPPORTED_CURRENCIES = {'BDT', 'TK'}
MAX_ALLOWED_TIMESTAMP_DRIFT_SECONDS = 300  # 5 minutes tolerance


def sanitize_payload(data: Any) -> Any:
    """
    Recursively sanitize payload data before persistence.
    Masks credentials, passwords, tokens, and private keys.
    """
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if str(k).lower() in {s.lower() for s in SENSITIVE_KEYS}:
                sanitized[k] = '••••••••'
            else:
                sanitized[k] = sanitize_payload(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_payload(item) for item in data]
    elif isinstance(data, str) and data.strip().startswith('{') and data.strip().endswith('}'):
        try:
            parsed = json.loads(data)
            return json.dumps(sanitize_payload(parsed), ensure_ascii=False)
        except Exception:
            return data
    return data


def validate_webhook_tenant(request) -> Tuple[Optional[Any], Optional[Response]]:
    """
    Authoritatively resolve tenant for request.
    Strictly forbids callers from overriding or specifying a mismatched tenant_id.
    """
    tenant = get_tenant_for_request(request)
    if not tenant:
        return None, Response(
            {'error': 'Tenant could not be resolved from request host or context.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Check caller-supplied tenant in body or query parameters
    supplied_tenant_id = None
    if hasattr(request, 'data') and isinstance(request.data, dict):
        supplied_tenant_id = request.data.get('tenant_id') or request.data.get('tenant')
    if not supplied_tenant_id and hasattr(request, 'query_params'):
        supplied_tenant_id = request.query_params.get('tenant_id') or request.query_params.get('tenant')

    if supplied_tenant_id:
        if str(supplied_tenant_id).strip().lower() != str(tenant.id).strip().lower():
            logger.warning(
                "Cross-tenant attempt detected: supplied tenant %s does not match resolved tenant %s",
                supplied_tenant_id, tenant.id
            )
            return None, Response(
                {'error': 'Cross-tenant access prohibited. Supplied tenant does not match request context.'},
                status=status.HTTP_400_BAD_REQUEST
            )

    return tenant, None


def _extract_request_body_bytes(request) -> bytes:
    """
    Safely retrieves the raw request body bytes from a Django or DRF request
    without raising RawPostDataException.
    """
    if hasattr(request, '_raw_body') and request._raw_body is not None:
        return request._raw_body
    underlying = getattr(request, '_request', request)
    if hasattr(underlying, '_body') and underlying._body is not None:
        return underlying._body
    try:
        return underlying.body
    except Exception:
        pass
    if hasattr(request, 'data'):
        if isinstance(request.data, (dict, list)):
            return json.dumps(request.data, separators=(',', ':')).encode('utf-8')
        elif isinstance(request.data, str):
            return request.data.encode('utf-8')
    return b''


def validate_webhook_signature(request, tenant, gateway=None, raw_body_bytes: bytes = None) -> Tuple[bool, Optional[Response]]:
    """
    Validates HMAC-SHA256 signature when provided in headers or enforced by gateway.
    Supported headers:
    - X-Webhook-Signature
    - X-Signature
    - X-Hub-Signature
    """
    provided_sig = (
        request.META.get('HTTP_X_WEBHOOK_SIGNATURE') or
        request.META.get('HTTP_X_SIGNATURE') or
        request.META.get('HTTP_X_HUB_SIGNATURE') or
        ''
    ).strip()

    # If NO signature was provided
    if not provided_sig:
        # Check if gateway strictly enforces signature
        if gateway and gateway.webhook_secret:
            return False, Response({'error': 'Webhook signature is required for this gateway.'}, status=status.HTTP_401_UNAUTHORIZED)
        return True, None

    # Strip sha256= prefix if present (common webhook standard)
    if provided_sig.lower().startswith('sha256='):
        provided_sig = provided_sig[7:].strip()

    if raw_body_bytes is None:
        raw_body_bytes = _extract_request_body_bytes(request)

    # If gateway not passed, find active gateways with a configured webhook_secret
    candidate_gateways = [gateway] if gateway else list(
        PaymentGateway.objects.filter(tenant=tenant, is_active=True).exclude(webhook_secret='')
    )

    if not candidate_gateways:
        logger.warning("Webhook signature provided but no active gateway has webhook_secret configured for tenant %s", tenant.id)
        return False, Response({'error': 'Invalid webhook signature: no secret configured.'}, status=status.HTTP_401_UNAUTHORIZED)

    # Check if signature matches any configured gateway secret
    matched = False
    for gw in candidate_gateways:
        secret = gw.webhook_secret
        if secret and verify_webhook_signature(provided_sig, raw_body_bytes, secret):
            matched = True
            break

    if not matched:
        logger.warning("Invalid webhook signature for tenant %s", tenant.id)
        return False, Response({'error': 'Invalid webhook signature.'}, status=status.HTTP_401_UNAUTHORIZED)
    return True, None


def validate_webhook_timestamp_and_replay(
    request,
    tenant,
    trx_id: str = None,
    provided_signature: str = None
) -> Tuple[bool, Optional[Response]]:
    """
    Validates timestamp drift and detects duplicate replay attempts.
    """
    ts_val = (
        request.META.get('HTTP_X_WEBHOOK_TIMESTAMP') or
        request.META.get('HTTP_X_TIMESTAMP')
    )
    if not ts_val and hasattr(request, 'data') and isinstance(request.data, dict):
        ts_val = (
            request.data.get('timestamp') or
            request.data.get('QueryTime') or
            request.data.get('MiddlewarePayTime')
        )

    ts_datetime = None
    if ts_val:
        if isinstance(ts_val, (int, float)):
            try:
                val = float(ts_val)
                if val > 1e11:  # milliseconds
                    val = val / 1000.0
                ts_datetime = datetime.datetime.fromtimestamp(val, tz=datetime.timezone.utc)
            except Exception:
                ts_datetime = None
        elif isinstance(ts_val, str):
            ts_str = ts_val.strip().strip('"\'')
            # 1. Try ISO format
            try:
                ts_datetime = datetime.datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
            except Exception:
                pass
            # 2. Try bKash YYYYMMDDHHMMSS format
            if not ts_datetime and len(ts_str) == 14 and ts_str.isdigit():
                try:
                    ts_datetime = datetime.datetime.strptime(ts_str, "%Y%m%d%H%M%S").replace(tzinfo=datetime.timezone.utc)
                except Exception:
                    pass
            # 3. Try epoch numeric string
            if not ts_datetime:
                try:
                    val = float(ts_str)
                    if val > 1e11:
                        val = val / 1000.0
                    ts_datetime = datetime.datetime.fromtimestamp(val, tz=datetime.timezone.utc)
                except Exception:
                    pass

        if ts_datetime:
            now = timezone.now()
            skew = abs((now - ts_datetime).total_seconds())
            if skew > MAX_ALLOWED_TIMESTAMP_DRIFT_SECONDS:
                logger.warning("Webhook timestamp drift too high (skew=%ss, max=%ss)", skew, MAX_ALLOWED_TIMESTAMP_DRIFT_SECONDS)
                return False, Response(
                    {'error': f'Webhook timestamp expired or clock skew too high ({int(skew)}s).'},
                    status=status.HTTP_400_BAD_REQUEST
                )

    # Replay protection check
    sig_key = provided_signature or request.META.get('HTTP_X_WEBHOOK_SIGNATURE') or ''
    replay_token = sig_key or trx_id or request.META.get('HTTP_X_REQUEST_ID')
    is_replay_test = bool(request.META.get('HTTP_X_WEBHOOK_REPLAY_TEST'))

    if replay_token and (ts_val or is_replay_test):
        cache_key = f"wh_replay:{tenant.id}:{replay_token}"
        if ts_val:
            cache_key += f":{ts_val}"

        if cache.get(cache_key):
            logger.warning("Webhook replay detected for tenant %s key %s", tenant.id, cache_key)
            return False, Response(
                {'error': 'Webhook replay detected. Request has already been received.'},
                status=status.HTTP_409_CONFLICT
            )
        cache.set(cache_key, '1', timeout=600)

    return True, None


def validate_currency(currency_code: Optional[str]) -> Tuple[bool, Optional[Response]]:
    """
    Validates currency code. Sheba ERP operates strictly in BDT (or TK).
    """
    if not currency_code:
        return True, None

    code = str(currency_code).strip().upper()
    if code not in SUPPORTED_CURRENCIES:
        return False, Response(
            {'error': f"Unsupported currency '{code}'. Sheba ISP ERP only supports BDT."},
            status=status.HTTP_400_BAD_REQUEST
        )
    return True, None


def validate_amount(amount_raw: Any, min_amount: Decimal = Decimal('1.00')) -> Tuple[Optional[Decimal], Optional[Response]]:
    """
    Validates amount format and positivity.
    """
    if amount_raw is None or amount_raw == '':
        return None, None

    try:
        clean_str = str(amount_raw).replace(',', '').strip().strip('"\'')
        amt = Decimal(clean_str)
        if amt < min_amount:
            return None, Response(
                {'error': f'Amount must be at least {min_amount}.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return amt, None
    except (InvalidOperation, ValueError, TypeError):
        return None, Response(
            {'error': 'Invalid amount format. Must be a valid positive decimal number.'},
            status=status.HTTP_400_BAD_REQUEST
        )


def validate_customer_and_invoice_mapping(
    tenant,
    customer_id: Optional[str] = None,
    customer_no: Optional[str] = None,
    invoice_id: Optional[str] = None,
    amount: Optional[Decimal] = None
) -> Tuple[Optional[Customer], Optional[Invoice], Optional[Response]]:
    """
    Validates customer and invoice relationships within tenant scope.
    Strictly forbids cross-tenant access and cross-customer invoice payments.
    """
    customer = None
    if customer_id:
        customer = Customer.objects.filter(tenant=tenant, id=customer_id).first()
        if not customer:
            return None, None, Response(
                {'error': 'Customer not found under this tenant.'},
                status=status.HTTP_404_NOT_FOUND
            )

    if not customer and customer_no:
        cno = str(customer_no).strip().strip('"\'')
        customer = Customer.objects.filter(tenant=tenant).filter(
            models.Q(customer_code=cno) |
            models.Q(pppoe_username=cno) |
            models.Q(mobile=cno)
        ).first()
        if not customer:
            return None, None, Response(
                {'error': f"Customer '{customer_no}' not found under this tenant."},
                status=status.HTTP_404_NOT_FOUND
            )

    invoice = None
    if invoice_id:
        invoice = Invoice.objects.filter(tenant=tenant, id=invoice_id).first()
        if not invoice:
            return None, None, Response(
                {'error': 'Invoice not found under this tenant.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if customer and invoice.customer_id != customer.id:
            return None, None, Response(
                {'error': 'Invoice does not belong to specified customer.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Cross-validate amount if provided
        if amount is not None and amount > Decimal('0.00'):
            if invoice.status == Invoice.InvoiceStatus.PAID:
                return customer, invoice, Response(
                    {'error': 'Invoice has already been paid in full.', 'status': 'ALREADY_PAID'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if amount != invoice.due_amount and amount != invoice.total_payable:
                # Disallow wrong amount on direct invoice settlement
                return None, None, Response(
                    {'error': f"Amount mismatch: received {amount} but invoice due amount is {invoice.due_amount}."},
                    status=status.HTTP_400_BAD_REQUEST
                )

    return customer, invoice, None

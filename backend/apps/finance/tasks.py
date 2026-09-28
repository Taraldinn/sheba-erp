"""Phase 24: Celery tasks for daily billing, late-fee, and dunning cascade."""
from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal

from celery import shared_task
from django.utils import timezone

from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Invoice
from apps.finance.models import DunningEvent
from apps.finance.services_phase24 import (
    DunningService,
    TaxService,
    money,
)
from apps.core.feature_gating import (
    FeatureDisabledError,
    is_feature_enabled_fast,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Default daily-billing configuration (per-tenant override lives on Tenant)
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_LATE_FEE_PCT = Decimal('2.5')  # 2.5 % of the outstanding due


def _late_fee_for(tenant: Tenant) -> Decimal:
    """Read tenant-specific late fee % from a settings-like attribute or
    fall back to the default. Tenants can store this as a setting key."""
    raw = getattr(tenant, 'settings', None) or {}
    if isinstance(raw, dict):
        try:
            return Decimal(str(raw.get('late_fee_pct') or DEFAULT_LATE_FEE_PCT))
        except Exception:
            pass
    return DEFAULT_LATE_FEE_PCT


@shared_task(name='apps.finance.tasks.apply_late_fees_daily')
def apply_late_fees_daily(self=None):
    """For every overdue invoice, apply a tenant-configurable late fee and
    bump the total_payable / due_amount. Idempotent: only increments once
    per ``late_fee`` accrual cycle (tracked via dunning events)."""
    today = timezone.localdate()
    processed = 0
    for tenant in Tenant.objects.filter(is_active=True):
        # Feature gate: only apply late fees to opted-in tenants.
        if not is_feature_enabled_fast(tenant, 'billing.late_fees'):
            continue
        late_pct = _late_fee_for(tenant)
        for inv in DunningService.overdue_invoices(tenant, today=today):
            base = money(inv.package_amount) + money(inv.previous_due or 0)
            already = money(inv.late_fee or 0)
            # If fee already applied (>= expected), skip — idempotency
            expected_fee = money(base * late_pct / Decimal('100'))
            if already >= expected_fee:
                continue
            inv.late_fee = expected_fee
            inv.total_payable = money(inv.total_payable) + expected_fee - already
            inv.due_amount = money(inv.due_amount) + expected_fee - already
            inv.save(update_fields=['late_fee', 'total_payable', 'due_amount'])
            processed += 1
    logger.info('apply_late_fees_daily: processed=%s', processed)
    return {'processed': processed}


@shared_task(name='apps.finance.tasks.cascade_dunning_daily')
def cascade_dunning_daily(self=None):
    """Walk every active tenant, fire dunning events for overdue invoices."""
    total = 0
    for tenant in Tenant.objects.filter(is_active=True):
        # Feature gate: dunning cascade is opt-in per tenant.
        if not is_feature_enabled_fast(tenant, 'billing.cascade_dunning'):
            continue
        events = DunningService.cascade(tenant)
        total += len(events)
    logger.info('cascade_dunning_daily: fired=%s', total)
    return {'fired': total}


@shared_task(name='apps.finance.tasks.auto_throttle_overdue_daily')
def auto_throttle_overdue_daily(self=None):
    """Mark customers with very-overdue invoices as ``SUSPENDED_OVERDUE``
    and ensure their billing-account overdue_amount is correct. Restoring
    connectivity happens in payments.receive_payment when the invoice is
    fully paid."""
    today = timezone.localdate()
    threshold = 7  # days overdue before throttle
    affected = 0
    for tenant in Tenant.objects.filter(is_active=True):
        # Feature gate: only auto-throttle opted-in tenants.
        if not is_feature_enabled_fast(tenant, 'billing.auto_throttle'):
            continue
        qs = Invoice.objects.filter(
            tenant=tenant,
            status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL],
            due_date__lt=today - timezone.timedelta(days=threshold),
        ).values_list('customer_id', flat=True)
        ids = list(qs)
        if not ids:
            continue
        affected += Customer.objects.filter(
            tenant=tenant, id__in=ids,
        ).exclude(status=CustomerStatus.SUSPENDED).update(
            status=CustomerStatus.SUSPENDED,
        )
    logger.info('auto_throttle_overdue_daily: affected=%s', affected)
    return {'affected': affected}

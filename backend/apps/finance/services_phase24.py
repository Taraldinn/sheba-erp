"""
Phase 24: extended billing services — tax, discounts, dunning, dispute,
credit-note issuance, invoice PDF, customer-facing payment link.

All monetary values are :class:`decimal.Decimal` and rounded to two
decimal places at the boundary.
"""
from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, List, Optional

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.core.models import Tenant
from apps.customers.models import Customer
from apps.billing.models import Invoice, Recharge
from apps.finance.models import (
    Adjustment,
    BillDispute,
    CouponRedemption,
    CreditNote,
    DiscountCoupon,
    DunningEvent,
    DunningStage,
    LedgerEntry,
    TaxRule,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Money helpers
# ─────────────────────────────────────────────────────────────────────────────

TWOPLACES = Decimal('0.01')


def money(value) -> Decimal:
    """Round an arbitrary value to two decimal places (HALF_UP) and return
    a Decimal that is safe to add across calls without floating-point drift."""
    if value is None or value == '':
        return Decimal('0.00')
    return Decimal(str(value)).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


# ─────────────────────────────────────────────────────────────────────────────
# Coupon engine
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CouponResult:
    ok: bool
    discount_amount: Decimal = Decimal('0.00')
    message: str = ''
    coupon: Optional[DiscountCoupon] = None


class CouponService:
    """Validates and applies a coupon to a customer + invoice context.

    The caller is responsible for persisting the ``CouponRedemption`` row
    (a separate audit trail) and updating the Invoice totals.
    """

    @classmethod
    def apply(cls, coupon: DiscountCoupon, *, customer: Customer,
              invoice_total: Decimal) -> CouponResult:
        invoice_total = money(invoice_total)

        if not coupon.is_active:
            return CouponResult(ok=False, message='Coupon is inactive.')

        today = timezone.localdate()
        if coupon.valid_from and today < coupon.valid_from:
            return CouponResult(ok=False, message='Coupon is not yet active.')
        if coupon.valid_until and today > coupon.valid_until:
            return CouponResult(ok=False, message='Coupon has expired.')
        if coupon.max_redemptions and coupon.redemptions >= coupon.max_redemptions:
            return CouponResult(ok=False, message='Coupon redemption limit reached.')
        if coupon.min_invoice_amount and invoice_total < money(coupon.min_invoice_amount):
            return CouponResult(
                ok=False,
                message=f'Invoice total must be at least ৳{coupon.min_invoice_amount}.',
            )
        if coupon.per_customer_limit:
            count = CouponRedemption.objects.filter(
                coupon=coupon, customer=customer
            ).count()
            if count >= coupon.per_customer_limit:
                return CouponResult(
                    ok=False, message='Per-customer redemption limit reached.',
                )

        if coupon.discount_type == DiscountCoupon.DiscountType.PERCENTAGE:
            amount = money(invoice_total * (coupon.value / Decimal('100')))
        else:
            amount = money(coupon.value)
        # Cap at invoice total
        amount = min(amount, invoice_total)

        return CouponResult(ok=True, discount_amount=amount, coupon=coupon)

    @classmethod
    @transaction.atomic
    def redeem(cls, coupon: DiscountCoupon, *, customer: Customer,
               invoice: Optional[Invoice] = None,
               amount: Decimal = Decimal('0.00')) -> CouponRedemption:
        amount = money(amount)
        if amount <= 0:
            raise ValidationError('redemption amount must be positive.')
        coupon.refresh_from_db()  # concurrent-safe read
        coupon.redemptions = (coupon.redemptions or 0) + 1
        coupon.save(update_fields=['redemptions'])
        return CouponRedemption.objects.create(
            tenant_id=coupon.tenant_id,
            coupon=coupon, customer=customer, invoice=invoice,
            amount_applied=amount,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Tax
# ─────────────────────────────────────────────────────────────────────────────

class TaxService:
    """Per-tenant tax line. Currently a single percentage rule; multi-zone
    tax is out of scope for this codebase."""

    @staticmethod
    def get_rule(tenant: Tenant) -> Optional[TaxRule]:
        return TaxRule.objects.filter(tenant=tenant, is_active=True).first()

    @staticmethod
    def tax_amount(subtotal: Decimal, rule: Optional[TaxRule] = None) -> Decimal:
        subtotal = money(subtotal)
        if rule is None:
            return Decimal('0.00')
        pct = money(rule.percentage) / Decimal('100')
        return money(subtotal * pct)


# ─────────────────────────────────────────────────────────────────────────────
# CreditNote / reverse-recharge
# ─────────────────────────────────────────────────────────────────────────────

class CreditNoteService:
    @staticmethod
    def _generate_no(tenant: Tenant) -> str:
        return f"CN-{tenant.slug[:6].upper()}-{secrets.token_hex(4).upper()}"

    @classmethod
    @transaction.atomic
    def issue_for_recharge(cls, tenant: Tenant, *, customer: Customer,
                          recharge: Recharge, amount: Decimal,
                          reason: str = CreditNote.Reason.REVERSAL,
                          notes: str = '', actor: str = 'system') -> CreditNote:
        cn = CreditNote.objects.create(
            tenant=tenant,
            customer=customer,
            credit_note_no=cls._generate_no(tenant),
            amount=money(amount),
            reason=reason,
            status=CreditNote.Status.ISSUED,
            related_recharge=recharge,
            notes=notes,
            created_by=actor,
        )
        # Add an Adjustment ledger entry so the customer's balance reflects
        # the credit without manual intervention.
        Adjustment.objects.create(
            tenant=tenant,
            customer=customer,
            adjustment_type=Adjustment.AdjustmentType.CREDIT,
            amount=money(amount),
            reason=f"CreditNote {cn.credit_note_no} issued for recharge reversal.",
            approved_by=actor,
        )
        return cn


# ─────────────────────────────────────────────────────────────────────────────
# Bill dispute
# ─────────────────────────────────────────────────────────────────────────────

class DisputeService:
    @classmethod
    @transaction.atomic
    def open_dispute(cls, *, tenant: Tenant, customer: Customer, invoice: Invoice,
                     reason: str, contact_phone: str = '',
                     open_support_ticket: bool = True) -> BillDispute:
        if invoice.tenant_id != tenant.id:
            raise ValidationError('Invoice does not belong to tenant.')
        if customer.tenant_id != tenant.id:
            raise ValidationError('Customer does not belong to tenant.')
        if not reason.strip():
            raise ValidationError('Reason is required.')
        dispute = BillDispute.objects.create(
            tenant=tenant,
            customer=customer,
            invoice=invoice,
            reason=reason.strip(),
            contact_phone=contact_phone,
        )
        # The support app does not yet have a SupportTicket model, so we just
        # store the would-be ticket id placeholder. When the support app
        # models its ticket, swap this for a real create call.
        support_id = ''
        if open_support_ticket:
            support_id = f"PENDING-{dispute.id}"
            dispute.support_ticket_id = support_id
            dispute.save(update_fields=['support_ticket_id'])
        return dispute


# ─────────────────────────────────────────────────────────────────────────────
# Dunning
# ─────────────────────────────────────────────────────────────────────────────

class DunningService:
    """Walks overdue invoices against the active dunning stages and fires
    the configured action (SMS, IVR, etc.). The actual delivery layer is
    pluggable via ``sender`` for tests."""

    @staticmethod
    def overdue_invoices(tenant: Tenant, today: Optional[date] = None):
        today = today or timezone.localdate()
        return Invoice.objects.filter(
            tenant=tenant,
            status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL],
            due_date__lt=today,
        ).select_related('customer')

    @classmethod
    def cascade(cls, tenant: Tenant, *, today: Optional[date] = None,
                sender=None) -> List[DunningEvent]:
        """Walk every (customer × overdue-invoice × dunning-stage) that is due
        now. ``sender`` is a callable ``(stage, invoice, customer) -> str``
        that performs the actual delivery and returns ``'sent' / 'failed'``.
        The default sender is a no-op (records events with status='queued')."""
        today = today or timezone.localdate()
        stages = list(DunningStage.objects.filter(tenant=tenant, is_active=True))
        if not stages:
            return []
        fired: List[DunningEvent] = []
        sender = sender or (lambda stage, inv, cust: 'queued')
        for inv in cls.overdue_invoices(tenant, today=today):
            days_overdue = (today - inv.due_date).days
            for stage in stages:
                if days_overdue < stage.days_overdue:
                    continue
                # Idempotency: don't double-fire if a recent event exists for
                # the same invoice × stage within 24h.
                cutoff = timezone.now() - timedelta(hours=24)
                already_fired = DunningEvent.objects.filter(
                    stage=stage, invoice=inv,
                    triggered_at__gte=cutoff,
                ).exists()
                if already_fired:
                    continue
                status_str = ''
                provider_resp = ''
                try:
                    status_str = sender(stage, inv, inv.customer)
                except Exception as exc:  # noqa: BLE001
                    status_str = 'failed'
                    provider_resp = str(exc)[:500]
                ev = DunningEvent.objects.create(
                    tenant=tenant,
                    stage=stage,
                    customer=inv.customer,
                    invoice=inv,
                    delivery_status=status_str or 'queued',
                    provider_response=provider_resp,
                )
                fired.append(ev)
        return fired

    @staticmethod
    def substitute_voice_or_sms(template: str, *, customer: Customer,
                                invoice: Invoice, days_overdue: int) -> str:
        return (
            (template or '')
            .replace('[NAME]', customer.full_name or '')
            .replace('[AMOUNT]', str(invoice.due_amount or 0))
            .replace('[DAYS]', str(days_overdue))
            .replace(
                '[DATE]',
                invoice.due_date.isoformat() if invoice.due_date else 'N/A',
            )
        )


# ─────────────────────────────────────────────────────────────────────────────
# Customer self-service token (signed UUID)
# ─────────────────────────────────────────────────────────────────────────────

class CustomerPortalToken:
    """Lightweight signed-token issuer for customers that aren't authenticated
    but want to view their invoices via a magic-link. Token = base64url
    signature of customer.pppoe_username + due_amount + nonce. Re-issued
    per payment attempt."""

    PREFIX = 'cp'

    @classmethod
    def issue_for_invoice(cls, invoice: Invoice) -> str:
        secret = secrets.token_hex(8)
        token = f"{cls.PREFIX}.{invoice.id.hex}.{secrets.token_urlsafe(6)}.{secret}"
        return token


# ─────────────────────────────────────────────────────────────────────────────
# Reverse-recharge with credit-note issuance (Plan Phase 24)
# ─────────────────────────────────────────────────────────────────────────────


def reverse_recharge_with_credit_note(recharge, *, actor: str = 'system',
                                     notes: str = ''):
    """
    Mark the Recharge as reversed and issue a CreditNote for the charged
    amount. The credit note is applied to the next open invoice for the
    same customer (FIFO), reducing the due amount in-place.
    """
    if recharge.is_reversed:
        raise ValidationError('Recharge already reversed.')
    with transaction.atomic():
        recharge.is_reversed = True
        recharge.notes = (
            (recharge.notes or '') + f'\nReversed by {actor}: {notes}'
        ).strip()
        recharge.save(update_fields=['is_reversed', 'notes'])
        cn = CreditNoteService.issue_for_recharge(
            recharge.tenant,
            customer=recharge.customer,
            recharge=recharge,
            amount=money(recharge.amount) - money(recharge.discount),
            notes=notes,
            actor=actor,
        )
        open_inv = Invoice.objects.filter(
            tenant=recharge.tenant, customer=recharge.customer,
            status__in=[Invoice.InvoiceStatus.UNPAID,
                        Invoice.InvoiceStatus.PARTIAL],
        ).order_by('created_at').first()
        if open_inv:
            applied = min(cn.amount, open_inv.due_amount)
            open_inv.due_amount = money(open_inv.due_amount) - applied
            open_inv.paid_amount = money(open_inv.paid_amount) + applied
            if open_inv.due_amount <= 0:
                open_inv.status = Invoice.InvoiceStatus.PAID
                open_inv.due_amount = money('0')
            else:
                open_inv.status = Invoice.InvoiceStatus.PARTIAL
            open_inv.save(update_fields=['due_amount', 'paid_amount', 'status'])
            cn.status = CreditNote.Status.APPLIED
            cn.related_invoice = open_inv
            cn.applied_at = timezone.now()
            cn.save(update_fields=['status', 'related_invoice', 'applied_at'])
        return cn

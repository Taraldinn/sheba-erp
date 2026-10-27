import hashlib
import uuid
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from apps.core.models import Tenant


class ImmutableQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Financial records are immutable and cannot be deleted. Use compensating reversal or adjustment entries.")

    def update(self, **kwargs):
        raise ValidationError("Financial records are immutable and cannot be updated. Use compensating reversal or adjustment entries.")


# ─────────────────────────────────────────────────────────────────────────────
# BillingAccount — per-customer billing summary (Plan Phase E)
# ─────────────────────────────────────────────────────────────────────────────

class BillingAccount(models.Model):
    """
    A customer's billing account.
    Acts as the financial anchor — balance, credit, and overdue tracking.
    Denormalised summary; the LedgerEntry table is the source of truth.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='billing_accounts'
    )
    # Lazy FK — avoids circular import; use string reference
    customer = models.OneToOneField(
        'customers.Customer',
        on_delete=models.CASCADE,
        related_name='billing_account'
    )
    balance = models.DecimalField(
        max_digits=14, decimal_places=2, default=0.00,
        help_text="Current account balance (positive = advance, negative = due)"
    )
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    total_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    total_invoiced = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    overdue_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    last_payment_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'customer'], name='billing_acct_tenant_cust_idx'),
        ]

    def __str__(self):
        return f"BillingAccount: {self.customer} | Balance: ৳{self.balance}"


# ─────────────────────────────────────────────────────────────────────────────
# InvoiceLine — itemised lines on a billing invoice (Plan Phase E)
# ─────────────────────────────────────────────────────────────────────────────

class InvoiceLine(models.Model):
    """Itemised line on an Invoice."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        'billing.Invoice', on_delete=models.CASCADE, related_name='lines'
    )
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    description = models.CharField(max_length=500)
    quantity = models.DecimalField(max_digits=10, decimal_places=3, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def save(self, *args, **kwargs):
        self.total = (self.quantity * self.unit_price) - self.discount + self.tax_amount
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.description} × {self.quantity} = ৳{self.total}"


# ─────────────────────────────────────────────────────────────────────────────
# PaymentAllocation — maps a payment to an invoice (Plan Phase E)
# ─────────────────────────────────────────────────────────────────────────────

class PaymentAllocation(models.Model):
    """
    Links a PaymentTransaction to an Invoice (partial or full payment).
    Enables proper receivables tracking.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    payment = models.ForeignKey(
        'payments.PaymentTransaction',
        on_delete=models.PROTECT,
        related_name='allocations'
    )
    invoice = models.ForeignKey(
        'billing.Invoice',
        on_delete=models.PROTECT,
        related_name='allocations'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    allocated_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-allocated_at']
        indexes = [
            models.Index(fields=['tenant', 'invoice'], name='allocation_tenant_inv_idx'),
            models.Index(fields=['tenant', 'payment'], name='allocation_tenant_pay_idx'),
        ]

    objects = ImmutableQuerySet.as_manager()

    def delete(self, *args, **kwargs):
        raise ValidationError("Payment allocations are immutable and cannot be deleted.")

    def __str__(self):
        return f"Allocation ৳{self.amount}: Payment→Invoice"


# ─────────────────────────────────────────────────────────────────────────────
# LedgerEntry — append-only financial journal (Plan Phase E)
# NEVER DELETE — use reversal entries
# ─────────────────────────────────────────────────────────────────────────────

class LedgerEntry(models.Model):
    """
    Append-only double-entry style ledger for all financial events.
    PostgreSQL-level: no DELETE permission should be granted on this table.
    """

    class EntryType(models.TextChoices):
        INVOICE = 'INVOICE', 'Invoice raised'
        PAYMENT = 'PAYMENT', 'Payment received'
        RECHARGE = 'RECHARGE', 'Service recharge'
        ADVANCE = 'ADVANCE', 'Advance/prepayment'
        REFUND = 'REFUND', 'Refund issued'
        REVERSAL = 'REVERSAL', 'Transaction reversal'
        ADJUSTMENT = 'ADJUSTMENT', 'Manual adjustment'
        COMMISSION = 'COMMISSION', 'Reseller commission'
        CREDIT_NOTE = 'CREDIT_NOTE', 'Credit note'
        DEBIT_NOTE = 'DEBIT_NOTE', 'Debit note'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='ledger_entries')
    customer = models.ForeignKey(
        'customers.Customer', on_delete=models.PROTECT,
        related_name='ledger_entries', null=True, blank=True
    )
    entry_type = models.CharField(max_length=30, choices=EntryType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    balance_after = models.DecimalField(max_digits=14, decimal_places=2)
    reference_id = models.CharField(
        max_length=100, blank=True,
        help_text="UUID of related Invoice, Payment, Recharge, etc."
    )
    reference_type = models.CharField(
        max_length=50, blank=True,
        help_text="Model name: 'Invoice', 'PaymentTransaction', 'Recharge'"
    )
    description = models.TextField(blank=True)
    created_by = models.CharField(max_length=150, default='system')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'customer', 'created_at'], name='ledger_tenant_cust_ts_idx'),
            models.Index(fields=['tenant', 'entry_type', 'created_at'], name='ledger_tenant_type_ts_idx'),
        ]

    objects = ImmutableQuerySet.as_manager()

    def delete(self, *args, **kwargs):
        raise ValidationError("Ledger entries are immutable and cannot be deleted. Use a reversal or adjustment entry.")

    def __str__(self):
        return f"[{self.entry_type}] ৳{self.amount} | Balance: ৳{self.balance_after} | {self.created_at.date()}"


# ─────────────────────────────────────────────────────────────────────────────
# Adjustment — manual credit/debit overrides (Plan Phase E)
# ─────────────────────────────────────────────────────────────────────────────

class Adjustment(models.Model):
    """
    Manual financial adjustment by a staff member.
    Always creates a corresponding LedgerEntry.
    """

    class AdjustmentType(models.TextChoices):
        CREDIT = 'CREDIT', 'Credit (add to balance)'
        DEBIT = 'DEBIT', 'Debit (deduct from balance)'
        WAIVER = 'WAIVER', 'Fee waiver'
        PENALTY = 'PENALTY', 'Late payment penalty'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    customer = models.ForeignKey(
        'customers.Customer', on_delete=models.PROTECT, related_name='adjustments'
    )
    adjustment_type = models.CharField(max_length=20, choices=AdjustmentType.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.TextField()
    approved_by = models.CharField(max_length=150)
    ledger_entry = models.OneToOneField(
        LedgerEntry, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='adjustment'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'customer'], name='adj_tenant_cust_idx'),
        ]

    objects = ImmutableQuerySet.as_manager()

    def delete(self, *args, **kwargs):
        raise ValidationError("Adjustments are immutable audit records and cannot be deleted.")

    def __str__(self):
        return f"{self.adjustment_type} ৳{self.amount} for {self.customer}"


# ─────────────────────────────────────────────────────────────────────────────
# IdempotencyKey — deduplication for financial mutations (Plan Phase 34)
# ─────────────────────────────────────────────────────────────────────────────

class IdempotencyKey(models.Model):
    """
    Stores idempotency keys for financial mutations.
    Prevents duplicate recharge, payment, or refund operations.

    Usage:
        key = IdempotencyKey.objects.filter(
            tenant=request.tenant,
            key=request.headers.get('Idempotency-Key')
        ).first()
        if key and key.is_complete:
            return Response(key.response_body, status=key.response_status)
    """

    class Status(models.TextChoices):
        PROCESSING = 'PROCESSING', 'In Progress'
        COMPLETE = 'COMPLETE', 'Complete'
        FAILED = 'FAILED', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    key = models.CharField(max_length=255, db_index=True)
    operation = models.CharField(
        max_length=100, help_text="e.g. 'recharge', 'payment', 'webhook'"
    )
    request_hash = models.CharField(
        max_length=64, blank=True,
        help_text="SHA256 of request body for exact-match deduplication"
    )
    response_body = models.JSONField(default=dict, blank=True)
    response_status = models.PositiveIntegerField(default=200)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PROCESSING
    )
    expires_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Idempotency records expire and can be GC'd after this time"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('tenant', 'key')]
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'key'], name='idem_tenant_key_idx'),
            models.Index(fields=['expires_at'], name='idem_expires_idx'),
        ]

    @property
    def is_complete(self):
        return self.status == self.Status.COMPLETE

    @staticmethod
    def hash_request(body: bytes) -> str:
        return hashlib.sha256(body).hexdigest()

    def __str__(self):
        return f"IdempotencyKey[{self.operation}]: {self.key[:16]}... ({self.status})"


# ─────────────────────────────────────────────────────────────────────────────
# Phase 24: extended billing surface — CreditNote, DiscountCoupon,
# DunningStage + DunningEvent, TaxRule, BillDispute
# ─────────────────────────────────────────────────────────────────────────────


class CreditNote(models.Model):
    """
    Credit note issued when an Invoice (or Recharge) is reversed or when a
    customer overpays. ``amount`` is the credit recognised on the customer's
    BillingAccount; ``applied_to_invoice`` records where the credit was
    absorbed (if any).
    """
    class Reason(models.TextChoices):
        REVERSAL = 'REVERSAL', 'Recharge reversal'
        OVERPAYMENT = 'OVERPAYMENT', 'Overpayment'
        GOODWILL = 'GOODWILL', 'Goodwill'
        CORRECTION = 'CORRECTION', 'Error correction'
        WAIVER = 'WAIVER', 'Billing waiver'

    class Status(models.TextChoices):
        ISSUED = 'ISSUED', 'Issued (unused)'
        APPLIED = 'APPLIED', 'Applied to invoice'
        REFUNDED = 'REFUNDED', 'Refunded out'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='credit_notes')
    customer = models.ForeignKey(
        'customers.Customer', on_delete=models.PROTECT, related_name='credit_notes'
    )
    credit_note_no = models.CharField(max_length=50, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=20, choices=Reason.choices, default=Reason.REVERSAL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ISSUED)
    related_invoice = models.ForeignKey(
        'billing.Invoice', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='credit_notes',
    )
    related_recharge = models.ForeignKey(
        'billing.Recharge', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='credit_notes',
    )
    notes = models.TextField(blank=True)
    created_by = models.CharField(max_length=150, blank=True, default='system')
    issued_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-issued_at']
        indexes = [
            models.Index(fields=['tenant', 'customer', 'status'], name='cn_tenant_cust_status_idx'),
        ]

    objects = ImmutableQuerySet.as_manager()

    def delete(self, *args, **kwargs):
        raise ValidationError("Credit notes are immutable. Issue a reversal instead.")

    def __str__(self):
        return f"CreditNote[{self.credit_note_no}] ৳{self.amount} {self.status}"


class TaxRule(models.Model):
    """
    Per-tenant tax/VAT configuration. Used by ``InvoiceService`` to roll tax
    lines into ``InvoiceLine`` items. Keep it simple: a single percentage
    rule per tenant for now (the codebase doesn't model multi-zone tax yet).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='tax_rule')
    label = models.CharField(max_length=80, default='VAT')
    percentage = models.DecimalField(max_digits=6, decimal_places=3, default=0.000,
                                     help_text='Tax percentage (e.g. 5.000 = 5%)')
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.label}: {self.percentage}%"


class DiscountCoupon(models.Model):
    """
    Promo / coupon engine. A coupon has a fixed or percentage discount that
    is applied during billing/checkout.
    """
    class DiscountType(models.TextChoices):
        PERCENTAGE = 'PERCENTAGE', 'Percentage'
        FIXED = 'FIXED', 'Fixed amount'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='discount_coupons')
    code = models.CharField(max_length=50, db_index=True)
    description = models.TextField(blank=True)
    discount_type = models.CharField(max_length=15, choices=DiscountType.choices)
    value = models.DecimalField(max_digits=12, decimal_places=2,
                               help_text='% (0-100) if PERCENTAGE, else ৳ value')
    min_invoice_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    max_redemptions = models.PositiveIntegerField(default=0,
                                                  help_text='0 = unlimited')
    redemptions = models.PositiveIntegerField(default=0)
    per_customer_limit = models.PositiveIntegerField(default=0,
                                                    help_text='0 = unlimited')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'code'], name='coupon_tenant_code_uniq'),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.code} ({self.discount_type} ৳{self.value})"


class CouponRedemption(models.Model):
    """Audit record every time a coupon is applied to an invoice."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='coupon_redemptions')
    coupon = models.ForeignKey(DiscountCoupon, on_delete=models.PROTECT, related_name='redemption_records')
    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name='coupon_redemptions')
    invoice = models.ForeignKey('billing.Invoice', null=True, blank=True, on_delete=models.SET_NULL)
    amount_applied = models.DecimalField(max_digits=12, decimal_places=2)
    redeemed_at = models.DateTimeField(auto_now_add=True)

    objects = ImmutableQuerySet.as_manager()

    def delete(self, *args, **kwargs):
        raise ValidationError("Coupon redemptions are immutable.")

    class Meta:
        ordering = ['-redeemed_at']
        indexes = [
            models.Index(fields=['tenant', 'coupon'], name='redemption_tenant_coupon_idx'),
        ]

    def __str__(self):
        return f"Coupon{self.coupon.code} → {self.amount_applied}"


class DunningStage(models.Model):
    """
    Multi-step overdue reminder cascade. Each tenant configures one or more
    stages; ``DunningEvent`` records fire actions triggered for a
    customer+invoice pair.
    """
    class Action(models.TextChoices):
        SMS = 'SMS', 'SMS reminder'
        IVR = 'IVR', 'IVR voice call'
        EMAIL = 'EMAIL', 'Email'
        DISCONNECT = 'DISCONNECT', 'Network disconnection'
        PUSH_TO_TICKET = 'TICKET', 'Create support ticket'
        COLLECTION_NOTE = 'NOTE', 'Collection note only'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='dunning_stages')
    name = models.CharField(max_length=80)
    days_overdue = models.PositiveIntegerField(help_text='Trigger when invoice is at least N days past due_date.')
    action = models.CharField(max_length=20, choices=Action.choices, default=Action.SMS)
    template_text = models.TextField(blank=True,
                                     help_text='Optional SMS/IVR template. Supports [NAME] [AMOUNT] [DAYS] [DATE] placeholders.')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['days_overdue']
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'days_overdue'], name='dunning_stage_tenant_days_uniq'),
        ]

    def __str__(self):
        return f"{self.tenant.slug}: D+{self.days_overdue} {self.action}"


class DunningEvent(models.Model):
    """Audit record of every dunning trigger fired."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='dunning_events')
    stage = models.ForeignKey(DunningStage, on_delete=models.PROTECT, related_name='events')
    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name='dunning_events')
    invoice = models.ForeignKey('billing.Invoice', on_delete=models.PROTECT, related_name='dunning_events')
    triggered_at = models.DateTimeField(auto_now_add=True)
    delivery_status = models.CharField(max_length=30, default='queued',
                                       help_text='queued | sent | failed | pending')
    provider_response = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-triggered_at']
        indexes = [
            models.Index(fields=['tenant', 'triggered_at'], name='dunning_event_tenant_idx'),
        ]

    def __str__(self):
        return f"{self.stage.name} → {self.customer.pppoe_username} ({self.delivery_status})"


class BillDispute(models.Model):
    """A customer's formal challenge against an invoice → opens a support ticket."""
    class Status(models.TextChoices):
        OPEN = 'OPEN', 'Open'
        UNDER_REVIEW = 'UNDER_REVIEW', 'Under review'
        RESOLVED = 'RESOLVED', 'Resolved'
        REJECTED = 'REJECTED', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='bill_disputes')
    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name='bill_disputes')
    invoice = models.ForeignKey('billing.Invoice', on_delete=models.PROTECT, related_name='disputes')
    reason = models.TextField()
    contact_phone = models.CharField(max_length=30, blank=True, default='')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    # support_ticket_id is stored as a plain UUID string because
    # ``apps.support.SupportTicket`` is not yet a modelled entity. When the
    # support app adds it, swap this for ``models.OneToOneField('support.SupportTicket', ...)``.
    support_ticket_id = models.CharField(max_length=64, blank=True, default='')
    resolution_notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status'], name='bill_dispute_status_idx'),
        ]

    def __str__(self):
        return f"Dispute[{self.invoice.invoice_no}] {self.status}"

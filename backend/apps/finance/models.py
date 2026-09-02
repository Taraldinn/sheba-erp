import hashlib
import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import Tenant


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
        on_delete=models.CASCADE,
        related_name='allocations'
    )
    invoice = models.ForeignKey(
        'billing.Invoice',
        on_delete=models.CASCADE,
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
        'customers.Customer', on_delete=models.CASCADE,
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
        'customers.Customer', on_delete=models.CASCADE, related_name='adjustments'
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

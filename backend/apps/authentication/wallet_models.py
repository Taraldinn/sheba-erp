"""
Stage 4 — Reseller financial models: wallet holds, credit facility, settlement.

Master task §D:
  - Wallet cash and credit are NOT to be confused. Wallet holds and releases
    protect against double-spending when a package purchase or connection
    renewal enqueues a network sync job.
  - Credit facilities track approved limits, outstanding exposure, and
    available credit. Changes to the limit are recorded in an audit log.
  - Settlement is the periodic settlement between a reseller and the ISP.
"""
import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models import Tenant
from apps.authentication.models import Reseller


# ── Wallet Holds ──────────────────────────────────────────────────────────

class ResellerWalletHold(models.Model):
    """
    A pending debit on a reseller's wallet that may be released (cancelled)
    or finalized (applied). Holds exist so that a network-sync job can be
    enqueued before money actually moves.

    State machine:
        PENDING  --(release)-->  RELEASED
        PENDING  --(finalize)->  FINALIZED
        PENDING  --(auto-clean)--> EXPIRED
    """
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        RELEASED = 'RELEASED', 'Released'
        FINALIZED = 'FINALIZED', 'Finalized'
        EXPIRED = 'EXPIRED', 'Expired'

    class Source(models.TextChoices):
        WALLET = 'WALLET', 'Wallet cash'
        CREDIT = 'CREDIT', 'Credit facility'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reseller = models.ForeignKey(
        Reseller, on_delete=models.CASCADE, related_name='wallet_holds'
    )
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='reseller_holds'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    source = models.CharField(
        max_length=10, choices=Source.choices, default=Source.WALLET
    )
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING
    )
    purpose = models.CharField(
        max_length=100,
        help_text="What this hold is for, e.g. 'package_purchase' or 'renewal'",
    )
    reference_id = models.CharField(
        max_length=100, blank=True,
        help_text="UUID of the related network job, recharge, etc.",
    )
    idempotency_key = models.CharField(max_length=100, blank=True, db_index=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.CharField(max_length=150, default='system')
    finalized_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    release_reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(
                fields=['reseller', 'status', '-created_at'],
                name='reseller_hold_active_idx',
            ),
            models.Index(
                fields=['tenant', 'status'],
                name='reseller_hold_tenant_idx',
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['reseller', 'idempotency_key'],
                name='reseller_hold_idem_unique',
                condition=~models.Q(idempotency_key=''),
            ),
        ]

    def __str__(self):
        return f"{self.status} ৳{self.amount} on {self.reseller.business_name} ({self.purpose})"


# ── Credit Facility ──────────────────────────────────────────────────────

class ResellerCreditFacility(models.Model):
    """
    A reseller's approved credit line with the ISP.

    Master task §D: 'Approved credit limit. Outstanding credit exposure.
    Available credit calculation. Credit approvals and changes with audit
    history. Repayments and settlement adjustments.'

    `outstanding_exposure` is the cached sum of:
        - PENDING or FINALIZED holds where source=CREDIT
        - explicit credit draws not yet repaid
    `available_credit` is computed: approved_limit - outstanding_exposure.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reseller = models.OneToOneField(
        Reseller, on_delete=models.CASCADE, related_name='credit_facility'
    )
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='reseller_credit_facilities'
    )
    approved_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    outstanding_exposure = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text='Cached: sum of pending+finalized credit holds and draws.',
    )
    is_suspended = models.BooleanField(default=False)
    suspension_reason = models.CharField(max_length=200, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.CharField(max_length=150, blank=True)
    next_review_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def available_credit(self) -> Decimal:
        return Decimal(str(self.approved_limit)) - Decimal(str(self.outstanding_exposure))

    def __str__(self):
        return f"Credit {self.reseller.business_name}: ৳{self.approved_limit} (exposure ৳{self.outstanding_exposure})"


class ResellerCreditApproval(models.Model):
    """
    Immutable audit log of every change to a reseller's credit facility:
    creation, limit increase, limit decrease, suspension, reactivation.
    """
    class Action(models.TextChoices):
        CREATE = 'CREATE', 'Facility created'
        LIMIT_CHANGE = 'LIMIT_CHANGE', 'Limit change'
        SUSPEND = 'SUSPEND', 'Suspended'
        REACTIVATE = 'REACTIVATE', 'Reactivated'
        REPAY = 'REPAY', 'Repayment applied'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility = models.ForeignKey(
        ResellerCreditFacility, on_delete=models.CASCADE,
        related_name='approvals',
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    previous_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    new_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reason = models.TextField(blank=True)
    actor_username = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['facility', '-created_at'],
                         name='credit_approval_history_idx'),
        ]

    def delete(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        raise ValidationError("Credit approval records are immutable.")

    def __str__(self):
        return f"{self.action} ৳{self.previous_limit}→৳{self.new_limit} by {self.actor_username}"


# ── Settlement ───────────────────────────────────────────────────────────

class ResellerSettlement(models.Model):
    """
    A settlement record between the reseller and the ISP. One row per
    settlement period (typically monthly).

    `gross_collections`   = sum of ResellerCollectionEvent for the period
    `isp_share`           = the ISP's portion (e.g. 100% - commission_rate)
    `commission_earned`   = the reseller's commission
    `wallet_credit_applied` = amount credited to the reseller wallet
    `settled_amount`      = amount the reseller is to receive
    """
    class Status(models.TextChoices):
        OPEN = 'OPEN', 'Open'
        REVIEWED = 'REVIEWED', 'Reviewed'
        CLOSED = 'CLOSED', 'Closed'
        DISPUTED = 'DISPUTED', 'Disputed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reseller = models.ForeignKey(
        Reseller, on_delete=models.CASCADE, related_name='settlements'
    )
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='reseller_settlements'
    )
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    gross_collections = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    isp_share = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    commission_earned = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    wallet_credit_applied = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    settled_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-period_start']
        indexes = [
            models.Index(fields=['reseller', 'status'],
                         name='settlement_reseller_status_idx'),
        ]

    def __str__(self):
        return f"Settlement {self.reseller.business_name} [{self.period_start:%Y-%m-%d}–{self.period_end:%Y-%m-%d}]"

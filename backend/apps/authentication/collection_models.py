"""
Stage 5 — Reseller Collection event model.

Master task §E: 'A payment collected from a customer must not automatically
increase the reseller wallet. Represent money collected on behalf of the
ISP according to the defined accounting and settlement model.'

A `ResellerCollectionEvent` records that a reseller collected cash (or
received a direct bKash-to-ISP payment) from a customer. The event does
NOT credit the reseller's wallet — it increases the gross_collections of
the active settlement period and, after the settlement is closed, posts
a single credit to the reseller wallet as the commission share.

The full allocation flow lives in `apps.finance.services.ResellerCollectionService`
(stage 5 implementation).
"""
import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone

from apps.core.models import Tenant
from apps.authentication.models import Reseller
from apps.customers.models import Customer
from apps.billing.models import Invoice, Recharge
from apps.payments.models import PaymentTransaction


class ResellerCollectionEvent(models.Model):
    """
    A cash collection by a reseller from a customer.

    States:
        RECEIVED  --(allocate to invoice)-->  ALLOCATED
        RECEIVED  --(mark as unallocated)->  PENDING_REVIEW
        ALLOCATED --(reverse)-->              REVERSED
    """

    class Status(models.TextChoices):
        RECEIVED = 'RECEIVED', 'Received from customer'
        ALLOCATED = 'ALLOCATED', 'Allocated to customer invoice/recharge'
        PENDING_REVIEW = 'PENDING_REVIEW', 'Awaiting manual review'
        REVERSED = 'REVERSED', 'Reversed by an administrator'

    class Method(models.TextChoices):
        CASH = 'CASH', 'Cash'
        BKASH = 'BKASH', 'bKash to ISP account'
        NAGAD = 'NAGAD', 'Nagad'
        ROCKET = 'ROCKET', 'Rocket'
        BANK = 'BANK', 'Bank transfer'
        OTHER = 'OTHER', 'Other'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='reseller_collections'
    )
    reseller = models.ForeignKey(
        Reseller, on_delete=models.CASCADE, related_name='collections'
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name='reseller_collections',
        null=True, blank=True,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=12, choices=Method.choices, default=Method.CASH)
    reference = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.RECEIVED
    )
    collected_at = models.DateTimeField(default=timezone.now)
    # The optional downstream records if the collection was allocated to an
    # invoice or a recharge; both are nullable because the collection may
    # sit in PENDING_REVIEW.
    invoice = models.ForeignKey(
        Invoice, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reseller_collections',
    )
    recharge = models.ForeignKey(
        Recharge, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reseller_collections',
    )
    payment_transaction = models.ForeignKey(
        PaymentTransaction, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reseller_collections',
    )
    # Reseller settlement this event eventually belongs to.
    settlement = models.ForeignKey(
        'ResellerSettlement', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='collections',
    )
    recorded_by = models.CharField(max_length=150, default='system')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-collected_at']
        indexes = [
            models.Index(fields=['tenant', 'reseller', 'status'],
                         name='coll_tr_stat_idx'),
            models.Index(fields=['tenant', 'status', 'collected_at'],
                         name='coll_t_stat_ts_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'reseller', 'reference'],
                name='reseller_collection_ref_unique',
                condition=~models.Q(reference=''),
            ),
        ]

    def __str__(self):
        return f"{self.reseller.business_name} collected ৳{self.amount} ({self.status})"

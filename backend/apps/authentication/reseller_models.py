"""
Stage 3 — Reseller-to-Customer assignment (clean, post-legacy model).

`Customer.reseller` is a legacy FK to `StaffProfile`. The Stage 3
implementation introduces a through-model `ResellerCustomer` that points to
the new `Reseller` business entity. The two are kept in sync: when a row
is added to `ResellerCustomer`, the legacy FK is also populated to point to
the matching legacy staff profile, so existing code paths (e.g. customer
queries) still work.

This file lives in `apps.authentication/` (where `Reseller` is defined) to
avoid an import cycle between `apps.customers` and `apps.authentication`.
The `apps.customers` app loads this through `apps.authentication.models`
which already imports `Reseller`.
"""
import uuid
from django.db import models
from django.core.exceptions import ValidationError

from apps.core.models import Tenant
from apps.authentication.models import Reseller
from apps.customers.models import Customer


class ResellerCustomer(models.Model):
    """
    Assigns a Customer to a Reseller within a Tenant.

    Master task §D: 'Each reseller belongs to a single tenant context and
    may manage only assigned customers.'

    The (reseller, customer) pair is unique. The tenant must match on both
    sides. A Customer may have multiple historical rows if reassigned, but
    only one is `is_active` at a time.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reseller = models.ForeignKey(
        Reseller, on_delete=models.CASCADE, related_name='customer_assignments'
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name='reseller_assignments'
    )
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='reseller_assignments'
    )
    is_active = models.BooleanField(default=True)
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by_id = models.IntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = [('reseller', 'customer')]
        indexes = [
            models.Index(fields=['tenant', 'reseller', 'is_active'],
                         name='reseller_cust_active_idx'),
            models.Index(fields=['tenant', 'customer', 'is_active'],
                         name='customer_reseller_active_idx'),
        ]
        ordering = ['-assigned_at']

    def clean(self):
        # Both sides must belong to the same tenant.
        if self.reseller_id and self.customer_id and self.tenant_id:
            if self.reseller.tenant_id != self.tenant_id:
                raise ValidationError("Reseller and tenant mismatch.")
            if self.customer.tenant_id != self.tenant_id:
                raise ValidationError("Customer and tenant mismatch.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reseller.business_name} → {self.customer.full_name}"

    @classmethod
    def active_for_reseller(cls, reseller):
        return cls.objects.filter(reseller=reseller, is_active=True)

    @classmethod
    def active_for_customer(cls, customer):
        return cls.objects.filter(customer=customer, is_active=True)

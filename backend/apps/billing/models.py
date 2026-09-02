import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import Tenant
from apps.authentication.models import StaffProfile


class Package(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='packages')
    name = models.CharField(max_length=150)
    mikrotik_profile = models.CharField(max_length=150, help_text="Corresponding MikroTik PPP Profile name")
    speed_mbps = models.PositiveIntegerField(default=10, help_text="Download speed in Mbps")
    upload_speed_mbps = models.PositiveIntegerField(default=10, help_text="Upload speed in Mbps")
    validity_days = models.PositiveIntegerField(default=30)
    regular_price = models.DecimalField(max_digits=10, decimal_places=2, default=500.00)
    min_reseller_price = models.DecimalField(max_digits=10, decimal_places=2, default=350.00)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.speed_mbps} Mbps - ৳{self.regular_price})"


class ResellerPricing(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='reseller_pricings')
    reseller = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='custom_prices')
    package = models.ForeignKey(Package, on_delete=models.CASCADE, related_name='reseller_rates')
    custom_price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('reseller', 'package')

    def __str__(self):
        return f"{self.reseller.user.username} - {self.package.name}: ৳{self.custom_price}"


class Invoice(models.Model):
    class InvoiceStatus(models.TextChoices):
        PAID = 'PAID', 'Paid'
        UNPAID = 'UNPAID', 'Unpaid / Due'
        PARTIAL = 'PARTIAL', 'Partially Paid'
        CANCELLED = 'CANCELLED', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='invoices')
    customer = models.ForeignKey('customers.Customer', on_delete=models.CASCADE, related_name='invoices')
    invoice_no = models.CharField(max_length=50, unique=True)
    billing_month = models.CharField(max_length=20, help_text="e.g. September 2026")
    package_name = models.CharField(max_length=150)
    package_amount = models.DecimalField(max_digits=10, decimal_places=2)
    previous_due = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    total_payable = models.DecimalField(max_digits=10, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    due_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    status = models.CharField(max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.UNPAID)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status', 'due_date'], name='inv_tenant_status_due_idx'),
            models.Index(fields=['tenant', 'created_at'], name='inv_tenant_created_idx'),
            models.Index(fields=['customer', 'status'], name='inv_customer_status_idx'),
        ]

    def __str__(self):
        return f"Invoice #{self.invoice_no} ({self.customer.full_name}) - ৳{self.total_payable}"


class Recharge(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='recharges')
    customer = models.ForeignKey('customers.Customer', on_delete=models.CASCADE, related_name='recharges')
    package = models.ForeignKey(Package, on_delete=models.SET_NULL, null=True, related_name='recharge_records')
    processed_by = models.ForeignKey(StaffProfile, on_delete=models.SET_NULL, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    validity_days = models.PositiveIntegerField(default=30)
    old_expiry = models.DateField(null=True, blank=True)
    new_expiry = models.DateField()
    payment_method = models.CharField(max_length=50, default='Cash')
    trx_id = models.CharField(max_length=100, blank=True)
    is_reversed = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'created_at'], name='rech_tenant_created_idx'),
            models.Index(fields=['customer', 'created_at'], name='rech_customer_created_idx'),
        ]

    def __str__(self):
        return f"Recharge ৳{self.amount} for {self.customer.pppoe_username} (Exp: {self.new_expiry})"


class Offer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='offers')
    name = models.CharField(max_length=150)
    buy_days = models.PositiveIntegerField(default=90, help_text="Number of paid days")
    free_days = models.PositiveIntegerField(default=30, help_text="Bonus / Free promo days")
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    description = models.TextField(blank=True)
    valid_until = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.buy_days}+{self.free_days} Days)"

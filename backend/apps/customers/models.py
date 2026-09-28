import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import Tenant
from apps.authentication.models import StaffProfile
from apps.network.models import Router
from apps.billing.models import Package
from apps.core.fields import EncryptedCharField


class CustomerStatus(models.TextChoices):
    ACTIVE = 'Active', 'Active'
    EXPIRED = 'Expired', 'Expired'
    SUSPENDED = 'Suspended', 'Suspended / Locked'
    LEFT = 'Left', 'Left / Terminated'


class ConnectionType(models.TextChoices):
    PPPOE = 'PPPoE', 'PPPoE'
    STATIC = 'Static_IP', 'Static IP'
    DHCP = 'DHCP', 'DHCP / IPoE'


class BillingType(models.TextChoices):
    PREPAID = 'Prepaid', 'Prepaid'
    POSTPAID = 'Postpaid', 'Postpaid'


class Customer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='customers')
    reseller = models.ForeignKey(StaffProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='reseller_customers')
    
    # Identifiers
    customer_code = models.CharField(max_length=50, blank=True, db_index=True)
    full_name = models.CharField(max_length=150)
    mobile = models.CharField(max_length=30, db_index=True)
    email = models.EmailField(blank=True)
    national_id = models.CharField(max_length=50, blank=True)
    address = models.TextField(blank=True)
    area_zone = models.CharField(max_length=100, blank=True, default='Main Zone')
    
    # Network / Credentials
    connection_type = models.CharField(max_length=30, choices=ConnectionType.choices, default=ConnectionType.PPPOE)
    router = models.ForeignKey(Router, on_delete=models.SET_NULL, null=True, blank=True, related_name='customers')
    pppoe_username = models.CharField(max_length=100, db_index=True)
    pppoe_password = models.CharField(max_length=100)
    portal_password = models.CharField(max_length=128, blank=True, default='', help_text="Hashed password for self-care portal login")
    # Idempotency guard for the auto-issued welcome login. Set whenever
    # the welcome SMS / email has been dispatched for this customer so
    # retries don't double-send credentials.
    welcome_sent_at = models.DateTimeField(null=True, blank=True)
    welcome_sent_via = models.CharField(max_length=32, blank=True, default='', help_text="Comma list: sms,email")
    welcome_sms_log_id = models.CharField(max_length=64, blank=True, default='')
    welcome_email_to = models.EmailField(blank=True, default='')
    welcome_username = models.CharField(max_length=128, blank=True, default='', help_text="Username mailed/SMSed to the customer; usually the pppoe_username but overridable.")
    static_ip = models.GenericIPAddressField(null=True, blank=True)
    mac_address = models.CharField(max_length=50, blank=True)
    onu_mac_or_sn = models.CharField(max_length=100, blank=True)
    
    # Package & Billing
    package = models.ForeignKey(Package, on_delete=models.SET_NULL, null=True, related_name='subscribers')
    billing_type = models.CharField(max_length=30, choices=BillingType.choices, default=BillingType.PREPAID)
    monthly_bill = models.DecimalField(max_digits=10, decimal_places=2, default=500.00)
    due_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    advance_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    
    # CPE / Diagnostics (v4.2.2)
    cpe_management_ip = models.GenericIPAddressField(null=True, blank=True)
    cpe_router_model = models.CharField(max_length=100, blank=True)
    cpe_api_port = models.IntegerField(default=8728)
    cpe_api_ssl = models.BooleanField(default=False)
    cpe_admin_username = models.CharField(max_length=100, blank=True)
    cpe_admin_password = EncryptedCharField(max_length=255, blank=True)
    cpe_pppoe_password = EncryptedCharField(max_length=255, blank=True, help_text="Stored CPE PPPoE password")
    
    # Lifecycles
    bill_date = models.DateField(default=timezone.localdate)
    expiry_date = models.DateField(null=True, blank=True, db_index=True)
    promise_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=CustomerStatus.choices, default=CustomerStatus.ACTIVE, db_index=True)
    auto_lock_enabled = models.BooleanField(default=True)
    
    # Location & Notes
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    remarks = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if self.package_id and self.tenant_id and self.package.tenant_id != self.tenant_id:
            raise ValidationError("Customer package must belong to the same tenant.")
        if self.router_id and self.tenant_id and self.router.tenant_id != self.tenant_id:
            raise ValidationError("Customer router must belong to the same tenant.")
        if self.reseller_id and self.tenant_id and self.reseller.tenant_id != self.tenant_id:
            raise ValidationError("Customer reseller must belong to the same tenant.")

    class Meta:
        unique_together = ('tenant', 'pppoe_username')
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'customer_code'],
                condition=~models.Q(customer_code=''),
                name='unique_tenant_customer_code'
            ),
        ]
        indexes = [
            models.Index(fields=['tenant', 'status'], name='cust_tenant_status_idx'),
            models.Index(fields=['tenant', 'expiry_date'], name='cust_tenant_expiry_idx'),
            models.Index(fields=['tenant', 'created_at'], name='cust_tenant_created_idx'),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.pppoe_username}) - {self.status}"


class PPPoECredentialRescueEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='pppoe_rescue_events')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='rescue_events')
    action = models.CharField(max_length=50)
    finding = models.CharField(max_length=100, blank=True)
    performed_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.action} on {self.customer.pppoe_username}"

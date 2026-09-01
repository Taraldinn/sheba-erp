import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import Tenant
from apps.authentication.models import StaffProfile
from apps.network.models import Router
from apps.billing.models import Package


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
    
    # Lifecycles
    bill_date = models.DateField(default=timezone.now)
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

    class Meta:
        unique_together = ('tenant', 'pppoe_username')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.full_name} ({self.pppoe_username}) - {self.status}"

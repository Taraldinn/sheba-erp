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
    ARCHIVED = 'Archived', 'Archived'


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


class ServiceStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending Activation'
    ACTIVE = 'ACTIVE', 'Active'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    TERMINATED = 'TERMINATED', 'Terminated'


class ServiceType(models.TextChoices):
    BROADBAND = 'BROADBAND', 'Broadband Internet'
    STATIC_IP = 'STATIC_IP', 'Dedicated Static IP'
    IPTV = 'IPTV', 'IPTV Service'
    VOIP = 'VOIP', 'VoIP / SIP Trunk'
    LEASED_LINE = 'LEASED_LINE', 'Corporate Leased Line'


class CustomerService(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='customer_services')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='services')
    package = models.ForeignKey('billing.Package', on_delete=models.SET_NULL, null=True, blank=True, related_name='customer_services')
    service_type = models.CharField(max_length=30, choices=ServiceType.choices, default=ServiceType.BROADBAND)
    service_identifier = models.CharField(max_length=150, help_text="e.g. PPPoE username, circuit ID, or IP")
    status = models.CharField(max_length=30, choices=ServiceStatus.choices, default=ServiceStatus.PENDING, db_index=True)
    activation_date = models.DateTimeField(null=True, blank=True)
    termination_date = models.DateTimeField(null=True, blank=True)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    router = models.ForeignKey('network.Router', on_delete=models.SET_NULL, null=True, blank=True, related_name='customer_services')
    provisioning_status = models.CharField(
        max_length=30,
        default='NOT_PROVISIONED',
        db_index=True,
        help_text="Network hardware provisioning status (NOT_PROVISIONED, PROVISIONING, PROVISIONED, FAILED, DEPROVISIONED)"
    )
    network_metadata = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def pppoe_account(self):
        return self.pppoe_accounts.first()

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if self.customer_id and self.tenant_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError("CustomerService customer must belong to the same tenant.")
        if self.package_id and self.tenant_id and self.package.tenant_id != self.tenant_id:
            raise ValidationError("CustomerService package must belong to the same tenant.")
        if self.router_id and self.tenant_id and self.router.tenant_id != self.tenant_id:
            raise ValidationError("CustomerService router must belong to the same tenant.")

    def activate(self):
        from django.core.exceptions import ValidationError
        if self.status == ServiceStatus.TERMINATED:
            raise ValidationError("Cannot activate a terminated service.")
        self.status = ServiceStatus.ACTIVE
        if not self.activation_date:
            self.activation_date = timezone.now()
        self.save(update_fields=['status', 'activation_date', 'updated_at'])

    def suspend(self, reason=''):
        from django.core.exceptions import ValidationError
        if self.status != ServiceStatus.ACTIVE:
            raise ValidationError("Only active services can be suspended.")
        self.status = ServiceStatus.SUSPENDED
        if reason:
            self.notes = f"{self.notes}\n[Suspended: {reason}]".strip()
            self.save(update_fields=['status', 'notes', 'updated_at'])
        else:
            self.save(update_fields=['status', 'updated_at'])

    def resume(self):
        from django.core.exceptions import ValidationError
        if self.status != ServiceStatus.SUSPENDED:
            raise ValidationError("Only suspended services can be resumed.")
        self.status = ServiceStatus.ACTIVE
        self.save(update_fields=['status', 'updated_at'])

    def terminate(self, reason=''):
        from django.core.exceptions import ValidationError
        if self.status == ServiceStatus.TERMINATED:
            raise ValidationError("Service is already terminated.")
        self.status = ServiceStatus.TERMINATED
        self.termination_date = timezone.now()
        if reason:
            self.notes = f"{self.notes}\n[Terminated: {reason}]".strip()
            self.save(update_fields=['status', 'termination_date', 'notes', 'updated_at'])
        else:
            self.save(update_fields=['status', 'termination_date', 'updated_at'])

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status'], name='svc_tenant_status_idx'),
            models.Index(fields=['customer', 'status'], name='svc_cust_status_idx'),
            models.Index(fields=['tenant', 'service_identifier'], name='svc_tenant_ident_idx'),
        ]

    def __str__(self):
        return f"{self.get_service_type_display()} ({self.service_identifier}) - {self.status}"


class SubscriptionStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    ACTIVE = 'ACTIVE', 'Active'
    PAUSED = 'PAUSED', 'Paused'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    CANCELLED = 'CANCELLED', 'Cancelled'
    EXPIRED = 'EXPIRED', 'Expired'


class BillingCycle(models.TextChoices):
    MONTHLY = 'MONTHLY', 'Monthly'
    QUARTERLY = 'QUARTERLY', 'Quarterly'
    HALF_YEARLY = 'HALF_YEARLY', 'Half-Yearly'
    YEARLY = 'YEARLY', 'Yearly'


class CustomerSubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='customer_subscriptions')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='subscriptions')
    service = models.ForeignKey(CustomerService, on_delete=models.CASCADE, related_name='subscriptions')
    package = models.ForeignKey('billing.Package', on_delete=models.SET_NULL, null=True, related_name='customer_subscriptions')
    billing_cycle = models.CharField(max_length=30, choices=BillingCycle.choices, default=BillingCycle.MONTHLY)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    status = models.CharField(max_length=30, choices=SubscriptionStatus.choices, default=SubscriptionStatus.PENDING, db_index=True)
    start_date = models.DateField(default=timezone.localdate)
    next_billing_date = models.DateField(null=True, blank=True, db_index=True)
    end_date = models.DateField(null=True, blank=True)
    auto_renew = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if self.customer_id and self.tenant_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError("CustomerSubscription customer must belong to the same tenant.")
        if self.service_id and self.tenant_id and self.service.tenant_id != self.tenant_id:
            raise ValidationError("CustomerSubscription service must belong to the same tenant.")
        if self.package_id and self.tenant_id and self.package.tenant_id != self.tenant_id:
            raise ValidationError("CustomerSubscription package must belong to the same tenant.")

    def activate(self):
        from django.core.exceptions import ValidationError
        if self.status == SubscriptionStatus.CANCELLED:
            raise ValidationError("Cannot activate a cancelled subscription.")
        self.status = SubscriptionStatus.ACTIVE
        if not self.next_billing_date:
            import datetime
            self.next_billing_date = self.start_date + datetime.timedelta(days=30)
        self.save(update_fields=['status', 'next_billing_date', 'updated_at'])

    def suspend(self):
        from django.core.exceptions import ValidationError
        if self.status != SubscriptionStatus.ACTIVE:
            raise ValidationError("Only active subscriptions can be suspended.")
        self.status = SubscriptionStatus.SUSPENDED
        self.save(update_fields=['status', 'updated_at'])

    def resume(self):
        from django.core.exceptions import ValidationError
        if self.status not in [SubscriptionStatus.SUSPENDED, SubscriptionStatus.PAUSED]:
            raise ValidationError("Only suspended or paused subscriptions can be resumed.")
        self.status = SubscriptionStatus.ACTIVE
        self.save(update_fields=['status', 'updated_at'])

    def cancel(self):
        from django.core.exceptions import ValidationError
        if self.status == SubscriptionStatus.CANCELLED:
            raise ValidationError("Subscription is already cancelled.")
        self.status = SubscriptionStatus.CANCELLED
        self.end_date = timezone.localdate()
        self.save(update_fields=['status', 'end_date', 'updated_at'])

    def renew(self, days=30):
        import datetime
        from django.core.exceptions import ValidationError
        if self.status == SubscriptionStatus.CANCELLED:
            raise ValidationError("Cannot renew a cancelled subscription.")
        base_date = self.next_billing_date or timezone.localdate()
        if base_date < timezone.localdate():
            base_date = timezone.localdate()
        self.next_billing_date = base_date + datetime.timedelta(days=days)
        self.status = SubscriptionStatus.ACTIVE
        self.save(update_fields=['status', 'next_billing_date', 'updated_at'])

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status'], name='sub_tenant_status_idx'),
            models.Index(fields=['customer', 'status'], name='sub_cust_status_idx'),
            models.Index(fields=['service', 'status'], name='sub_svc_status_idx'),
        ]

    def __str__(self):
        return f"Subscription #{self.id} ({self.customer.full_name}) - {self.package.name if self.package else 'No Package'} [{self.status}]"


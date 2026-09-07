import uuid
from django.db import models
from django.utils import timezone


class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=100, unique=True)
    domain = models.CharField(max_length=255, blank=True, null=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    contact_email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    hmac_secret = models.CharField(max_length=255, default=uuid.uuid4)
    is_active = models.BooleanField(default=True)
    # SaaS Plan & Quotas
    plan = models.CharField(max_length=50, default='Growth', choices=[
        ('Starter', 'Starter ISP (Up to 500 Subscribers)'),
        ('Growth', 'Growth ISP (Up to 2,500 Subscribers)'),
        ('Enterprise', 'Enterprise ISP (Unlimited Subscribers)'),
    ])
    max_subscribers = models.PositiveIntegerField(default=2500)
    max_routers = models.PositiveIntegerField(default=10)
    subscription_status = models.CharField(max_length=20, default='active', choices=[
        ('active', 'Active'),
        ('trial', 'Trial'),
        ('past_due', 'Past Due'),
        ('suspended', 'Suspended'),
    ])
    subscription_expires_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.slug})"


class TenantDomain(models.Model):
    """Proper multi-domain management (Plan Phase 4).
    Replaces the single nullable Tenant.domain field.
    """

    class DomainType(models.TextChoices):
        PRIMARY = 'primary', 'Primary'
        ALIAS = 'alias', 'Alias'
        API = 'api', 'API Subdomain'
        PORTAL = 'portal', 'Customer Portal'
        CONTROL = 'control', 'Control Plane'

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='tenant_domains'
    )
    hostname = models.CharField(max_length=255, unique=True, db_index=True)
    is_primary = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    verified = models.BooleanField(default=False)
    domain_type = models.CharField(
        max_length=20, choices=DomainType.choices, default=DomainType.PRIMARY
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['hostname']
        indexes = [
            models.Index(fields=['hostname', 'is_active'], name='domain_hostname_active_idx'),
        ]

    def __str__(self):
        return f"{self.hostname} → {self.tenant.slug} ({'primary' if self.is_primary else self.domain_type})"


class TenantApiToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='api_tokens')
    name = models.CharField(max_length=100)
    token = models.CharField(max_length=255, unique=True)
    permissions = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.tenant.slug}"


class CompanySetting(models.Model):
    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='settings')
    
    # 1. Company Profile & Invoicing
    company_name = models.CharField(max_length=200, default='ISP Billing')
    tagline = models.CharField(max_length=255, blank=True, default='Ultra Fast Optical Fiber Broadband')
    client_name = models.CharField(max_length=150, default='fardin', blank=True, help_text="SaaS Client / Owner Name")
    client_date_of_birth = models.DateField(null=True, blank=True, default='2003-01-01')
    payment_tutorial_video = models.URLField(blank=True, default='https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    currency_symbol = models.CharField(max_length=10, default='৳')
    currency_code = models.CharField(max_length=10, default='BDT')
    invoice_prefix = models.CharField(max_length=20, default='SHB-INV-')
    customer_id_prefix = models.CharField(max_length=20, default='SHB-')
    support_phone = models.CharField(max_length=50, blank=True, default='+880 1234-567890')
    support_email = models.EmailField(blank=True, default='billing@isp.com')
    website = models.URLField(blank=True, default='https://shebafi.net')
    address = models.TextField(blank=True, default='Your ISP Corporate Office Address')
    tax_number = models.CharField(max_length=50, blank=True, default='BIN-123456789')
    billing_footer_note = models.TextField(blank=True, default='Thank you for choosing Sheba Fi. Pay online via bKash or Nagad.')
    logo_url = models.CharField(max_length=255, blank=True)
    favicon_url = models.CharField(max_length=255, blank=True)
    
    # 2. UI & Theme Customization
    theme_mode = models.CharField(max_length=20, default='dark', choices=[
        ('dark', 'Dark Glassmorphic (Default)'),
        ('light', 'Clean Light Mode'),
        ('system', 'System Default'),
        ('midnight', 'Midnight Deep Blue'),
        ('cyberpunk', 'Cyber Neon'),
    ])
    accent_color = models.CharField(max_length=20, default='indigo', choices=[
        ('indigo', 'Electric Indigo'),
        ('emerald', 'Cyber Emerald'),
        ('violet', 'Ultra Violet'),
        ('cyan', 'Neon Cyan'),
        ('amber', 'Golden Amber'),
        ('rose', 'Vibrant Rose'),
    ])
    compact_mode = models.BooleanField(default=False)
    live_traffic_interval_sec = models.PositiveIntegerField(default=2)
    
    # 3. Billing & Expiry Rules
    auto_lock_on_expiry = models.BooleanField(default=True)
    grace_period_days = models.PositiveIntegerField(default=2)
    promise_max_days = models.PositiveIntegerField(default=5)
    auto_generate_monthly_invoice = models.BooleanField(default=True)
    undo_recharge_deduct_hours = models.PositiveIntegerField(default=2, help_text="Hours before 1 day cost deduction on recharge undo")
    admin_expire_time = models.CharField(max_length=20, default='23:59', help_text="Time of day when direct active clients disabling executed")
    recharge_discount_enabled = models.BooleanField(default=True, help_text="Enable discount fields for Manual/Bulk Recharge")
    show_reseller_profile_speed = models.BooleanField(default=True, help_text="Show Profile / Speed in Reseller My Rates Panel")
    
    # 4. SMS Gateway, Placeholders & Templates
    sms_enabled = models.BooleanField(default=True)
    sms_sender_id = models.CharField(max_length=50, blank=True, default='SHEBAFI')
    sms_provider = models.CharField(max_length=50, default='Custom URL Gateway', choices=[
        ('Custom URL Gateway', 'Custom URL Gateway'),
        ('Greenweb', 'Greenweb Bangladesh API'),
        ('BulkSMSBD', 'BulkSMS BD HTTP Gateway'),
        ('Onnorokom', 'Onnorokom SMS Gateway'),
        ('Twilio', 'Twilio Cloud SMS'),
    ])
    sms_api_key = models.CharField(max_length=255, blank=True, default='gw_live_sample_key_987654')
    sms_gateway_url = models.CharField(
        max_length=500,
        blank=True,
        default='https://api.provider.com/send?key={KEY}&sender={SENDER}&msg={MSG}&to={NUMBER}',
        help_text='Use placeholders: {KEY}, {SENDER}, {MSG}, {NUMBER}'
    )
    sms_reminder_days = models.PositiveIntegerField(default=3)
    send_sms_on_payment = models.BooleanField(default=True)
    send_sms_on_expiry = models.BooleanField(default=True)
    
    # SMS Templates (Shortcodes: [NAME], [ID], [PASS], [AMOUNT], [DAYS], [DATE])
    welcome_sms_template = models.TextField(
        default='Welcome [NAME]! Your [ID] is active. Password: [PASS].'
    )
    payment_sms_template = models.TextField(
        default='Dear [NAME], we have received [AMOUNT]৳ for ID [ID].'
    )
    advance_loan_sms_template = models.TextField(
        default='Dear [NAME], [DAYS] days credit added to ID [ID].'
    )
    reminder_27d_template = models.TextField(
        default='Dear [NAME], your bill ID [ID] is due in 3 days.'
    )
    reminder_27d_time = models.CharField(max_length=20, default='12:00 AM')
    expiry_reminder_template = models.TextField(
        default='Dear [NAME], your service ID [ID] expires today.'
    )
    expiry_reminder_time = models.CharField(max_length=20, default='12:00 AM')
    
    # 5. MikroTik & Network Defaults
    mikrotik_default_port = models.PositiveIntegerField(default=8728)
    mikrotik_timeout_sec = models.PositiveIntegerField(default=5)
    mikrotik_auto_kick_on_expire = models.BooleanField(default=True)
    default_dns_primary = models.GenericIPAddressField(default='8.8.8.8')
    default_dns_secondary = models.GenericIPAddressField(default='1.1.1.1')
    
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings for {self.company_name} ({self.tenant.slug})"


class AuditLog(models.Model):
    """Structured audit trail (Plan Phase 33)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='audit_logs', null=True, blank=True
    )
    actor_username = models.CharField(max_length=150, default='system')
    action = models.CharField(max_length=100)  # e.g. 'recharge', 'login', 'update'
    module = models.CharField(max_length=100)  # e.g. 'customers', 'payments'
    # Phase 33 additions
    resource_type = models.CharField(max_length=100, blank=True)  # e.g. 'Customer'
    resource_id = models.CharField(max_length=100, blank=True)    # UUID or PK
    request_id = models.CharField(max_length=64, blank=True)      # X-Request-ID
    user_agent = models.TextField(blank=True)
    before = models.JSONField(default=dict, blank=True)            # state before change
    after = models.JSONField(default=dict, blank=True)             # state after change
    # Legacy fields kept
    target_id = models.CharField(max_length=100, blank=True)      # alias for resource_id
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['tenant', 'timestamp'], name='audit_tenant_ts_idx'),
            models.Index(fields=['tenant', 'module', 'action'], name='audit_tenant_module_idx'),
        ]

    def __str__(self):
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M')}] {self.actor_username}: {self.action} on {self.module}"


class TenantOnboardingRequest(models.Model):
    """Pending queue for new ISP tenant onboarding / signup requests."""
    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('approved', 'Approved & Deployed'),
        ('rejected', 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization_name = models.CharField(max_length=150)
    requested_slug = models.SlugField(max_length=100)
    requested_domain = models.CharField(max_length=255, blank=True)
    contact_name = models.CharField(max_length=120)
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=30)
    address = models.TextField(blank=True)
    requested_plan = models.CharField(max_length=50, default='Growth')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    admin_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Request: {self.organization_name} ({self.status})"


class SaaSPackage(models.Model):
    """SaaS Software Subscription Tiers & Pricing managed by Platform Owner."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=15000.00)
    yearly_price = models.DecimalField(max_digits=10, decimal_places=2, default=150000.00)
    max_subscribers = models.PositiveIntegerField(default=2500)
    max_routers = models.PositiveIntegerField(default=10)
    max_custom_domains = models.PositiveIntegerField(default=3)
    features = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True, help_text="Pause or resume this package for new subscriptions")
    is_public = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['monthly_price']

    def __str__(self):
        return f"{self.name} (৳{self.monthly_price}/mo - {'Active' if self.is_active else 'Paused'})"


class TenantSubscription(models.Model):
    """Active software licensing contracts per tenant."""
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('trial', 'Trial'),
        ('past_due', 'Past Due'),
        ('paused', 'Paused / Suspended'),
        ('cancelled', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='subscriptions')
    package = models.ForeignKey(SaaSPackage, on_delete=models.SET_NULL, null=True, related_name='tenant_subscriptions')
    billing_cycle = models.CharField(max_length=20, default='monthly', choices=[('monthly', 'Monthly'), ('yearly', 'Yearly')])
    price = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    start_date = models.DateField(default=timezone.now)
    end_date = models.DateField(null=True, blank=True)
    next_billing_date = models.DateField(null=True, blank=True)
    auto_renew = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.tenant.name} - {self.package.name if self.package else 'Custom'} ({self.status})"


class SaaSPayment(models.Model):
    """Platform revenue transactions collected from tenants for software licenses."""
    STATUS_CHOICES = [
        ('Completed', 'Completed'),
        ('Pending', 'Pending Verification'),
        ('Failed', 'Failed'),
        ('Refunded', 'Refunded'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='saas_payments')
    subscription = models.ForeignKey(TenantSubscription, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=50, default='bKash', choices=[
        ('bKash', 'bKash Merchant'),
        ('Nagad', 'Nagad Pay'),
        ('Bank Transfer', 'Direct Bank Wire'),
        ('Manual Cash', 'Cash Collection / Cheque'),
        ('Stripe', 'Stripe Card'),
    ])
    trx_id = models.CharField(max_length=100, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Completed')
    notes = models.TextField(blank=True)
    paid_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-paid_at']

    def __str__(self):
        return f"৳{self.amount} from {self.tenant.name} ({self.trx_id})"


class DatabaseBackup(models.Model):
    """Global disaster recovery snapshots & single-tenant backup archives."""
    BACKUP_TYPES = [
        ('full_database', 'Full Database Snapshot'),
        ('tenant_data', 'Single-Tenant JSON Export'),
        ('system_snapshot', 'Core System State'),
    ]
    STATUS_CHOICES = [
        ('completed', 'Completed'),
        ('in_progress', 'In Progress'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    backup_name = models.CharField(max_length=200)
    filename = models.CharField(max_length=255)
    file_size_bytes = models.BigIntegerField(default=0)
    backup_type = models.CharField(max_length=30, choices=BACKUP_TYPES, default='full_database')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='completed')
    storage_path = models.CharField(max_length=500)
    tenant = models.ForeignKey(Tenant, on_delete=models.SET_NULL, null=True, blank=True, related_name='backups', help_text="Null for global system backups")
    triggered_by = models.CharField(max_length=150, default='super_admin')
    checksum = models.CharField(max_length=64, blank=True, help_text="SHA-256 Checksum")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.backup_name} ({self.filename}) - {self.status}"


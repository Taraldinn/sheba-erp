import uuid
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from apps.core.models import Tenant
from apps.customers.models import Customer
from apps.core.fields import EncryptedCharField


class CallLog(models.Model):
    class CallType(models.TextChoices):
        INBOUND = 'Inbound', 'Inbound Support'
        OUTBOUND = 'Outbound', 'Outbound Follow-up'
        BROADCAST = 'Broadcast', 'Voice Broadcast / Reminder'
        MANUAL = 'Manual', 'Manual Click-to-Call'
        WEBSIP = 'WebSIP', 'WebSIP Browser Softphone'

    class CallStatus(models.TextChoices):
        ANSWERED = 'Answered', 'Answered / Completed'
        MISSED = 'Missed', 'Missed Call'
        BUSY = 'Busy', 'Line Busy'
        FAILED = 'Failed', 'Failed'
        # Statuses used by legacy call_center_controller.php (mapped to ANSWERED):
        WEBSIP = 'WebSIP', 'Browser WebSIP'
        INTERESTED = 'Interested', 'Interested'
        NOT_INTERESTED = 'Not Interested', 'Not Interested'
        CALL_BACK_LATER = 'Call Back Later', 'Call Back Later'
        COMPLAINT_SOLVED = 'Complaint Solved', 'Complaint Solved'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='call_logs')
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name='call_logs')
    caller_number = models.CharField(max_length=50)
    agent = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='handled_calls')
    # Phase 23: additional legacy call-center fields used by the click-to-call
    # endpoint and the customer timeline. Kept nullable so existing rows keep
    # working.
    customer_name = models.CharField(max_length=150, blank=True, default='')
    staff_name = models.CharField(max_length=150, blank=True, default='')
    ip_phone_extension = models.CharField(max_length=20, blank=True, default='')
    call_type = models.CharField(max_length=20, choices=CallType.choices, default=CallType.MANUAL)
    duration_seconds = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=CallStatus.choices, default=CallStatus.ANSWERED)
    recording_url = models.URLField(blank=True, null=True)
    api_response = models.TextField(blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True)
    # Phase 23: separate start/end timestamps so legacy dashboard queries can
    # still sort/filter by call time (created_at is just the row insert).
    call_start_time = models.DateTimeField(null=True, blank=True, db_index=True)
    call_end_time = models.DateTimeField(null=True, blank=True)
    next_followup_date = models.DateTimeField(null=True, blank=True)
    is_sip_client = models.BooleanField(
        default=False,
        help_text='True when the call was placed via a WebSIP browser softphone.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-call_start_time', '-created_at']

    def __str__(self):
        return f"{self.call_type} from {self.caller_number} ({self.duration_seconds}s)"


class VoiceSetting(models.Model):
    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='voice_setting')
    is_enabled = models.BooleanField(default=False)
    api_bearer_token = models.CharField(max_length=255, default='awaj_xxxxxxxxxxxxxxxxxxxxxxxx')
    caller_sender_id = models.CharField(max_length=50, blank=True, default='+8809612000000')
    voice_file_name = models.CharField(max_length=100, blank=True, default='my_reminder_voice')
    
    # Expiry Call Schedule
    enable_expiry_reminder = models.BooleanField(default=True)
    call_when = models.CharField(max_length=50, default='On Expiry Date')
    call_time = models.CharField(max_length=20, default='10:00 AM')
    
    # Retry Settings
    retry_unanswered = models.BooleanField(default=False)
    max_attempts = models.CharField(max_length=50, default='1 Attempt (No Retry)')
    retry_delay = models.CharField(max_length=50, default='1 Hour')
    
    # Safe Calling Hours
    safe_hours_start = models.CharField(max_length=20, default='09:00 AM')
    safe_hours_end = models.CharField(max_length=20, default='08:00 PM')
    
    # Live stats / balance
    account_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    calls_today = models.PositiveIntegerField(default=0)
    answered_count = models.PositiveIntegerField(default=0)
    unanswered_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    rejected_count = models.PositiveIntegerField(default=0)
    pending_count = models.PositiveIntegerField(default=0)
    
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Voice Config for {self.tenant.name} (Balance: ৳{self.account_balance})"


class VoiceTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='voice_templates')
    voice_name = models.CharField(max_length=100)
    audio_file_url = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=30, default='Approved', choices=[
        ('Approved', 'Approved'),
        ('Pending', 'Pending Review'),
        ('Rejected', 'Rejected'),
    ])
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.voice_name} ({self.status})"


class MikoPBXConfig(models.Model):
    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='mikopbx_config')
    is_enabled = models.BooleanField(default=False)
    pbx_url = models.URLField(blank=True, null=True, help_text="MikoPBX HTTPS URL")
    pbx_did = models.CharField(max_length=50, blank=True, help_text="Tenant's assigned DID")
    api_key = EncryptedCharField(max_length=255, blank=True, help_text="Read-only MikoPBX API key with cdr:read")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"MikoPBX Config for {self.tenant.name}"


class AgentPBXMapping(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='pbx_agent_mappings')
    agent = models.OneToOneField(User, on_delete=models.CASCADE, related_name='pbx_mapping')
    extension = models.CharField(max_length=20, help_text="PBX extension (e.g. 101)")

    def __str__(self):
        return f"{self.agent.username} -> {self.extension}"


# ─────────────────────────────────────────────────────────────────────────────
# Phase 23: legacy Call-Center controller (call_center_controller.php) tables
# ─────────────────────────────────────────────────────────────────────────────


class ReminderTemplate(models.Model):
    """
    Voice reminder template, ported from the ``voice_templates`` PHP table.
    Transcribed text plus an optional uploaded audio file (mp3 / wav / ogg).
    The transcript supports legacy placeholders ``[NAME] [ID] [AMOUNT] [DATE]
    [PACKAGE]`` which the broadcaster substitutes before sending.

    Note: this is intentionally a separate model from the existing
    ``VoiceTemplate`` (which tracks vendor-approved voice clones).
    """
    class VoiceType(models.TextChoices):
        DUE_BILL = 'Due bill reminder', 'Due bill reminder'
        EXPIRY = 'Expiry notice', 'Expiry notice'
        WELCOME = 'Welcome', 'Welcome message'
        COMPLAINT = 'Complaint update', 'Complaint update'
        CUSTOM = 'Custom', 'Custom broadcast'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='voice_templates_v2')
    staff = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='voice_templates',
                              help_text='Owning staff (legacy PHP staff_id column).')
    name = models.CharField(max_length=150)
    type = models.CharField(max_length=40, choices=VoiceType.choices, default=VoiceType.DUE_BILL)
    message_text = models.TextField(help_text='Transcript; supports [NAME] [ID] [AMOUNT] [DATE] [PACKAGE].')
    audio_file = models.FileField(upload_to='voice_templates/', null=True, blank=True)
    language = models.CharField(max_length=40, default='Bangla')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.type})'


class IPPhoneConfig(models.Model):
    """
    Per-staff IP-Phone API credentials, ported from the ``ip_phone_configs``
    PHP table. The token is stored encrypted via Django's
    ``EncryptedCharField`` so plain DB dumps don't leak credentials.
    """
    class Driver(models.TextChoices):
        FLEMSOFT = 'flemsoft', 'Flemsoft Voice API'
        GENERIC_REST = 'generic_rest', 'Generic REST'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='ip_phone_configs')
    staff = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ip_phone_configs')
    driver = models.CharField(max_length=30, choices=Driver.choices, default=Driver.GENERIC_REST)
    base_url = models.URLField()
    username = models.CharField(max_length=100)
    password_token_enc = models.CharField(max_length=512, blank=True, default='')
    caller_id = models.CharField(max_length=30, blank=True, default='')
    extension = models.CharField(max_length=20, blank=True, default='')
    enabled = models.BooleanField(default=True)
    test_mode = models.BooleanField(
        default=False,
        help_text='When true, click-to-call logs without dialling. Mirrors PHP test_mode.',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'staff'],
                name='ip_phone_config_tenant_staff_uniq',
            ),
        ]

    def __str__(self):
        return f'{self.driver} @ {self.username} ({"on" if self.enabled else "off"})'


class IPPhoneNumber(models.Model):
    """
    Direct-SIP IP phone numbers, ported from the ``ip_phone_numbers`` PHP
    table. Password is stored encrypted; the legacy ``wss_uri`` column is
    retained for WebSIP clients.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='ip_phone_numbers')
    staff = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ip_phone_numbers')
    ip_number = models.CharField(max_length=50)
    password_enc = models.CharField(max_length=512, blank=True, default='')
    sip_server = models.CharField(max_length=255)
    port = models.PositiveIntegerField(default=5060)
    wss_uri = models.CharField(max_length=255, blank=True, default='')
    is_main = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['is_main', 'ip_number']

    def __str__(self):
        return f'{self.ip_number}@{self.sip_server}:{self.port}{" (main)" if self.is_main else ""}'


class CustomerFollowup(models.Model):
    """
    Customer follow-up notes / actions, ported from the ``customer_followups``
    PHP table. Mirrors the legacy ``type`` and ``status`` enumerations.
    """
    class FollowupType(models.TextChoices):
        BILLING = 'Billing', 'Billing'
        COMPLAINT = 'Complaint', 'Complaint'
        SALES = 'Sales', 'Sales'
        TECHNICAL = 'Technical', 'Technical'
        OTHER = 'Other', 'Other'

    class FollowupStatus(models.TextChoices):
        PENDING = 'Pending', 'Pending'
        DONE = 'Done', 'Done'
        CALL_BACK_LATER = 'Call Back Later', 'Call Back Later'
        INTERESTED = 'Interested', 'Interested'
        NOT_INTERESTED = 'Not Interested', 'Not Interested'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='customer_followups')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='followups')
    staff = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='followups')
    note = models.TextField()
    followup_date = models.DateTimeField()
    type = models.CharField(max_length=20, choices=FollowupType.choices, default=FollowupType.BILLING)
    status = models.CharField(max_length=20, choices=FollowupStatus.choices, default=FollowupStatus.PENDING)
    call_log = models.ForeignKey(CallLog, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name='followups')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-followup_date']

    def __str__(self):
        return f'Followup({self.customer_id}) {self.type} {self.status}'


class VoiceCampaign(models.Model):
    """
    Voice SMS / Campaign, ported from the ``voice_sms_queue`` PHP table.
    Each campaign has many ``VoiceCampaignItem`` rows — one per target
    customer — carrying the substituted message and the per-item delivery
    status.
    """
    class Target(models.TextChoices):
        EXPIRED = 'expired', 'Expired packages'
        DUE = 'due', 'Customers with positive due'
        ALL = 'all', 'All active customers'

    class CampaignStatus(models.TextChoices):
        QUEUED = 'Queued', 'Queued'
        RUNNING = 'Running', 'Running'
        COMPLETED = 'Completed', 'Completed'
        FAILED = 'Failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='voice_campaigns')
    staff = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='voice_campaigns')
    name = models.CharField(max_length=200)
    template = models.ForeignKey(ReminderTemplate, on_delete=models.PROTECT, related_name='campaigns')
    target = models.CharField(max_length=20, choices=Target.choices, default=Target.EXPIRED)
    scheduled_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=20, choices=CampaignStatus.choices,
                              default=CampaignStatus.QUEUED)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.target})'

    @property
    def queued_count(self) -> int:
        return self.items.count()


class VoiceCampaignItem(models.Model):
    class Status(models.TextChoices):
        QUEUED = 'Queued', 'Queued'
        SENT = 'Sent', 'Sent'
        FAILED = 'Failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    campaign = models.ForeignKey(VoiceCampaign, on_delete=models.CASCADE, related_name='items')
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True)
    phone = models.CharField(max_length=30)
    body_text = models.TextField()
    audio_file = models.CharField(max_length=255, blank=True, default='',
                                  help_text='Resolved audio path (or empty for TTS).')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    error_message = models.TextField(blank=True, default='')
    attempts = models.PositiveSmallIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['campaign', 'status'], name='vcamp_status_idx'),
        ]

    def __str__(self):
        return f'CampaignItem({self.phone}) {self.status}'

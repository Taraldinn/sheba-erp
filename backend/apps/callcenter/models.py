import uuid
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from apps.core.models import Tenant
from apps.customers.models import Customer


class CallLog(models.Model):
    class CallType(models.TextChoices):
        INBOUND = 'Inbound', 'Inbound Support'
        OUTBOUND = 'Outbound', 'Outbound Follow-up'
        BROADCAST = 'Broadcast', 'Voice Broadcast / Reminder'

    class CallStatus(models.TextChoices):
        ANSWERED = 'Answered', 'Answered / Completed'
        MISSED = 'Missed', 'Missed Call'
        BUSY = 'Busy', 'Line Busy'
        FAILED = 'Failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='call_logs')
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name='call_logs')
    caller_number = models.CharField(max_length=50)
    agent = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='handled_calls')
    call_type = models.CharField(max_length=20, choices=CallType.choices, default=CallType.INBOUND)
    duration_seconds = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=CallStatus.choices, default=CallStatus.ANSWERED)
    recording_url = models.URLField(blank=True, null=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

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

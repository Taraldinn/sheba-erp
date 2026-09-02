import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import Tenant
from apps.customers.models import Customer


class GatewayProvider(models.TextChoices):
    BKASH = 'BKASH', 'bKash Merchant'
    NAGAD = 'NAGAD', 'Nagad'
    ROCKET = 'ROCKET', 'Rocket (DBBL)'
    UPAY = 'UPAY', 'Upay'
    SSLCOMMERZ = 'SSLCOMMERZ', 'SSLCommerz'
    PIPRAPAY = 'PIPRAPAY', 'PipraPay'
    SMS_WEBHOOK = 'SMS_WEBHOOK', 'SMS Automated Hook'
    MANUAL = 'MANUAL', 'Cash / Manual Bank'


class TransactionStatus(models.TextChoices):
    PENDING = 'Pending', 'Pending'
    SUCCESS = 'Success', 'Success / Paid'
    FAILED = 'Failed', 'Failed'
    MATCHED = 'Matched', 'Matched & Credited'
    REFUNDED = 'Refunded', 'Refunded'


class PaymentGateway(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='payment_gateways')
    provider = models.CharField(max_length=50, choices=GatewayProvider.choices, default=GatewayProvider.BKASH)
    title = models.CharField(max_length=100, default='bKash Payment')
    is_active = models.BooleanField(default=True)
    is_sandbox = models.BooleanField(default=False)
    
    # bKash specific
    shop_payment_enabled = models.BooleanField(default=False)
    shop_base_url = models.CharField(max_length=255, blank=True, default='https://shop.bkash.com/merchant')
    app_key = models.CharField(max_length=255, blank=True)
    app_secret = models.CharField(max_length=255, blank=True)
    username = models.CharField(max_length=100, blank=True)
    password = models.CharField(max_length=255, blank=True)
    
    # Sandbox credentials
    sandbox_app_key = models.CharField(max_length=255, blank=True)
    sandbox_app_secret = models.CharField(max_length=255, blank=True)
    sandbox_username = models.CharField(max_length=100, blank=True)
    sandbox_password = models.CharField(max_length=255, blank=True)
    
    # Nagad specific
    merchant_number = models.CharField(max_length=50, blank=True)
    merchant_phone = models.CharField(max_length=50, blank=True)
    public_key = models.TextField(blank=True)
    private_key = models.TextField(blank=True)
    
    # SSLCommerz specific
    store_id = models.CharField(max_length=100, blank=True)
    store_password = models.CharField(max_length=255, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_provider_display()} ({'Sandbox' if self.is_sandbox else 'Live'})"


class SmsLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='sms_logs')
    sender = models.CharField(max_length=50)
    raw_message = models.TextField()
    parsed_provider = models.CharField(max_length=50, blank=True)
    parsed_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    parsed_trx_id = models.CharField(max_length=100, blank=True, db_index=True)
    parsed_account = models.CharField(max_length=50, blank=True)
    is_matched = models.BooleanField(default=False)
    matched_customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name='matched_sms')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"SMS from {self.sender}: Trx {self.parsed_trx_id} (৳{self.parsed_amount}) - {'Matched' if self.is_matched else 'Unmatched'}"


class PaymentTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='transactions')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='payments')
    gateway = models.ForeignKey(PaymentGateway, on_delete=models.SET_NULL, null=True, blank=True)
    sms_log = models.ForeignKey(SmsLog, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    trx_id = models.CharField(max_length=100, unique=True, db_index=True)
    payment_method = models.CharField(max_length=50, default='bKash')
    status = models.CharField(max_length=30, choices=TransactionStatus.choices, default=TransactionStatus.SUCCESS)
    customer_account = models.CharField(max_length=50, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'created_at'], name='tx_tenant_created_idx'),
            models.Index(fields=['customer', 'created_at'], name='tx_customer_created_idx'),
            models.Index(fields=['tenant', 'status'], name='tx_tenant_status_idx'),
        ]

    def __str__(self):
        return f"{self.payment_method} ৳{self.amount} - Trx: {self.trx_id} ({self.status})"


# ─────────────────────────────────────────────────────────────────────────────
# PaymentAttempt — state machine (Plan Phase F / 11)
# ─────────────────────────────────────────────────────────────────────────────

class PaymentAttemptStatus(models.TextChoices):
    INITIATED   = 'INITIATED',   'Initiated'
    PENDING     = 'PENDING',     'Pending confirmation'
    SUCCESS     = 'SUCCESS',     'Confirmed success'
    FAILED      = 'FAILED',      'Failed'
    CANCELLED   = 'CANCELLED',   'Cancelled'
    REFUNDED    = 'REFUNDED',    'Refunded'
    RECONCILED  = 'RECONCILED',  'Reconciled'


class PaymentAttempt(models.Model):
    """Tracks each payment initiation with full state machine."""
    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant              = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='payment_attempts')
    customer            = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='payment_attempts')
    gateway             = models.ForeignKey(PaymentGateway, on_delete=models.SET_NULL, null=True, blank=True)
    amount              = models.DecimalField(max_digits=12, decimal_places=2)
    currency            = models.CharField(max_length=10, default='BDT')
    provider            = models.CharField(max_length=50, choices=GatewayProvider.choices, default=GatewayProvider.BKASH)
    status              = models.CharField(max_length=20, choices=PaymentAttemptStatus.choices, default=PaymentAttemptStatus.INITIATED)
    idempotency_key     = models.CharField(max_length=255, blank=True, db_index=True)
    provider_reference  = models.CharField(max_length=200, blank=True)
    transaction         = models.OneToOneField(PaymentTransaction, on_delete=models.SET_NULL, null=True, blank=True, related_name='attempt')
    raw_request         = models.JSONField(default=dict, blank=True)
    raw_response        = models.JSONField(default=dict, blank=True)
    failure_reason      = models.TextField(blank=True)
    initiated_at        = models.DateTimeField(auto_now_add=True)
    completed_at        = models.DateTimeField(null=True, blank=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-initiated_at']
        indexes = [
            models.Index(fields=['tenant', 'status'],                    name='pattempt_tenant_status_idx'),
            models.Index(fields=['tenant', 'customer', 'initiated_at'],  name='pattempt_tenant_cust_ts_idx'),
            models.Index(fields=['idempotency_key'],                     name='pattempt_idem_idx'),
        ]

    def __str__(self):
        return f"Attempt ৳{self.amount} [{self.provider}] → {self.status}"


# ─────────────────────────────────────────────────────────────────────────────
# InboundPaymentEvent — async pipeline replacing direct SMS webhook (Plan Phase F / 12)
# ─────────────────────────────────────────────────────────────────────────────

class InboundPaymentEvent(models.Model):
    """
    Stores incoming payment notifications for async processing.
    Flow: receive → store → Celery process_payment_event() → match → recharge
    """

    class EventStatus(models.TextChoices):
        RECEIVED   = 'RECEIVED',   'Received'
        PROCESSING = 'PROCESSING', 'Processing'
        MATCHED    = 'MATCHED',    'Matched'
        UNMATCHED  = 'UNMATCHED',  'Unmatched (needs review)'
        DUPLICATE  = 'DUPLICATE',  'Duplicate (skipped)'
        FAILED     = 'FAILED',     'Failed'

    class EventSource(models.TextChoices):
        SMS     = 'SMS',     'SMS forwarding'
        WEBHOOK = 'WEBHOOK', 'Provider webhook'
        MANUAL  = 'MANUAL',  'Manual entry'
        API     = 'API',     'API push'

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant              = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='inbound_payment_events')
    source              = models.CharField(max_length=20, choices=EventSource.choices, default=EventSource.SMS)
    raw_payload         = models.TextField()
    provider            = models.CharField(max_length=50, blank=True)
    amount              = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    trx_id              = models.CharField(max_length=100, blank=True, db_index=True)
    sender_account      = models.CharField(max_length=100, blank=True)
    status              = models.CharField(max_length=20, choices=EventStatus.choices, default=EventStatus.RECEIVED)
    matched_customer    = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name='inbound_events')
    matched_transaction = models.ForeignKey(PaymentTransaction, on_delete=models.SET_NULL, null=True, blank=True, related_name='inbound_event')
    sms_log             = models.ForeignKey(SmsLog, on_delete=models.SET_NULL, null=True, blank=True, related_name='event')
    processing_error    = models.TextField(blank=True)
    received_at         = models.DateTimeField(auto_now_add=True)
    processed_at        = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-received_at']
        indexes = [
            models.Index(fields=['tenant', 'status'],      name='inevent_tenant_status_idx'),
            models.Index(fields=['tenant', 'trx_id'],      name='inevent_tenant_trx_idx'),
            models.Index(fields=['tenant', 'received_at'], name='inevent_tenant_ts_idx'),
        ]

    def __str__(self):
        return f"InboundEvent[{self.source}] ৳{self.amount} trx={self.trx_id} → {self.status}"

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


class PaymentTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='transactions')
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='payments')
    gateway = models.ForeignKey(PaymentGateway, on_delete=models.SET_NULL, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    trx_id = models.CharField(max_length=100, unique=True, db_index=True)
    payment_method = models.CharField(max_length=50, default='bKash')
    status = models.CharField(max_length=30, choices=TransactionStatus.choices, default=TransactionStatus.SUCCESS)
    customer_account = models.CharField(max_length=50, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.payment_method} ৳{self.amount} - Trx: {self.trx_id} ({self.status})"


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

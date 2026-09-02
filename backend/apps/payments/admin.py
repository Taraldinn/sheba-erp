from django.contrib import admin
from .models import PaymentGateway, PaymentTransaction, SmsLog


@admin.register(PaymentGateway)
class PaymentGatewayAdmin(admin.ModelAdmin):
    list_display = ('title', 'provider', 'is_active', 'is_sandbox', 'shop_payment_enabled', 'merchant_number', 'tenant', 'created_at')
    list_filter = ('provider', 'is_active', 'is_sandbox', 'shop_payment_enabled', 'tenant', 'created_at')
    search_fields = ('title', 'username', 'merchant_number', 'store_id')
    readonly_fields = ('id', 'created_at')

    fieldsets = (
        ('General Gateway Info', {
            'fields': ('id', 'tenant', 'provider', 'title', 'is_active', 'is_sandbox')
        }),
        ('bKash Configuration', {
            'fields': (
                'shop_payment_enabled', 'shop_base_url',
                'app_key', 'app_secret', 'username', 'password',
                'sandbox_app_key', 'sandbox_app_secret', 'sandbox_username', 'sandbox_password'
            )
        }),
        ('Nagad Configuration', {
            'fields': ('merchant_number', 'merchant_phone', 'public_key', 'private_key')
        }),
        ('SSLCommerz Configuration', {
            'fields': ('store_id', 'store_password')
        }),
    )


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = (
        'trx_id', 'customer', 'amount', 'payment_method', 
        'status', 'customer_account', 'gateway', 'tenant', 'created_at'
    )
    list_filter = ('payment_method', 'status', 'gateway', 'tenant', 'created_at')
    search_fields = ('trx_id', 'customer__full_name', 'customer__pppoe_username', 'customer_account')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'created_at'


@admin.register(SmsLog)
class SmsLogAdmin(admin.ModelAdmin):
    list_display = ('sender', 'parsed_trx_id', 'parsed_amount', 'parsed_provider', 'is_matched', 'matched_customer', 'tenant', 'created_at')
    list_filter = ('is_matched', 'parsed_provider', 'sender', 'tenant', 'created_at')
    search_fields = ('sender', 'parsed_trx_id', 'parsed_account', 'raw_message')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'created_at'

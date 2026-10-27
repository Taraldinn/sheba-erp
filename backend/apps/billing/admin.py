from django.contrib import admin
from .models import Package, ResellerPricing, Invoice, Recharge, Offer


class ResellerPricingInline(admin.TabularInline):
    model = ResellerPricing
    extra = 1


@admin.register(Package)
class PackageAdmin(admin.ModelAdmin):
    list_display = ('name', 'speed_mbps', 'upload_speed_mbps', 'validity_days', 'regular_price', 'min_reseller_price', 'is_active', 'tenant')
    list_filter = ('is_active', 'validity_days', 'tenant', 'created_at')
    search_fields = ('name', 'mikrotik_profile', 'description')
    ordering = ('regular_price',)
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = [ResellerPricingInline]


@admin.register(ResellerPricing)
class ResellerPricingAdmin(admin.ModelAdmin):
    list_display = ('reseller', 'package', 'custom_price', 'tenant', 'created_at')
    list_filter = ('package', 'tenant', 'created_at')
    search_fields = ('reseller__user__username', 'package__name')
    readonly_fields = ('id', 'created_at')


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        'invoice_no', 'customer', 'billing_month', 'package_name', 
        'total_payable', 'paid_amount', 'due_amount', 'status', 
        'due_date', 'tenant', 'created_at'
    )
    list_filter = ('status', 'billing_month', 'tenant', 'created_at')
    search_fields = ('invoice_no', 'customer__full_name', 'customer__pppoe_username', 'customer__mobile', 'package_name')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'created_at'


@admin.register(Recharge)
class RechargeAdmin(admin.ModelAdmin):
    list_display = (
        'customer', 'package', 'amount', 'discount', 
        'validity_days', 'new_expiry', 'payment_method', 
        'trx_id', 'processed_by', 'is_reversed', 'tenant', 'created_at'
    )
    list_filter = ('payment_method', 'is_reversed', 'package', 'tenant', 'created_at')
    search_fields = ('customer__full_name', 'customer__pppoe_username', 'trx_id', 'notes')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'created_at'


@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display = ('name', 'buy_days', 'free_days', 'discount_amount', 'valid_until', 'is_active', 'tenant', 'created_at')
    list_filter = ('is_active', 'tenant', 'created_at')
    search_fields = ('name', 'description')
    readonly_fields = ('id', 'created_at')

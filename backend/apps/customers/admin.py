from django.contrib import admin
from django.utils.safestring import mark_safe
from .models import Customer, CustomerStatus
from apps.network.models import UserSession
from apps.core.models import AuditLog


@admin.action(description="🟢 Turn ON Internet (Activate Service)")
def turn_on_internet(modeladmin, request, queryset):
    count = 0
    for customer in queryset:
        customer.status = CustomerStatus.ACTIVE
        customer.save(update_fields=['status', 'updated_at'])
        AuditLog.objects.create(
            tenant=customer.tenant,
            actor_username=request.user.username,
            action='INTERNET_ENABLE',
            module='CUSTOMERS',
            target_id=str(customer.id),
            details={'pppoe_username': customer.pppoe_username, 'status': 'Active'}
        )
        count += 1
    modeladmin.message_user(request, f"Successfully turned ON internet for {count} subscriber(s).")


@admin.action(description="🔴 Turn OFF Internet (Suspend / Disconnect Line)")
def turn_off_internet(modeladmin, request, queryset):
    count = 0
    for customer in queryset:
        customer.status = CustomerStatus.SUSPENDED
        customer.save(update_fields=['status', 'updated_at'])
        # Terminate active PPPoE router sessions
        UserSession.objects.filter(username=customer.pppoe_username).delete()
        AuditLog.objects.create(
            tenant=customer.tenant,
            actor_username=request.user.username,
            action='INTERNET_DISABLE',
            module='CUSTOMERS',
            target_id=str(customer.id),
            details={'pppoe_username': customer.pppoe_username, 'status': 'Suspended'}
        )
        count += 1
    modeladmin.message_user(request, f"Successfully turned OFF internet for {count} subscriber(s). Active sessions dropped.")


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        'customer_code', 'full_name', 'pppoe_username', 'mobile', 
        'package', 'monthly_bill', 'due_amount', 'internet_status_badge', 
        'expiry_date', 'area_zone', 'router', 'tenant'
    )
    list_filter = ('status', 'connection_type', 'billing_type', 'area_zone', 'package', 'router', 'tenant', 'created_at')
    search_fields = (
        'customer_code', 'full_name', 'pppoe_username', 'mobile', 
        'email', 'national_id', 'mac_address', 'onu_mac_or_sn', 'static_ip'
    )
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at', 'updated_at')
    date_hierarchy = 'created_at'
    actions = [turn_on_internet, turn_off_internet]

    @admin.display(description="Internet Status", ordering="status")
    def internet_status_badge(self, obj):
        if obj.status == CustomerStatus.ACTIVE:
            return mark_safe('<span style="background-color: #10b981; color: white; padding: 2px 8px; border-radius: 9999px; font-weight: bold; font-size: 11px;">🟢 ON (Active)</span>')
        elif obj.status == CustomerStatus.SUSPENDED:
            return mark_safe('<span style="background-color: #ef4444; color: white; padding: 2px 8px; border-radius: 9999px; font-weight: bold; font-size: 11px;">🔴 OFF (Suspended)</span>')
        elif obj.status == CustomerStatus.EXPIRED:
            return mark_safe('<span style="background-color: #f59e0b; color: white; padding: 2px 8px; border-radius: 9999px; font-weight: bold; font-size: 11px;">⏳ Expired</span>')
        else:
            return mark_safe(f'<span style="background-color: #64748b; color: white; padding: 2px 8px; border-radius: 9999px; font-weight: bold; font-size: 11px;">⚪ {obj.status}</span>')

    fieldsets = (
        ('Basic & Contact Information', {
            'fields': ('id', 'tenant', 'reseller', 'customer_code', 'full_name', 'mobile', 'email', 'national_id', 'address', 'area_zone')
        }),
        ('Network & Authentication', {
            'fields': ('connection_type', 'router', 'pppoe_username', 'pppoe_password', 'static_ip', 'mac_address', 'onu_mac_or_sn')
        }),
        ('Subscription & Billing', {
            'fields': ('package', 'billing_type', 'monthly_bill', 'due_amount', 'advance_amount', 'discount')
        }),
        ('Lifecycle & Internet Control', {
            'fields': ('status', 'auto_lock_enabled', 'bill_date', 'expiry_date', 'promise_date')
        }),
        ('Geolocation & Notes', {
            'fields': ('latitude', 'longitude', 'remarks', 'created_at', 'updated_at')
        }),
    )

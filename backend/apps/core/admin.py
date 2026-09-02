from django.contrib import admin
from .models import Tenant, TenantApiToken, CompanySetting, AuditLog


class TenantApiTokenInline(admin.TabularInline):
    model = TenantApiToken
    extra = 0
    readonly_fields = ('id', 'created_at')


class CompanySettingInline(admin.StackedInline):
    model = CompanySetting
    can_delete = False


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'domain', 'contact_phone', 'contact_email', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'slug', 'domain', 'contact_phone', 'contact_email')
    ordering = ('name',)
    readonly_fields = ('id', 'hmac_secret', 'created_at', 'updated_at')
    inlines = [CompanySettingInline, TenantApiTokenInline]


@admin.register(TenantApiToken)
class TenantApiTokenAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant', 'is_active', 'expires_at', 'created_at')
    list_filter = ('is_active', 'tenant', 'created_at')
    search_fields = ('name', 'token', 'tenant__name', 'tenant__slug')
    readonly_fields = ('id', 'created_at')


@admin.register(CompanySetting)
class CompanySettingAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'tenant', 'support_phone', 'support_email', 'sms_provider', 'theme_mode', 'accent_color', 'updated_at')
    list_filter = ('theme_mode', 'accent_color', 'sms_provider', 'sms_enabled', 'auto_lock_on_expiry')
    search_fields = ('company_name', 'tenant__name', 'support_phone', 'support_email')
    readonly_fields = ('updated_at',)

    fieldsets = (
        ('Tenant & Profile', {
            'fields': ('tenant', 'company_name', 'tagline', 'client_name', 'client_date_of_birth', 'payment_tutorial_video', 'logo_url', 'favicon_url', 'website')
        }),
        ('Invoicing & Localization', {
            'fields': ('currency_symbol', 'currency_code', 'invoice_prefix', 'customer_id_prefix', 'support_phone', 'support_email', 'address', 'tax_number', 'billing_footer_note')
        }),
        ('UI & Customization', {
            'fields': ('theme_mode', 'accent_color', 'compact_mode', 'live_traffic_interval_sec')
        }),
        ('Billing & Expiry Automation', {
            'fields': ('auto_lock_on_expiry', 'grace_period_days', 'promise_max_days', 'auto_generate_monthly_invoice', 'undo_recharge_deduct_hours', 'admin_expire_time', 'recharge_discount_enabled', 'show_reseller_profile_speed')
        }),
        ('SMS Gateway & Alerts', {
            'fields': ('sms_enabled', 'sms_provider', 'sms_sender_id', 'sms_api_key', 'sms_gateway_url', 'sms_reminder_days', 'send_sms_on_payment', 'send_sms_on_expiry')
        }),
        ('SMS Templates', {
            'fields': ('welcome_sms_template', 'payment_sms_template', 'advance_loan_sms_template', 'reminder_27d_template', 'reminder_27d_time', 'expiry_reminder_template', 'expiry_reminder_time')
        }),
        ('MikroTik Defaults', {
            'fields': ('mikrotik_default_port', 'mikrotik_timeout_sec', 'mikrotik_auto_kick_on_expire', 'default_dns_primary', 'default_dns_secondary')
        }),
    )


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'actor_username', 'action', 'module', 'target_id', 'ip_address', 'tenant')
    list_filter = ('module', 'action', 'tenant', 'timestamp')
    search_fields = ('actor_username', 'action', 'module', 'target_id', 'ip_address')
    ordering = ('-timestamp',)
    readonly_fields = ('id', 'tenant', 'actor_username', 'action', 'module', 'target_id', 'ip_address', 'details', 'timestamp')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

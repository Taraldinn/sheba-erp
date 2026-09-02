from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import StaffProfile


class StaffProfileInline(admin.StackedInline):
    model = StaffProfile
    can_delete = False
    verbose_name_plural = 'Staff Profile'
    fk_name = 'user'


class UserAdmin(BaseUserAdmin):
    inlines = (StaffProfileInline,)


# Re-register UserAdmin
try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass
admin.site.register(User, UserAdmin)


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'phone', 'tenant', 'wallet_balance', 'credit_limit', 'commission_rate', 'is_active', 'created_at')
    list_filter = ('role', 'is_active', 'tenant', 'created_at')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'user__email', 'phone', 'national_id')
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'updated_at')

from django.contrib import admin
from .models import CallLog, VoiceSetting, VoiceTemplate


@admin.register(CallLog)
class CallLogAdmin(admin.ModelAdmin):
    list_display = ('caller_number', 'customer', 'call_type', 'status', 'duration_seconds', 'agent', 'tenant', 'created_at')
    list_filter = ('call_type', 'status', 'tenant', 'created_at')
    search_fields = ('caller_number', 'customer__full_name', 'customer__pppoe_username', 'notes')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'created_at'


@admin.register(VoiceSetting)
class VoiceSettingAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'is_enabled', 'caller_sender_id', 'voice_file_name', 'account_balance', 'calls_today', 'answered_count', 'updated_at')
    list_filter = ('is_enabled', 'enable_expiry_reminder', 'retry_unanswered')
    search_fields = ('tenant__name', 'caller_sender_id')
    readonly_fields = ('updated_at',)


@admin.register(VoiceTemplate)
class VoiceTemplateAdmin(admin.ModelAdmin):
    list_display = ('voice_name', 'status', 'tenant', 'created_at')
    list_filter = ('status', 'tenant', 'created_at')
    search_fields = ('voice_name',)
    readonly_fields = ('id', 'created_at')

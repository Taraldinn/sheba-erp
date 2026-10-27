from django.contrib import admin
from .models import POPBranch, Router, OLT, ONU, UserSession


class ONUInline(admin.TabularInline):
    model = ONU
    extra = 0
    readonly_fields = ('id', 'last_sync')
    fields = ('pon_port', 'onu_index', 'mac_address', 'serial_number', 'customer_name', 'rx_power', 'status')


@admin.register(POPBranch)
class POPBranchAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'location', 'in_charge', 'contact', 'total_capacity', 'status', 'tenant', 'created_at')
    list_filter = ('status', 'tenant', 'created_at')
    search_fields = ('name', 'code', 'location', 'in_charge', 'contact')
    ordering = ('name',)
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(Router)
class RouterAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'ip_address', 'api_port', 'winbox_port', 
        'status', 'cpu_usage', 'memory_usage', 'active_pppoe_count', 
        'total_customers_count', 'is_active', 'last_ping', 'tenant'
    )
    list_filter = ('status', 'is_active', 'api_ssl', 'tenant', 'created_at')
    search_fields = ('name', 'ip_address', 'location', 'description')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(OLT)
class OLTAdmin(admin.ModelAdmin):
    list_display = ('name', 'brand', 'ip_address', 'pon_ports_count', 'total_onus', 'online_onus', 'status', 'last_sync', 'tenant')
    list_filter = ('brand', 'status', 'tenant', 'created_at')
    search_fields = ('name', 'ip_address', 'snmp_community')
    readonly_fields = ('id', 'created_at')
    inlines = [ONUInline]


@admin.register(ONU)
class ONUAdmin(admin.ModelAdmin):
    list_display = (
        'olt', 'pon_port', 'onu_index', 'customer_name', 
        'customer_phone', 'mac_address', 'serial_number', 
        'rx_power', 'tx_power', 'status', 'distance_meters', 'last_sync', 'tenant'
    )
    list_filter = ('status', 'olt', 'tenant', 'last_sync')
    search_fields = ('customer_name', 'customer_phone', 'mac_address', 'serial_number', 'pon_port')
    readonly_fields = ('id', 'last_sync')


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ('username', 'ip_address', 'mac_address', 'caller_id', 'router', 'uptime', 'bytes_in', 'bytes_out', 'connected_at', 'last_seen', 'tenant')
    list_filter = ('router', 'tenant', 'connected_at')
    search_fields = ('username', 'ip_address', 'mac_address', 'caller_id')
    readonly_fields = ('id', 'connected_at', 'last_seen')
    ordering = ('-last_seen',)

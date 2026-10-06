from decimal import Decimal
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Router, OLT, ONU, UserSession, POPBranch, TJBox, WireGuardConfig, WireGuardSubnet
from .validators import validate_router_host, validate_port


class POPBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = POPBranch
        fields = '__all__'
        read_only_fields = ('tenant',)

    def validate_upstream_router(self, router):
        if router is None:
            return router
        tenant = _tenant_from_context(self.context)
        if tenant and router.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected router does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return router


class RouterSerializer(serializers.ModelSerializer):
    expire_pool_script = serializers.SerializerMethodField()

    class Meta:
        model = Router
        fields = '__all__'
        read_only_fields = ('tenant', 'cpu_usage', 'memory_usage', 'disk_usage', 'uptime', 'last_ping')
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'radius_secret': {'write_only': True, 'required': False},
        }

    def get_expire_pool_script(self, instance) -> str:
        return instance.generate_mikrotik_expire_pool_script()

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret.pop('password', None)
        ret['has_radius_secret'] = bool(instance.radius_secret)
        return ret

    def validate_ip_address(self, value):
        validate_router_host(value)
        return value

    def validate_hostname(self, value):
        if value:
            validate_router_host(value)
        return value

    def validate_https_port(self, value):
        if value:
            validate_port(value)
        return value

    def validate_api_port(self, value):
        if value:
            validate_port(value)
        return value


class RouterExpirePoolConfigSerializer(serializers.Serializer):
    expire_pool_enabled = serializers.BooleanField(required=False)
    expire_pool_name = serializers.CharField(max_length=64, required=False)
    expire_profile_name = serializers.CharField(max_length=64, required=False)
    expire_rate_limit = serializers.CharField(max_length=30, required=False)
    expire_pool_network = serializers.CharField(max_length=100, required=False)
    expire_local_address = serializers.CharField(max_length=50, required=False)
    expire_redirect_url = serializers.CharField(max_length=255, required=False, allow_blank=True)
    expire_walled_garden = serializers.CharField(required=False, allow_blank=True)
    provision_to_router = serializers.BooleanField(default=True, required=False)


def _tenant_from_context(context):
    request = context.get('request')
    return getattr(request, 'tenant', None) if request else None


class ONUSerializer(serializers.ModelSerializer):
    olt_name = serializers.CharField(source='olt.name', read_only=True)
    customer_username = serializers.CharField(source='customer.pppoe_username', read_only=True)
    customer_full_name = serializers.CharField(source='customer.full_name', read_only=True)
    signal_status = serializers.SerializerMethodField()
    signal_quality = serializers.CharField(read_only=True)

    class Meta:
        model = ONU
        fields = '__all__'
        read_only_fields = ('tenant',)

    def validate_olt(self, olt):
        if olt is None:
            return olt
        tenant = _tenant_from_context(self.context)
        if tenant and olt.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected OLT does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return olt

    def validate_customer(self, customer):
        if customer is None:
            return customer
        tenant = _tenant_from_context(self.context)
        if tenant and customer.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected customer does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return customer

    @extend_schema_field(serializers.CharField())
    def get_signal_status(self, obj):
        rx = float(obj.rx_power)
        if rx >= -24.0:
            return 'good'
        elif rx >= -27.0:
            return 'warning'
        else:
            return 'critical'


class OLTSerializer(serializers.ModelSerializer):
    upstream_router_name = serializers.CharField(source='upstream_router.name', read_only=True)
    upstream_router_ip = serializers.CharField(source='upstream_router.ip_address', read_only=True)
    upstream_router_status = serializers.CharField(source='upstream_router.status', read_only=True)

    class Meta:
        model = OLT
        fields = '__all__'
        read_only_fields = ('tenant',)
        extra_kwargs = {
            'telnet_password': {'write_only': True, 'required': False},
            'snmp_community': {'write_only': True, 'required': False},
        }

    def validate_upstream_router(self, router):
        if router is None:
            return router
        tenant = _tenant_from_context(self.context)
        if tenant and router.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected router does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return router

    def validate_pop_branch(self, pop):
        if pop is None:
            return pop
        tenant = _tenant_from_context(self.context)
        if tenant and pop.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected POP branch does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return pop

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret.pop('telnet_password', None)
        ret.pop('snmp_community', None)
        return ret

    def validate_ip_address(self, value):
        validate_router_host(value)
        return value


class UserSessionSerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True)

    class Meta:
        model = UserSession
        fields = '__all__'
        read_only_fields = ('tenant',)

    def validate_router(self, router):
        if router is None:
            return router
        tenant = _tenant_from_context(self.context)
        if tenant and router.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected router does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return router


class RouterActionSerializer(serializers.Serializer):
    """Action-specific request serializer for MikroTik operational actions."""
    action = serializers.ChoiceField(choices=[
        'test_connection', 'health', 'active_sessions', 'sync_pppoe',
        'disconnect_session', 'enable_pppoe', 'disable_pppoe', 'sync_profiles'
    ])
    username = serializers.CharField(required=False, allow_blank=True, default='')
    interface = serializers.CharField(required=False, allow_blank=True, default='')


class ONUActionSerializer(serializers.Serializer):
    """Action-specific request serializer for OLT/ONU operational actions."""
    action = serializers.ChoiceField(choices=['reboot', 'optical_power', 'assign_customer', 'unassign_customer'])
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    pon_port = serializers.CharField(required=False, allow_blank=True, default='')


class TJBoxSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)

    class Meta:
        model = TJBox
        fields = '__all__'
        read_only_fields = ('tenant', 'created_at', 'updated_at')

    def validate_zone(self, zone):
        if zone is None:
            return zone
        tenant = _tenant_from_context(self.context)
        if not tenant and self.instance:
            tenant = getattr(self.instance, 'tenant', None)
        if tenant and zone.tenant_id != getattr(tenant, 'id', tenant):
            raise serializers.ValidationError(
                "Selected zone does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return zone

    def validate_lat_long(self, value):
        if not value or not value.strip():
            return value
        parts = [p.strip() for p in value.split(',') if p.strip()]
        if len(parts) != 2:
            raise serializers.ValidationError(
                "lat_long must be in 'latitude, longitude' format with exactly two numeric coordinates."
            )
        try:
            lat = Decimal(parts[0])
            lng = Decimal(parts[1])
        except Exception:
            raise serializers.ValidationError("Invalid numeric coordinates in lat_long.")
        if not (lat.is_finite() and lng.is_finite()):
            raise serializers.ValidationError("Invalid numeric coordinates in lat_long.")
        if not (Decimal('-90.0') <= lat <= Decimal('90.0') and Decimal('-180.0') <= lng <= Decimal('180.0')):
            raise serializers.ValidationError(
                "Coordinates out of range: latitude must be between -90 and 90, longitude between -180 and 180."
            )
        return value

    def to_internal_value(self, data):
        # Gracefully handle stringified JSON for fiber_code if submitted from legacy formats
        if 'fiber_code' in data and isinstance(data['fiber_code'], str):
            import json
            try:
                data = data.copy()
                data['fiber_code'] = json.loads(data['fiber_code'])
            except Exception:
                pass
        return super().to_internal_value(data)


class WireGuardSubnetSerializer(serializers.ModelSerializer):
    olt_name = serializers.CharField(source='olt.name', read_only=True)

    class Meta:
        model = WireGuardSubnet
        fields = '__all__'
        read_only_fields = ('tenant',)

    def validate(self, attrs):
        tenant = _tenant_from_context(self.context)
        vpn = attrs.get('vpn_config')
        olt = attrs.get('olt')
        if tenant and vpn and vpn.tenant_id != tenant.id:
            raise serializers.ValidationError({'vpn_config': 'VPN configuration belongs to another tenant.'})
        if tenant and olt and olt.tenant_id != tenant.id:
            raise serializers.ValidationError({'olt': 'OLT belongs to another tenant.'})
        return attrs


class WireGuardConfigSerializer(serializers.ModelSerializer):
    """Accept plaintext only on write; never serialize private material."""
    mik_private_key = serializers.CharField(write_only=True, required=False, allow_blank=False)
    subnets = WireGuardSubnetSerializer(many=True, read_only=True)

    class Meta:
        model = WireGuardConfig
        fields = '__all__'
        read_only_fields = ('tenant', 'mik_private_key_enc', 'mik_private_key_set', 'last_tested_at', 'is_reachable')
        extra_kwargs = {'snmp_community': {'write_only': True, 'required': False}}

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation.pop('snmp_community', None)
        return representation

    def validate_router(self, router):
        tenant = _tenant_from_context(self.context)
        if tenant and router and router.tenant_id != tenant.id:
            raise serializers.ValidationError('Router belongs to another tenant.')
        return router

    def create(self, validated_data):
        raw_key = validated_data.pop('mik_private_key', '')
        from .services.vpn import WireGuardService
        tenant = validated_data['tenant']
        if raw_key:
            validated_data['mik_private_key_enc'] = WireGuardService.encrypt_private_key(raw_key, tenant.id)
            validated_data['mik_private_key_set'] = True
        return super().create(validated_data)

    def update(self, instance, validated_data):
        raw_key = validated_data.pop('mik_private_key', '')
        if raw_key:
            from .services.vpn import WireGuardService
            validated_data['mik_private_key_enc'] = WireGuardService.encrypt_private_key(raw_key, instance.tenant_id)
            validated_data['mik_private_key_set'] = True
        return super().update(instance, validated_data)


class WireGuardAuditEventSerializer(serializers.ModelSerializer):
    router_name = serializers.SerializerMethodField()

    class Meta:
        from .models import WireGuardAuditEvent
        model = WireGuardAuditEvent
        fields = [
            'id', 'config', 'router', 'router_name', 'event_type',
            'actor', 'actor_role', 'is_saas_admin', 'summary',
            'before', 'after', 'occurred_at',
        ]
        read_only_fields = fields

    def get_router_name(self, obj):
        if obj.router_id:
            return obj.router.name if obj.router else ''
        cfg = obj.config
        return cfg.router.name if cfg and cfg.router_id else (cfg.router_name if cfg else '')


class NetworkProfileSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import NetworkProfile
        model = NetworkProfile
        fields = [
            'id', 'name', 'mikrotik_profile', 'download_rate_mbps', 'upload_rate_mbps',
            'burst_download_mbps', 'burst_upload_mbps', 'burst_threshold_mbps', 'burst_time_seconds',
            'priority', 'address_pool', 'dns_servers', 'radius_attributes', 'status',
            'created_at', 'updated_at',
        ]
        read_only_fields = ('tenant', 'created_at', 'updated_at')


class PPPoEAccountSerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True)
    router_ip = serializers.CharField(source='router.ip_address', read_only=True)
    customer_code = serializers.CharField(source='customer.customer_code', read_only=True, default='')
    customer_name = serializers.CharField(source='customer.full_name', read_only=True, default='')
    service_identifier = serializers.CharField(source='service.service_identifier', read_only=True, default='')
    package_name = serializers.CharField(source='package.name', read_only=True, default='')
    network_profile_name = serializers.CharField(source='network_profile.name', read_only=True, default='')

    class Meta:
        from .models import PPPoESecretItem
        model = PPPoESecretItem
        fields = [
            'id', 'router', 'router_name', 'router_ip', 'customer', 'customer_code', 'customer_name',
            'service', 'service_identifier', 'package', 'package_name', 'network_profile', 'network_profile_name',
            'username', 'password', 'status', 'provisioning_status', 'reconciliation_status',
            'router_profile', 'expected_profile', 'router_disabled', 'expected_disabled',
            'last_provisioned_at', 'last_error', 'last_reconciled_at', 'last_synced_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = (
            'tenant', 'reconciliation_status', 'router_profile', 'expected_profile',
            'router_disabled', 'expected_disabled', 'last_provisioned_at', 'last_error',
            'last_reconciled_at', 'last_synced_at', 'created_at', 'updated_at',
        )
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
        }

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret.pop('password', None)
        return ret


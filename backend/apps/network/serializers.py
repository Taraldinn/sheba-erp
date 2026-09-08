from rest_framework import serializers
from .models import Router, OLT, ONU, UserSession, POPBranch
from .validators import validate_router_host, validate_port


class POPBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = POPBranch
        fields = '__all__'
        read_only_fields = ('tenant',)


class RouterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Router
        fields = '__all__'
        read_only_fields = ('tenant', 'cpu_usage', 'memory_usage', 'disk_usage', 'uptime', 'last_ping')
        extra_kwargs = {
            'password': {'write_only': True, 'required': False}
        }

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret.pop('password', None)
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


def _tenant_from_context(context):
    request = context.get('request')
    return getattr(request, 'tenant', None) if request else None


class ONUSerializer(serializers.ModelSerializer):
    olt_name = serializers.CharField(source='olt.name', read_only=True)
    customer_username = serializers.CharField(source='customer.pppoe_username', read_only=True)
    customer_full_name = serializers.CharField(source='customer.full_name', read_only=True)
    signal_status = serializers.SerializerMethodField()

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

    def get_signal_status(self, obj):
        rx = float(obj.rx_power)
        if rx > -25.0 and rx < -10.0:
            return 'good'
        elif rx >= -27.0 and rx <= -25.0:
            return 'warning'
        else:
            return 'critical'


class OLTSerializer(serializers.ModelSerializer):
    class Meta:
        model = OLT
        fields = '__all__'
        read_only_fields = ('tenant',)
        extra_kwargs = {
            'telnet_password': {'write_only': True, 'required': False},
            'snmp_community': {'write_only': True, 'required': False},
        }

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

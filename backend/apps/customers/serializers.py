from rest_framework import serializers
from .models import Customer
from apps.billing.models import Package
from apps.network.models import Router


def _tenant_from_context(context):
    """Extract request.tenant from serializer context."""
    request = context.get('request')
    return getattr(request, 'tenant', None) if request else None


class CustomerListSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source='package.name', read_only=True)
    package_speed = serializers.IntegerField(source='package.speed_mbps', read_only=True)
    router_name = serializers.CharField(source='router.name', read_only=True)
    router_ip = serializers.CharField(source='router.ip_address', read_only=True)
    router_protocol = serializers.CharField(source='router.api_protocol', read_only=True)
    router_status = serializers.CharField(source='router.status', read_only=True)
    reseller_name = serializers.CharField(source='reseller.user.username', read_only=True)
    live_session = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            'id', 'customer_code', 'full_name', 'mobile', 'email', 'address', 'area_zone',
            'connection_type', 'router', 'router_name', 'router_ip', 'router_protocol', 'router_status',
            'pppoe_username', 'package', 'package_name', 'package_speed', 'billing_type',
            'monthly_bill', 'due_amount', 'advance_amount', 'discount',
            'bill_date', 'expiry_date', 'promise_date', 'status',
            'auto_lock_enabled', 'reseller', 'reseller_name', 'live_session', 'created_at'
        ]

    def get_live_session(self, obj):
        from apps.network.models import UserSession
        session = UserSession.objects.filter(tenant=obj.tenant, username=obj.pppoe_username).first()
        if session:
            return {
                'is_online': True,
                'ip_address': session.ip_address,
                'mac_address': session.mac_address,
                'caller_id': session.caller_id,
                'uptime': session.uptime,
                'bytes_in': session.bytes_in,
                'bytes_out': session.bytes_out,
                'router_name': session.router.name if session.router else '',
                'connected_at': session.connected_at.isoformat() if session.connected_at else None,
                'last_seen': session.last_seen.isoformat() if session.last_seen else None,
            }
        return {'is_online': False}


class CustomerDetailSerializer(serializers.ModelSerializer):
    """
    Full customer serializer with cross-FK tenant ownership validation (Plan Phase 7).

    Validates:
      - customer.package.tenant == request.tenant
      - customer.router.tenant  == request.tenant
    """
    package_name = serializers.CharField(source='package.name', read_only=True)
    router_name = serializers.CharField(source='router.name', read_only=True)
    router_ip = serializers.CharField(source='router.ip_address', read_only=True)
    router_protocol = serializers.CharField(source='router.api_protocol', read_only=True)
    router_status = serializers.CharField(source='router.status', read_only=True)
    live_session = serializers.SerializerMethodField()
    welcome = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = '__all__'
        read_only_fields = ('tenant',)
        extra_kwargs = {
            'pppoe_password': {'write_only': True, 'required': False}
        }

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret.pop('pppoe_password', None)
        return ret

    def get_welcome(self, obj):
        """Returns the welcome-credential dispatch info stashed on
        the instance by ``CustomerViewSet.perform_create`` (or None
        for plain reads). Shape:
          {
            'enabled': bool,
            'issued':  {'username': str, 'password': str, 'regenerated': bool} | None,
            'dispatch': {'sent_via': [..], 'skipped': [..], 'sms_log_id': str|None,
                         'email_to': str} | None,
          }
        """
        result = getattr(obj, '_welcome_result', None)
        if result is not None:
            return result
        # Read-only path: surface the persisted dispatch state so the
        # admin UI can show "Welcome sent at X" without re-sending.
        return {
            'enabled': True,
            'issued': None,
            'dispatch': {
                'sent_via': (
                    obj.welcome_sent_via.split(',')
                    if obj.welcome_sent_via else []
                ),
                'sms_log_id': obj.welcome_sms_log_id or None,
                'email_to': obj.welcome_email_to or '',
                'sent_at': (
                    obj.welcome_sent_at.isoformat()
                    if obj.welcome_sent_at else None
                ),
            },
        }

    def get_live_session(self, obj):
        from apps.network.models import UserSession
        session = UserSession.objects.filter(tenant=obj.tenant, username=obj.pppoe_username).first()
        if session:
            return {
                'is_online': True,
                'ip_address': session.ip_address,
                'mac_address': session.mac_address,
                'caller_id': session.caller_id,
                'uptime': session.uptime,
                'bytes_in': session.bytes_in,
                'bytes_out': session.bytes_out,
                'router_name': session.router.name if session.router else '',
                'connected_at': session.connected_at.isoformat() if session.connected_at else None,
                'last_seen': session.last_seen.isoformat() if session.last_seen else None,
            }
        return {'is_online': False}

    def validate_package(self, package):
        """Ensure the assigned package belongs to this tenant (Plan Phase 7)."""
        if package is None:
            return package
        tenant = _tenant_from_context(self.context)
        if tenant and package.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected package does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return package

    def validate_router(self, router):
        """Ensure the assigned router belongs to this tenant (Plan Phase 7)."""
        if router is None:
            return router
        tenant = _tenant_from_context(self.context)
        if tenant and router.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected router does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return router

    def validate_reseller(self, reseller):
        """Ensure the assigned reseller belongs to this tenant."""
        if reseller is None:
            return reseller
        tenant = _tenant_from_context(self.context)
        if tenant and reseller.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Selected reseller does not belong to your ISP. Cross-tenant assignment is not allowed."
            )
        return reseller


class RechargeRequestSerializer(serializers.Serializer):
    """
    Action-specific request serializer for subscriber recharge.
    Enforces positive amounts and validity periods.
    """
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1)
    package_id = serializers.UUIDField(required=False, allow_null=True)
    validity_days = serializers.IntegerField(default=30, min_value=1)
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0.00, min_value=0)
    payment_method = serializers.CharField(default='Cash')
    trx_id = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default='')


# Backward compatibility alias
CustomerRechargeSerializer = RechargeRequestSerializer


class ToggleInternetSerializer(serializers.Serializer):
    """
    Action-specific request serializer for toggling customer internet connectivity.
    """
    state = serializers.ChoiceField(choices=['on', 'off', 'toggle'], required=False, default='toggle')
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class LockCustomerSerializer(serializers.Serializer):
    """
    Action-specific request serializer for administrative customer account locking.
    """
    reason = serializers.CharField(required=False, allow_blank=True, default='Manual administrative lock')
    disconnect_session = serializers.BooleanField(default=True)


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
    reseller_name = serializers.CharField(source='reseller.user.username', read_only=True)

    class Meta:
        model = Customer
        fields = [
            'id', 'customer_code', 'full_name', 'mobile', 'email', 'address', 'area_zone',
            'connection_type', 'router', 'router_name', 'pppoe_username',
            'package', 'package_name', 'package_speed', 'billing_type',
            'monthly_bill', 'due_amount', 'advance_amount', 'discount',
            'bill_date', 'expiry_date', 'promise_date', 'status',
            'auto_lock_enabled', 'reseller', 'reseller_name', 'created_at'
        ]


class CustomerDetailSerializer(serializers.ModelSerializer):
    """
    Full customer serializer with cross-FK tenant ownership validation (Plan Phase 7).

    Validates:
      - customer.package.tenant == request.tenant
      - customer.router.tenant  == request.tenant
    """
    package_name = serializers.CharField(source='package.name', read_only=True)
    router_name = serializers.CharField(source='router.name', read_only=True)

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


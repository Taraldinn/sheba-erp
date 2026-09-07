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


class CustomerRechargeSerializer(serializers.Serializer):
    """Action-specific serializer for the recharge endpoint (Plan Phase 25)."""
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    package_id = serializers.UUIDField(required=False, allow_null=True)
    validity_days = serializers.IntegerField(default=30)
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payment_method = serializers.CharField(default='Cash')
    trx_id = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')

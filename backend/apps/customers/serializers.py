from rest_framework import serializers
from .models import Customer
from apps.billing.models import Package
from apps.network.models import Router


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
    package_name = serializers.CharField(source='package.name', read_only=True)
    router_name = serializers.CharField(source='router.name', read_only=True)

    class Meta:
        model = Customer
        fields = '__all__'
        read_only_fields = ('tenant',)



class CustomerRechargeSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    package_id = serializers.UUIDField(required=False, allow_null=True)
    validity_days = serializers.IntegerField(default=30)
    discount = serializers.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payment_method = serializers.CharField(default='Cash')
    trx_id = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')

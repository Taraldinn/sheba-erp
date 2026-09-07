from rest_framework import serializers
from .models import Package, ResellerPricing, Invoice, Recharge, Offer


def _tenant_from_context(context):
    request = context.get('request')
    return getattr(request, 'tenant', None) if request else None


class PackageSerializer(serializers.ModelSerializer):
    subscribers_count = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = [
            'id', 'name', 'mikrotik_profile', 'speed_mbps', 'upload_speed_mbps',
            'validity_days', 'regular_price', 'min_reseller_price', 'description',
            'is_active', 'subscribers_count', 'created_at'
        ]
        read_only_fields = ('tenant',)

    def get_subscribers_count(self, obj):
        return obj.subscribers.count()


class ResellerPricingSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source='package.name', read_only=True)
    reseller_username = serializers.CharField(source='reseller.user.username', read_only=True)

    class Meta:
        model = ResellerPricing
        fields = ['id', 'reseller', 'reseller_username', 'package', 'package_name', 'custom_price', 'created_at']
        read_only_fields = ('tenant',)


class InvoiceSerializer(serializers.ModelSerializer):
    """
    Invoice serializer with cross-FK tenant ownership validation (Plan Phase 7).
    Validates: invoice.customer.tenant == request.tenant
    """
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_username = serializers.CharField(source='customer.pppoe_username', read_only=True)

    class Meta:
        model = Invoice
        fields = '__all__'
        read_only_fields = ('tenant',)

    def validate_customer(self, customer):
        """Ensure invoice is raised against a customer of this tenant."""
        tenant = _tenant_from_context(self.context)
        if tenant and customer.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Customer does not belong to your ISP. Cross-tenant invoice is not allowed."
            )
        return customer


class RechargeSerializer(serializers.ModelSerializer):
    """
    Recharge serializer with cross-FK tenant ownership validation (Plan Phase 7).
    Validates:
      - recharge.customer.tenant == request.tenant
      - recharge.package.tenant  == request.tenant (when provided)
    """
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_username = serializers.CharField(source='customer.pppoe_username', read_only=True)
    package_name = serializers.CharField(source='package.name', read_only=True)
    processed_by_name = serializers.CharField(source='processed_by.user.username', read_only=True)

    class Meta:
        model = Recharge
        fields = '__all__'
        read_only_fields = ('tenant',)

    def validate_customer(self, customer):
        tenant = _tenant_from_context(self.context)
        if tenant and customer.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Customer does not belong to your ISP."
            )
        return customer

    def validate_package(self, package):
        if package is None:
            return package
        tenant = _tenant_from_context(self.context)
        if tenant and package.tenant_id != tenant.id:
            raise serializers.ValidationError(
                "Package does not belong to your ISP. Cross-tenant recharge is not allowed."
            )
        return package


class OfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offer
        fields = '__all__'
        read_only_fields = ('tenant',)

from rest_framework import serializers
from .models import Package, ResellerPricing, Invoice, Recharge, Offer


class PackageSerializer(serializers.ModelSerializer):
    subscribers_count = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = [
            'id', 'name', 'mikrotik_profile', 'speed_mbps', 'upload_speed_mbps',
            'validity_days', 'regular_price', 'min_reseller_price', 'description',
            'is_active', 'subscribers_count', 'created_at'
        ]

    def get_subscribers_count(self, obj):
        return obj.subscribers.count()


class ResellerPricingSerializer(serializers.ModelSerializer):
    package_name = serializers.CharField(source='package.name', read_only=True)
    reseller_username = serializers.CharField(source='reseller.user.username', read_only=True)

    class Meta:
        model = ResellerPricing
        fields = ['id', 'reseller', 'reseller_username', 'package', 'package_name', 'custom_price', 'created_at']


class InvoiceSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_username = serializers.CharField(source='customer.pppoe_username', read_only=True)

    class Meta:
        model = Invoice
        fields = '__all__'


class RechargeSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_username = serializers.CharField(source='customer.pppoe_username', read_only=True)
    package_name = serializers.CharField(source='package.name', read_only=True)
    processed_by_name = serializers.CharField(source='processed_by.user.username', read_only=True)

    class Meta:
        model = Recharge
        fields = '__all__'


class OfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offer
        fields = '__all__'

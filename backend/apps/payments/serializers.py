from rest_framework import serializers
from .models import PaymentGateway, PaymentTransaction, SmsLog


class PaymentGatewaySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentGateway
        fields = '__all__'
        extra_kwargs = {
            # Live credentials — never returned in responses
            'app_secret': {'write_only': True},
            'password': {'write_only': True},
            'private_key': {'write_only': True},
            'store_password': {'write_only': True},
            # Sandbox credentials — also write-only
            'sandbox_app_secret': {'write_only': True},
            'sandbox_password': {'write_only': True},
        }



class PaymentTransactionSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_username = serializers.CharField(source='customer.pppoe_username', read_only=True)

    class Meta:
        model = PaymentTransaction
        fields = '__all__'


class SmsLogSerializer(serializers.ModelSerializer):
    matched_customer_name = serializers.CharField(source='matched_customer.full_name', read_only=True)

    class Meta:
        model = SmsLog
        fields = '__all__'

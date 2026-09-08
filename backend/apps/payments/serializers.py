from rest_framework import serializers
from .models import PaymentGateway, PaymentTransaction, SmsLog, InboundPaymentEvent


class PaymentGatewaySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentGateway
        fields = '__all__'
        read_only_fields = ('tenant',)
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
        read_only_fields = ('tenant',)


class SmsLogSerializer(serializers.ModelSerializer):
    matched_customer_name = serializers.CharField(source='matched_customer.full_name', read_only=True)

    class Meta:
        model = SmsLog
        fields = '__all__'
        read_only_fields = ('tenant',)


class InboundPaymentEventSerializer(serializers.ModelSerializer):
    matched_customer_name = serializers.CharField(source='matched_customer.full_name', read_only=True)
    matched_customer_username = serializers.CharField(source='matched_customer.pppoe_username', read_only=True)

    class Meta:
        model = InboundPaymentEvent
        fields = '__all__'
        read_only_fields = (
            'tenant', 'status', 'matched_customer', 'matched_transaction',
            'sms_log', 'processing_error', 'processed_at', 'received_at'
        )


class ResolvePaymentEventSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


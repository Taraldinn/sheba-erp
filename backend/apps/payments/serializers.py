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

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        for secret_key in ['app_secret', 'password', 'private_key', 'store_password', 'sandbox_app_secret', 'sandbox_password']:
            ret.pop(secret_key, None)
        return ret


class PaymentRequestSerializer(serializers.Serializer):
    """
    Action-specific request serializer for processing payments.
    """
    customer_id = serializers.UUIDField(required=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1)
    payment_method = serializers.CharField(default='CASH')
    trx_id = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default='')



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


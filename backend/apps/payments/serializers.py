from decimal import Decimal
from rest_framework import serializers
from .models import PaymentGateway, PaymentTransaction, SmsLog, InboundPaymentEvent


SENSITIVE_GATEWAY_FIELDS = [
    'app_key',
    'app_secret',
    'username',
    'password',
    'sandbox_app_key',
    'sandbox_app_secret',
    'sandbox_username',
    'sandbox_password',
    'merchant_number',
    'merchant_phone',
    'public_key',
    'private_key',
    'store_id',
    'store_password',
    'webhook_secret',
]


class PaymentGatewaySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentGateway
        fields = '__all__'
        read_only_fields = ('tenant',)
        extra_kwargs = {
            field: {'write_only': True, 'required': False}
            for field in SENSITIVE_GATEWAY_FIELDS
        }

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Guarantee all sensitive credentials are never leaked in serialization or responses
        for secret_key in SENSITIVE_GATEWAY_FIELDS:
            ret.pop(secret_key, None)

        # Expose safe masked metadata and status indicators for admin UI
        ret['is_configured'] = bool(
            instance.app_key
            or instance.merchant_number
            or instance.store_id
            or instance.webhook_secret
        )
        ret['has_app_key'] = bool(instance.app_key)
        ret['has_app_secret'] = bool(instance.app_secret)
        ret['has_password'] = bool(instance.password)
        ret['has_private_key'] = bool(instance.private_key)
        ret['has_public_key'] = bool(instance.public_key)
        ret['has_webhook_secret'] = bool(instance.webhook_secret)
        ret['has_store_password'] = bool(instance.store_password)
        ret['masked_app_key'] = instance.masked_app_key
        ret['masked_merchant_number'] = instance.masked_merchant_number
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
    raw_payload = serializers.CharField(required=False, allow_blank=True, default='')
    source = serializers.ChoiceField(choices=InboundPaymentEvent.EventSource.choices, default=InboundPaymentEvent.EventSource.SMS, required=False)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=Decimal('0.00'))

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


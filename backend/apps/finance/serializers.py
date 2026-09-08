from rest_framework import serializers
from apps.finance.models import BillingAccount, LedgerEntry, PaymentAllocation, Adjustment
from apps.customers.models import Customer


class BillingAccountSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    pppoe_username = serializers.CharField(source='customer.pppoe_username', read_only=True)

    class Meta:
        model = BillingAccount
        fields = [
            'id', 'customer', 'customer_name', 'pppoe_username',
            'balance', 'credit_limit', 'total_paid', 'total_invoiced',
            'overdue_amount', 'last_payment_at', 'created_at', 'updated_at'
        ]
        read_only_fields = fields


class LedgerEntrySerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    pppoe_username = serializers.CharField(source='customer.pppoe_username', read_only=True)

    class Meta:
        model = LedgerEntry
        fields = [
            'id', 'customer', 'customer_name', 'pppoe_username',
            'entry_type', 'amount', 'balance_after', 'reference_id',
            'reference_type', 'description', 'created_by', 'created_at'
        ]
        read_only_fields = fields


class PaymentAllocationSerializer(serializers.ModelSerializer):
    invoice_no = serializers.CharField(source='invoice.invoice_no', read_only=True)
    payment_trx_id = serializers.CharField(source='payment.trx_id', read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = [
            'id', 'payment', 'payment_trx_id', 'invoice', 'invoice_no',
            'amount', 'allocated_at', 'notes'
        ]
        read_only_fields = fields


class AdjustmentSerializer(serializers.ModelSerializer):
    customer_id = serializers.UUIDField(write_only=True)
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    pppoe_username = serializers.CharField(source='customer.pppoe_username', read_only=True)

    class Meta:
        model = Adjustment
        fields = [
            'id', 'customer', 'customer_id', 'customer_name', 'pppoe_username',
            'adjustment_type', 'amount', 'reason', 'approved_by',
            'ledger_entry', 'created_at'
        ]
        read_only_fields = ['id', 'customer', 'approved_by', 'ledger_entry', 'created_at']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Adjustment amount must be strictly greater than 0.")
        return value

    def validate_reason(self, value):
        if not value or len(value.strip()) < 5:
            raise serializers.ValidationError("A detailed reason of at least 5 characters is required for adjustments.")
        return value.strip()

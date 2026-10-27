from rest_framework import serializers
from apps.finance.models import BillingAccount, LedgerEntry, PaymentAllocation, Adjustment, InvoiceLine
from apps.customers.models import Customer


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = [
            'id', 'invoice', 'description', 'quantity', 'unit_price',
            'discount', 'tax_amount', 'total', 'created_at'
        ]
        read_only_fields = ['id', 'total', 'created_at']


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


# ─────────────────────────────────────────────────────────────────────────────
# Phase 24 serializers
# ─────────────────────────────────────────────────────────────────────────────

class CreditNoteSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True)
    customer_pppoe = serializers.CharField(source='customer.pppoe_username', read_only=True)
    related_invoice_no = serializers.CharField(source='related_invoice.invoice_no', read_only=True, default='')

    class Meta:
        from apps.finance.models import CreditNote
        model = CreditNote
        fields = [
            'id', 'credit_note_no', 'amount', 'reason', 'status',
            'related_invoice', 'related_invoice_no', 'related_recharge',
            'customer', 'customer_name', 'customer_pppoe',
            'notes', 'created_by', 'issued_at', 'applied_at',
        ]
        read_only_fields = ['id', 'credit_note_no', 'issued_at', 'applied_at',
                           'created_by', 'related_invoice_no', 'customer_name',
                           'customer_pppoe']


class TaxRuleSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.finance.models import TaxRule
        model = TaxRule
        fields = ['id', 'label', 'percentage', 'is_active', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class DiscountCouponSerializer(serializers.ModelSerializer):
    times_used = serializers.IntegerField(source='redemptions', read_only=True)
    is_redeemable = serializers.SerializerMethodField()

    class Meta:
        from apps.finance.models import DiscountCoupon
        model = DiscountCoupon
        fields = [
            'id', 'code', 'description', 'discount_type', 'value',
            'min_invoice_amount', 'valid_from', 'valid_until',
            'max_redemptions', 'redemptions', 'times_used', 'per_customer_limit',
            'is_active', 'is_redeemable', 'created_at',
        ]
        read_only_fields = ['id', 'redemptions', 'times_used', 'is_redeemable',
                           'created_at']

    def get_is_redeemable(self, obj):
        from django.utils import timezone
        today = timezone.localdate()
        if not obj.is_active:
            return False
        if obj.valid_from and today < obj.valid_from:
            return False
        if obj.valid_until and today > obj.valid_until:
            return False
        if obj.max_redemptions and obj.redemptions >= obj.max_redemptions:
            return False
        return True


class DunningStageSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.finance.models import DunningStage
        model = DunningStage
        fields = ['id', 'name', 'days_overdue', 'action', 'template_text',
                  'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class DunningEventSerializer(serializers.ModelSerializer):
    stage_name = serializers.CharField(source='stage.name', read_only=True)
    customer_pppoe = serializers.CharField(source='customer.pppoe_username', read_only=True)
    invoice_no = serializers.CharField(source='invoice.invoice_no', read_only=True)

    class Meta:
        from apps.finance.models import DunningEvent
        model = DunningEvent
        fields = ['id', 'stage', 'stage_name', 'customer', 'customer_pppoe',
                  'invoice', 'invoice_no', 'triggered_at', 'delivery_status',
                  'provider_response']
        read_only_fields = fields


class BillDisputeSerializer(serializers.ModelSerializer):
    customer_pppoe = serializers.CharField(source='customer.pppoe_username', read_only=True)
    invoice_no = serializers.CharField(source='invoice.invoice_no', read_only=True)

    class Meta:
        from apps.finance.models import BillDispute
        model = BillDispute
        fields = ['id', 'customer', 'customer_pppoe', 'invoice', 'invoice_no',
                  'reason', 'contact_phone', 'status', 'support_ticket_id',
                  'resolution_notes', 'created_at', 'resolved_at']
        read_only_fields = ['id', 'status', 'support_ticket_id',
                           'resolution_notes', 'created_at', 'resolved_at',
                           'customer_pppoe', 'invoice_no']


class ApplyCouponSerializer(serializers.Serializer):
    """Used by /discount-coupons/apply/ — validates then returns the discount."""
    code = serializers.CharField(max_length=50)
    invoice_id = serializers.UUIDField(required=False)
    invoice_total = serializers.DecimalField(max_digits=12, decimal_places=2,
                                            required=False)

    def validate(self, attrs):
        if not attrs.get('invoice_id') and attrs.get('invoice_total') is None:
            raise serializers.ValidationError('invoice_id or invoice_total is required.')
        return attrs

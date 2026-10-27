from django.contrib import admin
from .models import BillingAccount, InvoiceLine, PaymentAllocation, LedgerEntry, Adjustment, IdempotencyKey


@admin.register(BillingAccount)
class BillingAccountAdmin(admin.ModelAdmin):
    list_display = ('customer', 'tenant', 'balance', 'credit_limit', 'total_paid', 'total_invoiced', 'overdue_amount', 'last_payment_at')
    list_filter = ('tenant', 'last_payment_at')
    search_fields = ('customer__full_name', 'customer__pppoe_username', 'tenant__slug')
    readonly_fields = ('id', 'created_at', 'updated_at')
    ordering = ('tenant', 'customer')

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(InvoiceLine)
class InvoiceLineAdmin(admin.ModelAdmin):
    list_display = ('invoice', 'description', 'quantity', 'unit_price', 'discount', 'total', 'created_at')
    list_filter = ('tenant', 'created_at')
    search_fields = ('description', 'invoice__invoice_no')
    readonly_fields = ('id', 'total', 'created_at')


@admin.register(PaymentAllocation)
class PaymentAllocationAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'payment', 'invoice', 'amount', 'allocated_at')
    list_filter = ('tenant', 'allocated_at')
    readonly_fields = ('id', 'allocated_at')

    def has_delete_permission(self, request, obj=None):
        """Payment allocations should never be deleted — use reversals."""
        return False


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'customer', 'entry_type', 'amount', 'balance_after', 'reference_type', 'reference_id', 'created_by', 'created_at')
    list_filter = ('tenant', 'entry_type', 'created_at')
    search_fields = ('customer__full_name', 'customer__pppoe_username', 'reference_id', 'created_by')
    readonly_fields = ('id', 'tenant', 'customer', 'entry_type', 'amount', 'balance_after',
                       'reference_id', 'reference_type', 'description', 'created_by', 'created_at')
    ordering = ('-created_at',)

    def has_add_permission(self, request):
        """LedgerEntry is append-only — create via services, not admin."""
        return False

    def has_change_permission(self, request, obj=None):
        """LedgerEntry must never be modified."""
        return False

    def has_delete_permission(self, request, obj=None):
        """LedgerEntry must never be deleted."""
        return False


@admin.register(Adjustment)
class AdjustmentAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'customer', 'adjustment_type', 'amount', 'approved_by', 'created_at')
    list_filter = ('tenant', 'adjustment_type', 'created_at')
    search_fields = ('customer__full_name', 'approved_by', 'reason')
    readonly_fields = ('id', 'ledger_entry', 'created_at')

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(IdempotencyKey)
class IdempotencyKeyAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'operation', 'key', 'status', 'response_status', 'created_at', 'expires_at')
    list_filter = ('tenant', 'operation', 'status', 'created_at')
    search_fields = ('key', 'operation')
    readonly_fields = ('id', 'request_hash', 'response_body', 'created_at', 'completed_at')
    ordering = ('-created_at',)

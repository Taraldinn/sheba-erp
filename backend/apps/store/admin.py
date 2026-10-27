from django.contrib import admin
from .models import ItemCategory, StoreItem, StockTransaction


class StockTransactionInline(admin.TabularInline):
    model = StockTransaction
    extra = 1
    readonly_fields = ('id', 'created_at')


@admin.register(ItemCategory)
class ItemCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant')
    list_filter = ('tenant',)
    search_fields = ('name',)
    readonly_fields = ('id',)


@admin.register(StoreItem)
class StoreItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'item_code', 'category', 'unit', 'unit_price', 'stock_quantity', 'min_stock_alert', 'tenant', 'created_at')
    list_filter = ('category', 'tenant', 'created_at')
    search_fields = ('name', 'item_code')
    readonly_fields = ('id', 'created_at')
    inlines = [StockTransactionInline]


@admin.register(StockTransaction)
class StockTransactionAdmin(admin.ModelAdmin):
    list_display = ('item', 'transaction_type', 'quantity', 'recipient_or_supplier', 'tenant', 'created_at')
    list_filter = ('transaction_type', 'tenant', 'created_at')
    search_fields = ('item__name', 'recipient_or_supplier', 'notes')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at')

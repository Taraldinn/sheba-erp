from rest_framework import serializers, viewsets, permissions
from rest_framework.exceptions import ValidationError
from django.db import transaction
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import ItemCategory, StoreItem, StockTransaction
from apps.core.permissions import IsTenantMember, IsAdminUserOrReadOnly
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


class ItemCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemCategory
        fields = '__all__'
        read_only_fields = ('tenant',)


class StoreItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    # Flexible field mappings
    unit_cost = serializers.DecimalField(source='unit_price', max_digits=10, decimal_places=2, required=False)
    reorder_level = serializers.IntegerField(source='min_stock_alert', required=False)

    class Meta:
        model = StoreItem
        fields = '__all__'
        read_only_fields = ('tenant',)
        extra_kwargs = {
            'category': {'required': False, 'allow_null': True},
            'unit_price': {'required': False},
            'min_stock_alert': {'required': False},
        }


class StockTransactionSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = StockTransaction
        fields = '__all__'
        read_only_fields = ('tenant',)


@extend_schema_view(
    list=extend_schema(tags=['11. Store & Fiber Inventory']),
    retrieve=extend_schema(tags=['11. Store & Fiber Inventory']),
    create=extend_schema(tags=['11. Store & Fiber Inventory']),
    update=extend_schema(tags=['11. Store & Fiber Inventory']),
    partial_update=extend_schema(tags=['11. Store & Fiber Inventory']),
    destroy=extend_schema(tags=['11. Store & Fiber Inventory']),
)
class StoreItemViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminUserOrReadOnly]
    serializer_class = StoreItemSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, StoreItem)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['11. Store & Fiber Inventory']),
    retrieve=extend_schema(tags=['11. Store & Fiber Inventory']),
    create=extend_schema(tags=['11. Store & Fiber Inventory']),
    update=extend_schema(tags=['11. Store & Fiber Inventory']),
    partial_update=extend_schema(tags=['11. Store & Fiber Inventory']),
    destroy=extend_schema(tags=['11. Store & Fiber Inventory']),
)
class StockTransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = StockTransactionSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, StockTransaction)

    @transaction.atomic
    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        tx = serializer.save(tenant=tenant)
        # Acquire lock on the item row to prevent concurrent stock corruption
        item = StoreItem.objects.select_for_update().get(pk=tx.item_id)
        if tx.transaction_type in ('IN', 'RETURN'):
            item.stock_quantity += tx.quantity
        elif tx.transaction_type == 'OUT':
            if item.stock_quantity < tx.quantity:
                raise ValidationError({'quantity': f'Insufficient stock. Available: {item.stock_quantity}'})
            item.stock_quantity -= tx.quantity
        item.save(update_fields=['stock_quantity'])

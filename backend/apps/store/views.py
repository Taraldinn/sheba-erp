from rest_framework import serializers, viewsets, permissions
from .models import ItemCategory, StoreItem, StockTransaction


class ItemCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemCategory
        fields = '__all__'


class StoreItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = StoreItem
        fields = '__all__'


class StockTransactionSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = StockTransaction
        fields = '__all__'


class StoreItemViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StoreItemSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return StoreItem.objects.filter(tenant=tenant)
        return StoreItem.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class StockTransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StockTransactionSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return StockTransaction.objects.filter(tenant=tenant)
        return StockTransaction.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        tx = serializer.save(tenant=tenant)
        # Update store item stock quantity
        item = tx.item
        if tx.transaction_type == 'IN' or tx.transaction_type == 'RETURN':
            item.stock_quantity += tx.quantity
        elif tx.transaction_type == 'OUT':
            item.stock_quantity = max(0, item.stock_quantity - tx.quantity)
        item.save()

import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import Tenant


class ItemCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='store_categories')
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class StoreItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='store_items')
    category = models.ForeignKey(ItemCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    name = models.CharField(max_length=150)
    item_code = models.CharField(max_length=50, blank=True)
    unit = models.CharField(max_length=50, default='Pcs', help_text="e.g. Pcs, Meter, Roll, Box")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    stock_quantity = models.IntegerField(default=0)
    min_stock_alert = models.PositiveIntegerField(default=5)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} (Stock: {self.stock_quantity} {self.unit})"


class StockTransaction(models.Model):
    class TransactionType(models.TextChoices):
        IN = 'IN', 'Stock In / Purchase'
        OUT = 'OUT', 'Stock Out / Dispatch to Client'
        RETURN = 'RETURN', 'Return to Store'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='stock_transactions')
    item = models.ForeignKey(StoreItem, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TransactionType.choices, default=TransactionType.IN)
    quantity = models.PositiveIntegerField(default=1)
    recipient_or_supplier = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.transaction_type} {self.quantity}x {self.item.name}"

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant
from apps.store.models import StoreItem, StockTransaction


class StoreConcurrencyAndSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Fiber Store ISP', slug='fiber-store')
        self.user = User.objects.create_superuser(username='storeadmin', password='storepassword')
        self.client.force_authenticate(user=self.user)

        self.item = StoreItem.objects.create(
            tenant=self.tenant,
            name='SC/UPC Drop Cable 100m',
            item_code='CABLE-100',
            unit='Coil',
            unit_price=1200.00,
            stock_quantity=50,
            min_stock_alert=10
        )

    def test_stock_transaction_atomic(self):
        # 1. Dispatch OUT 20 items -> quantity becomes 30
        res1 = self.client.post('/api/v1/stock-transactions/', {
            'item': str(self.item.id),
            'transaction_type': 'OUT',
            'quantity': 20,
            'recipient_or_supplier': 'Line Tech Rahim'
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock_quantity, 30)

        # 2. Receive IN 15 items -> quantity becomes 45
        res2 = self.client.post('/api/v1/stock-transactions/', {
            'item': str(self.item.id),
            'transaction_type': 'IN',
            'quantity': 15,
            'recipient_or_supplier': 'Vendor FiberTech'
        })
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock_quantity, 45)

        # 3. Attempt to dispatch OUT 100 items (more than available stock 45) -> must be rejected with 400
        res3 = self.client.post('/api/v1/stock-transactions/', {
            'item': str(self.item.id),
            'transaction_type': 'OUT',
            'quantity': 100,
            'recipient_or_supplier': 'Line Tech Karim'
        })
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)
        self.item.refresh_from_db()
        # Ensure stock remained intact (atomic rollback)
        self.assertEqual(self.item.stock_quantity, 45)

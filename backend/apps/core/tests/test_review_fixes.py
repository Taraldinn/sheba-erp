import uuid
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.tasks.models import Task
from apps.network.models import OLT, ONU, OLTBrand
from apps.network.services.olt.client import GenericSNMPOLTClient, OLTClientError
from apps.payments.models import InboundPaymentEvent, PaymentTransaction, TransactionStatus
from apps.finance.models import BillingAccount, LedgerEntry, IdempotencyKey
from apps.authentication.models import StaffProfile, UserRole

User = get_user_model()


class ReviewFixesVerificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Active tenant
        self.tenant_active = Tenant.objects.create(
            name='Active ISP',
            slug='active-isp',
            domain='active.shebafi.com',
            is_active=True
        )
        self.domain_active = TenantDomain.objects.create(
            tenant=self.tenant_active,
            hostname='active.shebafi.com',
            is_active=True,
            is_primary=True
        )

        # Inactive tenant
        self.tenant_inactive = Tenant.objects.create(
            name='Inactive ISP',
            slug='inactive-isp',
            domain='inactive.shebafi.com',
            is_active=False
        )
        self.domain_inactive = TenantDomain.objects.create(
            tenant=self.tenant_inactive,
            hostname='inactive.shebafi.com',
            is_active=True,
            is_primary=True
        )

        # Staff user
        self.staff_user = User.objects.create_user(
            username='staff_test_user',
            password='testpassword123',
            email='staff@active.shebafi.com'
        )
        self.profile = StaffProfile.objects.create(
            user=self.staff_user,
            tenant=self.tenant_active,
            role=UserRole.ADMIN
        )

    def test_customer_query_and_webhook_on_inactive_tenant_returns_403(self):
        """Customer query and SMS webhook paths must return 403 TENANT_INACTIVE on suspended tenants."""
        resp_cust = self.client.get(
            '/api/v1/customer/query/?query=01700000000',
            HTTP_HOST='inactive.shebafi.com'
        )
        self.assertEqual(resp_cust.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp_cust.json().get('code'), 'TENANT_INACTIVE')

        resp_sms = self.client.post(
            '/api/v1/payments/sms/webhook/',
            {'sender': 'bKash', 'message': 'TrxID 123456'},
            HTTP_HOST='inactive.shebafi.com'
        )
        self.assertEqual(resp_sms.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp_sms.json().get('code'), 'TENANT_INACTIVE')

    def test_customer_query_and_webhook_on_unknown_host_bypasses_404_and_returns_400(self):
        """Unknown domain bypasses 404 TENANT_NOT_FOUND and returns 400 from view due to missing tenant context."""
        resp_cust = self.client.get(
            '/api/v1/customer/query/?query=01700000000',
            HTTP_HOST='unknown-isp-domain.com'
        )
        self.assertEqual(resp_cust.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Tenant', resp_cust.json().get('error', ''))

        resp_sms = self.client.post(
            '/api/v1/payments/sms/webhook/',
            {'sender': 'bKash', 'message': 'TrxID 123456'},
            HTTP_HOST='unknown-isp-domain.com'
        )
        self.assertEqual(resp_sms.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Tenant could not be resolved', resp_sms.json().get('error', ''))

    @override_settings(IS_PRODUCTION=True, IS_LOCAL=False)
    def test_olt_client_raises_in_production(self):
        """GenericSNMPOLTClient discover_onus and get_optical_power raise OLTClientError in production."""
        olt = OLT.objects.create(
            tenant=self.tenant_active,
            name='Prod-OLT',
            brand=OLTBrand.VSOL,
            ip_address='10.10.10.1'
        )
        client = GenericSNMPOLTClient(olt)
        with self.assertRaises(OLTClientError):
            client.discover_onus()
        with self.assertRaises(OLTClientError):
            client.get_optical_power('EPON0/1', 1)

    def test_task_assign_validation(self):
        """Task assign validates user_id is digit and exists, returning HTTP 400 on invalid input."""
        task = Task.objects.create(
            tenant=self.tenant_active,
            title='Test Task',
            description='Fix fiber break'
        )
        self.client.force_authenticate(user=self.staff_user)

        # Non-numeric user_id
        resp_non_numeric = self.client.post(
            f'/api/v1/tasks/{task.id}/assign/',
            {'user_id': 'invalid_string'},
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp_non_numeric.status_code, status.HTTP_400_BAD_REQUEST)

        # Non-existent numeric user_id
        resp_non_existent = self.client.post(
            f'/api/v1/tasks/{task.id}/assign/',
            {'user_id': '9999999'},
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp_non_existent.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid user_id
        resp_valid = self.client.post(
            f'/api/v1/tasks/{task.id}/assign/',
            {'user_id': str(self.staff_user.id)},
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp_valid.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.assigned_to, self.staff_user)

    def test_finance_ledger_invalid_uuid_returns_400(self):
        """LedgerEntryViewSet returns HTTP 400 ValidationError when customer param is not a valid UUID."""
        self.client.force_authenticate(user=self.staff_user)
        resp = self.client.get(
            '/api/v1/ledger-entries/?customer=malformed-abc',
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('customer', resp.json())

    def test_onu_reboot_and_unassign_require_manage_capability(self):
        """ONU reboot and unassign_customer reject users lacking olt.manage capability."""
        # Create non-privileged staff
        limited_user = User.objects.create_user(
            username='limited_staff',
            password='testpassword123'
        )
        StaffProfile.objects.create(
            user=limited_user,
            tenant=self.tenant_active,
            role=UserRole.BILLING
        )

        olt = OLT.objects.create(
            tenant=self.tenant_active,
            name='Test-OLT',
            brand=OLTBrand.VSOL,
            ip_address='10.10.10.2'
        )
        onu = ONU.objects.create(
            tenant=self.tenant_active,
            olt=olt,
            pon_port='EPON0/1',
            onu_index=1,
            mac_address='AA:BB:CC:DD:EE:FF'
        )

        self.client.force_authenticate(user=limited_user)
        resp_reboot = self.client.post(
            f'/api/v1/onus/{onu.id}/reboot/',
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp_reboot.status_code, status.HTTP_403_FORBIDDEN)

        resp_unassign = self.client.post(
            f'/api/v1/onus/{onu.id}/unassign-customer/',
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp_unassign.status_code, status.HTTP_403_FORBIDDEN)

    def test_inbound_payment_event_validation(self):
        """InboundPaymentEvent creation validates non-negative amount and source choices."""
        self.client.force_authenticate(user=self.staff_user)

        # Negative amount
        resp_neg = self.client.post(
            '/api/v1/payment-events/',
            {'amount': -100.0, 'source': 'SMS', 'trx_id': 'TEST-NEG'},
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp_neg.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('amount', resp_neg.json())

        # Invalid source
        resp_src = self.client.post(
            '/api/v1/payment-events/',
            {'amount': 100.0, 'source': 'INVALID_SOURCE', 'trx_id': 'TEST-SRC'},
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp_src.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('source', resp_src.json())

    def test_payment_transaction_idempotency_key(self):
        """PaymentTransactionViewSet enforces IdempotencyKey and returns cached result on re-submission."""
        pkg = Package.objects.create(
            tenant=self.tenant_active,
            name='Plan 10M',
            regular_price=500.0
        )
        cust = Customer.objects.create(
            tenant=self.tenant_active,
            customer_code='CUST-IDEM-1',
            full_name='Idem User',
            mobile='01700112233',
            pppoe_username='idem_user',
            package=pkg,
            monthly_bill=500.0
        )

        self.client.force_authenticate(user=self.staff_user)
        idem_key = f"idem-key-{uuid.uuid4().hex}"
        payload = {
            'customer_id': str(cust.id),
            'amount': 500.0,
            'payment_method': 'CASH',
            'trx_id': f"TRX-IDEM-{uuid.uuid4().hex[:6].upper()}",
            'idempotency_key': idem_key
        }

        # First request creates transaction
        resp1 = self.client.post(
            '/api/v1/payments/transactions/',
            payload,
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        tx_id_1 = resp1.data['id']

        # Count total payment transactions
        self.assertEqual(PaymentTransaction.objects.filter(customer=cust).count(), 1)

        # Second request with same idempotency key returns cached response
        resp2 = self.client.post(
            '/api/v1/payments/transactions/',
            payload,
            HTTP_HOST='active.shebafi.com'
        )
        self.assertEqual(resp2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp2.data['id'], tx_id_1)

        # Verify no duplicate transactions or ledger entries created
        self.assertEqual(PaymentTransaction.objects.filter(customer=cust).count(), 1)

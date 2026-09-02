from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.payments.models import SmsLog, PaymentTransaction


class PaymentSmsWebhookTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='SMS Demo ISP', slug='sms-isp')
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code='CUST-200',
            full_name='Kamrul Hasan',
            mobile='01788776655',
            pppoe_username='kamrul_net',
            pppoe_password='secretpppoepass',
            monthly_bill=800.00,
            status=CustomerStatus.EXPIRED
        )

    def test_bkash_sms_auto_matching(self):
        url = reverse('sms-webhook')
        sample_sms = "You have received Tk 800.00 from 01788776655. Fee Tk 0.00. Balance Tk 15400.00. TrxID 9K8L7M6N"
        response = self.client.post(url, {
            'sender': 'bKash',
            'message': sample_sms
        }, HTTP_X_TENANT_ID='sms-isp')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'success')
        self.assertTrue(response.data['matched'])

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, CustomerStatus.ACTIVE)
        self.assertEqual(PaymentTransaction.objects.filter(customer=self.customer).count(), 1)
        self.assertEqual(PaymentTransaction.objects.first().trx_id, '9K8L7M6N')

    def test_duplicate_trx_id_ignored(self):
        url = reverse('sms-webhook')
        sample_sms = "You have received Tk 800.00 from 01788776655. Fee Tk 0.00. Balance Tk 15400.00. TrxID UNIQUE999"
        # First attempt: succeeds
        res1 = self.client.post(url, {'sender': 'bKash', 'message': sample_sms}, HTTP_X_TENANT_ID='sms-isp')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(PaymentTransaction.objects.filter(trx_id='UNIQUE999').count(), 1)

        # Second attempt with same TrxID: must be idempotent and not create duplicate transaction
        res2 = self.client.post(url, {'sender': 'bKash', 'message': sample_sms}, HTTP_X_TENANT_ID='sms-isp')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data.get('idempotent'))
        self.assertEqual(PaymentTransaction.objects.filter(trx_id='UNIQUE999').count(), 1)


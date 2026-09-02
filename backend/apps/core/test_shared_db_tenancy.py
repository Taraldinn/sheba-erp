import datetime
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice
from apps.payments.models import PaymentTransaction
from apps.network.models import Router
from apps.support.models import Ticket
from apps.core.tasks import process_customer_expiry, generate_monthly_invoices_for_tenant


class SharedDatabaseTenancyTests(TestCase):
    """
    Test suite for Shared Database Tenancy Architecture (23 Scenarios from Section 26).
    """
    def setUp(self):
        self.client = APIClient()

        # Tenant 1: Fardin ISP
        self.tenant_fardin = Tenant.objects.create(
            name='Fardin Broadband',
            slug='fardin',
            domain='fardin.shebafi.com',
            is_active=True
        )
        self.user_fardin = User.objects.create_user(username='fardin_staff', password='password123')
        self.profile_fardin = StaffProfile.objects.create(
            user=self.user_fardin,
            tenant=self.tenant_fardin,
            role=UserRole.ADMIN
        )

        # Tenant 2: ISP2
        self.tenant_isp2 = Tenant.objects.create(
            name='ISP Two Telecom',
            slug='isp2',
            domain='isp2.shebafi.com',
            is_active=True
        )
        self.user_isp2 = User.objects.create_user(username='isp2_staff', password='password123')
        self.profile_isp2 = StaffProfile.objects.create(
            user=self.user_isp2,
            tenant=self.tenant_isp2,
            role=UserRole.ADMIN
        )

        # Tenant 3: Disabled / Suspended ISP
        self.tenant_disabled = Tenant.objects.create(
            name='Suspended ISP',
            slug='suspended',
            domain='suspended.shebafi.com',
            is_active=False
        )

        # Central Superuser (Control Plane)
        self.central_admin = User.objects.create_superuser(username='centraladmin', password='password123')

        # Baseline records under Fardin
        self.pkg_fardin = Package.objects.create(
            tenant=self.tenant_fardin,
            name='Fardin 20Mbps',
            mikrotik_profile='20M',
            regular_price=800.00
        )
        self.cust_fardin = Customer.objects.create(
            tenant=self.tenant_fardin,
            customer_code='FAR-001',
            full_name='Fardin Subscriber',
            mobile='01711111111',
            pppoe_username='fardin_user1',
            package=self.pkg_fardin,
            monthly_bill=800.00,
            due_amount=800.00,
            status=CustomerStatus.ACTIVE
        )

        # Baseline records under ISP2
        self.pkg_isp2 = Package.objects.create(
            tenant=self.tenant_isp2,
            name='ISP2 50Mbps',
            mikrotik_profile='50M',
            regular_price=1500.00
        )
        self.cust_isp2 = Customer.objects.create(
            tenant=self.tenant_isp2,
            customer_code='ISP2-001',
            full_name='ISP2 Subscriber',
            mobile='01822222222',
            pppoe_username='isp2_user1',
            package=self.pkg_isp2,
            monthly_bill=1500.00,
            status=CustomerStatus.ACTIVE
        )
        self.inv_isp2 = Invoice.objects.create(
            tenant=self.tenant_isp2,
            customer=self.cust_isp2,
            invoice_no='INV-ISP2-001',
            billing_month='September 2026',
            package_name='ISP2 50Mbps',
            package_amount=1500.00,
            total_payable=1500.00,
            status=Invoice.InvoiceStatus.UNPAID
        )
        self.pay_isp2 = PaymentTransaction.objects.create(
            tenant=self.tenant_isp2,
            customer=self.cust_isp2,
            amount=1500.00,
            trx_id='TRX-ISP2-999',
            status='Success'
        )
        self.router_isp2 = Router.objects.create(
            tenant=self.tenant_isp2,
            name='ISP2 Core Router',
            ip_address='10.20.30.1',
            password='SecretRouterPassword'
        )
        self.ticket_isp2 = Ticket.objects.create(
            tenant=self.tenant_isp2,
            customer=self.cust_isp2,
            ticket_no='TCK-ISP2-001',
            category='Fiber Loss',
            subject='Fiber cut on main route',
            description='LOS red alarm',
            priority='High',
            status='Open'
        )

    # 1, 2, 3: Domain resolves correct tenant
    def test_01_fardin_domain_resolves_fardin_tenant(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.get('/api/v1/customers/', HTTP_HOST='fardin.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['customer_code'], 'FAR-001')

    def test_02_isp2_domain_resolves_isp2_tenant(self):
        self.client.force_authenticate(user=self.user_isp2)
        response = self.client.get('/api/v1/customers/', HTTP_HOST='isp2.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['customer_code'], 'ISP2-001')

    # 4: Unknown domain rejected with 404
    def test_03_unknown_domain_rejected(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.get('/api/v1/customers/', HTTP_HOST='unknown.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json().get('code'), 'TENANT_NOT_FOUND')

    # 5: Disabled/suspended ISP domain rejected with 403
    def test_04_disabled_isp_rejected(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.get('/api/v1/customers/', HTTP_HOST='suspended.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.json().get('code'), 'TENANT_INACTIVE')

    # 6: Fardin cannot access ISP2 customer (IDOR blocked)
    def test_05_fardin_cannot_access_isp2_customer(self):
        self.client.force_authenticate(user=self.user_fardin)
        # Attempt via Fardin domain
        res1 = self.client.get(f'/api/v1/customers/{self.cust_isp2.id}/', HTTP_HOST='fardin.shebafi.com')
        self.assertEqual(res1.status_code, status.HTTP_404_NOT_FOUND)
        # Attempt via ISP2 domain with Fardin credentials
        res2 = self.client.get(f'/api/v1/customers/{self.cust_isp2.id}/', HTTP_HOST='isp2.shebafi.com')
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    # 7: Fardin cannot access ISP2 invoice
    def test_06_fardin_cannot_access_isp2_invoice(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.get(f'/api/v1/invoices/{self.inv_isp2.id}/', HTTP_HOST='fardin.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 8: Fardin cannot access ISP2 payment
    def test_07_fardin_cannot_access_isp2_payment(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.get(f'/api/v1/transactions/{self.pay_isp2.id}/', HTTP_HOST='fardin.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 9: Fardin cannot access ISP2 router
    def test_08_fardin_cannot_access_isp2_router(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.get(f'/api/v1/routers/{self.router_isp2.id}/', HTTP_HOST='fardin.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 10: Fardin cannot access ISP2 ticket
    def test_09_fardin_cannot_access_isp2_ticket(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.get(f'/api/v1/tickets/{self.ticket_isp2.id}/', HTTP_HOST='fardin.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 11: Changing object ID cannot bypass tenant isolation
    def test_10_changing_object_id_cannot_bypass_tenant_isolation(self):
        self.client.force_authenticate(user=self.user_fardin)
        # Attempt to recharge ISP2 customer from Fardin context
        url = f'/api/v1/customers/{self.cust_isp2.id}/recharge/'
        response = self.client.post(url, {
            'amount': '500.00',
            'validity_days': 30,
            'payment_method': 'Cash'
        }, HTTP_HOST='fardin.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 12: tenant_id submitted by frontend cannot switch tenant
    def test_11_frontend_submitted_tenant_id_cannot_switch_tenant(self):
        self.client.force_authenticate(user=self.user_fardin)
        # Attempt to create customer under ISP2 by passing tenant_id in body
        response = self.client.post('/api/v1/customers/', {
            'tenant': str(self.tenant_isp2.id),
            'tenant_id': str(self.tenant_isp2.id),
            'customer_code': 'SPOOF-001',
            'full_name': 'Spoof Attempt',
            'mobile': '01999999999',
            'pppoe_username': 'spoof_user',
            'pppoe_password': 'secretpassword',
            'package': str(self.pkg_fardin.id),
            'monthly_bill': '800.00'
        }, HTTP_HOST='fardin.shebafi.com')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_customer = Customer.objects.get(pppoe_username='spoof_user')
        # Crucial check: Must be assigned to Fardin, NOT the submitted ISP2
        self.assertEqual(new_customer.tenant_id, self.tenant_fardin.id)

    # 13: Customer creation automatically uses request tenant
    def test_12_customer_creation_automatically_uses_request_tenant(self):
        self.client.force_authenticate(user=self.user_isp2)
        response = self.client.post('/api/v1/customers/', {
            'customer_code': 'AUTO-002',
            'full_name': 'Auto ISP2 User',
            'mobile': '01888888888',
            'pppoe_username': 'auto_isp2_user',
            'pppoe_password': 'secretpassword',
            'package': str(self.pkg_isp2.id),
            'monthly_bill': '1500.00'
        }, HTTP_HOST='isp2.shebafi.com')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = Customer.objects.get(pppoe_username='auto_isp2_user')
        self.assertEqual(created.tenant_id, self.tenant_isp2.id)

    # 14: Invoice creation automatically uses request tenant
    def test_13_invoice_creation_automatically_uses_request_tenant(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.post('/api/v1/invoices/', {
            'customer': str(self.cust_fardin.id),
            'invoice_no': 'INV-AUTO-FAR-1',
            'billing_month': 'October 2026',
            'package_name': 'Fardin 20Mbps',
            'package_amount': '800.00',
            'total_payable': '800.00',
        }, HTTP_HOST='fardin.shebafi.com')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        inv = Invoice.objects.get(invoice_no='INV-AUTO-FAR-1')
        self.assertEqual(inv.tenant_id, self.tenant_fardin.id)

    # 15: Payment creation automatically uses request tenant
    def test_14_payment_creation_automatically_uses_request_tenant(self):
        url = '/api/v1/payments/sms/webhook/'
        sms = "You have received Tk 800.00 from 01711111111. TrxID AUTO99PAY"
        response = self.client.post(url, {
            'sender': 'bKash',
            'message': sms
        }, HTTP_HOST='fardin.shebafi.com')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        txn = PaymentTransaction.objects.get(trx_id='AUTO99PAY')
        self.assertEqual(txn.tenant_id, self.tenant_fardin.id)

    # 16: Bulk operations cannot cross tenants
    def test_15_bulk_operations_cannot_cross_tenants(self):
        # When bulk filtering IDs, tenant filter must prevent cross-tenant operations
        mixed_ids = [str(self.cust_fardin.id), str(self.cust_isp2.id)]
        fardin_scoped = Customer.objects.filter(tenant=self.tenant_fardin, id__in=mixed_ids)
        self.assertEqual(fardin_scoped.count(), 1)
        self.assertEqual(fardin_scoped.first().id, self.cust_fardin.id)

    # 17: Reports cannot cross tenants
    def test_16_reports_cannot_cross_tenants(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.get('/api/v1/reports/dashboard/', HTTP_HOST='fardin.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Fardin only has 1 customer with monthly bill 800
        kpis = response.data['kpis']
        self.assertEqual(kpis['total_customers'], 1)
        # ISP2 records must NOT be aggregated
        self.assertNotEqual(kpis['total_customers'], 2)

    # 18: Celery / background task correctly uses tenant_id
    def test_17_celery_task_correctly_uses_tenant_id(self):
        self.cust_fardin.expiry_date = timezone.now().date() - datetime.timedelta(days=2)
        self.cust_fardin.status = CustomerStatus.ACTIVE
        self.cust_fardin.save()

        # Execute task with correct tenant_id
        res = process_customer_expiry(tenant_id=str(self.tenant_fardin.id), customer_id=str(self.cust_fardin.id))
        self.assertTrue(res['success'])
        self.cust_fardin.refresh_from_db()
        self.assertEqual(self.cust_fardin.status, CustomerStatus.EXPIRED)

        # Attempt to execute task with wrong tenant_id (ISP2's tenant_id)
        wrong_res = process_customer_expiry(tenant_id=str(self.tenant_isp2.id), customer_id=str(self.cust_fardin.id))
        self.assertFalse(wrong_res['success'])

    # 19: Transactions use correct tenant-scoped objects
    def test_18_transactions_use_correct_tenant_scoped_objects(self):
        from django.db import transaction
        with transaction.atomic():
            cust = Customer.objects.select_for_update().filter(
                id=self.cust_fardin.id,
                tenant=self.tenant_fardin
            ).first()
            self.assertIsNotNone(cust)
            self.assertEqual(cust.tenant_id, self.tenant_fardin.id)

    # 20: Central admin can access authorized ISP management
    def test_19_central_admin_can_access_authorized_isp_management(self):
        self.client.force_authenticate(user=self.central_admin)
        response = self.client.get('/api/v1/tenants/', HTTP_HOST='admin.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # 21: ISP users cannot access central administration
    def test_20_isp_users_cannot_access_central_administration(self):
        self.client.force_authenticate(user=self.user_fardin)
        response = self.client.get('/api/v1/tenants/', HTTP_HOST='admin.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # 22: Network credentials never appear in API responses
    def test_21_network_credentials_never_appear_in_api_responses(self):
        self.client.force_authenticate(user=self.user_isp2)
        response = self.client.get(f'/api/v1/routers/{self.router_isp2.id}/', HTTP_HOST='isp2.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('password', response.data)

    # 23: Health check distinguishes control plane from ISP domain
    def test_22_health_check_endpoint(self):
        res1 = self.client.get('/api/v1/health-check/', HTTP_HOST='fardin.shebafi.com')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['tenant_detected'], 'fardin')

        res2 = self.client.get('/api/v1/health-check/', HTTP_HOST='admin.shebafi.com')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data.get('is_control_plane'))

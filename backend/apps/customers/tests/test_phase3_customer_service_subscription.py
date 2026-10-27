from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, CompanySetting
from apps.authentication.models import Role, Permission, StaffMembership, UserRole, StaffProfile
from apps.billing.models import Package, Invoice
from apps.customers.models import Customer, CustomerStatus, CustomerService, CustomerSubscription, ServiceStatus, SubscriptionStatus
from apps.payments.models import PaymentTransaction


class CustomerServiceSubscriptionPhase3Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenant A setup
        self.tenant_a = Tenant.objects.create(
            name='SpeedNet Broadband',
            slug='speednet',
            domain='speednet.example.com',
            subscription_status='active',
            is_active=True,
            plan='Enterprise',
        )
        self.user_a = User.objects.create_user(
            username='admin_speednet',
            email='admin@speednet.com',
            password='securepassword123',
        )
        self.profile_a = StaffProfile.objects.create(
            user=self.user_a,
            tenant=self.tenant_a,
            role=UserRole.ADMIN,
        )
        self.role_admin_a, _ = Role.objects.get_or_create(
            tenant=self.tenant_a,
            name='Admin',
        )
        self.membership_a, _ = StaffMembership.objects.get_or_create(
            user=self.user_a,
            tenant=self.tenant_a,
            defaults={'role': self.role_admin_a, 'scope': StaffMembership.Scope.GLOBAL, 'is_active': True}
        )

        # Tenant B setup
        self.tenant_b = Tenant.objects.create(
            name='QuickFiber ISP',
            slug='quickfiber',
            domain='quickfiber.example.com',
            subscription_status='active',
            is_active=True,
            plan='Growth',
        )
        self.user_b = User.objects.create_user(
            username='admin_quickfiber',
            email='admin@quickfiber.com',
            password='securepassword123',
        )
        self.profile_b = StaffProfile.objects.create(
            user=self.user_b,
            tenant=self.tenant_b,
            role=UserRole.ADMIN,
        )
        self.role_admin_b, _ = Role.objects.get_or_create(
            tenant=self.tenant_b,
            name='Admin',
        )
        self.membership_b, _ = StaffMembership.objects.get_or_create(
            user=self.user_b,
            tenant=self.tenant_b,
            defaults={'role': self.role_admin_b, 'scope': StaffMembership.Scope.GLOBAL, 'is_active': True}
        )

        # Tenant A package
        self.pkg_a = Package.objects.create(
            tenant=self.tenant_a,
            name='Turbo 50M',
            mikrotik_profile='turbo_50m',
            speed_mbps=50,
            upload_speed_mbps=50,
            regular_price=Decimal('1000.00'),
            is_active=True,
        )

        # Tenant B package
        self.pkg_b = Package.objects.create(
            tenant=self.tenant_b,
            name='Basic 10M',
            mikrotik_profile='basic_10m',
            speed_mbps=10,
            upload_speed_mbps=10,
            regular_price=Decimal('500.00'),
            is_active=True,
        )

    def test_customer_creation_auto_service_and_archive(self):
        """Creating customer with package auto-provisions initial service & subscription, then can archive."""
        self.client.force_authenticate(user=self.user_a)
        payload = {
            'customer_code': 'CUS-1001',
            'full_name': 'Rahim Uddin',
            'mobile': '+8801711223344',
            'email': 'rahim@example.com',
            'address': 'House 12, Road 4, Dhanmondi',
            'pppoe_username': 'rahim_speednet',
            'package': str(self.pkg_a.id),
            'monthly_bill': '1000.00',
            'status': 'Active',
        }
        res = self.client.post('/api/v1/customers/', payload, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        cust_id = res.data['id']

        # Verify CustomerService and CustomerSubscription auto-created
        services = CustomerService.objects.filter(customer_id=cust_id, tenant=self.tenant_a)
        self.assertEqual(services.count(), 1)
        svc = services.first()
        self.assertEqual(svc.service_identifier, 'rahim_speednet')
        self.assertEqual(svc.status, ServiceStatus.ACTIVE)

        subs = CustomerSubscription.objects.filter(customer_id=cust_id, tenant=self.tenant_a)
        self.assertEqual(subs.count(), 1)
        sub = subs.first()
        self.assertEqual(sub.status, SubscriptionStatus.ACTIVE)
        self.assertEqual(sub.price, Decimal('1000.00'))

        # Archive customer
        archive_res = self.client.post(f'/api/v1/customers/{cust_id}/archive/', {}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(archive_res.status_code, status.HTTP_200_OK)
        self.assertEqual(archive_res.data['status'], CustomerStatus.ARCHIVED)

    def test_customer_service_lifecycle(self):
        """Services follow strict validated lifecycle: PENDING -> ACTIVE -> SUSPENDED -> ACTIVE -> TERMINATED."""
        self.client.force_authenticate(user=self.user_a)
        customer = Customer.objects.create(
            tenant=self.tenant_a,
            full_name='Karim Hasan',
            mobile='+8801811223344',
            pppoe_username='karim_speednet',
            monthly_bill=Decimal('800.00'),
            status=CustomerStatus.ACTIVE,
        )

        # Create secondary service (e.g. Dedicated Static IP)
        svc_payload = {
            'customer': str(customer.id),
            'service_type': 'STATIC_IP',
            'service_identifier': '103.145.22.45',
            'monthly_price': '300.00',
            'notes': 'Static IP for remote CCTV',
        }
        create_res = self.client.post('/api/v1/services/', svc_payload, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        svc_id = create_res.data['id']
        self.assertEqual(create_res.data['status'], ServiceStatus.PENDING)

        # Activate service
        act_res = self.client.post(f'/api/v1/services/{svc_id}/activate/', {}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(act_res.status_code, status.HTTP_200_OK)
        self.assertEqual(act_res.data['service']['status'], ServiceStatus.ACTIVE)

        # Suspend service
        susp_res = self.client.post(f'/api/v1/services/{svc_id}/suspend/', {'reason': 'Non-payment'}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(susp_res.status_code, status.HTTP_200_OK)
        self.assertEqual(susp_res.data['service']['status'], ServiceStatus.SUSPENDED)

        # Resume service
        res_res = self.client.post(f'/api/v1/services/{svc_id}/resume/', {}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(res_res.status_code, status.HTTP_200_OK)
        self.assertEqual(res_res.data['service']['status'], ServiceStatus.ACTIVE)

        # Terminate service
        term_res = self.client.post(f'/api/v1/services/{svc_id}/terminate/', {'reason': 'Client moved out'}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(term_res.status_code, status.HTTP_200_OK)
        self.assertEqual(term_res.data['service']['status'], ServiceStatus.TERMINATED)

        # Invalid activation of terminated service must return 400
        inv_res = self.client.post(f'/api/v1/services/{svc_id}/activate/', {}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(inv_res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_subscription_lifecycle(self):
        """Subscriptions transition through ACTIVE, SUSPENDED, RENEW, and CANCEL."""
        self.client.force_authenticate(user=self.user_a)
        customer = Customer.objects.create(
            tenant=self.tenant_a,
            full_name='Sub User',
            mobile='+8801911223344',
            pppoe_username='sub_user',
            monthly_bill=Decimal('1000.00'),
            status=CustomerStatus.ACTIVE,
        )
        service = CustomerService.objects.create(
            tenant=self.tenant_a,
            customer=customer,
            package=self.pkg_a,
            service_identifier='sub_user',
            service_type='BROADBAND',
            status=ServiceStatus.ACTIVE,
            monthly_price=Decimal('1000.00'),
        )

        sub_payload = {
            'customer': str(customer.id),
            'service': str(service.id),
            'package': str(self.pkg_a.id),
            'billing_cycle': 'MONTHLY',
            'price': '1000.00',
            'discount': '50.00',
        }
        res = self.client.post('/api/v1/subscriptions/', sub_payload, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sub_id = res.data['id']

        # Activate
        act_res = self.client.post(f'/api/v1/subscriptions/{sub_id}/activate/', {}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(act_res.status_code, status.HTTP_200_OK)
        self.assertEqual(act_res.data['subscription']['status'], SubscriptionStatus.ACTIVE)

        # Renew
        renew_res = self.client.post(f'/api/v1/subscriptions/{sub_id}/renew/', {'days': 30}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(renew_res.status_code, status.HTTP_200_OK)

        # Suspend
        susp_res = self.client.post(f'/api/v1/subscriptions/{sub_id}/suspend/', {}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(susp_res.status_code, status.HTTP_200_OK)
        self.assertEqual(susp_res.data['subscription']['status'], SubscriptionStatus.SUSPENDED)

        # Resume
        res_res = self.client.post(f'/api/v1/subscriptions/{sub_id}/resume/', {}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(res_res.status_code, status.HTTP_200_OK)
        self.assertEqual(res_res.data['subscription']['status'], SubscriptionStatus.ACTIVE)

        # Cancel
        cancel_res = self.client.post(f'/api/v1/subscriptions/{sub_id}/cancel/', {}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(cancel_res.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_res.data['subscription']['status'], SubscriptionStatus.CANCELLED)

    def test_end_to_end_customer_to_payment_flow(self):
        """End-to-End Flow: Customer -> Service -> Subscription -> Invoice -> Payment -> Paid."""
        self.client.force_authenticate(user=self.user_a)

        # 1. Customer
        customer = Customer.objects.create(
            tenant=self.tenant_a,
            full_name='Anisul Islam',
            mobile='+8801511223344',
            pppoe_username='anisul_speednet',
            package=self.pkg_a,
            monthly_bill=Decimal('1000.00'),
            status=CustomerStatus.ACTIVE,
        )

        # 2. Service
        service = CustomerService.objects.create(
            tenant=self.tenant_a,
            customer=customer,
            package=self.pkg_a,
            service_identifier='anisul_speednet',
            service_type='BROADBAND',
            status=ServiceStatus.ACTIVE,
            monthly_price=Decimal('1000.00'),
        )

        # 3. Subscription
        subscription = CustomerSubscription.objects.create(
            tenant=self.tenant_a,
            customer=customer,
            service=service,
            package=self.pkg_a,
            price=Decimal('1000.00'),
            status=SubscriptionStatus.ACTIVE,
            start_date=timezone.localdate(),
        )

        # 4. Invoice
        inv_payload = {
            'customer': str(customer.id),
            'service': str(service.id),
            'subscription': str(subscription.id),
            'billing_month': 'October 2026',
            'package_name': 'Turbo 50M',
            'package_amount': '1000.00',
            'discount': '0.00',
            'total_payable': '1000.00',
            'status': 'DRAFT',
        }
        inv_res = self.client.post('/api/v1/invoices/', inv_payload, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(inv_res.status_code, status.HTTP_201_CREATED)
        inv_id = inv_res.data['id']
        self.assertEqual(inv_res.data['status'], 'DRAFT')

        # 5. Issue Invoice
        issue_res = self.client.post(f'/api/v1/invoices/{inv_id}/issue/', {}, HTTP_X_TENANT_ID=str(self.tenant_a.id))
        self.assertEqual(issue_res.status_code, status.HTTP_200_OK)
        self.assertEqual(issue_res.data['invoice']['status'], 'ISSUED')

        # 6. Pay Invoice
        pay_res = self.client.post(
            f'/api/v1/invoices/{inv_id}/pay/',
            {'amount': '1000.00', 'payment_method': 'Cash'},
            HTTP_X_TENANT_ID=str(self.tenant_a.id)
        )
        self.assertEqual(pay_res.status_code, status.HTTP_200_OK)

        # 7. Verify Invoice is PAID
        invoice = Invoice.objects.get(id=inv_id)
        self.assertEqual(invoice.status, Invoice.InvoiceStatus.PAID)
        self.assertEqual(invoice.paid_amount, Decimal('1000.00'))
        self.assertEqual(invoice.due_amount, Decimal('0.00'))

    def test_tenant_isolation_cross_tenant_access_blocked(self):
        """Tenant B staff MUST NOT be able to view, update or pay Tenant A resources."""
        # Tenant A resources
        cust_a = Customer.objects.create(
            tenant=self.tenant_a,
            full_name='Secret Customer A',
            mobile='+8801700000001',
            pppoe_username='secret_a',
            status=CustomerStatus.ACTIVE,
        )
        svc_a = CustomerService.objects.create(
            tenant=self.tenant_a,
            customer=cust_a,
            service_identifier='secret_a',
            service_type='BROADBAND',
            status=ServiceStatus.ACTIVE,
        )
        sub_a = CustomerSubscription.objects.create(
            tenant=self.tenant_a,
            customer=cust_a,
            service=svc_a,
            package=self.pkg_a,
            price=Decimal('1000.00'),
            status=SubscriptionStatus.ACTIVE,
        )
        inv_a = Invoice.objects.create(
            tenant=self.tenant_a,
            customer=cust_a,
            service=svc_a,
            subscription=sub_a,
            invoice_no='INV-TEST-A-001',
            billing_month='October 2026',
            package_name='Turbo 50M',
            package_amount=Decimal('1000.00'),
            total_payable=Decimal('1000.00'),
            status=Invoice.InvoiceStatus.UNPAID,
        )

        # Authenticate as Tenant B
        self.client.force_authenticate(user=self.user_b)
        hdr_b = {'HTTP_X_TENANT_ID': str(self.tenant_b.id)}

        # Attempt to read Tenant A customer
        res = self.client.get(f'/api/v1/customers/{cust_a.id}/', **hdr_b)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Attempt to read Tenant A service
        res = self.client.get(f'/api/v1/services/{svc_a.id}/', **hdr_b)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Attempt to read Tenant A subscription
        res = self.client.get(f'/api/v1/subscriptions/{sub_a.id}/', **hdr_b)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Attempt to read Tenant A invoice
        res = self.client.get(f'/api/v1/invoices/{inv_a.id}/', **hdr_b)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Attempt to pay Tenant A invoice from Tenant B
        res = self.client.post(f'/api/v1/invoices/{inv_a.id}/pay/', {'amount': '1000.00'}, **hdr_b)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

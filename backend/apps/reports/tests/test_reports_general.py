from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import StaffProfile, StaffMembership, Role, UserRole
from apps.authentication.services.rbac import seed_default_roles_for_tenant, ensure_permission_catalog
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.payments.models import PaymentTransaction, SmsLog
from apps.network.models import Router, UserSession, ONU
from apps.support.models import Ticket


class DashboardAnalyticsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        ensure_permission_catalog()

        # Tenant A
        self.tenant_a = Tenant.objects.create(
            name='Alpha Net',
            slug='alpha',
            domain='alpha.shebafi.xyz',
            is_active=True
        )
        self.domain_a = TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname='alpha.shebafi.xyz',
            is_active=True,
            is_primary=True
        )
        seed_default_roles_for_tenant(self.tenant_a)
        self.role_admin_a = Role.objects.get(tenant=self.tenant_a, name='Admin')

        self.user_a = User.objects.create_user(
            username='admin_a',
            password='password123',
            email='admin@alpha.shebafi.xyz'
        )
        self.membership_a = StaffMembership.objects.create(
            user=self.user_a,
            tenant=self.tenant_a,
            role=self.role_admin_a,
            is_active=True
        )

        # Tenant B (for isolation test)
        self.tenant_b = Tenant.objects.create(
            name='Beta Net',
            slug='beta',
            domain='beta.shebafi.xyz',
            is_active=True
        )
        self.domain_b = TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname='beta.shebafi.xyz',
            is_active=True,
            is_primary=True
        )

        today = timezone.now().date()

        # Package
        self.package = Package.objects.create(
            tenant=self.tenant_a,
            name='Starter 20M',
            mikrotik_profile='20M',
            speed_mbps=20,
            regular_price=800.00
        )

        # Router
        self.router = Router.objects.create(
            tenant=self.tenant_a,
            name='Core-CCR-01',
            ip_address='10.0.0.1',
            status='Online'
        )

        # Customers in Tenant A
        # 1. Active, online, expires today
        self.c1 = Customer.objects.create(
            tenant=self.tenant_a,
            pppoe_username='user1_exp_today',
            full_name='User One Exp Today',
            mobile='01700000001',
            monthly_bill=1000.00,
            due_amount=500.00,
            status=CustomerStatus.ACTIVE,
            expiry_date=today,
            package=self.package,
            router=self.router
        )
        # Online session for c1
        UserSession.objects.create(
            tenant=self.tenant_a,
            router=self.router,
            username=self.c1.pppoe_username,
            ip_address='10.10.0.2'
        )

        # 2. Active, offline, expires in 2 days, promise client
        self.c2 = Customer.objects.create(
            tenant=self.tenant_a,
            pppoe_username='user2_exp_2d',
            full_name='User Two Exp 2D',
            mobile='01700000002',
            monthly_bill=1200.00,
            due_amount=0.00,
            status=CustomerStatus.ACTIVE,
            expiry_date=today + timedelta(days=2),
            promise_date=today + timedelta(days=3),
            package=self.package
        )

        # 3. Active, offline, expires in 5 days, free client
        self.c3 = Customer.objects.create(
            tenant=self.tenant_a,
            pppoe_username='user3_free',
            full_name='User Three Free',
            mobile='01700000003',
            monthly_bill=0.00,
            due_amount=0.00,
            status=CustomerStatus.ACTIVE,
            expiry_date=today + timedelta(days=5),
            package=self.package
        )

        # 4. Expired customer
        self.c4 = Customer.objects.create(
            tenant=self.tenant_a,
            pppoe_username='user4_expired',
            full_name='User Four Expired',
            mobile='01700000004',
            monthly_bill=800.00,
            due_amount=800.00,
            status=CustomerStatus.EXPIRED,
            expiry_date=today - timedelta(days=5),
            package=self.package
        )

        # 5. Left customer
        self.c5 = Customer.objects.create(
            tenant=self.tenant_a,
            pppoe_username='user5_left',
            full_name='User Five Left',
            mobile='01700000005',
            monthly_bill=500.00,
            due_amount=0.00,
            status=CustomerStatus.LEFT,
            package=self.package
        )

        # Customer in Tenant B (should NOT appear in Tenant A stats)
        Customer.objects.create(
            tenant=self.tenant_b,
            pppoe_username='tenant_b_user',
            full_name='Tenant B Customer',
            mobile='01800000001',
            monthly_bill=2000.00,
            due_amount=1000.00,
            status=CustomerStatus.ACTIVE,
            expiry_date=today
        )

        # Today's payment transaction in Tenant A
        PaymentTransaction.objects.create(
            tenant=self.tenant_a,
            customer=self.c1,
            amount=500.00,
            trx_id='TRX-ALPHA-001',
            payment_method='bKash',
            status='Success'
        )

        # SMS Log in Tenant A
        SmsLog.objects.create(
            tenant=self.tenant_a,
            sender='+8801700000001',
            raw_message='bKash payment Tk 500 received. Trx TRX-ALPHA-001',
            parsed_amount=500.00,
            parsed_trx_id='TRX-ALPHA-001',
            is_matched=True,
            matched_customer=self.c1
        )

        # Open Ticket in Tenant A
        Ticket.objects.create(
            tenant=self.tenant_a,
            customer=self.c1,
            ticket_no='TCK-1001',
            subject='Fiber loss on PON 2',
            description='Customer reports Red LOS on router',
            priority='Critical',
            status='Open'
        )

    def test_tenant_dashboard_kpis_and_metrics(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(
            '/api/v1/reports/dashboard/?nocache=1',
            HTTP_HOST='alpha.shebafi.xyz'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        kpis = data['kpis']
        # Check all 15 requested metrics
        self.assertEqual(kpis['total_clients'], 5)
        self.assertEqual(kpis['active_clients'], 3)
        self.assertEqual(kpis['online_now'], 1)
        self.assertEqual(kpis['offline_now'], 2)  # 3 active - 1 online = 2
        self.assertEqual(kpis['due_clients'], 2)  # c1 (500) and c4 (800)
        self.assertEqual(kpis['expired_clients'], 1)  # c4
        self.assertEqual(kpis['inactive_clients'], 2)  # c4 (Expired) + c5 (Left)
        self.assertEqual(kpis['joined_this_month'], 5)
        self.assertEqual(kpis['expire_today'], 1)  # c1
        self.assertEqual(kpis['expire_in_2_days'], 1)  # c2
        self.assertEqual(kpis['expire_in_5_days'], 2)  # c2 and c3
        self.assertEqual(kpis['left_clients'], 1)  # c5
        self.assertEqual(kpis['free_clients'], 1)  # c3 (monthly_bill = 0)
        self.assertEqual(kpis['promise_clients'], 1)  # c2 (promise_date set)
        self.assertEqual(kpis['open_tickets'], 1)
        self.assertEqual(kpis['todays_revenue'], 500.00)

        # Financial metrics
        self.assertEqual(kpis['active_client_bill'], 2200.00)  # c1 (1000) + c2 (1200) + c3 (0)
        self.assertEqual(kpis['outstanding_bill'], 1300.00)  # c1 (500) + c4 (800)

        # Financial Communication History
        comm_history = data.get('financial_communication_history', [])
        self.assertTrue(len(comm_history) >= 1)
        self.assertEqual(comm_history[0]['trx_id'], 'TRX-ALPHA-001')
        self.assertEqual(comm_history[0]['customer_name'], 'User One Exp Today')

        # Client Distribution
        dist = data.get('client_distribution', {})
        self.assertTrue('by_status' in dist)
        self.assertTrue('top_packages' in dist)

        # Action Required
        action_req = data.get('action_required', {})
        self.assertEqual(action_req['expire_today'], 1)
        self.assertEqual(action_req['expire_in_2_days'], 1)
        self.assertEqual(action_req['critical_tickets'], 1)
        self.assertTrue(len(action_req.get('items', [])) >= 1)

        # Recent Activity
        recent = data.get('recent_activity', [])
        self.assertTrue(len(recent) >= 1)

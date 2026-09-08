"""
STAGE 8: Security Hardening & Regression Test Suite
Validates:
- No cross-tenant reads or writes (IDOR)
- No tenant switching via request body/params
- No secret leakage (PPPoE passwords, router credentials, gateway keys, OLT credentials)
- Object-level authorization and RBAC capability checks on destructive actions
- Cross-tenant staff assignment prevention
- Action serializers validation (RechargeRequest, PaymentRequest, LockCustomer, ToggleInternet, RouterAction, ONUAction)
- Public query endpoints enforce tenant boundaries (no global scans)
- Security headers presence
"""

import uuid
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import StaffProfile, StaffMembership, Role, Permission, UserRole
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice, Recharge
from apps.payments.models import PaymentGateway, PaymentTransaction, TransactionStatus
from apps.network.models import Router, OLT, ONU
from apps.support.models import Ticket
from apps.tasks.models import Task


class Stage8SecurityHardeningTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # ─── Tenant A (Alpha ISP) ───
        self.tenant_a = Tenant.objects.create(
            name='Alpha Net',
            slug='alpha',
            domain='alpha.shebafi.com',
            is_active=True
        )
        self.domain_a = TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname='alpha.shebafi.com',
            is_active=True,
            is_primary=True
        )
        self.user_a_admin = User.objects.create_user(username='alpha_admin', password='password123')
        self.token_a_admin, _ = Token.objects.get_or_create(user=self.user_a_admin)
        self.profile_a_admin = StaffProfile.objects.create(
            user=self.user_a_admin,
            tenant=self.tenant_a,
            role=UserRole.ADMIN
        )
        self.membership_a_admin, _ = StaffMembership.objects.get_or_create(
            user=self.user_a_admin,
            tenant=self.tenant_a,
            defaults={'is_active': True}
        )

        # Limited Tech Staff under Tenant A (No recharge or billing capability)
        self.user_a_tech = User.objects.create_user(username='alpha_tech', password='password123')
        self.token_a_tech, _ = Token.objects.get_or_create(user=self.user_a_tech)
        self.profile_a_tech = StaffProfile.objects.create(
            user=self.user_a_tech,
            tenant=self.tenant_a,
            role=UserRole.TECHNICIAN
        )
        self.membership_a_tech, _ = StaffMembership.objects.get_or_create(
            user=self.user_a_tech,
            tenant=self.tenant_a,
            defaults={'is_active': True}
        )

        # ─── Tenant B (Beta Telecom) ───
        self.tenant_b = Tenant.objects.create(
            name='Beta Telecom',
            slug='beta',
            domain='beta.shebafi.com',
            is_active=True
        )
        self.domain_b = TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname='beta.shebafi.com',
            is_active=True,
            is_primary=True
        )
        self.user_b_admin = User.objects.create_user(username='beta_admin', password='password123')
        self.token_b_admin, _ = Token.objects.get_or_create(user=self.user_b_admin)
        self.profile_b_admin = StaffProfile.objects.create(
            user=self.user_b_admin,
            tenant=self.tenant_b,
            role=UserRole.ADMIN
        )
        self.membership_b_admin, _ = StaffMembership.objects.get_or_create(
            user=self.user_b_admin,
            tenant=self.tenant_b,
            defaults={'is_active': True}
        )

        # Packages
        self.pkg_a = Package.objects.create(
            tenant=self.tenant_a,
            name='Alpha 10M',
            mikrotik_profile='10M',
            regular_price=Decimal('500.00')
        )
        self.pkg_b = Package.objects.create(
            tenant=self.tenant_b,
            name='Beta 15M',
            mikrotik_profile='15M',
            regular_price=Decimal('600.00')
        )

        # Customers
        self.cust_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-A-001',
            full_name='Alpha Subscriber',
            mobile='01711000001',
            pppoe_username='alpha_user',
            pppoe_password='SuperSecretAlphaPassword',
            package=self.pkg_a,
            monthly_bill=Decimal('500.00'),
            status=CustomerStatus.ACTIVE
        )
        self.cust_b = Customer.objects.create(
            tenant=self.tenant_b,
            customer_code='CUST-B-001',
            full_name='Beta Subscriber',
            mobile='01811000002',
            pppoe_username='beta_user',
            pppoe_password='SuperSecretBetaPassword',
            package=self.pkg_b,
            monthly_bill=Decimal('600.00'),
            status=CustomerStatus.ACTIVE
        )

        # Routers
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name='Alpha-Core-01',
            ip_address='10.0.1.1',
            username='alpha_admin',
            password='AlphaRouterSecretPassword',
            api_port=8728
        )
        self.router_b = Router.objects.create(
            tenant=self.tenant_b,
            name='Beta-Core-01',
            ip_address='10.0.2.1',
            username='beta_admin',
            password='BetaRouterSecretPassword',
            api_port=8728
        )

        # Payment Gateways
        self.gw_a = PaymentGateway.objects.create(
            tenant=self.tenant_a,
            provider='bKash',
            app_key='bkash_app_key_alpha',
            app_secret='bkash_secret_should_never_leak',
            password='gw_password_super_secret',
            is_active=True
        )

        # OLT & ONU
        self.olt_a = OLT.objects.create(
            tenant=self.tenant_a,
            name='Alpha-OLT-1',
            ip_address='10.0.1.10',
            telnet_user='admin',
            telnet_password='OLTSuperSecretPassword',
            snmp_community='private_community_alpha'
        )
        self.onu_a = ONU.objects.create(
            tenant=self.tenant_a,
            olt=self.olt_a,
            pon_port='gpon 0/1',
            onu_index=1,
            mac_address='AA:BB:CC:DD:EE:01',
            customer=self.cust_a,
            status='Online'
        )

        # Tickets & Tasks
        self.ticket_a = Ticket.objects.create(
            tenant=self.tenant_a,
            customer=self.cust_a,
            ticket_no='TKT-A-100',
            subject='Fiber cut issue'
        )
        self.task_a = Task.objects.create(
            tenant=self.tenant_a,
            title='Fix fiber splice at Alpha box'
        )

        # Invoice
        self.inv_b = Invoice.objects.create(
            tenant=self.tenant_b,
            customer=self.cust_b,
            invoice_no='INV-B-999',
            billing_month='September 2026',
            package_name='Beta 15M',
            package_amount=Decimal('600.00'),
            total_payable=Decimal('600.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. CROSS-TENANT READ ISOLATION (IDOR PREVENTION)
    # ─────────────────────────────────────────────────────────────────────────
    def test_01_cross_tenant_read_blocked(self):
        """Tenant A staff cannot view Tenant B's customers, routers, tickets, or invoices by ID."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a_admin.key}')
        headers = {'HTTP_HOST': 'alpha.shebafi.com'}

        # Customer IDOR
        res = self.client.get(f'/api/v1/customers/{self.cust_b.id}/', **headers)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Router IDOR
        res = self.client.get(f'/api/v1/routers/{self.router_b.id}/', **headers)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Invoice IDOR
        res = self.client.get(f'/api/v1/invoices/{self.inv_b.id}/', **headers)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. CROSS-TENANT WRITE ISOLATION
    # ─────────────────────────────────────────────────────────────────────────
    def test_02_cross_tenant_write_blocked(self):
        """Tenant A staff cannot mutate Tenant B's customer via PATCH, DELETE, recharge, or toggle."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a_admin.key}')
        headers = {'HTTP_HOST': 'alpha.shebafi.com'}

        # PATCH attempt
        res = self.client.patch(
            f'/api/v1/customers/{self.cust_b.id}/',
            {'full_name': 'Hacked Name'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # DELETE attempt
        res = self.client.delete(f'/api/v1/customers/{self.cust_b.id}/', **headers)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Recharge action attempt
        res = self.client.post(
            f'/api/v1/customers/{self.cust_b.id}/recharge/',
            {'amount': '500.00', 'validity_days': 30, 'payment_method': 'Cash'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Toggle internet attempt
        res = self.client.post(
            f'/api/v1/customers/{self.cust_b.id}/toggle-internet/',
            {'state': 'off'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. TENANT SWITCHING VIA REQUEST BODY / INJECTION BLOCKED
    # ─────────────────────────────────────────────────────────────────────────
    def test_03_tenant_switching_body_injection_ignored(self):
        """Injecting another tenant's ID in request body never switches context or creates cross-tenant records."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a_admin.key}')
        headers = {'HTTP_HOST': 'alpha.shebafi.com'}

        # Attempt to create customer under Tenant B by passing 'tenant' / 'tenant_id'
        payload = {
            'customer_code': 'EVIL-001',
            'full_name': 'Injected Customer',
            'mobile': '01999999999',
            'pppoe_username': 'evil_sub',
            'package': str(self.pkg_a.id),
            'monthly_bill': '500.00',
            'tenant': str(self.tenant_b.id),
            'tenant_id': str(self.tenant_b.id),
        }
        res = self.client.post('/api/v1/customers/', payload, format='json', **headers)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        created_cust = Customer.objects.get(pppoe_username='evil_sub')
        # Crucial: Customer MUST belong to Tenant A, NOT Tenant B
        self.assertEqual(created_cust.tenant_id, self.tenant_a.id)

    def test_04_sms_webhook_strict_tenant_resolution(self):
        """Calling SMS webhook without tenant domain host is rejected (body tenant override denied)."""
        # Unauthenticated request with foreign host (no tenant match) but tenant_id in body
        payload = {
            'tenant_id': str(self.tenant_a.id),
            'message': 'bKash Tk 500 from 01711000001 TrxID BK12345678',
        }
        # No matching tenant header / invalid host
        res = self.client.post('/api/v1/payments/webhook/sms/', payload, format='json', HTTP_HOST='randomhost.com')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Tenant could not be resolved', res.data.get('error', ''))

    # ─────────────────────────────────────────────────────────────────────────
    # 4. SECRET LEAKAGE PREVENTION
    # ─────────────────────────────────────────────────────────────────────────
    def test_05_secret_credentials_never_serialized(self):
        """Ensure sensitive credentials are popped and never leaked in API GET responses."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a_admin.key}')
        headers = {'HTTP_HOST': 'alpha.shebafi.com'}

        # 1. Customer PPPoE Password
        res = self.client.get(f'/api/v1/customers/{self.cust_a.id}/', **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('pppoe_password', res.data)

        # 2. Router Password
        res = self.client.get(f'/api/v1/routers/{self.router_a.id}/', **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('password', res.data)

        # 3. Payment Gateway Secret Keys
        res = self.client.get(f'/api/v1/gateways/{self.gw_a.id}/', **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('app_secret', res.data)
        self.assertNotIn('password', res.data)
        self.assertNotIn('private_key', res.data)

        # 4. OLT Password
        res = self.client.get(f'/api/v1/olts/{self.olt_a.id}/', **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('telnet_password', res.data)
        self.assertNotIn('snmp_community', res.data)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. OBJECT-LEVEL CAPABILITY & AUTHORIZATION CHECKS
    # ─────────────────────────────────────────────────────────────────────────
    def test_06_unauthorized_mutation_blocked_by_capability(self):
        """Tech staff without billing capability cannot perform financial recharge or customer lock."""
        # Using tech staff credentials (who lacks customer.recharge and customer.update capabilities)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a_tech.key}')
        headers = {'HTTP_HOST': 'alpha.shebafi.com'}

        # Attempt recharge
        res = self.client.post(
            f'/api/v1/customers/{self.cust_a.id}/recharge/',
            {'amount': '500.00', 'validity_days': 30, 'payment_method': 'Cash'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt customer lock (requires customer.update)
        res = self.client.post(
            f'/api/v1/customers/{self.cust_a.id}/lock/',
            {'reason': 'Unauthorized lock attempt'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. CROSS-TENANT STAFF ASSIGNMENT PREVENTION
    # ─────────────────────────────────────────────────────────────────────────
    def test_07_cross_tenant_staff_assignment_blocked(self):
        """Tickets and Tasks cannot be assigned to staff members of another ISP tenant."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a_admin.key}')
        headers = {'HTTP_HOST': 'alpha.shebafi.com'}

        # Attempt to assign Alpha's ticket to Beta's admin user
        res = self.client.post(
            f'/api/v1/tickets/{self.ticket_a.id}/assign/',
            {'user_id': self.user_b_admin.id},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Selected user does not belong to this ISP tenant', res.data.get('error', ''))

        # Attempt to assign Alpha's task to Beta's admin user
        res = self.client.post(
            f'/api/v1/tasks/{self.task_a.id}/assign/',
            {'user_id': self.user_b_admin.id},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Selected user does not belong to this ISP tenant', res.data.get('error', ''))

    # ─────────────────────────────────────────────────────────────────────────
    # 7. ACTION SERIALIZERS VALIDATION
    # ─────────────────────────────────────────────────────────────────────────
    def test_08_action_serializers_enforce_validation(self):
        """Action serializers reject invalid inputs (e.g. negative recharge amount, invalid toggle state)."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a_admin.key}')
        headers = {'HTTP_HOST': 'alpha.shebafi.com'}

        # RechargeRequest: Negative amount
        res = self.client.post(
            f'/api/v1/customers/{self.cust_a.id}/recharge/',
            {'amount': '-50.00', 'validity_days': 30},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # RechargeRequest: Zero validity days
        res = self.client.post(
            f'/api/v1/customers/{self.cust_a.id}/recharge/',
            {'amount': '500.00', 'validity_days': 0},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # ToggleInternet: Invalid state string
        res = self.client.post(
            f'/api/v1/customers/{self.cust_a.id}/toggle-internet/',
            {'state': 'explode'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # PaymentRequest: Negative amount on manual payment creation
        res = self.client.post(
            '/api/v1/payments/transactions/',
            {'customer_id': str(self.cust_a.id), 'amount': '-100.00'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. PUBLIC CUSTOMER LOOKUP REQUIRES TENANT BOUNDARY
    # ─────────────────────────────────────────────────────────────────────────
    def test_09_public_customer_lookup_requires_tenant(self):
        """Public customer lookup endpoint rejects queries without tenant context and enforces tenant isolation."""
        # Query without tenant host returns 400
        res = self.client.get('/api/v1/customers/query/?query=alpha_user', HTTP_HOST='unregistered.com')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Tenant context required', res.data.get('error', ''))

        # Query under Alpha domain finds Alpha customer
        res = self.client.get('/api/v1/customers/query/?query=alpha_user', HTTP_HOST='alpha.shebafi.com')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['pppoe_username'], 'alpha_user')

        # Query under Alpha domain looking for Beta customer returns 404 (no cross-tenant leakage)
        res = self.client.get('/api/v1/customers/query/?query=beta_user', HTTP_HOST='alpha.shebafi.com')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # ─────────────────────────────────────────────────────────────────────────
    @patch('apps.network.services.mikrotik.service.MikroTikService.get_active_sessions')
    @patch('apps.network.services.olt.optical.OpticalPowerService.get_signal_metrics')
    def test_10_router_and_onu_action_endpoints(self, mock_optical, mock_sessions):
        """Dedicated action endpoints validate RouterAction and ONUAction serializers."""
        mock_sessions.return_value = [{'name': 'alpha_user', 'uptime': '1h'}]
        mock_optical.return_value = {'rx_power': -19.5, 'tx_power': 2.3, 'signal_status': 'good'}

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a_admin.key}')
        headers = {'HTTP_HOST': 'alpha.shebafi.com'}

        # Router action endpoint with valid action
        res = self.client.post(
            f'/api/v1/routers/{self.router_a.id}/action/',
            {'action': 'active_sessions'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Router action endpoint with invalid action
        res = self.client.post(
            f'/api/v1/routers/{self.router_a.id}/action/',
            {'action': 'unsupported_action'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # ONU action endpoint with optical_power action
        res = self.client.post(
            f'/api/v1/onus/{self.onu_a.id}/action/',
            {'action': 'optical_power'},
            format='json',
            **headers
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    # ─────────────────────────────────────────────────────────────────────────
    # 10. SECURITY HEADERS PRESENT
    # ─────────────────────────────────────────────────────────────────────────
    def test_11_security_headers_present(self):
        """Verify essential security headers (X-Frame-Options, X-Content-Type-Options) are configured."""
        res = self.client.get('/api/v1/health-check/', HTTP_HOST='alpha.shebafi.com')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.headers.get('X-Frame-Options'), 'DENY')
        self.assertEqual(res.headers.get('X-Content-Type-Options'), 'nosniff')

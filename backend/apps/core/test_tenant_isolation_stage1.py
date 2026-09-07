import uuid
from django.test import TestCase
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice, ResellerPricing
from apps.network.models import Router, OLT, ONU, POPBranch
from apps.support.models import Ticket


class Stage1TenantIsolationTests(TestCase):
    """
    STAGE 1 — Multi-Tenant Hardening Verification Test Suite.
    Verifies:
      1. Pure server-derived tenancy from HTTP Host.
      2. Inability of clients to switch tenants via request headers.
      3. Strict 404 on unknown host and 403 on suspended tenant.
      4. Hard IDOR boundaries: Tenant A cannot read, update, or delete Tenant B objects.
      5. Cross-tenant FK relationships are rejected in serializers and model clean().
      6. Database composite unique constraints prevent duplicate resources per-tenant while allowing them across tenants.
    """

    def setUp(self):
        self.client = APIClient()

        # Tenant A: Alpha ISP
        self.tenant_a = Tenant.objects.create(
            name='Alpha Broadband',
            slug='alpha',
            domain='alpha.shebafi.com',
            is_active=True
        )
        TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname='alpha.shebafi.com',
            is_active=True,
            is_primary=True
        )
        self.user_a = User.objects.create_user(username='staff_alpha', password='password123')
        self.profile_a = StaffProfile.objects.create(
            user=self.user_a,
            tenant=self.tenant_a,
            role=UserRole.ADMIN
        )

        # Tenant B: Beta ISP
        self.tenant_b = Tenant.objects.create(
            name='Beta Telecom',
            slug='beta',
            domain='beta.shebafi.com',
            is_active=True
        )
        TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname='beta.shebafi.com',
            is_active=True,
            is_primary=True
        )
        self.user_b = User.objects.create_user(username='staff_beta', password='password123')
        self.profile_b = StaffProfile.objects.create(
            user=self.user_b,
            tenant=self.tenant_b,
            role=UserRole.ADMIN
        )

        # Suspended Tenant
        self.tenant_suspended = Tenant.objects.create(
            name='Suspended ISP',
            slug='suspended',
            domain='suspended.shebafi.com',
            is_active=False
        )
        TenantDomain.objects.create(
            tenant=self.tenant_suspended,
            hostname='suspended.shebafi.com',
            is_active=True
        )

        # Seed data for Tenant A
        self.pkg_a = Package.objects.create(
            tenant=self.tenant_a,
            name='Alpha 25Mbps',
            mikrotik_profile='25M',
            regular_price=1000.00
        )
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name='Alpha Core Router',
            ip_address='10.10.1.1',
            hostname='router-a.sheba.net'
        )
        self.olt_a = OLT.objects.create(
            tenant=self.tenant_a,
            name='Alpha OLT 1',
            ip_address='10.10.1.10'
        )
        self.onu_a = ONU.objects.create(
            tenant=self.tenant_a,
            olt=self.olt_a,
            pon_port='EPON0/1',
            onu_index=1,
            mac_address='AA:BB:CC:11:22:33',
            customer_name='Alpha Subscriber 1'
        )
        self.cust_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='ALP-001',
            full_name='Alpha Cust',
            mobile='01710000001',
            pppoe_username='alpha_user1',
            package=self.pkg_a,
            router=self.router_a,
            monthly_bill=1000.00,
            status=CustomerStatus.ACTIVE
        )
        self.inv_a = Invoice.objects.create(
            tenant=self.tenant_a,
            customer=self.cust_a,
            invoice_no='INV-ALP-001',
            billing_month='September 2026',
            package_name='Alpha 25Mbps',
            package_amount=1000.00,
            total_payable=1000.00
        )
        self.ticket_a = Ticket.objects.create(
            tenant=self.tenant_a,
            customer=self.cust_a,
            ticket_no='TCK-ALP-001',
            category='Fiber Cut',
            subject='LOS Red on Optical ONU',
            description='Customer cannot connect'
        )

        # Seed data for Tenant B
        self.pkg_b = Package.objects.create(
            tenant=self.tenant_b,
            name='Beta 50Mbps',
            mikrotik_profile='50M',
            regular_price=1800.00
        )
        self.router_b = Router.objects.create(
            tenant=self.tenant_b,
            name='Beta Core Router',
            ip_address='10.20.1.1',
            hostname='router-b.sheba.net'
        )
        self.olt_b = OLT.objects.create(
            tenant=self.tenant_b,
            name='Beta OLT 1',
            ip_address='10.20.1.10'
        )
        self.onu_b = ONU.objects.create(
            tenant=self.tenant_b,
            olt=self.olt_b,
            pon_port='EPON0/1',
            onu_index=1,
            mac_address='BB:CC:DD:44:55:66',
            customer_name='Beta Subscriber 1'
        )
        self.cust_b = Customer.objects.create(
            tenant=self.tenant_b,
            customer_code='BET-001',
            full_name='Beta Cust',
            mobile='01820000002',
            pppoe_username='beta_user1',
            package=self.pkg_b,
            router=self.router_b,
            monthly_bill=1800.00,
            status=CustomerStatus.ACTIVE
        )
        self.inv_b = Invoice.objects.create(
            tenant=self.tenant_b,
            customer=self.cust_b,
            invoice_no='INV-BET-001',
            billing_month='September 2026',
            package_name='Beta 50Mbps',
            package_amount=1800.00,
            total_payable=1800.00
        )

    # ─────────────────────────────────────────────────────────────
    # 1. TENANT RESOLUTION & HEADER TAMPERING TESTS
    # ─────────────────────────────────────────────────────────────

    def test_tenant_derived_from_valid_host(self):
        """A valid registered domain derives the matching request.tenant."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/v1/customers/', HTTP_HOST='alpha.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['pppoe_username'], 'alpha_user1')

    def test_unknown_host_rejected(self):
        """Requests with unrecognized Host header receive HTTP 404 TENANT_NOT_FOUND."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/v1/customers/', HTTP_HOST='unregistered-hacker-domain.com')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json().get('code'), 'TENANT_NOT_FOUND')

    def test_suspended_tenant_rejected(self):
        """Requests to an inactive tenant receive HTTP 403 TENANT_INACTIVE."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/v1/customers/', HTTP_HOST='suspended.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.json().get('code'), 'TENANT_INACTIVE')

    def test_client_cannot_switch_tenant_via_header(self):
        """
        Tampering test: Sending X-Tenant-ID='beta' on alpha.shebafi.com must NOT
        switch tenant context to Beta. Data returned must remain Tenant Alpha only.
        """
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(
            '/api/v1/customers/',
            HTTP_HOST='alpha.shebafi.com',
            HTTP_X_TENANT_ID='beta',
            HTTP_X_TENANT_KEY='beta'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        ids = [c['id'] for c in results]
        self.assertIn(str(self.cust_a.id), ids)
        self.assertNotIn(str(self.cust_b.id), ids)

    # ─────────────────────────────────────────────────────────────
    # 2. DATA ISOLATION (READ / UPDATE / DELETE)
    # ─────────────────────────────────────────────────────────────

    def test_tenant_a_cannot_read_tenant_b_customer(self):
        """IDOR GET test: Tenant A cannot read Tenant B's customer."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(f'/api/v1/customers/{self.cust_b.id}/', HTTP_HOST='alpha.shebafi.com')
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_tenant_a_cannot_read_tenant_b_router(self):
        """IDOR GET test: Tenant A cannot read Tenant B's router."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(f'/api/v1/routers/{self.router_b.id}/', HTTP_HOST='alpha.shebafi.com')
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_tenant_a_cannot_read_tenant_b_invoice(self):
        """IDOR GET test: Tenant A cannot read Tenant B's invoice."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(f'/api/v1/invoices/{self.inv_b.id}/', HTTP_HOST='alpha.shebafi.com')
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_tenant_a_cannot_update_tenant_b_customer(self):
        """IDOR PATCH test: Tenant A cannot modify Tenant B's customer."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.patch(
            f'/api/v1/customers/{self.cust_b.id}/',
            {'full_name': 'Hacked Customer Name'},
            HTTP_HOST='alpha.shebafi.com'
        )
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])
        self.cust_b.refresh_from_db()
        self.assertEqual(self.cust_b.full_name, 'Beta Cust')

    def test_tenant_a_cannot_delete_tenant_b_customer(self):
        """IDOR DELETE test: Tenant A cannot delete Tenant B's customer."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.delete(f'/api/v1/customers/{self.cust_b.id}/', HTTP_HOST='alpha.shebafi.com')
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])
        self.assertTrue(Customer.objects.filter(id=self.cust_b.id).exists())

    def test_tenant_a_cannot_delete_tenant_b_router(self):
        """IDOR DELETE test: Tenant A cannot delete Tenant B's router."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.delete(f'/api/v1/routers/{self.router_b.id}/', HTTP_HOST='alpha.shebafi.com')
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])
        self.assertTrue(Router.objects.filter(id=self.router_b.id).exists())

    # ─────────────────────────────────────────────────────────────
    # 3. CROSS-TENANT RELATIONSHIP REJECTION (API & SERIALIZER)
    # ─────────────────────────────────────────────────────────────

    def test_cross_tenant_package_assignment_rejected(self):
        """Tenant A cannot create a customer referencing Tenant B's Package."""
        self.client.force_authenticate(user=self.user_a)
        payload = {
            'customer_code': 'ALP-999',
            'full_name': 'Malicious Assignment Cust',
            'mobile': '01719999999',
            'pppoe_username': 'cross_pkg_user',
            'pppoe_password': 'password123',
            'package': str(self.pkg_b.id),  # Belongs to Tenant B!
            'monthly_bill': 1000.00
        }
        response = self.client.post('/api/v1/customers/', payload, HTTP_HOST='alpha.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('package', str(response.data))

    def test_cross_tenant_router_assignment_rejected(self):
        """Tenant A cannot create a customer referencing Tenant B's Router."""
        self.client.force_authenticate(user=self.user_a)
        payload = {
            'customer_code': 'ALP-998',
            'full_name': 'Malicious Router Cust',
            'mobile': '01718888888',
            'pppoe_username': 'cross_rtr_user',
            'pppoe_password': 'password123',
            'package': str(self.pkg_a.id),
            'router': str(self.router_b.id),  # Belongs to Tenant B!
            'monthly_bill': 1000.00
        }
        response = self.client.post('/api/v1/customers/', payload, HTTP_HOST='alpha.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('router', str(response.data))

    def test_cross_tenant_onu_olt_assignment_rejected(self):
        """Tenant A cannot create an ONU referencing Tenant B's OLT."""
        self.client.force_authenticate(user=self.user_a)
        payload = {
            'olt': str(self.olt_b.id),  # Belongs to Tenant B!
            'pon_port': 'EPON0/2',
            'onu_index': 5,
            'mac_address': 'EE:FF:00:11:22:33',
            'customer_name': 'Hacker ONU'
        }
        response = self.client.post('/api/v1/onus/', payload, HTTP_HOST='alpha.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('olt', str(response.data))

    def test_cross_tenant_invoice_customer_rejected(self):
        """Tenant A cannot create an invoice referencing Tenant B's Customer."""
        self.client.force_authenticate(user=self.user_a)
        payload = {
            'customer': str(self.cust_b.id),  # Belongs to Tenant B!
            'invoice_no': 'INV-FRAUD-001',
            'billing_month': 'September 2026',
            'package_name': 'Alpha 25Mbps',
            'package_amount': '1000.00',
            'total_payable': '1000.00'
        }
        response = self.client.post('/api/v1/invoices/', payload, HTTP_HOST='alpha.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('customer', str(response.data))

    def test_cross_tenant_ticket_customer_rejected(self):
        """Tenant A cannot create a support ticket referencing Tenant B's Customer."""
        self.client.force_authenticate(user=self.user_a)
        payload = {
            'customer': str(self.cust_b.id),  # Belongs to Tenant B!
            'category': 'Billing',
            'subject': 'Cross tenant dispute',
            'description': 'Attempting cross-tenant ticket association'
        }
        response = self.client.post('/api/v1/tickets/', payload, HTTP_HOST='alpha.shebafi.com')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('customer', str(response.data))

    # ─────────────────────────────────────────────────────────────
    # 4. MODEL LEVEL CLEAN() ENFORCEMENT
    # ─────────────────────────────────────────────────────────────

    def test_model_clean_rejects_cross_tenant_onu_olt(self):
        """Direct ORM model clean() rejects ONU associated with cross-tenant OLT."""
        invalid_onu = ONU(
            tenant=self.tenant_a,
            olt=self.olt_b,  # Tenant B
            pon_port='EPON0/1',
            onu_index=10
        )
        with self.assertRaises(ValidationError):
            invalid_onu.clean()

    def test_model_clean_rejects_cross_tenant_customer_package(self):
        """Direct ORM model clean() rejects Customer associated with cross-tenant Package."""
        invalid_cust = Customer(
            tenant=self.tenant_a,
            pppoe_username='orm_cross_user',
            package=self.pkg_b  # Tenant B
        )
        with self.assertRaises(ValidationError):
            invalid_cust.clean()

    def test_model_clean_rejects_cross_tenant_invoice_customer(self):
        """Direct ORM model clean() rejects Invoice associated with cross-tenant Customer."""
        invalid_inv = Invoice(
            tenant=self.tenant_a,
            customer=self.cust_b,  # Tenant B
            invoice_no='INV-CLEAN-001',
            billing_month='September 2026',
            package_name='Alpha 25Mbps',
            package_amount=1000.00,
            total_payable=1000.00
        )
        with self.assertRaises(ValidationError):
            invalid_inv.clean()

    # ─────────────────────────────────────────────────────────────
    # 5. DATABASE COMPOSITE UNIQUE CONSTRAINTS
    # ─────────────────────────────────────────────────────────────

    def test_router_ip_unique_per_tenant_but_allowed_across_tenants(self):
        """
        Database constraint: Same router IP cannot be created twice in Tenant A,
        but CAN coexist across Tenant A and Tenant B.
        """
        from django.db import transaction
        # Duplicate in Tenant A -> must raise IntegrityError
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                Router.objects.create(
                    tenant=self.tenant_a,
                    name='Alpha Secondary Router',
                    ip_address='10.10.1.1'  # Identical to self.router_a.ip_address!
                )

        # Same IP in Tenant B -> succeeds cleanly
        router_b_coexist = Router.objects.create(
            tenant=self.tenant_b,
            name='Beta Router Coexist IP',
            ip_address='10.10.1.1'  # Same IP, different tenant
        )
        self.assertEqual(router_b_coexist.tenant, self.tenant_b)

    def test_package_name_unique_per_tenant_but_allowed_across_tenants(self):
        """
        Database constraint: Same package name cannot be created twice in Tenant A,
        but CAN coexist across Tenant A and Tenant B.
        """
        from django.db import transaction
        # Duplicate in Tenant A -> must raise IntegrityError
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                Package.objects.create(
                    tenant=self.tenant_a,
                    name='Alpha 25Mbps',  # Identical to self.pkg_a.name!
                    mikrotik_profile='25M-2'
                )

        # Same Name in Tenant B -> succeeds cleanly
        pkg_b_coexist = Package.objects.create(
            tenant=self.tenant_b,
            name='Alpha 25Mbps',  # Same name, different tenant
            mikrotik_profile='25M-Beta'
        )
        self.assertEqual(pkg_b_coexist.tenant, self.tenant_b)

    def test_pop_name_unique_per_tenant_but_allowed_across_tenants(self):
        """Database constraint: POPBranch name unique per tenant."""
        from django.db import transaction
        POPBranch.objects.create(tenant=self.tenant_a, name='Central Hub')

        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                POPBranch.objects.create(tenant=self.tenant_a, name='Central Hub')

        branch_b = POPBranch.objects.create(tenant=self.tenant_b, name='Central Hub')
        self.assertEqual(branch_b.tenant, self.tenant_b)

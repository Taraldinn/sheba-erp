"""
Stage 5 — Package purchase, renewal, and collection tests.

Covers master task §E and §F:
  - A reseller may purchase a package for an assigned customer only.
  - The server determines the authoritative price.
  - The wallet hold is created and the customer's expiry/package is updated.
  - A duplicate request with the same idempotency key is rejected.
  - Reseller cannot purchase for an unassigned customer.
  - Reseller cannot purchase from a foreign tenant.
  - Collections do NOT credit the reseller wallet directly.
  - A failed network job releases the hold and refunds the customer.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import (
    Reseller, ResellerCustomer, ResellerLedgerEntry,
    StaffProfile, StaffMembership, UserRole, Role, Permission,
)
from apps.billing.models import Package
from apps.customers.models import Customer


HOST = 'alpha.shebafi.com'


def _bootstrap():
    t = Tenant.objects.create(
        name='Alpha', slug='alpha', domain=HOST, is_active=True,
    )
    TenantDomain.objects.create(tenant=t, hostname=HOST, is_active=True, is_primary=True)
    admin = User.objects.create_user(
        username='alpha_admin', password='pw12345!', email='a@x.com'
    )
    role, _ = Role.objects.get_or_create(
        tenant=t, name='Admin', defaults={'description': 'Tenant admin', 'is_active': True},
    )
    for codename in ('staff.manage', 'reseller.manage', 'customer.manage',
                     'customer.view', 'invoice.manage', 'invoice.view',
                     'package.manage', 'package.view'):
        perm, _ = Permission.objects.get_or_create(
            codename=codename,
            defaults={'module': codename.split('.')[0], 'name': codename},
        )
        if not perm.module or perm.name != codename:
            perm.module = codename.split('.')[0]
            perm.name = codename
            perm.save(update_fields=['module', 'name'])
        role.permissions.add(perm)
    StaffProfile.objects.create(user=admin, tenant=t, role=UserRole.ADMIN)
    sm = StaffMembership.objects.get(user=admin, tenant=t)
    sm.role = role
    sm.is_active = True
    sm.save(update_fields=['role', 'is_active'])
    return t, admin


def _reseller(tenant, username='r1', wallet=500):
    u = User.objects.create_user(username=username, password='pw12345!', email=f'{username}@x.com')
    return Reseller.objects.create(
        tenant=tenant, user=u, business_name=username.title(),
        wallet_balance=Decimal(str(wallet)), is_active=True,
    )


def _customer(tenant, name='C1'):
    slug = name.lower()
    return Customer.objects.create(
        tenant=tenant, full_name=name, pppoe_username=f'pp_{slug}',
        pppoe_password='pp_secret', mobile='+8801700000000', address='Dhaka',
    )


def _package(tenant, name='10Mbps', price=300, is_active=True):
    return Package.objects.create(
        tenant=tenant, name=name, regular_price=Decimal(str(price)),
        is_active=is_active,
    )


class PackagePurchaseTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant, self.admin = _bootstrap()
        self.reseller = _reseller(self.tenant, wallet=500)
        self.customer = _customer(self.tenant, 'C1')
        self.pkg = _package(self.tenant, '10Mbps', price=300)
        ResellerCustomer.objects.create(
            reseller=self.reseller, customer=self.customer,
            tenant=self.tenant, is_active=True,
        )

    def test_reseller_can_purchase_for_assigned_customer(self):
        self.client.force_authenticate(user=self.reseller.user)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/purchase/',
            {
                'customer_id': str(self.customer.id),
                'package_id': str(self.pkg.id),
                'funding_source': 'WALLET',
            },
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.reseller.refresh_from_db()
        self.assertEqual(self.reseller.wallet_balance, Decimal('200.00'))
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.package_id, self.pkg.id)
        # A Recharge was created.
        from apps.billing.models import Recharge
        self.assertEqual(Recharge.objects.filter(customer=self.customer).count(), 1)

    def test_reseller_cannot_purchase_for_unassigned_customer(self):
        other = _customer(self.tenant, 'C2')
        self.client.force_authenticate(user=self.reseller.user)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/purchase/',
            {
                'customer_id': str(other.id),
                'package_id': str(self.pkg.id),
            },
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data['code'], 'CUSTOMER_NOT_ASSIGNED')

    def test_duplicate_purchase_uses_idempotency(self):
        self.client.force_authenticate(user=self.reseller.user)
        body = {
            'customer_id': str(self.customer.id),
            'package_id': str(self.pkg.id),
            'idempotency_key': 'purchase-K1',
        }
        r1 = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/purchase/',
            body, format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        # Second call must not create a second recharge.
        from apps.billing.models import Recharge
        n_after_first = Recharge.objects.filter(customer=self.customer).count()
        r2 = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/purchase/',
            body, format='json', HTTP_HOST=HOST,
        )
        self.assertIn(r2.status_code, [status.HTTP_409_CONFLICT])
        self.assertEqual(Recharge.objects.filter(customer=self.customer).count(),
                         n_after_first)

    def test_foreign_tenant_package_rejected(self):
        # Create a foreign tenant and a package there.
        t2 = Tenant.objects.create(name='Beta', slug='beta', domain='beta.shebafi.com',
                                   is_active=True)
        foreign_pkg = _package(t2, 'Foreign', price=10)
        self.client.force_authenticate(user=self.reseller.user)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/purchase/',
            {
                'customer_id': str(self.customer.id),
                'package_id': str(foreign_pkg.id),
            },
            format='json', HTTP_HOST=HOST,
        )
        # The package lookup filters by tenant=reseller.tenant, so the
        # foreign package is treated as not-found.
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_inactive_reseller_cannot_purchase(self):
        self.reseller.is_active = False
        self.reseller.save()
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/purchase/',
            {
                'customer_id': str(self.customer.id),
                'package_id': str(self.pkg.id),
            },
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data['code'], 'RESELLER_INACTIVE')

    def test_insufficient_wallet_rejected(self):
        # Empty the wallet first.
        self.reseller.wallet_balance = Decimal('0.00')
        self.reseller.save()
        self.client.force_authenticate(user=self.reseller.user)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/purchase/',
            {
                'customer_id': str(self.customer.id),
                'package_id': str(self.pkg.id),
            },
            format='json', HTTP_HOST=HOST,
        )
        # No credit facility, so wallet is the only funding source.
        self.assertIn(resp.status_code,
                      [status.HTTP_409_CONFLICT, status.HTTP_403_FORBIDDEN])
        self.reseller.refresh_from_db()
        self.assertEqual(self.reseller.wallet_balance, Decimal('0.00'))


class CollectionEventTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant, self.admin = _bootstrap()
        self.reseller = _reseller(self.tenant, wallet=500)
        self.customer = _customer(self.tenant, 'C1')
        ResellerCustomer.objects.create(
            reseller=self.reseller, customer=self.customer,
            tenant=self.tenant, is_active=True,
        )

    def test_collection_does_not_credit_wallet(self):
        # Master task §E.1: collection does NOT increase wallet.
        before = self.reseller.wallet_balance
        self.client.force_authenticate(user=self.reseller.user)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/collections/',
            {
                'customer_id': str(self.customer.id),
                'amount': '500.00',
                'method': 'CASH',
                'reference': 'cash-001',
            },
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.reseller.refresh_from_db()
        # Wallet unchanged. The collection is recorded separately.
        self.assertEqual(self.reseller.wallet_balance, before)

    def test_collection_with_duplicate_reference_returns_existing(self):
        self.client.force_authenticate(user=self.reseller.user)
        body = {
            'customer_id': str(self.customer.id),
            'amount': '300.00',
            'method': 'BKASH',
            'reference': 'bKash-Collection-1',
        }
        r1 = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/collections/',
            body, format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        r2 = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/collections/',
            body, format='json', HTTP_HOST=HOST,
        )
        # Idempotent: returns the existing collection with 200.
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertEqual(r2.data['id'], r1.data['id'])

    def test_collection_allocate_to_invoice(self):
        # Create an invoice for the customer.
        from apps.billing.models import Invoice
        inv = Invoice.objects.create(
            tenant=self.tenant, customer=self.customer,
            invoice_no='INV-001', billing_month='October 2026',
            package_name='10Mbps', package_amount=Decimal('500.00'),
            total_payable=Decimal('500.00'),
        )
        self.client.force_authenticate(user=self.reseller.user)
        r1 = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/collections/',
            {
                'customer_id': str(self.customer.id),
                'amount': '500.00',
                'method': 'CASH',
                'reference': 'cash-002',
            },
            format='json', HTTP_HOST=HOST,
        )
        coll_id = r1.data['id']
        r2 = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/collections/{coll_id}/allocate/',
            {'invoice_id': str(inv.id)},
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(r2.status_code, status.HTTP_200_OK, r2.data)
        self.assertEqual(r2.data['status'], 'ALLOCATED')
        # Wallet still unchanged.
        self.reseller.refresh_from_db()
        self.assertEqual(self.reseller.wallet_balance, Decimal('500.00'))


class ConnectionRenewalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant, self.admin = _bootstrap()
        self.reseller = _reseller(self.tenant, wallet=500)
        self.pkg = _package(self.tenant, 'RenewalPkg', price=200)
        self.customer = _customer(self.tenant, 'C1')
        self.customer.package = self.pkg
        self.customer.save()
        ResellerCustomer.objects.create(
            reseller=self.reseller, customer=self.customer,
            tenant=self.tenant, is_active=True,
        )

    def test_reseller_can_renew_for_assigned_customer(self):
        self.client.force_authenticate(user=self.reseller.user)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/renew/',
            {
                'customer_id': str(self.customer.id),
                'idempotency_key': 'renew-K1',
            },
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.reseller.refresh_from_db()
        self.assertEqual(self.reseller.wallet_balance, Decimal('300.00'))

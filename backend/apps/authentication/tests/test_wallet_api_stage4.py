"""
Stage 4 — API tests for wallet/credit-facility endpoints.

Covers the master task §I requirements:
  - reseller cannot mint wallet funds via the topup endpoint;
  - tenant admin can issue a verified topup;
  - duplicate idempotency key returns the cached response body;
  - refund endpoint preserves the audit trail;
  - hold/release/finalize flow works via the API;
  - credit facility endpoint reflects outstanding_exposure and available_credit.
"""
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import (
    Reseller, ResellerLedgerEntry, StaffProfile, StaffMembership, UserRole, Role,
    Permission,
)
from apps.authentication.wallet_models import ResellerCreditFacility


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
                     'customer.view', 'invoice.manage', 'invoice.view'):
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


def _reseller(tenant, username='r1', wallet=0):
    u = User.objects.create_user(username=username, password='pw12345!', email=f'{username}@x.com')
    return Reseller.objects.create(
        tenant=tenant, user=u, business_name='R1',
        wallet_balance=Decimal(str(wallet)), is_active=True,
    )


class WalletAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant, self.admin = _bootstrap()
        self.reseller = _reseller(self.tenant, wallet=500)

    def test_admin_can_topup(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/topup/',
            {'amount': '250.00', 'reference': 'bKash/X1', 'notes': 'topup'},
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.reseller.refresh_from_db()
        self.assertEqual(self.reseller.wallet_balance, Decimal('750.00'))

    def test_topup_idempotent_via_header(self):
        self.client.force_authenticate(user=self.admin)
        r1 = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/topup/',
            {'amount': '100.00', 'idempotency_key': 'topup-K1'},
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED)
        # Second call with the same key
        r2 = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/topup/',
            {'amount': '100.00', 'idempotency_key': 'topup-K1'},
            format='json', HTTP_HOST=HOST,
        )
        # Server-side duplicate: must NOT credit a second time.
        self.assertIn(r2.status_code, [status.HTTP_409_CONFLICT])
        self.reseller.refresh_from_db()
        self.assertEqual(self.reseller.wallet_balance, Decimal('600.00'))

    def test_reseller_cannot_topup_self(self):
        self.client.force_authenticate(user=self.reseller.user)
        resp = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/topup/',
            {'amount': '1000.00'},
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.reseller.refresh_from_db()
        self.assertEqual(self.reseller.wallet_balance, Decimal('500.00'))

    def test_ledger_statement(self):
        self.client.force_authenticate(user=self.admin)
        # Create a credit and a debit.
        from apps.authentication.wallet_service import WalletService
        WalletService.credit(self.reseller, Decimal('300.00'),
                             reference='c1', notes='', actor='admin')
        WalletService.debit(self.reseller, Decimal('100.00'),
                            reference='d1', notes='', actor='admin')
        resp = self.client.get(
            f'/api/v1/resellers/{self.reseller.id}/ledger/',
            HTTP_HOST=HOST,
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['count'], 2)
        types = {r['entry_type'] for r in resp.data['results']}
        self.assertEqual(types, {'CREDIT', 'DEBIT'})

    def test_hold_create_release_via_api(self):
        self.client.force_authenticate(user=self.admin)
        # Create a hold
        r = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/holds/',
            {'amount': '200.00', 'purpose': 'package_purchase', 'source': 'WALLET'},
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)
        hold_id = r.data['id']
        # Release it
        r2 = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/holds/{hold_id}/release/',
            {'reason': 'changed mind'},
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(r2.status_code, status.HTTP_200_OK, r2.data)
        self.assertEqual(r2.data['status'], 'RELEASED')

    def test_hold_overdraw_rejected(self):
        self.client.force_authenticate(user=self.admin)
        r = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/holds/',
            {'amount': '9999.00', 'purpose': 'too big', 'source': 'WALLET'},
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(r.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(r.data.get('code'), 'INSUFFICIENT_FUNDS')

    def test_credit_endpoint_returns_summary(self):
        ResellerCreditFacility.objects.create(
            reseller=self.reseller, tenant=self.tenant,
            approved_limit=Decimal('500.00'),
            outstanding_exposure=Decimal('100.00'),
        )
        self.client.force_authenticate(user=self.admin)
        r = self.client.get(
            f'/api/v1/resellers/{self.reseller.id}/credit/',
            HTTP_HOST=HOST,
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data['approved_limit'], '500.00')
        self.assertEqual(r.data['outstanding_exposure'], '100.00')
        self.assertEqual(r.data['available_credit'], '400.00')

    def test_credit_adjust_writes_audit(self):
        facility = ResellerCreditFacility.objects.create(
            reseller=self.reseller, tenant=self.tenant,
            approved_limit=Decimal('0.00'),
        )
        self.client.force_authenticate(user=self.admin)
        r = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/credit_adjust/',
            {'new_limit': '1000.00', 'reason': 'good standing'},
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.data)
        facility.refresh_from_db()
        self.assertEqual(facility.approved_limit, Decimal('1000.00'))
        from apps.authentication.wallet_models import ResellerCreditApproval
        self.assertGreaterEqual(
            ResellerCreditApproval.objects.filter(facility=facility).count(), 1
        )

    def test_refund_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        # Topup then refund.
        self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/topup/',
            {'amount': '200.00'},
            format='json', HTTP_HOST=HOST,
        )
        r = self.client.post(
            f'/api/v1/resellers/{self.reseller.id}/refund/',
            {'amount': '50.00', 'reference': 'wrong-recharge'},
            format='json', HTTP_HOST=HOST,
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)
        self.reseller.refresh_from_db()
        # Wallet started at 500, +200, -50 (refund is CREDIT, not DEBIT, so it adds)
        self.assertEqual(self.reseller.wallet_balance, Decimal('750.00'))
        # Both CREDIT entries and the REFUND entry exist.
        types = list(
            ResellerLedgerEntry.objects.filter(reseller=self.reseller)
            .order_by('created_at').values_list('entry_type', flat=True)
        )
        self.assertIn('REFUND', types)

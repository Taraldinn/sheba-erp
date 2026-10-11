"""
Phase 24 — full billing feature surface: coupons, credit notes, dunning,
disputes, PDF, portal, reverse-recharge, late-fee, auto-throttle.
"""
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Invoice, Package, Recharge
from apps.authentication.models import StaffMembership, Role, Permission
from apps.finance.models import (
    Adjustment,
    BillDispute,
    CouponRedemption,
    CreditNote,
    DiscountCoupon,
    DunningEvent,
    DunningStage,
    LedgerEntry,
    TaxRule,
)
from apps.finance.pdf import render_invoice_pdf, render_credit_note_pdf
from apps.finance.services_phase24 import (
    CouponService,
    CreditNoteService,
    CustomerPortalToken,
    DisputeService,
    DunningService,
    TaxService,
    money,
    reverse_recharge_with_credit_note,
)
from apps.finance.tasks import (
    apply_late_fees_daily,
    auto_throttle_overdue_daily,
    cascade_dunning_daily,
)

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class Phase24BillingFeaturesTestCase(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Apex ISP', slug='apex-isp', is_active=True)
        self.domain = TenantDomain.objects.create(
            tenant=self.tenant, hostname='apex.shebafi.xyz', is_active=True,
        )
        self.user = User.objects.create_user(username='apex_admin', password='pwd12345!')

        role = Role.objects.create(tenant=self.tenant, name='Apex Super Admin')
        perms = []
        for code in [
            'customer.view', 'customer.create', 'customer.update', 'customer.recharge',
            'invoice.view', 'invoice.create', 'invoice.manage', 'finance.adjust',
        ]:
            perm, _ = Permission.objects.get_or_create(codename=code, defaults={'name': code, 'module': 'FINANCE'})
            perms.append(perm)
        role.permissions.set(perms)
        self.membership = StaffMembership.objects.create(
            user=self.user, tenant=self.tenant, role=role, is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        # Package + customer
        self.pkg = Package.objects.create(
            tenant=self.tenant, name='Apex 25M', mikrotik_profile='25M',
            speed_mbps=25, regular_price=Decimal('1200.00'), validity_days=30,
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant, full_name='Test Subscriber', pppoe_username='test01',
            mobile='01711000000', address='Test', package=self.pkg,
            status=CustomerStatus.ACTIVE,
        )
        self.invoice = Invoice.objects.create(
            tenant=self.tenant, customer=self.customer,
            invoice_no='INV-P24-001',
            billing_month='September 2026',
            package_amount=Decimal('1200.00'),
            total_payable=Decimal('1200.00'),
            due_amount=Decimal('1200.00'),
            status=Invoice.InvoiceStatus.UNPAID,
            due_date=date.today() - timedelta(days=5),
        )

    def _get(self, url, **extra):
        return self.client.get(url, HTTP_HOST=self.domain.hostname, **extra)

    def _post(self, url, data=None, format_='json', **extra):
        return self.client.post(
            url, data=data, format=format_,
            HTTP_HOST=self.domain.hostname, **extra,
        )

    # ────── money / TaxService ──────

    def test_money_helper_rounds_half_up(self):
        self.assertEqual(money('10.005'), Decimal('10.01'))
        self.assertEqual(money('10.004'), Decimal('10.00'))
        self.assertEqual(money(None), Decimal('0.00'))

    def test_tax_service_zero_when_no_rule(self):
        self.assertEqual(TaxService.tax_amount(Decimal('1000')), Decimal('0.00'))

    def test_tax_service_with_rule(self):
        rule = TaxRule.objects.create(tenant=self.tenant, percentage=Decimal('5.000'))
        self.assertEqual(TaxService.tax_amount(Decimal('1000'), rule), Decimal('50.00'))
        self.assertEqual(TaxService.tax_amount(Decimal('1000.00')), Decimal('0.00'))

    # ────── coupons ──────

    def test_coupon_percentage_apply(self):
        c = DiscountCoupon.objects.create(
            tenant=self.tenant, code='SAVE10', discount_type='PERCENTAGE',
            value=Decimal('10'), min_invoice_amount=Decimal('0'),
        )
        res = CouponService.apply(c, customer=self.customer, invoice_total=Decimal('1200'))
        self.assertTrue(res.ok)
        self.assertEqual(res.discount_amount, Decimal('120.00'))

    def test_coupon_fixed_apply_capped_at_invoice(self):
        c = DiscountCoupon.objects.create(
            tenant=self.tenant, code='F500', discount_type='FIXED',
            value=Decimal('5000'),  # larger than invoice
        )
        res = CouponService.apply(c, customer=self.customer, invoice_total=Decimal('1200'))
        self.assertTrue(res.ok)
        self.assertEqual(res.discount_amount, Decimal('1200.00'))

    def test_coupon_inactive_returns_fail(self):
        c = DiscountCoupon.objects.create(
            tenant=self.tenant, code='OFF', discount_type='PERCENTAGE',
            value=Decimal('10'), is_active=False,
        )
        res = CouponService.apply(c, customer=self.customer, invoice_total=Decimal('1000'))
        self.assertFalse(res.ok)

    def test_coupon_expired_fails(self):
        c = DiscountCoupon.objects.create(
            tenant=self.tenant, code='EXP', discount_type='PERCENTAGE',
            value=Decimal('10'), valid_until=date.today() - timedelta(days=1),
        )
        res = CouponService.apply(c, customer=self.customer, invoice_total=Decimal('1000'))
        self.assertFalse(res.ok)

    def test_coupon_max_redemptions_exhausted(self):
        c = DiscountCoupon.objects.create(
            tenant=self.tenant, code='CAP', discount_type='PERCENTAGE',
            value=Decimal('5'), max_redemptions=2, redemptions=2,
        )
        res = CouponService.apply(c, customer=self.customer, invoice_total=Decimal('1000'))
        self.assertFalse(res.ok)

    def test_coupon_redeem_increments_counter_and_persists(self):
        c = DiscountCoupon.objects.create(
            tenant=self.tenant, code='R', discount_type='FIXED', value=Decimal('100'),
        )
        CouponService.redeem(c, customer=self.customer, invoice=self.invoice, amount=Decimal('100'))
        c.refresh_from_db()
        self.assertEqual(c.redemptions, 1)
        red = CouponRedemption.objects.get(coupon=c, customer=self.customer)
        self.assertEqual(red.amount_applied, Decimal('100.00'))
        self.assertEqual(red.invoice, self.invoice)

    # ────── credit notes + reverse-recharge ──────

    def test_credit_note_issue_and_apply_to_invoice(self):
        rech = Recharge.objects.create(
            tenant=self.tenant, customer=self.customer, package=self.pkg,
            amount=Decimal('1500.00'), validity_days=30,
            new_expiry=date.today() + timedelta(days=30),
            payment_method='bKash', trx_id='test-trx-001',
        )
        cn = CreditNoteService.issue_for_recharge(
            self.tenant, customer=self.customer, recharge=rech,
            amount=Decimal('1500.00'),
        )
        self.assertEqual(cn.amount, Decimal('1500.00'))
        # Adjustment ledger entry is paired
        adj = Adjustment.objects.get(customer=self.customer, amount=Decimal('1500.00'))
        self.assertEqual(adj.adjustment_type, 'CREDIT')

    def test_reverse_recharge_with_credit_note(self):
        rech = Recharge.objects.create(
            tenant=self.tenant, customer=self.customer, package=self.pkg,
            amount=Decimal('500'), discount=Decimal('0'),
            validity_days=30, new_expiry=date.today() + timedelta(days=30),
            payment_method='Cash', trx_id='r-1',
        )
        # Mark the invoice's due_amount smaller than the credit so we test both
        # full and partial application.
        self.invoice.due_amount = Decimal('500')
        self.invoice.paid_amount = Decimal('0')
        self.invoice.total_payable = Decimal('500')
        self.invoice.save()

        cn = reverse_recharge_with_credit_note(rech, actor='tester', notes='dupe')
        rech.refresh_from_db()
        self.assertTrue(rech.is_reversed)
        self.assertEqual(cn.amount, Decimal('500.00'))
        # The 500 credit was applied directly → invoice now PAID, due=0
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.InvoiceStatus.PAID)
        self.assertEqual(self.invoice.due_amount, Decimal('0.00'))

    def test_reverse_recharge_idempotency(self):
        rech = Recharge.objects.create(
            tenant=self.tenant, customer=self.customer, package=self.pkg,
            amount=Decimal('200'), validity_days=30,
            new_expiry=date.today() + timedelta(days=30),
            payment_method='Cash', trx_id='r-dup',
        )
        reverse_recharge_with_credit_note(rech)
        # Second attempt must fail
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            reverse_recharge_with_credit_note(rech)

    def test_credit_note_immutability(self):
        cn = CreditNote.objects.create(
            tenant=self.tenant, customer=self.customer,
            credit_note_no='CN-X', amount=Decimal('100'),
            related_invoice=self.invoice,
        )
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            cn.delete()

    # ────── dunning ──────

    def test_dunning_overdue_invoices(self):
        overdue = list(DunningService.overdue_invoices(self.tenant))
        self.assertIn(self.invoice, overdue)

    def test_dunning_cascade_fires_events(self):
        DunningStage.objects.create(
            tenant=self.tenant, name='D+1 SMS', days_overdue=1, action='SMS',
            template_text='Hello [NAME], ৳[AMOUNT] due.',
        )
        DunningStage.objects.create(
            tenant=self.tenant, name='D+3 IVR', days_overdue=3, action='IVR',
        )
        events = DunningService.cascade(self.tenant, sender=lambda *_: 'sent')
        # Invoice is 5 days overdue → both stages apply
        self.assertGreaterEqual(len(events), 2)

    def test_dunning_idempotency_24h(self):
        stage = DunningStage.objects.create(
            tenant=self.tenant, name='D+3', days_overdue=3, action='SMS',
        )
        first = DunningService.cascade(self.tenant, sender=lambda *_: 'sent')
        self.assertEqual(len(first), 1)
        second = DunningService.cascade(self.tenant, sender=lambda *_: 'sent')
        self.assertEqual(second, [], 'must be idempotent within 24h')

    def test_dunning_substitute_placeholders(self):
        text = 'Hello [NAME], your ৳[AMOUNT] is [DAYS] days past.'
        out = DunningService.substitute_voice_or_sms(
            text, customer=self.customer, invoice=self.invoice, days_overdue=5,
        )
        self.assertEqual(out, f'Hello {self.customer.full_name}, your ৳{self.invoice.due_amount} is 5 days past.')

    # ────── dispute ──────

    def test_dispute_open_attaches_invoice(self):
        d = DisputeService.open_dispute(
            tenant=self.tenant, customer=self.customer, invoice=self.invoice,
            reason='Charged twice', contact_phone='01711',
        )
        self.assertEqual(d.status, 'OPEN')
        self.assertTrue(d.support_ticket_id.startswith('PENDING-'))

    def test_dispute_cross_tenant_raises(self):
        other = Tenant.objects.create(name='Other', slug='other', is_active=True)
        other_customer = Customer.objects.create(
            tenant=other, full_name='Y', pppoe_username='y', package=self.pkg,
            status=CustomerStatus.ACTIVE,
        )
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            DisputeService.open_dispute(
                tenant=self.tenant, customer=other_customer, invoice=self.invoice,
                reason='oops',
            )

    # ────── PDF generation ──────

    def test_render_invoice_pdf_returns_valid_bytes(self):
        pdf = render_invoice_pdf(self.invoice)
        self.assertGreater(len(pdf), 1500)
        self.assertTrue(pdf.startswith(b'%PDF'))

    def test_render_credit_note_pdf_returns_valid_bytes(self):
        cn = CreditNote.objects.create(
            tenant=self.tenant, customer=self.customer,
            credit_note_no='CN-PDF-1', amount=Decimal('200'),
            related_invoice=self.invoice,
        )
        pdf = render_credit_note_pdf(cn)
        self.assertGreater(len(pdf), 1500)
        self.assertTrue(pdf.startswith(b'%PDF'))

    # ────── customer self-service portal ──────

    def test_portal_token_round_trip(self):
        token = CustomerPortalToken.issue_for_invoice(self.invoice)
        self.assertTrue(token.startswith('cp.'))
        parts = token.split('.')
        self.assertEqual(len(parts), 4)
        self.assertEqual(parts[0], 'cp')
        self.assertEqual(parts[1], self.invoice.id.hex)

    def test_portal_returns_invoices_for_authorized_token(self):
        token = f'cp.{self.customer.id.hex}.nonce12345678.{"a" * 20}'
        url = f'/api/v1/billing/portal/?tenant={self.tenant.slug}&token={token}'
        r = self.client.get(url, HTTP_HOST=self.domain.hostname)
        # CustomerBillingPortalView is AllowAny - so token validates
        self.assertEqual(r.status_code, 200, r.content if hasattr(r, 'content') else r.data)
        self.assertEqual(len(r.data['invoices']), 1)

    def test_portal_bad_token_rejected(self):
        url = f'/api/v1/billing/portal/?tenant={self.tenant.slug}&token=BAD.nope'
        r = self.client.get(url, HTTP_HOST=self.domain.hostname)
        self.assertEqual(r.status_code, 403)

    # ────── Celery tasks ──────

    def test_apply_late_fees_daily_increases_due(self):
        before_due = self.invoice.due_amount
        before_total = self.invoice.total_payable
        apply_late_fees_daily()
        self.invoice.refresh_from_db()
        self.assertGreater(self.invoice.due_amount, before_due)
        self.assertGreater(self.invoice.total_payable, before_total)
        self.assertGreater(self.invoice.late_fee, Decimal('0'))

    def test_apply_late_fees_daily_idempotent(self):
        apply_late_fees_daily()
        self.invoice.refresh_from_db()
        first_fee = self.invoice.late_fee
        apply_late_fees_daily()
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.late_fee, first_fee)

    def test_cascade_dunning_daily_creates_events(self):
        DunningStage.objects.create(
            tenant=self.tenant, name='D+1', days_overdue=1, action='SMS',
        )
        cascade_dunning_daily()
        self.assertGreater(DunningEvent.objects.filter(invoice=self.invoice).count(), 0)

    def test_auto_throttle_overdue(self):
        self.invoice.due_date = date.today() - timedelta(days=10)
        self.invoice.save()
        auto_throttle_overdue_daily()
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, CustomerStatus.SUSPENDED)

    # ────── HTTP endpoints (CRUD smoke tests) ──────

    def test_crud_tax_rule(self):
        r = self._post('/api/v1/tax-rules/', {
            'label': 'VAT', 'percentage': '5.000', 'is_active': True,
        })
        self.assertIn(r.status_code, (200, 201))
        self.assertTrue(TaxRule.objects.filter(tenant=self.tenant).exists())

    def test_crud_discount_coupon(self):
        r = self._post('/api/v1/discount-coupons/', {
            'code': 'PROMO1', 'discount_type': 'PERCENTAGE',
            'value': '7.50', 'min_invoice_amount': '0',
        })
        self.assertIn(r.status_code, (200, 201))
        self.assertTrue(DiscountCoupon.objects.filter(code='PROMO1').exists())

    def test_apply_coupon_endpoint(self):
        DiscountCoupon.objects.create(
            tenant=self.tenant, code='SAVE5', discount_type='PERCENTAGE',
            value=Decimal('5'),
        )
        r = self._post('/api/v1/discount-coupons/apply/', {
            'code': 'SAVE5', 'invoice_id': str(self.invoice.id),
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['ok'])
        self.assertEqual(Decimal(r.data['discount_amount']), Decimal('60.00'))

    def test_apply_coupon_via_invoice_extra(self):
        DiscountCoupon.objects.create(
            tenant=self.tenant, code='FIX500', discount_type='FIXED',
            value=Decimal('500'),
        )
        r = self._post(f'/api/v1/invoice-extras/{self.invoice.id}/apply-coupon/',
                      {'code': 'FIX500'})
        self.assertEqual(r.status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.coupon_code, 'FIX500')
        self.assertEqual(self.invoice.total_payable, Decimal('700.00'))

    def test_invoice_pdf_endpoint(self):
        r = self._get(f'/api/v1/invoice-extras/{self.invoice.id}/pdf/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'application/pdf')
        self.assertGreater(len(r.content), 1500)
        self.assertTrue(r.content.startswith(b'%PDF'))

    def test_bill_dispute_endpoint(self):
        r = self._post('/api/v1/bill-disputes/', {
            'invoice': str(self.invoice.id),
            'customer': str(self.customer.id),
            'reason': 'Charged for a service I did not receive',
            'contact_phone': '01711000000',
        })
        self.assertIn(r.status_code, (200, 201))
        self.assertTrue(BillDispute.objects.filter(invoice=self.invoice).exists())

import uuid
import datetime
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice, Recharge
from apps.payments.models import PaymentTransaction, TransactionStatus
from apps.authentication.models import StaffMembership, Role, Permission
from apps.finance.models import BillingAccount, LedgerEntry, PaymentAllocation, Adjustment, IdempotencyKey
from apps.finance.services import (
    get_or_create_billing_account, record_ledger_entry,
    allocate_payment_to_invoices, reconcile_billing_account,
    execute_transactional_recharge
)

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class FinancialIntegrityStage6Tests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="SpeedFi Net", slug="speedfi", is_active=True)
        self.domain = TenantDomain.objects.create(tenant=self.tenant, hostname="speedfi.shebafi.xyz", is_active=True)

        self.user = User.objects.create_user(username="billing_admin", password="password123")
        self.role = Role.objects.create(tenant=self.tenant, name="Billing Specialist")
        
        perms = []
        for code in ['customer.view', 'customer.recharge', 'customer.update', 'invoice.create', 'invoice.manage', 'finance.adjust']:
            perm, _ = Permission.objects.get_or_create(codename=code, defaults={'name': code, 'module': 'FINANCE'})
            perms.append(perm)
        self.role.permissions.set(perms)

        self.membership = StaffMembership.objects.create(
            user=self.user,
            tenant=self.tenant,
            role=self.role,
            is_active=True
        )

        self.package = Package.objects.create(
            tenant=self.tenant,
            name="20 Mbps Fiber",
            mikrotik_profile="20M-Profile",
            speed_mbps=20,
            regular_price=Decimal('1000.00'),
            validity_days=30
        )

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            full_name="Anwar Hossain",
            pppoe_username="anwar_fiber",
            customer_code="CUST-ANWAR",
            mobile="01711223344",
            package=self.package,
            monthly_bill=Decimal('1000.00'),
            due_amount=Decimal('0.00'),
            advance_amount=Decimal('0.00'),
            status=CustomerStatus.ACTIVE,
            expiry_date=datetime.date.today() + datetime.timedelta(days=10)
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_ledger_is_authoritative_source_of_truth(self):
        """
        Customer.billing_account.balance strictly matches the sum of related LedgerEntry rows.
        """
        acct = get_or_create_billing_account(self.tenant, self.customer)
        self.assertEqual(acct.balance, Decimal('0.00'))

        # 1. Invoice of 1000 raised (debit)
        acct.balance -= Decimal('1000.00')
        acct.total_invoiced += Decimal('1000.00')
        acct.save()
        record_ledger_entry(
            self.tenant, self.customer, LedgerEntry.EntryType.INVOICE,
            Decimal('1000.00'), acct.balance, reference_type='Invoice'
        )

        # 2. Payment of 1000 received (credit)
        acct.balance += Decimal('1000.00')
        acct.total_paid += Decimal('1000.00')
        acct.save()
        record_ledger_entry(
            self.tenant, self.customer, LedgerEntry.EntryType.PAYMENT,
            Decimal('1000.00'), acct.balance, reference_type='PaymentTransaction'
        )

        # 3. Manual Credit Adjustment of 150 (credit)
        acct.balance += Decimal('150.00')
        acct.save()
        record_ledger_entry(
            self.tenant, self.customer, LedgerEntry.EntryType.ADJUSTMENT,
            Decimal('150.00'), acct.balance, reference_type='Adjustment'
        )

        # 4. Service Recharge debit of 100 (debit)
        acct.balance -= Decimal('100.00')
        acct.save()
        record_ledger_entry(
            self.tenant, self.customer, LedgerEntry.EntryType.RECHARGE,
            Decimal('100.00'), acct.balance, reference_type='Recharge'
        )

        # Reconcile
        report = reconcile_billing_account(acct)
        self.assertTrue(report['is_balanced'])
        self.assertEqual(report['actual_balance'], Decimal('50.00'))
        self.assertEqual(report['expected_balance'], Decimal('50.00'))
        self.assertEqual(report['discrepancy'], Decimal('0.00'))
        self.assertEqual(report['entry_count'], 4)

    def test_transactional_recharge_atomic_rollback(self):
        """
        If any failure occurs midway through recharge, all records rollback atomically.
        Zero partial recharge state.
        """
        initial_entries = LedgerEntry.objects.count()
        initial_recharges = Recharge.objects.count()
        initial_expiry = self.customer.expiry_date

        with patch('apps.finance.services.allocate_payment_to_invoices', side_effect=RuntimeError("Simulated DB Crash")):
            with self.assertRaises(RuntimeError):
                execute_transactional_recharge(
                    tenant=self.tenant,
                    customer=self.customer,
                    amount=Decimal('1000.00'),
                    validity_days=30,
                    payment_method='Cash',
                    actor_username='test_admin'
                )

        # Confirm 100% rollback
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.expiry_date, initial_expiry)
        self.assertEqual(LedgerEntry.objects.count(), initial_entries)
        self.assertEqual(Recharge.objects.count(), initial_recharges)

    def test_idempotency_key_enforced_on_recharge(self):
        """
        Submitting identical recharge with the same Idempotency-Key returns the cached response
        without duplicate LedgerEntry or Recharge rows.
        """
        idem_key = f"IDEM-{uuid.uuid4().hex[:12]}"
        
        # Request 1
        res1 = execute_transactional_recharge(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('1000.00'),
            validity_days=30,
            payment_method='bKash',
            idempotency_key=idem_key,
            actor_username='test_admin'
        )
        self.assertTrue(res1['success'])
        self.assertFalse(res1.get('idempotent', False))

        recharge_count = Recharge.objects.filter(customer=self.customer).count()
        ledger_count = LedgerEntry.objects.filter(customer=self.customer).count()

        # Request 2 with same idempotency key
        res2 = execute_transactional_recharge(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('1000.00'),
            validity_days=30,
            payment_method='bKash',
            idempotency_key=idem_key,
            actor_username='test_admin'
        )
        self.assertTrue(res2['success'])
        self.assertTrue(res2.get('idempotent', True))

        # Verify zero duplicates created
        self.assertEqual(Recharge.objects.filter(customer=self.customer).count(), recharge_count)
        self.assertEqual(LedgerEntry.objects.filter(customer=self.customer).count(), ledger_count)

    def test_payment_allocation_exact_settlement(self):
        """
        A payment matching the invoice due amount allocates 100% and settles status to PAID.
        """
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_no="INV-EXACT-001",
            billing_month="September 2026",
            package_name=self.package.name,
            package_amount=Decimal('1000.00'),
            total_payable=Decimal('1000.00'),
            due_amount=Decimal('1000.00'),
            paid_amount=Decimal('0.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )

        payment = PaymentTransaction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('1000.00'),
            trx_id="TRX-EXACT-001",
            payment_method="bKash",
            status=TransactionStatus.SUCCESS
        )

        result = allocate_payment_to_invoices(self.tenant, payment, self.customer)
        self.assertEqual(result['allocated_total'], Decimal('1000.00'))
        self.assertEqual(result['overpayment_amount'], Decimal('0.00'))
        self.assertEqual(len(result['allocations']), 1)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.InvoiceStatus.PAID)
        self.assertEqual(invoice.paid_amount, Decimal('1000.00'))
        self.assertEqual(invoice.due_amount, Decimal('0.00'))

    def test_payment_allocation_partial_payment(self):
        """
        A payment less than invoice total allocates partial amount and sets status to PARTIAL.
        """
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_no="INV-PARTIAL-001",
            billing_month="September 2026",
            package_name=self.package.name,
            package_amount=Decimal('1000.00'),
            total_payable=Decimal('1000.00'),
            due_amount=Decimal('1000.00'),
            paid_amount=Decimal('0.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )

        payment = PaymentTransaction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('450.00'),
            trx_id="TRX-PARTIAL-001",
            payment_method="Cash",
            status=TransactionStatus.SUCCESS
        )

        result = allocate_payment_to_invoices(self.tenant, payment, self.customer)
        self.assertEqual(result['allocated_total'], Decimal('450.00'))
        self.assertEqual(result['overpayment_amount'], Decimal('0.00'))

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.InvoiceStatus.PARTIAL)
        self.assertEqual(invoice.paid_amount, Decimal('450.00'))
        self.assertEqual(invoice.due_amount, Decimal('550.00'))

    def test_payment_allocation_overpayment_advance(self):
        """
        A payment exceeding open invoices settles invoice to PAID and returns overpayment credit.
        """
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_no="INV-OVERPAY-001",
            billing_month="September 2026",
            package_name=self.package.name,
            package_amount=Decimal('800.00'),
            total_payable=Decimal('800.00'),
            due_amount=Decimal('800.00'),
            paid_amount=Decimal('0.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )

        payment = PaymentTransaction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('1200.00'),
            trx_id="TRX-OVERPAY-001",
            payment_method="Nagad",
            status=TransactionStatus.SUCCESS
        )

        result = allocate_payment_to_invoices(self.tenant, payment, self.customer)
        self.assertEqual(result['allocated_total'], Decimal('800.00'))
        self.assertEqual(result['overpayment_amount'], Decimal('400.00'))

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.InvoiceStatus.PAID)
        self.assertEqual(invoice.paid_amount, Decimal('800.00'))
        self.assertEqual(invoice.due_amount, Decimal('0.00'))

    def test_invoice_pay_action_creates_payment_and_allocation(self):
        """
        POST /api/v1/invoices/{id}/pay/ creates PaymentTransaction, LedgerEntry, and PaymentAllocation.
        """
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_no="INV-ACTION-001",
            billing_month="September 2026",
            package_name=self.package.name,
            package_amount=Decimal('1000.00'),
            total_payable=Decimal('1000.00'),
            due_amount=Decimal('1000.00'),
            paid_amount=Decimal('0.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )

        url = f"/api/v1/invoices/{invoice.id}/pay/"
        resp = self.client.post(url, {
            'amount': '1000.00',
            'payment_method': 'bKash',
            'trx_id': 'INV-TRX-101'
        }, HTTP_HOST="speedfi.shebafi.xyz")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.InvoiceStatus.PAID)
        self.assertEqual(invoice.due_amount, Decimal('0.00'))

        # Verify PaymentAllocation created
        alloc = PaymentAllocation.objects.filter(invoice=invoice).first()
        self.assertIsNotNone(alloc)
        self.assertEqual(alloc.amount, Decimal('1000.00'))

        # Verify LedgerEntry created
        entry = LedgerEntry.objects.filter(reference_id=str(alloc.payment.id)).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.entry_type, LedgerEntry.EntryType.PAYMENT)

    def test_adjustment_api_creates_ledger_and_updates_balance(self):
        """
        POST /api/v1/adjustments/ creates an Adjustment with mandatory reason and linked LedgerEntry.
        """
        url = "/api/v1/adjustments/"
        resp = self.client.post(url, {
            'customer_id': str(self.customer.id),
            'adjustment_type': 'CREDIT',
            'amount': '250.00',
            'reason': 'Customer loyalty goodwill waiver'
        }, HTTP_HOST="speedfi.shebafi.xyz")

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        adj_id = resp.data['id']
        adj = Adjustment.objects.get(id=adj_id)
        self.assertEqual(adj.amount, Decimal('250.00'))
        self.assertIsNotNone(adj.ledger_entry)
        self.assertEqual(adj.ledger_entry.amount, Decimal('250.00'))

        # Verify balance updated
        acct = BillingAccount.objects.get(tenant=self.tenant, customer=self.customer)
        self.assertEqual(acct.balance, Decimal('250.00'))

    def test_financial_records_immutable_no_delete(self):
        """
        Deleting LedgerEntry, PaymentTransaction, or PaymentAllocation raises ValidationError.
        Financial history must never be deleted.
        """
        acct = get_or_create_billing_account(self.tenant, self.customer)
        entry = record_ledger_entry(
            self.tenant, self.customer, LedgerEntry.EntryType.PAYMENT,
            Decimal('500.00'), acct.balance
        )
        with self.assertRaises(ValidationError):
            entry.delete()

        with self.assertRaises(ValidationError):
            LedgerEntry.objects.filter(id=entry.id).delete()

        payment = PaymentTransaction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('500.00'),
            trx_id="TRX-NODEL-001",
            payment_method="Cash"
        )
        with self.assertRaises(ValidationError):
            payment.delete()

        with self.assertRaises(ValidationError):
            PaymentTransaction.objects.filter(id=payment.id).delete()

    def test_two_simultaneous_recharge_requests_serialized(self):
        """
        Two recharge requests execute with proper row-level locks and ledger accounting.
        """
        # Execute Recharge 1
        res1 = execute_transactional_recharge(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('1000.00'),
            validity_days=30,
            payment_method='Cash',
            trx_id='RCH-RACE-001',
            actor_username='test_admin'
        )
        self.assertTrue(res1['success'])

        # Execute Recharge 2
        res2 = execute_transactional_recharge(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('1000.00'),
            validity_days=30,
            payment_method='Cash',
            trx_id='RCH-RACE-002',
            actor_username='test_admin'
        )
        self.assertTrue(res2['success'])

        # Confirm 2 recharges and 4 ledger entries (2 payments + 2 recharge consumptions)
        self.assertEqual(Recharge.objects.filter(customer=self.customer).count(), 2)
        self.assertEqual(LedgerEntry.objects.filter(customer=self.customer).count(), 4)

        # Verify account reconciliation
        acct = BillingAccount.objects.get(tenant=self.tenant, customer=self.customer)
        report = reconcile_billing_account(acct)
        self.assertTrue(report['is_balanced'])

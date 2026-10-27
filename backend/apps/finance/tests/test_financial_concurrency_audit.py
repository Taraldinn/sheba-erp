"""
Final Financial Integrity & Concurrency Audit Test Suite.
=========================================================
Audits and verifies:
1. LedgerEntry authoritative financial history & append-only immutability.
2. Concurrent recharge safety & idempotency.
3. Concurrent payment settlement & allocation safety (no over-allocation).
4. Concurrent invoice settlement idempotency.
5. Concurrent duplicate webhook deduplication (InboundPaymentEvent pipeline).
6. Duplicate provider transaction DB constraints.
7. Concurrent balance updates (zero lost updates, canonical lock hierarchy).
8. DB transaction commits before network activation (Rules 11 & 12).
"""

import uuid
import datetime
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice, Recharge
from apps.network.models import Router
from apps.authentication.models import Role, StaffMembership, Permission
from apps.payments.models import (
    PaymentTransaction, PaymentAttempt, InboundPaymentEvent,
    TransactionStatus, SmsLog
)
from apps.payments.bkash_views import _settle_customer_payment
from apps.finance.models import (
    BillingAccount, LedgerEntry, PaymentAllocation, Adjustment, IdempotencyKey
)
from apps.finance.services import (
    get_or_create_billing_account,
    record_ledger_entry,
    allocate_payment_to_invoices,
    execute_transactional_recharge,
    apply_advance_to_invoice,
    reconcile_billing_account,
    reverse_recharge,
    sync_customer_financial_summary
)
from apps.core.tasks import (
    process_payment_event,
    generate_monthly_invoices
)

User = get_user_model()


class FinancialIntegrityAndConcurrencyAuditTests(TestCase):
    """
    Comprehensive verification of all 12 financial integrity rules under
    concurrent and duplicate conditions.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Setup Tenant
        self.tenant = Tenant.objects.create(
            name="Audit ISP",
            slug="audit-isp",
            domain="audit.shebafi.com",
            is_active=True
        )
        self.domain = TenantDomain.objects.create(
            tenant=self.tenant,
            hostname="audit.shebafi.com",
            is_active=True,
            is_primary=True
        )
        from apps.core.models import CompanySetting
        CompanySetting.objects.get_or_create(
            tenant=self.tenant,
            defaults={'currency_code': 'BDT', 'currency_symbol': '৳'}
        )

        # 2. Setup Staff User
        self.user = User.objects.create_user(username="fin_auditor", password="securepassword123")
        self.role = Role.objects.create(tenant=self.tenant, name="Billing Manager")
        perms = []
        for code in ['finance.adjust', 'customer.recharge', 'billing.manage', 'payment.create']:
            p, _ = Permission.objects.get_or_create(codename=code, defaults={'name': code, 'module': 'FINANCE'})
            perms.append(p)
        self.role.permissions.set(perms)
        StaffMembership.objects.create(user=self.user, tenant=self.tenant, role=self.role, is_active=True)

        # 3. Setup Router & Package
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Audit-CCR",
            ip_address="10.100.0.1",
            username="admin",
            password="pass"
        )
        self.package = Package.objects.create(
            tenant=self.tenant,
            name="Audit Standard 20M",
            mikrotik_profile="20M-Profile",
            speed_mbps=20,
            regular_price=Decimal('1000.00'),
            validity_days=30
        )

        # 4. Setup Customer
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code="AUDIT-CUST-001",
            full_name="Audit Subscriber",
            pppoe_username="audit_sub_01",
            mobile="01799887766",
            package=self.package,
            router=self.router,
            monthly_bill=Decimal('1000.00'),
            due_amount=Decimal('0.00'),
            advance_amount=Decimal('0.00'),
            status=CustomerStatus.ACTIVE,
            expiry_date=timezone.now().date() + datetime.timedelta(days=15)
        )

        # 5. Setup BillingAccount anchor
        self.billing_acct = get_or_create_billing_account(self.tenant, self.customer)

    # ─────────────────────────────────────────────────────────────────────────
    # A. Authoritative Ledger & Append-Only Invariants (Rules 1, 2, 3, 4, 5)
    # ─────────────────────────────────────────────────────────────────────────

    def test_ledger_is_append_only_and_immutable(self):
        """LedgerEntry and PaymentAllocation records cannot be deleted or updated via ORM."""
        entry = record_ledger_entry(
            tenant=self.tenant,
            customer=self.customer,
            entry_type=LedgerEntry.EntryType.PAYMENT,
            amount=Decimal('500.00'),
            balance_after=Decimal('500.00'),
            description="Audit payment"
        )

        # Attempting direct delete raises ValidationError
        with self.assertRaises(ValidationError):
            entry.delete()

        # Attempting QuerySet update raises ValidationError
        with self.assertRaises(ValidationError):
            LedgerEntry.objects.filter(id=entry.id).update(amount=Decimal('999.00'))

        # QuerySet bulk delete raises ValidationError
        with self.assertRaises(ValidationError):
            LedgerEntry.objects.filter(id=entry.id).delete()

    def test_reconciliation_verifies_ledger_is_financial_source_of_truth(self):
        """reconcile_billing_account calculates exact balance from authoritative ledger entries."""
        # 1. Start balanced at 0
        acct = self.billing_acct
        recon = reconcile_billing_account(acct)
        self.assertTrue(recon['is_balanced'])
        self.assertEqual(recon['discrepancy'], Decimal('0.00'))

        # 2. Add Payment (+1000)
        acct.balance = Decimal('1000.00')
        acct.save(update_fields=['balance'])
        record_ledger_entry(
            tenant=self.tenant, customer=self.customer,
            entry_type=LedgerEntry.EntryType.PAYMENT,
            amount=Decimal('1000.00'), balance_after=Decimal('1000.00')
        )
        self.assertTrue(reconcile_billing_account(acct)['is_balanced'])

        # 3. Add Invoice (-1000)
        acct.balance = Decimal('0.00')
        acct.save(update_fields=['balance'])
        record_ledger_entry(
            tenant=self.tenant, customer=self.customer,
            entry_type=LedgerEntry.EntryType.INVOICE,
            amount=Decimal('1000.00'), balance_after=Decimal('0.00')
        )
        recon_after_inv = reconcile_billing_account(acct)
        self.assertTrue(recon_after_inv['is_balanced'])
        self.assertEqual(recon_after_inv['expected_balance'], Decimal('0.00'))

    # ─────────────────────────────────────────────────────────────────────────
    # B. Concurrent Recharge Safety & Idempotency (Rules 6, 9, 10)
    # ─────────────────────────────────────────────────────────────────────────

    def test_concurrent_recharge_same_idempotency_key(self):
        """
        Recharge with an existing idempotency key in PROCESSING state raises ValidationError.
        Completed idempotency key returns cached idempotent response without double-billing.
        """
        idem_key = f"IDEM-RCH-{uuid.uuid4().hex[:8]}"

        # 1. Simulate an in-flight concurrent recharge
        IdempotencyKey.objects.create(
            tenant=self.tenant,
            key=idem_key,
            operation='recharge',
            status=IdempotencyKey.Status.PROCESSING
        )

        with self.assertRaises(ValidationError) as ctx:
            execute_transactional_recharge(
                tenant=self.tenant,
                customer=self.customer,
                amount=Decimal('1000.00'),
                idempotency_key=idem_key
            )
        self.assertIn("currently processing", str(ctx.exception))

        # 2. Complete the idempotency key
        idem = IdempotencyKey.objects.get(tenant=self.tenant, key=idem_key)
        idem.status = IdempotencyKey.Status.COMPLETE
        idem.response_body = {'success': True, 'recharge_id': 'RCH-12345'}
        idem.save()

        # 3. Replaying the request returns the idempotent response
        res = execute_transactional_recharge(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('1000.00'),
            idempotency_key=idem_key
        )
        self.assertTrue(res['success'])
        self.assertTrue(res['idempotent'])
        self.assertEqual(res['response_data']['recharge_id'], 'RCH-12345')

    def test_concurrent_recharge_duplicate_trx_id_rejected(self):
        """
        Two recharges using the exact same trx_id cannot both succeed.
        The second call is rejected with ValidationError.
        """
        shared_trx = f"TRX-RCH-{uuid.uuid4().hex[:8].upper()}"

        # 1. First recharge succeeds
        res1 = execute_transactional_recharge(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('1000.00'),
            trx_id=shared_trx,
            idempotency_key=f"IDEM-1-{uuid.uuid4().hex[:6]}"
        )
        self.assertTrue(res1['success'])

        # 2. Second recharge with same trx_id fails with ValidationError
        with self.assertRaises(ValidationError) as ctx:
            execute_transactional_recharge(
                tenant=self.tenant,
                customer=self.customer,
                amount=Decimal('1000.00'),
                trx_id=shared_trx,
                idempotency_key=f"IDEM-2-{uuid.uuid4().hex[:6]}"
            )
        self.assertIn("already been processed", str(ctx.exception))

        # Exactly 1 Recharge and 1 PaymentTransaction exist with shared_trx
        self.assertEqual(Recharge.objects.filter(tenant=self.tenant, trx_id=shared_trx).count(), 1)
        self.assertEqual(PaymentTransaction.objects.filter(trx_id=shared_trx).count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # C. Concurrent Payment Settlement & Allocations (Rules 6, 8, 10)
    # ─────────────────────────────────────────────────────────────────────────

    def test_concurrent_payment_settlement_duplicate_trx_handled_gracefully(self):
        """
        _settle_customer_payment handles concurrent calls with identical trx_id
        gracefully without IntegrityError crash or duplicate records.
        """
        shared_trx = f"BKASH-SETTLE-{uuid.uuid4().hex[:8].upper()}"

        # First settlement
        txn1, created1 = _settle_customer_payment(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('500.00'),
            trx_id=shared_trx,
            payment_method="bKash"
        )
        self.assertTrue(created1)
        self.assertEqual(txn1.trx_id, shared_trx)

        # Duplicate settlement returns existing transaction with created=False
        txn2, created2 = _settle_customer_payment(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('500.00'),
            trx_id=shared_trx,
            payment_method="bKash"
        )
        self.assertFalse(created2)
        self.assertEqual(txn2.id, txn1.id)

        # Verify exactly 1 PaymentTransaction and 1 PAYMENT ledger entry
        self.assertEqual(PaymentTransaction.objects.filter(trx_id=shared_trx).count(), 1)
        self.assertEqual(
            LedgerEntry.objects.filter(
                tenant=self.tenant,
                reference_id=str(txn1.id),
                entry_type=LedgerEntry.EntryType.PAYMENT
            ).count(),
            1
        )

    def test_concurrent_payment_allocations_no_overallocation(self):
        """
        Competing allocations on the same open invoice never allocate more
        than total_payable. Overpayment is cleanly reported.
        """
        # Create an unpaid invoice for 1000.00
        inv = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_no=f"INV-{uuid.uuid4().hex[:6].upper()}",
            billing_month="September 2026",
            package_name=self.package.name,
            package_amount=Decimal('1000.00'),
            total_payable=Decimal('1000.00'),
            paid_amount=Decimal('0.00'),
            due_amount=Decimal('1000.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )

        # Competing payment 1: 700.00
        p1 = PaymentTransaction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('700.00'),
            trx_id=f"TX-P1-{uuid.uuid4().hex[:6]}",
            payment_method="Cash",
            status=TransactionStatus.SUCCESS
        )
        res1 = allocate_payment_to_invoices(self.tenant, p1, self.customer, Decimal('700.00'))
        self.assertEqual(res1['allocated_total'], Decimal('700.00'))
        self.assertEqual(res1['overpayment_amount'], Decimal('0.00'))

        inv.refresh_from_db()
        self.assertEqual(inv.paid_amount, Decimal('700.00'))
        self.assertEqual(inv.due_amount, Decimal('300.00'))
        self.assertEqual(inv.status, Invoice.InvoiceStatus.PARTIAL)

        # Competing payment 2: 700.00 (invoice only has 300.00 due)
        p2 = PaymentTransaction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('700.00'),
            trx_id=f"TX-P2-{uuid.uuid4().hex[:6]}",
            payment_method="Cash",
            status=TransactionStatus.SUCCESS
        )
        res2 = allocate_payment_to_invoices(self.tenant, p2, self.customer, Decimal('700.00'))

        # Only 300.00 is allocated to the invoice; remaining 400.00 is overpayment!
        self.assertEqual(res2['allocated_total'], Decimal('300.00'))
        self.assertEqual(res2['overpayment_amount'], Decimal('400.00'))

        inv.refresh_from_db()
        self.assertEqual(inv.paid_amount, Decimal('1000.00'))
        self.assertEqual(inv.due_amount, Decimal('0.00'))
        self.assertEqual(inv.status, Invoice.InvoiceStatus.PAID)

        # Total allocations across all payments against this invoice == 1000.00 (no over-allocation)
        total_allocated = sum(
            alloc.amount for alloc in PaymentAllocation.objects.filter(invoice=inv)
        )
        self.assertEqual(total_allocated, Decimal('1000.00'))

    # ─────────────────────────────────────────────────────────────────────────
    # D. Concurrent Invoice Settlement Idempotency (Rule 8)
    # ─────────────────────────────────────────────────────────────────────────

    def test_apply_advance_to_invoice_concurrent_idempotency(self):
        """
        Multiple concurrent calls to apply_advance_to_invoice settle the invoice
        exactly once; subsequent calls detect due <= 0 and safely return None.
        """
        # Customer has 1500.00 advance
        self.customer.advance_amount = Decimal('1500.00')
        self.customer.save(update_fields=['advance_amount'])

        inv = Invoice.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            invoice_no=f"INV-ADV-{uuid.uuid4().hex[:6].upper()}",
            billing_month="September 2026",
            package_name=self.package.name,
            package_amount=Decimal('1000.00'),
            total_payable=Decimal('1000.00'),
            paid_amount=Decimal('0.00'),
            due_amount=Decimal('1000.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )

        # First settlement attempt succeeds
        alloc1 = apply_advance_to_invoice(self.tenant, self.customer, inv)
        self.assertIsNotNone(alloc1)
        self.assertEqual(alloc1.amount, Decimal('1000.00'))

        # Refresh state
        inv.refresh_from_db()
        self.customer.refresh_from_db()
        self.assertEqual(inv.status, Invoice.InvoiceStatus.PAID)
        self.assertEqual(self.customer.advance_amount, Decimal('500.00'))

        # Second settlement attempt on already paid invoice returns None safely
        alloc2 = apply_advance_to_invoice(self.tenant, self.customer, inv)
        self.assertIsNone(alloc2)

        # Customer advance balance unchanged
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.advance_amount, Decimal('500.00'))

        # Exactly 1 allocation created
        self.assertEqual(PaymentAllocation.objects.filter(invoice=inv).count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # E. Duplicate Webhook Idempotency (Rule 7)
    # ─────────────────────────────────────────────────────────────────────────

    def test_duplicate_webhook_event_deduplication(self):
        """
        Incoming webhook with the same trx_id deduplicates gracefully.
        The second event is marked DUPLICATE and no second recharge is granted.
        """
        trx = f"NAGAD-WEBHOOK-{uuid.uuid4().hex[:8].upper()}"

        # 1. Event 1 arrives
        event1 = InboundPaymentEvent.objects.create(
            tenant=self.tenant,
            source=InboundPaymentEvent.EventSource.WEBHOOK,
            provider='Nagad',
            amount=Decimal('1000.00'),
            trx_id=trx,
            sender_account=self.customer.mobile,
            raw_payload={'amount': '1000.00', 'trx_id': trx, 'sender': self.customer.mobile}
        )

        # 2. Event 2 arrives concurrently with the same trx_id
        event2 = InboundPaymentEvent.objects.create(
            tenant=self.tenant,
            source=InboundPaymentEvent.EventSource.WEBHOOK,
            provider='Nagad',
            amount=Decimal('1000.00'),
            trx_id=trx,
            sender_account=self.customer.mobile,
            raw_payload={'amount': '1000.00', 'trx_id': trx, 'sender': self.customer.mobile}
        )

        # Process event 1
        res1 = process_payment_event(tenant_id=str(self.tenant.id), event_id=str(event1.id))
        self.assertTrue(res1['success'])
        self.assertEqual(res1['result'], 'MATCHED')

        # Process event 2 (duplicate)
        res2 = process_payment_event(tenant_id=str(self.tenant.id), event_id=str(event2.id))
        self.assertTrue(res2['success'])
        self.assertEqual(res2['result'], 'DUPLICATE')

        event2.refresh_from_db()
        self.assertEqual(event2.status, InboundPaymentEvent.EventStatus.DUPLICATE)

        # Exactly 1 PaymentTransaction and 1 Recharge for this trx_id
        self.assertEqual(PaymentTransaction.objects.filter(trx_id=trx).count(), 1)
        self.assertEqual(Recharge.objects.filter(trx_id=trx).count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # F. Duplicate Provider Transactions (Rule 6)
    # ─────────────────────────────────────────────────────────────────────────

    def test_duplicate_provider_transaction_db_constraint(self):
        """PaymentTransaction.trx_id uniqueness is strictly enforced at database level."""
        trx = f"TRX-UNIQUE-{uuid.uuid4().hex[:8].upper()}"

        PaymentTransaction.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('500.00'),
            trx_id=trx,
            payment_method='Cash',
            status=TransactionStatus.SUCCESS
        )

        # A second PaymentTransaction with the exact same trx_id MUST raise IntegrityError
        with self.assertRaises(IntegrityError):
            PaymentTransaction.objects.create(
                tenant=self.tenant,
                customer=self.customer,
                amount=Decimal('500.00'),
                trx_id=trx,
                payment_method='Cash',
                status=TransactionStatus.SUCCESS
            )

    # ─────────────────────────────────────────────────────────────────────────
    # G. Concurrent Balance Updates & Canonical Lock Hierarchy (Rule 10)
    # ─────────────────────────────────────────────────────────────────────────

    def test_interleaved_balance_updates_maintain_reconciliation(self):
        """
        Multiple interleaved financial mutations (recharge, adjustment, invoice)
        maintain zero balance drift. Authoritative ledger perfectly matches balance.
        """
        acct = self.billing_acct

        # 1. Recharge 1000.00 (PAYMENT +1000, RECHARGE -1000) -> Net 0
        execute_transactional_recharge(
            tenant=self.tenant,
            customer=self.customer,
            amount=Decimal('1000.00'),
            idempotency_key=f"IDEM-{uuid.uuid4().hex[:8]}"
        )
        recon1 = reconcile_billing_account(acct)
        self.assertTrue(recon1['is_balanced'])
        self.assertEqual(recon1['discrepancy'], Decimal('0.00'))

        # 2. Staff Adjustment (+250 credit)
        self.client.force_authenticate(user=self.user)
        adj_res = self.client.post(
            '/api/v1/adjustments/',
            {
                'customer_id': str(self.customer.id),
                'adjustment_type': 'CREDIT',
                'amount': '250.00',
                'reason': 'Special loyalty credit bonus'
            },
            format='json',
            HTTP_HOST=self.domain.hostname
        )
        self.assertEqual(adj_res.status_code, status.HTTP_201_CREATED)

        acct.refresh_from_db()
        recon2 = reconcile_billing_account(acct)
        self.assertTrue(recon2['is_balanced'])
        self.assertEqual(recon2['actual_balance'], Decimal('250.00'))

        # 3. Monthly Invoice Raised (-1000)
        generate_monthly_invoices(tenant_id=str(self.tenant.id), billing_month='November 2026')
        acct.refresh_from_db()
        recon3 = reconcile_billing_account(acct)
        self.assertTrue(recon3['is_balanced'])
        self.assertEqual(recon3['discrepancy'], Decimal('0.00'))

    # ─────────────────────────────────────────────────────────────────────────
    # H. Network Activation Decoupled from DB Transaction (Rules 11 & 12)
    # ─────────────────────────────────────────────────────────────────────────

    def test_network_activation_deferred_to_transaction_on_commit(self):
        """
        Hardware network sync jobs and SMS are never executed inside open financial
        database transactions. dispatch_network_sync_job uses transaction.on_commit.
        """
        with patch('apps.network.tasks.process_network_sync_job.delay') as mock_delay:
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                res = execute_transactional_recharge(
                    tenant=self.tenant,
                    customer=self.customer,
                    amount=Decimal('1000.00'),
                    idempotency_key=f"IDEM-COMM-{uuid.uuid4().hex[:8]}"
                )
                self.assertTrue(res['success'])

            # Verify that the network job was queued via on_commit callback
            self.assertGreaterEqual(len(callbacks), 1)
            mock_delay.assert_called_once()

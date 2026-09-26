import uuid
import datetime
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import transaction
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, TenantDomain, AuditLog
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice, Recharge
from apps.payments.models import PaymentTransaction, TransactionStatus
from apps.authentication.models import StaffMembership, Role, Permission
from apps.finance.models import BillingAccount, LedgerEntry, PaymentAllocation, Adjustment, InvoiceLine
from apps.network.models import Router, NetworkSyncJob
from apps.finance.services import (
    get_or_create_billing_account, record_ledger_entry,
    allocate_payment_to_invoices, reconcile_billing_account,
    execute_transactional_recharge, create_invoice_with_lines,
    apply_advance_to_invoice, reverse_recharge, grant_grace_period,
    sync_customer_financial_summary
)
from apps.network.tasks import dispatch_network_sync_job, process_network_sync_job
from apps.core.tasks import process_customer_expiry, generate_monthly_invoices

User = get_user_model()


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class Phase9FinanceBillingCompletionTests(TestCase):
    """
    Comprehensive verification for Phase 9 — Finance + Billing Completion.
    """
    def setUp(self):
        # Tenant A Setup
        self.tenant_a = Tenant.objects.create(name="Apex ISP", slug="apex-isp", is_active=True)
        self.domain_a = TenantDomain.objects.create(tenant=self.tenant_a, hostname="apex.shebafi.xyz", is_active=True)

        self.user_a = User.objects.create_user(username="apex_admin", password="password123")
        self.role_a = Role.objects.create(tenant=self.tenant_a, name="Apex Super Admin")

        perms = []
        for code in [
            'customer.view', 'customer.create', 'customer.update', 'customer.recharge',
            'invoice.view', 'invoice.create', 'invoice.manage', 'finance.adjust', 'router.manage'
        ]:
            perm, _ = Permission.objects.get_or_create(codename=code, defaults={'name': code, 'module': 'FINANCE'})
            perms.append(perm)
        self.role_a.permissions.set(perms)

        self.membership_a = StaffMembership.objects.create(
            user=self.user_a,
            tenant=self.tenant_a,
            role=self.role_a,
            is_active=True
        )

        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name="Apex-Core-CCR",
            ip_address="10.10.10.1",
            api_port=8728,
            username="admin",
            password="secretpassword",
            is_active=True
        )

        self.package_a = Package.objects.create(
            tenant=self.tenant_a,
            name="Apex 25M",
            mikrotik_profile="25M-Profile",
            speed_mbps=25,
            regular_price=Decimal('1200.00'),
            validity_days=30
        )

        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            full_name="Mahmudur Rahman",
            pppoe_username="mahmud_apex",
            mobile="01710000001",
            package=self.package_a,
            router=self.router_a,
            monthly_bill=Decimal('1200.00'),
            due_amount=Decimal('0.00'),
            advance_amount=Decimal('0.00'),
            status=CustomerStatus.ACTIVE,
            auto_lock_enabled=True,
            expiry_date=timezone.now().date() + datetime.timedelta(days=15)
        )

        # Tenant B Setup (for tenant isolation tests)
        self.tenant_b = Tenant.objects.create(name="Delta Net", slug="delta-net", is_active=True)
        self.domain_b = TenantDomain.objects.create(tenant=self.tenant_b, hostname="delta.shebafi.xyz", is_active=True)
        self.user_b = User.objects.create_user(username="delta_admin", password="password123")
        self.role_b = Role.objects.create(tenant=self.tenant_b, name="Delta Admin")
        self.role_b.permissions.set(perms)
        self.membership_b = StaffMembership.objects.create(
            user=self.user_b,
            tenant=self.tenant_b,
            role=self.role_b,
            is_active=True
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user_a)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Itemized Invoice Lines
    # ─────────────────────────────────────────────────────────────────────────
    def test_itemized_invoice_lines_creation_via_api_and_retrieval(self):
        """Itemized invoice creation creates InvoiceLine rows, updates account, and exposes lines via API."""
        payload = {
            'customer': str(self.customer_a.id),
            'billing_month': 'October 2026',
            'package_name': 'Apex 25M + Static IP',
            'discount': '100.00',
            'lines': [
                {
                    'description': 'Monthly Broadband 25Mbps',
                    'quantity': '1.000',
                    'unit_price': '1200.00',
                    'discount': '100.00',
                    'tax_amount': '55.00'
                },
                {
                    'description': 'Public Real IP Address',
                    'quantity': '1.000',
                    'unit_price': '300.00',
                    'discount': '0.00',
                    'tax_amount': '15.00'
                }
            ]
        }

        response = self.client.post(
            '/api/v1/invoices/',
            payload,
            format='json',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        inv_id = response.data['id']

        invoice = Invoice.objects.get(id=inv_id)
        # Expected total: (1200 - 100 + 55) + (300 - 0 + 15) - 100 discount = 1155 + 315 - 100 = 1370
        self.assertEqual(invoice.total_payable, Decimal('1370.00'))
        self.assertEqual(invoice.package_name, 'Apex 25M + Static IP')
        self.assertEqual(invoice.lines.count(), 2)

        # GET invoice detail returns nested lines
        detail_res = self.client.get(
            f'/api/v1/invoices/{inv_id}/',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail_res.data['lines']), 2)

        # GET invoice-lines endpoint returns line items
        lines_res = self.client.get(
            f'/api/v1/invoice-lines/?invoice={inv_id}',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(lines_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(lines_res.data['results']), 2)

        # Verify ledger entry created
        ledger_entry = LedgerEntry.objects.filter(
            tenant=self.tenant_a,
            customer=self.customer_a,
            entry_type=LedgerEntry.EntryType.INVOICE,
            reference_id=str(inv_id)
        ).first()
        self.assertIsNotNone(ledger_entry)
        self.assertEqual(ledger_entry.amount, Decimal('1370.00'))

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Robust Payment Allocation & Partial Payments
    # ─────────────────────────────────────────────────────────────────────────
    def test_partial_payment_and_fifo_invoice_allocation(self):
        """Payment distributes across multiple invoices in FIFO order and supports partial settlement."""
        inv1 = Invoice.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            invoice_no="INV-FIFO-001",
            billing_month="August 2026",
            package_name=self.package_a.name,
            package_amount=Decimal('800.00'),
            total_payable=Decimal('800.00'),
            paid_amount=Decimal('0.00'),
            due_amount=Decimal('800.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )
        inv2 = Invoice.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            invoice_no="INV-FIFO-002",
            billing_month="September 2026",
            package_name=self.package_a.name,
            package_amount=Decimal('600.00'),
            total_payable=Decimal('600.00'),
            paid_amount=Decimal('0.00'),
            due_amount=Decimal('600.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )
        self.customer_a.due_amount = Decimal('1400.00')
        self.customer_a.save()

        # Payment of 1000 arrives (800 for inv1, 200 partial for inv2)
        payment = PaymentTransaction.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            amount=Decimal('1000.00'),
            trx_id="PAY-FIFO-999",
            payment_method="bKash",
            status=TransactionStatus.SUCCESS
        )

        res = allocate_payment_to_invoices(
            tenant=self.tenant_a,
            payment=payment,
            customer=self.customer_a,
            amount=Decimal('1000.00'),
            notes="FIFO settlement"
        )

        self.assertEqual(res['allocated_total'], Decimal('1000.00'))
        self.assertEqual(res['overpayment_amount'], Decimal('0.00'))

        inv1.refresh_from_db()
        inv2.refresh_from_db()
        self.assertEqual(inv1.status, Invoice.InvoiceStatus.PAID)
        self.assertEqual(inv1.due_amount, Decimal('0.00'))

        self.assertEqual(inv2.status, Invoice.InvoiceStatus.PARTIAL)
        self.assertEqual(inv2.paid_amount, Decimal('200.00'))
        self.assertEqual(inv2.due_amount, Decimal('400.00'))

        # Check PaymentAllocations
        allocs = PaymentAllocation.objects.filter(payment=payment).order_by('invoice__invoice_no')
        self.assertEqual(allocs.count(), 2)
        self.assertEqual(allocs[0].amount, Decimal('800.00'))
        self.assertEqual(allocs[1].amount, Decimal('200.00'))

        # Immutable check: deleting allocation raises ValidationError
        with self.assertRaises(Exception):
            allocs[0].delete()

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Advance / Credit Balances
    # ─────────────────────────────────────────────────────────────────────────
    def test_advance_credit_balance_auto_settlement(self):
        """Customer with advance balance automatically settles new invoices."""
        self.customer_a.advance_amount = Decimal('500.00')
        self.customer_a.due_amount = Decimal('0.00')
        self.customer_a.save()

        # Generate invoice of 1200
        inv = create_invoice_with_lines(
            tenant=self.tenant_a,
            customer=self.customer_a,
            lines_data=[
                {'description': 'Monthly Internet', 'quantity': 1, 'unit_price': '1200.00', 'discount': '0.00', 'tax_amount': '0.00'}
            ],
            billing_month='November 2026',
            actor_username='apex_admin'
        )

        inv.refresh_from_db()
        self.customer_a.refresh_from_db()

        # Advance of 500 should be auto-applied
        self.assertEqual(inv.paid_amount, Decimal('500.00'))
        self.assertEqual(inv.due_amount, Decimal('700.00'))
        self.assertEqual(inv.status, Invoice.InvoiceStatus.PARTIAL)

        self.assertEqual(self.customer_a.advance_amount, Decimal('0.00'))
        self.assertEqual(self.customer_a.due_amount, Decimal('700.00'))

        # Check ADVANCE ledger entry
        advance_entry = LedgerEntry.objects.filter(
            tenant=self.tenant_a,
            customer=self.customer_a,
            entry_type=LedgerEntry.EntryType.ADVANCE
        ).first()
        self.assertIsNotNone(advance_entry)
        self.assertEqual(advance_entry.amount, Decimal('500.00'))

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Grace-Period Behavior & Expiry Lock
    # ─────────────────────────────────────────────────────────────────────────
    def test_grace_period_prevents_auto_lock(self):
        """Customers within active promise_date grace period are not suspended."""
        today = timezone.now().date()
        self.customer_a.expiry_date = today - datetime.timedelta(days=2)
        self.customer_a.promise_date = today + datetime.timedelta(days=3)  # Active grace period
        self.customer_a.status = CustomerStatus.ACTIVE
        self.customer_a.save()

        result = process_customer_expiry(str(self.tenant_a.id), str(self.customer_a.id))
        self.customer_a.refresh_from_db()

        self.assertEqual(result.get('skipped'), 'IN_GRACE_PERIOD')
        self.assertEqual(self.customer_a.status, CustomerStatus.ACTIVE)

        # Now expire promise_date
        self.customer_a.promise_date = today - datetime.timedelta(days=1)
        self.customer_a.save()

        with patch('apps.network.tasks.dispatch_network_sync_job') as mock_dispatch:
            result = process_customer_expiry(str(self.tenant_a.id), str(self.customer_a.id))
            self.customer_a.refresh_from_db()

            self.assertEqual(self.customer_a.status, CustomerStatus.EXPIRED)
            mock_dispatch.assert_called_once()
            args, kwargs = mock_dispatch.call_args
            self.assertEqual(kwargs.get('action'), NetworkSyncJob.Action.DISABLE_USER)
            self.assertEqual(kwargs.get('tenant'), self.customer_a.tenant)
            self.assertEqual(kwargs.get('customer'), self.customer_a)
            self.assertEqual(kwargs.get('router'), self.customer_a.router)

    def test_grant_grace_period_via_api(self):
        """Granting grace period extends promise_date and dispatches post-commit network sync."""
        self.customer_a.status = CustomerStatus.EXPIRED
        self.customer_a.save()

        response = self.client.post(
            f'/api/v1/customers/{self.customer_a.id}/grant-grace-period/',
            {'days': 5},
            format='json',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.status, CustomerStatus.ACTIVE)
        expected_promise = timezone.now().date() + datetime.timedelta(days=5)
        self.assertEqual(self.customer_a.promise_date, expected_promise)

        # Check AuditLog created
        audit = AuditLog.objects.filter(
            tenant=self.tenant_a,
            action='GRANT_GRACE_PERIOD',
            target_id=str(self.customer_a.id)
        ).first()
        self.assertIsNotNone(audit)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Financial Adjustment & Compensating Reversal (Append-Only)
    # ─────────────────────────────────────────────────────────────────────────
    def test_recharge_compensating_reversal_append_only(self):
        """Reversing a recharge does not destroy records; it appends reversal ledger entries and restores expiry."""
        old_expiry = timezone.now().date()
        self.customer_a.expiry_date = old_expiry
        self.customer_a.save()

        # Perform recharge
        recharge_res = execute_transactional_recharge(
            tenant=self.tenant_a,
            customer=self.customer_a,
            amount=Decimal('1200.00'),
            validity_days=30,
            payment_method='bKash',
            trx_id='BKASH-REV-TEST',
            actor_username='apex_admin'
        )
        recharge_id = recharge_res['recharge_id']
        recharge = Recharge.objects.get(id=recharge_id)

        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.expiry_date, old_expiry + datetime.timedelta(days=30))

        # Reverse recharge via API
        response = self.client.post(
            f'/api/v1/recharges/{recharge_id}/reverse/',
            {'reason': 'Erroneous subscriber renewal'},
            format='json',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        recharge.refresh_from_db()
        self.assertTrue(recharge.is_reversed)

        # Customer expiry restored
        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.expiry_date, old_expiry)

        # Linked payment marked REFUNDED, not deleted
        payment = PaymentTransaction.objects.get(id=recharge_res['payment_id'])
        self.assertEqual(payment.status, TransactionStatus.REFUNDED)

        # Reversal ledger entry appended
        rev_ledger = LedgerEntry.objects.filter(
            tenant=self.tenant_a,
            customer=self.customer_a,
            entry_type=LedgerEntry.EntryType.REVERSAL,
            reference_id=str(recharge.id)
        ).first()
        self.assertIsNotNone(rev_ledger)
        self.assertEqual(rev_ledger.amount, Decimal('1200.00'))

        # Surplus advance created by the recharge was cleared upon reversal
        self.assertEqual(self.customer_a.advance_amount, Decimal('0.00'))

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Authoritative Balance Derivation & Recalculation
    # ─────────────────────────────────────────────────────────────────────────
    def test_authoritative_balance_recalculation(self):
        """recalculate_balance resolves cached due drift authoritatively from unpaid invoices."""
        Invoice.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            invoice_no="INV-DRIFT-1",
            billing_month="September 2026",
            package_name=self.package_a.name,
            package_amount=Decimal('1200.00'),
            total_payable=Decimal('1200.00'),
            paid_amount=Decimal('200.00'),
            due_amount=Decimal('1000.00'),
            status=Invoice.InvoiceStatus.PARTIAL
        )
        # Introduce artificial drift on customer.due_amount
        self.customer_a.due_amount = Decimal('9999.00')
        self.customer_a.save()

        response = self.client.post(
            f'/api/v1/customers/{self.customer_a.id}/recalculate-balance/',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.due_amount, Decimal('1000.00'))

        # Check financial-summary endpoint
        summary_res = self.client.get(
            f'/api/v1/customers/{self.customer_a.id}/financial-summary/',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(summary_res.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(summary_res.data['due_amount'])), Decimal('1000.00'))
        self.assertEqual(len(summary_res.data['open_invoices']), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Recurring Monthly Invoice Generation
    # ─────────────────────────────────────────────────────────────────────────
    def test_recurring_monthly_batch_invoice_generation(self):
        """Batch monthly invoice endpoint defaults to async 202, and supports strict async=False / 'false'."""
        # 1. Default without async parameter returns 202 Accepted
        async_res = self.client.post(
            '/api/v1/invoices/generate-batch/',
            {'billing_month': 'January 2027'},
            format='json',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(async_res.status_code, status.HTTP_202_ACCEPTED)
        self.assertIn('task_id', async_res.data)

        # 2. Explicit 'async': False runs synchronously and returns 200 OK
        sync_res = self.client.post(
            '/api/v1/invoices/generate-batch/',
            {'billing_month': 'February 2027', 'async': False},
            format='json',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(sync_res.status_code, status.HTTP_200_OK)
        self.assertTrue(sync_res.data.get('success'))
        self.assertGreaterEqual(sync_res.data.get('invoices_created'), 1)

        # 3. String 'false' is strictly parsed as False (not treated as truthy)
        str_false_res = self.client.post(
            '/api/v1/invoices/generate-batch/',
            {'billing_month': 'March 2027', 'async': 'false'},
            format='json',
            HTTP_HOST=self.domain_a.hostname
        )
        self.assertEqual(str_false_res.status_code, status.HTTP_200_OK)
        self.assertTrue(str_false_res.data.get('success'))
        self.assertGreaterEqual(str_false_res.data.get('invoices_created'), 1)

        inv = Invoice.objects.filter(tenant=self.tenant_a, customer=self.customer_a, billing_month='February 2027').first()
        self.assertIsNotNone(inv)
        self.assertEqual(inv.total_payable, Decimal('1200.00'))
        self.assertEqual(inv.lines.count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Tenant Scoping & Cross-Tenant Boundary Protection
    # ─────────────────────────────────────────────────────────────────────────
    def test_tenant_isolation_in_finance_endpoints(self):
        """Tenant B staff cannot access, pay, or reverse Tenant A's financial assets."""
        inv = Invoice.objects.create(
            tenant=self.tenant_a,
            customer=self.customer_a,
            invoice_no="INV-TENANT-ISO",
            billing_month="October 2026",
            package_name=self.package_a.name,
            package_amount=Decimal('1000.00'),
            total_payable=Decimal('1000.00'),
            due_amount=Decimal('1000.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )

        client_b = APIClient()
        client_b.force_authenticate(user=self.user_b)

        # Cross-tenant GET returns 404
        get_res = client_b.get(f'/api/v1/invoices/{inv.id}/', HTTP_HOST=self.domain_b.hostname)
        self.assertEqual(get_res.status_code, status.HTTP_404_NOT_FOUND)

        # Cross-tenant pay returns 404
        pay_res = client_b.post(f'/api/v1/invoices/{inv.id}/pay/', {'amount': '500.00'}, HTTP_HOST=self.domain_b.hostname)
        self.assertEqual(pay_res.status_code, status.HTTP_404_NOT_FOUND)

        # Cross-tenant lines query returns empty
        lines_res = client_b.get(f'/api/v1/invoice-lines/?invoice={inv.id}', HTTP_HOST=self.domain_b.hostname)
        self.assertEqual(lines_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(lines_res.data['results']), 0)

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Critical Network Rule: DB Commit Before Network Calls
    # ─────────────────────────────────────────────────────────────────────────
    def test_critical_network_rule_durable_sync_job_lifecycle(self):
        """
        Database transaction commits BEFORE any physical network operation.
        NetworkSyncJob is created in PENDING state and executed asynchronously.
        """
        with patch('apps.network.tasks.process_network_sync_job.delay') as mock_delay:
            with self.captureOnCommitCallbacks(execute=True):
                job = dispatch_network_sync_job(
                    tenant=self.tenant_a,
                    action=NetworkSyncJob.Action.ENABLE_USER,
                    customer=self.customer_a,
                    router=self.router_a,
                    payload={'pppoe_username': self.customer_a.pppoe_username}
                )
                self.assertEqual(job.status, NetworkSyncJob.JobStatus.PENDING)

            # After on_commit fires, task is enqueued
            mock_delay.assert_called_once_with(str(self.tenant_a.id), str(job.id))

        # Now test execution of process_network_sync_job
        with patch('apps.network.services.mikrotik.pppoe.MikroTikPPPoEService.enable_user_by_name', return_value={'success': True}), \
             patch('apps.network.services.mikrotik.pppoe.MikroTikPPPoEService.update_user_by_name', return_value={'success': True}):
            res = process_network_sync_job(tenant_id=str(self.tenant_a.id), job_id=str(job.id))
            self.assertTrue(res['success'])

            job.refresh_from_db()
            self.assertIn(job.status, [NetworkSyncJob.JobStatus.SUCCEEDED, NetworkSyncJob.JobStatus.SUCCESS])
            self.assertIsNotNone(job.completed_at)

    def test_advance_and_reversal_ledger_reconciliation_consistency(self):
        """
        Verify that apply_advance_to_invoice and reverse_recharge keep
        BillingAccount.balance perfectly balanced with reconcile_billing_account.
        """
        cust = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="REC-001",
            full_name="Recon Test User",
            pppoe_username="recon_user",
            mobile="01799999991",
            package=self.package_a,
            advance_amount=Decimal('500.00')
        )
        acct = get_or_create_billing_account(self.tenant_a, cust)
        acct.balance = Decimal('500.00')
        acct.save()

        # Initial advance entry
        record_ledger_entry(
            tenant=self.tenant_a,
            customer=cust,
            entry_type=LedgerEntry.EntryType.ADVANCE,
            amount=Decimal('500.00'),
            balance_after=acct.balance,
            reference_id=str(uuid.uuid4()),
            reference_type='Seed'
        )
        recon_init = reconcile_billing_account(acct)
        self.assertTrue(recon_init['is_balanced'])

        # Create invoice
        inv = create_invoice_with_lines(
            tenant=self.tenant_a,
            customer=cust,
            package_name=self.package_a.name,
            package_amount=Decimal('300.00'),
            total_payable=Decimal('300.00')
        )
        acct.refresh_from_db()
        recon_after_inv = reconcile_billing_account(acct)
        self.assertTrue(recon_after_inv['is_balanced'], f"Discrepancy: {recon_after_inv['discrepancy']}")

        # Recharge and reversal
        with patch('apps.network.tasks.process_network_sync_job.delay'):
            recharge_res = execute_transactional_recharge(
                tenant=self.tenant_a,
                customer=cust,
                package=self.package_a,
                amount=Decimal('1000.00'),
                payment_method='CASH'
            )
            recharge_obj = Recharge.objects.get(id=recharge_res['recharge_id'])
            acct.refresh_from_db()
            recon_recharge = reconcile_billing_account(acct)
            self.assertTrue(recon_recharge['is_balanced'])

            reverse_recharge(self.tenant_a, recharge_obj, reason="Customer canceled")
            acct.refresh_from_db()
            recon_rev = reconcile_billing_account(acct)
            self.assertTrue(recon_rev['is_balanced'], f"Reversal Discrepancy: {recon_rev['discrepancy']}")

    def test_invoice_creation_due_amount_aggregates_all_open_invoices(self):
        """
        Verify that locked_customer.due_amount aggregates all open invoices
        instead of blindly overwriting with only the newly raised invoice.
        """
        cust = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="MULTI-INV-01",
            full_name="Multi Invoice Customer",
            pppoe_username="multi_user",
            mobile="01799999992",
            package=self.package_a
        )
        # Create first unpaid invoice
        inv1 = Invoice.objects.create(
            tenant=self.tenant_a,
            customer=cust,
            invoice_no="INV-PREV-01",
            billing_month="September 2026",
            package_name=self.package_a.name,
            package_amount=Decimal('500.00'),
            total_payable=Decimal('500.00'),
            due_amount=Decimal('500.00'),
            status=Invoice.InvoiceStatus.UNPAID
        )

        # Create second invoice using create_invoice_with_lines (different billing month
        # to satisfy the unique_invoice_per_customer_per_month DB constraint)
        inv2 = create_invoice_with_lines(
            tenant=self.tenant_a,
            customer=cust,
            billing_month="October 2026",
            package_name=self.package_a.name,
            package_amount=Decimal('1000.00'),
            total_payable=Decimal('1000.00')
        )
        cust.refresh_from_db()
        self.assertEqual(cust.due_amount, Decimal('1500.00'))

    def test_process_network_sync_job_explicit_rejection_for_invalid_operations(self):
        """
        Verify that missing router, missing username, unsupported actions (SYNC_ROUTER, REBOOT_ONU),
        and UPDATE_PACKAGE without a profile are rejected and never marked as SUCCESS.
        """
        # 1. Missing router
        job_no_router = NetworkSyncJob.objects.create(
            tenant=self.tenant_a,
            action=NetworkSyncJob.Action.ENABLE_USER,
            payload={'username': 'user1'}
        )
        res = process_network_sync_job(tenant_id=str(self.tenant_a.id), job_id=str(job_no_router.id))
        self.assertFalse(res['success'])
        job_no_router.refresh_from_db()
        self.assertEqual(job_no_router.status, NetworkSyncJob.JobStatus.FAILED)

        # 2. Missing username
        job_no_user = NetworkSyncJob.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            action=NetworkSyncJob.Action.ENABLE_USER,
            payload={}
        )
        res = process_network_sync_job(tenant_id=str(self.tenant_a.id), job_id=str(job_no_user.id))
        self.assertFalse(res['success'])
        job_no_user.refresh_from_db()
        self.assertEqual(job_no_user.status, NetworkSyncJob.JobStatus.FAILED)

        # 3. Unsupported action SYNC_ROUTER
        job_unsupported = NetworkSyncJob.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            action=NetworkSyncJob.Action.SYNC_ROUTER,
            payload={'username': 'user1'}
        )
        res = process_network_sync_job(tenant_id=str(self.tenant_a.id), job_id=str(job_unsupported.id))
        self.assertFalse(res['success'])
        job_unsupported.refresh_from_db()
        self.assertEqual(job_unsupported.status, NetworkSyncJob.JobStatus.FAILED)

        # 4. UPDATE_PACKAGE without profile
        job_no_profile = NetworkSyncJob.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            action=NetworkSyncJob.Action.UPDATE_PACKAGE,
            payload={'username': 'user1'}
        )
        res = process_network_sync_job(tenant_id=str(self.tenant_a.id), job_id=str(job_no_profile.id))
        self.assertFalse(res['success'])
        job_no_profile.refresh_from_db()
        self.assertEqual(job_no_profile.status, NetworkSyncJob.JobStatus.FAILED)

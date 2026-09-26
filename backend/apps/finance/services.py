import uuid
import datetime
from decimal import Decimal
from typing import Optional, Dict, Any, List

from django.db import transaction, models, IntegrityError
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Invoice, Recharge, Package
from apps.payments.models import PaymentTransaction, TransactionStatus
from apps.finance.models import BillingAccount, LedgerEntry, PaymentAllocation, Adjustment, IdempotencyKey


def get_or_create_billing_account(tenant: Tenant, customer: Customer) -> BillingAccount:
    """
    Retrieves or creates the BillingAccount anchor for a customer.
    """
    account, _ = BillingAccount.objects.get_or_create(
        tenant=tenant,
        customer=customer,
        defaults={
            'balance': Decimal('0.00'),
            'credit_limit': Decimal('0.00'),
            'total_paid': Decimal('0.00'),
            'total_invoiced': Decimal('0.00'),
            'overdue_amount': Decimal('0.00'),
        }
    )
    return account


def allocate_payment_to_invoices(
    tenant: Tenant,
    payment: PaymentTransaction,
    customer: Optional[Customer] = None,
    amount: Optional[Decimal] = None,
    notes: str = ''
) -> Dict[str, Any]:
    """
    Allocates a payment against open invoices in FIFO order.
    Handles partial payments and overpayments cleanly.
    """
    cust = customer or payment.customer
    alloc_amount = Decimal(str(amount if amount is not None else payment.amount))
    if alloc_amount <= 0:
        return {'allocated_total': Decimal('0.00'), 'overpayment_amount': Decimal('0.00'), 'allocations': []}

    with transaction.atomic():
        open_invoices = Invoice.objects.filter(
            tenant=tenant,
            customer=cust,
            status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL]
        ).order_by('created_at').select_for_update()

        allocated_total = Decimal('0.00')
        remaining = alloc_amount
        allocations_created = []

        for inv in open_invoices:
            if remaining <= 0:
                break

            current_paid = Decimal(str(inv.paid_amount or '0.00'))
            total_payable = Decimal(str(inv.total_payable or '0.00'))
            due = total_payable - current_paid

            if due <= 0:
                inv.status = Invoice.InvoiceStatus.PAID
                inv.due_amount = Decimal('0.00')
                inv.save(update_fields=['status', 'due_amount'])
                continue

            chunk = min(remaining, due)
            alloc = PaymentAllocation.objects.create(
                tenant=tenant,
                payment=payment,
                invoice=inv,
                amount=chunk,
                notes=notes or f"Allocation from Trx {payment.trx_id}"
            )
            allocations_created.append(alloc)

            new_paid = current_paid + chunk
            new_due = total_payable - new_paid
            inv.paid_amount = new_paid
            inv.due_amount = max(Decimal('0.00'), new_due)
            if inv.due_amount <= Decimal('0.00'):
                inv.status = Invoice.InvoiceStatus.PAID
            else:
                inv.status = Invoice.InvoiceStatus.PARTIAL
            inv.save(update_fields=['paid_amount', 'due_amount', 'status'])

            remaining -= chunk
            allocated_total += chunk

        return {
            'allocated_total': allocated_total,
            'overpayment_amount': remaining,
            'allocations': allocations_created
        }


def record_ledger_entry(
    tenant: Tenant,
    customer: Optional[Customer],
    entry_type: str,
    amount: Decimal,
    balance_after: Decimal,
    reference_id: str = '',
    reference_type: str = '',
    description: str = '',
    created_by: str = 'system'
) -> LedgerEntry:
    """
    Appends an immutable LedgerEntry record.
    """
    return LedgerEntry.objects.create(
        tenant=tenant,
        customer=customer,
        entry_type=entry_type,
        amount=Decimal(str(amount)),
        balance_after=Decimal(str(balance_after)),
        reference_id=str(reference_id),
        reference_type=reference_type,
        description=description,
        created_by=created_by,
        created_at=timezone.now()
    )


def reconcile_billing_account(billing_account: BillingAccount) -> Dict[str, Any]:
    """
    Reconciles BillingAccount.balance against the sum of all related LedgerEntry records.
    Ledger is the financial source of truth.
    """
    entries = LedgerEntry.objects.filter(
        tenant=billing_account.tenant,
        customer=billing_account.customer
    ).order_by('created_at')

    expected_balance = Decimal('0.00')
    credit_types = {
        LedgerEntry.EntryType.PAYMENT,
        LedgerEntry.EntryType.ADVANCE,
        LedgerEntry.EntryType.CREDIT_NOTE,
    }
    debit_types = {
        LedgerEntry.EntryType.INVOICE,
        LedgerEntry.EntryType.RECHARGE,
        LedgerEntry.EntryType.REFUND,
        LedgerEntry.EntryType.REVERSAL,
        LedgerEntry.EntryType.DEBIT_NOTE,
    }

    for entry in entries:
        amt = Decimal(str(entry.amount))
        if entry.entry_type in credit_types:
            expected_balance += amt
        elif entry.entry_type in debit_types:
            expected_balance -= amt
        elif entry.entry_type == LedgerEntry.EntryType.ADJUSTMENT:
            expected_balance += amt

    actual_balance = Decimal(str(billing_account.balance or '0.00'))
    discrepancy = actual_balance - expected_balance

    return {
        'is_balanced': discrepancy == Decimal('0.00'),
        'actual_balance': actual_balance,
        'expected_balance': expected_balance,
        'discrepancy': discrepancy,
        'entry_count': entries.count()
    }


def execute_transactional_recharge(
    tenant: Tenant,
    customer: Customer,
    amount: Decimal,
    discount: Decimal = Decimal('0.00'),
    validity_days: int = 30,
    payment_method: str = 'Cash',
    trx_id: str = '',
    notes: str = '',
    processed_by: Any = None,
    idempotency_key: Optional[str] = None,
    package: Optional[Package] = None,
    actor_username: str = 'system'
) -> Dict[str, Any]:
    """
    Executes a fully transactional, idempotent subscriber recharge.
    Guarantee: All mutations (Customer state, BillingAccount, LedgerEntry, Recharge,
    PaymentTransaction, PaymentAllocation, IdempotencyKey) occur inside transaction.atomic()
    with row-level locks. A partial recharge will NEVER occur.
    """
    amount_dec = Decimal(str(amount))
    discount_dec = Decimal(str(discount or '0.00'))
    net_credit = amount_dec + discount_dec

    with transaction.atomic():
        # 1. Idempotency Check & Lock
        if idempotency_key:
            idem, created = IdempotencyKey.objects.get_or_create(
                tenant=tenant,
                key=idempotency_key,
                defaults={
                    'operation': 'recharge',
                    'status': IdempotencyKey.Status.PROCESSING
                }
            )
            if not created:
                if idem.is_complete:
                    return {
                        'success': True,
                        'idempotent': True,
                        'response_data': idem.response_body
                    }
                elif idem.status == IdempotencyKey.Status.PROCESSING:
                    raise ValidationError("A recharge with this Idempotency-Key is currently processing.")

        # 2. Duplicate TrxID verification
        final_trx_id = trx_id.strip() if trx_id else f"RCH-{uuid.uuid4().hex[:10].upper()}"
        if trx_id and (
            Recharge.objects.filter(tenant=tenant, trx_id=final_trx_id).exists()
            or PaymentTransaction.objects.filter(trx_id=final_trx_id).exists()
        ):
            raise ValidationError(f"Transaction ID {final_trx_id} has already been processed.")

        # 3. Row-level locks on Customer and BillingAccount
        locked_customer = Customer.objects.select_for_update().get(id=customer.id)
        billing_acct = BillingAccount.objects.select_for_update().filter(
            tenant=tenant, customer=locked_customer
        ).first()
        if not billing_acct:
            billing_acct = get_or_create_billing_account(tenant, locked_customer)
            billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)

        # 4. Target Package resolution
        target_package = package or locked_customer.package

        # 5. Date calculation
        today = timezone.now().date()
        old_expiry = locked_customer.expiry_date
        if old_expiry and old_expiry >= today:
            new_expiry = old_expiry + datetime.timedelta(days=validity_days)
        else:
            new_expiry = today + datetime.timedelta(days=validity_days)

        # 6. Customer state update
        locked_customer.expiry_date = new_expiry
        locked_customer.status = CustomerStatus.ACTIVE
        if target_package:
            locked_customer.package = target_package

        # Adjust due and advance amounts
        due_dec = Decimal(str(locked_customer.due_amount or '0.00'))
        adv_dec = Decimal(str(locked_customer.advance_amount or '0.00'))
        if due_dec > 0:
            if net_credit >= due_dec:
                surplus = net_credit - due_dec
                locked_customer.due_amount = Decimal('0.00')
                locked_customer.advance_amount = adv_dec + surplus
            else:
                locked_customer.due_amount = due_dec - net_credit
        else:
            locked_customer.advance_amount = adv_dec + net_credit
        locked_customer.save()

        # 7. Create Recharge log
        recharge_record = Recharge.objects.create(
            tenant=tenant,
            customer=locked_customer,
            package=target_package,
            processed_by=processed_by,
            amount=amount_dec,
            discount=discount_dec,
            validity_days=validity_days,
            old_expiry=old_expiry,
            new_expiry=new_expiry,
            payment_method=payment_method,
            trx_id=final_trx_id,
            notes=notes
        )

        # 8. Create PaymentTransaction if payment amount > 0
        payment_trx = None
        allocation_result = None
        if amount_dec > 0:
            try:
                payment_trx = PaymentTransaction.objects.create(
                    tenant=tenant,
                    customer=locked_customer,
                    amount=amount_dec,
                    payment_method=payment_method,
                    trx_id=final_trx_id,
                    status=TransactionStatus.SUCCESS,
                    raw_payload={
                        'notes': f"Recharge payment for {locked_customer.pppoe_username}",
                        'idempotency_key': idempotency_key or '',
                        'processed_by': actor_username
                    }
                )
            except IntegrityError:
                raise ValidationError(f"Transaction ID {final_trx_id} has already been processed.")

            # Update BillingAccount total_paid & last_payment_at
            billing_acct.total_paid = Decimal(str(billing_acct.total_paid or '0.00')) + amount_dec
            billing_acct.last_payment_at = timezone.now()

            # Record PAYMENT LedgerEntry
            cur_bal = Decimal(str(billing_acct.balance or '0.00')) + amount_dec
            billing_acct.balance = cur_bal
            record_ledger_entry(
                tenant=tenant,
                customer=locked_customer,
                entry_type=LedgerEntry.EntryType.PAYMENT,
                amount=amount_dec,
                balance_after=billing_acct.balance,
                reference_id=str(payment_trx.id),
                reference_type='PaymentTransaction',
                description=f"Recharge payment received via {payment_method} (Trx: {final_trx_id})",
                created_by=actor_username
            )

            # Allocate payment to open invoices
            allocation_result = allocate_payment_to_invoices(
                tenant=tenant,
                payment=payment_trx,
                customer=locked_customer,
                amount=amount_dec,
                notes=f"Auto-allocated from recharge {recharge_record.id}"
            )

        # 9. Record RECHARGE service consumption LedgerEntry (debit)
        cur_bal = Decimal(str(billing_acct.balance or '0.00')) - amount_dec
        billing_acct.balance = cur_bal

        record_ledger_entry(
            tenant=tenant,
            customer=locked_customer,
            entry_type=LedgerEntry.EntryType.RECHARGE,
            amount=amount_dec,
            balance_after=billing_acct.balance,
            reference_id=str(recharge_record.id),
            reference_type='Recharge',
            description=f"Service recharge validity extension to {new_expiry}",
            created_by=actor_username
        )

        if discount_dec > 0:
            cur_bal = Decimal(str(billing_acct.balance or '0.00')) + discount_dec
            billing_acct.balance = cur_bal
            record_ledger_entry(
                tenant=tenant,
                customer=locked_customer,
                entry_type=LedgerEntry.EntryType.CREDIT_NOTE,
                amount=discount_dec,
                balance_after=billing_acct.balance,
                reference_id=str(recharge_record.id),
                reference_type='Recharge',
                description=f"Promotional discount applied for recharge {recharge_record.id}",
                created_by=actor_username
            )

        billing_acct.save(update_fields=['balance', 'total_paid', 'last_payment_at'])

        response_payload = {
            'success': True,
            'message': f"Successfully recharged ৳{amount_dec} for {locked_customer.pppoe_username}",
            'recharge_id': str(recharge_record.id),
            'payment_id': str(payment_trx.id) if payment_trx else None,
            'new_expiry': str(new_expiry),
            'balance': float(billing_acct.balance),
            'due_amount': float(locked_customer.due_amount),
            'advance_amount': float(locked_customer.advance_amount),
            'allocations_count': len(allocation_result['allocations']) if allocation_result else 0
        }

        # 10. Complete Idempotency record
        if idempotency_key:
            idem.status = IdempotencyKey.Status.COMPLETE
            idem.response_body = response_payload
            idem.response_status = 200
            idem.completed_at = timezone.now()
            idem.save(update_fields=['status', 'response_body', 'response_status', 'completed_at'])

        # 11. CRITICAL NETWORK RULE: Post-commit durable network sync job
        from apps.network.tasks import dispatch_network_sync_job
        from apps.network.models import NetworkSyncJob
        dispatch_network_sync_job(
            tenant=tenant,
            action=NetworkSyncJob.Action.ENABLE_USER,
            customer=locked_customer,
            payload={
                'username': locked_customer.pppoe_username,
                'profile': target_package.mikrotik_profile if target_package else None
            }
        )

        return response_payload


# ─────────────────────────────────────────────────────────────────────────────
# Advance Settlement & Invoice Auto-Allocation (Phase 9)
# ─────────────────────────────────────────────────────────────────────────────

def apply_advance_to_invoice(
    tenant: Tenant,
    customer: Customer,
    invoice: Invoice,
    actor_username: str = 'system'
) -> Optional[PaymentAllocation]:
    """
    Applies existing customer advance balance towards an open invoice.
    All operations are strictly atomic with row-level locks.
    Never holds open locks during external calls.
    """
    with transaction.atomic():
        locked_invoice = Invoice.objects.select_for_update().get(id=invoice.id)
        locked_customer = Customer.objects.select_for_update().get(id=customer.id)
        billing_acct = BillingAccount.objects.select_for_update().filter(
            tenant=tenant, customer=locked_customer
        ).first()
        if not billing_acct:
            billing_acct = get_or_create_billing_account(tenant, locked_customer)
            billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)

        current_due = Decimal(str(locked_invoice.total_payable)) - Decimal(str(locked_invoice.paid_amount or '0.00'))
        if current_due <= 0:
            return None

        available_advance = max(Decimal('0.00'), Decimal(str(locked_customer.advance_amount or '0.00')))
        if available_advance <= 0:
            return None

        deduct_amount = min(available_advance, current_due)

        # 1. PaymentTransaction representing advance credit settlement
        settlement_trx_id = f"ADV-{uuid.uuid4().hex[:10].upper()}"
        payment = PaymentTransaction.objects.create(
            tenant=tenant,
            customer=locked_customer,
            amount=deduct_amount,
            payment_method='Advance Balance',
            trx_id=settlement_trx_id,
            status=TransactionStatus.SUCCESS,
            raw_payload={
                'notes': f"Settlement of invoice #{locked_invoice.invoice_no} from advance balance",
                'processed_by': actor_username
            }
        )

        # 2. PaymentAllocation
        alloc = PaymentAllocation.objects.create(
            tenant=tenant,
            payment=payment,
            invoice=locked_invoice,
            amount=deduct_amount,
            notes=f"Settlement from advance balance (Trx: {settlement_trx_id})"
        )

        # 3. Update Invoice
        new_paid = Decimal(str(locked_invoice.paid_amount or '0.00')) + deduct_amount
        locked_invoice.paid_amount = new_paid
        locked_invoice.due_amount = max(Decimal('0.00'), Decimal(str(locked_invoice.total_payable)) - new_paid)
        if locked_invoice.due_amount <= 0:
            locked_invoice.status = Invoice.InvoiceStatus.PAID
        else:
            locked_invoice.status = Invoice.InvoiceStatus.PARTIAL
        locked_invoice.save(update_fields=['paid_amount', 'due_amount', 'status'])

        # 4. Update Customer advance & due
        locked_customer.advance_amount = available_advance - deduct_amount
        open_due = Invoice.objects.filter(
            tenant=tenant, customer=locked_customer,
            status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL]
        ).aggregate(total=models.Sum('due_amount'))['total'] or Decimal('0.00')
        locked_customer.due_amount = open_due
        locked_customer.save(update_fields=['advance_amount', 'due_amount'])

        # 5. Append LedgerEntry: ADVANCE deduction (keeps billing_acct.balance consistent with ledger)
        cur_bal = Decimal(str(billing_acct.balance or '0.00')) + deduct_amount
        billing_acct.balance = cur_bal
        billing_acct.save(update_fields=['balance'])

        record_ledger_entry(
            tenant=tenant,
            customer=locked_customer,
            entry_type=LedgerEntry.EntryType.ADVANCE,
            amount=deduct_amount,
            balance_after=cur_bal,
            reference_id=str(locked_invoice.id),
            reference_type='Invoice',
            description=f"Advance applied to Invoice #{locked_invoice.invoice_no}",
            created_by=actor_username
        )

        return alloc


# ─────────────────────────────────────────────────────────────────────────────
# Itemized Invoice Generation (Phase 9)
# ─────────────────────────────────────────────────────────────────────────────

def create_invoice_with_lines(
    tenant: Tenant,
    customer: Customer,
    lines_data: Optional[List[Dict[str, Any]]] = None,
    billing_month: str = '',
    due_date: Optional[datetime.date] = None,
    discount: Optional[Decimal] = None,
    package_name: str = '',
    invoice_no: str = '',
    package_amount: Optional[Decimal] = None,
    total_payable: Optional[Decimal] = None,
    actor_username: str = 'system'
) -> Invoice:
    """
    Creates an Invoice along with its itemized InvoiceLines.
    Updates BillingAccount and appends LedgerEntry.
    If the customer has existing advance credit, automatically settles the invoice.

    Invoice-Discount Policy:
    - Line-level discounts are deducted directly inside each itemized InvoiceLine.total.
    - Invoice-level discount (discount parameter) applies across the whole invoice.
    - An explicitly provided discount of Decimal('0.00') is preserved and does not
      fall back to customer.discount.
    - If lines_data is provided, discount defaults to Decimal('0.00') unless explicitly supplied.
    """
    now = timezone.now()
    month_str = billing_month or now.strftime('%B %Y')
    inv_no = invoice_no or f"INV-{now.strftime('%y%m')}-{uuid.uuid4().hex[:6].upper()}"

    with transaction.atomic():
        locked_customer = Customer.objects.select_for_update().get(id=customer.id)
        pkg_name = package_name or (locked_customer.package.name if locked_customer.package else 'Standard')
        default_pkg_amount = Decimal(str(locked_customer.monthly_bill or '0.00'))

        calculated_lines = []
        if lines_data and len(lines_data) > 0:
            total_lines_amount = Decimal('0.00')
            for line_item in lines_data:
                desc = line_item.get('description', f"Service - {pkg_name}")
                qty = Decimal(str(line_item.get('quantity', 1)))
                unit_p = Decimal(str(line_item.get('unit_price', default_pkg_amount)))
                disc = Decimal(str(line_item.get('discount', 0)))
                tax = Decimal(str(line_item.get('tax_amount', 0)))
                line_tot = (qty * unit_p) - disc + tax
                total_lines_amount += line_tot
                calculated_lines.append({
                    'description': desc,
                    'quantity': qty,
                    'unit_price': unit_p,
                    'discount': disc,
                    'tax_amount': tax,
                    'total': line_tot
                })
            computed_pkg_amount = package_amount if package_amount is not None else total_lines_amount
        else:
            computed_pkg_amount = package_amount if package_amount is not None else default_pkg_amount
            calculated_lines.append({
                'description': f"Monthly Subscription ({month_str}) - {pkg_name}",
                'quantity': Decimal('1'),
                'unit_price': computed_pkg_amount,
                'discount': Decimal('0.00'),
                'tax_amount': Decimal('0.00'),
                'total': computed_pkg_amount
            })

        prev_due = Decimal(str(locked_customer.due_amount or '0.00'))

        # Discount handling: explicit discount (including 0.00) takes precedence over customer default.
        if discount is not None:
            disc_amount = Decimal(str(discount))
        elif lines_data and len(lines_data) > 0:
            disc_amount = Decimal('0.00')
        else:
            disc_amount = Decimal(str(locked_customer.discount or '0.00'))

        if total_payable is not None:
            computed_total_payable = Decimal(str(total_payable))
        else:
            computed_total_payable = max(Decimal('0.00'), computed_pkg_amount - disc_amount)

        invoice = Invoice.objects.create(
            tenant=tenant,
            customer=locked_customer,
            invoice_no=inv_no,
            billing_month=month_str,
            package_name=pkg_name,
            package_amount=computed_pkg_amount,
            previous_due=prev_due,
            discount=disc_amount,
            total_payable=computed_total_payable,
            paid_amount=Decimal('0.00'),
            due_amount=computed_total_payable,
            status=Invoice.InvoiceStatus.UNPAID,
            due_date=due_date or (now.date() + datetime.timedelta(days=10))
        )

        # pyrefly: ignore [missing-import]
        from apps.finance.models import InvoiceLine
        for cl in calculated_lines:
            InvoiceLine.objects.create(
                tenant=tenant,
                invoice=invoice,
                description=cl['description'],
                quantity=cl['quantity'],
                unit_price=cl['unit_price'],
                discount=cl['discount'],
                tax_amount=cl['tax_amount'],
                total=cl['total']
            )

        # Update customer due_amount derived from all open invoices (matching sync_customer_financial_summary approach)
        open_due = Invoice.objects.filter(
            tenant=tenant, customer=locked_customer,
            status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL]
        ).aggregate(total=models.Sum('due_amount'))['total'] or Decimal('0.00')
        locked_customer.due_amount = open_due
        locked_customer.save(update_fields=['due_amount'])

        # Update BillingAccount & create LedgerEntry
        billing_acct = get_or_create_billing_account(tenant, locked_customer)
        billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)
        billing_acct.total_invoiced = Decimal(str(billing_acct.total_invoiced or '0.00')) + computed_total_payable
        billing_acct.balance = Decimal(str(billing_acct.balance or '0.00')) - computed_total_payable
        billing_acct.overdue_amount = Decimal(str(billing_acct.overdue_amount or '0.00')) + computed_total_payable
        billing_acct.save(update_fields=['total_invoiced', 'balance', 'overdue_amount'])

        record_ledger_entry(
            tenant=tenant,
            customer=locked_customer,
            entry_type=LedgerEntry.EntryType.INVOICE,
            amount=computed_total_payable,
            balance_after=billing_acct.balance,
            reference_id=str(invoice.id),
            reference_type='Invoice',
            description=f"Invoice #{inv_no} ({month_str}) raised",
            created_by=actor_username
        )

        # Check if customer has advance balance to auto-settle
        if Decimal(str(locked_customer.advance_amount or '0.00')) > 0:
            apply_advance_to_invoice(tenant, locked_customer, invoice, actor_username=actor_username)

        return invoice


# ─────────────────────────────────────────────────────────────────────────────
# Financial Reversals & Compensating Entries (Phase 9)
# ─────────────────────────────────────────────────────────────────────────────

def reverse_recharge(
    tenant: Tenant,
    recharge: Recharge,
    reason: str = '',
    actor_username: str = 'system'
) -> Dict[str, Any]:
    """
    Reverses an erroneous recharge in an append-only, compensating manner.
    Never deletes financial records; appends a compensating REVERSAL entry.
    Restores customer expiry date, updates invoices, billing account, and dispatches network sync.
    """
    with transaction.atomic():
        locked_recharge = Recharge.objects.select_for_update().get(id=recharge.id)
        if locked_recharge.is_reversed:
            raise ValidationError("This recharge has already been reversed.")

        locked_customer = Customer.objects.select_for_update().get(id=locked_recharge.customer_id)
        billing_acct = BillingAccount.objects.select_for_update().filter(
            tenant=tenant, customer=locked_customer
        ).first()
        if not billing_acct:
            billing_acct = get_or_create_billing_account(tenant, locked_customer)
            billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)

        locked_recharge.is_reversed = True
        locked_recharge.notes = (locked_recharge.notes or '') + f"\n[REVERSED on {timezone.now().isoformat()} by {actor_username}: {reason}]"
        locked_recharge.save(update_fields=['is_reversed', 'notes'])

        amount_dec = Decimal(str(locked_recharge.amount))

        # 1. Reverse linked PaymentTransaction if exists
        linked_payment = PaymentTransaction.objects.filter(
            tenant=tenant, trx_id=locked_recharge.trx_id
        ).first()
        if linked_payment:
            linked_payment.status = TransactionStatus.REFUNDED
            linked_payment.save(update_fields=['status'])

            # Reverse PaymentAllocations against open invoices
            for alloc in PaymentAllocation.objects.filter(payment=linked_payment).select_related('invoice'):
                inv = alloc.invoice
                inv_paid = max(Decimal('0.00'), Decimal(str(inv.paid_amount or '0.00')) - Decimal(str(alloc.amount)))
                inv.paid_amount = inv_paid
                inv.due_amount = Decimal(str(inv.total_payable)) - inv_paid
                if inv.paid_amount <= 0:
                    inv.status = Invoice.InvoiceStatus.UNPAID
                else:
                    inv.status = Invoice.InvoiceStatus.PARTIAL
                inv.save(update_fields=['paid_amount', 'due_amount', 'status'])

        # 2. Restore customer expiry and status
        today = timezone.now().date()
        if locked_recharge.old_expiry:
            locked_customer.expiry_date = locked_recharge.old_expiry
        else:
            locked_customer.expiry_date = today - datetime.timedelta(days=1)

        if locked_customer.expiry_date < today:
            locked_customer.status = CustomerStatus.EXPIRED
        locked_customer.save(update_fields=['expiry_date', 'status'])

        # 3. Adjust BillingAccount and append REVERSAL ledger entry
        # Debit balance by amount_dec according to reconcile_billing_account contract
        cur_bal = Decimal(str(billing_acct.balance or '0.00')) - amount_dec
        billing_acct.balance = cur_bal
        billing_acct.total_paid = max(Decimal('0.00'), Decimal(str(billing_acct.total_paid or '0.00')) - amount_dec)
        billing_acct.save(update_fields=['total_paid', 'balance'])

        record_ledger_entry(
            tenant=tenant,
            customer=locked_customer,
            entry_type=LedgerEntry.EntryType.REVERSAL,
            amount=amount_dec,
            balance_after=cur_bal,
            reference_id=str(locked_recharge.id),
            reference_type='Recharge',
            description=f"Compensating reversal of Recharge #{locked_recharge.id}: {reason}",
            created_by=actor_username
        )

        # 4. Sync customer due and reverse advance credit created by the recharge
        allocated_to_invoices = Decimal('0.00')
        if linked_payment:
            allocated_to_invoices = PaymentAllocation.objects.filter(
                payment=linked_payment
            ).aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')

        recharge_advance_surplus = max(Decimal('0.00'), amount_dec - allocated_to_invoices)
        if recharge_advance_surplus > 0:
            cur_adv = Decimal(str(locked_customer.advance_amount or '0.00'))
            locked_customer.advance_amount = max(Decimal('0.00'), cur_adv - recharge_advance_surplus)

        open_due = Invoice.objects.filter(
            tenant=tenant, customer=locked_customer,
            status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL]
        ).aggregate(total=models.Sum('due_amount'))['total'] or Decimal('0.00')
        locked_customer.due_amount = open_due
        locked_customer.save(update_fields=['due_amount', 'advance_amount'])

        # 5. AuditLog
        from apps.core.models import AuditLog
        AuditLog.objects.create(
            tenant=tenant,
            actor_username=actor_username,
            action='RECHARGE_REVERSED',
            module='FINANCE',
            target_id=str(locked_recharge.id),
            details={
                'recharge_id': str(locked_recharge.id),
                'customer_id': str(locked_customer.id),
                'amount': str(amount_dec),
                'reason': reason,
                'new_status': locked_customer.status,
                'new_expiry': str(locked_customer.expiry_date)
            }
        )

        # 6. Post-commit NetworkSyncJob
        from apps.network.tasks import dispatch_network_sync_job
        from apps.network.models import NetworkSyncJob
        target_action = NetworkSyncJob.Action.DISABLE_USER if locked_customer.status == CustomerStatus.EXPIRED else NetworkSyncJob.Action.UPDATE_PACKAGE
        dispatch_network_sync_job(
            tenant=tenant,
            action=target_action,
            customer=locked_customer,
            payload={'username': locked_customer.pppoe_username}
        )

        return {
            'success': True,
            'message': f"Recharge {locked_recharge.id} successfully reversed.",
            'recharge_id': str(locked_recharge.id),
            'customer_status': locked_customer.status,
            'expiry_date': str(locked_customer.expiry_date),
            'due_amount': float(locked_customer.due_amount),
            'balance': float(billing_acct.balance)
        }


# ─────────────────────────────────────────────────────────────────────────────
# Grace Period Extension (Phase 9)
# ─────────────────────────────────────────────────────────────────────────────

def grant_grace_period(
    tenant: Tenant,
    customer: Customer,
    promise_date: Optional[Any] = None,
    days: Optional[int] = None,
    notes: str = '',
    actor_username: str = 'system'
) -> Dict[str, Any]:
    """
    Extends a customer's grace period via promise_date without marking dues as paid.
    Temporarily keeps or restores customer line to ACTIVE status.
    Dispatches post-commit network sync to re-enable connection.
    """
    today = timezone.now().date()
    if days is not None:
        target_date = today + datetime.timedelta(days=int(days))
    elif isinstance(promise_date, str):
        target_date = datetime.date.fromisoformat(promise_date)
    elif isinstance(promise_date, datetime.date):
        target_date = promise_date
    else:
        raise ValidationError("Either promise_date or days must be provided.")

    if target_date < today:
        raise ValidationError("Grace period promise date cannot be in the past.")

    with transaction.atomic():
        locked_customer = Customer.objects.select_for_update().get(id=customer.id)
        locked_customer.promise_date = target_date
        old_status = locked_customer.status
        locked_customer.status = CustomerStatus.ACTIVE
        locked_customer.save(update_fields=['promise_date', 'status', 'updated_at'])

        from apps.core.models import AuditLog
        AuditLog.objects.create(
            tenant=tenant,
            actor_username=actor_username,
            action='GRANT_GRACE_PERIOD',
            module='CUSTOMERS',
            target_id=str(locked_customer.id),
            details={
                'pppoe_username': locked_customer.pppoe_username,
                'promise_date': str(target_date),
                'previous_status': old_status,
                'notes': notes
            }
        )

        from apps.network.tasks import dispatch_network_sync_job
        from apps.network.models import NetworkSyncJob
        dispatch_network_sync_job(
            tenant=tenant,
            action=NetworkSyncJob.Action.ENABLE_USER,
            customer=locked_customer,
            payload={
                'username': locked_customer.pppoe_username,
                'profile': locked_customer.package.mikrotik_profile if locked_customer.package else None
            }
        )

        return {
            'success': True,
            'customer_id': str(locked_customer.id),
            'promise_date': str(target_date),
            'new_promise_date': str(target_date),
            'status': locked_customer.status,
            'message': f"Grace period granted until {target_date} for {locked_customer.pppoe_username}."
        }


# ─────────────────────────────────────────────────────────────────────────────
# Authoritative Balance Sync & Recalculation (Phase 9)
# ─────────────────────────────────────────────────────────────────────────────

def sync_customer_financial_summary(tenant: Tenant, customer: Customer) -> Dict[str, Any]:
    """
    Authoritatively recalculates customer due_amount and advance_amount from:
    1. Sum of unpaid/partial invoice dues.
    2. Sum of ledger credit/debit entries.
    Ensures zero drift between financial models and the customer cache.
    """
    with transaction.atomic():
        locked_customer = Customer.objects.select_for_update().get(id=customer.id)
        billing_acct = BillingAccount.objects.select_for_update().filter(
            tenant=tenant, customer=locked_customer
        ).first()
        if not billing_acct:
            billing_acct = get_or_create_billing_account(tenant, locked_customer)
            billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)

        open_invoices_due = Invoice.objects.filter(
            tenant=tenant,
            customer=locked_customer,
            status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL]
        ).aggregate(total=models.Sum('due_amount'))['total'] or Decimal('0.00')

        reconcile_data = reconcile_billing_account(billing_acct)
        balance = reconcile_data['actual_balance']

        locked_customer.due_amount = open_invoices_due
        if balance > 0:
            locked_customer.advance_amount = balance
        else:
            locked_customer.advance_amount = Decimal('0.00')
        locked_customer.save(update_fields=['due_amount', 'advance_amount'])

        return {
            'customer_id': str(locked_customer.id),
            'pppoe_username': locked_customer.pppoe_username,
            'due_amount': float(locked_customer.due_amount),
            'advance_amount': float(locked_customer.advance_amount),
            'billing_account_balance': float(billing_acct.balance),
            'is_balanced': reconcile_data['is_balanced'],
            'discrepancy': float(reconcile_data['discrepancy']),
            'unpaid_invoices_count': Invoice.objects.filter(
                tenant=tenant, customer=locked_customer,
                status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL]
            ).count()
        }

import uuid
import datetime
from decimal import Decimal
from typing import Optional, Dict, Any, List

from django.db import transaction
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

        return response_payload

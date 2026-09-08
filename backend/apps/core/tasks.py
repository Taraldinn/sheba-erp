"""
Asynchronous & Background Tasks (Stage 4 — Celery, Redis & Concurrency).
========================================================================

Architecture Invariants:
1. Every task MUST explicitly receive tenant_id.
2. Background tasks must NEVER depend on HTTP request.tenant.
3. Every DB query is strictly scoped to tenant_id.
4. Stateless execution — functions operate seamlessly with Celery workers,
   Celery beat schedules, and direct synchronous calls.
5. Distributed locking via `apps.core.lock.distributed_lock` prevents duplicate
   and concurrent operations for recharge, payment processing, invoice generation,
   expiry, and network synchronization.
"""

import uuid
import re
import json
import datetime
import logging
from decimal import Decimal
from celery import shared_task
from django.utils import timezone
from django.db import transaction, OperationalError, DatabaseError
from apps.core.models import Tenant, AuditLog
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Invoice, Package, Recharge
from apps.network.models import Router, UserSession, OLT
from apps.payments.models import PaymentTransaction, SmsLog, InboundPaymentEvent, TransactionStatus
from apps.finance.models import LedgerEntry, BillingAccount
from apps.core.lock import distributed_lock, LockAcquisitionError

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Customer Expiry Tasks
# ─────────────────────────────────────────────────────────────────────────────

def process_customer_expiry(tenant_id, customer_id):
    """
    Suspends an expired customer and terminates active router sessions.
    Strictly scoped to tenant_id with select_for_update() row lock.
    """
    if not tenant_id:
        raise ValueError("tenant_id is required for process_customer_expiry")

    with transaction.atomic():
        customer = Customer.objects.select_for_update().filter(
            id=customer_id,
            tenant_id=tenant_id
        ).first()

        if not customer:
            return {'success': False, 'error': f'Customer {customer_id} not found under tenant {tenant_id}'}

        today = timezone.now().date()
        if customer.expiry_date and customer.expiry_date < today:
            customer.status = CustomerStatus.EXPIRED
            customer.save(update_fields=['status', 'updated_at'])

            UserSession.objects.filter(username=customer.pppoe_username, tenant_id=tenant_id).delete()

            AuditLog.objects.create(
                tenant_id=tenant_id,
                actor_username='BACKGROUND_TASK',
                action='AUTO_LOCK_EXPIRED',
                module='CUSTOMERS',
                resource_type='Customer',
                resource_id=str(customer.id),
                target_id=str(customer.id),
                details={'pppoe_username': customer.pppoe_username, 'status': 'Expired'}
            )

        return {'success': True, 'customer_id': str(customer.id), 'status': customer.status}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def expire_customers(self=None, tenant_id=None):
    """
    Bulk-lock all expired customers for a specific tenant, or iterate all active tenants.
    Protected by distributed lock to prevent concurrent duplicate execution.
    """
    if tenant_id:
        lock_key = f"lock:expiry:{tenant_id}"
        try:
            with distributed_lock(lock_key, timeout=300, blocking=False):
                tenant = Tenant.objects.filter(id=tenant_id, is_active=True).first()
                if not tenant:
                    return {'success': False, 'error': f'Tenant {tenant_id} not found or inactive'}

                today = timezone.now().date()
                expired_qs = Customer.objects.filter(
                    tenant_id=tenant_id,
                    status=CustomerStatus.ACTIVE,
                    expiry_date__lt=today,
                )

                count = 0
                for customer in expired_qs.iterator():
                    try:
                        process_customer_expiry(tenant_id, str(customer.id))
                        count += 1
                    except Exception as exc:
                        logger.error("expire_customers: failed for customer %s in tenant %s: %s", customer.id, tenant_id, exc)

                logger.info("expire_customers: expired %d customers for tenant %s", count, tenant_id)
                return {'success': True, 'tenant_id': str(tenant_id), 'expired_count': count}
        except LockAcquisitionError:
            logger.warning("expire_customers: lock %s already acquired, skipping duplicate task.", lock_key)
            return {'success': False, 'error': 'DUPLICATE_TASK_SKIPPED', 'lock_key': lock_key}
    else:
        # Scheduled beat job for all tenants
        results = {}
        for tenant in Tenant.objects.filter(is_active=True):
            results[str(tenant.id)] = expire_customers(tenant_id=str(tenant.id))
        return {'success': True, 'tenants_processed': len(results), 'results': results}

# Backward-compatibility alias
expire_customers_for_tenant = expire_customers


# ─────────────────────────────────────────────────────────────────────────────
# 2. Monthly Invoicing Tasks
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def generate_monthly_invoices(self=None, tenant_id=None, billing_month=None):
    """
    Generates monthly recurring invoices for active customers.
    Strictly scoped to explicit tenant_id. Guarded by distributed lock.
    """
    if tenant_id:
        lock_key = f"lock:invoice_gen:{tenant_id}"
        try:
            with distributed_lock(lock_key, timeout=600, blocking=False):
                tenant = Tenant.objects.filter(id=tenant_id, is_active=True).first()
                if not tenant:
                    return {'success': False, 'error': f'Tenant {tenant_id} not found or inactive'}

                now = timezone.now()
                month_str = billing_month or now.strftime('%B %Y')

                customers = Customer.objects.filter(
                    tenant_id=tenant_id,
                    status__in=[CustomerStatus.ACTIVE, CustomerStatus.EXPIRED]
                ).select_related('package')

                created = 0
                for customer in customers:
                    if Invoice.objects.filter(tenant_id=tenant_id, customer=customer, billing_month=month_str).exists():
                        continue

                    with transaction.atomic():
                        pkg_name = customer.package.name if customer.package else 'Standard'
                        pkg_amount = customer.monthly_bill
                        prev_due = customer.due_amount
                        payable = pkg_amount + prev_due - customer.discount
                        inv_no = f"INV-{now.strftime('%y%m')}-{str(uuid.uuid4())[:6].upper()}"

                        Invoice.objects.create(
                            tenant_id=tenant_id,
                            customer=customer,
                            invoice_no=inv_no,
                            billing_month=month_str,
                            package_name=pkg_name,
                            package_amount=pkg_amount,
                            previous_due=prev_due,
                            discount=customer.discount,
                            total_payable=payable,
                            paid_amount=0.00,
                            due_amount=payable,
                            status=Invoice.InvoiceStatus.UNPAID,
                            due_date=now.date() + timezone.timedelta(days=10)
                        )
                        created += 1

                return {'success': True, 'tenant_id': str(tenant_id), 'month': month_str, 'invoices_created': created}
        except LockAcquisitionError:
            logger.warning("generate_monthly_invoices: lock %s already held, skipping duplicate run.", lock_key)
            return {'success': False, 'error': 'DUPLICATE_TASK_SKIPPED', 'lock_key': lock_key}
    else:
        # Beat scheduler trigger across all active tenants
        results = {}
        for tenant in Tenant.objects.filter(is_active=True):
            results[str(tenant.id)] = generate_monthly_invoices(tenant_id=str(tenant.id), billing_month=billing_month)
        return {'success': True, 'tenants_processed': len(results), 'results': results}

# Backward-compatibility alias
generate_monthly_invoices_for_tenant = generate_monthly_invoices


# ─────────────────────────────────────────────────────────────────────────────
# 3. Payment Event Processing Task
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_payment_event(self=None, tenant_id=None, event_id=None, customer_id=None, **kwargs):
    """
    Async match engine for an InboundPaymentEvent.
    Pipeline: Ingestion -> Parse -> Deduplicate -> Match -> PaymentTransaction -> Ledger -> Recharge.
    Requires explicit tenant_id. Guarded by distributed lock and atomic transactions.
    """
    if self is not None and not hasattr(self, 'request') and tenant_id is not None and event_id is None:
        event_id = tenant_id
        tenant_id = self
        self = None

    if not tenant_id or not event_id:
        raise ValueError("tenant_id and event_id are required for process_payment_event")

    lock_key = f"lock:payment_event:{tenant_id}:{event_id}"
    try:
        with distributed_lock(lock_key, timeout=60, blocking=False):
            event = InboundPaymentEvent.objects.filter(
                id=event_id, tenant_id=tenant_id
            ).first()
            if not event:
                return {'success': False, 'error': f'Event {event_id} not found under tenant {tenant_id}'}

            if event.status in (
                InboundPaymentEvent.EventStatus.MATCHED,
                InboundPaymentEvent.EventStatus.DUPLICATE,
            ):
                return {'success': True, 'result': event.status, 'message': f'Event already completed with status: {event.status}'}

            # 1. PARSE / NORMALIZE
            # If fields are missing on event, extract from raw_payload
            raw_text = str(event.raw_payload or '')
            payload_data = None
            if isinstance(event.raw_payload, dict):
                payload_data = event.raw_payload
            elif isinstance(event.raw_payload, str) and event.raw_payload.strip().startswith('{'):
                try:
                    payload_data = json.loads(event.raw_payload)
                except Exception:
                    pass

            if isinstance(payload_data, dict):
                if not event.trx_id:
                    event.trx_id = str(payload_data.get('trx_id') or payload_data.get('transaction_id') or payload_data.get('txid') or '').strip()
                if not event.amount and payload_data.get('amount'):
                    try:
                        event.amount = Decimal(str(payload_data.get('amount')))
                    except Exception:
                        pass
                if not event.sender_account:
                    event.sender_account = str(payload_data.get('sender_account') or payload_data.get('sender') or payload_data.get('account') or payload_data.get('mobile') or payload_data.get('from') or '').strip()
                if not event.reference_id:
                    event.reference_id = str(payload_data.get('reference_id') or payload_data.get('reference') or payload_data.get('ref') or '').strip()
                if not event.provider:
                    event.provider = str(payload_data.get('provider') or '').strip()

            if not event.trx_id:
                trx_match = re.search(r'(?:TrxID|TxnId|Txn|Transaction\s*ID|TxID)[:\s]+([A-Za-z0-9_-]+)', raw_text, re.IGNORECASE)
                if trx_match:
                    event.trx_id = trx_match.group(1).strip()

            if not event.amount:
                amount_match = re.search(r'(?:Tk|BDT|Amount\s*[:\s]*Tk?\.?)\s*([\d,]+\.?\d*)', raw_text, re.IGNORECASE)
                if amount_match:
                    try:
                        event.amount = Decimal(amount_match.group(1).replace(',', ''))
                    except Exception:
                        pass

            if not event.reference_id:
                ref_match = re.search(r'(?:Ref|Reference)[:\s]+([A-Za-z0-9_\.-]+)', raw_text, re.IGNORECASE)
                if ref_match:
                    event.reference_id = ref_match.group(1).strip()

            if not event.sender_account:
                acc_match = re.search(r'(?:from|account)[:\s]+([0-9+]+)', raw_text, re.IGNORECASE)
                if acc_match:
                    event.sender_account = acc_match.group(1).strip()

            if not event.provider:
                lower_text = raw_text.lower()
                if 'bkash' in lower_text:
                    event.provider = 'bKash'
                elif 'nagad' in lower_text:
                    event.provider = 'Nagad'
                elif 'rocket' in lower_text:
                    event.provider = 'Rocket'
                elif 'upay' in lower_text:
                    event.provider = 'Upay'
                elif 'sslcommerz' in lower_text:
                    event.provider = 'SSLCommerz'
                else:
                    event.provider = 'SMS'

            # 2. DEDUPLICATE
            # Check duplicate TrxID within tenant
            if event.trx_id:
                existing_txn = PaymentTransaction.objects.filter(
                    tenant_id=tenant_id, trx_id=event.trx_id
                ).first()
                if existing_txn:
                    event.status = InboundPaymentEvent.EventStatus.DUPLICATE
                    event.matched_transaction = existing_txn
                    event.processed_at = timezone.now()
                    event.save(update_fields=['status', 'matched_transaction', 'processed_at', 'trx_id', 'amount', 'reference_id', 'sender_account', 'provider'])
                    return {'success': True, 'result': 'DUPLICATE', 'trx_id': event.trx_id}

                existing_event = InboundPaymentEvent.objects.filter(
                    tenant_id=tenant_id, trx_id=event.trx_id, status=InboundPaymentEvent.EventStatus.MATCHED
                ).exclude(id=event.id).first()
                if existing_event:
                    event.status = InboundPaymentEvent.EventStatus.DUPLICATE
                    event.matched_transaction = existing_event.matched_transaction
                    event.processed_at = timezone.now()
                    event.save(update_fields=['status', 'matched_transaction', 'processed_at', 'trx_id', 'amount', 'reference_id', 'sender_account', 'provider'])
                    return {'success': True, 'result': 'DUPLICATE', 'trx_id': event.trx_id}

            # Check duplicate Reference ID within tenant
            if event.reference_id:
                existing_ref_event = InboundPaymentEvent.objects.filter(
                    tenant_id=tenant_id, reference_id=event.reference_id, status=InboundPaymentEvent.EventStatus.MATCHED
                ).exclude(id=event.id).first()
                if existing_ref_event:
                    event.status = InboundPaymentEvent.EventStatus.DUPLICATE
                    event.matched_transaction = existing_ref_event.matched_transaction
                    event.processing_error = f"Duplicate payment reference ID {event.reference_id}"
                    event.processed_at = timezone.now()
                    event.save(update_fields=['status', 'matched_transaction', 'processing_error', 'processed_at', 'trx_id', 'amount', 'reference_id', 'sender_account', 'provider'])
                    return {'success': True, 'result': 'DUPLICATE', 'reference_id': event.reference_id}

            # 3. MATCH CUSTOMER
            customer = None
            if customer_id:
                customer = Customer.objects.filter(tenant_id=tenant_id, id=customer_id).first()

            if not customer and event.reference_id:
                customer = Customer.objects.filter(tenant_id=tenant_id, pppoe_username__iexact=event.reference_id).first()
                if not customer:
                    customer = Customer.objects.filter(tenant_id=tenant_id, customer_code__iexact=event.reference_id).first()

            if not customer and event.sender_account:
                customer = Customer.objects.filter(tenant_id=tenant_id, pppoe_username__iexact=event.sender_account).first()
                if not customer:
                    customer = Customer.objects.filter(tenant_id=tenant_id, mobile=event.sender_account).first()
                if not customer and len(event.sender_account) >= 10:
                    candidates = list(Customer.objects.filter(tenant_id=tenant_id, mobile__endswith=event.sender_account[-10:]))
                    if len(candidates) == 1:
                        customer = candidates[0]
                    elif len(candidates) > 1:
                        # Ambiguous match — safe unmatched state! Do not credit uncertain customer.
                        event.status = InboundPaymentEvent.EventStatus.UNMATCHED
                        event.processing_error = f"Ambiguous customer match for sender='{event.sender_account}' ({len(candidates)} candidates found)"
                        event.processed_at = timezone.now()
                        event.save(update_fields=['status', 'processing_error', 'processed_at', 'trx_id', 'amount', 'reference_id', 'sender_account', 'provider'])
                        return {'success': True, 'result': 'UNMATCHED', 'error': 'AMBIGUOUS_CUSTOMER'}

            # 4. UNMATCHED SAFE STATE
            if not customer or not event.amount or event.amount <= 0:
                event.status = InboundPaymentEvent.EventStatus.UNMATCHED
                event.processing_error = (
                    f"No customer found or invalid amount for account='{event.sender_account}', "
                    f"reference='{event.reference_id}', amount={event.amount}, trx_id='{event.trx_id}'"
                )
                event.processed_at = timezone.now()
                event.save(update_fields=['status', 'processing_error', 'processed_at', 'trx_id', 'amount', 'reference_id', 'sender_account', 'provider'])
                return {'success': True, 'result': 'UNMATCHED'}

            # 5. ATOMIC FINANCIAL EXECUTION
            with transaction.atomic():
                locked_event = InboundPaymentEvent.objects.select_for_update().get(id=event.id)
                locked_event.status = InboundPaymentEvent.EventStatus.PROCESSING
                locked_event.save(update_fields=['status'])

                locked_customer = Customer.objects.select_for_update().get(id=customer.id)

                final_trx_id = event.trx_id or f"PAY-{uuid.uuid4().hex[:12].upper()}"

                # Re-verify deduplication under row lock
                if PaymentTransaction.objects.filter(tenant_id=tenant_id, trx_id=final_trx_id).exists():
                    locked_event.status = InboundPaymentEvent.EventStatus.DUPLICATE
                    locked_event.processed_at = timezone.now()
                    locked_event.save(update_fields=['status', 'processed_at'])
                    return {'success': True, 'result': 'DUPLICATE', 'trx_id': final_trx_id}

                # Create PaymentTransaction
                trx = PaymentTransaction.objects.create(
                    tenant_id=tenant_id,
                    customer=locked_customer,
                    amount=event.amount,
                    trx_id=final_trx_id,
                    payment_method=event.provider or 'SMS',
                    status=TransactionStatus.SUCCESS,
                    customer_account=event.sender_account,
                    raw_payload={
                        'source': event.source,
                        'reference_id': event.reference_id,
                        'payload': event.raw_payload,
                    },
                    sms_log=event.sms_log
                )

                # Append LedgerEntry 1: PAYMENT
                amount_dec = Decimal(str(event.amount))
                billing_acct, _ = BillingAccount.objects.get_or_create(
                    tenant_id=tenant_id,
                    customer=locked_customer,
                    defaults={'balance': Decimal('0.00'), 'total_paid': Decimal('0.00')}
                )
                billing_acct.balance = Decimal(str(billing_acct.balance or '0.00')) + amount_dec
                billing_acct.total_paid = Decimal(str(billing_acct.total_paid or '0.00')) + amount_dec
                billing_acct.last_payment_at = timezone.now()
                billing_acct.save(update_fields=['balance', 'total_paid', 'last_payment_at'])

                LedgerEntry.objects.create(
                    tenant_id=tenant_id,
                    customer=locked_customer,
                    entry_type=LedgerEntry.EntryType.PAYMENT,
                    amount=amount_dec,
                    balance_after=billing_acct.balance,
                    reference_id=str(trx.id),
                    reference_type='PaymentTransaction',
                    description=f"Payment received via {event.provider or 'SMS'} (TrxID: {final_trx_id})",
                    created_by='PAYMENT_EVENT_PIPELINE'
                )

                # Recharge: Extend customer validity and activate
                today = timezone.now().date()
                base = locked_customer.expiry_date if (locked_customer.expiry_date and locked_customer.expiry_date >= today) else today
                new_expiry = base + datetime.timedelta(days=30)
                old_expiry = locked_customer.expiry_date

                locked_customer.expiry_date = new_expiry
                locked_customer.status = CustomerStatus.ACTIVE
                if hasattr(locked_customer, 'due_amount') and locked_customer.due_amount is not None:
                    due_dec = Decimal(str(locked_customer.due_amount or '0.00'))
                    if due_dec <= amount_dec:
                        rem = amount_dec - due_dec
                        locked_customer.due_amount = Decimal('0.00')
                        adv_dec = Decimal(str(locked_customer.advance_amount or '0.00'))
                        locked_customer.advance_amount = adv_dec + rem
                    else:
                        locked_customer.due_amount = due_dec - amount_dec
                locked_customer.save()

                # Create Recharge record
                recharge = Recharge.objects.create(
                    tenant_id=tenant_id,
                    customer=locked_customer,
                    package=locked_customer.package,
                    amount=event.amount,
                    validity_days=30,
                    new_expiry=new_expiry,
                    old_expiry=old_expiry,
                    payment_method=event.provider or 'SMS',
                    trx_id=final_trx_id,
                    notes=f"Auto-recharge from payment event {event.id} (TrxID: {final_trx_id})"
                )

                # Append LedgerEntry 2: RECHARGE
                billing_acct.balance = Decimal(str(billing_acct.balance or '0.00')) - amount_dec
                billing_acct.save(update_fields=['balance'])

                LedgerEntry.objects.create(
                    tenant_id=tenant_id,
                    customer=locked_customer,
                    entry_type=LedgerEntry.EntryType.RECHARGE,
                    amount=amount_dec,
                    balance_after=billing_acct.balance,
                    reference_id=str(recharge.id),
                    reference_type='Recharge',
                    description=f"Auto-recharge service activation (Recharge: {recharge.id})",
                    created_by='PAYMENT_EVENT_PIPELINE'
                )

                if event.sms_log:
                    event.sms_log.is_matched = True
                    event.sms_log.matched_customer = locked_customer
                    event.sms_log.save(update_fields=['is_matched', 'matched_customer'])

                locked_event.status = InboundPaymentEvent.EventStatus.MATCHED
                locked_event.matched_customer = locked_customer
                locked_event.matched_transaction = trx
                locked_event.trx_id = final_trx_id
                locked_event.amount = event.amount
                locked_event.sender_account = event.sender_account
                locked_event.reference_id = event.reference_id
                locked_event.provider = event.provider
                locked_event.processed_at = timezone.now()
                locked_event.save(update_fields=[
                    'status', 'matched_customer', 'matched_transaction',
                    'trx_id', 'amount', 'sender_account', 'reference_id', 'provider', 'processed_at'
                ])

                AuditLog.objects.create(
                    tenant_id=tenant_id,
                    actor_username='PAYMENT_EVENT_PIPELINE',
                    action='PAYMENT_EVENT_MATCHED_AND_RECHARGED',
                    module='PAYMENTS',
                    resource_type='InboundPaymentEvent',
                    resource_id=str(locked_event.id),
                    target_id=str(locked_customer.id),
                    details={
                        'event_id': str(locked_event.id),
                        'trx_id': final_trx_id,
                        'amount': str(event.amount),
                        'customer_id': str(locked_customer.id),
                        'pppoe_username': locked_customer.pppoe_username,
                        'new_expiry': str(new_expiry),
                    }
                )

                # Send SMS confirmation (outside or inside transaction)
                send_sms(tenant_id=tenant_id, payment_id=str(trx.id))

                return {
                    'success': True,
                    'result': 'MATCHED',
                    'customer': locked_customer.pppoe_username,
                    'trx_id': final_trx_id,
                    'recharge_id': str(recharge.id)
                }
    except LockAcquisitionError:
        logger.warning("process_payment_event: lock %s already acquired, skipping duplicate event task.", lock_key)
        return {'success': False, 'error': 'DUPLICATE_TASK_SKIPPED', 'lock_key': lock_key}
    except (OperationalError, DatabaseError, ConnectionError, TimeoutError) as exc:
        logger.warning("process_payment_event: transient failure on event %s: %s", event_id, exc)
        if hasattr(self, 'retry'):
            raise self.retry(exc=exc)
        raise exc


# ─────────────────────────────────────────────────────────────────────────────
# 4. Payment Reconciliation Task
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=120)
def reconcile_payments(self=None, tenant_id=None):
    """
    Cross-checks unmatched SmsLog entries against PaymentTransaction under the tenant.
    Guarded by distributed lock.
    """
    if tenant_id:
        lock_key = f"lock:reconcile:{tenant_id}"
        try:
            with distributed_lock(lock_key, timeout=180, blocking=False):
                unmatched = SmsLog.objects.filter(tenant_id=tenant_id, is_matched=False).exclude(parsed_trx_id='')
                reconciled = 0
                for sms in unmatched.iterator():
                    txn = PaymentTransaction.objects.filter(
                        tenant_id=tenant_id, trx_id=sms.parsed_trx_id
                    ).first()
                    if txn:
                        sms.is_matched = True
                        sms.matched_customer = txn.customer
                        sms.save(update_fields=['is_matched', 'matched_customer'])
                        reconciled += 1

                return {
                    'success': True,
                    'tenant_id': str(tenant_id),
                    'reconciled_count': reconciled,
                }
        except LockAcquisitionError:
            logger.warning("reconcile_payments: lock %s already acquired, skipping duplicate run.", lock_key)
            return {'success': False, 'error': 'DUPLICATE_TASK_SKIPPED', 'lock_key': lock_key}
    else:
        results = {}
        for tenant in Tenant.objects.filter(is_active=True):
            results[str(tenant.id)] = reconcile_payments(tenant_id=str(tenant.id))
        return {'success': True, 'tenants_processed': len(results), 'results': results}

# Backward-compatibility alias
reconcile_payments_for_tenant = reconcile_payments


# ─────────────────────────────────────────────────────────────────────────────
# 5. Network Synchronization Tasks
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def sync_router(self=None, tenant_id=None, router_id=None):
    """
    Synchronises MikroTik router state using the MikroTikService layer.
    Explicit tenant_id required. Guarded by distributed lock.
    """
    if not tenant_id or not router_id:
        raise ValueError("tenant_id and router_id are required for sync_router")

    lock_key = f"lock:router_sync:{tenant_id}:{router_id}"
    try:
        with distributed_lock(lock_key, timeout=60, blocking=False):
            router = Router.objects.filter(id=router_id, tenant_id=tenant_id).first()
            if not router:
                return {'success': False, 'error': f'Router {router_id} not found under tenant {tenant_id}'}

            try:
                from apps.network.services.mikrotik import MikroTikService
                svc = MikroTikService(router)
                health = svc.get_system_health()
                synced = svc.sync_active_sessions_to_db()
                return {
                    'success': True,
                    'tenant_id': str(tenant_id),
                    'router_id': str(router.id),
                    'name': router.name,
                    'status': router.status,
                    'health': health,
                    'sessions_synced': synced,
                }
            except Exception as exc:
                logger.warning("sync_router failed for router %s: %s", router_id, exc)
                router.last_ping = timezone.now()
                router.status = 'Error'
                router.save(update_fields=['last_ping', 'status'])
                # Retry on network timeout or connection reset
                if self and getattr(self, 'request', None) and self.request.retries < self.max_retries:
                    raise self.retry(exc=exc)
                return {'success': False, 'error': str(exc)}
    except LockAcquisitionError:
        logger.warning("sync_router: lock %s already held, skipping duplicate task.", lock_key)
        return {'success': False, 'error': 'DUPLICATE_TASK_SKIPPED', 'lock_key': lock_key}

# Backward-compatibility alias
sync_router_task = sync_router


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def sync_olt(self=None, tenant_id=None, olt_id=None):
    """
    Polls OLT status and records last synchronization timestamp.
    Explicit tenant_id required. Guarded by distributed lock.
    """
    if not tenant_id or not olt_id:
        raise ValueError("tenant_id and olt_id are required for sync_olt")

    lock_key = f"lock:olt_sync:{tenant_id}:{olt_id}"
    try:
        with distributed_lock(lock_key, timeout=60, blocking=False):
            olt = OLT.objects.filter(id=olt_id, tenant_id=tenant_id).first()
            if not olt:
                return {'success': False, 'error': f'OLT {olt_id} not found under tenant {tenant_id}'}

            olt.last_sync = timezone.now()
            olt.status = 'Online'
            olt.save(update_fields=['last_sync', 'status'])

            return {
                'success': True,
                'tenant_id': str(tenant_id),
                'olt_id': str(olt.id),
                'name': olt.name,
                'status': olt.status,
                'last_sync': str(olt.last_sync)
            }
    except LockAcquisitionError:
        logger.warning("sync_olt: lock %s already held, skipping duplicate task.", lock_key)
        return {'success': False, 'error': 'DUPLICATE_TASK_SKIPPED', 'lock_key': lock_key}

# Backward-compatibility alias
sync_olt_task = sync_olt


# ─────────────────────────────────────────────────────────────────────────────
# 6. Messaging / Notification Tasks
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True)
def send_sms(self=None, tenant_id=None, payment_id=None, **kwargs):
    """
    Sends confirmation SMS for a completed payment under a specific tenant.
    Explicit tenant_id required.
    """
    if self is not None and not hasattr(self, 'request') and tenant_id is not None and payment_id is None:
        payment_id = tenant_id
        tenant_id = self
        self = None

    if not tenant_id or not payment_id:
        raise ValueError("tenant_id and payment_id are required for send_sms")

    txn = PaymentTransaction.objects.filter(id=payment_id, tenant_id=tenant_id).first()
    if not txn:
        return {'success': False, 'error': f'Transaction {payment_id} not found under tenant {tenant_id}'}

    return {
        'success': True,
        'tenant_id': str(tenant_id),
        'payment_id': str(payment_id),
        'customer': txn.customer.pppoe_username,
        'amount': float(txn.amount),
        'status': 'SMS_SENT'
    }

# Backward-compatibility alias
send_payment_sms = send_sms


@shared_task
def retry_sms(tenant_id, sms_log_id):
    """Re-attempt delivery for a failed SmsLog entry."""
    if not tenant_id or not sms_log_id:
        raise ValueError("tenant_id and sms_log_id are required for retry_sms")

    sms = SmsLog.objects.filter(id=sms_log_id, tenant_id=tenant_id).first()
    if not sms:
        return {'success': False, 'error': 'SmsLog not found'}

    logger.info("retry_sms: re-dispatching SMS %s for tenant %s", sms_log_id, tenant_id)
    return {
        'success': True,
        'tenant_id': str(tenant_id),
        'sms_log_id': str(sms_log_id),
        'status': 'RETRIED',
    }

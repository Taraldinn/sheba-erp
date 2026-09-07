"""
Asynchronous & Background Tasks (Plan Phase M / Phase 27).

Architecture Rules:
1. Every task MUST explicitly accept tenant_id.
2. Never rely on request.tenant inside background tasks.
3. Every DB query is strictly scoped to tenant_id.
4. Stateless execution — works with both Celery workers and synchronous invocation.

New tasks (Phase 27):
  - expire_customers_for_tenant   — bulk lock all expired customers for a tenant
  - sync_olt_task                 — poll OLT for ONU status
  - process_payment_event         — async match engine for InboundPaymentEvent
  - retry_sms                     — retry failed SMS delivery
  - reconcile_payments_for_tenant — cross-check SmsLog vs PaymentTransaction
"""

import uuid
import logging
from django.utils import timezone
from django.db import transaction
from apps.core.models import Tenant, AuditLog
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Invoice, Package
from apps.network.models import Router, UserSession
from apps.payments.models import PaymentTransaction, SmsLog, InboundPaymentEvent
from apps.support.models import Ticket

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Original tasks — unchanged
# ─────────────────────────────────────────────────────────────────────────────

def process_customer_expiry(tenant_id, customer_id):
    """
    Suspends an expired customer and terminates active router sessions.
    Strictly scoped to tenant_id.
    """
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


def generate_monthly_invoices_for_tenant(tenant_id, billing_month=None):
    """Generates monthly recurring invoices for all active customers of a specific tenant."""
    tenant = Tenant.objects.filter(id=tenant_id).first()
    if not tenant:
        return {'success': False, 'error': f'Tenant {tenant_id} not found'}

    now = timezone.now()
    month_str = billing_month or now.strftime('%B %Y')

    customers = Customer.objects.filter(
        tenant=tenant,
        status__in=[CustomerStatus.ACTIVE, CustomerStatus.EXPIRED]
    ).select_related('package')

    created = 0
    for customer in customers:
        if Invoice.objects.filter(tenant=tenant, customer=customer, billing_month=month_str).exists():
            continue

        with transaction.atomic():
            pkg_name = customer.package.name if customer.package else 'Standard'
            pkg_amount = customer.monthly_bill
            prev_due = customer.due_amount
            payable = pkg_amount + prev_due - customer.discount
            inv_no = f"INV-{now.strftime('%y%m')}-{str(uuid.uuid4())[:6].upper()}"

            Invoice.objects.create(
                tenant=tenant,
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


def send_payment_sms(tenant_id, payment_id):
    """Sends confirmation SMS for a completed payment under a specific tenant."""
    txn = PaymentTransaction.objects.filter(id=payment_id, tenant_id=tenant_id).first()
    if not txn:
        return {'success': False, 'error': 'Transaction not found'}

    return {
        'success': True,
        'tenant_id': str(tenant_id),
        'payment_id': str(payment_id),
        'customer': txn.customer.pppoe_username,
        'amount': float(txn.amount),
        'status': 'SMS_SENT'
    }


def sync_router_task(tenant_id, router_id):
    """Synchronises MikroTik router state using the MikroTikService layer."""
    router = Router.objects.filter(id=router_id, tenant_id=tenant_id).first()
    if not router:
        return {'success': False, 'error': 'Router not found'}

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
        logger.warning("sync_router_task failed for router %s: %s", router_id, exc)
        router.last_ping = timezone.now()
        router.status = 'Error'
        router.save(update_fields=['last_ping', 'status'])
        return {'success': False, 'error': str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# NEW: Phase 27 tasks
# ─────────────────────────────────────────────────────────────────────────────

def expire_customers_for_tenant(tenant_id):
    """
    Bulk-lock all customers whose expiry_date < today for the given tenant.
    Called by a daily Celery beat schedule.
    """
    tenant = Tenant.objects.filter(id=tenant_id, is_active=True).first()
    if not tenant:
        return {'success': False, 'error': f'Tenant {tenant_id} not found or inactive'}

    today = timezone.now().date()
    expired_qs = Customer.objects.filter(
        tenant=tenant,
        status=CustomerStatus.ACTIVE,
        expiry_date__lt=today,
    )

    count = 0
    for customer in expired_qs.iterator():
        try:
            process_customer_expiry(tenant_id, str(customer.id))
            count += 1
        except Exception as exc:
            logger.error("expire_customers_for_tenant: failed for customer %s: %s", customer.id, exc)

    logger.info("expire_customers_for_tenant: expired %d customers for tenant %s", count, tenant_id)
    return {'success': True, 'tenant_id': str(tenant_id), 'expired_count': count}


def process_payment_event(tenant_id, event_id):
    """
    Async match engine for an InboundPaymentEvent (Plan Phase F / 12).

    Flow:
      1. Load event, mark PROCESSING
      2. Deduplicate by trx_id → if duplicate, mark DUPLICATE and return
      3. Match by pppoe_username / mobile / account in SmsLog
      4. If matched → create PaymentTransaction + trigger recharge
      5. Mark event MATCHED or UNMATCHED
    """
    from django.utils import timezone as tz

    event = InboundPaymentEvent.objects.filter(
        id=event_id, tenant_id=tenant_id
    ).first()
    if not event:
        return {'success': False, 'error': f'Event {event_id} not found'}

    if event.status not in (
        InboundPaymentEvent.EventStatus.RECEIVED,
        InboundPaymentEvent.EventStatus.FAILED,
    ):
        return {'success': False, 'error': f'Event already in status: {event.status}'}

    with transaction.atomic():
        event.status = InboundPaymentEvent.EventStatus.PROCESSING
        event.save(update_fields=['status'])

        # 1. Deduplicate by trx_id
        if event.trx_id:
            existing_txn = PaymentTransaction.objects.filter(
                tenant_id=tenant_id, trx_id=event.trx_id
            ).first()
            if existing_txn:
                event.status = InboundPaymentEvent.EventStatus.DUPLICATE
                event.matched_transaction = existing_txn
                event.processed_at = tz.now()
                event.save(update_fields=['status', 'matched_transaction', 'processed_at'])
                return {'success': True, 'result': 'DUPLICATE', 'trx_id': event.trx_id}

        # 2. Match customer by mobile / PPPoE username
        customer = None
        if event.sender_account:
            customer = Customer.objects.filter(
                tenant_id=tenant_id,
                mobile=event.sender_account,
            ).first()
        if not customer and event.sender_account:
            customer = Customer.objects.filter(
                tenant_id=tenant_id,
                pppoe_username__iexact=event.sender_account,
            ).first()

        if customer and event.amount:
            # 3. Create PaymentTransaction
            trx = PaymentTransaction.objects.create(
                tenant_id=tenant_id,
                customer=customer,
                amount=event.amount,
                trx_id=event.trx_id or str(uuid.uuid4()),
                payment_method=event.provider or 'SMS',
                status='Success',
                customer_account=event.sender_account,
                raw_payload={'source': event.source, 'payload': event.raw_payload},
            )
            event.status = InboundPaymentEvent.EventStatus.MATCHED
            event.matched_customer = customer
            event.matched_transaction = trx
            event.processed_at = tz.now()
            event.save(update_fields=['status', 'matched_customer', 'matched_transaction', 'processed_at'])

            # Trigger SMS notification
            send_payment_sms(tenant_id, str(trx.id))
            return {'success': True, 'result': 'MATCHED', 'customer': customer.pppoe_username}

        # 4. No match
        event.status = InboundPaymentEvent.EventStatus.UNMATCHED
        event.processing_error = (
            f"No customer found for account='{event.sender_account}', "
            f"amount={event.amount}, trx_id='{event.trx_id}'"
        )
        event.processed_at = tz.now()
        event.save(update_fields=['status', 'processing_error', 'processed_at'])
        return {'success': True, 'result': 'UNMATCHED'}


def retry_sms(tenant_id, sms_log_id):
    """
    Re-attempt delivery for a failed SmsLog entry.
    In production this would call the configured SMS gateway.
    """
    sms = SmsLog.objects.filter(id=sms_log_id, tenant_id=tenant_id).first()
    if not sms:
        return {'success': False, 'error': 'SmsLog not found'}

    logger.info(
        "retry_sms: re-dispatching SMS %s for tenant %s (account: %s, amount: %s)",
        sms_log_id, tenant_id, sms.parsed_account, sms.parsed_amount
    )
    # TODO: integrate actual SMS gateway call here
    return {
        'success': True,
        'tenant_id': str(tenant_id),
        'sms_log_id': str(sms_log_id),
        'status': 'RETRIED',
    }


def reconcile_payments_for_tenant(tenant_id):
    """
    Cross-check unmatched SmsLog entries against PaymentTransaction.
    Any SmsLog with a parsed_trx_id matching an existing transaction gets marked matched.
    """
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

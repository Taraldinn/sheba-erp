"""
Asynchronous & Background Tasks.

Architecture Rules:
1. Every task MUST explicitly accept tenant_id.
2. Never rely on request.tenant inside background tasks.
3. Every DB query is strictly scoped to tenant_id.
4. Stateless execution — works with both Celery workers and synchronous invocation.
"""

import uuid
from django.utils import timezone
from django.db import transaction
from apps.core.models import Tenant, AuditLog
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Invoice, Package
from apps.network.models import Router, UserSession
from apps.payments.models import PaymentTransaction
from apps.support.models import Ticket


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

            # Terminate active PPPoE session
            UserSession.objects.filter(username=customer.pppoe_username, tenant_id=tenant_id).delete()

            AuditLog.objects.create(
                tenant_id=tenant_id,
                actor_username='BACKGROUND_TASK',
                action='AUTO_LOCK_EXPIRED',
                module='CUSTOMERS',
                target_id=str(customer.id),
                details={'pppoe_username': customer.pppoe_username, 'status': 'Expired'}
            )

        return {'success': True, 'customer_id': str(customer.id), 'status': customer.status}


def generate_monthly_invoices_for_tenant(tenant_id, billing_month=None):
    """
    Generates monthly recurring invoices for all active customers of a specific tenant.
    """
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
    """
    Simulates sending confirmation SMS for a completed payment under a specific tenant.
    """
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
    """
    Simulates synchronizing MikroTik router state under a specific tenant.
    """
    router = Router.objects.filter(id=router_id, tenant_id=tenant_id).first()
    if not router:
        return {'success': False, 'error': 'Router not found'}

    router.last_ping = timezone.now()
    router.status = 'Online'
    router.save(update_fields=['last_ping', 'status', 'updated_at'])

    return {
        'success': True,
        'tenant_id': str(tenant_id),
        'router_id': str(router.id),
        'name': router.name,
        'status': router.status
    }

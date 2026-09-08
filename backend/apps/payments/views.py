import re
import uuid
import datetime
from rest_framework import viewsets, permissions, views, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction, IntegrityError
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import PaymentGateway, PaymentTransaction, SmsLog, InboundPaymentEvent, TransactionStatus
from .serializers import (
    PaymentGatewaySerializer, PaymentTransactionSerializer, SmsLogSerializer,
    InboundPaymentEventSerializer, ResolvePaymentEventSerializer, PaymentRequestSerializer
)
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Recharge
from apps.core.models import AuditLog, Tenant
from apps.core.permissions import IsTenantMember, IsAdminOrManager, IsBillingStaff, HasTenantPermission
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from decimal import Decimal
from apps.finance.models import BillingAccount, LedgerEntry
from apps.finance.services import get_or_create_billing_account, record_ledger_entry, allocate_payment_to_invoices
from apps.core.tasks import process_payment_event


@extend_schema_view(
    list=extend_schema(tags=['7. Payments & SMS Gateways']),
    retrieve=extend_schema(tags=['7. Payments & SMS Gateways']),
    create=extend_schema(tags=['7. Payments & SMS Gateways']),
    update=extend_schema(tags=['7. Payments & SMS Gateways']),
    partial_update=extend_schema(tags=['7. Payments & SMS Gateways']),
    destroy=extend_schema(tags=['7. Payments & SMS Gateways']),
)
class PaymentGatewayViewSet(viewsets.ModelViewSet):
    """
    Manage payment gateway configurations.
    Admin-only: credentials are write-only and never returned in responses.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminOrManager]
    serializer_class = PaymentGatewaySerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, PaymentGateway)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['7. Payments & SMS Gateways']),
    retrieve=extend_schema(tags=['7. Payments & SMS Gateways']),
    create=extend_schema(tags=['7. Payments & SMS Gateways'], request=PaymentRequestSerializer),
)
class PaymentTransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'create':
            return PaymentRequestSerializer
        return PaymentTransactionSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, PaymentTransaction).select_related('customer')

    def create(self, request, *args, **kwargs):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({'error': 'Tenant context required.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PaymentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        customer_id = data.get('customer_id')
        customer = None
        if customer_id:
            customer = Customer.objects.filter(tenant=tenant, id=customer_id).first()
            if not customer:
                return Response({'error': 'Customer does not belong to your ISP.'}, status=status.HTTP_404_NOT_FOUND)

        trx_id = data.get('trx_id') or f"MAN-{uuid.uuid4().hex[:8].upper()}"
        idempotency_key = data.get('idempotency_key') or ''

        # Idempotency check within tenant
        if trx_id and PaymentTransaction.objects.filter(tenant=tenant, trx_id=trx_id).exists():
            return Response({'error': f'Transaction with ID {trx_id} already exists.'}, status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            payment = PaymentTransaction.objects.create(
                tenant=tenant,
                customer=customer,
                amount=data['amount'],
                payment_method=data['payment_method'],
                trx_id=trx_id,
                status=TransactionStatus.SUCCESS,
                notes=data.get('notes', ''),
                idempotency_key=idempotency_key,
                raw_response={'processed_by': request.user.username}
            )

            if customer:
                amount_dec = Decimal(str(payment.amount))
                billing_acct = get_or_create_billing_account(tenant, customer)
                billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)
                billing_acct.total_paid = Decimal(str(billing_acct.total_paid or '0.00')) + amount_dec
                billing_acct.balance = Decimal(str(billing_acct.balance or '0.00')) + amount_dec
                billing_acct.last_payment_at = timezone.now()
                billing_acct.save(update_fields=['total_paid', 'balance', 'last_payment_at'])

                record_ledger_entry(
                    tenant=tenant,
                    customer=customer,
                    entry_type=LedgerEntry.EntryType.PAYMENT,
                    amount=amount_dec,
                    balance_after=billing_acct.balance,
                    reference_id=str(payment.id),
                    reference_type='PaymentTransaction',
                    description=f"Manual Payment recorded via {payment.payment_method} (Trx: {trx_id})",
                    created_by=request.user.username if request.user.is_authenticated else 'system'
                )

                # Allocate payment to open invoices (FIFO)
                allocate_payment_to_invoices(
                    tenant=tenant,
                    payment=payment,
                    customer=customer,
                    amount=amount_dec,
                    notes=f"Allocation from Payment {payment.id}"
                )

                # Offset customer due / advance
                locked_customer = Customer.objects.select_for_update().get(id=customer.id)
                due_dec = Decimal(str(locked_customer.due_amount or '0.00'))
                adv_dec = Decimal(str(locked_customer.advance_amount or '0.00'))
                if due_dec > 0:
                    if amount_dec >= due_dec:
                        surplus = amount_dec - due_dec
                        locked_customer.due_amount = Decimal('0.00')
                        locked_customer.advance_amount = adv_dec + surplus
                    else:
                        locked_customer.due_amount = due_dec - amount_dec
                else:
                    locked_customer.advance_amount = adv_dec + amount_dec
                locked_customer.save(update_fields=['due_amount', 'advance_amount'])

            AuditLog.objects.create(
                tenant=tenant,
                actor_username=request.user.username if request.user.is_authenticated else 'system',
                action='PROCESS_PAYMENT',
                module='PAYMENTS',
                target_id=str(payment.id),
                details={
                    'amount': float(payment.amount),
                    'trx_id': payment.trx_id,
                    'customer_id': str(customer.id) if customer else None,
                }
            )

        return Response(PaymentTransactionSerializer(payment).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    list=extend_schema(tags=['7. Payments & SMS Gateways']),
    retrieve=extend_schema(tags=['7. Payments & SMS Gateways']),
    create=extend_schema(tags=['7. Payments & SMS Gateways']),
)
class SmsLogViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = SmsLogSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, SmsLog).select_related('matched_customer')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema(
    tags=['7. Payments & SMS Gateways'],
    description='Ingestion-only webhook receiving automated SMS forwarded from Android SMS Gateway or modem. Returns HTTP 202 Accepted immediately and queues asynchronous matching and financial ledger processing.',
    request=None,
    responses={202: None, 400: None}
)
class SmsWebhookView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        sender = request.data.get('sender') or request.data.get('from', 'Unknown')
        message = request.data.get('message') or request.data.get('text') or request.data.get('body', '')
        raw_payload = request.data

        if not message and not request.data.get('trx_id'):
            return Response({'error': 'Message content or trx_id required'}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve tenant strictly from request domain/header
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({'error': 'Tenant could not be resolved from request host or context.'}, status=status.HTTP_400_BAD_REQUEST)

        # --- Parse SMS ---
        trx_match = re.search(r'(?:TrxID|TxnId|Txn|Transaction\s*ID|TxID)[:\s]+([A-Za-z0-9_-]+)', message, re.IGNORECASE)
        amount_match = re.search(r'(?:Tk|BDT|Amount\s*[:\s]*Tk?\.?)\s*([\d,]+\.?\d*)', message, re.IGNORECASE)
        account_match = re.search(r'(?:from|account)[:\s]+([0-9+]+)', message, re.IGNORECASE)
        ref_match = re.search(r'(?:Ref|Reference)[:\s]+([A-Za-z0-9_\.-]+)', message, re.IGNORECASE)

        parsed_trx = request.data.get('trx_id') or ((trx_match.group(1)) if trx_match else '')
        parsed_amount = request.data.get('amount')
        if not parsed_amount and amount_match:
            try:
                parsed_amount = float(amount_match.group(1).replace(',', ''))
            except Exception:
                parsed_amount = None
        parsed_acc = request.data.get('sender_account') or ((account_match.group(1)) if account_match else '')
        parsed_ref = request.data.get('reference_id') or request.data.get('reference') or ((ref_match.group(1)) if ref_match else '')
        parsed_provider = request.data.get('provider')
        if not parsed_provider:
            msg_lower = (message + ' ' + sender).lower()
            if 'bkash' in msg_lower:
                parsed_provider = 'bKash'
            elif 'nagad' in msg_lower:
                parsed_provider = 'Nagad'
            elif 'rocket' in msg_lower:
                parsed_provider = 'Rocket'
            elif 'upay' in msg_lower:
                parsed_provider = 'Upay'
            elif 'sslcommerz' in msg_lower:
                parsed_provider = 'SSLCommerz'
            else:
                parsed_provider = 'SMS'

        # --- Fast Idempotency: duplicate TrxID or Reference ID returns early HTTP 202 ---
        if parsed_trx:
            existing_txn = PaymentTransaction.objects.filter(tenant=tenant, trx_id=parsed_trx).first()
            if existing_txn:
                return Response({
                    'status': 'accepted',
                    'sms_id': str(existing_txn.id),
                    'matched': True,
                    'idempotent': True,
                    'message': f'TrxID {parsed_trx} already processed.'
                }, status=status.HTTP_202_ACCEPTED)

            existing_event = InboundPaymentEvent.objects.filter(
                tenant=tenant, trx_id=parsed_trx, status=InboundPaymentEvent.EventStatus.MATCHED
            ).first()
            if existing_event:
                return Response({
                    'status': 'accepted',
                    'event_id': str(existing_event.id),
                    'matched': True,
                    'idempotent': True,
                    'message': f'TrxID {parsed_trx} already processed.'
                }, status=status.HTTP_202_ACCEPTED)

        if parsed_ref:
            existing_ref = InboundPaymentEvent.objects.filter(
                tenant=tenant, reference_id=parsed_ref, status=InboundPaymentEvent.EventStatus.MATCHED
            ).first()
            if existing_ref:
                return Response({
                    'status': 'accepted',
                    'event_id': str(existing_ref.id),
                    'matched': True,
                    'idempotent': True,
                    'message': f'Reference ID {parsed_ref} already processed.'
                }, status=status.HTTP_202_ACCEPTED)

        # Ingestion-only: record SMS and create InboundPaymentEvent
        sms_log = SmsLog.objects.create(
            tenant=tenant,
            sender=sender,
            raw_message=message,
            parsed_provider=parsed_provider,
            parsed_amount=parsed_amount,
            parsed_trx_id=parsed_trx,
            parsed_account=parsed_acc,
            is_matched=False
        )

        event = InboundPaymentEvent.objects.create(
            tenant=tenant,
            source=InboundPaymentEvent.EventSource.SMS,
            raw_payload=message if isinstance(message, str) else str(raw_payload),
            provider=parsed_provider,
            amount=parsed_amount,
            trx_id=parsed_trx,
            sender_account=parsed_acc,
            reference_id=parsed_ref,
            sms_log=sms_log,
            status=InboundPaymentEvent.EventStatus.RECEIVED
        )

        # Dispatch async Celery task
        process_payment_event.delay(str(tenant.id), str(event.id))

        return Response({
            'status': 'accepted',
            'event_id': str(event.id),
            'sms_id': str(sms_log.id),
            'matched': False,
            'message': 'Payment event accepted for background processing.'
        }, status=status.HTTP_202_ACCEPTED)


@extend_schema_view(
    list=extend_schema(tags=['7. Payments & SMS Gateways']),
    retrieve=extend_schema(tags=['7. Payments & SMS Gateways']),
    create=extend_schema(tags=['7. Payments & SMS Gateways']),
)
class InboundPaymentEventViewSet(viewsets.ModelViewSet):
    """
    Ingestion and management of inbound payment events.
    Supports Android ISP admin app pushing extracted payment SMS events,
    webhook integrations, and manual resolution of unmatched events.
    """
    serializer_class = InboundPaymentEventSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsTenantMember(), IsBillingStaff()]

    def get_queryset(self):
        return get_scoped_queryset(self.request, InboundPaymentEvent).select_related(
            'matched_customer', 'matched_transaction', 'sms_log'
        )

    def create(self, request, *args, **kwargs):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({'error': 'Tenant could not be resolved from request host or context.'}, status=status.HTTP_400_BAD_REQUEST)

        source = request.data.get('source', InboundPaymentEvent.EventSource.SMS)
        raw_payload = request.data.get('raw_payload') or request.data.get('message') or str(request.data)
        provider = request.data.get('provider', '')
        amount = request.data.get('amount')
        trx_id = str(request.data.get('trx_id') or '').strip()
        sender_account = str(request.data.get('sender_account') or request.data.get('sender') or '').strip()
        reference_id = str(request.data.get('reference_id') or request.data.get('reference') or '').strip()

        if not raw_payload and not trx_id:
            return Response({'error': 'raw_payload or trx_id required'}, status=status.HTTP_400_BAD_REQUEST)

        # Fast idempotency check
        if trx_id:
            existing_txn = PaymentTransaction.objects.filter(tenant=tenant, trx_id=trx_id).first()
            if existing_txn:
                return Response({
                    'status': 'accepted',
                    'idempotent': True,
                    'matched': True,
                    'transaction_id': str(existing_txn.id),
                    'message': f'TrxID {trx_id} already processed.'
                }, status=status.HTTP_202_ACCEPTED)

            existing_event = InboundPaymentEvent.objects.filter(
                tenant=tenant, trx_id=trx_id, status=InboundPaymentEvent.EventStatus.MATCHED
            ).first()
            if existing_event:
                return Response({
                    'status': 'accepted',
                    'idempotent': True,
                    'matched': True,
                    'event_id': str(existing_event.id),
                    'message': f'TrxID {trx_id} already processed.'
                }, status=status.HTTP_202_ACCEPTED)

        if reference_id:
            existing_ref = InboundPaymentEvent.objects.filter(
                tenant=tenant, reference_id=reference_id, status=InboundPaymentEvent.EventStatus.MATCHED
            ).first()
            if existing_ref:
                return Response({
                    'status': 'accepted',
                    'idempotent': True,
                    'matched': True,
                    'event_id': str(existing_ref.id),
                    'message': f'Reference ID {reference_id} already processed.'
                }, status=status.HTTP_202_ACCEPTED)

        # Ingestion-only: create InboundPaymentEvent
        event = InboundPaymentEvent.objects.create(
            tenant=tenant,
            source=source,
            raw_payload=raw_payload,
            provider=provider,
            amount=amount,
            trx_id=trx_id,
            sender_account=sender_account,
            reference_id=reference_id,
            status=InboundPaymentEvent.EventStatus.RECEIVED
        )

        # Dispatch async Celery task
        process_payment_event.delay(str(tenant.id), str(event.id))

        return Response({
            'status': 'accepted',
            'event_id': str(event.id),
            'matched': False,
            'message': 'Payment event accepted for background processing.'
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, pk=None):
        """
        Manually resolve an UNMATCHED or FAILED payment event by linking it to a customer.
        Authoritatively performs financial ledger entry and recharge.
        """
        event = self.get_object()
        if event.status == InboundPaymentEvent.EventStatus.MATCHED:
            return Response({'error': 'Event has already been matched and processed'}, status=status.HTTP_400_BAD_REQUEST)
        if event.status == InboundPaymentEvent.EventStatus.DUPLICATE:
            return Response({'error': 'Duplicate events cannot be resolved'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ResolvePaymentEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer_id = serializer.validated_data['customer_id']

        customer = Customer.objects.filter(tenant=event.tenant, id=customer_id).first()
        if not customer:
            return Response({'error': 'Customer not found under this tenant'}, status=status.HTTP_404_NOT_FOUND)

        # Execute processing with explicit customer_id
        result = process_payment_event(
            tenant_id=str(event.tenant.id),
            event_id=str(event.id),
            customer_id=str(customer.id)
        )

        event.refresh_from_db()
        return Response({
            'status': 'resolved' if event.status == InboundPaymentEvent.EventStatus.MATCHED else event.status,
            'event_id': str(event.id),
            'matched_customer_id': str(customer.id),
            'matched_customer_username': customer.pppoe_username,
            'result': result
        }, status=status.HTTP_200_OK)

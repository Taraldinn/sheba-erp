import re
import uuid
import datetime
from rest_framework import viewsets, permissions, views, status
from rest_framework.response import Response
from django.db import transaction, IntegrityError
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import PaymentGateway, PaymentTransaction, SmsLog, TransactionStatus
from .serializers import PaymentGatewaySerializer, PaymentTransactionSerializer, SmsLogSerializer
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Recharge
from apps.core.models import AuditLog
from apps.core.permissions import IsTenantMember, IsAdminOrManager, IsBillingStaff
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


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
)
class PaymentTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = PaymentTransactionSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, PaymentTransaction).select_related('customer')


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
    description='Receives automated SMS forwarded from Android SMS Gateway or modem for automatic billing reconciliation. Idempotent: duplicate TrxIDs are silently ignored.'
)
class SmsWebhookView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        sender = request.data.get('sender') or request.data.get('from', 'Unknown')
        message = request.data.get('message') or request.data.get('text', '')
        tenant = getattr(request, 'tenant', None)

        if not message:
            return Response({'error': 'Message content empty'}, status=status.HTTP_400_BAD_REQUEST)

        # --- Parse SMS ---
        trx_match = re.search(r'TrxID\s+([A-Z0-9]+)|TxnId:\s*([A-Z0-9]+)|Txn:\s*([A-Z0-9]+)', message, re.IGNORECASE)
        amount_match = re.search(r'Tk\s*([\d,]+\.?\d*)|BDT\s*([\d,]+\.?\d*)', message, re.IGNORECASE)
        account_match = re.search(r'from\s+([0-9+]+)|Ref\s+([A-Za-z0-9_-]+)', message, re.IGNORECASE)

        parsed_trx = (trx_match.group(1) or trx_match.group(2) or trx_match.group(3)) if trx_match else ''
        parsed_amount = float(amount_match.group(1).replace(',', '')) if amount_match else None
        parsed_acc = (account_match.group(1) or account_match.group(2)) if account_match else ''
        parsed_provider = 'bKash' if 'bkash' in message.lower() or 'bkash' in sender.lower() else \
                          'Nagad' if 'nagad' in message.lower() else 'Generic'

        # --- P0.3 IDEMPOTENCY: if we've already processed this TrxID, return early ---
        if parsed_trx:
            existing_txn = PaymentTransaction.objects.filter(trx_id=parsed_trx).first()
            if existing_txn:
                return Response({
                    'status': 'success',
                    'sms_id': str(existing_txn.id),
                    'matched': True,
                    'idempotent': True,
                    'message': f'TrxID {parsed_trx} already processed.'
                })

        try:
            with transaction.atomic():
                # Create SMS log
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

                matched = False

                # Auto-match by phone number
                if parsed_acc and parsed_amount:
                    customer_qs = Customer.objects.filter(mobile__icontains=parsed_acc[-10:])
                    if tenant:
                        customer_qs = customer_qs.filter(tenant=tenant)
                    customer = customer_qs.select_for_update().first()

                    if customer:
                        sms_log.matched_customer = customer
                        sms_log.is_matched = True
                        sms_log.save(update_fields=['matched_customer', 'is_matched'])
                        matched = True

                        # Extend customer expiry and activate
                        today = timezone.now().date()
                        base = customer.expiry_date if customer.expiry_date and customer.expiry_date >= today else today
                        new_expiry = base + datetime.timedelta(days=30)
                        customer.expiry_date = new_expiry
                        customer.status = CustomerStatus.ACTIVE
                        customer.save(update_fields=['expiry_date', 'status'])

                        # Safe unique trx_id fallback
                        final_trx_id = parsed_trx if parsed_trx else f"SMS-{str(uuid.uuid4())[:8]}"

                        PaymentTransaction.objects.create(
                            tenant=tenant,
                            customer=customer,
                            amount=parsed_amount,
                            trx_id=final_trx_id,
                            payment_method=parsed_provider,
                            status=TransactionStatus.MATCHED,
                            customer_account=parsed_acc,
                            sms_log=sms_log
                        )

                        Recharge.objects.create(
                            tenant=tenant,
                            customer=customer,
                            package=customer.package,
                            amount=parsed_amount,
                            validity_days=30,
                            new_expiry=new_expiry,
                            old_expiry=customer.expiry_date,
                            payment_method=parsed_provider,
                            trx_id=final_trx_id,
                            notes=f"Auto-recharged from SMS TrxID: {parsed_trx}"
                        )

                        AuditLog.objects.create(
                            tenant=tenant,
                            actor_username='SMS_AUTO_ROBOT',
                            action='SMS_AUTO_RECHARGE',
                            module='PAYMENTS',
                            target_id=str(customer.id),
                            details={
                                'trx_id': final_trx_id,
                                'amount': parsed_amount,
                                'pppoe_username': customer.pppoe_username,
                            }
                        )

        except IntegrityError:
            # Rare duplicate trx_id race condition — treat as idempotent success
            return Response({'status': 'success', 'matched': True, 'idempotent': True})

        return Response({
            'status': 'success',
            'sms_id': str(sms_log.id),
            'matched': matched
        })

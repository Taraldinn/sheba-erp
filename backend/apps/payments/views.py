import re
import uuid
import datetime
from rest_framework import viewsets, permissions, views, status
from rest_framework.response import Response
from django.utils import timezone
from .models import PaymentGateway, PaymentTransaction, SmsLog, TransactionStatus
from .serializers import PaymentGatewaySerializer, PaymentTransactionSerializer, SmsLogSerializer
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Recharge
from apps.core.models import AuditLog


class PaymentGatewayViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PaymentGatewaySerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return PaymentGateway.objects.filter(tenant=tenant)
        return PaymentGateway.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class PaymentTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PaymentTransactionSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        qs = PaymentTransaction.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)
        return qs.select_related('customer')


class SmsLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SmsLogSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        qs = SmsLog.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)
        return qs.select_related('matched_customer')


class SmsWebhookView(views.APIView):
    """
    Receives automated SMS forwarded from Android SMS Gateway or Modem.
    Parses bKash / Nagad / Rocket transaction alerts and auto-matches customer.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        sender = request.data.get('sender') or request.data.get('from', 'Unknown')
        message = request.data.get('message') or request.data.get('text', '')
        tenant = getattr(request, 'tenant', None)

        if not message:
            return Response({'error': 'Message content empty'}, status=status.HTTP_400_BAD_REQUEST)

        # Regex parsing for bKash / Nagad / Upay transactions
        # bKash: "You have received Tk 500.00 from 017XXXX. Fee Tk 0.00. Balance Tk 10500. TrxID 9A8B7C6D"
        trx_match = re.search(r'TrxID\s+([A-Z0-9]+)|TxnId:\s*([A-Z0-9]+)|Txn:\s*([A-Z0-9]+)', message, re.IGNORECASE)
        amount_match = re.search(r'Tk\s*([\d,]+\.?\d*)|BDT\s*([\d,]+\.?\d*)', message, re.IGNORECASE)
        account_match = re.search(r'from\s+([0-9+]+)|Ref\s+([A-Za-z0-9_-]+)', message, re.IGNORECASE)

        parsed_trx = (trx_match.group(1) or trx_match.group(2) or trx_match.group(3)) if trx_match else ''
        parsed_amount = float(amount_match.group(1).replace(',', '')) if amount_match else None
        parsed_acc = (account_match.group(1) or account_match.group(2)) if account_match else ''

        # Create SMS log
        sms_log = SmsLog.objects.create(
            tenant=tenant,
            sender=sender,
            raw_message=message,
            parsed_provider='bKash' if 'bkash' in message.lower() or 'bkash' in sender.lower() else 'Nagad' if 'nagad' in message.lower() else 'Generic',
            parsed_amount=parsed_amount,
            parsed_trx_id=parsed_trx,
            parsed_account=parsed_acc,
            is_matched=False
        )

        # Check if we can auto-match by phone number or reference in message
        if parsed_acc and parsed_amount:
            customer = Customer.objects.filter(mobile__icontains=parsed_acc[-10:]).first()
            if customer:
                sms_log.matched_customer = customer
                sms_log.is_matched = True
                sms_log.save()

                # Automatically post payment & recharge
                new_expiry = (customer.expiry_date or timezone.now().date()) + datetime.timedelta(days=30)
                customer.expiry_date = new_expiry
                customer.status = CustomerStatus.ACTIVE
                customer.save()

                PaymentTransaction.objects.create(
                    tenant=tenant,
                    customer=customer,
                    amount=parsed_amount,
                    trx_id=parsed_trx or str(uuid.uuid4())[:8],
                    payment_method=sms_log.parsed_provider,
                    status=TransactionStatus.MATCHED,
                    customer_account=parsed_acc,
                    raw_payload={'sms_id': str(sms_log.id)}
                )

        return Response({
            'status': 'success',
            'sms_id': str(sms_log.id),
            'matched': sms_log.is_matched
        })

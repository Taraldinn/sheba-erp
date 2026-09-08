import uuid
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Package, ResellerPricing, Invoice, Recharge, Offer
from .serializers import PackageSerializer, ResellerPricingSerializer, InvoiceSerializer, RechargeSerializer, OfferSerializer
from apps.core.permissions import IsTenantMember, IsAdminUserOrReadOnly, IsBillingStaff
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.payments.models import PaymentTransaction, TransactionStatus
from apps.finance.models import BillingAccount, LedgerEntry, PaymentAllocation
from apps.finance.services import get_or_create_billing_account, record_ledger_entry
from apps.core.models import AuditLog


@extend_schema_view(
    list=extend_schema(tags=['3. Broadband Packages & Offers']),
    retrieve=extend_schema(tags=['3. Broadband Packages & Offers']),
    create=extend_schema(tags=['3. Broadband Packages & Offers']),
    update=extend_schema(tags=['3. Broadband Packages & Offers']),
    partial_update=extend_schema(tags=['3. Broadband Packages & Offers']),
    destroy=extend_schema(tags=['3. Broadband Packages & Offers']),
)
class PackageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminUserOrReadOnly]
    serializer_class = PackageSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Package)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['3. Broadband Packages & Offers']),
    retrieve=extend_schema(tags=['3. Broadband Packages & Offers']),
    create=extend_schema(tags=['3. Broadband Packages & Offers']),
    update=extend_schema(tags=['3. Broadband Packages & Offers']),
    partial_update=extend_schema(tags=['3. Broadband Packages & Offers']),
    destroy=extend_schema(tags=['3. Broadband Packages & Offers']),
)
class OfferViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminUserOrReadOnly]
    serializer_class = OfferSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Offer)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['6. Billing & Invoices']),
    retrieve=extend_schema(tags=['6. Billing & Invoices']),
    create=extend_schema(tags=['6. Billing & Invoices']),
    update=extend_schema(tags=['6. Billing & Invoices']),
    partial_update=extend_schema(tags=['6. Billing & Invoices']),
    destroy=extend_schema(tags=['6. Billing & Invoices']),
)
class ResellerPricingViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsAdminUserOrReadOnly]
    serializer_class = ResellerPricingSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, ResellerPricing)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from apps.core.authorization import can


@extend_schema_view(
    list=extend_schema(tags=['6. Billing & Invoices']),
    retrieve=extend_schema(tags=['6. Billing & Invoices']),
    create=extend_schema(tags=['6. Billing & Invoices']),
    update=extend_schema(tags=['6. Billing & Invoices']),
    partial_update=extend_schema(tags=['6. Billing & Invoices']),
    destroy=extend_schema(tags=['6. Billing & Invoices']),
)
class InvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, Invoice).select_related('customer__package', 'customer__router')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'invoice.create'):
            raise PermissionDenied("Permission denied: invoice.create capability required.")
        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'invoice.manage', serializer.instance):
            raise PermissionDenied("Permission denied: invoice.manage capability required.")
        serializer.save()

    def perform_destroy(self, instance):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'invoice.manage', instance):
            raise PermissionDenied("Permission denied: invoice.manage capability required.")
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        invoice = self.get_object()
        tenant = request.tenant
        if not can(request.user, tenant, 'customer.recharge', invoice) and not can(request.user, tenant, 'invoice.manage', invoice):
            return Response({'error': 'Permission denied: customer.recharge or invoice.manage capability required.'}, status=status.HTTP_403_FORBIDDEN)

        current_due = Decimal(str(invoice.total_payable)) - Decimal(str(invoice.paid_amount or '0.00'))
        if current_due <= 0:
            return Response({'error': 'This invoice has already been fully paid.'}, status=status.HTTP_400_BAD_REQUEST)

        amount_req = request.data.get('amount')
        pay_amount = Decimal(str(amount_req)) if amount_req is not None else current_due
        if pay_amount <= 0:
            return Response({'error': 'Payment amount must be greater than 0.'}, status=status.HTTP_400_BAD_REQUEST)

        payment_method = request.data.get('payment_method', 'Cash')
        trx_id = request.data.get('trx_id') or f"INV-PAY-{uuid.uuid4().hex[:8].upper()}"

        with transaction.atomic():
            locked_invoice = Invoice.objects.select_for_update().get(id=invoice.id)
            customer = locked_invoice.customer

            # Create payment transaction
            payment = PaymentTransaction.objects.create(
                tenant=tenant,
                customer=customer,
                amount=pay_amount,
                payment_method=payment_method,
                trx_id=trx_id,
                status=TransactionStatus.SUCCESS,
                raw_payload={
                    'notes': f"Payment for invoice #{locked_invoice.invoice_no}",
                    'processed_by': request.user.username
                }
            )

            # Update BillingAccount
            billing_acct = get_or_create_billing_account(tenant, customer)
            billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)
            billing_acct.total_paid = Decimal(str(billing_acct.total_paid or '0.00')) + pay_amount
            billing_acct.balance = Decimal(str(billing_acct.balance or '0.00')) + pay_amount
            billing_acct.last_payment_at = timezone.now()
            billing_acct.save(update_fields=['total_paid', 'balance', 'last_payment_at'])

            # Record LedgerEntry
            record_ledger_entry(
                tenant=tenant,
                customer=customer,
                entry_type=LedgerEntry.EntryType.PAYMENT,
                amount=pay_amount,
                balance_after=billing_acct.balance,
                reference_id=str(payment.id),
                reference_type='PaymentTransaction',
                description=f"Invoice #{locked_invoice.invoice_no} settlement payment via {payment_method}",
                created_by=request.user.username if request.user.is_authenticated else 'system'
            )

            # Create PaymentAllocation
            alloc_amount = min(pay_amount, current_due)
            alloc = PaymentAllocation.objects.create(
                tenant=tenant,
                payment=payment,
                invoice=locked_invoice,
                amount=alloc_amount,
                notes=f"Settlement allocation from {payment.trx_id}"
            )

            # Update Invoice
            new_paid = Decimal(str(locked_invoice.paid_amount or '0.00')) + alloc_amount
            locked_invoice.paid_amount = new_paid
            locked_invoice.due_amount = max(Decimal('0.00'), Decimal(str(locked_invoice.total_payable)) - new_paid)
            if locked_invoice.due_amount <= 0:
                locked_invoice.status = Invoice.InvoiceStatus.PAID
            else:
                locked_invoice.status = Invoice.InvoiceStatus.PARTIAL
            locked_invoice.save(update_fields=['paid_amount', 'due_amount', 'status'])

            # Offset customer due
            if customer.due_amount > 0:
                due_dec = Decimal(str(customer.due_amount))
                if alloc_amount >= due_dec:
                    surplus = alloc_amount - due_dec
                    customer.due_amount = Decimal('0.00')
                    customer.advance_amount = Decimal(str(customer.advance_amount or '0.00')) + surplus
                else:
                    customer.due_amount = due_dec - alloc_amount
                customer.save(update_fields=['due_amount', 'advance_amount'])

            AuditLog.objects.create(
                tenant=tenant,
                actor_username=request.user.username if request.user.is_authenticated else 'system',
                action='PAY_INVOICE',
                module='BILLING',
                target_id=str(locked_invoice.id),
                details={
                    'invoice_no': locked_invoice.invoice_no,
                    'paid_amount': float(alloc_amount),
                    'payment_id': str(payment.id),
                    'status': locked_invoice.status
                }
            )

        locked_invoice.refresh_from_db()
        return Response({
            'message': f'Invoice #{locked_invoice.invoice_no} payment of ৳{alloc_amount} processed successfully.',
            'invoice': InvoiceSerializer(locked_invoice).data,
            'payment_id': str(payment.id),
            'allocation_id': str(alloc.id),
            'status': locked_invoice.status
        })


@extend_schema_view(
    list=extend_schema(tags=['6. Billing & Invoices']),
    retrieve=extend_schema(tags=['6. Billing & Invoices']),
)
class RechargeViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = RechargeSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Recharge).select_related('customer', 'package', 'processed_by__user')

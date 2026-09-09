import uuid
from decimal import Decimal
from rest_framework import viewsets, permissions, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from drf_spectacular.utils import extend_schema, extend_schema_view

from django.db import transaction

from apps.core.permissions import IsTenantMember, IsBillingStaff
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.core.authorization import can
from apps.customers.models import Customer
from apps.finance.models import BillingAccount, LedgerEntry, PaymentAllocation, Adjustment
from apps.finance.serializers import (
    BillingAccountSerializer, LedgerEntrySerializer,
    PaymentAllocationSerializer, AdjustmentSerializer
)
from apps.finance.services import get_or_create_billing_account, record_ledger_entry, reconcile_billing_account


@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
)
class BillingAccountViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = BillingAccountSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, BillingAccount).select_related('customer')

    @action(detail=True, methods=['get'])
    def reconcile(self, request, pk=None):
        """
        Reconciles the cached account balance against the immutable LedgerEntry history.
        """
        account = self.get_object()
        report = reconcile_billing_account(account)
        return Response(report, status=status.HTTP_200_OK)


@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
)
class LedgerEntryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = LedgerEntrySerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, LedgerEntry).select_related('customer')
        cust_id = self.request.query_params.get('customer')
        entry_type = self.request.query_params.get('entry_type')
        if cust_id:
            try:
                uuid.UUID(str(cust_id))
            except (ValueError, AttributeError, TypeError):
                raise ValidationError({'customer': 'Must be a valid UUID.'})
            qs = qs.filter(customer_id=cust_id)
        if entry_type:
            qs = qs.filter(entry_type=entry_type)
        return qs


@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
)
class PaymentAllocationViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = PaymentAllocationSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, PaymentAllocation).select_related('payment', 'invoice')


@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
    create=extend_schema(tags=['6. Finance & Ledger']),
)
class AdjustmentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet
):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = AdjustmentSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Adjustment).select_related('customer', 'ledger_entry')

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not tenant:
            raise ValidationError("Tenant context required.")

        customer_id = serializer.validated_data.get('customer_id')
        customer = Customer.objects.filter(tenant=tenant, id=customer_id).first()
        if not customer:
            raise ValidationError("Customer does not belong to your ISP.")

        if not can(self.request.user, tenant, 'finance.adjust', customer) and not can(self.request.user, tenant, 'customer.recharge', customer):
            raise PermissionDenied("Permission denied: finance.adjust capability required.")

        amount = Decimal(str(serializer.validated_data['amount']))
        adj_type = serializer.validated_data['adjustment_type']
        reason = serializer.validated_data['reason']

        with transaction.atomic():
            locked_customer = Customer.objects.select_for_update().get(id=customer.id)
            billing_acct = BillingAccount.objects.select_for_update().filter(
                tenant=tenant, customer=locked_customer
            ).first()
            if not billing_acct:
                billing_acct = get_or_create_billing_account(tenant, locked_customer)
                billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)

            # Determine sign
            if adj_type in [Adjustment.AdjustmentType.CREDIT, Adjustment.AdjustmentType.WAIVER]:
                signed_amount = amount
            else:
                signed_amount = -amount

            billing_acct.balance = Decimal(str(billing_acct.balance or '0.00')) + signed_amount
            billing_acct.save(update_fields=['balance'])

            # Offset customer due if credit / waiver
            if signed_amount > 0 and locked_customer.due_amount > 0:
                due_dec = Decimal(str(locked_customer.due_amount))
                if signed_amount >= due_dec:
                    surplus = signed_amount - due_dec
                    locked_customer.due_amount = Decimal('0.00')
                    locked_customer.advance_amount = Decimal(str(locked_customer.advance_amount or '0.00')) + surplus
                else:
                    locked_customer.due_amount = due_dec - signed_amount
                locked_customer.save(update_fields=['due_amount', 'advance_amount'])
            elif signed_amount < 0:
                # Debit increases due
                locked_customer.due_amount = Decimal(str(locked_customer.due_amount or '0.00')) + abs(signed_amount)
                locked_customer.save(update_fields=['due_amount'])

            # Create LedgerEntry
            ledger_entry = record_ledger_entry(
                tenant=tenant,
                customer=locked_customer,
                entry_type=LedgerEntry.EntryType.ADJUSTMENT,
                amount=signed_amount,
                balance_after=billing_acct.balance,
                reference_type='Adjustment',
                description=f"Manual Adjustment: {adj_type} - {reason}",
                created_by=self.request.user.username
            )

            serializer.validated_data.pop('customer_id', None)
            adjustment = serializer.save(
                tenant=tenant,
                customer=locked_customer,
                approved_by=self.request.user.username,
                ledger_entry=ledger_entry
            )
            ledger_entry.reference_id = str(adjustment.id)
            ledger_entry.save(update_fields=['reference_id'])

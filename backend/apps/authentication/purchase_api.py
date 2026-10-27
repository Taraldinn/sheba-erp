"""
Stage 5 — Package Purchase, Renewal, and Collection API endpoints.

Mounted under ResellerViewSet:
  POST  /api/v1/resellers/{id}/purchase/         buy a package for a customer
  POST  /api/v1/resellers/{id}/renew/            renew an existing connection
  GET   /api/v1/resellers/{id}/collections/      list collections
  POST  /api/v1/resellers/{id}/collections/      record a collection
  POST  /api/v1/resellers/{id}/collections/{cid}/allocate/  allocate to invoice
"""
import logging
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.billing.models import Package, Recharge
from apps.customers.models import Customer
from apps.finance.services import allocate_payment_to_invoices

from .models import Reseller
from .collection_models import ResellerCollectionEvent
from .purchase_service import (
    PackagePurchaseService, PurchaseError,
    CustomerNotAssignedError, ResellerInactiveError, PackageNotForTenantError,
)
from .wallet_service import (
    WalletService, WalletError, InsufficientFundsError, CreditLimitExceededError,
)

logger = logging.getLogger(__name__)


# ── Serializers ──────────────────────────────────────────────────────────

class PackagePurchaseSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    package_id = serializers.UUIDField()
    funding_source = serializers.ChoiceField(choices=['WALLET', 'CREDIT'], default='WALLET')
    validity_days = serializers.IntegerField(required=False, default=30, min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True)
    idempotency_key = serializers.CharField(required=False, allow_blank=True)


class ConnectionRenewSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    validity_days = serializers.IntegerField(required=False, default=30, min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True)
    idempotency_key = serializers.CharField(required=False, allow_blank=True)


class ResellerCollectionCreateSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    method = serializers.ChoiceField(choices=[c[0] for c in ResellerCollectionEvent.Method.choices],
                                     default='CASH')
    reference = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    idempotency_key = serializers.CharField(required=False, allow_blank=True)


class ResellerCollectionReadSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.full_name', read_only=True, default='')

    class Meta:
        model = ResellerCollectionEvent
        fields = [
            'id', 'customer', 'customer_name', 'amount', 'method',
            'reference', 'notes', 'status', 'collected_at', 'created_at',
        ]


class CollectionAllocateSerializer(serializers.Serializer):
    invoice_id = serializers.UUIDField(required=False, allow_null=True)
    recharge_id = serializers.UUIDField(required=False, allow_null=True)
    payment_transaction_id = serializers.UUIDField(required=False, allow_null=True)


def _err(exc):
    return Response(
        {'error': exc.message, 'code': exc.code, **exc.extra},
        status=exc.http_status,
    )


def attach_purchase_actions(viewset_cls):
    @action(detail=True, methods=['post'])
    def purchase(self, request, pk=None):
        reseller = self.get_object()
        # Write scope: tenant admin OR the reseller acting for an
        # assigned customer.
        ser = PackagePurchaseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            customer = Customer.objects.get(
                id=ser.validated_data['customer_id'], tenant=reseller.tenant,
            )
            package = Package.objects.get(
                id=ser.validated_data['package_id'], tenant=reseller.tenant,
            )
        except (Customer.DoesNotExist, Package.DoesNotExist):
            return Response(
                {'error': 'Customer or package not found in this tenant.',
                 'code': 'NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )
        # Permission: tenant admin OR the reseller acting on an assigned customer.
        is_admin = self._is_tenant_admin(request, reseller)
        if not is_admin:
            if reseller.user_id != request.user.id:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Only the reseller themselves or a tenant admin can purchase.')
        try:
            result = PackagePurchaseService.purchase_for_customer(
                reseller=reseller,
                customer=customer,
                package=package,
                funding_source=ser.validated_data['funding_source'],
                validity_days=ser.validated_data.get('validity_days', 30),
                notes=ser.validated_data.get('notes', ''),
                actor=request.user.username,
                idempotency_key=ser.validated_data.get('idempotency_key') or None,
            )
        except (PurchaseError, WalletError) as exc:
            return _err(exc)
        return Response(result, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def renew(self, request, pk=None):
        reseller = self.get_object()
        ser = ConnectionRenewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            customer = Customer.objects.get(
                id=ser.validated_data['customer_id'], tenant=reseller.tenant,
            )
        except Customer.DoesNotExist:
            return Response({'error': 'Customer not found.', 'code': 'NOT_FOUND'},
                            status=status.HTTP_404_NOT_FOUND)
        # The renewal re-purchases the customer's current package.
        if customer.package is None:
            return Response(
                {'error': 'Customer has no current package to renew.',
                 'code': 'NO_PACKAGE'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        is_admin = self._is_tenant_admin(request, reseller)
        if not is_admin and reseller.user_id != request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the reseller themselves or a tenant admin can renew.')
        # If the customer is renewing themselves (self-care) we DO NOT
        # touch the reseller wallet — that path is the existing
        # execute_transactional_recharge used by the customer portal.
        if reseller.user_id != request.user.id and not is_admin:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the reseller or tenant admin may renew via this path.')
        try:
            result = PackagePurchaseService.purchase_for_customer(
                reseller=reseller,
                customer=customer,
                package=customer.package,
                funding_source='WALLET',
                validity_days=ser.validated_data.get('validity_days', 30),
                notes=ser.validated_data.get('notes', 'connection renewal'),
                actor=request.user.username,
                idempotency_key=ser.validated_data.get('idempotency_key') or None,
            )
        except (PurchaseError, WalletError) as exc:
            return _err(exc)
        return Response(result, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'])
    def collections(self, request, pk=None):
        reseller = self.get_object()
        if request.method == 'GET':
            self._check_view_scope(request, reseller)
            qs = ResellerCollectionEvent.objects.filter(
                reseller=reseller
            ).order_by('-collected_at')
            status_f = request.query_params.get('status')
            if status_f:
                qs = qs.filter(status=status_f.upper())
            return Response({
                'count': qs.count(),
                'results': ResellerCollectionReadSerializer(qs, many=True).data,
            })
        # POST: record a collection.
        # Either the reseller themselves (representing themselves having
        # collected cash) or a tenant admin may record a collection.
        is_admin = self._is_tenant_admin(request, reseller)
        if not is_admin and reseller.user_id != request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the reseller or a tenant admin may record a collection.')
        ser = ResellerCollectionCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        customer = None
        if ser.validated_data.get('customer_id'):
            customer = Customer.objects.filter(
                id=ser.validated_data['customer_id'], tenant=reseller.tenant,
            ).first()
        try:
            with transaction.atomic():
                coll = ResellerCollectionEvent.objects.create(
                    tenant=reseller.tenant, reseller=reseller,
                    customer=customer,
                    amount=ser.validated_data['amount'],
                    method=ser.validated_data['method'],
                    reference=ser.validated_data.get('reference', ''),
                    notes=ser.validated_data.get('notes', ''),
                    recorded_by=request.user.username,
                )
        except Exception as exc:
            # Idempotency: UniqueConstraint on (tenant, reseller, reference)
            if ser.validated_data.get('reference'):
                existing = ResellerCollectionEvent.objects.filter(
                    tenant=reseller.tenant, reseller=reseller,
                    reference=ser.validated_data['reference'],
                ).first()
                if existing:
                    return Response(
                        ResellerCollectionReadSerializer(existing).data,
                        status=status.HTTP_200_OK,
                    )
            return Response(
                {'error': f'Could not record collection: {exc}',
                 'code': 'COLLECTION_FAILED'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(ResellerCollectionReadSerializer(coll).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'],
            url_path=r'collections/(?P<coll_id>[^/.]+)/allocate')
    def allocate_collection(self, request, pk=None, coll_id=None):
        reseller = self.get_object()
        is_admin = self._is_tenant_admin(request, reseller)
        if not is_admin and reseller.user_id != request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the reseller or a tenant admin may allocate.')
        coll = ResellerCollectionEvent.objects.filter(
            id=coll_id, reseller=reseller,
        ).first()
        if not coll:
            return Response({'error': 'Collection not found.',
                             'code': 'NOT_FOUND'},
                            status=status.HTTP_404_NOT_FOUND)
        ser = CollectionAllocateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        # Master task §E: 'A payment collected from a customer must not
        # automatically increase the reseller wallet.' Allocating a
        # collection to an invoice / recharge / payment_transaction does
        # NOT credit the wallet. The wallet credit is computed only at
        # settlement close.
        with transaction.atomic():
            if ser.validated_data.get('invoice_id'):
                from apps.billing.models import Invoice
                inv = Invoice.objects.filter(
                    id=ser.validated_data['invoice_id'],
                    tenant=reseller.tenant,
                ).first()
                if not inv:
                    return Response(
                        {'error': 'Invoice not found.', 'code': 'NOT_FOUND'},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                coll.invoice = inv
            if ser.validated_data.get('recharge_id'):
                rcg = Recharge.objects.filter(
                    id=ser.validated_data['recharge_id'],
                    tenant=reseller.tenant,
                ).first()
                if not rcg:
                    return Response(
                        {'error': 'Recharge not found.', 'code': 'NOT_FOUND'},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                coll.recharge = rcg
            if ser.validated_data.get('payment_transaction_id'):
                from apps.payments.models import PaymentTransaction
                pt = PaymentTransaction.objects.filter(
                    id=ser.validated_data['payment_transaction_id'],
                    tenant=reseller.tenant,
                ).first()
                if not pt:
                    return Response(
                        {'error': 'PaymentTransaction not found.',
                         'code': 'NOT_FOUND'},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                coll.payment_transaction = pt
            coll.status = ResellerCollectionEvent.Status.ALLOCATED
            coll.save()
        return Response(ResellerCollectionReadSerializer(coll).data)

    # Patch the viewset with the new actions.
    viewset_cls.purchase = purchase
    viewset_cls.renew = renew
    viewset_cls.collections = collections
    viewset_cls.allocate_collection = allocate_collection
    viewset_cls._is_tenant_admin = _is_tenant_admin
    return viewset_cls


def _is_tenant_admin(self, request, reseller):
    """Helper used by the actions above. Defined on the viewset at patch
    time so the existing `_check_write_scope` runs unchanged."""
    user = request.user
    if user.is_superuser:
        return True
    tenant = getattr(request, 'tenant', None)
    if tenant is None or reseller.tenant_id != tenant.id:
        return False
    from apps.core.authorization import can
    return can(user, tenant, 'staff.manage') or can(user, tenant, 'reseller.manage')

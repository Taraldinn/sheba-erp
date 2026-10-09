"""
Stage 4 — Wallet & Credit-Facility API endpoints.

Mounted under the ResellerViewSet detail actions:
  GET   /api/v1/resellers/{id}/ledger/         paginated statement
  POST  /api/v1/resellers/{id}/topup/         verified top-up (tenant admin)
  POST  /api/v1/resellers/{id}/refund/        refund a posted entry (tenant admin)
  GET   /api/v1/resellers/{id}/holds/         list current holds
  POST  /api/v1/resellers/{id}/holds/{hid}/release/  release a hold
  GET   /api/v1/resellers/{id}/credit/        credit-facility summary
  POST  /api/v1/resellers/{id}/credit/adjust/  adjust approved limit
  POST  /api/v1/resellers/{id}/credit/suspend/ suspend facility
"""
import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.models import AuditLog

from .models import Reseller, ResellerLedgerEntry
from .wallet_models import (
    ResellerWalletHold, ResellerCreditFacility, ResellerCreditApproval,
)
from .wallet_service import (
    WalletService, WalletError, InsufficientFundsError,
    CreditLimitExceededError,
)

logger = logging.getLogger(__name__)


class ResellerLedgerEntryReadSerializer(serializers.ModelSerializer):
    """Read-only serializer for the ledger statement endpoint."""
    class Meta:
        model = ResellerLedgerEntry
        fields = [
            'id', 'entry_type', 'amount', 'balance_after',
            'reference', 'notes', 'created_at',
        ]


class ResellerHoldReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResellerWalletHold
        fields = [
            'id', 'amount', 'source', 'status', 'purpose',
            'reference_id', 'idempotency_key',
            'expires_at', 'created_at', 'finalized_at', 'released_at',
            'release_reason',
        ]


class TopupSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    reference = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    idempotency_key = serializers.CharField(required=False, allow_blank=True)


class RefundSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    reference = serializers.CharField()
    notes = serializers.CharField(required=False, allow_blank=True)
    idempotency_key = serializers.CharField(required=False, allow_blank=True)


class HoldSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    purpose = serializers.CharField()
    source = serializers.ChoiceField(choices=['WALLET', 'CREDIT'], default='WALLET')
    reference_id = serializers.CharField(required=False, allow_blank=True)
    idempotency_key = serializers.CharField(required=False, allow_blank=True)
    ttl_seconds = serializers.IntegerField(required=False, default=3600, min_value=0)


class CreditAdjustSerializer(serializers.Serializer):
    new_limit = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0'))
    reason = serializers.CharField(required=False, allow_blank=True)


def _err(exc):
    return Response(
        {'error': exc.message, 'code': exc.code, **exc.extra},
        status=exc.http_status,
    )


def attach_wallet_actions(viewset_cls):
    """
    Decorator that adds wallet/credit-facility action methods to a
    ResellerViewSet-like class. We attach them here so the URL routing
    already registered with `router.register(r'resellers', ...)` picks
    them up without any router change.
    """
    @action(detail=True, methods=['get'])
    def ledger(self, request, pk=None):
        reseller = self.get_object()
        self._check_view_scope(request, reseller)
        qs = ResellerLedgerEntry.objects.filter(reseller=reseller).order_by('-created_at')
        # Simple pagination via ?limit and ?offset (max 200).
        try:
            limit = min(int(request.query_params.get('limit', 50)), 200)
            offset = max(int(request.query_params.get('offset', 0)), 0)
        except ValueError:
            limit, offset = 50, 0
        total = qs.count()
        items = qs[offset:offset + limit]
        return Response({
            'count': total,
            'limit': limit,
            'offset': offset,
            'results': ResellerLedgerEntryReadSerializer(items, many=True).data,
        })

    @action(detail=True, methods=['post'])
    def topup(self, request, pk=None):
        reseller = self.get_object()
        self._check_write_scope(request, reseller)
        ser = TopupSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            result = WalletService.credit(
                reseller, ser.validated_data['amount'],
                reference=ser.validated_data.get('reference', ''),
                notes=ser.validated_data.get('notes', ''),
                actor=request.user.username,
                idempotency_key=ser.validated_data.get('idempotency_key') or None,
                verified=True,  # top-up is always verified by tenant admin
            )
        except WalletError as exc:
            return _err(exc)
        AuditLog.objects.create(
            tenant=reseller.tenant, actor_username=request.user.username,
            action='TOPUP', module='RESELLER_WALLET',
            resource_type='ResellerLedgerEntry',
            resource_id=str(result['entry'].id),
            details={'amount': str(ser.validated_data['amount'])},
        )
        return Response(ResellerLedgerEntryReadSerializer(result['entry']).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        reseller = self.get_object()
        self._check_write_scope(request, reseller)
        ser = RefundSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            result = WalletService.refund(
                reseller, ser.validated_data['amount'],
                reference=ser.validated_data['reference'],
                notes=ser.validated_data.get('notes', ''),
                actor=request.user.username,
                idempotency_key=ser.validated_data.get('idempotency_key') or None,
            )
        except WalletError as exc:
            return _err(exc)
        AuditLog.objects.create(
            tenant=reseller.tenant, actor_username=request.user.username,
            action='REFUND', module='RESELLER_WALLET',
            resource_type='ResellerLedgerEntry',
            resource_id=str(result['entry'].id),
            details={'amount': str(ser.validated_data['amount']),
                     'reference': ser.validated_data['reference']},
        )
        return Response(ResellerLedgerEntryReadSerializer(result['entry']).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'])
    def holds(self, request, pk=None):
        reseller = self.get_object()
        if request.method == 'GET':
            self._check_view_scope(request, reseller)
            status_filter = request.query_params.get('status', 'PENDING')
            qs = ResellerWalletHold.objects.filter(reseller=reseller)
            if status_filter.upper() != 'ALL':
                qs = qs.filter(status=status_filter.upper())
            qs = qs.order_by('-created_at')
            return Response({
                'count': qs.count(),
                'results': ResellerHoldReadSerializer(qs, many=True).data,
            })
        # POST: create a hold
        self._check_write_scope(request, reseller)
        ser = HoldSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            hold = WalletService.hold(
                reseller, ser.validated_data['amount'],
                purpose=ser.validated_data['purpose'],
                source=ser.validated_data['source'],
                reference_id=ser.validated_data.get('reference_id', ''),
                idempotency_key=ser.validated_data.get('idempotency_key') or None,
                ttl_seconds=ser.validated_data.get('ttl_seconds') or 3600,
                actor=request.user.username,
            )
        except WalletError as exc:
            return _err(exc)
        return Response(ResellerHoldReadSerializer(hold).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'],
            url_path=r'holds/(?P<hold_id>[^/.]+)/release')
    def release_hold(self, request, pk=None, hold_id=None):
        reseller = self.get_object()
        self._check_write_scope(request, reseller)
        hold = ResellerWalletHold.objects.filter(id=hold_id, reseller=reseller).first()
        if not hold:
            return Response({'error': 'Hold not found.', 'code': 'HOLD_NOT_FOUND'},
                            status=status.HTTP_404_NOT_FOUND)
        reason = request.data.get('reason', '')
        try:
            hold = WalletService.release(hold, reason=reason, actor=request.user.username)
        except WalletError as exc:
            return _err(exc)
        return Response(ResellerHoldReadSerializer(hold).data)

    @action(detail=True, methods=['get'])
    def credit(self, request, pk=None):
        reseller = self.get_object()
        self._check_view_scope(request, reseller)
        facility = ResellerCreditFacility.objects.filter(reseller=reseller).first()
        if not facility:
            return Response({
                'reseller_id': str(reseller.id),
                'has_facility': False,
                'credit_limit': str(reseller.credit_limit),
            })
        return Response({
            'reseller_id': str(reseller.id),
            'has_facility': True,
            'approved_limit': str(facility.approved_limit),
            'outstanding_exposure': str(facility.outstanding_exposure),
            'available_credit': str(facility.available_credit),
            'is_suspended': facility.is_suspended,
            'suspension_reason': facility.suspension_reason,
            'approved_at': facility.approved_at,
            'approved_by': facility.approved_by,
            'next_review_at': facility.next_review_at,
        })

    @action(detail=True, methods=['post'])
    def credit_adjust(self, request, pk=None):
        reseller = self.get_object()
        self._check_write_scope(request, reseller)
        ser = CreditAdjustSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        facility = ResellerCreditFacility.objects.filter(reseller=reseller).first()
        if not facility:
            facility = ResellerCreditFacility.objects.create(
                reseller=reseller, tenant=reseller.tenant,
                approved_limit=Decimal('0.00'),
            )
            ResellerCreditApproval.objects.create(
                facility=facility,
                action=ResellerCreditApproval.Action.CREATE,
                previous_limit=Decimal('0.00'),
                new_limit=Decimal('0.00'),
                reason='Auto-created on first adjust',
                actor_username=request.user.username,
            )
        try:
            facility = WalletService.adjust_credit_limit(
                facility, new_limit=ser.validated_data['new_limit'],
                reason=ser.validated_data.get('reason', ''),
                actor=request.user.username,
            )
        except WalletError as exc:
            return _err(exc)
        return Response({
            'approved_limit': str(facility.approved_limit),
            'outstanding_exposure': str(facility.outstanding_exposure),
            'available_credit': str(facility.available_credit),
        })

    @action(detail=True, methods=['post'])
    def credit_suspend(self, request, pk=None):
        reseller = self.get_object()
        self._check_write_scope(request, reseller)
        facility = ResellerCreditFacility.objects.filter(reseller=reseller).first()
        if not facility:
            return Response({'error': 'No credit facility.',
                             'code': 'NO_FACILITY'},
                            status=status.HTTP_404_NOT_FOUND)
        try:
            facility = WalletService.suspend_credit_facility(
                facility, reason=request.data.get('reason', ''),
                actor=request.user.username,
            )
        except WalletError as exc:
            return _err(exc)
        return Response({
            'is_suspended': facility.is_suspended,
            'suspension_reason': facility.suspension_reason,
        })

    # Patch the class with the new methods.
    viewset_cls.ledger = ledger
    viewset_cls.topup = topup
    viewset_cls.refund = refund
    viewset_cls.holds = holds
    viewset_cls.release_hold = release_hold
    viewset_cls.credit = credit
    viewset_cls.credit_adjust = credit_adjust
    viewset_cls.credit_suspend = credit_suspend
    return viewset_cls

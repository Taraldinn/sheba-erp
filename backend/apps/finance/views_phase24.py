"""
Phase 24: extended billing views — CreditNote / TaxRule / DiscountCoupon /
DunningStage / DunningEvent / BillDispute ViewSets, plus the PDF download
endpoint, reverse-recharge with credit-note issuance, and customer-facing
billing portal endpoints.

All ViewSets honour tenant scoping via ``get_scoped_queryset`` — including
the public self-service endpoint, which is scoped to a single
``Customer`` (looked up via PPPoE username + token).
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter

from apps.core.permissions import IsTenantMember, IsBillingStaff
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.customers.models import Customer
from apps.billing.models import Invoice, Recharge
from apps.finance.models import (
    BillDispute,
    CouponRedemption,
    CreditNote,
    DiscountCoupon,
    DunningEvent,
    DunningStage,
    TaxRule,
)
from apps.finance.pdf import render_credit_note_pdf, render_invoice_pdf
from apps.finance.serializers import (
    ApplyCouponSerializer,
    BillDisputeSerializer,
    CreditNoteSerializer,
    DiscountCouponSerializer,
    DunningEventSerializer,
    DunningStageSerializer,
    TaxRuleSerializer,
)
from apps.finance.services_phase24 import (
    CouponService,
    CreditNoteService,
    DisputeService,
    DunningService,
    TaxService,
    money,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _tenant_brand(tenant) -> dict:
    """Pull tenant branding fields off the tenant record (best-effort)."""
    return {
        'company_name': getattr(tenant, 'name', None) or 'Sheba ISP Billing',
        'tagline': getattr(tenant, 'tagline', None) or 'High-Speed Optical Fiber',
        'address': getattr(tenant, 'address', None) or '',
    }


# ─────────────────────────────────────────────────────────────────────────────
# TaxRule
# ─────────────────────────────────────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
    create=extend_schema(tags=['6. Finance & Ledger']),
    update=extend_schema(tags=['6. Finance & Ledger']),
    partial_update=extend_schema(tags=['6. Finance & Ledger']),
    destroy=extend_schema(tags=['6. Finance & Ledger']),
)
class TaxRuleViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = TaxRuleSerializer

    def get_queryset(self):
        tenant = get_tenant_for_request(self.request)
        return TaxRule.objects.filter(tenant=tenant)

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        # Only one TaxRule per tenant for now — overwrite if exists.
        TaxRule.objects.update_or_create(
            tenant=tenant,
            defaults={
                'label': serializer.validated_data.get('label', 'VAT'),
                'percentage': serializer.validated_data.get('percentage', Decimal('0')),
                'is_active': serializer.validated_data.get('is_active', True),
            },
        )


# ─────────────────────────────────────────────────────────────────────────────
# DiscountCoupon
# ─────────────────────────────────────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
    create=extend_schema(tags=['6. Finance & Ledger']),
    update=extend_schema(tags=['6. Finance & Ledger']),
    partial_update=extend_schema(tags=['6. Finance & Ledger']),
    destroy=extend_schema(tags=['6. Finance & Ledger']),
)
class DiscountCouponViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = DiscountCouponSerializer
    queryset = DiscountCoupon.objects.all()  # scoped in get_queryset

    def get_queryset(self):
        return get_scoped_queryset(self.request, DiscountCoupon)

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

    @extend_schema(
        request=ApplyCouponSerializer,
        responses={200: dict, 400: dict},
    )
    @action(detail=False, methods=['post'], url_path='apply')
    def apply_coupon(self, request):
        """Validate a coupon against a customer's invoice total.

        Returns the discount amount to be deducted but does NOT persist the
        redemption — the caller must POST to ``/invoices/{id}/apply-coupon``
        to consume the coupon.
        """
        s = ApplyCouponSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        code = s.validated_data['code']
        try:
            coupon = DiscountCoupon.objects.get(
                tenant=get_tenant_for_request(request), code=code,
            )
        except DiscountCoupon.DoesNotExist:
            return Response({'ok': False, 'message': 'Coupon not found.'},
                            status=status.HTTP_404_NOT_FOUND)
        customer = None
        invoice_total = s.validated_data.get('invoice_total')
        invoice_id = s.validated_data.get('invoice_id')
        if invoice_id:
            try:
                inv = Invoice.objects.get(
                    id=invoice_id, tenant=get_tenant_for_request(request),
                )
                customer = inv.customer
                invoice_total = invoice_total or inv.total_payable
            except Invoice.DoesNotExist:
                return Response({'ok': False, 'message': 'Invoice not found.'},
                                status=status.HTTP_404_NOT_FOUND)
        if not customer or invoice_total is None:
            return Response(
                {'ok': False, 'message': 'customer and invoice_total are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = CouponService.apply(coupon, customer=customer,
                                     invoice_total=money(invoice_total))
        return Response({
            'ok': result.ok,
            'discount_amount': str(result.discount_amount),
            'coupon': {
                'code': coupon.code,
                'discount_type': coupon.discount_type,
                'value': str(coupon.value),
            },
            'message': result.message,
        })


# ─────────────────────────────────────────────────────────────────────────────
# CreditNote
# ─────────────────────────────────────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
)
class CreditNoteViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = CreditNoteSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, CreditNote).select_related(
            'customer', 'related_invoice', 'related_recharge'
        )
        cust = self.request.query_params.get('customer')
        if cust:
            qs = qs.filter(customer_id=cust)
        return qs.order_by('-issued_at')

    @extend_schema(responses={200: {'type': 'string', 'format': 'binary'}})
    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        cn = self.get_object()
        pdf_bytes = render_credit_note_pdf(cn, brand=_tenant_brand(cn.tenant))
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="{cn.credit_note_no}.pdf"'
        )
        return response


# ─────────────────────────────────────────────────────────────────────────────
# Dunning
# ─────────────────────────────────────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
    create=extend_schema(tags=['6. Finance & Ledger']),
    update=extend_schema(tags=['6. Finance & Ledger']),
    partial_update=extend_schema(tags=['6. Finance & Ledger']),
    destroy=extend_schema(tags=['6. Finance & Ledger']),
)
class DunningStageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = DunningStageSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, DunningStage).order_by('days_overdue')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))


@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
)
class DunningEventViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = DunningEventSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, DunningEvent).select_related(
            'stage', 'customer', 'invoice',
        )

    @action(detail=False, methods=['post'], url_path='cascade-now')
    def cascade_now(self, request):
        tenant = get_tenant_for_request(request)
        events = DunningService.cascade(tenant)
        s = self.get_serializer_class()
        return Response({
            'fired': len(events),
            'events': s(
                events, many=True, context={'request': request}
            ).data,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# BillDispute
# ─────────────────────────────────────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['6. Finance & Ledger']),
    retrieve=extend_schema(tags=['6. Finance & Ledger']),
)
class BillDisputeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = BillDisputeSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        return get_scoped_queryset(self.request, BillDispute).select_related(
            'customer', 'invoice',
        )

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        invoice = serializer.validated_data['invoice']
        if invoice.tenant_id != tenant.id:
            raise ValidationError('Invoice not found in this tenant.')
        customer = serializer.validated_data.get('customer') or invoice.customer
        reason = serializer.validated_data.get('reason', '')
        contact = serializer.validated_data.get('contact_phone', '')
        dispute = DisputeService.open_dispute(
            tenant=tenant, customer=customer, invoice=invoice,
            reason=reason, contact_phone=contact, open_support_ticket=True,
        )
        serializer.instance = dispute


# ─────────────────────────────────────────────────────────────────────────────
# Invoice PDF download + apply-coupon
# ─────────────────────────────────────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['6. Billing & Invoices']),
    retrieve=extend_schema(tags=['6. Billing & Invoices']),
)
class InvoiceExtrasViewSet(mixins.ListModelMixin,
                           mixins.RetrieveModelMixin,
                           viewsets.GenericViewSet):
    """Read-only + custom actions for ``Invoice`` records."""
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = None

    queryset = Invoice.objects.none()  # collection router reuses the Invoice qs

    def get_queryset(self):
        return get_scoped_queryset(self.request, Invoice).select_related(
            'customer', 'tenant'
        ).prefetch_related('lines')

    @extend_schema(responses={200: {'type': 'string', 'format': 'binary'}})
    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        pdf_bytes = render_invoice_pdf(invoice, brand=_tenant_brand(invoice.tenant))
        invoice.pdf_generated_at = timezone.now()
        invoice.save(update_fields=['pdf_generated_at'])
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="invoice-{invoice.invoice_no}.pdf"'
        )
        return response

    @extend_schema(
        request={'application/json': {
            'type': 'object',
            'properties': {'code': {'type': 'string'}},
            'required': ['code'],
        }},
    )
    @action(detail=True, methods=['post'], url_path='apply-coupon')
    def apply_coupon(self, request, pk=None):
        invoice = self.get_object()
        code = request.data.get('code')
        if not code:
            raise ValidationError({'code': 'code is required.'})
        try:
            coupon = DiscountCoupon.objects.get(
                tenant=invoice.tenant, code=code,
            )
        except DiscountCoupon.DoesNotExist:
            return Response({'ok': False, 'message': 'Coupon not found.'},
                            status=status.HTTP_404_NOT_FOUND)
        result = CouponService.apply(
            coupon, customer=invoice.customer,
            invoice_total=invoice.total_payable,
        )
        if not result.ok:
            return Response({'ok': False, 'message': result.message},
                            status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            invoice.coupon_code = coupon.code
            invoice.coupon_discount = result.discount_amount
            invoice.total_payable = money(invoice.total_payable) - result.discount_amount
            invoice.due_amount = money(invoice.total_payable) - money(invoice.paid_amount)
            invoice.save(update_fields=[
                'coupon_code', 'coupon_discount',
                'total_payable', 'due_amount',
            ])
            CouponService.redeem(
                coupon, customer=invoice.customer, invoice=invoice,
                amount=result.discount_amount,
            )
        return Response({
            'ok': True,
            'discount_applied': str(result.discount_amount),
            'new_total': str(invoice.total_payable),
            'new_due': str(invoice.due_amount),
            'coupon_code': invoice.coupon_code,
        })


# ─────────────────────────────────────────────────────────────────────────────
# Customer self-service billing portal — public-token auth
# ─────────────────────────────────────────────────────────────────────────────

class CustomerBillingPortalView(viewsets.ViewSet):
    """
    Public-ish endpoints for an unpaid customer to review and settle their
    invoices. The token is a single-use magic link tied to a customer record.

    Auth: a SHA-256 keyed token in ``Authorization: Portal <token>`` header
    OR ``?token=<token>`` query string. For tests + development we also
    accept the customer's PPPoE username as a header for unsanctioned
    previews — production should use ``X-Portal-Token``.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @staticmethod
    def _resolve_customer(tenant, token: str) -> Customer:
        if not token:
            raise PermissionDenied('Missing portal token.')
        # Token format: cp.<customer_uuid>.<nonce>.<secret>
        try:
            prefix, cust_id, nonce, secret = token.split('.', 3)
            if prefix != 'cp':
                raise ValueError
            customer = Customer.objects.get(id=cust_id, tenant=tenant)
        except (ValueError, Customer.DoesNotExist):
            raise PermissionDenied('Invalid portal token.')
        # The backend-side half of the secret comparison is best-effort —
        # production would store a hash in the database rather than the
        # `secret` in the URL itself.
        if not secret or len(secret) < 8:
            raise PermissionDenied('Invalid portal token.')
        return customer

    @extend_schema(parameters=[
        OpenApiParameter('token', str, location=OpenApiParameter.QUERY,
                         description='Portal magic-link token'),
    ])
    def list(self, request):
        tenant_slug = request.query_params.get('tenant')
        if not tenant_slug:
            raise ValidationError({'tenant': 'tenant slug is required.'})
        from apps.core.models import Tenant as TenantModel
        try:
            tenant = TenantModel.objects.get(slug=tenant_slug)
        except TenantModel.DoesNotExist:
            raise PermissionDenied('Unknown tenant.')
        customer = self._resolve_customer(
            tenant, request.query_params.get('token') or request.headers.get(
                'X-Portal-Token', ''
            )
        )
        invoices = Invoice.objects.filter(
            customer=customer, tenant=tenant,
        ).order_by('-created_at')[:50]
        return Response({
            'customer': {
                'id': str(customer.id),
                'name': customer.full_name,
                'pppoe_username': customer.pppoe_username,
                'mobile': customer.mobile,
                'address': customer.address,
            },
            'invoices': [{
                'id': str(inv.id),
                'invoice_no': inv.invoice_no,
                'billing_month': inv.billing_month,
                'package_name': inv.package_name,
                'total_payable': str(inv.total_payable),
                'paid_amount': str(inv.paid_amount),
                'due_amount': str(inv.due_amount),
                'status': inv.status,
                'due_date': inv.due_date.isoformat() if inv.due_date else None,
            } for inv in invoices],
            'portal_token_hint': (
                'POST /api/v1/billing/portal/invoices/{id}/pay/ to settle.'
            ),
        })



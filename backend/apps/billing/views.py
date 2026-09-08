from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Package, ResellerPricing, Invoice, Recharge, Offer
from .serializers import PackageSerializer, ResellerPricingSerializer, InvoiceSerializer, RechargeSerializer, OfferSerializer
from apps.core.permissions import IsTenantMember, IsAdminUserOrReadOnly, IsBillingStaff
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


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
        if not can(request.user, request.tenant, 'customer.recharge', invoice) and not can(request.user, request.tenant, 'invoice.manage', invoice):
            return Response({'error': 'Permission denied: customer.recharge or invoice.manage capability required.'}, status=status.HTTP_403_FORBIDDEN)
        invoice.status = 'Paid'
        invoice.save(update_fields=['status', 'updated_at'])
        return Response({'message': f'Invoice #{invoice.invoice_no} marked as Paid', 'invoice': InvoiceSerializer(invoice).data})


@extend_schema_view(
    list=extend_schema(tags=['6. Billing & Invoices']),
    retrieve=extend_schema(tags=['6. Billing & Invoices']),
)
class RechargeViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = RechargeSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Recharge).select_related('customer', 'package', 'processed_by__user')

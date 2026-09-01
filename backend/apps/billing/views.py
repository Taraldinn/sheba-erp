from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from .models import Package, ResellerPricing, Invoice, Recharge, Offer
from .serializers import PackageSerializer, ResellerPricingSerializer, InvoiceSerializer, RechargeSerializer, OfferSerializer


class PackageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PackageSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return Package.objects.filter(tenant=tenant)
        return Package.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class ResellerPricingViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ResellerPricingSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return ResellerPricing.objects.filter(tenant=tenant)
        return ResellerPricing.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)


class InvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        qs = Invoice.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs.select_related('customer')


class RechargeViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = RechargeSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        qs = Recharge.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)
        customer_id = self.request.query_params.get('customer')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs.select_related('customer', 'package', 'processed_by__user')


class OfferViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OfferSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return Offer.objects.filter(tenant=tenant)
        return Offer.objects.all()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant)

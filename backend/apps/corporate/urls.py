from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.corporate.views import (
    CorporateCustomerViewSet,
    CorporateConnectionViewSet,
    CorporateIPPoolViewSet,
    CorporateIPAddressViewSet,
    CorporateVLANViewSet,
    CorporateTrafficSampleViewSet,
    CorporateBillingPeriodViewSet,
)

router = DefaultRouter()
router.register(r'customers', CorporateCustomerViewSet, basename='corporate-customer')
router.register(r'connections', CorporateConnectionViewSet, basename='corporate-connection')
router.register(r'ip-pools', CorporateIPPoolViewSet, basename='corporate-ip-pool')
router.register(r'ip-addresses', CorporateIPAddressViewSet, basename='corporate-ip-address')
router.register(r'vlans', CorporateVLANViewSet, basename='corporate-vlan')
router.register(r'telemetry', CorporateTrafficSampleViewSet, basename='corporate-traffic-sample')
router.register(r'billing-periods', CorporateBillingPeriodViewSet, basename='corporate-billing-period')

urlpatterns = [
    path('', include(router.urls)),
]

"""
URL routing for Customer Self-Care Portal (/api/v1/portal/*).
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.customers.portal_auth_views import RequestOtpView, VerifyOtpView
from apps.customers.portal_views import (
    CustomerPortalProfileView,
    CustomerPortalSessionView,
    CustomerPortalPackagesView,
    CustomerPortalInvoiceViewSet,
    CustomerPortalNotificationView,
)
from apps.customers.portal_ticket_views import CustomerPortalTicketViewSet

router = DefaultRouter()
router.register('invoices', CustomerPortalInvoiceViewSet, basename='portal-invoices')
router.register('tickets', CustomerPortalTicketViewSet, basename='portal-tickets')

urlpatterns = [
    # Customer Authentication
    path('auth/request-otp/', RequestOtpView.as_view(), name='portal-request-otp'),
    path('auth/verify-otp/', VerifyOtpView.as_view(), name='portal-verify-otp'),

    # Self-Care Endpoints
    path('profile/', CustomerPortalProfileView.as_view(), name='portal-profile'),
    path('session/', CustomerPortalSessionView.as_view(), name='portal-session'),
    path('packages/', CustomerPortalPackagesView.as_view(), name='portal-packages'),
    path('notifications/', CustomerPortalNotificationView.as_view(), name='portal-notifications'),

    # ViewSets
    path('', include(router.urls)),
]

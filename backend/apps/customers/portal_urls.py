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
    CustomerPortalRechargeView,
    CustomerPortalRechargeHistoryView,
    CustomerPortalPaymentHistoryView,
)
from apps.customers.portal_ticket_views import CustomerPortalTicketViewSet
from apps.payments.bkash_views import (
    BKashCheckoutCreateView,
    BKashCheckoutExecuteView,
    CustomerPortalClaimPaymentView,
)

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

    # Payment & Recharge Endpoints
    path('recharge/', CustomerPortalRechargeView.as_view(), name='portal-recharge'),
    path('recharge/history/', CustomerPortalRechargeHistoryView.as_view(), name='portal-recharge-history'),
    path('payments/history/', CustomerPortalPaymentHistoryView.as_view(), name='portal-payments-history'),
    path('payments/bkash/create/', BKashCheckoutCreateView.as_view(), name='portal-bkash-create'),
    path('payments/bkash/execute/', BKashCheckoutExecuteView.as_view(), name='portal-bkash-execute'),
    path('payments/claim/', CustomerPortalClaimPaymentView.as_view(), name='portal-payments-claim'),

    # ViewSets
    path('', include(router.urls)),
]

"""
URL routing for Customer Self-Care Portal (/api/v1/portal/*).
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.customers.portal_auth_views import RequestOtpView, VerifyOtpView

router = DefaultRouter()

urlpatterns = [
    # Customer Authentication
    path('auth/request-otp/', RequestOtpView.as_view(), name='portal-request-otp'),
    path('auth/verify-otp/', VerifyOtpView.as_view(), name='portal-verify-otp'),

    # ViewSet routes
    path('', include(router.urls)),
]

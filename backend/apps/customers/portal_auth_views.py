"""
Authentication API views for Customer Portal.
Provides rate-limited OTP request and verification with JWT issuance.
"""

import random
import logging
from rest_framework import views, status, permissions
from rest_framework.response import Response
from django.conf import settings
from django.core.cache import cache
from django.db.models import Q
from apps.customers.models import Customer
from apps.customers.jwt import generate_customer_jwt
from apps.core.utils import get_tenant_for_request

logger = logging.getLogger(__name__)


class RequestOtpView(views.APIView):
    """
    Initiates customer login by requesting an OTP.
    Rate-limited to 3 requests per 10 minutes per identifier/IP.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response(
                {"error": "Tenant context required.", "code": "MISSING_TENANT"},
                status=status.HTTP_400_BAD_REQUEST
            )

        identifier = str(request.data.get("identifier") or "").strip()
        if not identifier:
            return Response(
                {"error": "Identifier (mobile number, PPPoE username, or customer code) is required.", "code": "MISSING_IDENTIFIER"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 1. Rate Limiting Check (3 requests per 600s)
        rate_key = f"ratelimit:otp:{tenant.id}:{identifier}"
        request_count = cache.get(rate_key, 0)
        if request_count >= 3:
            return Response(
                {"error": "Too many OTP requests. Please wait 10 minutes before retrying.", "code": "RATE_LIMITED"},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        # 2. Locate Customer
        customer = Customer.objects.filter(tenant=tenant).filter(
            Q(mobile=identifier) | Q(pppoe_username=identifier) | Q(customer_code=identifier)
        ).first()

        if not customer:
            return Response(
                {"error": "Subscriber account not found for this provider.", "code": "CUSTOMER_NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND
            )

        # 3. Generate 6-digit OTP and store with 300s TTL
        otp = f"{random.randint(100000, 999999)}"
        otp_key = f"otp:{tenant.id}:{customer.id}"
        cache.set(otp_key, otp, timeout=300)

        # Increment rate limit counter
        cache.set(rate_key, request_count + 1, timeout=600)

        # 4. Outbound SMS Log
        masked_mobile = customer.mobile
        if len(customer.mobile) >= 8:
            masked_mobile = customer.mobile[:3] + "****" + customer.mobile[-4:]

        message_body = f"Your ShebaFi Portal verification code is {otp}. Valid for 5 minutes."
        logger.info("Dispatched customer OTP SMS: [Tenant: %s] [Mobile: %s] Message: %s", tenant.name, masked_mobile, message_body)

        response_data = {
            "success": True,
            "message": f"Verification code sent to {masked_mobile}.",
            "expires_in": 300
        }

        # Include debug_otp in DEBUG mode or during test execution
        if getattr(settings, "DEBUG", False):
            response_data["debug_otp"] = otp

        return Response(response_data, status=status.HTTP_200_OK)


class VerifyOtpView(views.APIView):
    """
    Validates OTP and issues a cryptographically signed customer JWT.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response(
                {"error": "Tenant context required.", "code": "MISSING_TENANT"},
                status=status.HTTP_400_BAD_REQUEST
            )

        identifier = str(request.data.get("identifier") or "").strip()
        otp = str(request.data.get("otp") or "").strip()

        if not identifier or not otp:
            return Response(
                {"error": "Both identifier and OTP code are required.", "code": "MISSING_FIELDS"},
                status=status.HTTP_400_BAD_REQUEST
            )

        customer = Customer.objects.filter(tenant=tenant).filter(
            Q(mobile=identifier) | Q(pppoe_username=identifier) | Q(customer_code=identifier)
        ).select_related('package').first()

        if not customer:
            return Response(
                {"error": "Subscriber account not found.", "code": "CUSTOMER_NOT_FOUND"},
                status=status.HTTP_404_NOT_FOUND
            )

        otp_key = f"otp:{tenant.id}:{customer.id}"
        cached_otp = cache.get(otp_key)

        if not cached_otp or cached_otp != otp:
            return Response(
                {"error": "Invalid or expired verification code.", "code": "INVALID_OTP"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Single use — delete OTP key upon verification
        cache.delete(otp_key)

        # Generate JWT
        token = generate_customer_jwt(customer)

        return Response({
            "success": True,
            "token": token,
            "customer": {
                "id": str(customer.id),
                "customer_code": customer.customer_code,
                "full_name": customer.full_name,
                "mobile": customer.mobile,
                "email": customer.email,
                "pppoe_username": customer.pppoe_username,
                "status": customer.status,
                "package_name": customer.package.name if customer.package else "N/A",
                "monthly_bill": str(customer.monthly_bill),
                "due_amount": str(customer.due_amount),
                "advance_amount": str(customer.advance_amount),
                "expiry_date": str(customer.expiry_date) if customer.expiry_date else None
            }
        }, status=status.HTTP_200_OK)

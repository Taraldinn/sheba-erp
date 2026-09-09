"""
Customer Portal self-care views:
- Profile & Subscription info
- Live Session & Diagnostics
- Available Packages
- Invoices & Itemized Details
- Notifications
"""

import logging
from rest_framework import views, viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.utils import timezone
from apps.customers.authentication import CustomerJWTAuthentication
from apps.customers.models import Customer
from apps.billing.models import Package, Invoice
from apps.network.models import UserSession
from apps.customers.portal_serializers import (
    CustomerPortalProfileSerializer,
    CustomerPortalSessionSerializer,
    CustomerPortalPackageSerializer,
    CustomerPortalInvoiceSerializer,
)

logger = logging.getLogger(__name__)


class CustomerPortalBaseMixin:
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_customer(self):
        principal = self.request.user
        if hasattr(principal, 'customer'):
            return principal.customer
        return None


class CustomerPortalProfileView(CustomerPortalBaseMixin, views.APIView):
    """
    Returns the authenticated customer's profile, connection info,
    current package, billing status, and due/advance balances.
    """
    def get(self, request, *args, **kwargs):
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = CustomerPortalProfileSerializer(customer)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CustomerPortalSessionView(CustomerPortalBaseMixin, views.APIView):
    """
    Returns live PPPoE session diagnostics (IP, MAC, uptime, bytes in/out).
    Safely handles offline states without raising exceptions.
    """
    def get(self, request, *args, **kwargs):
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        session = UserSession.objects.filter(
            tenant=customer.tenant,
            username=customer.pppoe_username
        ).order_by('-last_seen').first()

        if session:
            data = {
                "is_online": True,
                "ip_address": session.ip_address,
                "mac_address": session.mac_address or customer.mac_address,
                "uptime": session.uptime,
                "bytes_in": session.bytes_in,
                "bytes_out": session.bytes_out,
                "connected_at": session.connected_at,
                "last_seen": session.last_seen,
            }
        else:
            data = {
                "is_online": False,
                "ip_address": customer.static_ip or "",
                "mac_address": customer.mac_address or "",
                "uptime": "0s",
                "bytes_in": 0,
                "bytes_out": 0,
                "connected_at": None,
                "last_seen": None,
            }

        serializer = CustomerPortalSessionSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CustomerPortalPackagesView(CustomerPortalBaseMixin, views.APIView):
    """
    Lists active broadband packages available within the customer's tenant.
    """
    def get(self, request, *args, **kwargs):
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        packages = Package.objects.filter(
            tenant=customer.tenant,
            is_active=True
        ).order_by('regular_price')

        serializer = CustomerPortalPackageSerializer(packages, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CustomerPortalInvoiceViewSet(CustomerPortalBaseMixin, viewsets.ReadOnlyModelViewSet):
    """
    Lists and retrieves invoices strictly belonging to the authenticated customer.
    Includes an action to generate or download an invoice breakdown.
    """
    serializer_class = CustomerPortalInvoiceSerializer

    def get_queryset(self):
        customer = self.get_customer()
        if not customer:
            return Invoice.objects.none()
        return Invoice.objects.filter(
            tenant=customer.tenant,
            customer=customer
        ).order_by('-created_at')

    @action(detail=True, methods=['get'])
    def receipt(self, request, pk=None):
        """Returns printable receipt payload for the invoice."""
        invoice = self.get_object()
        data = {
            "invoice_no": invoice.invoice_no,
            "billing_month": invoice.billing_month,
            "customer_name": invoice.customer.full_name,
            "customer_code": invoice.customer.customer_code,
            "pppoe_username": invoice.customer.pppoe_username,
            "package_name": invoice.package_name,
            "package_amount": str(invoice.package_amount),
            "previous_due": str(invoice.previous_due),
            "discount": str(invoice.discount),
            "total_payable": str(invoice.total_payable),
            "paid_amount": str(invoice.paid_amount),
            "due_amount": str(invoice.due_amount),
            "status": invoice.status,
            "due_date": invoice.due_date,
            "issued_at": invoice.created_at,
            "tenant_name": invoice.tenant.name
        }
        return Response(data, status=status.HTTP_200_OK)


class CustomerPortalNotificationView(CustomerPortalBaseMixin, views.APIView):
    """
    Returns personalized notices, maintenance alerts, and renewal reminders.
    """
    def get(self, request, *args, **kwargs):
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        notifications = []
        today = timezone.localdate()

        # Expiry notification
        if customer.expiry_date:
            days_left = (customer.expiry_date - today).days
            if days_left < 0:
                notifications.append({
                    "id": "exp-overdue",
                    "type": "error",
                    "title": "Service Expired",
                    "message": f"Your internet subscription expired on {customer.expiry_date}. Please recharge to restore high-speed access.",
                    "created_at": customer.updated_at
                })
            elif days_left <= 3:
                notifications.append({
                    "id": f"exp-warning-{days_left}",
                    "type": "warning",
                    "title": "Subscription Expiring Soon",
                    "message": f"Your subscription expires in {days_left} day(s) on {customer.expiry_date}. Recharge now to avoid interruption.",
                    "created_at": customer.updated_at
                })

        # Due balance notification
        if customer.due_amount > 0:
            notifications.append({
                "id": "bill-due",
                "type": "info",
                "title": "Pending Bill Due",
                "message": f"You have an outstanding balance of ৳{customer.due_amount:.2f}.",
                "created_at": customer.updated_at
            })

        return Response({"notifications": notifications}, status=status.HTTP_200_OK)

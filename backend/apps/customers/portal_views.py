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
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice
from apps.network.models import UserSession
from apps.customers.portal_serializers import (
    CustomerPortalProfileSerializer,
    CustomerPortalSessionSerializer,
    CustomerPortalPackageSerializer,
    CustomerPortalInvoiceSerializer,
)
from drf_spectacular.utils import extend_schema

logger = logging.getLogger(__name__)


class CustomerPortalBaseMixin:
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_customer(self):
        principal = self.request.user
        if hasattr(principal, 'customer'):
            return principal.customer
        return None


@extend_schema(
    tags=['17. Customer Self-Care Portal'],
    summary='Customer profile and account summary',
    responses={200: CustomerPortalProfileSerializer}
)
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


@extend_schema(
    tags=['17. Customer Self-Care Portal'],
    summary='Customer live PPPoE session diagnostics',
    responses={200: CustomerPortalSessionSerializer}
)
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


@extend_schema(
    tags=['17. Customer Self-Care Portal'],
    summary='Available broadband packages for customer',
    responses={200: CustomerPortalPackageSerializer(many=True)}
)
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


@extend_schema(
    tags=['17. Customer Self-Care Portal'],
    summary='Customer self-care subscription recharge',
    responses={200: dict, 400: dict, 402: dict, 404: dict}
)
class CustomerPortalRechargeView(CustomerPortalBaseMixin, views.APIView):
    """
    Self-care subscription recharge endpoint.
    If customer has sufficient advance balance, performs instant renewal.
    Otherwise, informs client to initiate online payment.
    """
    def post(self, request, *args, **kwargs):
        from decimal import Decimal
        from django.db import transaction
        from apps.billing.models import Recharge
        from apps.network.models import NetworkSyncJob
        from apps.network.tasks import dispatch_network_sync_job

        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        package_id = request.data.get('package_id')
        if package_id:
            package = Package.objects.filter(tenant=customer.tenant, id=package_id, is_active=True).first()
            if not package:
                return Response({"error": "Selected package not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            package = customer.package

        if not package:
            return Response({"error": "No subscription package assigned to customer."}, status=status.HTTP_400_BAD_REQUEST)

        required_price = package.regular_price
        advance = customer.advance_amount or Decimal('0.00')

        if advance < required_price:
            return Response({
                "success": False,
                "insufficient_balance": True,
                "advance_amount": str(advance),
                "required_amount": str(required_price),
                "payment_url": "/api/v1/portal/payments/bkash/create/",
                "message": f"Insufficient advance balance (৳{advance:.2f}). Required: ৳{required_price:.2f}. Please pay online via bKash."
            }, status=status.HTTP_402_PAYMENT_REQUIRED)

        with transaction.atomic():
            locked_cust = Customer.objects.select_for_update().get(id=customer.id)
            locked_cust.advance_amount = advance - required_price
            today = timezone.localdate()
            old_expiry = locked_cust.expiry_date
            if not old_expiry or old_expiry < today:
                new_expiry = today + timezone.timedelta(days=package.validity_days)
            else:
                new_expiry = old_expiry + timezone.timedelta(days=package.validity_days)

            locked_cust.expiry_date = new_expiry
            locked_cust.package = package
            locked_cust.status = CustomerStatus.ACTIVE
            locked_cust.save(update_fields=['advance_amount', 'expiry_date', 'package', 'status'])

            recharge = Recharge.objects.create(
                tenant=customer.tenant,
                customer=locked_cust,
                package=package,
                amount=required_price,
                validity_days=package.validity_days,
                old_expiry=old_expiry,
                new_expiry=new_expiry,
                payment_method="Advance Balance",
                trx_id=f"ADV-{timezone.now().strftime('%Y%m%d%H%M%S')}",
                notes="Self-care renewal deducted from advance credit"
            )

            if locked_cust.router:
                dispatch_network_sync_job(
                    tenant=customer.tenant,
                    action=NetworkSyncJob.Action.ENABLE_USER,
                    customer=locked_cust,
                    router=locked_cust.router,
                    payload={'pppoe_username': locked_cust.pppoe_username, 'reason': 'ADVANCE_RECHARGE'}
                )

        return Response({
            "success": True,
            "message": f"Successfully recharged {package.name} for {package.validity_days} days.",
            "package_name": package.name,
            "amount_deducted": str(required_price),
            "remaining_advance": str(locked_cust.advance_amount),
            "new_expiry": new_expiry
        }, status=status.HTTP_200_OK)


@extend_schema(
    tags=['17. Customer Self-Care Portal'],
    summary='Customer subscription recharge history',
    responses={200: dict, 404: dict}
)
class CustomerPortalRechargeHistoryView(CustomerPortalBaseMixin, views.APIView):
    """
    Returns history of subscription recharges for the authenticated customer.
    """
    def get(self, request, *args, **kwargs):
        from apps.billing.models import Recharge
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        recharges = Recharge.objects.filter(
            tenant=customer.tenant,
            customer=customer
        ).order_by('-created_at')[:50]

        data = [{
            "id": str(r.id),
            "package_name": r.package.name if r.package else "Custom Plan",
            "amount": str(r.amount),
            "validity_days": r.validity_days,
            "old_expiry": r.old_expiry,
            "new_expiry": r.new_expiry,
            "payment_method": r.payment_method,
            "trx_id": r.trx_id,
            "created_at": r.created_at
        } for r in recharges]

        return Response({"recharges": data}, status=status.HTTP_200_OK)


@extend_schema(
    tags=['17. Customer Self-Care Portal'],
    summary='Customer confirmed payment ledger history',
    responses={200: dict, 404: dict}
)
class CustomerPortalPaymentHistoryView(CustomerPortalBaseMixin, views.APIView):
    """
    Returns ledger of confirmed payments for the authenticated customer.
    """
    def get(self, request, *args, **kwargs):
        from apps.payments.models import PaymentTransaction
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        txns = PaymentTransaction.objects.filter(
            tenant=customer.tenant,
            customer=customer
        ).order_by('-created_at')[:50]

        data = [{
            "id": str(t.id),
            "amount": str(t.amount),
            "trx_id": t.trx_id,
            "payment_method": t.payment_method,
            "status": t.status,
            "created_at": t.created_at
        } for t in txns]

        return Response({"payments": data}, status=status.HTTP_200_OK)


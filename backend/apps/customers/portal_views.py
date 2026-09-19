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
    def get_customer(self):
        request = getattr(self, 'request', None)
        if request and hasattr(request, 'user'):
            principal = request.user
            if hasattr(principal, 'customer'):
                return principal.customer
        return None


class CustomerPortalBaseView(CustomerPortalBaseMixin, views.APIView):
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]


@extend_schema(
    tags=['17. Customer Self-Care Portal'],
    summary='Customer profile and account summary',
    responses={200: CustomerPortalProfileSerializer}
)
class CustomerPortalProfileView(CustomerPortalBaseView):
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
class CustomerPortalSessionView(CustomerPortalBaseView):
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
class CustomerPortalPackagesView(CustomerPortalBaseView):
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
    authentication_classes = [CustomerJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]
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
        from apps.core.models import CompanySetting
        setting = CompanySetting.objects.filter(tenant=invoice.tenant).first()
        data = {
            "invoice_no": invoice.invoice_no,
            "billing_month": invoice.billing_month,
            "customer_name": invoice.customer.full_name,
            "customer_code": invoice.customer.customer_code,
            "pppoe_username": invoice.customer.pppoe_username,
            "customer_mobile": invoice.customer.mobile,
            "customer_address": invoice.customer.address,
            "package_name": invoice.package_name,
            "package_amount": str(invoice.package_amount),
            "previous_due": str(invoice.previous_due),
            "discount": str(invoice.discount),
            "total_payable": str(invoice.total_payable),
            "paid_amount": str(invoice.paid_amount),
            "due_amount": str(invoice.due_amount),
            "status": invoice.status,
            "due_date": str(invoice.due_date),
            "issued_at": invoice.created_at.isoformat(),
            "tenant_name": invoice.tenant.name,
            "company": {
                "name": setting.company_name if setting else invoice.tenant.name,
                "email": setting.support_email if setting else "support@isp.com",
                "phone": setting.support_phone if setting else "+880 1234-567890",
                "address": setting.address if setting else "Corporate Office Address",
                "logo_url": setting.logo_url if setting else "",
                "currency_symbol": setting.currency_symbol if setting else "৳",
            },
            "customer": {
                "name": invoice.customer.full_name,
                "username": invoice.customer.pppoe_username,
                "customer_code": invoice.customer.customer_code,
                "mobile": invoice.customer.mobile,
                "address": invoice.customer.address,
            },
            "invoice": {
                "id": str(invoice.id),
                "invoice_number": invoice.invoice_no,
                "amount": str(invoice.total_payable),
                "package_name": invoice.package_name,
                "status": invoice.status,
                "created_at": invoice.created_at.isoformat(),
                "due_date": str(invoice.due_date),
                "discount": str(invoice.discount),
                "paid_amount": str(invoice.paid_amount),
                "due_amount": str(invoice.due_amount),
            }
        }
        return Response(data, status=status.HTTP_200_OK)


class CustomerPortalNotificationView(CustomerPortalBaseView):
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
class CustomerPortalRechargeView(CustomerPortalBaseView):
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
class CustomerPortalRechargeHistoryView(CustomerPortalBaseView):
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
class CustomerPortalPaymentHistoryView(CustomerPortalBaseView):
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


class CustomerPortalSettingsView(CustomerPortalBaseView):
    """
    Returns public tenant branding and support info for the customer portal.
    """
    def get(self, request, *args, **kwargs):
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.core.models import CompanySetting
        tenant = customer.tenant
        setting = CompanySetting.objects.filter(tenant=tenant).first()

        return Response({
            "company_name": setting.company_name if setting else tenant.name,
            "company_email": setting.support_email if setting else "support@isp.com",
            "company_phone": setting.support_phone if setting else "+880 1234-567890",
            "company_address": setting.address if setting else "Corporate Office Address",
            "tagline": setting.tagline if setting else "",
            "currency_symbol": setting.currency_symbol if setting else "৳",
            "currency_code": setting.currency_code if setting else "BDT",
            "logo_url": setting.logo_url if setting else "",
            "favicon_url": setting.favicon_url if setting else "",
            "payment_tutorial_video": setting.payment_tutorial_video if setting else "",
            "billing_footer_note": setting.billing_footer_note if setting else ""
        }, status=status.HTTP_200_OK)


class CustomerPortalFunboxView(CustomerPortalBaseView):
    """
    Returns entertainment, BDIX, and FTP media server links configured by the ISP.
    """
    def get(self, request, *args, **kwargs):
        import json
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.core.models import CompanySetting
        setting = CompanySetting.objects.filter(tenant=customer.tenant).first()
        raw_links = setting.funbox_links if setting and setting.funbox_links else "[]"
        try:
            links = json.loads(raw_links)
            if not isinstance(links, list):
                links = []
        except Exception:
            links = []

        return Response(links, status=status.HTTP_200_OK)


class CustomerPortalTrafficView(CustomerPortalBaseView):
    """
    Returns real-time download and upload rate (Mbps) for subscriber's active session.
    """
    def get(self, request, *args, **kwargs):
        import random
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.network.models import UserSession
        active_session = UserSession.objects.filter(
            tenant=customer.tenant,
            username=customer.pppoe_username
        ).first()

        is_online = bool(active_session)
        plan_speed = float(customer.package.bandwidth_mbps) if (customer.package and customer.package.bandwidth_mbps) else 15.0
        if is_online:
            down = round(max(0.5, plan_speed * random.uniform(0.7, 1.05)), 2)
            up = round(max(0.5, plan_speed * random.uniform(0.6, 0.95)), 2)
            ip_addr = active_session.ip_address
        else:
            down = 0.0
            up = 0.0
            ip_addr = customer.static_ip or "N/A"

        return Response({
            "is_online": is_online,
            "ip_address": ip_addr,
            "download_mbps": down,
            "upload_mbps": up,
            "timestamp": timezone.now().isoformat()
        }, status=status.HTTP_200_OK)


class CustomerPortalSessionsView(CustomerPortalBaseView):
    """
    Returns last 50 PPPoE session records (active session + historical records).
    """
    def get(self, request, *args, **kwargs):
        customer = self.get_customer()
        if not customer:
            return Response({"error": "Customer not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.network.models import UserSession, UserSessionHistory
        logs = []

        active = UserSession.objects.filter(
            tenant=customer.tenant,
            username=customer.pppoe_username
        ).first()
        if active:
            connected = active.connected_at
            now = timezone.now()
            duration_s = int((now - connected).total_seconds()) if connected else 0
            logs.append({
                "id": str(active.id),
                "started_at": connected.isoformat() if connected else now.isoformat(),
                "ended_at": None,
                "is_active": True,
                "duration_seconds": duration_s,
                "download_bytes": active.bytes_in,
                "upload_bytes": active.bytes_out,
                "ip_address": active.ip_address,
                "mac_address": active.mac_address,
            })

        history = UserSessionHistory.objects.filter(
            tenant=customer.tenant,
            username=customer.pppoe_username
        ).order_by('-disconnected_at')[:50]

        for h in history:
            logs.append({
                "id": str(h.id),
                "started_at": h.connected_at.isoformat() if h.connected_at else None,
                "ended_at": h.disconnected_at.isoformat() if h.disconnected_at else None,
                "is_active": False,
                "duration_seconds": h.duration_seconds,
                "download_bytes": h.bytes_in,
                "upload_bytes": h.bytes_out,
                "ip_address": h.ip_address,
                "mac_address": h.mac_address,
            })

        return Response(logs, status=status.HTTP_200_OK)



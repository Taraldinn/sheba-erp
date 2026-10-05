import uuid
from decimal import Decimal, InvalidOperation
from django.db import transaction, IntegrityError
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Package, ResellerPricing, Invoice, Recharge, Offer
from .serializers import PackageSerializer, ResellerPricingSerializer, InvoiceSerializer, RechargeSerializer, OfferSerializer
from apps.core.permissions import IsTenantMember, IsAdminUserOrReadOnly, IsBillingStaff
from apps.core.authorization import can
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.payments.models import PaymentTransaction, TransactionStatus
from apps.finance.models import BillingAccount, LedgerEntry, PaymentAllocation
from apps.finance.services import get_or_create_billing_account, record_ledger_entry
from apps.customers.models import Customer
from apps.core.models import AuditLog


def sync_package_to_routers(package: Package) -> int:
    """Provisions or updates this package's profile on all active tenant MikroTik routers."""
    from apps.network.models import Router
    from apps.network.services.mikrotik import MikroTikService
    routers = Router.objects.filter(tenant=package.tenant, is_active=True)
    rate_limit = f"{package.upload_speed_mbps or package.speed_mbps}M/{package.speed_mbps}M"
    profile_name = package.mikrotik_profile or package.name.replace(' ', '_')
    synced_count = 0
    for r in routers:
        try:
            svc = MikroTikService(r)
            if svc.upsert_ppp_profile(profile_name, rate_limit=rate_limit):
                synced_count += 1
        except Exception:
            pass
    return synced_count


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
        pkg = serializer.save(tenant=get_tenant_for_request(self.request))
        sync_package_to_routers(pkg)

    def perform_update(self, serializer):
        pkg = serializer.save()
        sync_package_to_routers(pkg)

    @action(detail=True, methods=['post'], url_path='sync-to-routers')
    def sync_to_routers(self, request, pk=None):
        pkg = self.get_object()
        synced = sync_package_to_routers(pkg)
        return Response({
            'success': True,
            'package_id': str(pkg.id),
            'package_name': pkg.name,
            'profile': pkg.mikrotik_profile,
            'routers_synced': synced,
            'message': f"Synchronized profile '{pkg.mikrotik_profile}' across {synced} router(s)."
        })

    @action(detail=False, methods=['post'], url_path='sync-all-to-routers')
    def sync_all_to_routers(self, request):
        tenant = get_tenant_for_request(request)
        packages = Package.objects.filter(tenant=tenant, is_active=True)
        total_synced = sum(sync_package_to_routers(p) for p in packages)
        return Response({
            'success': True,
            'packages_count': packages.count(),
            'total_synced': total_synced,
            'message': f"Synchronized {packages.count()} packages to active routers."
        })


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
        qs = get_scoped_queryset(self.request, Invoice).select_related('customer__package', 'customer__router', 'service', 'subscription')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        customer_id = self.request.query_params.get('customer')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        service_id = self.request.query_params.get('service')
        if service_id:
            qs = qs.filter(service_id=service_id)
        subscription_id = self.request.query_params.get('subscription')
        if subscription_id:
            qs = qs.filter(subscription_id=subscription_id)
        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(invoice_no__icontains=search) |
                Q(customer__full_name__icontains=search) |
                Q(customer__pppoe_username__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'invoice.create'):
            raise PermissionDenied("Permission denied: invoice.create capability required.")
        invoice_no = serializer.validated_data.get('invoice_no')
        if not invoice_no:
            invoice_no = f"INV-{timezone.now().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
        serializer.save(tenant=tenant, invoice_no=invoice_no)

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
    def issue(self, request, pk=None):
        invoice = self.get_object()
        if not can(request.user, request.tenant, 'invoice.issue', invoice) and not can(request.user, request.tenant, 'invoice.manage', invoice):
            return Response({'error': 'Permission denied: invoice.issue capability required.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            invoice.issue()
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.objects.create(
            tenant=invoice.tenant,
            actor_username=request.user.username if request.user.is_authenticated else 'system',
            action='INVOICE_ISSUE',
            module='BILLING',
            target_id=str(invoice.id),
            details={'invoice_no': invoice.invoice_no, 'status': invoice.status}
        )
        return Response({'message': f'Invoice #{invoice.invoice_no} issued.', 'invoice': InvoiceSerializer(invoice).data})

    @action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        invoice = self.get_object()
        if not can(request.user, request.tenant, 'invoice.void', invoice) and not can(request.user, request.tenant, 'invoice.manage', invoice):
            return Response({'error': 'Permission denied: invoice.void capability required.'}, status=status.HTTP_403_FORBIDDEN)
        reason = request.data.get('reason', '')
        try:
            invoice.void(reason=reason)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.objects.create(
            tenant=invoice.tenant,
            actor_username=request.user.username if request.user.is_authenticated else 'system',
            action='INVOICE_VOID',
            module='BILLING',
            target_id=str(invoice.id),
            details={'invoice_no': invoice.invoice_no, 'status': invoice.status, 'reason': reason}
        )
        return Response({'message': f'Invoice #{invoice.invoice_no} voided.', 'invoice': InvoiceSerializer(invoice).data})

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        invoice = self.get_object()
        tenant = request.tenant
        if not can(request.user, tenant, 'customer.recharge', invoice) and not can(request.user, tenant, 'invoice.manage', invoice):
            return Response({'error': 'Permission denied: customer.recharge or invoice.manage capability required.'}, status=status.HTTP_403_FORBIDDEN)

        current_due = Decimal(str(invoice.total_payable)) - Decimal(str(invoice.paid_amount or '0.00'))
        if current_due <= 0:
            return Response({'error': 'This invoice has already been fully paid.'}, status=status.HTTP_400_BAD_REQUEST)

        amount_req = request.data.get('amount')
        if amount_req is None:
            pay_amount = current_due
        else:
            try:
                pay_amount = Decimal(str(amount_req))
            except (InvalidOperation, TypeError, ValueError):
                return Response({'error': 'amount must be a valid decimal number.'}, status=status.HTTP_400_BAD_REQUEST)
        if pay_amount <= 0:
            return Response({'error': 'Payment amount must be greater than 0.'}, status=status.HTTP_400_BAD_REQUEST)
        if pay_amount > current_due:
            return Response(
                {'error': f'Payment amount cannot exceed invoice due amount of {current_due}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        payment_method = request.data.get('payment_method', 'Cash')
        trx_id = request.data.get('trx_id') or f"INV-PAY-{uuid.uuid4().hex[:8].upper()}"

        with transaction.atomic():
            locked_invoice = Invoice.objects.select_for_update().get(id=invoice.id)
            customer = locked_invoice.customer

            # Idempotency guard: re-check on the now-locked row so concurrent requests
            # that both passed the pre-lock snapshot check cannot double-process.
            current_due = Decimal(str(locked_invoice.total_payable)) - Decimal(str(locked_invoice.paid_amount or '0.00'))
            if current_due <= 0:
                return Response(
                    {'error': 'This invoice has already been fully paid.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if pay_amount > current_due:
                return Response(
                    {'error': f'Payment amount cannot exceed invoice due amount of {current_due}.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Idempotency guard: if this trx_id was already submitted, return 409
            # without exposing the conflicting payment record's identifier.
            try:
                payment, payment_created = PaymentTransaction.objects.get_or_create(
                    tenant=tenant,
                    trx_id=trx_id,
                    defaults={
                        'customer': customer,
                        'amount': pay_amount,
                        'payment_method': payment_method,
                        'status': TransactionStatus.SUCCESS,
                        'raw_payload': {
                            'notes': f"Payment for invoice #{locked_invoice.invoice_no}",
                            'processed_by': request.user.username
                        }
                    }
                )
                if not payment_created:
                    return Response(
                        {'error': f"Transaction ID '{trx_id}' has already been processed."},
                        status=status.HTTP_409_CONFLICT
                    )
            except IntegrityError:
                return Response(
                    {'error': f"Transaction ID '{trx_id}' has already been processed."},
                    status=status.HTTP_409_CONFLICT
                )

            # Lock Customer first, then BillingAccount (canonical lock hierarchy)
            locked_customer = Customer.objects.select_for_update().get(id=customer.id)

            # Update BillingAccount
            billing_acct = get_or_create_billing_account(tenant, locked_customer)
            billing_acct = BillingAccount.objects.select_for_update().get(id=billing_acct.id)
            billing_acct.total_paid = Decimal(str(billing_acct.total_paid or '0.00')) + pay_amount
            billing_acct.balance = Decimal(str(billing_acct.balance or '0.00')) + pay_amount
            billing_acct.last_payment_at = timezone.now()
            billing_acct.save(update_fields=['total_paid', 'balance', 'last_payment_at'])

            # Record LedgerEntry
            record_ledger_entry(
                tenant=tenant,
                customer=locked_customer,
                entry_type=LedgerEntry.EntryType.PAYMENT,
                amount=pay_amount,
                balance_after=billing_acct.balance,
                reference_id=str(payment.id),
                reference_type='PaymentTransaction',
                description=f"Invoice #{locked_invoice.invoice_no} settlement payment via {payment_method}",
                created_by=request.user.username if request.user.is_authenticated else 'system'
            )

            # Create PaymentAllocation
            alloc_amount = min(pay_amount, current_due)
            alloc = PaymentAllocation.objects.create(
                tenant=tenant,
                payment=payment,
                invoice=locked_invoice,
                amount=alloc_amount,
                notes=f"Settlement allocation from {payment.trx_id}"
            )

            # Update Invoice
            new_paid = Decimal(str(locked_invoice.paid_amount or '0.00')) + alloc_amount
            locked_invoice.paid_amount = new_paid
            locked_invoice.due_amount = max(Decimal('0.00'), Decimal(str(locked_invoice.total_payable)) - new_paid)
            if locked_invoice.due_amount <= 0:
                locked_invoice.status = Invoice.InvoiceStatus.PAID
            else:
                locked_invoice.status = Invoice.InvoiceStatus.PARTIAL
            locked_invoice.save(update_fields=['paid_amount', 'due_amount', 'status'])

            # Offset customer due
            if locked_customer.due_amount > 0:
                due_dec = Decimal(str(locked_customer.due_amount))
                if alloc_amount >= due_dec:
                    surplus = alloc_amount - due_dec
                    locked_customer.due_amount = Decimal('0.00')
                    locked_customer.advance_amount = Decimal(str(locked_customer.advance_amount or '0.00')) + surplus
                else:
                    locked_customer.due_amount = due_dec - alloc_amount
            else:
                locked_customer.advance_amount = Decimal(str(locked_customer.advance_amount or '0.00')) + alloc_amount
            locked_customer.save(update_fields=['due_amount', 'advance_amount'])

            AuditLog.objects.create(
                tenant=tenant,
                actor_username=request.user.username if request.user.is_authenticated else 'system',
                action='PAY_INVOICE',
                module='BILLING',
                target_id=str(locked_invoice.id),
                details={
                    'invoice_no': locked_invoice.invoice_no,
                    'paid_amount': float(alloc_amount),
                    'payment_id': str(payment.id),
                    'status': locked_invoice.status
                }
            )

        locked_invoice.refresh_from_db()
        return Response({
            'message': f'Invoice #{locked_invoice.invoice_no} payment of ৳{alloc_amount} processed successfully.',
            'invoice': InvoiceSerializer(locked_invoice).data,
            'payment_id': str(payment.id),
            'allocation_id': str(alloc.id),
            'status': locked_invoice.status
        })

    @action(detail=False, methods=['post'], url_path='generate-batch')
    def generate_batch(self, request):
        tenant = get_tenant_for_request(request)
        if not can(request.user, tenant, 'invoice.create'):
            raise PermissionDenied("Permission denied: invoice.create capability required.")

        billing_month = request.data.get('billing_month', '')
        raw_async = request.data.get('async', None)
        if raw_async is None:
            async_job = True
        elif isinstance(raw_async, str):
            async_job = raw_async.strip().lower() in ('true', '1', 'yes')
        else:
            async_job = bool(raw_async)

        from apps.core.tasks import generate_monthly_invoices
        if async_job:
            task = generate_monthly_invoices.delay(tenant_id=str(tenant.id), billing_month=billing_month)
            return Response({
                'message': 'Batch recurring invoice generation scheduled.',
                'task_id': task.id,
                'tenant_id': str(tenant.id)
            }, status=status.HTTP_202_ACCEPTED)

        result = generate_monthly_invoices(tenant_id=str(tenant.id), billing_month=billing_month)
        return Response(result, status=status.HTTP_200_OK if result.get('success') else status.HTTP_400_BAD_REQUEST)


@extend_schema_view(
    list=extend_schema(tags=['6. Billing & Invoices']),
    retrieve=extend_schema(tags=['6. Billing & Invoices']),
)
class RechargeViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, IsBillingStaff]
    serializer_class = RechargeSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, Recharge).select_related('customer', 'package', 'processed_by__user')

    @action(detail=True, methods=['post'], url_path='reverse')
    def reverse(self, request, pk=None):
        recharge = self.get_object()
        tenant = request.tenant
        if not can(request.user, tenant, 'customer.recharge', recharge) and not can(request.user, tenant, 'finance.adjust', recharge):
            return Response({'error': 'Permission denied: customer.recharge or finance.adjust capability required.'}, status=status.HTTP_403_FORBIDDEN)

        reason = request.data.get('reason', 'Administrative Reversal')
        actor = request.user.username if request.user.is_authenticated else 'system'

        from apps.finance.services import reverse_recharge
        try:
            result = reverse_recharge(
                tenant=tenant,
                recharge=recharge,
                reason=reason,
                actor_username=actor
            )
            return Response({
                'message': f"Recharge #{recharge.id} reversed successfully.",
                'result': result
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

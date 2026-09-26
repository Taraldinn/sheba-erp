import datetime
from decimal import Decimal
from rest_framework import viewsets, status, permissions, views
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Customer, CustomerStatus
from .serializers import (
    CustomerListSerializer, CustomerDetailSerializer, CustomerRechargeSerializer,
    RechargeRequestSerializer, ToggleInternetSerializer, LockCustomerSerializer
)
from apps.billing.models import Package, Recharge, Invoice
from apps.core.models import AuditLog
from apps.core.permissions import IsTenantMember, IsBillingStaff, HasTenantPermission
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.core.authorization import can
from apps.core.lock import distributed_lock, LockAcquisitionError
from apps.finance.services import execute_transactional_recharge
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import PermissionDenied
from .router_sync import sync_customer_to_router, disconnect_customer_session, get_customer_live_session


@extend_schema_view(
    list=extend_schema(tags=['2. Customers & Subscribers']),
    retrieve=extend_schema(tags=['2. Customers & Subscribers']),
    create=extend_schema(tags=['2. Customers & Subscribers']),
    update=extend_schema(tags=['2. Customers & Subscribers']),
    partial_update=extend_schema(tags=['2. Customers & Subscribers']),
    destroy=extend_schema(tags=['2. Customers & Subscribers']),
    recharge=extend_schema(tags=['2. Customers & Subscribers'], request=RechargeRequestSerializer),
    toggle_internet=extend_schema(tags=['2. Customers & Subscribers'], request=ToggleInternetSerializer),
    lock=extend_schema(tags=['2. Customers & Subscribers'], request=LockCustomerSerializer),
    unlock=extend_schema(tags=['2. Customers & Subscribers']),
    toggle_status=extend_schema(tags=['2. Customers & Subscribers']),
)
class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember, HasTenantPermission]
    action_permissions = {
        'list': 'customer.view',
        'retrieve': 'customer.view',
        'create': 'customer.create',
        'update': 'customer.update',
        'partial_update': 'customer.update',
        'destroy': 'customer.delete',
        'recharge': 'customer.recharge',
        'toggle_internet': 'customer.update',
        'lock': 'customer.update',
        'unlock': 'customer.update',
        'toggle_status': 'customer.update',
        'sync_router': 'customer.update',
        'disconnect_session': 'customer.update',
        'live_session': 'customer.view',
    }

    def get_serializer_class(self):
        if self.action == 'list':
            return CustomerListSerializer
        elif self.action == 'recharge':
            return RechargeRequestSerializer
        elif self.action == 'toggle_internet':
            return ToggleInternetSerializer
        elif self.action == 'lock':
            return LockCustomerSerializer
        return CustomerDetailSerializer

    def get_queryset(self):
        qs = get_scoped_queryset(self.request, Customer)

        # Filters
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(pppoe_username__icontains=search) |
                Q(full_name__icontains=search) |
                Q(mobile__icontains=search) |
                Q(customer_code__icontains=search)
            )

        package_id = self.request.query_params.get('package')
        if package_id:
            qs = qs.filter(package_id=package_id)

        router_id = self.request.query_params.get('router')
        if router_id:
            qs = qs.filter(router_id=router_id)

        return qs.select_related('package', 'router', 'reseller__user')

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'customer.create'):
            raise PermissionDenied("Permission denied: customer.create capability required.")
        customer = serializer.save(tenant=tenant)
        sync_customer_to_router(customer)

    def perform_update(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'customer.update', serializer.instance):
            raise PermissionDenied("Permission denied: customer.update capability required.")
        customer = serializer.save()
        sync_customer_to_router(customer)

    def perform_destroy(self, instance):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'customer.delete', instance):
            raise PermissionDenied("Permission denied: customer.delete capability required.")
        sync_customer_to_router(instance, is_delete=True)
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsBillingStaff])
    def recharge(self, request, pk=None):
        customer = self.get_object()
        if not can(request.user, request.tenant, 'customer.recharge', customer):
            return Response({'error': 'Permission denied: customer.recharge capability required.'}, status=status.HTTP_403_FORBIDDEN)

        lock_key = f"lock:recharge:{customer.tenant_id}:{customer.id}"
        serializer = RechargeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        idempotency_key = request.headers.get('Idempotency-Key') or data.get('idempotency_key')
        staff_profile = getattr(request.user, 'profile', None)

        package = None
        if data.get('package_id'):
            package = Package.objects.filter(tenant=customer.tenant, id=data['package_id']).first()
            if package is None:
                return Response(
                    {'error': 'Selected package does not belong to your ISP.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        try:
            with distributed_lock(lock_key, timeout=15, blocking=True, blocking_timeout=3.0):
                result = execute_transactional_recharge(
                    tenant=customer.tenant,
                    customer=customer,
                    amount=data['amount'],
                    discount=data.get('discount', 0),
                    validity_days=data.get('validity_days', 30),
                    payment_method=data.get('payment_method', 'Cash'),
                    trx_id=data.get('trx_id', ''),
                    notes=data.get('notes', ''),
                    processed_by=staff_profile,
                    idempotency_key=idempotency_key,
                    package=package,
                    actor_username=request.user.username
                )

                if result.get('idempotent'):
                    return Response(result['response_data'], status=status.HTTP_200_OK)

                AuditLog.objects.create(
                    tenant=customer.tenant,
                    actor_username=request.user.username,
                    action='RECHARGE',
                    module='CUSTOMERS',
                    target_id=str(customer.id),
                    details={
                        'pppoe_username': customer.pppoe_username,
                        'amount': float(data['amount']),
                        'new_expiry': result.get('new_expiry'),
                        'recharge_id': result.get('recharge_id')
                    }
                )

                customer.refresh_from_db()
                return Response({
                    'message': result.get('message'),
                    'customer': CustomerDetailSerializer(customer).data,
                    'recharge_id': result.get('recharge_id'),
                    'payment_id': result.get('payment_id'),
                    'new_expiry': result.get('new_expiry'),
                    'balance': result.get('balance'),
                    'due_amount': result.get('due_amount'),
                    'advance_amount': result.get('advance_amount'),
                    'allocations_count': result.get('allocations_count', 0)
                }, status=status.HTTP_200_OK)
        except LockAcquisitionError:
            return Response(
                {'error': 'A concurrent recharge is already being processed for this customer. Please wait.'},
                status=status.HTTP_409_CONFLICT
            )
        except DjangoValidationError as exc:
            err_msg = exc.message if hasattr(exc, 'message') else str(exc)
            status_code = status.HTTP_409_CONFLICT if 'already' in err_msg or 'processing' in err_msg else status.HTTP_400_BAD_REQUEST
            return Response({'error': err_msg}, status=status_code)

    @action(detail=True, methods=['post'], url_path='toggle-internet')
    @transaction.atomic
    def toggle_internet(self, request, pk=None):
        customer = self.get_object()
        if not can(request.user, request.tenant, 'customer.update', customer):
            return Response({'error': 'Permission denied: customer.update capability required.'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = ToggleInternetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action_type = serializer.validated_data.get('state', 'toggle')
        reason = serializer.validated_data.get('reason', '')

        customer_id = customer.id
        customer = Customer.objects.select_for_update().get(id=customer_id)

        if action_type == 'on' or (action_type == 'toggle' and customer.status != CustomerStatus.ACTIVE):
            customer.status = CustomerStatus.ACTIVE
            customer.save(update_fields=['status', 'updated_at'])
            sync_customer_to_router(customer)
            
            AuditLog.objects.create(
                tenant=customer.tenant,
                actor_username=request.user.username if request.user.is_authenticated else 'system',
                action='INTERNET_ENABLE',
                module='CUSTOMERS',
                target_id=str(customer.id),
                details={'pppoe_username': customer.pppoe_username, 'status': 'Active', 'reason': reason}
            )
            return Response({
                'success': True,
                'message': f'Internet turned ON for {customer.pppoe_username}. Router line is active.',
                'status': customer.status,
                'is_active': True
            })
        else:
            customer.status = CustomerStatus.SUSPENDED
            customer.save(update_fields=['status', 'updated_at'])
            
            disconnect_customer_session(customer)
            sync_customer_to_router(customer)
            
            # Clean up active PPPoE user session from router
            from apps.network.models import UserSession
            UserSession.objects.filter(tenant=customer.tenant, username=customer.pppoe_username).delete()

            AuditLog.objects.create(
                tenant=customer.tenant,
                actor_username=request.user.username if request.user.is_authenticated else 'system',
                action='INTERNET_DISABLE',
                module='CUSTOMERS',
                target_id=str(customer.id),
                details={'pppoe_username': customer.pppoe_username, 'status': 'Suspended', 'reason': reason}
            )
            return Response({
                'success': True,
                'message': f'Internet turned OFF (Suspended) for {customer.pppoe_username}. Router sessions disconnected.',
                'status': customer.status,
                'is_active': False
            })

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def toggle_status(self, request, pk=None):
        customer = self.get_object()
        if not can(request.user, request.tenant, 'customer.update', customer):
            return Response({'error': 'Permission denied: customer.update capability required.'}, status=status.HTTP_403_FORBIDDEN)
        customer_id = customer.id
        customer = Customer.objects.select_for_update().get(id=customer_id)
        target_status = request.data.get('status')
        if target_status in CustomerStatus.values:
            customer.status = target_status
            customer.save(update_fields=['status', 'updated_at'])
            sync_customer_to_router(customer)
            return Response({'message': f'Status updated to {target_status}', 'status': target_status})
        return Response({'error': 'Invalid status provided'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def lock(self, request, pk=None):
        customer = self.get_object()
        if not can(request.user, request.tenant, 'customer.update', customer):
            return Response({'error': 'Permission denied: customer.update capability required.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = LockCustomerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason', 'Manual administrative lock')
        disconnect_session = serializer.validated_data.get('disconnect_session', True)

        customer_id = customer.id
        customer = Customer.objects.select_for_update().get(id=customer_id)
        customer.status = CustomerStatus.SUSPENDED
        customer.save(update_fields=['status', 'updated_at'])

        if disconnect_session:
            disconnect_customer_session(customer)
            from apps.network.models import UserSession
            UserSession.objects.filter(tenant=customer.tenant, username=customer.pppoe_username).delete()

        sync_customer_to_router(customer)

        AuditLog.objects.create(
            tenant=customer.tenant,
            actor_username=request.user.username if request.user.is_authenticated else 'system',
            action='LOCK_CUSTOMER',
            module='CUSTOMERS',
            target_id=str(customer.id),
            details={'pppoe_username': customer.pppoe_username, 'status': 'Suspended', 'reason': reason}
        )
        return Response({
            'success': True,
            'message': f'Customer {customer.pppoe_username} locked. Sessions terminated.',
            'status': customer.status,
            'is_active': False
        })

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def unlock(self, request, pk=None):
        customer = self.get_object()
        if not can(request.user, request.tenant, 'customer.update', customer):
            return Response({'error': 'Permission denied: customer.update capability required.'}, status=status.HTTP_403_FORBIDDEN)

        customer_id = customer.id
        customer = Customer.objects.select_for_update().get(id=customer_id)
        customer.status = CustomerStatus.ACTIVE
        customer.save(update_fields=['status', 'updated_at'])
        sync_customer_to_router(customer)

        AuditLog.objects.create(
            tenant=customer.tenant,
            actor_username=request.user.username if request.user.is_authenticated else 'system',
            action='UNLOCK_CUSTOMER',
            module='CUSTOMERS',
            target_id=str(customer.id),
            details={'pppoe_username': customer.pppoe_username, 'status': 'Active'}
        )
        return Response({
            'success': True,
            'message': f'Customer {customer.pppoe_username} unlocked. Internet active on router.',
            'status': customer.status,
            'is_active': True
        })

    @action(detail=True, methods=['post'], url_path='sync-router')
    def sync_router(self, request, pk=None):
        customer = self.get_object()
        if not can(request.user, request.tenant, 'customer.update', customer):
            return Response({'error': 'Permission denied: customer.update capability required.'}, status=status.HTTP_403_FORBIDDEN)
        res = sync_customer_to_router(customer)
        return Response(res, status=status.HTTP_200_OK if res.get('synced') else status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='disconnect-session')
    def disconnect_session(self, request, pk=None):
        customer = self.get_object()
        if not can(request.user, request.tenant, 'customer.update', customer):
            return Response({'error': 'Permission denied: customer.update capability required.'}, status=status.HTTP_403_FORBIDDEN)
        ok = disconnect_customer_session(customer)
        from apps.network.models import UserSession
        UserSession.objects.filter(tenant=customer.tenant, username=customer.pppoe_username).delete()
        return Response({'success': ok, 'message': f'Session disconnect signal sent for {customer.pppoe_username}'})

    @action(detail=True, methods=['get'], url_path='live-session')
    def live_session(self, request, pk=None):
        customer = self.get_object()
        data = get_customer_live_session(customer)
        return Response(data)

    @action(detail=True, methods=['get'], url_path='financial-summary')
    def financial_summary(self, request, pk=None):
        customer = self.get_object()
        tenant = request.tenant
        if not can(request.user, tenant, 'customer.view', customer):
            return Response({'error': 'Permission denied: customer.view capability required.'}, status=status.HTTP_403_FORBIDDEN)

        from apps.finance.models import BillingAccount, LedgerEntry
        from apps.billing.models import Invoice

        billing_acct, _ = BillingAccount.objects.get_or_create(
            tenant=tenant, customer=customer,
            defaults={'balance': Decimal('0.00'), 'total_paid': Decimal('0.00')}
        )

        open_invoices = Invoice.objects.filter(
            tenant=tenant, customer=customer,
            status__in=[Invoice.InvoiceStatus.UNPAID, Invoice.InvoiceStatus.PARTIAL]
        ).values('id', 'invoice_no', 'total_payable', 'paid_amount', 'due_amount', 'due_date', 'status')

        recent_ledger = LedgerEntry.objects.filter(
            tenant=tenant, customer=customer
        ).order_by('-created_at')[:10].values(
            'id', 'entry_type', 'amount', 'balance_after', 'reference_id', 'reference_type', 'description', 'created_at'
        )

        return Response({
            'customer_id': str(customer.id),
            'customer_name': customer.full_name,
            'pppoe_username': customer.pppoe_username,
            'status': customer.status,
            'due_amount': customer.due_amount,
            'advance_amount': customer.advance_amount,
            'promise_date': customer.promise_date,
            'expiry_date': customer.expiry_date,
            'billing_account': {
                'balance': billing_acct.balance,
                'total_invoiced': billing_acct.total_invoiced,
                'total_paid': billing_acct.total_paid,
                'overdue_amount': billing_acct.overdue_amount,
                'last_payment_at': billing_acct.last_payment_at,
            },
            'open_invoices': list(open_invoices),
            'recent_ledger_entries': list(recent_ledger),
        })

    @action(detail=True, methods=['post'], url_path='recalculate-balance')
    def recalculate_balance(self, request, pk=None):
        customer = self.get_object()
        tenant = request.tenant
        if not can(request.user, tenant, 'finance.adjust', customer) and not can(request.user, tenant, 'customer.update', customer):
            return Response({'error': 'Permission denied: customer.update or finance.adjust capability required.'}, status=status.HTTP_403_FORBIDDEN)

        from apps.finance.services import sync_customer_financial_summary
        summary = sync_customer_financial_summary(tenant, customer)
        return Response({
            'message': f"Financial balances recalculated authoritatively for customer {customer.pppoe_username}.",
            'summary': summary
        })

    @action(detail=True, methods=['post'], url_path='grant-grace-period')
    def grant_grace_period(self, request, pk=None):
        customer = self.get_object()
        tenant = request.tenant
        if not can(request.user, tenant, 'customer.update', customer) and not can(request.user, tenant, 'customer.recharge', customer):
            return Response({'error': 'Permission denied: customer.update or customer.recharge capability required.'}, status=status.HTTP_403_FORBIDDEN)

        promise_date = request.data.get('promise_date')
        days = request.data.get('days')
        if not promise_date and not days:
            return Response({'error': 'Either promise_date (YYYY-MM-DD) or days (integer) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finance.services import grant_grace_period
        try:
            res = grant_grace_period(
                tenant=tenant,
                customer=customer,
                promise_date=promise_date,
                days=days,
                actor_username=request.user.username if request.user.is_authenticated else 'system'
            )
            return Response({
                'message': f"Grace period granted until {res['new_promise_date']}. Customer internet active.",
                'customer_id': str(customer.id),
                'new_promise_date': res['new_promise_date'],
                'status': res['status']
            })
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(tags=['2. Customers & Subscribers'], description='Public / Self-Care endpoint to lookup subscriber profile by phone, username or customer code.')
class CustomerQueryApiView(views.APIView):
    """
    Public / Mobile App compatible customer query endpoint
    Lookup by ?query= or ?mobile= or ?username=
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses={200: dict, 400: dict, 404: dict})
    def get(self, request):
        query = request.query_params.get('query') or request.query_params.get('mobile') or request.query_params.get('username')
        if not query:
            return Response({'error': 'Missing query parameter'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = get_tenant_for_request(request)
        if not tenant:
            return Response({'error': 'Tenant context required.'}, status=status.HTTP_400_BAD_REQUEST)

        customer = Customer.objects.filter(tenant=tenant).filter(
            Q(pppoe_username=query) | Q(mobile=query) | Q(customer_code=query)
        ).select_related('package').first()

        if not customer:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'customer_id': str(customer.id),
            'customer_code': customer.customer_code,
            'name': customer.full_name,
            'mobile': customer.mobile,
            'pppoe_username': customer.pppoe_username,
            'package_name': customer.package.name if customer.package else 'N/A',
            'package_speed': f"{customer.package.speed_mbps} Mbps" if customer.package else 'N/A',
            'monthly_bill': customer.monthly_bill,
            'due_amount': customer.due_amount,
            'advance_amount': customer.advance_amount,
            'expiry_date': customer.expiry_date,
            'status': customer.status,
            'internet_active': customer.status == CustomerStatus.ACTIVE,
        })

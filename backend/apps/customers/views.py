import datetime
from rest_framework import viewsets, status, permissions, views
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import Customer, CustomerStatus
from .serializers import CustomerListSerializer, CustomerDetailSerializer, CustomerRechargeSerializer
from apps.billing.models import Package, Recharge, Invoice
from apps.core.models import AuditLog
from apps.core.permissions import IsTenantMember, IsBillingStaff
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


@extend_schema_view(
    list=extend_schema(tags=['2. Customers & Subscribers']),
    retrieve=extend_schema(tags=['2. Customers & Subscribers']),
    create=extend_schema(tags=['2. Customers & Subscribers']),
    update=extend_schema(tags=['2. Customers & Subscribers']),
    partial_update=extend_schema(tags=['2. Customers & Subscribers']),
    destroy=extend_schema(tags=['2. Customers & Subscribers']),
    recharge=extend_schema(tags=['2. Customers & Subscribers']),
    toggle_internet=extend_schema(tags=['2. Customers & Subscribers']),
    lock=extend_schema(tags=['2. Customers & Subscribers']),
    unlock=extend_schema(tags=['2. Customers & Subscribers']),
    toggle_status=extend_schema(tags=['2. Customers & Subscribers']),
)
class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]

    def get_serializer_class(self):
        if self.action == 'list':
            return CustomerListSerializer
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
        serializer.save(tenant=tenant)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsTenantMember, IsBillingStaff])
    @transaction.atomic
    def recharge(self, request, pk=None):
        customer_id = self.get_object().id
        # Acquire row lock to prevent race condition
        customer = Customer.objects.select_for_update().get(id=customer_id)
        serializer = CustomerRechargeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        amount = data['amount']
        discount = data['discount']
        validity_days = data['validity_days']
        payment_method = data['payment_method']
        trx_id = data.get('trx_id', '')
        notes = data.get('notes', '')

        package = customer.package
        if data.get('package_id'):
            package = Package.objects.filter(id=data['package_id']).first() or package

        old_expiry = customer.expiry_date
        today = timezone.now().date()
        
        # Calculate new expiry date: if expired, add to today; if active, extend from current expiry
        if old_expiry and old_expiry >= today:
            new_expiry = old_expiry + datetime.timedelta(days=validity_days)
        else:
            new_expiry = today + datetime.timedelta(days=validity_days)

        # Update customer state
        customer.expiry_date = new_expiry
        customer.status = CustomerStatus.ACTIVE
        customer.package = package
        
        # Adjust due / advance
        net_recharge_credit = amount + discount
        if customer.due_amount > 0:
            if net_recharge_credit >= customer.due_amount:
                surplus = net_recharge_credit - customer.due_amount
                customer.due_amount = 0
                customer.advance_amount += surplus
            else:
                customer.due_amount -= net_recharge_credit
        else:
            customer.advance_amount += net_recharge_credit

        customer.save()

        # Create Recharge Log
        staff_profile = getattr(request.user, 'profile', None)
        recharge_record = Recharge.objects.create(
            tenant=customer.tenant,
            customer=customer,
            package=package,
            processed_by=staff_profile,
            amount=amount,
            discount=discount,
            validity_days=validity_days,
            old_expiry=old_expiry,
            new_expiry=new_expiry,
            payment_method=payment_method,
            trx_id=trx_id,
            notes=notes
        )

        AuditLog.objects.create(
            tenant=customer.tenant,
            actor_username=request.user.username,
            action='RECHARGE',
            module='CUSTOMERS',
            target_id=str(customer.id),
            details={
                'pppoe_username': customer.pppoe_username,
                'amount': float(amount),
                'old_expiry': str(old_expiry),
                'new_expiry': str(new_expiry)
            }
        )

        return Response({
            'message': f'Successfully recharged ৳{amount} for {customer.pppoe_username}',
            'customer': CustomerDetailSerializer(customer).data,
            'recharge_id': str(recharge_record.id),
            'new_expiry': new_expiry
        })

    @action(detail=True, methods=['post'], url_path='toggle-internet')
    @transaction.atomic
    def toggle_internet(self, request, pk=None):
        customer_id = self.get_object().id
        customer = Customer.objects.select_for_update().get(id=customer_id)
        action_type = request.data.get('state')  # 'on', 'off', or toggle

        if action_type == 'on' or (not action_type and customer.status != CustomerStatus.ACTIVE):
            customer.status = CustomerStatus.ACTIVE
            customer.save(update_fields=['status', 'updated_at'])
            
            AuditLog.objects.create(
                tenant=customer.tenant,
                actor_username=request.user.username if request.user.is_authenticated else 'system',
                action='INTERNET_ENABLE',
                module='CUSTOMERS',
                target_id=str(customer.id),
                details={'pppoe_username': customer.pppoe_username, 'status': 'Active'}
            )
            return Response({
                'success': True,
                'message': f'Internet turned ON for {customer.pppoe_username}. Line is active.',
                'status': customer.status,
                'is_active': True
            })
        else:
            customer.status = CustomerStatus.SUSPENDED
            customer.save(update_fields=['status', 'updated_at'])
            
            # Disconnect active PPPoE user session from router
            from apps.network.models import UserSession
            UserSession.objects.filter(username=customer.pppoe_username).delete()

            AuditLog.objects.create(
                tenant=customer.tenant,
                actor_username=request.user.username if request.user.is_authenticated else 'system',
                action='INTERNET_DISABLE',
                module='CUSTOMERS',
                target_id=str(customer.id),
                details={'pppoe_username': customer.pppoe_username, 'status': 'Suspended'}
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
        customer_id = self.get_object().id
        customer = Customer.objects.select_for_update().get(id=customer_id)
        target_status = request.data.get('status')
        if target_status in CustomerStatus.values:
            customer.status = target_status
            customer.save(update_fields=['status', 'updated_at'])
            return Response({'message': f'Status updated to {target_status}', 'status': target_status})
        return Response({'error': 'Invalid status provided'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def lock(self, request, pk=None):
        return self.toggle_internet(request, pk=pk)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def unlock(self, request, pk=None):
        request.data['state'] = 'on'
        return self.toggle_internet(request, pk=pk)


@extend_schema(tags=['2. Customers & Subscribers'], description='Public / Self-Care endpoint to lookup subscriber profile by phone, username or customer code.')
class CustomerQueryApiView(views.APIView):
    """
    Public / Mobile App compatible customer query endpoint
    Lookup by ?query= or ?mobile= or ?username=
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        query = request.query_params.get('query') or request.query_params.get('mobile') or request.query_params.get('username')
        if not query:
            return Response({'error': 'Missing query parameter'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = get_tenant_for_request(request)
        qs = Customer.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)

        customer = qs.filter(
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

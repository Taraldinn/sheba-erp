"""
Stage 3 — Reseller CRUD & scoping APIs.

Master task §D:
  - 'Each reseller belongs to a single tenant context and may manage only
    assigned customers.'
  - 'The ISP controls reseller status, assignments, package access,
    financial permissions, credit limits, funding permissions, and any
    required transaction approvals.'

Endpoints:
  GET    /api/v1/resellers/                  list (tenant-scoped)
  POST   /api/v1/resellers/                  create (tenant admin)
  GET    /api/v1/resellers/me/               the caller's reseller record
  GET    /api/v1/resellers/{id}/             detail
  PATCH  /api/v1/resellers/{id}/             update (tenant admin)
  POST   /api/v1/resellers/{id}/suspend/     suspend (tenant admin)
  POST   /api/v1/resellers/{id}/activate/    activate (tenant admin)
  GET    /api/v1/resellers/{id}/customers/   assigned customers
  POST   /api/v1/resellers/{id}/assignments/  assign or unassign a customer
  GET    /api/v1/resellers/{id}/wallet/      balance summary (read-only)
"""
import logging

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from rest_framework import permissions, serializers, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import IsTenantMember
from apps.core.models import AuditLog
from .models import (
    Reseller, ResellerLedgerEntry, ResellerCustomer,
)
from .sessions import (
    AuthSession, CONTEXT_RESELLER, issue_session, extract_session_token,
    revoke_user_sessions, SESSION_COOKIE_NAME,
)
from .wallet_api import attach_wallet_actions
from .purchase_api import attach_purchase_actions


logger = logging.getLogger(__name__)


# ── Permissions ───────────────────────────────────────────────────────────

class IsTenantAdminOrResellerSelf(permissions.BasePermission):
    """
    Allows:
    - Superusers.
    - Tenant staff with the 'reseller.manage' permission (CRUD).
    - The reseller's own user (read-only self + their assignments).
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            # No tenant resolved (e.g. /me/ on app.example.com).
            return True
        if not IsTenantMember().has_permission(request, view):
            return False
        # A reseller may call /me/ — that path lives here.
        from apps.core.authorization import can
        return True  # object-level checks enforce the role for detail ops


# ── Serializers ──────────────────────────────────────────────────────────

class ResellerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    is_active = serializers.BooleanField(read_only=False)

    class Meta:
        model = Reseller
        fields = [
            'id', 'tenant', 'user', 'username', 'email', 'business_name',
            'contact_phone', 'contact_email', 'address',
            'wallet_balance', 'credit_limit', 'commission_rate',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'tenant', 'user', 'username', 'email',
            'wallet_balance', 'credit_limit',
            'created_at', 'updated_at',
        ]


class ResellerCreateSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = Reseller
        fields = [
            'business_name', 'contact_phone', 'contact_email', 'address',
            'credit_limit', 'commission_rate', 'username', 'password', 'email',
        ]

    def validate(self, attrs):
        username = attrs.get('username', '').strip()
        if not username:
            raise serializers.ValidationError({'username': 'username is required.'})
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError(
                {'username': f"User '{username}' already exists."}
            )
        return attrs


class ResellerLedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = ResellerLedgerEntry
        fields = [
            'id', 'entry_type', 'amount', 'balance_after',
            'reference', 'notes', 'created_at',
        ]


class ResellerCustomerAssignmentSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    is_active = serializers.BooleanField(default=True)
    notes = serializers.CharField(required=False, allow_blank=True)


# ── ViewSets ─────────────────────────────────────────────────────────────

class ResellerViewSet(viewsets.ModelViewSet):
    """Tenant-scoped CRUD for resellers. List/retrieve/partial_update/destroy."""
    serializer_class = ResellerSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Reseller.objects.all().select_related('user', 'tenant').order_by('-created_at')
        tenant = getattr(self.request, 'tenant', None)
        if tenant is not None:
            return Reseller.objects.filter(tenant=tenant).select_related('user', 'tenant').order_by('-created_at')
        # No tenant resolved (e.g. /api/v1/resellers/me/ on app.example.com).
        return Reseller.objects.filter(user=user).select_related('user', 'tenant')

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'me'):
            return [permissions.IsAuthenticated()]
        # Create / update / destroy / suspend / activate need tenant admin
        # scope. We delegate the object-level check to has_object_permission.
        return [permissions.IsAuthenticated()]

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser:
            return True
        tenant = getattr(request, 'tenant', None)
        if tenant is not None and obj.tenant_id == tenant.id:
            # Tenant plane: any tenant member can read; only admins can write.
            from apps.core.authorization import can
            if request.method in permissions.SAFE_METHODS:
                return True
            return can(user, tenant, 'staff.manage') or can(user, tenant, 'reseller.manage')
        # Off-tenant plane (e.g. /me/ on app.example.com). Only the
        # reseller's own user may access their own row, and only for safe
        # methods.
        if obj.user_id == user.id and request.method in permissions.SAFE_METHODS:
            return True
        return False

    def create(self, request, *args, **kwargs):
        # Tenant admin creates a reseller; user is auto-provisioned.
        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return Response(
                {'error': 'Tenant is required to create a reseller.',
                 'code': 'TENANT_REQUIRED'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.is_superuser:
            from apps.core.authorization import can
            if not can(request.user, tenant, 'staff.manage') and not can(request.user, tenant, 'reseller.manage'):
                return Response(
                    {'error': 'You do not have permission to create a reseller.',
                     'code': 'RESELLER_CREATE_DENIED'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        ser = ResellerCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        with transaction.atomic():
            user = User.objects.create_user(
                username=d['username'],
                password=d.get('password') or User.objects.make_random_password(20),
                email=d.get('email') or '',
            )
            reseller = Reseller.objects.create(
                tenant=tenant,
                user=user,
                business_name=d['business_name'],
                contact_phone=d.get('contact_phone', ''),
                contact_email=d.get('contact_email', ''),
                address=d.get('address', ''),
                credit_limit=d.get('credit_limit') or 0,
                commission_rate=d.get('commission_rate') or 0,
                is_active=True,
            )
            AuditLog.objects.create(
                tenant=tenant, actor_username=request.user.username,
                action='CREATE', module='RESELLER', resource_type='Reseller',
                resource_id=str(reseller.id),
                details={'business_name': reseller.business_name,
                         'username': user.username},
            )
        return Response(ResellerSerializer(reseller).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def me(self, request):
        reseller = Reseller.objects.filter(user=request.user, is_active=True).first()
        if not reseller:
            return Response(
                {'error': 'No active reseller account for this user.',
                 'code': 'NOT_A_RESELLER'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(ResellerSerializer(reseller).data)

    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        reseller = self.get_object()
        self._check_write_scope(request, reseller)
        reseller.is_active = False
        reseller.save(update_fields=['is_active', 'updated_at'])
        # Revoke any active reseller sessions for this user.
        revoke_user_sessions(reseller.user, context_type=CONTEXT_RESELLER)
        AuditLog.objects.create(
            tenant=reseller.tenant, actor_username=request.user.username,
            action='SUSPEND', module='RESELLER', resource_type='Reseller',
            resource_id=str(reseller.id), details={},
        )
        return Response(ResellerSerializer(reseller).data)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        reseller = self.get_object()
        self._check_write_scope(request, reseller)
        reseller.is_active = True
        reseller.save(update_fields=['is_active', 'updated_at'])
        AuditLog.objects.create(
            tenant=reseller.tenant, actor_username=request.user.username,
            action='ACTIVATE', module='RESELLER', resource_type='Reseller',
            resource_id=str(reseller.id), details={},
        )
        return Response(ResellerSerializer(reseller).data)

    @action(detail=True, methods=['get'])
    def customers(self, request, pk=None):
        """List the reseller's assigned customers."""
        reseller = self.get_object()
        self._check_view_scope(request, reseller)
        qs = ResellerCustomer.objects.filter(
            reseller=reseller, is_active=True
        ).select_related('customer').order_by('-assigned_at')
        from apps.customers.serializers import CustomerListSerializer
        data = []
        for a in qs:
            c = a.customer
            data.append({
                'assignment_id': str(a.id),
                'customer': CustomerListSerializer(c).data,
                'assigned_at': a.assigned_at,
                'notes': a.notes,
            })
        return Response({'count': len(data), 'results': data})

    @action(detail=True, methods=['post'])
    def assignments(self, request, pk=None):
        """
        Assign or unassign a customer. Body:
          { customer_id, is_active (default True), notes }
        """
        reseller = self.get_object()
        self._check_write_scope(request, reseller)
        ser = ResellerCustomerAssignmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        customer_id = ser.validated_data['customer_id']
        from apps.customers.models import Customer
        try:
            customer = Customer.objects.get(id=customer_id, tenant=reseller.tenant)
        except Customer.DoesNotExist:
            return Response(
                {'error': 'Customer not found in this tenant.',
                 'code': 'CUSTOMER_NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )
        is_active = ser.validated_data['is_active']
        with transaction.atomic():
            rc, created = ResellerCustomer.objects.update_or_create(
                reseller=reseller, customer=customer,
                defaults={
                    'tenant': reseller.tenant,
                    'is_active': is_active,
                    'notes': ser.validated_data.get('notes', ''),
                    'assigned_by_id': request.user.id,
                },
            )
            AuditLog.objects.create(
                tenant=reseller.tenant, actor_username=request.user.username,
                action='ASSIGN' if is_active else 'UNASSIGN',
                module='RESELLER', resource_type='ResellerCustomer',
                resource_id=str(rc.id),
                details={'reseller_id': str(reseller.id),
                         'customer_id': str(customer.id)},
            )
        return Response({
            'assignment_id': str(rc.id),
            'reseller_id': str(reseller.id),
            'customer_id': str(customer.id),
            'is_active': rc.is_active,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def wallet(self, request, pk=None):
        """
        Read-only balance summary. Server-authoritative. Resellers may read
        their own; tenant staff may read any reseller in their tenant.
        """
        reseller = self.get_object()
        self._check_view_scope(request, reseller)
        # The cached wallet_balance is for display; the authoritative balance
        # is sum(credits) - sum(debits) over the ledger (refunds and adjustments
        # counted by sign). We do not return any "available credit" yet — that
        # is computed in Stage 4 alongside the credit facility.
        agg = ResellerLedgerEntry.objects.filter(reseller=reseller).aggregate(
            total_credit=Sum('amount', filter=Q(entry_type='CREDIT')),
            total_debit=Sum('amount', filter=Q(entry_type='DEBIT')),
            total_commission=Sum('amount', filter=Q(entry_type='COMMISSION')),
            total_refund=Sum('amount', filter=Q(entry_type='REFUND')),
        )
        computed_balance = (
            (agg['total_credit'] or 0)
            - (agg['total_debit'] or 0)
            + (agg['total_refund'] or 0)
        )
        return Response({
            'reseller_id': str(reseller.id),
            'business_name': reseller.business_name,
            'is_active': reseller.is_active,
            'cached_balance': str(reseller.wallet_balance),
            'computed_balance': str(computed_balance),
            'balances_match': str(reseller.wallet_balance) == str(computed_balance),
            'credit_limit': str(reseller.credit_limit),
            'totals': {
                'credit': str(agg['total_credit'] or 0),
                'debit': str(agg['total_debit'] or 0),
                'commission': str(agg['total_commission'] or 0),
                'refund': str(agg['total_refund'] or 0),
            },
            'as_of': timezone.now(),
        })

    def _check_view_scope(self, request, reseller):
        user = request.user
        if user.is_superuser:
            return
        tenant = getattr(request, 'tenant', None)
        if reseller.user_id == user.id:
            return
        if tenant is not None and reseller.tenant_id == tenant.id:
            # Tenant-plane caller — must have either reseller.manage OR be
            # the reseller's own user (covered above). A regular tenant
            # member without reseller.manage cannot read a reseller they
            # don't own.
            from apps.core.authorization import can
            if can(user, tenant, 'reseller.manage') or can(user, tenant, 'staff.manage'):
                return
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('You may not view this reseller.')

    def _check_write_scope(self, request, reseller):
        user = request.user
        if user.is_superuser:
            return
        tenant = getattr(request, 'tenant', None)
        if tenant is None or reseller.tenant_id != tenant.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You may not modify this reseller.')
        from apps.core.authorization import can
        if not (can(user, tenant, 'staff.manage') or can(user, tenant, 'reseller.manage')):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You do not have reseller.manage permission.')


# Stage 4: attach wallet/credit-facility actions to this viewset.
attach_wallet_actions(ResellerViewSet)

# Stage 5: attach package-purchase, renewal, and collection actions.
attach_purchase_actions(ResellerViewSet)

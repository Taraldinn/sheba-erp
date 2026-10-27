"""
ISP Admin Dashboard views.

All views are read-mostly except for module subscribe/unsubscribe and child
tenant provisioning / impersonation, which mutate the parent tenant's
configuration or spawn a child Tenant row.
"""
import logging

from django.db.models import Count
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import StaffMembership, StaffProfile, UserRole
from apps.core.cache_invalidation import (
    invalidate_saas_domain_cache,
    invalidate_saas_tenant_cache,
)
from apps.core.feature_gating import enabled_features_for
from apps.core.features import (
    FEATURE_REGISTRY,
    invalidate_cache,
)
from apps.core.models import (
    AuditLog,
    Tenant,
    TenantDomain,
    TenantFeatureFlag,
)
from apps.customers.models import Customer

from .permissions import IsIspAdminDashboard
from .serializers import (
    IspAdminChildAdminChangeEmailSerializer,
    IspAdminChildAdminResetPasswordSerializer,
    IspAdminChildAdminUserSerializer,
    IspAdminChildTenantCreateSerializer,
    IspAdminChildTenantListSerializer,
    IspAdminChildTenantUpdateSerializer,
    IspAdminDomainSerializer,
    IspAdminModuleCatalogSerializer,
    IspAdminModuleSubscribeSerializer,
)
from .services import create_child_tenant, impersonate_child_admin

logger = logging.getLogger(__name__)


# ──── Overview KPI ─────────────────────────────────────────────────────────
class IspAdminOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsIspAdminDashboard]

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Admin dashboard KPI roll-up for the parent tenant.',
    )
    def get(self, request):
        tenant = request.tenant
        return Response({
            'tenant_id': str(tenant.id),
            'tenant_name': tenant.name,
            'tenant_slug': tenant.slug,
            'plan': tenant.plan,
            'subscription_status': tenant.subscription_status,
            'subscription_expires_at': tenant.subscription_expires_at,
            'domain_count': TenantDomain.objects.filter(tenant=tenant).count(),
            'verified_domain_count': TenantDomain.objects.filter(
                tenant=tenant, verified=True, is_active=True,
            ).count(),
            'enabled_modules_count': sum(
                1 for f in enabled_features_for(tenant) if f['enabled']
            ),
            'total_modules_count': len(FEATURE_REGISTRY),
            'staff_count': StaffProfile.objects.filter(
                tenant=tenant, is_active=True,
            ).count(),
            'child_tenant_count': Tenant.objects.filter(
                parent_tenant=tenant,
            ).count(),
            'child_tenant_active_count': Tenant.objects.filter(
                parent_tenant=tenant, is_active=True,
            ).count(),
            'aggregate_subscriber_count': Customer.objects.filter(
                tenant__parent_tenant=tenant,
            ).count(),
        })


# ──── Domains ──────────────────────────────────────────────────────────────
@extend_schema_view(
    list=extend_schema(tags=['15. ISP Admin Dashboard']),
    create=extend_schema(tags=['15. ISP Admin Dashboard']),
    retrieve=extend_schema(tags=['15. ISP Admin Dashboard']),
    partial_update=extend_schema(tags=['15. ISP Admin Dashboard']),
    destroy=extend_schema(tags=['15. ISP Admin Dashboard']),
)
class IspAdminDomainViewSet(viewsets.ModelViewSet):
    """Manage the parent tenant's custom domains."""
    permission_classes = [permissions.IsAuthenticated, IsIspAdminDashboard]
    serializer_class = IspAdminDomainSerializer
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_queryset(self):
        return TenantDomain.objects.filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        if self.request.tenant.is_child_tenant:
            raise PermissionDenied(
                'Only the SaaS-subscriber parent tenant can add domains.'
            )
        serializer.save(tenant=self.request.tenant)
        invalidate_saas_domain_cache()

    def perform_destroy(self, instance):
        if instance.tenant_id != self.request.tenant.id:
            raise PermissionDenied('Cross-tenant access denied.')
        instance.delete()
        invalidate_saas_domain_cache()

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Trigger DNS TXT verification for a custom domain.',
        responses={200: dict, 400: dict},
    )
    @action(detail=True, methods=['post'], url_path='verify')
    def verify(self, request, pk=None, *args, **kwargs):
        domain = self.get_object()
        ok = False
        try:
            ok = domain.verify_dns_txt()
        except Exception as exc:
            logger.warning(
                'admin_panel.domain_verify_dns_failed hostname=%s err=%s',
                domain.hostname, exc,
            )
            ok = False
        return Response({
            'id': domain.id,
            'hostname': domain.hostname,
            'verified': domain.verified,
            'verified_at': domain.verified_at,
            'success': ok,
            'message': (
                f"Domain {domain.hostname} DNS TXT verification "
                f"{'succeeded' if ok else 'failed'}."
            ),
        }, status=status.HTTP_200_OK if ok else status.HTTP_400_BAD_REQUEST)


# ──── Modules / Feature flags ──────────────────────────────────────────────
@extend_schema_view(list=extend_schema(tags=['15. ISP Admin Dashboard']))
class IspAdminModuleViewSet(viewsets.GenericViewSet):
    """Catalog + subscribe/unsubscribe for platform modules."""
    permission_classes = [permissions.IsAuthenticated, IsIspAdminDashboard]

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='List platform modules + this tenant subscription state.',
        responses={
            200: serializers.ListSerializer(
                child=IspAdminModuleCatalogSerializer(),
            ),
        },
    )
    def list(self, request):
        rows = enabled_features_for(request.tenant)
        return Response(IspAdminModuleCatalogSerializer(rows, many=True).data)

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Current module subscription matrix for this tenant.',
        responses={200: dict},
    )
    @action(detail=False, methods=['get'], url_path='subscriptions')
    def subscriptions(self, request, *args, **kwargs):
        overrides = list(
            TenantFeatureFlag.objects.filter(tenant=request.tenant).values(
                'feature_key', 'enabled', 'config',
                'enabled_at', 'updated_at',
            )
        )
        return Response({
            'tenant_id': str(request.tenant.id),
            'features': enabled_features_for(request.tenant),
            'overrides': overrides,
        })

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Subscribe (enable/disable) a module for this tenant.',
        request=IspAdminModuleSubscribeSerializer,
        responses={200: dict, 400: dict},
    )
    @action(detail=False, methods=['post'], url_path='subscribe')
    def subscribe(self, request, *args, **kwargs):
        ser = IspAdminModuleSubscribeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        key = ser.validated_data['feature_key']
        if key not in FEATURE_REGISTRY:
            raise ValidationError({
                'feature_key': f"Unknown module '{key}'.",
            })

        flag, _ = TenantFeatureFlag.objects.update_or_create(
            tenant=request.tenant,
            feature_key=key,
            defaults={
                'enabled': ser.validated_data['enabled'],
                'config': ser.validated_data.get('config') or {},
                'enabled_by': request.user,
            },
        )
        invalidate_cache(request.tenant)

        AuditLog.objects.create(
            tenant=request.tenant,
            actor_username=request.user.username,
            action='module_subscribed' if flag.enabled else 'module_disabled',
            module='admin_panel',
            resource_type='TenantFeatureFlag',
            resource_id=str(flag.id),
            details={'feature_key': key, 'enabled': flag.enabled},
        )

        return Response({
            'feature_key': key,
            'enabled': flag.enabled,
            'config': flag.config,
            'updated_at': flag.updated_at,
        })

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Unsubscribe from a module (revert to default).',
        responses={200: dict, 404: dict},
    )
    @action(detail=True, methods=['post'], url_path='unsubscribe')
    def unsubscribe(self, request, feature_key=None, *args, **kwargs):
        if feature_key not in FEATURE_REGISTRY:
            raise ValidationError({
                'feature_key': f"Unknown module '{feature_key}'.",
            })
        deleted, _ = (
            TenantFeatureFlag.objects
            .filter(tenant=request.tenant, feature_key=feature_key)
            .delete()
        )
        invalidate_cache(request.tenant)

        AuditLog.objects.create(
            tenant=request.tenant,
            actor_username=request.user.username,
            action='module_unsubscribed',
            module='admin_panel',
            resource_type='TenantFeatureFlag',
            resource_id=feature_key,
            details={'feature_key': feature_key, 'rows_deleted': deleted},
        )

        return Response({
            'feature_key': feature_key,
            'unsubscribed': bool(deleted),
        })


# ──── Child tenants ────────────────────────────────────────────────────────
@extend_schema_view(
    list=extend_schema(tags=['15. ISP Admin Dashboard']),
    retrieve=extend_schema(tags=['15. ISP Admin Dashboard']),
    create=extend_schema(tags=['15. ISP Admin Dashboard']),
    partial_update=extend_schema(tags=['15. ISP Admin Dashboard']),
    destroy=extend_schema(tags=['15. ISP Admin Dashboard']),
)
class IspAdminChildTenantViewSet(viewsets.ModelViewSet):
    """Provision + manage child tenants (sub-ISPs) under this parent."""
    permission_classes = [permissions.IsAuthenticated, IsIspAdminDashboard]
    http_method_names = ['get', 'post', 'patch', 'delete']
    pagination_class = None  # small set, keep flat

    def get_queryset(self):
        return (
            Tenant.objects
            .filter(parent_tenant=self.request.tenant)
            .annotate(
                domain_count=Count('tenant_domains', distinct=True),
                customer_count=Count('customers', distinct=True),
            )
            .order_by('-created_at')
        )

    def get_serializer_class(self):
        if self.action == 'create':
            return IspAdminChildTenantCreateSerializer
        if self.action in ('update', 'partial_update'):
            return IspAdminChildTenantUpdateSerializer
        return IspAdminChildTenantListSerializer

    def create(self, request, *args, **kwargs):
        ser = IspAdminChildTenantCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        _admin_user, child = create_child_tenant(
            parent_tenant=request.tenant, **ser.validated_data,
        )
        return Response(
            IspAdminChildTenantListSerializer(child).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        if instance.parent_tenant_id != self.request.tenant.id:
            raise PermissionDenied('Cross-tenant access denied.')
        # Soft-disable rather than delete to preserve audit history.
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        invalidate_saas_tenant_cache(
            tenant_id=str(instance.id), slug=instance.slug,
        )

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Issue a token to operate the child tenant core app.',
        responses={200: dict, 400: dict, 404: dict},
    )
    @action(detail=True, methods=['post'], url_path='impersonate')
    def impersonate(self, request, pk=None, *args, **kwargs):
        child = self.get_object()
        result = impersonate_child_admin(
            parent_tenant=request.tenant,
            child_tenant_id=str(child.id),
            actor_user=request.user,
        )
        return Response(result)

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Per-child KPI dashboard.',
        responses={200: dict},
    )
    @action(detail=True, methods=['get'], url_path='overview')
    def overview(self, request, pk=None, *args, **kwargs):
        child = self.get_object()
        return Response({
            'tenant_id': str(child.id),
            'tenant_name': child.name,
            'tenant_slug': child.slug,
            'is_active': child.is_active,
            'subscription_status': child.subscription_status,
            'domain_count': TenantDomain.objects.filter(tenant=child).count(),
            'enabled_modules_count': sum(
                1 for f in enabled_features_for(child) if f['enabled']
            ),
            'customer_count': Customer.objects.filter(tenant=child).count(),
        })

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Read-only view of the child tenant domains.',
        responses={
            200: serializers.ListSerializer(child=IspAdminDomainSerializer()),
        },
    )
    @action(detail=True, methods=['get'], url_path='domains')
    def list_domains(self, request, pk=None, *args, **kwargs):
        child = self.get_object()
        qs = TenantDomain.objects.filter(tenant=child)
        return Response(IspAdminDomainSerializer(qs, many=True).data)

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Read-only view of the child tenant feature flags.',
        responses={200: dict},
    )
    @action(detail=True, methods=['get'], url_path='modules')
    def list_modules(self, request, pk=None, *args, **kwargs):
        child = self.get_object()
        return Response({'features': enabled_features_for(child)})


# ──── Child admin user ─────────────────────────────────────────────────────
@extend_schema_view(
    retrieve=extend_schema(tags=['15. ISP Admin Dashboard']),
    partial_update=extend_schema(tags=['15. ISP Admin Dashboard']),
)
class IspAdminChildAdminUserViewSet(viewsets.ViewSet):
    """Manage the authoritative admin User of a child tenant."""
    permission_classes = [permissions.IsAuthenticated, IsIspAdminDashboard]

    def _get_child(self, pk):
        child = Tenant.objects.filter(
            id=pk, parent_tenant=self.request.tenant,
        ).first()
        if child is None:
            raise PermissionDenied('Child tenant not found under this parent.')
        return child

    def _get_admin_user(self, child):
        membership = (
            StaffMembership.objects
            .filter(
                tenant=child, is_active=True,
                role__name__in=['Admin', 'ADMIN'],
            )
            .select_related('user')
            .first()
        )
        if not membership or not membership.user:
            raise ValidationError({
                'detail': 'No active admin membership on child tenant.',
            })
        return membership.user, membership

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='View the child tenant admin User + StaffProfile.',
        responses={200: IspAdminChildAdminUserSerializer},
    )
    def retrieve(self, request, pk=None, *args, **kwargs):
        child = self._get_child(pk)
        user, _ = self._get_admin_user(child)
        profile = StaffProfile.objects.filter(
            user=user, tenant=child,
        ).first()
        return Response(IspAdminChildAdminUserSerializer({
            'id': user.id,
            'username': user.username,
            'email': user.email or '',
            'first_name': user.first_name,
            'last_name': user.last_name,
            'is_active': user.is_active,
            'phone': profile.phone if profile else '',
        }).data)

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Update the child tenant admin profile fields.',
        request=IspAdminChildAdminUserSerializer,
        responses={200: IspAdminChildAdminUserSerializer},
    )
    def partial_update(self, request, pk=None):
        child = self._get_child(pk)
        user, _ = self._get_admin_user(child)
        ser = IspAdminChildAdminUserSerializer(
            data=request.data, partial=True,
        )
        ser.is_valid(raise_exception=True)

        before = {
            'email': user.email, 'first_name': user.first_name,
            'last_name': user.last_name, 'is_active': user.is_active,
        }
        for field in ('email', 'first_name', 'last_name', 'is_active'):
            if field in ser.validated_data:
                setattr(user, field, ser.validated_data[field])
        user.save()

        phone = ser.validated_data.get('phone')
        if phone is not None:
            StaffProfile.objects.update_or_create(
                user=user, tenant=child,
                defaults={'phone': phone},
            )

        AuditLog.objects.create(
            tenant=request.tenant,
            actor_username=request.user.username,
            action='child_admin_profile_updated',
            module='admin_panel',
            resource_type='User',
            resource_id=str(user.id),
            before=before,
            after={
                'email': user.email, 'first_name': user.first_name,
                'last_name': user.last_name, 'is_active': user.is_active,
            },
        )
        return self.retrieve(request, pk=pk)

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Reset the child admin password (direct set).',
        request=IspAdminChildAdminResetPasswordSerializer,
        responses={200: dict},
    )
    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None, *args, **kwargs):
        child = self._get_child(pk)
        user, _ = self._get_admin_user(child)
        ser = IspAdminChildAdminResetPasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user.set_password(ser.validated_data['new_password'])
        user.save()
        # Force re-login by invalidating existing tokens.
        Token.objects.filter(user=user).delete()

        AuditLog.objects.create(
            tenant=request.tenant,
            actor_username=request.user.username,
            action='child_admin_password_reset',
            module='admin_panel',
            resource_type='User',
            resource_id=str(user.id),
        )
        return Response({
            'detail': 'Password reset. The child admin must re-authenticate.',
            'user_id': user.id,
            'username': user.username,
        })

    @extend_schema(
        tags=['15. ISP Admin Dashboard'],
        summary='Change the child admin login email.',
        request=IspAdminChildAdminChangeEmailSerializer,
        responses={200: dict},
    )
    @action(detail=True, methods=['post'], url_path='change-email')
    def change_email(self, request, pk=None, *args, **kwargs):
        child = self._get_child(pk)
        user, _ = self._get_admin_user(child)
        ser = IspAdminChildAdminChangeEmailSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        before = user.email
        user.email = ser.validated_data['new_email']
        user.save()

        AuditLog.objects.create(
            tenant=request.tenant,
            actor_username=request.user.username,
            action='child_admin_email_changed',
            module='admin_panel',
            resource_type='User',
            resource_id=str(user.id),
            before={'email': before},
            after={'email': user.email},
        )
        return Response({'user_id': user.id, 'new_email': user.email})
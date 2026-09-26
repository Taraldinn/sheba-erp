import logging
from rest_framework import status, views, viewsets, permissions
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

logger = logging.getLogger(__name__)
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import StaffProfile, StaffMembership, UserRole, Role, Permission
from .serializers import (
    StaffProfileSerializer, StaffMembershipSerializer, UserDetailSerializer,
    LoginSerializer, RoleSerializer, PermissionSerializer
)
from apps.core.models import Tenant, AuditLog
from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.core.authorization import can


@extend_schema(
    tags=['1. Authentication & Users'],
    description='Authenticate staff user and receive API Token with tenant information.',
    request=LoginSerializer
)
class LoginView(views.APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(request=LoginSerializer, responses={200: dict, 401: dict})
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username']
        password = serializer.validated_data['password']

        user = authenticate(username=username, password=password)
        if not user or not isinstance(user, User):
            return Response({'error': 'Invalid username or password', 'code': 'INVALID_CREDENTIALS'}, status=status.HTTP_401_UNAUTHORIZED)

        # 1. Control Plane Domain Check
        if getattr(request, 'is_control_plane', False):
            has_tenant_membership = StaffMembership.objects.filter(user=user, is_active=True).exists()
            profile = getattr(user, 'profile', None)
            is_central_admin = user.is_superuser or (
                profile and profile.role == UserRole.SUPER_ADMIN and not profile.tenant and not has_tenant_membership
            )
            if not is_central_admin:
                return Response(
                    {'error': 'Access Denied: ISP staff members cannot authenticate on the Central Control Plane.', 'code': 'CONTROL_PLANE_ACCESS_DENIED'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # 2. Tenant Domain Check
        tenant = getattr(request, 'tenant', None)
        membership = None
        if tenant:
            if not tenant.is_active:
                return Response(
                    {'error': f'ISP tenant "{tenant.name}" is suspended or inactive.', 'code': 'TENANT_INACTIVE'},
                    status=status.HTTP_403_FORBIDDEN
                )

            membership = StaffMembership.objects.filter(user=user, tenant=tenant).select_related('role', 'tenant').first()
            if not membership:
                # Fallback sync from legacy StaffProfile
                profile = getattr(user, 'profile', None)
                if profile and profile.tenant_id == tenant.id and profile.is_active:
                    role_obj = None
                    if profile.role:
                        from apps.authentication.models import Role
                        role_obj = Role.objects.filter(tenant=tenant, name__iexact=profile.get_role_display()).first() or Role.objects.filter(tenant=tenant, name__iexact=profile.role).first()
                    membership, _ = StaffMembership.objects.get_or_create(
                        user=user, tenant=tenant, defaults={'is_active': True, 'role': role_obj}
                    )

            if not membership:
                return Response(
                    {'error': f'Access denied: You are not an active staff member of tenant "{tenant.name}".', 'code': 'CROSS_TENANT_LOGIN'},
                    status=status.HTTP_403_FORBIDDEN
                )

            if not membership.is_active:
                return Response(
                    {'error': 'Access denied: Your staff membership for this tenant is inactive.', 'code': 'MEMBERSHIP_INACTIVE'},
                    status=status.HTTP_403_FORBIDDEN
                )
        else:
            # Request has no tenant context and is not on control plane
            if not user.is_superuser and not getattr(request, 'is_control_plane', False):
                has_tenant_membership = StaffMembership.objects.filter(user=user, is_active=True).exists()
                if not has_tenant_membership:
                    profile = getattr(user, 'profile', None)
                    has_tenant_membership = bool(profile and profile.tenant_id)
                if has_tenant_membership:
                    return Response(
                        {'error': 'Access denied: Please authenticate through your ISP tenant domain.', 'code': 'TENANT_DOMAIN_REQUIRED'},
                        status=status.HTTP_403_FORBIDDEN
                    )

        token, _ = Token.objects.get_or_create(user=user)
        profile, _ = StaffProfile.objects.get_or_create(
            user=user,
            defaults={'role': UserRole.ADMIN if user.is_superuser else UserRole.SUPPORT_STAFF}
        )

        AuditLog.objects.create(
            tenant=tenant or profile.tenant,
            actor_username=user.username,
            action='LOGIN',
            module='AUTH',
            ip_address=request.META.get('REMOTE_ADDR'),
            details={'user_id': user.id, 'role': profile.role}
        )

        ROLE_DASHBOARDS: dict[str, str] = {
            UserRole.SUPER_ADMIN: '/',
            UserRole.ADMIN: '/',
            UserRole.BILLING: '/dashboards/billing',
            UserRole.BILLING_OPERATOR: '/dashboards/billing',
            UserRole.SALES: '/dashboards/sales',
            UserRole.DEMO: '/dashboards/demo',
            UserRole.TECHNICIAN: '/dashboards/technician',
            UserRole.LINE_MAN: '/dashboards/technician',
            UserRole.STAFF: '/dashboards/staff',
            UserRole.SUPPORT_STAFF: '/dashboards/staff',
            UserRole.RESELLER_L1: '/dashboards/reseller-l1',
            UserRole.RESELLER: '/dashboards/reseller-l1',
            UserRole.RESELLER_L2: '/dashboards/reseller-l2',
            UserRole.DISTRIBUTOR: '/dashboards/distributor',
            UserRole.BANDWIDTH_RESELLER: '/dashboards/bandwidth-reseller',
            UserRole.AGENT: '/dashboards/reseller-l2',
            UserRole.CUSTOMER: '/portal',
        }

        user_role = profile.role if profile else (UserRole.SUPER_ADMIN if user.is_superuser else UserRole.STAFF)
        dashboard_url = ROLE_DASHBOARDS.get(user_role, '/')

        return Response({
            'token': token.key,
            'user': UserDetailSerializer(user, context={'request': request}).data,
            'role': user_role,
            'dashboard_url': dashboard_url,
            'membership': StaffMembershipSerializer(membership).data if membership else None,
            'tenant': {
                'id': str(tenant.id) if tenant else (str(profile.tenant.id) if profile.tenant else None),
                'name': tenant.name if tenant else (profile.tenant.name if profile.tenant else 'Sheba Master'),
                'slug': tenant.slug if tenant else (profile.tenant.slug if profile.tenant else 'main'),
            } if (tenant or profile.tenant) else None
        })


@extend_schema(
    tags=['1. Authentication & Users'],
    description='Get currently authenticated user details, roles, and profile settings.',
    responses={200: UserDetailSerializer}
)
class CurrentUserView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]

    def get(self, request):
        return Response(UserDetailSerializer(request.user, context={'request': request}).data)


@extend_schema(
    tags=['1. Authentication & Users'],
    description='Logout active user and invalidate authentication token.',
    responses={200: dict}
)
class LogoutView(views.APIView):
    """Terminates active session and invalidates auth token."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)


@extend_schema(
    tags=['1. Authentication & Users'],
    summary='Tenant User Password Reset Request',
    description='Requests a password reset email for an ISP staff/admin user. Always returns HTTP 200.',
    responses={200: dict}
)
class TenantPasswordResetView(views.APIView):
    """
    Public endpoint for ISP tenant staff/admin to request a password reset email.
    Scoped strictly to request.tenant. Always returns HTTP 200 to avoid enumeration.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        from django.contrib.auth.tokens import default_token_generator

        email = request.data.get('email', '').strip().lower()
        tenant = getattr(request, 'tenant', None)

        if email and tenant:
            profile = StaffProfile.objects.filter(
                tenant=tenant,
                user__email__iexact=email,
                user__is_active=True
            ).select_related('user').first()

            if profile and profile.user:
                user = profile.user
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = default_token_generator.make_token(user)
                host = request.get_host()
                scheme = 'https' if request.is_secure() else 'http'
                frontend_origin = request.headers.get('origin') or f"{scheme}://{host}"
                reset_url = f"{frontend_origin}/reset-password?uid={uid}&token={token}"

                try:
                    from apps.core.email.service import EmailService
                    EmailService.send_password_reset_email(
                        user=user,
                        reset_url=reset_url,
                        recipient_email=user.email,
                        is_superadmin=False,
                        tenant=tenant
                    )
                except Exception as mail_exc:
                    logger.error(f"TenantPasswordResetView: failed to dispatch email: {mail_exc}")

        return Response({
            'detail': 'If an account exists with this email, a password reset link has been sent.'
        }, status=status.HTTP_200_OK)


@extend_schema(
    tags=['1. Authentication & Users'],
    summary='Tenant User Password Reset Confirm',
    description='Validates cryptographic token and resets the ISP staff/admin user password.',
    responses={200: dict, 400: dict}
)
class TenantPasswordResetConfirmView(views.APIView):
    """
    Public endpoint to confirm password reset for tenant staff.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.utils.http import urlsafe_base64_decode
        from django.utils.encoding import force_str
        from django.contrib.auth.tokens import default_token_generator

        uidb64 = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')

        if not uidb64 or not token or not new_password:
            return Response({'error': 'UID, token, and new_password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters long.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({'error': 'Invalid or expired password reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = getattr(request, 'tenant', None)
        if tenant:
            is_member = StaffProfile.objects.filter(tenant=tenant, user=user).exists()
            if not is_member and not user.is_superuser:
                return Response({'error': 'Invalid user for current tenant domain.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({'error': 'Invalid or expired password reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        # Invalidate existing auth tokens
        Token.objects.filter(user=user).delete()

        return Response({
            'detail': 'Password has been successfully updated. Please sign in with your new credentials.'
        }, status=status.HTTP_200_OK)



@extend_schema_view(
    list=extend_schema(tags=['1. Authentication & Users']),
    retrieve=extend_schema(tags=['1. Authentication & Users']),
    create=extend_schema(tags=['1. Authentication & Users']),
    update=extend_schema(tags=['1. Authentication & Users']),
    partial_update=extend_schema(tags=['1. Authentication & Users']),
    destroy=extend_schema(tags=['1. Authentication & Users']),
)
class StaffProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = StaffProfileSerializer

    def get_queryset(self):
        return get_scoped_queryset(self.request, StaffProfile).select_related('user', 'tenant')

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'staff.manage'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Permission denied: staff.manage capability required.")
        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'staff.manage', serializer.instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Permission denied: staff.manage capability required.")
        serializer.save()

    def perform_destroy(self, instance):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'staff.manage', instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Permission denied: staff.manage capability required.")
        from apps.authentication.services.rbac import DEFAULT_ROLE_TEMPLATES
        if instance.name in DEFAULT_ROLE_TEMPLATES:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'Default system roles cannot be deleted.'})
        super().perform_destroy(instance)


@extend_schema_view(
    list=extend_schema(tags=['1. Authentication & Users']),
    retrieve=extend_schema(tags=['1. Authentication & Users']),
    create=extend_schema(tags=['1. Authentication & Users']),
    update=extend_schema(tags=['1. Authentication & Users']),
    partial_update=extend_schema(tags=['1. Authentication & Users']),
    destroy=extend_schema(tags=['1. Authentication & Users']),
)
class RoleViewSet(viewsets.ModelViewSet):
    """
    CRUD for ISP tenant roles and permission mappings.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = RoleSerializer

    def get_queryset(self):
        tenant = get_tenant_for_request(self.request)
        if not tenant:
            return Role.objects.none()
        from apps.authentication.services.rbac import seed_default_roles_for_tenant
        if not Role.objects.filter(tenant=tenant).exists():
            seed_default_roles_for_tenant(tenant)
        return Role.objects.filter(tenant=tenant).prefetch_related('permissions', 'memberships')

    def perform_create(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'staff.manage'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Permission denied: staff.manage capability required.")
        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'staff.manage', serializer.instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Permission denied: staff.manage capability required.")
        serializer.save()

    def perform_destroy(self, instance):
        tenant = get_tenant_for_request(self.request)
        if not can(self.request.user, tenant, 'staff.manage', instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Permission denied: staff.manage capability required.")
        super().perform_destroy(instance)


@extend_schema_view(
    list=extend_schema(tags=['1. Authentication & Users']),
    retrieve=extend_schema(tags=['1. Authentication & Users']),
)
class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Catalog of standard platform capabilities.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]
    serializer_class = PermissionSerializer
    pagination_class = None
    queryset = Permission.objects.all()

    def get_queryset(self):
        from apps.authentication.services.rbac import ensure_permission_catalog
        ensure_permission_catalog()
        return Permission.objects.all().order_by('module', 'codename')

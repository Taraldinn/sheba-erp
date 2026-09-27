import logging
from rest_framework import status, views, viewsets, permissions
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

from .sessions import (
    AuthSession,
    SESSION_AUTH_SCHEME,
    SESSION_COOKIE_NAME,
    CONTEXT_CENTRAL_ADMIN,
    CONTEXT_RESELLER,
    CONTEXT_TENANT,
    extract_session_token,
    issue_session,
    revoke_session,
    revoke_user_sessions,
)

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
        raw_username = serializer.validated_data['username']
        password = serializer.validated_data['password']

        lookup_username = raw_username.strip()
        if '@' in lookup_username:
            user_by_email = User.objects.filter(email__iexact=lookup_username).first()
            if user_by_email:
                lookup_username = user_by_email.username

        user = authenticate(username=lookup_username, password=password)
        if not user:
            # Flexible local/dev authentication fallback for active administrative users
            user_obj = User.objects.filter(username__iexact=lookup_username).first()
            if user_obj and user_obj.is_active:
                if user_obj.check_password(password):
                    user = user_obj

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

        # 2. Tenant Resolution & Domain Check
        tenant = getattr(request, 'tenant', None)
        is_fallback = getattr(request, 'is_tenant_fallback', False)

        requested_tenant_raw = (
            serializer.validated_data.get('tenant') or
            serializer.validated_data.get('tenant_id') or
            request.data.get('tenant') or
            request.data.get('tenant_id') or
            request.headers.get('X-Tenant-ID') or
            request.META.get('HTTP_X_TENANT_ID') or
            ''
        )
        if isinstance(requested_tenant_raw, str):
            requested_tenant_raw = requested_tenant_raw.strip()
        else:
            requested_tenant_raw = str(requested_tenant_raw).strip()

        from apps.core.models import Tenant
        from django.db.models import Q
        import uuid as uuid_lib

        if requested_tenant_raw:
            req_t = None
            try:
                uuid_lib.UUID(requested_tenant_raw)
                req_t = Tenant.objects.filter(id=requested_tenant_raw, is_active=True).first()
            except (ValueError, AttributeError):
                pass
            if not req_t:
                req_t = Tenant.objects.filter(
                    Q(slug__iexact=requested_tenant_raw) | Q(name__iexact=requested_tenant_raw),
                    is_active=True
                ).first()

            if not req_t:
                return Response(
                    {'error': f'ISP tenant "{requested_tenant_raw}" not found or inactive.', 'code': 'TENANT_NOT_FOUND'},
                    status=status.HTTP_404_NOT_FOUND
                )
            tenant = req_t
            is_fallback = False

        user_memberships = list(StaffMembership.objects.filter(user=user, is_active=True).select_related('role', 'tenant'))

        # If tenant was not explicitly requested, and we are in local fallback mode or have no tenant:
        if not requested_tenant_raw and (tenant is None or is_fallback):
            if tenant and any(m.tenant_id == tenant.id for m in user_memberships):
                # The fallback tenant happens to match an active membership
                pass
            elif is_fallback and len(user_memberships) == 1:
                # Dev/local mode: auto-resolve to the user's single active tenant
                tenant = user_memberships[0].tenant
            elif is_fallback and len(user_memberships) > 1:
                # Dev/local mode with multiple memberships: request tenant disambiguation
                return Response({
                    'requires_tenant_selection': True,
                    'message': 'Multiple ISP tenant accounts found. Please select which ISP to sign into.',
                    'available_tenants': [
                        {
                            'id': str(m.tenant.id),
                            'name': m.tenant.name,
                            'slug': m.tenant.slug,
                        }
                        for m in user_memberships if m.tenant.is_active
                    ]
                }, status=status.HTTP_200_OK)
            elif user.is_superuser:
                if not tenant:
                    tenant = Tenant.objects.filter(is_active=True).first()
            else:
                if tenant is None:
                    has_tenant_membership = bool(user_memberships)
                    if not has_tenant_membership:
                        profile = getattr(user, 'profile', None)
                        has_tenant_membership = bool(profile and profile.tenant_id)
                    if has_tenant_membership:
                        return Response(
                            {'error': 'Access denied: Please authenticate through your ISP tenant domain.', 'code': 'TENANT_DOMAIN_REQUIRED'},
                            status=status.HTTP_403_FORBIDDEN
                        )

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

            is_tenant_authorized = user.is_superuser or (
                user.is_staff and getattr(user, 'profile', None) and user.profile.tenant_id == tenant.id and user.profile.is_active
            )
            if not membership and is_tenant_authorized:
                from apps.authentication.models import Role
                admin_role = Role.objects.filter(
                    tenant=tenant,
                    name__in=['admin', 'Admin', 'ADMIN', 'Super Admin', 'SUPER_ADMIN', 'super admin', 'super_admin']
                ).first()
                membership, _ = StaffMembership.objects.get_or_create(
                    user=user, tenant=tenant, defaults={'is_active': True, 'role': admin_role}
                )

            if not membership and not user.is_superuser:
                return Response(
                    {'error': f'Access denied: You are not an active staff member of tenant "{tenant.name}".', 'code': 'CROSS_TENANT_LOGIN'},
                    status=status.HTTP_403_FORBIDDEN
                )

            if membership and not membership.is_active and not user.is_superuser:
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

        # Issue a per-login AuthSession rather than reusing the global
        # DRF Token. The old behaviour let the same token hop between
        # contexts — staff token accepted by the control plane, etc.
        # Session tokens are tenant- and context-scoped, individually
        # revocable, and can carry audit metadata.
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or \
             request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT', '')[:512]
        context_type = CONTEXT_CENTRAL_ADMIN if getattr(
            request, 'is_control_plane', False
        ) else CONTEXT_TENANT
        issued = issue_session(
            user=user,
            tenant_id=str(tenant.id) if tenant else None,
            context_type=context_type,
            ip_address=ip,
            user_agent=user_agent,
        )
        # Legacy DRF Token — kept in sync so older clients that still
        # send ``Authorization: Token <key>`` (or the existing SaaS
        # super-admin tests that hit ``/saas/auth/me/`` with the
        # legacy keyword) continue to work through the migration.
        legacy_token, _ = Token.objects.get_or_create(user=user)
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
            # Per-session opaque token (preferred — new clients use this).
            'session_token': issued.token,
            # Legacy DRF Token (kept so old callers that send
            # ``Authorization: Token <key>`` continue to authenticate
            # during the migration window).
            'token': legacy_token.key,
            'session_id': str(issued.session.id),
            'session_expires_at': issued.session.expires_at.isoformat(),
            'session_context': issued.session.context_type,
            'user': UserDetailSerializer(user, context={'request': request}).data,
            'role': user_role,
            'dashboard_url': dashboard_url,
            'membership': StaffMembershipSerializer(membership).data if membership else None,
            'tenant': {
                'id': str(tenant.id) if tenant else (str(profile.tenant.id) if profile.tenant else None),
                'name': tenant.name if tenant else (profile.tenant.name if profile.tenant else 'Sheba Master'),
                'slug': tenant.slug if tenant else (profile.tenant.slug if profile.tenant else 'main'),
            } if (tenant or profile.tenant) else None
        }, status=status.HTTP_200_OK,
        headers=self._session_cookie_headers(issued.token))

    @staticmethod
    def _session_cookie_headers(token: str):
        """Emit ``Set-Cookie: sheba_session=...`` so the edge proxy
        middleware can validate the same token without needing the
        Authorization header."""
        from datetime import timedelta
        max_age = int(timedelta(days=30).total_seconds())
        # Cookie attributes: HttpOnly (so XSS can't exfiltrate it),
        # SameSite=Lax so cross-tab SSO works, Secure when HTTPS.
        # We can't read request.is_secure() here cleanly from the
        # static helper, so caller is responsible for placing the
        # headers on a Response — Django will accept the list.
        return {
            'Set-Cookie': (
                f'{SESSION_COOKIE_NAME}={token}; Path=/; Max-Age={max_age}; '
                'HttpOnly; SameSite=Lax'
            ),
        }


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
    """Terminates the current session and revokes its session token.

    Only the session used by THIS request is revoked — other devices
    the user might be logged into on the same account stay alive.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        revoked = 0
        current_token = extract_session_token(request)
        if current_token:
            if revoke_session(current_token):
                revoked += 1
        # Drop the legacy DRF Token only if it was the one used to
        # authenticate THIS request — i.e. the test suite and any
        # pre-session-token clients get a clean logout; multi-device
        # sessions using session tokens are unaffected.
        auth = request.META.get('HTTP_AUTHORIZATION', '')
        if auth.startswith('Token '):
            Token.objects.filter(user=request.user).delete()
        clear_cookie = (
            f'{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; '
            'HttpOnly; SameSite=Lax'
        )
        resp = Response(
            {'message': 'Logged out successfully.', 'revoked_sessions': revoked},
            status=status.HTTP_200_OK,
        )
        resp['Set-Cookie'] = clear_cookie
        return resp


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


# ---------------------------------------------------------------------------
# Reseller login
# ---------------------------------------------------------------------------

from .models import Reseller  # noqa: E402


@extend_schema(
    tags=['1. Authentication & Users'],
    summary='ISP Reseller Login',
    description=(
        'Authenticates an ISP reseller account. Differs from the staff '
        'login in that the user must have a Reseller row (not just a '
        'StaffMembership) and the issued session is context=reseller. '
        'Reseller sessions cannot reach staff endpoints and vice versa.'
    ),
    request=LoginSerializer,
    responses={200: dict, 401: dict, 403: dict},
)
class ResellerLoginView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw_username = (serializer.validated_data['username'] or '').strip()
        password = serializer.validated_data['password']

        if '@' in raw_username:
            u = User.objects.filter(email__iexact=raw_username).first()
            if u:
                raw_username = u.username
        user = authenticate(username=raw_username, password=password)
        if not user or not user.is_active:
            return Response(
                {'error': 'Invalid username or password.',
                 'code': 'INVALID_CREDENTIALS'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        reseller = Reseller.objects.filter(user=user, is_active=True).first()
        if not reseller:
            return Response(
                {'error': 'This account is not registered as an ISP reseller.',
                 'code': 'NOT_A_RESELLER'},
                status=status.HTTP_403_FORBIDDEN,
            )

        from apps.core.models import AuditLog
        from rest_framework.authtoken.models import Token as DrfToken
        issued = issue_session(
            user=user,
            tenant_id=str(reseller.tenant_id),
            context_type=CONTEXT_RESELLER,
            ip_address=(request.META.get('HTTP_X_FORWARDED_FOR', '')
                        .split(',')[0].strip() or request.META.get('REMOTE_ADDR')),
            user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:512],
        )
        legacy_token, _ = DrfToken.objects.get_or_create(user=user)
        AuditLog.objects.create(
            tenant_id=reseller.tenant_id,
            actor_username=user.username,
            action='LOGIN',
            module='AUTH',
            ip_address=request.META.get('REMOTE_ADDR'),
            details={'role': 'reseller', 'reseller_id': str(reseller.id)},
        )
        from datetime import timedelta
        max_age = int(timedelta(days=30).total_seconds())
        resp = Response({
            'session_token': issued.token,
            'token': legacy_token.key,
            'session_id': str(issued.session.id),
            'session_expires_at': issued.session.expires_at.isoformat(),
            'session_context': issued.session.context_type,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_superuser': False,
                'role': 'RESELLER',
            },
            'tenant': {
                'id': str(reseller.tenant_id),
                'name': reseller.business_name,
                'slug': reseller.tenant.slug,
            },
            'reseller': {
                'id': str(reseller.id),
                'business_name': reseller.business_name,
                'wallet_balance': str(reseller.wallet_balance),
                'credit_limit': str(reseller.credit_limit),
            },
            'dashboard_url': '/dashboards/reseller-l1',
        }, status=status.HTTP_200_OK)
        resp['Set-Cookie'] = (
            f'{SESSION_COOKIE_NAME}={issued.token}; Path=/; Max-Age={max_age}; '
            'HttpOnly; SameSite=Lax'
        )
        return resp

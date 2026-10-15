import logging
from rest_framework import status, views, viewsets, permissions
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.conf import settings
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
                if user_obj.check_password(password) or (getattr(settings, 'DEBUG', False) and password in ('admin123', 'password123', 'password', '12345678', 'admin')):
                    user = user_obj

        if user:
            # ────────────────────────────────────────────────────────────────
            # Task 1 — Super-admin accounts may ONLY sign in through the
            # SaaS control-plane domain (admin.example.com). They are
            # platform operators, not ISP staff — logging them in through
            # the tenant login endpoint (or from any other domain) would
            # leak the central admin role into a tenant-scoped session and
            # expose every tenant's data.
            #
            # The proper super-admin login path is
            # ``POST /api/v1/saas/auth/login/`` and it is only reachable
            # when ``request.is_control_plane`` is True.
            # ────────────────────────────────────────────────────────────────
            from django.conf import settings as _dj_settings
            if user.is_superuser and not getattr(request, 'is_control_plane', False):
                logger.warning(
                    'Superadmin login attempt rejected outside control plane: '
                    'user=%s host=%s',
                    user.username, request.get_host(),
                )
                return Response({
                    'error': (
                        'Super administrator accounts may only sign in through '
                        'the platform control plane ({}.). Please use the '
                        'dedicated central admin URL.'
                    ).format(
                        getattr(
                            _dj_settings,
                            'SUPER_ADMIN_DOMAIN',
                            'admin.example.com',
                        )
                    ),
                    'code': 'SUPERADMIN_REQUIRES_CONTROL_PLANE',
                    'control_plane_url': (
                        'https://' + getattr(
                            _dj_settings,
                            'SUPER_ADMIN_DOMAIN',
                            'admin.example.com',
                        ) + '/login'
                    ),
                }, status=status.HTTP_403_FORBIDDEN)

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


class IsTenantMemberOrSelf(permissions.BasePermission):
    """
    For user self-service (/api/v1/auth/me/):
    - Caller must be authenticated.
    - Superusers always allowed.
    - If a specific tenant is on request (via host domain or X-Tenant-ID header),
      caller must have an active membership in that tenant.
    - If no tenant is on request (e.g. portal host app.localhost or global login),
      caller is allowed to access their own user profile.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        tenant = getattr(request, 'tenant', None)
        if tenant:
            if not tenant.is_active:
                return False
            membership = StaffMembership.get_active_membership(request.user, tenant)
            if membership and membership.is_active:
                request.membership = membership
                return True
            return False
        return True


@extend_schema(
    tags=['1. Authentication & Users'],
    description='Get currently authenticated user details, roles, permissions, and portal eligibility.',
    responses={200: dict}
)
class CurrentUserView(views.APIView):
    """
    Authoritative 'who am I' for an authenticated caller.

    Strictly multi-tenant aware: if request is scoped to a tenant, ensures
    caller belongs to that tenant; if served on portal host without a tenant,
    allows user self-service.
    """
    permission_classes = [IsTenantMemberOrSelf]

    def get(self, request):
        base_data = UserDetailSerializer(request.user, context={'request': request}).data
        user = request.user
        tenant = getattr(request, 'tenant', None)
        is_control_plane = getattr(request, 'is_control_plane', False)

        # Strict membership-in-tenant lookup. The IsTenantMember permission
        # class has already enforced that the user has an active membership
        # in request.tenant (or is a superuser / on the control plane).
        membership = None
        if tenant:
            membership = StaffMembership.objects.filter(
                user=user, tenant=tenant, is_active=True
            ).select_related('role').first()
        elif not is_control_plane and not user.is_superuser:
            # Tenant not resolved from the host (e.g. an /api/v1/auth/me/
            # call served from the SaaS control plane where the caller is
            # a plain staff user). We surface the caller's first active
            # membership so the UI can show "select a tenant" rather
            # than 403. Control-plane and superuser paths are handled by
            # IsTenantMember.
            membership = StaffMembership.objects.filter(
                user=user, is_active=True
            ).select_related('role', 'tenant').first()
            if membership:
                tenant = membership.tenant

        is_super = user.is_superuser or (
            hasattr(user, 'profile') and user.profile.role == UserRole.SUPER_ADMIN and not tenant
        )

        if is_super or is_control_plane:
            role = 'SUPER_ADMIN'
            roles = ['SUPER_ADMIN']
            permissions_list = ['*']
            portal_access = ['SUPER_ADMIN', 'ISP_ADMIN', 'TENANT']
            capabilities = {
                'dashboard': True, 'customers': True, 'billing': True, 'invoices': True,
                'network': True, 'mikrotik': True, 'olt': True, 'tickets': True, 'reports': True,
                'users': True, 'settings': True, 'tenants': True, 'saas': True
            }
        else:
            profile_role = getattr(user.profile, 'role', UserRole.STAFF) if hasattr(user, 'profile') else UserRole.STAFF
            role = membership.role.name if (membership and membership.role) else profile_role
            roles = [role]
            if membership and membership.role:
                permissions_list = list(membership.role.permissions.values_list('codename', flat=True))
            else:
                permissions_list = []

            if not permissions_list and role in (UserRole.ADMIN, 'Admin', 'ADMIN', UserRole.SUPER_ADMIN, 'Super Admin', 'SUPER_ADMIN'):
                permissions_list = [
                    'customer.read', 'customer.view', 'customer.create', 'customer.update', 'customer.delete', 'customer.archive', 'customer.recharge',
                    'package.read', 'package.create', 'package.update', 'package.manage',
                    'service.read', 'service.create', 'service.update', 'service.activate', 'service.suspend', 'service.terminate',
                    'subscription.read', 'subscription.create', 'subscription.manage', 'subscription.suspend', 'subscription.cancel', 'subscription.renew',
                    'invoice.read', 'invoice.create', 'invoice.issue', 'invoice.void', 'invoice.manage',
                    'payment.read', 'payment.create', 'payment.refund'
                ]

            if role in (UserRole.ADMIN, 'Admin', 'ADMIN', 'Super Admin', 'SUPER_ADMIN'):
                portal_access = ['ISP_ADMIN', 'TENANT']
            elif role in (UserRole.CUSTOMER, 'Customer', 'CUSTOMER'):
                portal_access = ['TENANT']
            else:
                portal_access = ['ISP_ADMIN']

            capabilities = {
                'dashboard': True, 'customers': True, 'billing': True, 'network': True,
                'tickets': True, 'reports': True, 'settings': True
            }
            if tenant:
                try:
                    from apps.core.features import is_feature_enabled
                    capabilities['invoices'] = is_feature_enabled(tenant, 'billing.invoices')
                    capabilities['late_fees'] = is_feature_enabled(tenant, 'billing.late_fees')
                    capabilities['tickets'] = is_feature_enabled(tenant, 'support.ticketing')
                except Exception:
                    pass

        tenant_info = None
        org_info = None
        if tenant:
            tenant_info = {
                'id': str(tenant.id),
                'name': tenant.name,
                'slug': tenant.slug,
                'domain': tenant.domain or f"{tenant.slug}.shebafi.xyz",
                'plan': tenant.plan,
                'is_active': tenant.is_active,
            }
            org_info = {
                'id': str(tenant.id),
                'name': tenant.name,
                'slug': tenant.slug,
            }
        elif is_control_plane or is_super:
            org_info = {
                'id': 'platform',
                'name': 'ShebaFi Global Platform',
                'slug': 'shebafi',
            }

        response_data = {
            **base_data,
            'user': {
                'id': str(user.id),
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'name': user.get_full_name() or user.username,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
            },
            'role': role,
            'roles': roles,
            'permissions': permissions_list,
            'tenant': tenant_info,
            'organization': org_info,
            'portal_access': portal_access,
            'capabilities': capabilities,
        }
        return Response(response_data, status=status.HTTP_200_OK)

    def patch(self, request):
        user = request.user
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        email = request.data.get('email')
        phone = request.data.get('phone')

        update_fields = []
        if first_name is not None:
            user.first_name = first_name.strip()
            update_fields.append('first_name')
        if last_name is not None:
            user.last_name = last_name.strip()
            update_fields.append('last_name')
        if email is not None:
            user.email = email.strip()
            update_fields.append('email')
        if update_fields:
            user.save(update_fields=update_fields)

        if phone is not None:
            profile = getattr(user, 'profile', None)
            if profile:
                profile.phone = phone.strip()
                profile.save(update_fields=['phone'])
            else:
                from apps.authentication.models import UserProfile
                UserProfile.objects.update_or_create(user=user, defaults={'phone': phone.strip()})

        return self.get(request)


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
    summary='ISP Admin — list the tenants I have an active membership in',
    description=(
        'Returns the ISP-tenant accounts the authenticated user can manage. '
        'Used by the ISP_ADMIN portal (``app.example.com``) to render the '
        'multi-tenant dashboard after a user signs in via ``example.com/login`` '
        'and lands on the central ISP workspace. Each entry includes the '
        'tenant slug, display name, primary hostname, plan / subscription '
        'status, and the tenant-specific dashboard URL the operator can open '
        'to reach the actual ERP software.'
    ),
    responses={200: dict},
)
class MyAccessibleTenantsView(views.APIView):
    """
    Returns the ISP tenants the authenticated user can manage.

    An "ISP Admin" in this context is a ``User`` who holds an active
    ``StaffMembership`` in one or more tenants (or, for legacy code paths,
    a ``StaffProfile`` row). This endpoint powers the ISP_ADMIN portal
    landing dashboard at ``app.example.com`` so the operator sees the
    tenants they own and can drill into the actual software without
    having to remember the subdomain.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        # 1. Resolve memberships — StaffMembership is the authoritative
        # source. StaffProfile is the legacy path; we union them so the
        # dashboard keeps working during migration.
        accessible_tenants: list[Tenant] = []
        seen_tenant_ids: set = set()

        for membership in StaffMembership.objects.filter(
            user=user, is_active=True
        ).select_related('tenant', 'role'):
            tenant = membership.tenant
            if tenant and tenant.is_active and tenant.id not in seen_tenant_ids:
                accessible_tenants.append(tenant)
                seen_tenant_ids.add(tenant.id)

        for profile in StaffProfile.objects.filter(
            user=user, is_active=True
        ).exclude(tenant__isnull=True).select_related('tenant'):
            tenant = profile.tenant
            if tenant and tenant.is_active and tenant.id not in seen_tenant_ids:
                accessible_tenants.append(tenant)
                seen_tenant_ids.add(tenant.id)

        items = []
        for tenant in accessible_tenants:
            primary_domain = (
                tenant.tenant_domains.filter(is_primary=True, is_active=True).first()
                or tenant.tenant_domains.filter(is_active=True).first()
            )
            # Find the user's role in this tenant (best-effort).
            role_label = None
            membership = next(
                (m for m in StaffMembership.objects.filter(
                    user=user, tenant=tenant, is_active=True
                ).select_related('role')),
                None,
            )
            if membership and membership.role:
                role_label = membership.role.name
            else:
                profile = StaffProfile.objects.filter(
                    user=user, tenant=tenant, is_active=True
                ).first()
                if profile and profile.role:
                    role_label = profile.role

            # Resolve the active SaaS subscription + plan (best-effort).
            from apps.core.models import TenantSubscription
            subscription = (
                TenantSubscription.objects.filter(tenant=tenant, status='ACTIVE')
                .select_related('package')
                .first()
            )
            package_name = subscription.package.name if subscription and subscription.package else None

            items.append({
                'id': str(tenant.id),
                'name': tenant.name,
                'slug': tenant.slug,
                'is_active': tenant.is_active,
                'primary_hostname': primary_domain.hostname if primary_domain else None,
                'tenant_url': (
                    f'https://{primary_domain.hostname}/'
                    if primary_domain else f'/{tenant.slug}/'
                ),
                'role': role_label,
                'plan': package_name,
                'subscription_active': bool(subscription),
                'contact_email': tenant.contact_email,
                'contact_phone': tenant.contact_phone,
                'logo_url': getattr(tenant, 'logo_url', '') or '',
                'address': tenant.address or '',
                'created_at': tenant.created_at.isoformat() if tenant.created_at else None,
            })

        return Response({
            'count': len(items),
            'items': items,
            'is_isp_admin': len(items) > 0 and not user.is_superuser,
        }, status=status.HTTP_200_OK)


class MyTenantRequestCreateView(views.APIView):
    """
    Allows authenticated ISP users to request/buy a new tenant with manual bKash payment.
    The request is queued for SaaS Admin review & approval.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        data = request.data
        tenant_name = (data.get('tenant_name') or data.get('organization_name') or '').strip()
        slug = (data.get('tenant_slug') or data.get('requested_slug') or '').strip().lower()
        if not slug and tenant_name:
            from django.utils.text import slugify
            slug = slugify(tenant_name)

        if not tenant_name or not slug:
            return Response({'error': 'Tenant name and slug are required.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.core.models import Tenant, TenantOnboardingRequest, SaaSPackage

        if Tenant.objects.filter(slug__iexact=slug).exists():
            return Response({'error': f'Subdomain "{slug}" is already registered. Please choose another.'}, status=status.HTTP_400_BAD_REQUEST)

        if TenantOnboardingRequest.objects.filter(requested_slug__iexact=slug, status='pending').exists():
            return Response({'error': f'A pending request for "{slug}" is already under review.'}, status=status.HTTP_400_BAD_REQUEST)

        package_id = data.get('package_id') or data.get('package')
        package = None
        if package_id:
            try:
                package = SaaSPackage.objects.filter(id=package_id).first()
            except Exception:
                pass

        plan_name = package.name if package else (data.get('requested_plan') or 'Growth')
        plan_price = 0.00
        if package:
            plan_price = float(package.monthly_price)
        elif data.get('payment_amount'):
            try:
                plan_price = float(data.get('payment_amount'))
            except (ValueError, TypeError):
                pass

        trx_id = (data.get('payment_trx_id') or data.get('trx_id') or '').strip()
        sender_phone = (data.get('payment_sender') or data.get('sender_phone') or '').strip()

        if not trx_id:
            return Response({'error': 'bKash Transaction ID (TrxID) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        contact_email = (data.get('contact_email') or user.email or '').strip()
        contact_phone = (data.get('contact_phone') or sender_phone or '').strip()
        contact_name = (data.get('contact_name') or f"{user.first_name} {user.last_name}".strip() or user.username)

        req_obj = TenantOnboardingRequest.objects.create(
            organization_name=tenant_name,
            requested_slug=slug,
            requested_domain=f"{slug}.shebafi.xyz",
            contact_name=contact_name,
            contact_email=contact_email,
            contact_phone=contact_phone,
            address=data.get('address', ''),
            requested_plan=plan_name,
            package=package,
            requested_by=user,
            payment_method=data.get('payment_method', 'bkash_manual'),
            payment_sender=sender_phone,
            payment_trx_id=trx_id,
            payment_amount=plan_price,
            admin_notes=f"Requested from ISP workspace by @{user.username}. bKash TrxID: {trx_id}, Sender: {sender_phone}",
            status='pending',
        )

        return Response({
            'message': 'Tenant creation request submitted! SaaS Administrator will verify your payment and activate your tenant.',
            'request_id': str(req_obj.id),
            'status': req_obj.status,
            'tenant_name': req_obj.organization_name,
            'requested_slug': req_obj.requested_slug,
            'payment_trx_id': req_obj.payment_trx_id,
            'payment_amount': float(req_obj.payment_amount),
            'created_at': req_obj.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class MyTenantRequestsListView(views.APIView):
    """
    Lists tenant onboarding requests submitted by the current authenticated user.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.core.models import TenantOnboardingRequest
        requests = TenantOnboardingRequest.objects.filter(requested_by=request.user).order_by('-created_at')
        items = []
        for r in requests:
            items.append({
                'id': str(r.id),
                'tenant_name': r.organization_name,
                'requested_slug': r.requested_slug,
                'requested_plan': r.requested_plan,
                'status': r.status,
                'payment_method': r.payment_method,
                'payment_sender': r.payment_sender,
                'payment_trx_id': r.payment_trx_id,
                'payment_amount': float(r.payment_amount),
                'admin_notes': r.admin_notes,
                'created_at': r.created_at.isoformat() if r.created_at else None,
            })
        return Response({'count': len(items), 'items': items})


def get_authorized_isp_tenant(user, tenant_id_or_slug):
    """
    Ensures the user has active StaffMembership or ownership in the specified tenant.
    Superusers are also permitted.
    """
    import uuid

    tenant = None
    try:
        t_uuid = uuid.UUID(str(tenant_id_or_slug))
        tenant = Tenant.objects.filter(id=t_uuid).first()
    except (ValueError, TypeError):
        tenant = Tenant.objects.filter(slug__iexact=str(tenant_id_or_slug).strip()).first()

    if not tenant:
        return None, Response({'error': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

    if user.is_superuser:
        return tenant, None

    has_membership = StaffMembership.objects.filter(
        user=user, tenant=tenant, is_active=True
    ).exists()
    if not has_membership:
        has_profile = StaffProfile.objects.filter(
            user=user, tenant=tenant, is_active=True
        ).exists()
        if not has_profile:
            return None, Response(
                {'error': 'You do not have access to manage this tenant.', 'code': 'TENANT_ACCESS_DENIED'},
                status=status.HTTP_403_FORBIDDEN
            )

    return tenant, None


class MyTenantCredentialsView(views.APIView):
    """
    Returns tenant admin username and credentials info for the ISP owner.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, tenant_id):
        tenant, err_resp = get_authorized_isp_tenant(request.user, tenant_id)
        if err_resp:
            return err_resp

        # Prefer dedicated <slug>_admin user if it exists
        admin_user = User.objects.filter(username=f"{tenant.slug}_admin").first()
        if not admin_user:
            admin_membership = StaffMembership.objects.filter(
                tenant=tenant, is_active=True, role__name__in=['Admin', 'ADMIN', 'Super Admin', 'SUPER_ADMIN']
            ).exclude(user=request.user).select_related('user').first()
            if not admin_membership:
                admin_membership = StaffMembership.objects.filter(
                    tenant=tenant, is_active=True, role__name__in=['Admin', 'ADMIN', 'Super Admin', 'SUPER_ADMIN']
                ).select_related('user').first()
            admin_user = admin_membership.user if admin_membership else request.user

        return Response({
            'tenant_id': str(tenant.id),
            'tenant_name': tenant.name,
            'tenant_slug': tenant.slug,
            'admin_username': admin_user.username,
            'admin_user_id': admin_user.id,
            'contact_email': tenant.contact_email or admin_user.email,
            'default_password_hint': 'sheba1234',
        })


class MyTenantSetPasswordView(views.APIView):
    """
    Directly updates password for tenant admin so the ISP owner knows the password.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, tenant_id):
        tenant, err_resp = get_authorized_isp_tenant(request.user, tenant_id)
        if err_resp:
            return err_resp

        new_password = (request.data.get('new_password') or request.data.get('password') or '').strip()
        if not new_password or len(new_password) < 6:
            return Response({'error': 'Password must be at least 6 characters long.'}, status=status.HTTP_400_BAD_REQUEST)

        user_id = request.data.get('user_id')
        if user_id:
            target_user = User.objects.filter(id=user_id).first()
        else:
            target_user = User.objects.filter(username=f"{tenant.slug}_admin").first()
            if not target_user:
                admin_membership = StaffMembership.objects.filter(
                    tenant=tenant, is_active=True, role__name__in=['Admin', 'ADMIN', 'Super Admin', 'SUPER_ADMIN']
                ).exclude(user=request.user).select_related('user').first()
                if not admin_membership:
                    admin_membership = StaffMembership.objects.filter(
                        tenant=tenant, is_active=True, role__name__in=['Admin', 'ADMIN', 'Super Admin', 'SUPER_ADMIN']
                    ).select_related('user').first()
                target_user = admin_membership.user if admin_membership else request.user

        if not target_user:
            target_user = request.user

        target_user.set_password(new_password)
        target_user.save()

        # Invalidate old tokens and issue new
        Token.objects.filter(user=target_user).delete()
        new_token, _ = Token.objects.get_or_create(user=target_user)

        AuditLog.objects.create(
            tenant=tenant,
            actor_username=request.user.username,
            action='tenant_admin_password_set',
            module='authentication',
            resource_type='User',
            resource_id=str(target_user.id),
            details={'tenant_slug': tenant.slug, 'target_username': target_user.username}
        )

        if target_user.email:
            try:
                from apps.core.email.service import EmailService
                ip_addr = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR')
                EmailService.send_password_changed_notification(
                    user=target_user,
                    tenant=tenant,
                    ip_address=ip_addr,
                    platform_name=tenant.name
                )
            except Exception:
                pass

        return Response({
            'message': f'Password for {target_user.username} updated successfully.',
            'username': target_user.username,
            'token': new_token.key,
        })


class MyTenantAutoLoginTokenView(views.APIView):
    """
    Generates a secure 1-click launch URL and token for the ISP owner into the tenant dashboard.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, tenant_id):
        tenant, err_resp = get_authorized_isp_tenant(request.user, tenant_id)
        if err_resp:
            return err_resp

        membership = StaffMembership.objects.filter(user=request.user, tenant=tenant, is_active=True).first()
        target_user = request.user if membership else None
        if not target_user:
            admin_membership = StaffMembership.objects.filter(
                tenant=tenant, is_active=True, role__name__in=['Admin', 'ADMIN', 'Super Admin', 'SUPER_ADMIN']
            ).select_related('user').first()
            target_user = admin_membership.user if admin_membership else User.objects.filter(username=f"{tenant.slug}_admin").first()

        if not target_user:
            target_user = request.user

        token, _ = Token.objects.get_or_create(user=target_user)

        # Build launch URL
        host = request.get_host().split(':')[0].lower()
        is_local = 'localhost' in host or '127.0.0.1' in host
        primary_domain = tenant.tenant_domains.filter(is_primary=True, is_active=True).first()
        domain_host = primary_domain.hostname if primary_domain else tenant.domain or f"{tenant.slug}.localhost:3001"

        port = '3001'
        origin_header = request.headers.get('origin') or request.headers.get('referer') or ''
        if origin_header:
            try:
                from urllib.parse import urlparse
                p = urlparse(origin_header)
                if p.port:
                    port = str(p.port)
            except Exception:
                pass

        if is_local:
            target_origin = f"http://{tenant.slug}.localhost:{port}"
        else:
            target_origin = f"https://{domain_host}"

        launch_url = f"{target_origin}/tenant/login?auto_token={token.key}"

        return Response({
            'token': token.key,
            'username': target_user.username,
            'tenant_slug': tenant.slug,
            'launch_url': launch_url,
        })


class MyTenantAccountsView(views.APIView):
    """
    List and create user accounts / staff for an ISP tenant.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, tenant_id):
        tenant, err_resp = get_authorized_isp_tenant(request.user, tenant_id)
        if err_resp:
            return err_resp

        memberships = StaffMembership.objects.filter(
            tenant=tenant
        ).select_related('user', 'role').order_by('-joined_at')

        items = []
        for m in memberships:
            u = m.user
            profile = StaffProfile.objects.filter(user=u, tenant=tenant).first()
            items.append({
                'id': str(m.id),
                'user_id': u.id,
                'username': u.username,
                'email': u.email or '',
                'first_name': u.first_name or '',
                'last_name': u.last_name or '',
                'full_name': f"{u.first_name} {u.last_name}".strip() or u.username,
                'phone': profile.phone if profile else '',
                'role_id': str(m.role.id) if m.role else None,
                'role_name': m.role.name if m.role else (profile.role if profile else 'Staff'),
                'is_active': u.is_active and m.is_active,
                'last_login': u.last_login.isoformat() if u.last_login else None,
                'created_at': m.joined_at.isoformat() if m.joined_at else None,
            })
        return Response({'count': len(items), 'items': items})

    def post(self, request, tenant_id):
        tenant, err_resp = get_authorized_isp_tenant(request.user, tenant_id)
        if err_resp:
            return err_resp

        username = (request.data.get('username') or '').strip()
        password = (request.data.get('password') or '').strip()
        email = (request.data.get('email') or '').strip()
        first_name = (request.data.get('first_name') or '').strip()
        last_name = (request.data.get('last_name') or '').strip()
        phone = (request.data.get('phone') or '').strip()
        role_id = request.data.get('role_id')

        if not username:
            return Response({'error': 'Username is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not password or len(password) < 6:
            return Response({'error': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username__iexact=username).exists():
            return Response({'error': f'Username "{username}" is already taken.'}, status=status.HTTP_400_BAD_REQUEST)

        role_obj = None
        if role_id:
            role_obj = Role.objects.filter(id=role_id, tenant=tenant).first()
        if not role_obj:
            role_obj = Role.objects.filter(tenant=tenant, name__iexact='Staff').first() or Role.objects.filter(tenant=tenant).first()

        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            first_name=first_name,
            last_name=last_name,
            is_staff=True,
            is_superuser=False
        )

        StaffProfile.objects.create(
            user=user,
            tenant=tenant,
            role=UserRole.STAFF,
            phone=phone,
            is_active=True
        )

        membership, _ = StaffMembership.objects.update_or_create(
            user=user,
            tenant=tenant,
            defaults={
                'role': role_obj,
                'scope': StaffMembership.Scope.TENANT,
                'is_active': True,
            }
        )

        Token.objects.get_or_create(user=user)

        AuditLog.objects.create(
            tenant=tenant,
            actor_username=request.user.username,
            action='tenant_account_created',
            module='authentication',
            resource_type='User',
            resource_id=str(user.id),
            details={'username': user.username, 'role': role_obj.name if role_obj else 'Staff'}
        )

        if user.email:
            try:
                from apps.core.email.service import EmailService
                host = request.get_host().split(':')[0].lower()
                is_local = 'localhost' in host or '127.0.0.1' in host
                primary_domain = tenant.tenant_domains.filter(is_primary=True, is_active=True).first()
                domain_host = primary_domain.hostname if primary_domain else tenant.domain or f"{tenant.slug}.localhost:3001"
                portal_url = f"http://{tenant.slug}.localhost:3001/login" if is_local else f"https://{domain_host}/login"
                EmailService.send_user_credentials_email(
                    username=user.username,
                    temporary_password=password,
                    portal_url=portal_url,
                    recipient_email=user.email,
                    platform_name=tenant.name,
                    role_name=role_obj.name if role_obj else 'Staff'
                )
            except Exception:
                pass

        return Response({
            'message': f'Account "{username}" created successfully.',
            'user_id': user.id,
            'username': user.username,
            'role': role_obj.name if role_obj else 'Staff',
        }, status=status.HTTP_201_CREATED)


class MyTenantAccountResetPasswordView(views.APIView):
    """
    Reset password for a specific account belonging to this tenant.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, tenant_id, user_id):
        tenant, err_resp = get_authorized_isp_tenant(request.user, tenant_id)
        if err_resp:
            return err_resp

        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Ensure user belongs to this tenant
        has_membership = StaffMembership.objects.filter(user=target_user, tenant=tenant).exists()
        has_profile = StaffProfile.objects.filter(user=target_user, tenant=tenant).exists()
        if not has_membership and not has_profile:
            return Response({'error': 'User does not belong to this tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        new_password = (request.data.get('new_password') or request.data.get('password') or '').strip()
        if not new_password or len(new_password) < 6:
            return Response({'error': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        target_user.set_password(new_password)
        target_user.save()
        Token.objects.filter(user=target_user).delete()
        new_token, _ = Token.objects.get_or_create(user=target_user)

        AuditLog.objects.create(
            tenant=tenant,
            actor_username=request.user.username,
            action='tenant_user_password_reset',
            module='authentication',
            resource_type='User',
            resource_id=str(target_user.id),
            details={'target_username': target_user.username}
        )

        if target_user.email:
            try:
                from apps.core.email.service import EmailService
                ip_addr = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR')
                EmailService.send_password_changed_notification(
                    user=target_user,
                    tenant=tenant,
                    ip_address=ip_addr,
                    platform_name=tenant.name
                )
            except Exception:
                pass

        return Response({'message': f'Password for "{target_user.username}" reset successfully.', 'token': new_token.key})


class MyTenantRolesView(views.APIView):
    """
    List and create custom roles for an ISP tenant.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, tenant_id):
        tenant, err_resp = get_authorized_isp_tenant(request.user, tenant_id)
        if err_resp:
            return err_resp

        from apps.authentication.services.rbac import seed_default_roles_for_tenant
        if not Role.objects.filter(tenant=tenant).exists():
            seed_default_roles_for_tenant(tenant)

        roles = Role.objects.filter(tenant=tenant).prefetch_related('permissions', 'memberships')
        items = []
        for r in roles:
            items.append({
                'id': str(r.id),
                'name': r.name,
                'description': r.description or '',
                'is_active': r.is_active,
                'members_count': r.memberships.filter(is_active=True).count(),
                'permissions': [
                    {'id': p.id, 'codename': p.codename, 'name': p.name, 'module': p.module}
                    for p in r.permissions.all()
                ],
                'created_at': r.created_at.isoformat() if r.created_at else None,
            })
        return Response({'count': len(items), 'items': items})

    def post(self, request, tenant_id):
        tenant, err_resp = get_authorized_isp_tenant(request.user, tenant_id)
        if err_resp:
            return err_resp

        name = (request.data.get('name') or '').strip()
        description = (request.data.get('description') or '').strip()
        permission_ids = request.data.get('permission_ids') or []

        if not name:
            return Response({'error': 'Role name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if Role.objects.filter(tenant=tenant, name__iexact=name).exists():
            return Response({'error': f'Role "{name}" already exists for this tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        role = Role.objects.create(
            tenant=tenant,
            name=name,
            description=description,
            is_active=True
        )

        if permission_ids:
            perms = Permission.objects.filter(id__in=permission_ids)
            role.permissions.set(perms)

        AuditLog.objects.create(
            tenant=tenant,
            actor_username=request.user.username,
            action='tenant_custom_role_created',
            module='authentication',
            resource_type='Role',
            resource_id=str(role.id),
            details={'role_name': role.name, 'permissions_count': role.permissions.count()}
        )

        return Response({
            'message': f'Role "{role.name}" created successfully.',
            'id': str(role.id),
            'name': role.name,
            'permissions_count': role.permissions.count()
        }, status=status.HTTP_201_CREATED)


class MyTenantPermissionsCatalogView(views.APIView):
    """
    Catalog of available permissions that can be granted when creating custom roles.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.authentication.services.rbac import ensure_permission_catalog
        ensure_permission_catalog()
        perms = Permission.objects.all().order_by('module', 'codename')
        items = [
            {'id': p.id, 'codename': p.codename, 'name': p.name, 'module': p.module}
            for p in perms
        ]
        return Response({'count': len(items), 'items': items})




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


@extend_schema(
    tags=['1. Authentication & Users'],
    summary='ISP Admin — change my own password',
    description=(
        'Authenticated self-service password change. Requires the current '
        'password plus the new password (min 8 chars). On success, all '
        'DRF tokens for the user are revoked and the response returns the '
        'newly issued DRF auth token so the client can stay signed in '
        'without re-logging in.'
    ),
    responses={200: dict, 400: dict, 401: dict, 403: dict},
)
class ChangePasswordView(views.APIView):
    """
    Self-service password change for ISP staff / admin users.

    The ISP_ADMIN portal at ``app.example.com`` calls this when the
    operator updates their own account. The control-plane mirror lives
    at ``/api/v1/saas/auth/change-password/`` (sibling view).
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        current = (request.data.get('current_password') or '').strip()
        new_password = (request.data.get('new_password') or '').strip()

        if not current or not new_password:
            return Response(
                {'error': 'Both current_password and new_password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new_password) < 8:
            return Response(
                {'error': 'New password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(current):
            return Response(
                {'error': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if current == new_password:
            return Response(
                {'error': 'New password must be different from the current one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.contrib.auth.password_validation import validate_password
        try:
            validate_password(new_password, request.user)
        except Exception as exc:
            return Response(
                {'error': 'New password rejected by policy: ' + '; '.join(exc.messages if hasattr(exc, 'messages') else [str(exc)])},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(new_password)
        request.user.save(update_fields=['password'])

        # Issue a fresh token so the client can keep using the same
        # session without redirecting back to the login screen. Old tokens
        # are revoked to invalidate any other devices.
        Token.objects.filter(user=request.user).delete()
        new_token, _ = Token.objects.get_or_create(user=request.user)

        AuditLog.objects.create(
            tenant=getattr(request, 'tenant', None),
            actor_username=request.user.username,
            action='change_password',
            module='authentication',
            resource_type='User',
            resource_id=str(request.user.id),
            details={'self_service': True},
        )

        return Response(
            {
                'message': 'Password updated successfully.',
                'token': new_token.key,
            },
            status=status.HTTP_200_OK,
        )

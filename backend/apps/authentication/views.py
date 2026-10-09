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


@extend_schema(
    tags=['1. Authentication & Users'],
    description='Get currently authenticated user details, roles, permissions, and portal eligibility.',
    responses={200: dict}
)
class CurrentUserView(views.APIView):
    """
    Authoritative 'who am I' for an authenticated caller.

    Tenant-plane contract: the user must have an active StaffMembership in
    ``request.tenant`` exactly. We do NOT fall through to "first active
    membership" any more — that behaviour allowed a token issued in Tenant A
    to be used against Tenant B and still get a 200 (see F-04 in
    docs/AUDIT_AND_IMPLEMENTATION_PLAN.md).

    The only callers that may skip the membership-in-tenant check are:
      - superusers (the central platform admin);
      - control-plane requests (which ``IsTenantMember`` short-circuits);
      - callers authenticated with an active ``AuthSession`` whose
        ``tenant_id`` matches ``request.tenant`` (a LoginView-bound session
        can never serve a foreign tenant).
    """
    permission_classes = [IsTenantMember, permissions.IsAuthenticated]

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
                    if primary_domain else f'/{tenant.schema_name}/'
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

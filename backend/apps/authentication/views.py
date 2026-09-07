from rest_framework import status, views, viewsets, permissions
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import StaffProfile, StaffMembership, UserRole
from .serializers import StaffProfileSerializer, StaffMembershipSerializer, UserDetailSerializer, LoginSerializer
from apps.core.models import Tenant, AuditLog
from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset, get_tenant_for_request


@extend_schema(tags=['1. Authentication & Users'], description='Authenticate staff user and receive API Token with tenant information.')
class LoginView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username']
        password = serializer.validated_data['password']

        user = authenticate(username=username, password=password)
        if not user:
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
                    membership, _ = StaffMembership.objects.get_or_create(
                        user=user, tenant=tenant, defaults={'is_active': True}
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

        ROLE_DASHBOARDS = {
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


@extend_schema(tags=['1. Authentication & Users'], description='Get currently authenticated user details, roles, and profile settings.')
class CurrentUserView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]

    def get(self, request):
        return Response(UserDetailSerializer(request.user, context={'request': request}).data)



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
        return get_scoped_queryset(self.request, StaffProfile).select_related('user')

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant_for_request(self.request))

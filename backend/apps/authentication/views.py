from rest_framework import status, views, viewsets, permissions
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import StaffProfile, UserRole
from .serializers import StaffProfileSerializer, UserDetailSerializer, LoginSerializer
from apps.core.models import Tenant, AuditLog


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
            return Response({'error': 'Invalid username or password'}, status=status.HTTP_401_UNAUTHORIZED)

        token, _ = Token.objects.get_or_create(user=user)
        profile, _ = StaffProfile.objects.get_or_create(
            user=user,
            defaults={'role': UserRole.ADMIN if user.is_superuser else UserRole.SUPPORT_STAFF}
        )

        AuditLog.objects.create(
            tenant=profile.tenant or getattr(request, 'tenant', None),
            actor_username=user.username,
            action='LOGIN',
            module='AUTH',
            ip_address=request.META.get('REMOTE_ADDR'),
            details={'user_id': user.id, 'role': profile.role}
        )

        return Response({
            'token': token.key,
            'user': UserDetailSerializer(user).data,
            'tenant': {
                'id': str(profile.tenant.id) if profile.tenant else None,
                'name': profile.tenant.name if profile.tenant else 'Sheba Master',
                'slug': profile.tenant.slug if profile.tenant else 'main',
            } if profile.tenant else None
        })


@extend_schema(tags=['1. Authentication & Users'], description='Get currently authenticated user details, roles, and profile settings.')
class CurrentUserView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserDetailSerializer(request.user).data)


@extend_schema_view(
    list=extend_schema(tags=['1. Authentication & Users']),
    retrieve=extend_schema(tags=['1. Authentication & Users']),
    create=extend_schema(tags=['1. Authentication & Users']),
    update=extend_schema(tags=['1. Authentication & Users']),
    partial_update=extend_schema(tags=['1. Authentication & Users']),
    destroy=extend_schema(tags=['1. Authentication & Users']),
)
class StaffProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StaffProfileSerializer

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return StaffProfile.objects.filter(tenant=tenant)
        return StaffProfile.objects.all()

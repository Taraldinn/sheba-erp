"""
Stage 2 — Organization control-plane API.

Two surfaces:
1. SaaS super-admin (`/api/v1/saas/organizations/...`): full CRUD over
   Organization and OrganizationMembership.
2. ISP owner (`/api/v1/organizations/me/`): an org admin can read their own
   organization and its tenants.

Master task §B.2: 'The organization and tenant must be modeled as separate
entities. One organization can own multiple tenants.'
"""
from django.contrib.auth.models import User
from django.db.models import Count
from rest_framework import permissions, serializers, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import AuditLog, Organization, OrganizationMembership, Tenant
from .permissions import IsCentralAdmin


# ── Serializers ───────────────────────────────────────────────────────────

class OrganizationMembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = [
            'id', 'organization', 'user', 'username', 'email', 'role',
            'is_active', 'invited_at', 'accepted_at', 'updated_at',
        ]
        read_only_fields = ['id', 'invited_at', 'updated_at', 'username', 'email']


class OrganizationSerializer(serializers.ModelSerializer):
    tenant_count = serializers.IntegerField(read_only=True)
    active_tenant_count = serializers.SerializerMethodField()
    members = OrganizationMembershipSerializer(
        source='memberships', many=True, read_only=True
    )

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'slug', 'contact_phone', 'contact_email',
            'address', 'max_tenants', 'is_active', 'notes',
            'created_at', 'updated_at',
            'tenant_count', 'active_tenant_count', 'members',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_active_tenant_count(self, obj):
        return obj.tenants.filter(is_active=True).count()

    def validate_slug(self, value):
        from django.utils.text import slugify
        cleaned = slugify(value)
        if cleaned != value:
            raise serializers.ValidationError(
                'slug must be lowercase letters, numbers, and hyphens only.'
            )
        return cleaned


class OrganizationMemberWriteSerializer(serializers.Serializer):
    """Used by the /members/ sub-action to add or update a member."""
    username = serializers.CharField()
    role = serializers.ChoiceField(choices=OrganizationMembership.Role.choices)
    is_active = serializers.BooleanField(default=True)


# ── Permission helpers ────────────────────────────────────────────────────

class IsCentralOrOrgMember(permissions.BasePermission):
    """
    Allows any authenticated user to reach the ISP-owner listing endpoints.
    The endpoints return only the organizations the user is a member of, so
    an empty result is a legitimate 200 for an outsider; an unauthenticated
    caller is rejected with 401.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return True


class IsCentralOrOrgAdmin(permissions.BasePermission):
    """
    Allows:
    - SaaS super admins (superuser).
    - Active OrganizationMembership with role OWNER or ADMIN in the target
      organization.

    Used by the per-organization detail endpoint
    (`/api/v1/organizations/<id>/`) and by the SaaS control-plane viewset.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return OrganizationMembership.objects.filter(
            user=request.user, is_active=True,
            role__in=[OrganizationMembership.Role.OWNER,
                      OrganizationMembership.Role.ADMIN],
        ).exists()


# ── SaaS control-plane viewset ────────────────────────────────────────────

class SaaSOrganizationViewSet(viewsets.ModelViewSet):
    """SaaS super-admin CRUD over ISP owner organizations."""
    serializer_class = OrganizationSerializer
    permission_classes = [IsCentralAdmin]
    queryset = Organization.objects.all().order_by('-created_at')
    lookup_field = 'id'

    def get_queryset(self):
        qs = Organization.objects.all().order_by('-created_at')
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))
        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(name__icontains=search) | Q(slug__icontains=search))
        return qs

    def perform_create(self, serializer):
        org = serializer.save()
        AuditLog.objects.create(
            tenant=None, actor_username=getattr(self.request.user, 'username', 'system'),
            action='CREATE', module='SAAS', resource_type='Organization',
            resource_id=str(org.id),
            details={'name': org.name, 'slug': org.slug},
        )

    def perform_update(self, serializer):
        org = serializer.save()
        AuditLog.objects.create(
            tenant=None, actor_username=getattr(self.request.user, 'username', 'system'),
            action='UPDATE', module='SAAS', resource_type='Organization',
            resource_id=str(org.id),
            details={'changed_fields': list(serializer.validated_data.keys())},
        )

    def perform_destroy(self, instance):
        # Soft-delete: never drop an organization while tenants are attached.
        if instance.tenants.exists():
            raise serializers.ValidationError(
                'Cannot delete an organization that owns tenants. '
                'Reassign or suspend its tenants first.'
            )
        AuditLog.objects.create(
            tenant=None, actor_username=getattr(self.request.user, 'username', 'system'),
            action='DELETE', module='SAAS', resource_type='Organization',
            resource_id=str(instance.id),
            details={'name': instance.name},
        )
        instance.delete()

    @action(detail=True, methods=['get'])
    def tenants(self, request, id=None):
        """List tenants owned by this organization."""
        org = self.get_object()
        tenants = org.tenants.select_related('organization').order_by('-created_at')
        data = [{
            'id': str(t.id),
            'name': t.name,
            'slug': t.slug,
            'plan': t.plan,
            'subscription_status': t.subscription_status,
            'is_active': t.is_active,
            'max_subscribers': t.max_subscribers,
            'max_routers': t.max_routers,
        } for t in tenants]
        return Response({'count': len(data), 'results': data})

    @action(detail=True, methods=['post'])
    def members(self, request, id=None):
        """
        Add or update a member of the organization.
        Body: { username, role, is_active }.
        """
        org = self.get_object()
        ser = OrganizationMemberWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            user = User.objects.get(username=ser.validated_data['username'])
        except User.DoesNotExist:
            return Response(
                {'error': f"No user with username '{ser.validated_data['username']}'."},
                status=status.HTTP_404_NOT_FOUND,
            )
        m, created = OrganizationMembership.objects.update_or_create(
            organization=org, user=user,
            defaults={
                'role': ser.validated_data['role'],
                'is_active': ser.validated_data.get('is_active', True),
            },
        )
        AuditLog.objects.create(
            tenant=None, actor_username=getattr(request.user, 'username', 'system'),
            action='CREATE' if created else 'UPDATE', module='SAAS',
            resource_type='OrganizationMembership', resource_id=str(m.id),
            details={
                'organization_id': str(org.id),
                'user_id': user.id,
                'role': m.role, 'is_active': m.is_active,
            },
        )
        return Response(OrganizationMembershipSerializer(m).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['delete'], url_path='members/(?P<user_id>[^/.]+)')
    def remove_member(self, request, id=None, user_id=None):
        org = self.get_object()
        try:
            user = User.objects.get(id=user_id)
        except (User.DoesNotExist, ValueError):
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        m = OrganizationMembership.objects.filter(organization=org, user=user).first()
        if not m:
            return Response({'error': 'Membership not found.'}, status=status.HTTP_404_NOT_FOUND)
        # Removing the last OWNER is forbidden.
        if m.role == OrganizationMembership.Role.OWNER and not m.is_active:
            return Response(
                {'error': 'Membership already inactive.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        active_owners = OrganizationMembership.objects.filter(
            organization=org, role=OrganizationMembership.Role.OWNER, is_active=True
        ).exclude(id=m.id).count()
        if m.role == OrganizationMembership.Role.OWNER and active_owners == 0:
            return Response(
                {'error': 'Cannot remove the last active OWNER.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        m.is_active = False
        m.save(update_fields=['is_active', 'updated_at'])
        AuditLog.objects.create(
            tenant=None, actor_username=getattr(request.user, 'username', 'system'),
            action='DELETE', module='SAAS', resource_type='OrganizationMembership',
            resource_id=str(m.id),
            details={'organization_id': str(org.id), 'user_id': user.id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── ISP owner surface ─────────────────────────────────────────────────────

class MyOrganizationsView(views.APIView):
    """
    Return the organizations the caller is a member of, with nested
    tenants. Used by the ISP Owner SaaS Portal (app.example.com).
    """
    permission_classes = [IsCentralOrOrgMember]

    def get(self, request):
        memberships = OrganizationMembership.objects.filter(
            user=request.user, is_active=True
        ).select_related('organization').order_by('organization__name')

        results = []
        for m in memberships:
            org = m.organization
            tenants = org.tenants.all().order_by('-created_at')
            results.append({
                'organization': {
                    'id': str(org.id),
                    'name': org.name,
                    'slug': org.slug,
                    'plan_summary': org.notes,
                    'is_active': org.is_active,
                    'max_tenants': org.max_tenants,
                },
                'role': m.role,
                'tenants': [{
                    'id': str(t.id),
                    'name': t.name,
                    'slug': t.slug,
                    'plan': t.plan,
                    'subscription_status': t.subscription_status,
                    'is_active': t.is_active,
                    'max_subscribers': t.max_subscribers,
                    'max_routers': t.max_routers,
                    'primary_domain': t.domain,
                } for t in tenants],
            })

        # A superuser (central admin) sees ALL organizations if no membership.
        if request.user.is_superuser and not results:
            for org in Organization.objects.filter(is_active=True).order_by('name'):
                tenants = org.tenants.all().order_by('-created_at')
                results.append({
                    'organization': {
                        'id': str(org.id),
                        'name': org.name,
                        'slug': org.slug,
                        'is_active': org.is_active,
                        'max_tenants': org.max_tenants,
                    },
                    'role': 'SUPERUSER',
                    'tenants': [{
                        'id': str(t.id), 'name': t.name, 'slug': t.slug,
                        'plan': t.plan, 'subscription_status': t.subscription_status,
                        'is_active': t.is_active,
                    } for t in tenants],
                })
        return Response({'count': len(results), 'results': results})


class MyOrganizationDetailView(views.APIView):
    """Return a single organization the caller is a member of, by id."""
    permission_classes = [IsCentralOrOrgAdmin]

    def get(self, request, id):
        try:
            org = Organization.objects.get(id=id)
        except Organization.DoesNotExist:
            return Response({'error': 'Organization not found.'},
                            status=status.HTTP_404_NOT_FOUND)
        if not request.user.is_superuser:
            m = OrganizationMembership.get_active_membership(request.user, org)
            if m is None:
                return Response(
                    {'error': 'You are not a member of this organization.',
                     'code': 'NOT_ORG_MEMBER'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            role = m.role
        else:
            role = 'SUPERUSER'
        tenants = org.tenants.all().order_by('-created_at')
        return Response({
            'organization': OrganizationSerializer(org).data,
            'role': role,
            'tenants': [{
                'id': str(t.id), 'name': t.name, 'slug': t.slug,
                'plan': t.plan, 'subscription_status': t.subscription_status,
                'is_active': t.is_active,
            } for t in tenants],
        })

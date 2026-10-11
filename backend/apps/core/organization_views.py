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
import logging
from django.contrib.auth.models import User
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import permissions, serializers, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    AuditLog,
    Organization,
    OrganizationMembership,
    SaaSPackage,
    Tenant,
    TenantSubscription,
)
from .permissions import IsCentralAdmin

logger = logging.getLogger(__name__)


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
        # Loose check: user belongs to *some* org as OWNER/ADMIN. Object-level
        # enforcement (which org specifically) happens in has_object_permission.
        return OrganizationMembership.objects.filter(
            user=request.user, is_active=True,
            role__in=[OrganizationMembership.Role.OWNER,
                      OrganizationMembership.Role.ADMIN],
        ).exists()

    def has_object_permission(self, request, view, obj):
        """Object-level check: superusers pass, otherwise the caller must
        hold an active OWNER/ADMIN membership in `obj` (or, when given a
        Tenant, in the tenant's organization)."""
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        org = obj if isinstance(obj, Organization) else getattr(obj, 'organization', None)
        if org is None:
            return False
        return OrganizationMembership.objects.filter(
            user=request.user, organization=org, is_active=True,
            role__in=[OrganizationMembership.Role.OWNER,
                      OrganizationMembership.Role.ADMIN],
        ).exists()


# ── SaaS control-plane viewset ────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='List all ISP owner organizations',
        description=(
            'Central-admin listing of every `Organization` row. '
            'Filterable by `is_active` and free-text `search` (name/slug).'
        ),
        parameters=[
            OpenApiParameter(
                name='is_active', location=OpenApiParameter.QUERY,
                required=False, type=bool,
            ),
            OpenApiParameter(
                name='search', location=OpenApiParameter.QUERY,
                required=False, type=str,
            ),
        ],
    ),
    retrieve=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Retrieve an organization',
    ),
    create=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Create an organization (super-admin only)',
        description=(
            'Onboards a new ISP owner organization. Restricted to the '
            'central super-admin role.'
        ),
    ),
    update=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Update an organization',
    ),
    partial_update=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Patch an organization',
    ),
    destroy=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Delete an organization',
        description=(
            'Hard-deletes the org **and cascades to its tenants** '
            '(Tenant.organization is `on_delete=SET_NULL`, so the '
            'tenant rows survive as orphans). Prefer suspend via '
            '`PATCH /saas/organizations/<id>/` with `is_active=false` '
            'when you want to keep the data.'
        ),
    ),
)
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

@extend_schema(
    operation_id='organizations_me_list',
    tags=['20. Organization Admin Portal'],
    summary='List organizations the caller is a member of',
    description=(
        'ISP-owner-portal endpoint. Returns the organizations the '
        'authenticated caller has an active `OrganizationMembership` in, '
        'with each org\'s nested tenant list. Superusers see every org.'
    ),
    responses={
        200: OpenApiResponse(description='List of orgs the caller belongs to.'),
        401: OpenApiResponse(description='Authentication required.'),
    },
)
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


@extend_schema(
    operation_id='organizations_detail',
    tags=['20. Organization Admin Portal'],
    summary='Get an organization the caller is a member of',
    description=(
        'Returns the organization profile, the caller\'s role inside it '
        '(OWNER/ADMIN/MEMBER/BILLING/SUPERUSER), and a flat list of its '
        'tenants.'
    ),
    parameters=[
        OpenApiParameter(
            name='id', location=OpenApiParameter.PATH,
            description='Organization UUID.', required=True, type=str,
        ),
    ],
    responses={
        200: OpenApiResponse(description='Organization + role + tenants.'),
        401: OpenApiResponse(description='Authentication required.'),
        403: OpenApiResponse(description='Not a member of this organization.'),
        404: OpenApiResponse(description='Organization not found.'),
    },
)
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


# ════════════════════════════════════════════════════════════════════════════
# Stage 2.5 — Org-admin "tenants under organization" + Organization Dashboard
# ════════════════════════════════════════════════════════════════════════════
# When a SaaS subscriber (ISP owner) signs up, they register as an
# Organization. From their org dashboard they create Tenants (the ISP
# businesses they operate). When creating a Tenant they must pick a
# SaaSPackage — the subscription plan *we* (the platform owner) sell them.
#
# Endpoints (all under /api/v1/):
#   GET   /organizations/<id>/dashboard/         Org KPIs + recent activity
#   GET   /organizations/<id>/tenants/           List tenants under this org
#   POST  /organizations/<id>/tenants/           Create a tenant (requires package)
#   GET   /organizations/<id>/tenants/<tid>/     Tenant detail
#   POST  /organizations/<id>/tenants/<tid>/suspend/
#   POST  /organizations/<id>/tenants/<tid>/activate/
#   GET   /organizations/<id>/subscriptions/     Org-wide subscription roll-up
#   GET   /saas/packages/public/                 Public active packages list
# ════════════════════════════════════════════════════════════════════════════

# ── Additional imports for the org-admin surface ──────────────────────────
from datetime import timedelta
from django.db import transaction
from rest_framework.authtoken.models import Token

try:
    # Reuse the authoritative provisioning pipeline that the central
    # SaaS control plane uses. Defined in saas_views.py.
    from .saas_views import (
        provision_tenant_admin as _provision_tenant_admin,
        get_tenant_by_id_or_slug as _get_tenant_by_id_or_slug,
    )
except Exception:  # pragma: no cover - import order hardening
    _provision_tenant_admin = None
    _get_tenant_by_id_or_slug = None


# ── Org-admin serializers ─────────────────────────────────────────────────

class SaaSPackagePublicSerializer(serializers.ModelSerializer):
    """Slim serializer for the package picker on the org-admin tenant
    creation form. Hides internal flags and shows a yearly-savings hint."""

    monthly_savings_pct = serializers.SerializerMethodField()

    class Meta:
        model = SaaSPackage
        fields = [
            'id', 'name', 'code', 'description',
            'monthly_price', 'yearly_price', 'monthly_savings_pct',
            'max_subscribers', 'max_routers', 'max_custom_domains',
            'features', 'is_public',
        ]

    def get_monthly_savings_pct(self, obj):
        try:
            mp = float(obj.monthly_price or 0) * 12
            yp = float(obj.yearly_price or 0)
            if mp <= 0 or yp <= 0 or yp >= mp:
                return 0
            return int(round((1 - (yp / mp)) * 100))
        except Exception:
            return 0


class OrgTenantListSerializer(serializers.ModelSerializer):
    """Tenant row shown on the organization dashboard."""
    package_name = serializers.SerializerMethodField()
    subscription_status = serializers.SerializerMethodField()
    subscription_end_date = serializers.SerializerMethodField()
    subscriber_count = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'domain', 'contact_phone', 'contact_email',
            'is_active', 'subscription_status', 'subscription_end_date',
            'package_name', 'plan', 'subscriber_count',
            'created_at', 'updated_at',
        ]

    def _latest_sub(self, obj):
        """Return the most recent TenantSubscription for the tenant, or None."""
        try:
            return (
                obj.subscriptions
                .select_related('package')
                .order_by('-created_at')
                .first()
            )
        except Exception:
            return None

    def get_package_name(self, obj):
        sub = self._latest_sub(obj)
        if sub and getattr(sub, 'package', None):
            return sub.package.name
        return obj.plan or None

    def get_subscription_status(self, obj):
        sub = self._latest_sub(obj)
        return sub.status if sub else None

    def get_subscription_end_date(self, obj):
        sub = self._latest_sub(obj)
        return sub.end_date if sub else None

    def get_subscriber_count(self, obj):
        try:
            from apps.customers.models import Customer
            return Customer.objects.filter(tenant=obj).count()
        except Exception:
            return 0


class OrgTenantCreateSerializer(serializers.Serializer):
    """
    Payload for org-admin tenant creation.

    Required:
        name              — display name of the ISP tenant
        slug              — unique URL slug (lowercase, hyphenated)
        package           — SaaSPackage UUID the org picks as their plan
        admin_username    — login for the initial ISP admin
        admin_password    — initial password (caller can override after)
        admin_email       — email for the initial admin

    Optional:
        contact_phone, contact_email, contact_address,
        admin_first_name, admin_last_name, admin_phone,
        billing_cycle     — 'monthly' (default) or 'yearly'
        trial_days        — int, defaults to 14
    """
    name = serializers.CharField(max_length=150)
    slug = serializers.SlugField(max_length=100)
    package = serializers.UUIDField()
    admin_username = serializers.CharField(max_length=150)
    admin_password = serializers.CharField(min_length=8, write_only=True)
    admin_email = serializers.EmailField(required=False, allow_blank=True)
    contact_phone = serializers.CharField(
        max_length=30, required=False, allow_blank=True
    )
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    contact_address = serializers.CharField(
        required=False, allow_blank=True
    )
    admin_first_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True
    )
    admin_last_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True
    )
    admin_phone = serializers.CharField(
        max_length=30, required=False, allow_blank=True
    )
    billing_cycle = serializers.ChoiceField(
        choices=['monthly', 'yearly'], default='monthly'
    )
    trial_days = serializers.IntegerField(
        required=False, default=14, min_value=0, max_value=90
    )

    def validate_slug(self, value):
        slug = (value or '').strip().lower()
        if not slug:
            raise serializers.ValidationError('Slug is required.')
        if Tenant.objects.filter(slug__iexact=slug).exists():
            raise serializers.ValidationError(
                'A tenant with this slug already exists.'
            )
        return slug

    def validate_package(self, value):
        try:
            pkg = SaaSPackage.objects.get(id=value, is_active=True)
        except SaaSPackage.DoesNotExist:
            raise serializers.ValidationError(
                'Package not found or not available for new sign-ups.'
            )
        return pkg  # return the model so create() has it

    def validate_admin_username(self, value):
        username = (value or '').strip().lower()
        if not username:
            raise serializers.ValidationError('admin_username is required.')
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError(
                'This admin username is already taken.'
            )
        return username


class OrgTenantDetailSerializer(OrgTenantListSerializer):
    """Extended tenant detail for the org-admin tenant view."""
    primary_domain = serializers.SerializerMethodField()
    domains_count = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()
    recent_admins = serializers.SerializerMethodField()

    class Meta(OrgTenantListSerializer.Meta):
        fields = OrgTenantListSerializer.Meta.fields + [
            'address', 'primary_domain', 'domains_count', 'subscription',
            'recent_admins',
        ]

    def get_primary_domain(self, obj):
        try:
            d = obj.tenant_domains.filter(is_primary=True, is_active=True).first()
            return d.hostname if d else None
        except Exception:
            return None

    def get_domains_count(self, obj):
        try:
            return obj.tenant_domains.filter(is_active=True).count()
        except Exception:
            return 0

    def get_subscription(self, obj):
        sub = self._latest_sub(obj)
        if not sub:
            return None
        return {
            'id': str(sub.id),
            'package_id': str(sub.package_id) if sub.package_id else None,
            'package_name': sub.package.name if sub.package else None,
            'billing_cycle': sub.billing_cycle,
            'price': str(sub.price),
            'status': sub.status,
            'start_date': sub.start_date.isoformat() if sub.start_date else None,
            'end_date': sub.end_date.isoformat() if sub.end_date else None,
            'next_billing_date': (
                sub.next_billing_date.isoformat()
                if sub.next_billing_date else None
            ),
            'auto_renew': sub.auto_renew,
        }

    def get_recent_admins(self, obj):
        try:
            from apps.authentication.models import StaffProfile
            rows = (
                StaffProfile.objects
                .filter(tenant=obj, is_active=True)
                .order_by('-created_at')[:5]
            )
            out = []
            for sp in rows:
                u = sp.user
                out.append({
                    'username': u.username,
                    'full_name': (
                        f"{u.first_name} {u.last_name}".strip() or u.username
                    ),
                    'email': u.email,
                    'role': sp.role,
                    'last_login': (
                        u.last_login.isoformat() if u.last_login else None
                    ),
                })
            return out
        except Exception:
            return []


# ── Org-admin views ───────────────────────────────────────────────────────

@extend_schema(
    operation_id='organizations_dashboard',
    tags=['20. Organization Admin Portal'],
    summary='Organization dashboard',
    description=(
        'Aggregated KPIs and activity feed for a single organization the '
        'caller administers.\n\n'
        'Returns tenant counts (total / active / suspended), subscriber '
        'rollups across all org tenants, estimated Monthly Recurring '
        'Revenue (MRR) from active subscriptions, a per-package revenue '
        'breakdown, the 5 most recent tenants, and the 10 most recent '
        'audit-log events emitted by any tenant under this org.\n\n'
        'Accessible by an active OWNER or ADMIN member of the target '
        'organization, or by a platform superuser.'
    ),
    parameters=[
        OpenApiParameter(
            name='id', location=OpenApiParameter.PATH,
            description='Organization UUID.',
            required=True, type=str,
        ),
    ],
    responses={
        200: OpenApiResponse(
            description='Organization dashboard payload.',
            response=dict,
            examples=[
                OpenApiExample(
                    'Success',
                    value={
                        'organization': {
                            'id': '8a3b...uuid',
                            'name': 'Acme ISP Holdings',
                            'slug': 'acme-isp',
                            'is_active': True,
                            'max_tenants': 10,
                        },
                        'kpis': {
                            'tenant_count': 3,
                            'active_tenants': 3,
                            'suspended_tenants': 0,
                            'total_subscribers': 1240,
                            'active_subscribers': 1100,
                            'mrr_estimated': 45000.00,
                            'packages_available': 4,
                        },
                        'subscriptions_by_package': [
                            {
                                'package_id': '8a3b...uuid',
                                'package_name': 'Growth',
                                'tenant_count': 2,
                                'monthly_revenue': 30000.00,
                            }
                        ],
                        'recent_tenants': [],
                        'recent_activity': [],
                        'generated_at': '2026-10-10T12:00:00Z',
                    },
                ),
            ],
        ),
        401: OpenApiResponse(description='Authentication required.'),
        403: OpenApiResponse(description='Not an admin of this organization.'),
        404: OpenApiResponse(description='Organization not found.'),
    },
)
class OrganizationDashboardView(views.APIView):
    """
    GET /api/v1/organizations/<id>/dashboard/

    Returns KPIs for the organization:
        - tenant_count, active_tenant_count, suspended_tenant_count
        - total_subscriber_count (across all org tenants)
        - mrr_estimated (sum of monthly prices for active subscriptions)
        - packages_available (count of active SaaSPackages)
        - tenants (top 5 most recent)
        - subscriptions_by_package (rollup)
        - recent_activity (last 10 audit log entries for org's tenants)
    """
    permission_classes = [IsCentralOrOrgAdmin]

    def get(self, request, id):
        try:
            org = Organization.objects.get(id=id)
        except Organization.DoesNotExist:
            return Response(
                {'error': 'Organization not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Per-object membership check (superusers bypass)
        if not request.user.is_superuser:
            m = OrganizationMembership.get_active_membership(request.user, org)
            if m is None or m.role not in (
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ):
                return Response(
                    {'error': 'You are not an admin of this organization.',
                     'code': 'NOT_ORG_ADMIN'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        tenants_qs = org.tenants.all()
        tenant_count = tenants_qs.count()
        active_tenants = tenants_qs.filter(is_active=True).count()
        suspended_tenants = tenants_qs.filter(is_active=False).count()

        # Subscriber rollup (best-effort: a few failed app imports should
        # not break the dashboard).
        total_subscribers = 0
        active_subscribers = 0
        try:
            from apps.customers.models import Customer
            tenant_ids = list(tenants_qs.values_list('id', flat=True))
            if tenant_ids:
                sub_qs = Customer.objects.filter(tenant_id__in=tenant_ids)
                total_subscribers = sub_qs.count()
                active_subscribers = sub_qs.filter(status='Active').count()
        except Exception:
            pass

        # MRR (Monthly Recurring Revenue) from active subscriptions
        mrr_estimated = 0
        subscriptions_by_package = []
        try:
            active_subs = TenantSubscription.objects.filter(
                tenant__organization=org, status='active',
            ).select_related('package', 'tenant')
            for sub in active_subs:
                if sub.billing_cycle == 'yearly' and sub.package:
                    monthly = float(sub.package.monthly_price or 0)
                else:
                    monthly = float(sub.price or 0)
                mrr_estimated += monthly
            # Rollup by package
            from collections import OrderedDict
            rollup = OrderedDict()
            for sub in active_subs:
                if not sub.package:
                    continue
                key = sub.package.code or sub.package.name
                if key not in rollup:
                    rollup[key] = {
                        'package_id': str(sub.package.id),
                        'package_name': sub.package.name,
                        'tenant_count': 0,
                        'monthly_revenue': 0.0,
                    }
                rollup[key]['tenant_count'] += 1
                if sub.billing_cycle == 'yearly':
                    rollup[key]['monthly_revenue'] += float(
                        sub.package.monthly_price or 0
                    )
                else:
                    rollup[key]['monthly_revenue'] += float(sub.price or 0)
            subscriptions_by_package = list(rollup.values())
        except Exception:
            pass

        # Recent activity (audit log)
        recent_activity = []
        try:
            tenant_ids = list(tenants_qs.values_list('id', flat=True))
            if tenant_ids:
                logs = (
                    AuditLog.objects
                    .filter(tenant_id__in=tenant_ids)
                    .order_by('-timestamp')[:10]
                )
                for log in logs:
                    recent_activity.append({
                        'id': log.id,
                        'timestamp': log.timestamp.isoformat(),
                        'actor': log.actor_username,
                        'action': log.action,
                        'module': log.module,
                        'resource_type': log.resource_type,
                        'resource_id': log.resource_id,
                        'tenant_id': str(log.tenant_id) if log.tenant_id else None,
                    })
        except Exception:
            pass

        # Available packages (active, public-or-not — orgs see all active)
        packages_available = SaaSPackage.objects.filter(is_active=True).count()

        # Top 5 most recent tenants
        recent_tenants_qs = tenants_qs.order_by('-created_at')[:5]
        recent_tenants = OrgTenantListSerializer(
            recent_tenants_qs, many=True
        ).data

        return Response({
            'organization': {
                'id': str(org.id),
                'name': org.name,
                'slug': org.slug,
                'is_active': org.is_active,
                'max_tenants': org.max_tenants,
            },
            'kpis': {
                'tenant_count': tenant_count,
                'active_tenants': active_tenants,
                'suspended_tenants': suspended_tenants,
                'total_subscribers': total_subscribers,
                'active_subscribers': active_subscribers,
                'mrr_estimated': round(mrr_estimated, 2),
                'packages_available': packages_available,
            },
            'subscriptions_by_package': subscriptions_by_package,
            'recent_tenants': recent_tenants,
            'recent_activity': recent_activity,
            'generated_at': timezone.now().isoformat(),
        })


@extend_schema_view(
    get=extend_schema(
        operation_id='organizations_tenants_list',
        tags=['20. Organization Admin Portal'],
        summary='List tenants under an organization',
        description=(
            'Returns the tenants owned by the target organization. '
            'Filterable by `is_active` (true/false) and by free-text '
            '`search` (matches name or slug). Result is capped by `limit` '
            '(default 50, max 200).'
        ),
        parameters=[
            OpenApiParameter(
                name='is_active', location=OpenApiParameter.QUERY,
                description='Filter by active state.', required=False,
                type=bool,
            ),
            OpenApiParameter(
                name='search', location=OpenApiParameter.QUERY,
                description='Case-insensitive substring match on name or slug.',
                required=False, type=str,
            ),
            OpenApiParameter(
                name='limit', location=OpenApiParameter.QUERY,
                description='Max rows to return (1–200, default 50).',
                required=False, type=int,
            ),
        ],
        responses={
            200: OpenApiResponse(description='Paginated list of tenants.'),
            401: OpenApiResponse(description='Authentication required.'),
            403: OpenApiResponse(description='Not an admin of this organization.'),
            404: OpenApiResponse(description='Organization not found.'),
        },
    ),
    post=extend_schema(
        operation_id='organizations_tenants_create',
        tags=['20. Organization Admin Portal'],
        summary='Create a tenant under the organization (requires package)',
        description=(
            'Onboards a new ISP tenant under the target organization. The '
            '**`package` field is required** — the caller picks one of the '
            'active `SaaSPackage` rows (see `GET /saas/packages/public/`).\n\n'
            'This single transaction:\n'
            '  1. Creates the `Tenant` and applies the package quotas.\n'
            '  2. Provisions the initial ISP admin (User + StaffProfile + '
            '     StaffMembership + Auth Token) using the same authoritative '
            '     pipeline the central control plane uses.\n'
            '  3. Creates a `TenantSubscription` on the chosen package and '
            '     mirrors `status` onto `Tenant.subscription_status`.\n'
            '  4. Emits an `organization.tenant.create` audit log entry.\n\n'
            'Enforces `Organization.max_tenants` quota. If the org has no '
            'remaining slots, the call fails with `403 TENANT_QUOTA_EXCEEDED`.'
        ),
        request={
            'application/json': {
                'type': 'object',
                'required': [
                    'name', 'slug', 'package',
                    'admin_username', 'admin_password',
                ],
                'properties': {
                    'name': {'type': 'string', 'example': 'Acme ISP Dhaka'},
                    'slug': {'type': 'string', 'example': 'acme-dhaka'},
                    'package': {
                        'type': 'string', 'format': 'uuid',
                        'description': 'SaaSPackage UUID the org picks.',
                    },
                    'admin_username': {'type': 'string', 'example': 'acme_admin'},
                    'admin_password': {
                        'type': 'string', 'format': 'password',
                        'minLength': 8,
                    },
                    'admin_email': {'type': 'string', 'format': 'email'},
                    'admin_first_name': {'type': 'string'},
                    'admin_last_name': {'type': 'string'},
                    'admin_phone': {'type': 'string'},
                    'contact_phone': {'type': 'string'},
                    'contact_email': {'type': 'string', 'format': 'email'},
                    'contact_address': {'type': 'string'},
                    'billing_cycle': {
                        'type': 'string', 'enum': ['monthly', 'yearly'],
                        'default': 'monthly',
                    },
                    'trial_days': {
                        'type': 'integer', 'minimum': 0, 'maximum': 90,
                        'default': 14,
                    },
                },
            },
        },
        responses={
            201: OpenApiResponse(
                description='Tenant provisioned. Body includes the new admin token.',
                response=dict,
                examples=[
                    OpenApiExample(
                        'Success',
                        value={
                            'tenant': {
                                'id': '8a3b...uuid', 'name': 'Acme ISP Dhaka',
                                'slug': 'acme-dhaka', 'is_active': True,
                                'subscription_status': 'trial',
                            },
                            'subscription': {
                                'id': '8a3b...uuid',
                                'package_name': 'Growth',
                                'billing_cycle': 'monthly',
                                'price': '15000.00',
                                'status': 'trial',
                            },
                            'admin': {
                                'username': 'acme_admin',
                                'email': 'admin@acme.test',
                                'token': '<one-time auth token>',
                                'login_url': '/api/v1/auth/login/',
                            },
                        },
                    ),
                ],
            ),
            400: OpenApiResponse(description='Validation error (missing/invalid fields).'),
            401: OpenApiResponse(description='Authentication required.'),
            403: OpenApiResponse(description='Not an admin of this organization, or tenant quota exceeded.'),
            404: OpenApiResponse(description='Organization not found.'),
        },
        examples=[
            OpenApiExample(
                'Trial signup',
                value={
                    'name': 'Acme ISP Dhaka',
                    'slug': 'acme-dhaka',
                    'package': '8a3b-...-package-uuid',
                    'admin_username': 'acme_admin',
                    'admin_password': 'Strong-Pa55!',
                    'admin_email': 'admin@acme.test',
                    'billing_cycle': 'monthly',
                    'trial_days': 14,
                },
                request_only=True,
            ),
        ],
    ),
)
class OrganizationTenantListCreateView(views.APIView):
    """
    GET  /api/v1/organizations/<id>/tenants/   — list tenants under org
    POST /api/v1/organizations/<id>/tenants/   — create a tenant (requires
                                                  SaaSPackage selection)
    """
    permission_classes = [IsCentralOrOrgAdmin]

    def _get_org_for_user(self, request, org_id):
        try:
            org = Organization.objects.get(id=org_id)
        except Organization.DoesNotExist:
            return None, Response(
                {'error': 'Organization not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not request.user.is_superuser:
            m = OrganizationMembership.get_active_membership(request.user, org)
            if m is None or m.role not in (
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ):
                return org, Response(
                    {'error': 'You are not an admin of this organization.',
                     'code': 'NOT_ORG_ADMIN'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return org, None

    def get(self, request, id):
        org, err = self._get_org_for_user(request, id)
        if err:
            return err
        qs = org.tenants.all().order_by('-created_at')
        # Filters
        is_active = request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(slug__icontains=search)
            )
        try:
            limit = int(request.query_params.get('limit', 50))
        except (TypeError, ValueError):
            limit = 50
        limit = max(1, min(limit, 200))
        # Materialize the count BEFORE slicing (which would lose the count)
        total = qs.count()
        qs = qs[:limit]
        return Response({
            'count': total,
            'results': OrgTenantListSerializer(qs, many=True).data,
        })

    def post(self, request, id):
        org, err = self._get_org_for_user(request, id)
        if err:
            return err

        # Quota check (org.max_tenants)
        if org.max_tenants and org.tenants.count() >= org.max_tenants:
            return Response(
                {
                    'error': (
                        f'Organization has reached its tenant limit '
                        f'({org.max_tenants}). Upgrade your plan to add more.'
                    ),
                    'code': 'TENANT_QUOTA_EXCEEDED',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = OrgTenantCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        package = data['package']  # SaaSPackage instance (from validate_package)

        if _provision_tenant_admin is None or _get_tenant_by_id_or_slug is None:
            return Response(
                {'error': 'Tenant provisioning pipeline is not available.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            with transaction.atomic():
                # 1) Create the Tenant under this org, applying the
                #    package's quotas so downstream feature gates kick in.
                tenant_create_kwargs = dict(
                    name=data['name'],
                    slug=data['slug'],
                    organization=org,
                    contact_phone=data.get('contact_phone', '') or '',
                    contact_email=data.get('contact_email', '') or '',
                    address=data.get('contact_address', '') or '',
                    plan=package.name,
                    max_subscribers=package.max_subscribers,
                    max_routers=package.max_routers,
                    is_active=True,
                )
                # Only set max_custom_domains if the Tenant model supports it
                # (some deployments may pre-date the migration that added it).
                if any(
                    f.name == 'max_custom_domains'
                    for f in Tenant._meta.get_fields()
                ):
                    tenant_create_kwargs['max_custom_domains'] = (
                        package.max_custom_domains
                    )
                tenant = Tenant.objects.create(**tenant_create_kwargs)

                # 2) Provision the initial ISP admin (User + StaffProfile
                #    + StaffMembership + Token) using the same authoritative
                #    pipeline that the central control plane uses.
                _provision_tenant_admin(
                    tenant=tenant,
                    username=data['admin_username'],
                    password=data['admin_password'],
                    email=data.get('admin_email', ''),
                    phone=data.get('admin_phone', ''),
                    first_name=data.get('admin_first_name', ''),
                    last_name=data.get('admin_last_name', ''),
                )

                # 3) Create the TenantSubscription on the chosen package.
                now = timezone.now()
                trial_days = int(data.get('trial_days') or 0)
                if trial_days > 0:
                    sub_status = 'trial'
                    start = now
                    end = now + timedelta(days=trial_days)
                else:
                    sub_status = 'active'
                    start = now
                    if data['billing_cycle'] == 'yearly':
                        end = now + timedelta(days=365)
                    else:
                        end = now + timedelta(days=30)

                price = (
                    package.yearly_price
                    if data['billing_cycle'] == 'yearly'
                    else package.monthly_price
                )

                sub = TenantSubscription.objects.create(
                    tenant=tenant,
                    package=package,
                    billing_cycle=data['billing_cycle'],
                    price=price,
                    status=sub_status,
                    start_date=start,
                    end_date=end,
                    next_billing_date=end,
                    auto_renew=True,
                )

                # 4) Mirror the status onto Tenant.subscription_status
                #    (used by IsTenantMember feature gates).
                update_fields = ['subscription_status']
                tenant.subscription_status = sub_status
                if hasattr(tenant, 'subscription_plan_id'):
                    tenant.subscription_plan_id = package.id
                    update_fields.append('subscription_plan_id')
                tenant.save(update_fields=update_fields)

                # 5) Audit log: org admin created a tenant
                AuditLog.objects.create(
                    tenant=tenant,
                    actor_username=request.user.username,
                    action='organization.tenant.create',
                    module='Organization',
                    resource_type='Tenant',
                    resource_id=str(tenant.id),
                    details={
                        'organization_id': str(org.id),
                        'package_id': str(package.id),
                        'package_code': package.code,
                        'billing_cycle': data['billing_cycle'],
                        'admin_username': data['admin_username'],
                    },
                )
        except Exception as exc:
            logger.exception('Org-admin tenant creation failed.')
            return Response(
                {
                    'error': 'Failed to provision tenant.',
                    'detail': str(exc),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Issue a token for the newly-provisioned admin (idempotent)
        try:
            admin_user = User.objects.get(
                username=data['admin_username'].lower()
            )
            token, _ = Token.objects.get_or_create(user=admin_user)
        except Exception:
            token = None

        return Response(
            {
                'tenant': OrgTenantDetailSerializer(tenant).data,
                'subscription': {
                    'id': str(sub.id),
                    'package_id': str(package.id),
                    'package_name': package.name,
                    'billing_cycle': sub.billing_cycle,
                    'price': str(sub.price),
                    'status': sub.status,
                    'start_date': sub.start_date.isoformat(),
                    'end_date': sub.end_date.isoformat(),
                },
                'admin': {
                    'username': data['admin_username'],
                    'email': data.get('admin_email', ''),
                    'token': token.key if token else None,
                    'login_url': '/api/v1/auth/login/',
                },
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    operation_id='organizations_tenant_detail',
    tags=['20. Organization Admin Portal'],
    summary='Get a tenant under the organization',
    description=(
        'Returns the full detail of one tenant owned by the target '
        'organization, including its current SaaSPackage subscription, '
        'primary domain, and a list of recent admin accounts.'
    ),
    parameters=[
        OpenApiParameter(
            name='id', location=OpenApiParameter.PATH,
            description='Organization UUID.', required=True, type=str,
        ),
        OpenApiParameter(
            name='tid', location=OpenApiParameter.PATH,
            description='Tenant UUID or slug.', required=True, type=str,
        ),
    ],
    responses={
        200: OpenApiResponse(description='Tenant detail payload.'),
        401: OpenApiResponse(description='Authentication required.'),
        403: OpenApiResponse(description='Not an admin of this organization.'),
        404: OpenApiResponse(description='Tenant not found under this organization.'),
    },
)
class OrganizationTenantDetailView(views.APIView):
    """
    GET /api/v1/organizations/<id>/tenants/<tid>/   — view a tenant
    """
    permission_classes = [IsCentralOrOrgAdmin]

    def _get_tenant(self, request, org_id, tenant_id):
        try:
            org = Organization.objects.get(id=org_id)
        except Organization.DoesNotExist:
            return None, None, Response(
                {'error': 'Organization not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not request.user.is_superuser:
            m = OrganizationMembership.get_active_membership(request.user, org)
            if m is None or m.role not in (
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ):
                return org, None, Response(
                    {'error': 'You are not an admin of this organization.',
                     'code': 'NOT_ORG_ADMIN'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        tenant = _get_tenant_by_id_or_slug(tenant_id) if _get_tenant_by_id_or_slug else None
        if not tenant or tenant.organization_id != org.id:
            return org, None, Response(
                {'error': 'Tenant not found under this organization.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return org, tenant, None

    def get(self, request, id, tid):
        org, tenant, err = self._get_tenant(request, id, tid)
        if err:
            return err
        return Response(OrgTenantDetailSerializer(tenant).data)


@extend_schema(
    operation_id='organizations_tenant_action',
    tags=['20. Organization Admin Portal'],
    summary='Suspend or activate a tenant under the organization',
    description=(
        'Performs a lifecycle action on a single tenant owned by the '
        'target organization. The action is encoded in the URL path:\n\n'
        '  - `…/suspend/`  — flips `is_active=False` and '
        '`subscription_status="paused"`, cascades to the active '
        '`TenantSubscription` row, and emits an '
        '`organization.tenant.suspend` audit log entry.\n'
        '  - `…/activate/` — flips `is_active=True` and '
        '`subscription_status="active"`, cascades to the active '
        '`TenantSubscription` row, and emits an '
        '`organization.tenant.activate` audit log entry.'
    ),
    parameters=[
        OpenApiParameter(
            name='id', location=OpenApiParameter.PATH,
            description='Organization UUID.', required=True, type=str,
        ),
        OpenApiParameter(
            name='tid', location=OpenApiParameter.PATH,
            description='Tenant UUID or slug.', required=True, type=str,
        ),
        OpenApiParameter(
            name='action', location=OpenApiParameter.PATH,
            description='Either `suspend` or `activate`.',
            required=True, type=str,
            enum=['suspend', 'activate'],
        ),
    ],
    responses={
        200: OpenApiResponse(
            description='Action applied. Returns the tenant id, active flag, and subscription status.',
            examples=[
                OpenApiExample(
                    'suspend',
                    value={
                        'tenant_id': '8a3b...uuid',
                        'is_active': False,
                        'subscription_status': 'paused',
                    },
                ),
                OpenApiExample(
                    'activate',
                    value={
                        'tenant_id': '8a3b...uuid',
                        'is_active': True,
                        'subscription_status': 'active',
                    },
                ),
            ],
        ),
        400: OpenApiResponse(description='Unsupported action verb.'),
        401: OpenApiResponse(description='Authentication required.'),
        403: OpenApiResponse(description='Not an admin of this organization.'),
        404: OpenApiResponse(description='Tenant not found under this organization.'),
    },
    methods=['POST'],
)
class OrganizationTenantActionView(views.APIView):
    """Suspend/activate a tenant under an organization.

    POST /api/v1/organizations/<id>/tenants/<tid>/suspend/
    POST /api/v1/organizations/<id>/tenants/<tid>/activate/
    """
    permission_classes = [IsCentralOrOrgAdmin]

    # No request body, but declaring an empty serializer keeps
    # drf-spectacular from emitting the "unable to guess serializer"
    # warning. The response shape is documented in @extend_schema.
    serializer_class = serializers.Serializer

    def post(self, request, id, tid, action):
        if action not in ('suspend', 'activate'):
            return Response(
                {'error': f'Unsupported action "{action}".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            org = Organization.objects.get(id=id)
        except Organization.DoesNotExist:
            return Response(
                {'error': 'Organization not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not request.user.is_superuser:
            m = OrganizationMembership.get_active_membership(request.user, org)
            if m is None or m.role not in (
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ):
                return Response(
                    {'error': 'You are not an admin of this organization.',
                     'code': 'NOT_ORG_ADMIN'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        tenant = _get_tenant_by_id_or_slug(tid) if _get_tenant_by_id_or_slug else None
        if not tenant or tenant.organization_id != org.id:
            return Response(
                {'error': 'Tenant not found under this organization.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if action == 'suspend':
            tenant.is_active = False
            tenant.subscription_status = 'paused'
        else:
            tenant.is_active = True
            tenant.subscription_status = 'active'
        tenant.save(update_fields=['is_active', 'subscription_status'])

        # Mirror to the active subscription row, if any
        try:
            sub = (
                TenantSubscription.objects
                .filter(tenant=tenant)
                .order_by('-created_at')
                .first()
            )
            if sub:
                sub.status = 'paused' if action == 'suspend' else 'active'
                sub.save(update_fields=['status'])
        except Exception:
            pass

        AuditLog.objects.create(
            tenant=tenant,
            actor_username=request.user.username,
            action=f'organization.tenant.{action}',
            module='Organization',
            resource_type='Tenant',
            resource_id=str(tenant.id),
            details={'organization_id': str(org.id)},
        )

        return Response({
            'tenant_id': str(tenant.id),
            'is_active': tenant.is_active,
            'subscription_status': tenant.subscription_status,
        })


@extend_schema(
    operation_id='organizations_subscriptions_list',
    tags=['20. Organization Admin Portal'],
    summary='Org-wide subscription roll-up',
    description=(
        'Returns every `TenantSubscription` row whose tenant is owned by '
        'the target organization, ordered by `created_at` descending. '
        'Use this for billing reconciliation, renewal forecasts, and '
        'per-package revenue views from the org-admin portal.'
    ),
    parameters=[
        OpenApiParameter(
            name='id', location=OpenApiParameter.PATH,
            description='Organization UUID.', required=True, type=str,
        ),
    ],
    responses={
        200: OpenApiResponse(description='List of subscriptions.'),
        401: OpenApiResponse(description='Authentication required.'),
        403: OpenApiResponse(description='Not an admin of this organization.'),
        404: OpenApiResponse(description='Organization not found.'),
    },
)
class OrganizationSubscriptionsView(views.APIView):
    """
    GET /api/v1/organizations/<id>/subscriptions/

    Org-wide subscription roll-up across every tenant the org owns.
    """
    permission_classes = [IsCentralOrOrgAdmin]
    # Empty serializer suppresses the drf-spectacular "unable to guess
    # serializer" warning. The response shape is documented in @extend_schema.
    serializer_class = serializers.Serializer

    def get(self, request, id):
        try:
            org = Organization.objects.get(id=id)
        except Organization.DoesNotExist:
            return Response(
                {'error': 'Organization not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not request.user.is_superuser:
            m = OrganizationMembership.get_active_membership(request.user, org)
            if m is None or m.role not in (
                OrganizationMembership.Role.OWNER,
                OrganizationMembership.Role.ADMIN,
            ):
                return Response(
                    {'error': 'You are not an admin of this organization.',
                     'code': 'NOT_ORG_ADMIN'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        subs = (
            TenantSubscription.objects
            .filter(tenant__organization=org)
            .select_related('tenant', 'package')
            .order_by('-created_at')
        )
        rows = []
        for s in subs:
            rows.append({
                'id': str(s.id),
                'tenant_id': str(s.tenant_id),
                'tenant_name': s.tenant.name,
                'tenant_slug': s.tenant.slug,
                'package_id': str(s.package_id) if s.package_id else None,
                'package_name': s.package.name if s.package else None,
                'billing_cycle': s.billing_cycle,
                'price': str(s.price),
                'status': s.status,
                'start_date': s.start_date.isoformat() if s.start_date else None,
                'end_date': s.end_date.isoformat() if s.end_date else None,
                'next_billing_date': (
                    s.next_billing_date.isoformat()
                    if s.next_billing_date else None
                ),
                'auto_renew': s.auto_renew,
            })
        return Response({
            'count': len(rows),
            'results': rows,
        })


@extend_schema(
    operation_id='saas_packages_public_list',
    tags=['20. Organization Admin Portal'],
    summary='List active SaaS subscription packages (public)',
    description=(
        'Returns the active `SaaSPackage` rows that organization admins '
        'can pick from when creating a new tenant. Requires '
        'authentication (so anonymous scrapers cannot enumerate pricing) '
        'but does not require platform-admin privileges.\n\n'
        'Add `?public=1` to filter to packages flagged '
        '`is_public=True` (i.e. the ones shown on the marketing site).'
    ),
    parameters=[
        OpenApiParameter(
            name='public', location=OpenApiParameter.QUERY,
            description='When `1`/`true`/`yes`, restrict to packages with `is_public=True`.',
            required=False, type=bool,
        ),
    ],
    responses={
        200: OpenApiResponse(description='Paginated package list.'),
        401: OpenApiResponse(description='Authentication required.'),
    },
)
class PublicSaaSPackageListView(views.APIView):
    """
    GET /api/v1/saas/packages/public/

    Public list of active SaaSPackages. Used by the org-admin tenant
    creation form. Requires authentication (so anonymous scrapers cannot
    enumerate pricing) but does not require platform-admin privileges.

    The full SaaS super-admin SaaSPackageViewSet remains at
    `/api/v1/saas/packages/` for the central control plane.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = SaaSPackage.objects.filter(is_active=True).order_by('monthly_price')
        # Optionally expose only public packages if ?public=1
        if request.query_params.get('public') in ('1', 'true', 'yes'):
            qs = qs.filter(is_public=True)
        return Response({
            'count': qs.count(),
            'results': SaaSPackagePublicSerializer(qs, many=True).data,
        })

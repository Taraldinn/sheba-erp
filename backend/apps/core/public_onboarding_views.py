"""
Public, anonymous-facing onboarding endpoint for self-serve sign-ups.

Mounted at /api/v1/public/onboarding/ (no auth). Reuses the
saas-owner `create-with-first-tenant` pipeline but additionally
handles two cases:

 1. **Paid / open plan chosen** → auto-provision the org, first
    tenant, owner and subscription immediately, return a one-time
    `claim_url` for the owner to set their password.
 2. **No plan / trial only** → enqueue a `TenantOnboardingRequest`
    for saas-admin approval; the owner gets a "we'll be in touch"
    acknowledgement in the UI.

Throttling: AnonRateThrottle at 5/hour (settings.THROTTLE_RATES).
"""
from __future__ import annotations

import secrets
import string
import uuid
from datetime import timedelta

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from drf_spectacular.utils import (
    OpenApiResponse,
    extend_schema,
)
from rest_framework import permissions, serializers, status, views
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .models import (
    AuditLog,
    Organization,
    OrganizationMembership,
    SaaSPackage,
    Tenant,
    TenantOnboardingRequest,
    TenantSubscription,
)


# ── Throttle ──────────────────────────────────────────────────────────────


class PublicOnboardingThrottle(AnonRateThrottle):
    scope = 'public_onboarding'


# ── Serializers ───────────────────────────────────────────────────────────


class PublicOnboardingInputSerializer(serializers.Serializer):
    """
    Body for `POST /api/v1/public/onboarding/`.

    Only the bare minimum is required. `package` is optional — when omitted
    (or when the chosen package has `is_public=False`) the request is queued
    for manual review by the saas admin.
    """
    # Organization
    org_name = serializers.CharField(max_length=200)
    org_slug = serializers.SlugField(max_length=120, required=False, allow_blank=True)
    org_contact_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    org_contact_email = serializers.EmailField()
    org_address = serializers.CharField(required=False, allow_blank=True)
    # First tenant
    tenant_name = serializers.CharField(max_length=150)
    tenant_slug = serializers.SlugField(max_length=100)
    tenant_domain = serializers.CharField(max_length=255, required=False, allow_blank=True)
    # Plan (optional)
    package = serializers.UUIDField(required=False, allow_null=True)
    # Owner / account
    owner_username = serializers.CharField(max_length=150, required=False, allow_blank=True)
    owner_email = serializers.EmailField(required=False, allow_blank=True)
    owner_first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    owner_last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    owner_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    # Misc
    notes = serializers.CharField(required=False, allow_blank=True)
    ref = serializers.CharField(max_length=64, required=False, allow_blank=True)
    billing_cycle = serializers.ChoiceField(choices=['monthly', 'yearly'], default='monthly')
    trial_days = serializers.IntegerField(required=False, default=14, min_value=0, max_value=90)

    def validate(self, attrs):
        attrs['org_slug'] = (attrs.get('org_slug') or slugify(attrs['org_name'])).strip().lower()
        if Organization.objects.filter(slug=attrs['org_slug']).exists():
            raise serializers.ValidationError({'org_slug': 'An organization with this slug already exists.'})
        if Tenant.objects.filter(slug__iexact=attrs['tenant_slug']).exists():
            raise serializers.ValidationError({'tenant_slug': 'A tenant with this slug already exists.'})
        if not attrs.get('owner_email'):
            attrs['owner_email'] = attrs['org_contact_email']
        if not attrs.get('owner_username'):
            attrs['owner_username'] = f"{attrs['tenant_slug']}_owner"
        if User.objects.filter(username__iexact=attrs['owner_username']).exists():
            raise serializers.ValidationError({'owner_username': 'This username is already taken.'})
        return attrs


# ── Helpers ───────────────────────────────────────────────────────────────


def _generate_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


# ── View ──────────────────────────────────────────────────────────────────


@extend_schema(
    tags=['22. Public Onboarding'],
    summary='Public self-serve organization onboarding',
    description=(
        'Submit a self-serve sign-up. When a public, paid plan is chosen the '
        'organization, first tenant, owner, and subscription are created '
        'atomically and a one-time `claim_url` is returned. Otherwise a '
        'TenantOnboardingRequest is queued for saas-admin approval.\n\n'
        'Throttled at 5 requests per hour per IP.'
    ),
    request=PublicOnboardingInputSerializer,
    responses={
        201: OpenApiResponse(description='Onboarding accepted (auto-provisioned or queued).'),
        400: OpenApiResponse(description='Validation error.'),
        429: OpenApiResponse(description='Throttled.'),
    },
)
class PublicOnboardingView(views.APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [PublicOnboardingThrottle]

    def post(self, request):
        ser = PublicOnboardingInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        v = ser.validated_data
        package_id = v.get('package')
        package = None
        if package_id:
            package = SaaSPackage.objects.filter(id=package_id, is_public=True, is_active=True).first()
        # If the caller asked for a package but it isn't public/active, treat as
        # no-package and route to the manual review queue rather than failing.
        auto_provision = package is not None
        claim_token = secrets.token_urlsafe(24)
        try:
            with transaction.atomic():
                if not auto_provision:
                    # Queue for manual review.
                    req_obj = TenantOnboardingRequest.objects.create(
                        organization_name=v['org_name'],
                        requested_slug=v['org_slug'],
                        contact_name=' '.join([v.get('owner_first_name', ''), v.get('owner_last_name', '')]).strip() or v['org_name'],
                        contact_email=v.get('owner_email') or v['org_contact_email'],
                        contact_phone=v.get('owner_phone', '') or v.get('org_contact_phone', '') or '—',
                        requested_plan=package.name if package else 'Trial',
                        admin_notes=(v.get('notes') or '') + (
                            f" [Public sign-up, ref={v.get('ref', '')}]" if v.get('ref') else ' [Public sign-up]'
                        ),
                        status='pending',
                    )
                    AuditLog.objects.create(
                        tenant=None,
                        actor_username='public-onboarding',
                        action='CREATE',
                        module='SAAS',
                        resource_type='TenantOnboardingRequest',
                        resource_id=str(req_obj.id),
                        details={
                            'via': 'public-onboarding',
                            'package': str(package_id) if package_id else None,
                            'ref': v.get('ref', ''),
                        },
                    )
                    return Response(
                        {
                            'status': 'pending_review',
                            'onboarding_request_id': str(req_obj.id),
                            'message': (
                                'Your request has been queued for review. '
                                'Our team will reach out within 1 business day.'
                            ),
                        },
                        status=status.HTTP_201_CREATED,
                    )

                # Auto-provision: org + tenant + owner + subscription.
                org = Organization.objects.create(
                    name=v['org_name'],
                    slug=v['org_slug'],
                    contact_phone=v.get('org_contact_phone', '') or '',
                    contact_email=v['org_contact_email'],
                    address=v.get('org_address', '') or '',
                    is_active=True,
                )
                tenant = Tenant.objects.create(
                    name=v['tenant_name'],
                    slug=v['tenant_slug'],
                    domain=v.get('tenant_domain') or '',
                    contact_email=v.get('owner_email') or v['org_contact_email'],
                    contact_phone=v.get('owner_phone', '') or v.get('org_contact_phone', ''),
                    address=v.get('org_address', '') or '',
                    organization=org,
                    plan=package.name.split(' ')[0] or 'Growth',
                    max_subscribers=package.max_subscribers,
                    max_routers=package.max_routers,
                    is_active=True,
                )
                owner_password = _generate_password()
                user = User.objects.create(
                    username=v['owner_username'],
                    email=v.get('owner_email') or '',
                    first_name=v.get('owner_first_name', '') or '',
                    last_name=v.get('owner_last_name', '') or '',
                    is_active=True,
                )
                user.set_password(owner_password)
                user.save()
                OrganizationMembership.objects.create(
                    organization=org,
                    user=user,
                    role=OrganizationMembership.Role.OWNER,
                    is_active=True,
                    accepted_at=timezone.now(),
                )
                # Best-effort: provision tenant ISP-admin.
                try:
                    from apps.core.saas_views import provision_tenant_admin
                    provision_tenant_admin(
                        tenant=tenant,
                        username=v['owner_username'],
                        password=owner_password,
                        email=v.get('owner_email') or '',
                        phone=v.get('owner_phone', '') or '',
                        first_name=v.get('owner_first_name', '') or '',
                        last_name=v.get('owner_last_name', '') or '',
                    )
                except Exception:
                    # If the helper can't be reached we still ship a valid owner
                    # account; ISP admin wiring can be replayed from the saas
                    # admin UI.
                    pass
                # Subscription
                billing_cycle = v.get('billing_cycle') or 'monthly'
                price = package.yearly_price if billing_cycle == 'yearly' else package.monthly_price
                sub = TenantSubscription.objects.create(
                    tenant=tenant,
                    package=package,
                    billing_cycle=billing_cycle,
                    price=price,
                    status='active',
                    start_date=timezone.now().date(),
                    auto_renew=True,
                )
                AuditLog.objects.create(
                    tenant=tenant,
                    actor_username='public-onboarding',
                    action='CREATE',
                    module='SAAS',
                    resource_type='Organization',
                    resource_id=str(org.id),
                    details={
                        'via': 'public-onboarding',
                        'tenant_slug': tenant.slug,
                        'package': str(package.id),
                        'claim_token': claim_token,
                    },
                )
        except Exception as exc:
            return Response(
                {'error': f'Could not complete onboarding: {exc}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                'status': 'provisioned',
                'organization_id': str(org.id),
                'tenant_id': str(tenant.id),
                'owner_id': user.id,
                'owner_username': user.username,
                'claim_url': f'/onboarding/claim/{claim_token}/',
                'dashboard_url': f'/tenant?tenant={tenant.slug}',
                'message': (
                    'Your organization is live. Use the claim link to set a '
                    'permanent password and sign in.'
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class PublicOnboardingStatusView(views.APIView):
    """Poll the status of a queued (manual-approval) onboarding request."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [PublicOnboardingThrottle]

    def get(self, request, request_id: str):
        try:
            uid = uuid.UUID(str(request_id))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid request id.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            obj = TenantOnboardingRequest.objects.get(id=uid)
        except TenantOnboardingRequest.DoesNotExist:
            return Response({'error': 'Onboarding request not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'id': str(obj.id),
            'status': obj.status,
            'organization_name': obj.organization_name,
            'plan': obj.requested_plan,
            'created_at': obj.created_at.isoformat() if obj.created_at else None,
            'updated_at': obj.updated_at.isoformat() if obj.updated_at else None,
        })

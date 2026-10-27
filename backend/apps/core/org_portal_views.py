"""
apps/core/org_portal_views.py — Organization portal API (Neon-authenticated).

Mounted under /api/v1/org/. Every view authenticates ONLY with a Neon Auth JWT
(``NeonJWTAuthentication``) and then authorizes against Django's own
membership tables — the JWT is identity, never permission.

    GET  /api/v1/org/me/               who am I + my orgs, tenants, requests
    POST /api/v1/org/onboarding/       file an onboarding request (manual review)
    POST /api/v1/org/tenant-session/   exchange Neon login → tenant AuthSession
"""
from __future__ import annotations

import logging

from django.utils import timezone
from django.utils.text import slugify
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import permissions, serializers, status, views
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.authentication.models import StaffMembership
from apps.authentication.sessions import CONTEXT_TENANT, issue_session
from apps.core.neon_auth import NeonJWTAuthentication
from .models import (
    AuditLog,
    Organization,
    OrganizationMembership,
    SaaSPackage,
    Tenant,
    TenantOnboardingRequest,
)

logger = logging.getLogger(__name__)

PENDING = 'pending'


class _OrgPortalBase(views.APIView):
    authentication_classes = [NeonJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'org_portal'


def _client_ip(request) -> str | None:
    fwd = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (fwd.split(',')[0].strip() or None) if fwd else request.META.get('REMOTE_ADDR')


def _full_name(user) -> str:
    return (f'{user.first_name} {user.last_name}').strip() or user.email or user.username


def _request_payload(r: TenantOnboardingRequest) -> dict:
    return {
        'id': str(r.id),
        'status': r.status,
        'organization_name': r.organization_name,
        'requested_slug': r.requested_slug,
        'plan': r.requested_plan,
        # admin_notes is internal (approve() writes provisioning details into it);
        # only a rejection reason is meant for the requester.
        'rejection_reason': r.admin_notes if r.status == 'rejected' else '',
        'created_at': r.created_at.isoformat() if r.created_at else None,
        'updated_at': r.updated_at.isoformat() if r.updated_at else None,
    }


# ── GET /org/me/ ──────────────────────────────────────────────────────────


class OrgMeView(_OrgPortalBase):
    @extend_schema(tags=['23. Organization Portal'], summary='Current Neon-authenticated user, memberships and requests')
    def get(self, request):
        user = request.user
        claims = getattr(user, 'neon_claims', None)

        orgs = [
            {
                'id': str(m.organization_id),
                'name': m.organization.name,
                'slug': m.organization.slug,
                'role': m.role,
            }
            for m in OrganizationMembership.objects.filter(
                user=user, is_active=True, organization__is_active=True
            ).select_related('organization')
        ]
        tenants = [
            {
                'id': str(m.tenant_id),
                'slug': m.tenant.slug,
                'name': m.tenant.name,
                'domain': m.tenant.domain,
                'role': m.role.name if m.role else None,
            }
            for m in StaffMembership.objects.filter(
                user=user, is_active=True, tenant__is_active=True
            ).select_related('tenant', 'role')
        ]
        reqs = TenantOnboardingRequest.objects.filter(requested_by=user).order_by('-created_at')[:20]
        return Response({
            'user': {
                'id': user.id,
                'neon_user_id': user.neon_identity.neon_user_id,
                'email': user.email,
                'name': _full_name(user),
                'email_verified': bool(claims.email_verified) if claims else user.neon_identity.email_verified,
            },
            'organizations': orgs,
            'tenants': tenants,
            'onboarding_requests': [_request_payload(r) for r in reqs],
        })


# ── POST /org/onboarding/ ─────────────────────────────────────────────────


class OrgOnboardingInputSerializer(serializers.Serializer):
    org_name = serializers.CharField(max_length=150)
    org_slug = serializers.SlugField(max_length=100, required=False, allow_blank=True)
    org_contact_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    org_contact_email = serializers.EmailField(required=False, allow_blank=True)
    org_address = serializers.CharField(required=False, allow_blank=True)
    package = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)

    def validate(self, attrs):
        slug = (attrs.get('org_slug') or slugify(attrs['org_name'])).strip().lower()[:100]
        if not slug:
            raise serializers.ValidationError({'org_slug': 'Could not derive a subdomain from the organization name.'})
        if (
            Organization.objects.filter(slug__iexact=slug).exists()
            or Tenant.objects.filter(slug__iexact=slug).exists()
            or TenantOnboardingRequest.objects.filter(requested_slug__iexact=slug, status=PENDING).exists()
        ):
            raise serializers.ValidationError({'org_slug': 'This subdomain is already taken. Choose another.'})
        attrs['org_slug'] = slug
        return attrs


class OrgOnboardingView(_OrgPortalBase):
    throttle_scope = 'org_onboarding'

    @extend_schema(
        tags=['23. Organization Portal'],
        summary='Request onboarding for an organization',
        request=OrgOnboardingInputSerializer,
        responses={201: OpenApiResponse(description='Request queued for review.')},
    )
    def post(self, request):
        user = request.user
        if TenantOnboardingRequest.objects.filter(requested_by=user, status=PENDING).exists():
            return Response(
                {'error': 'You already have an onboarding request under review.', 'code': 'REQUEST_PENDING'},
                status=status.HTTP_409_CONFLICT,
            )

        ser = OrgOnboardingInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        v = ser.validated_data

        package = None
        if v.get('package'):
            package = SaaSPackage.objects.filter(id=v['package'], is_public=True, is_active=True).first()
            if package is None:
                raise serializers.ValidationError({'package': 'This plan is not available.'})

        # Always manual review: payment verification (bKash TrxID) and approval
        # are done by the platform team, so nothing is auto-provisioned from here.
        req_obj = TenantOnboardingRequest.objects.create(
            organization_name=v['org_name'],
            requested_slug=v['org_slug'],
            contact_name=_full_name(user),
            contact_email=v.get('org_contact_email') or user.email,
            contact_phone=v.get('org_contact_phone') or '—',
            address=v.get('org_address', '') or '',
            requested_plan=package.name if package else 'Trial',
            package=package,
            requested_by=user,
            admin_notes=(v.get('notes') or '') + ' [Organization portal sign-up]',
            status=PENDING,
        )
        AuditLog.objects.create(
            tenant=None,
            actor_username=user.username,
            action='CREATE',
            module='SAAS',
            resource_type='TenantOnboardingRequest',
            resource_id=str(req_obj.id),
            ip_address=_client_ip(request),
            details={
                'via': 'org-portal',
                'neon_user_id': user.neon_identity.neon_user_id,
                'package': str(package.id) if package else None,
            },
        )
        return Response(
            {
                'status': 'pending_review',
                'onboarding_request_id': str(req_obj.id),
                'request': _request_payload(req_obj),
                'message': 'Your request has been queued for review. Our team will reach out within 1 business day.',
            },
            status=status.HTTP_201_CREATED,
        )


# ── POST /org/tenant-session/ ─────────────────────────────────────────────


class TenantSessionInputSerializer(serializers.Serializer):
    tenant_id = serializers.UUIDField()


class OrgTenantSessionView(_OrgPortalBase):
    throttle_scope = 'org_tenant_session'

    @extend_schema(
        tags=['23. Organization Portal'],
        summary='Exchange Neon login for a tenant workspace session',
        request=TenantSessionInputSerializer,
    )
    def post(self, request):
        ser = TenantSessionInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = request.user

        # Authorization is Django's: an ACTIVE staff membership in an ACTIVE tenant.
        membership = (
            StaffMembership.objects.filter(
                user=user, tenant_id=ser.validated_data['tenant_id'], is_active=True, tenant__is_active=True
            ).select_related('tenant').first()
        )
        if membership is None:
            return Response(
                {'error': 'You do not have access to this workspace.', 'code': 'NO_TENANT_ACCESS'},
                status=status.HTTP_403_FORBIDDEN,
            )

        issued = issue_session(
            user=user,
            tenant_id=str(membership.tenant_id),
            context_type=CONTEXT_TENANT,
            ip_address=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        AuditLog.objects.create(
            tenant=membership.tenant,
            actor_username=user.username,
            action='login',
            module='AUTH',
            resource_type='AuthSession',
            resource_id=str(issued.session.pk),
            ip_address=_client_ip(request),
            details={'via': 'neon-sso'},
            timestamp=timezone.now(),
        )
        return Response({
            'token': issued.token,
            'tenant_id': str(membership.tenant_id),
            'tenant_slug': membership.tenant.slug,
            'domain': membership.tenant.domain,
            'expires_at': issued.session.expires_at.isoformat(),
        })

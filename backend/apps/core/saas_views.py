import os
import shutil
import hashlib
import json
import uuid
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
from rest_framework import views, viewsets, permissions, status, serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from django.contrib.auth.models import User
from django.db.models import Count, Sum, Q
from django.utils import timezone
from django.conf import settings
from django.http import FileResponse, Http404
from django.core.exceptions import ValidationError
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.authtoken.models import Token

from .models import (
    Tenant, TenantDomain, CompanySetting, AuditLog,
    TenantOnboardingRequest, SaaSPackage, TenantSubscription, SaaSPayment, DatabaseBackup,
    TenantApiToken, ApiApplication, TenantFeatureFlag
)
from .permissions import IsCentralAdmin
from .redis_service import RedisService
from .cache_invalidation import (
    invalidate_saas_overview_cache,
    invalidate_saas_tenant_cache,
    invalidate_saas_package_cache,
)
from .renderers import CSVRenderer, NDJSONRenderer, RawJSONRenderer
from .audit_export import build_audit_queryset, stream_export
from apps.authentication.models import StaffProfile, StaffMembership, UserRole, Role


from apps.customers.models import Customer
from apps.network.models import POPBranch, Router, OLT, ONU
from apps.billing.models import Recharge, Package, Invoice
from apps.support.models import Ticket
from apps.hr.models import Employee



def get_tenant_by_id_or_slug(identifier):
    """Safely fetch a tenant by UUID or slug without raising ValidationError."""
    if not identifier:
        return None
    try:
        uuid.UUID(str(identifier))
        t = Tenant.objects.filter(id=identifier).first()
        if t:
            return t
    except (ValueError, TypeError, AttributeError, ValidationError):
        pass
    return Tenant.objects.filter(slug__iexact=str(identifier).strip()).first()


def provision_tenant_admin(tenant, username, password, email='', phone='', first_name='', last_name=''):
    """
    Guarantees complete provisioning of an authoritative ISP Admin:
    1. Seeds default tenant roles (including 'Admin' with full capabilities).
    2. Creates User with is_staff=True, is_superuser=False.
    3. Creates/updates StaffProfile with role=UserRole.ADMIN.
    4. Creates/updates StaffMembership with role=admin_role, scope=TENANT, is_active=True.
    5. Creates auth token.
    6. Invalidates tenant caches.
    """
    from apps.authentication.services.rbac import seed_default_roles_for_tenant
    seed_default_roles_for_tenant(tenant)
    admin_role = Role.objects.filter(tenant=tenant, name__in=['Admin', 'ADMIN', 'Super Admin', 'SUPER_ADMIN']).first()

    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            'email': email or tenant.contact_email or '',
            'first_name': first_name,
            'last_name': last_name,
            'is_staff': True,
            'is_superuser': False,
        }
    )
    if not created:
        if email:
            user.email = email
        if first_name:
            user.first_name = first_name
        if last_name:
            user.last_name = last_name
        user.is_staff = True
        user.is_superuser = False
    user.set_password(password)
    user.save()

    StaffProfile.objects.update_or_create(
        user=user,
        defaults={
            'tenant': tenant,
            'role': UserRole.ADMIN,
            'phone': phone or tenant.contact_phone or '',
            'is_active': True,
        }
    )

    StaffMembership.objects.update_or_create(
        user=user,
        tenant=tenant,
        defaults={
            'role': admin_role,
            'scope': StaffMembership.Scope.TENANT,
            'is_active': True,
        }
    )

    Token.objects.get_or_create(user=user)
    invalidate_saas_tenant_cache(tenant_id=str(tenant.id), slug=tenant.slug)
    return user


# ════════════════════════ SERIALIZERS ════════════════════════

class SaaSTenantSerializer(serializers.ModelSerializer):
    subscriber_count = serializers.SerializerMethodField()
    active_subscribers_count = serializers.SerializerMethodField()
    expired_subscribers_count = serializers.SerializerMethodField()
    router_count = serializers.SerializerMethodField()
    online_router_count = serializers.SerializerMethodField()
    pop_count = serializers.SerializerMethodField()
    active_pop_count = serializers.SerializerMethodField()
    olt_count = serializers.SerializerMethodField()
    onu_count = serializers.SerializerMethodField()
    staff_count = serializers.SerializerMethodField()
    package_count = serializers.SerializerMethodField()
    monthly_billing_volume = serializers.SerializerMethodField()
    primary_domain = serializers.SerializerMethodField()
    domains_count = serializers.SerializerMethodField()
    admin_username = serializers.SerializerMethodField()
    admins = serializers.SerializerMethodField()
    admins_count = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'domain', 'contact_phone', 'contact_email',
            'address', 'is_active', 'plan', 'max_subscribers', 'max_routers',
            'subscription_status', 'subscription_expires_at', 'notes',
            'created_at', 'updated_at',
            'subscriber_count', 'active_subscribers_count', 'expired_subscribers_count',
            'router_count', 'online_router_count',
            'pop_count', 'active_pop_count',
            'olt_count', 'onu_count',
            'staff_count', 'package_count', 'monthly_billing_volume',
            'primary_domain', 'domains_count', 'admin_username',
            'admins', 'admins_count'
        ]
        read_only_fields = ('created_at', 'updated_at')

    def get_subscriber_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('subscriber_count', 0)
        try:
            return Customer.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_active_subscribers_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('active_subscribers_count', 0)
        try:
            return Customer.objects.filter(tenant=obj, status='Active').count()
        except Exception:
            return 0

    def get_expired_subscribers_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('expired_subscribers_count', 0)
        try:
            return Customer.objects.filter(tenant=obj, status='Expired').count()
        except Exception:
            return 0

    def get_router_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('router_count', 0)
        try:
            return Router.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_online_router_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('online_router_count', 0)
        try:
            return Router.objects.filter(tenant=obj, status='Online').count()
        except Exception:
            return 0

    def get_pop_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('pop_count', 0)
        try:
            return POPBranch.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_active_pop_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('active_pop_count', 0)
        try:
            return POPBranch.objects.filter(tenant=obj, status='Active').count()
        except Exception:
            return 0

    def get_olt_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('olt_count', 0)
        try:
            return OLT.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_onu_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('onu_count', 0)
        try:
            return ONU.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_staff_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('staff_count', 0)
        try:
            return StaffProfile.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_package_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('package_count', 0)
        try:
            return Package.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_monthly_billing_volume(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('monthly_billing_volume', 0.0)
        try:
            res = Customer.objects.filter(tenant=obj).aggregate(total=Sum('monthly_bill'))
            return float(res['total'] or 0)
        except Exception:
            return 0.0

    def get_primary_domain(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('primary_domain', obj.domain or f"{obj.slug}.shebafi.xyz")
        try:
            primary = TenantDomain.objects.filter(tenant=obj, is_primary=True).first()
            return primary.hostname if primary else (obj.domain or f"{obj.slug}.shebafi.xyz")
        except Exception:
            return obj.domain or f"{obj.slug}.shebafi.xyz"

    def get_domains_count(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('domains_count', 0)
        try:
            return TenantDomain.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_admin_username(self, obj):
        if hasattr(obj, '_precomputed_stats'):
            return obj._precomputed_stats.get('admin_username', f"{obj.slug}_admin")
        try:
            staff = StaffProfile.objects.filter(tenant=obj, role__in=[UserRole.ADMIN, UserRole.SUPER_ADMIN]).first()
            return staff.user.username if staff and staff.user else f"{obj.slug}_admin"
        except Exception:
            return f"{obj.slug}_admin"

    def get_admins(self, obj):
        if hasattr(obj, '_precomputed_stats') and 'admins' in obj._precomputed_stats:
            return obj._precomputed_stats['admins']
        try:
            admins = []
            for sp in StaffProfile.objects.filter(tenant=obj, role__in=[UserRole.ADMIN, UserRole.SUPER_ADMIN]).select_related('user'):
                if sp.user:
                    admins.append({
                        'id': sp.user.id,
                        'username': sp.user.username,
                        'email': sp.user.email or '',
                        'phone': sp.phone or obj.contact_phone or '',
                        'full_name': f"{sp.user.first_name} {sp.user.last_name}".strip() or sp.user.username,
                        'is_active': sp.user.is_active and sp.is_active,
                        'last_login': sp.user.last_login.strftime('%Y-%m-%d %H:%M') if sp.user.last_login else 'Never',
                    })
            return admins
        except Exception:
            return []

    def get_admins_count(self, obj):
        if hasattr(obj, '_precomputed_stats') and 'admins_count' in obj._precomputed_stats:
            return obj._precomputed_stats['admins_count']
        try:
            return StaffProfile.objects.filter(tenant=obj, role__in=[UserRole.ADMIN, UserRole.SUPER_ADMIN]).count()
        except Exception:
            return 0


class SaaSDomainSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)

    class Meta:
        model = TenantDomain
        fields = [
            'id', 'tenant', 'tenant_name', 'tenant_slug',
            'hostname', 'is_primary', 'is_active', 'verified',
            'verification_method', 'dns_challenge_token',
            'domain_type', 'created_at', 'updated_at'
        ]
        read_only_fields = ('dns_challenge_token', 'created_at', 'updated_at')


class TenantOnboardingRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantOnboardingRequest
        fields = '__all__'
        read_only_fields = ('created_at', 'updated_at')


class SaaSPackageSerializer(serializers.ModelSerializer):
    subscribers_enrolled = serializers.SerializerMethodField()

    class Meta:
        model = SaaSPackage
        fields = [
            'id', 'name', 'code', 'description', 'monthly_price', 'yearly_price',
            'max_subscribers', 'max_routers', 'max_custom_domains', 'features',
            'is_active', 'is_public', 'created_at', 'updated_at', 'subscribers_enrolled'
        ]
        read_only_fields = ('created_at', 'updated_at')

    def get_subscribers_enrolled(self, obj):
        try:
            return Tenant.objects.filter(plan__iexact=obj.name).count() + Tenant.objects.filter(plan__iexact=obj.code).count()
        except Exception:
            return 0


class TenantSubscriptionSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)
    package_name = serializers.CharField(source='package.name', read_only=True)

    class Meta:
        model = TenantSubscription
        fields = [
            'id', 'tenant', 'tenant_name', 'tenant_slug', 'package', 'package_name',
            'billing_cycle', 'price', 'status', 'start_date', 'end_date',
            'next_billing_date', 'auto_renew', 'created_at', 'updated_at'
        ]
        read_only_fields = ('created_at', 'updated_at')


class SaaSPaymentSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = SaaSPayment
        fields = [
            'id', 'tenant', 'tenant_name', 'subscription', 'amount',
            'payment_method', 'trx_id', 'status', 'notes', 'paid_at', 'created_at'
        ]
        read_only_fields = ('created_at',)


class DatabaseBackupSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    file_size_formatted = serializers.SerializerMethodField()

    class Meta:
        model = DatabaseBackup
        fields = [
            'id', 'backup_name', 'filename', 'file_size_bytes', 'file_size_formatted',
            'backup_type', 'status', 'storage_path', 'tenant', 'tenant_name',
            'triggered_by', 'checksum', 'created_at'
        ]
        read_only_fields = ('created_at', 'checksum', 'file_size_bytes')

    def get_file_size_formatted(self, obj):
        bytes_val = obj.file_size_bytes or 0
        if bytes_val < 1024:
            return f"{bytes_val} B"
        elif bytes_val < 1024 * 1024:
            return f"{bytes_val / 1024:.1f} KB"
        else:
            return f"{bytes_val / (1024 * 1024):.2f} MB"


class SaaSAuditLogSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'tenant', 'tenant_name', 'tenant_slug',
            'actor_username', 'action', 'module', 'resource_type',
            'resource_id', 'ip_address', 'details', 'timestamp'
        ]
        read_only_fields = ('timestamp',)


# ════════════════════════ VIEWSETS & VIEWS ════════════════════════

@extend_schema(
    tags=['16. Multi-Tenant SaaS & Control Plane'],
    summary='SaaS platform global overview metrics',
    description='Aggregated telemetry, tenant counts, active subscriptions, revenue metrics, and hardware fleet counts.',
    responses={200: dict}
)
class SaaSOverviewView(views.APIView):
    """
    Central SaaS Control Plane telemetry and aggregate business metrics.
    Accessible exclusively by Central Super Administrators on admin.shebafi.xyz.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]

    def get(self, request):
        cached = RedisService.get('saas:overview')
        if cached is not None:
            response = Response(cached)
            response['X-Cache'] = 'HIT'
            return response

        redis_ok, redis_latency, redis_err = RedisService.ping()

        tenant_agg = Tenant.objects.aggregate(
            total=Count('id'),
            active=Count('id', filter=Q(is_active=True)),
            suspended=Count('id', filter=Q(is_active=False)),
        )
        total_tenants = tenant_agg['total'] or 0
        active_tenants = tenant_agg['active'] or 0
        suspended_tenants = tenant_agg['suspended'] or 0
        pending_requests = TenantOnboardingRequest.objects.filter(status='pending').count()

        cust_agg = Customer.objects.aggregate(
            total=Count('id'),
            active=Count('id', filter=Q(status='Active')),
        )
        total_subscribers = cust_agg['total'] or 0
        active_subscribers = cust_agg['active'] or 0

        rtr_agg = Router.objects.aggregate(
            total=Count('id'),
            online=Count('id', filter=Q(status='Online')),
        )
        total_routers = rtr_agg['total'] or 0
        online_routers = rtr_agg['online'] or 0

        pop_agg = POPBranch.objects.aggregate(
            total=Count('id'),
            active=Count('id', filter=Q(status='Active')),
        )
        total_pops = pop_agg['total'] or 0
        active_pops = pop_agg['active'] or 0

        total_olts = OLT.objects.count()

        onu_agg = ONU.objects.aggregate(
            total=Count('id'),
            online=Count('id', filter=Q(status='Online')),
        )
        total_onus = onu_agg['total'] or 0
        online_onus = onu_agg['online'] or 0

        total_staff = StaffProfile.objects.count()

        pkg_agg = SaaSPackage.objects.aggregate(
            total=Count('id'),
            active=Count('id', filter=Q(is_active=True)),
        )
        total_packages = pkg_agg['total'] or 0
        active_packages = pkg_agg['active'] or 0
        total_backups = DatabaseBackup.objects.count()

        # Calculate estimated SaaS platform MRR based on active tenant subscriptions or packages
        plan_pricing = {
            'Starter': 5000,
            'Growth': 15000,
            'Enterprise': 35000,
        }
        for pkg in SaaSPackage.objects.all():
            plan_pricing[pkg.name] = float(pkg.monthly_price)
            plan_pricing[pkg.code] = float(pkg.monthly_price)

        plan_counts = dict(
            Tenant.objects.filter(is_active=True)
            .values('plan')
            .annotate(c=Count('id'))
            .values_list('plan', 'c')
        )
        platform_mrr = sum(
            plan_pricing.get(p, 15000) * c for p, c in plan_counts.items()
        )

        data = {
            'platform': {
                'name': 'ShebaFi SaaS Multi-Tenant Control Plane',
                'control_domain': 'admin.shebafi.xyz',
                'version': 'v2.4-ControlPlane',
                'environment': 'Production',
                'system_status': 'Healthy' if redis_ok else 'Degraded (Redis Offline)',
                'database_cluster': 'Online',
            },
            'cluster_name': 'Production Primary Cluster',
            'cluster_status': 'Operational' if redis_ok else 'Degraded (Redis Offline)',
            'sla_target': '99.98%',
            'redis_status': 'Healthy' if redis_ok else 'Degraded',
            'redis_latency_ms': redis_latency,
            'kpis': {
                'total_tenants': total_tenants,
                'active_tenants': active_tenants,
                'suspended_tenants': suspended_tenants,
                'pending_requests': pending_requests,
                'total_subscribers': total_subscribers,
                'active_subscribers': active_subscribers,
                'total_routers': total_routers,
                'online_routers': online_routers,
                'total_pops': total_pops,
                'active_pops': active_pops,
                'total_olts': total_olts,
                'total_onus': total_onus,
                'online_onus': online_onus,
                'total_staff': total_staff,
                'total_packages': total_packages,
                'active_packages': active_packages,
                'total_backups': total_backups,
                'platform_mrr': platform_mrr,
            },
            'telemetry': {
                'tenants_total': total_tenants,
                'tenants_active': active_tenants,
                'subscribers_managed': total_subscribers,
                'routers_online': online_routers,
                'routers_total': total_routers,
                'olts_total': total_olts,
                'onus_total': total_onus,
                'monthly_billing_volume': platform_mrr,
            },
            'financial': {
                'monthly_recurring_revenue': platform_mrr,
                'annual_run_rate': platform_mrr * 12,
                'total_revenue_collected': platform_mrr,
                'pending_invoices_count': 0,
            },
            'fleet': {
                'total_pops': total_pops,
                'active_pops': active_pops,
                'total_packages': total_packages,
            },
            'backups': {
                'total_backups': total_backups,
                'latest_backup_time': None,
                'total_storage_mb': 0,
            },
        }
        ttl = getattr(settings, 'CACHE_TTL_SUPER_ADMIN_OVERVIEW', 120)
        RedisService.set('saas:overview', data, timeout=ttl)
        response = Response(data)
        response['X-Cache'] = 'MISS'
        return response


@extend_schema(
    tags=['16. Multi-Tenant SaaS & Control Plane'],
    summary='SaaS Platform Operational Health',
    description='Platform-level operational health diagnostics (database, Redis, tenant metrics). Restricted strictly to Central Platform Administrators.',
    responses={200: dict, 503: dict}
)
class SaaSHealthView(views.APIView):
    """
    Platform-level operational health diagnostics for the SaaS Control Plane.
    Strictly restricted to Central Platform Administrators via IsCentralAdmin.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]

    def get(self, request):
        from django.db import connection
        from apps.core.redis_service import RedisService

        db_status = 'connected'
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1;')
        except Exception as exc:
            db_status = f'error: {exc}'

        redis_status = 'connected' if RedisService.ping() else 'disconnected'
        tenants_total = Tenant.objects.count()
        tenants_active = Tenant.objects.filter(is_active=True).count()

        is_healthy = (db_status == 'connected')

        return Response({
            'status': 'healthy' if is_healthy else 'degraded',
            'database': db_status,
            'redis': redis_status,
            'tenants_total': tenants_total,
            'tenants_active': tenants_active,
            'timestamp': timezone.now().isoformat(),
        }, status=status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE)


class SaaSTenantViewSet(viewsets.ModelViewSet):
    """
    Control Plane Tenant Management: Onboard new ISPs, modify quotas, activate/suspend, delete, and impersonate.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = Tenant.objects.all().order_by('-created_at')
    serializer_class = SaaSTenantSerializer

    @staticmethod
    def precompute_tenant_stats(tenants):
        """
        Eliminates N+1 query overhead by executing batch aggregation across all tenants
        in the page (9 bulk queries instead of 15 queries per tenant).
        """
        if not tenants:
            return
        tenant_ids = [t.id for t in tenants]

        # 1. Customer metrics by tenant
        cust_agg = (
            Customer.objects.filter(tenant_id__in=tenant_ids)
            .values('tenant_id')
            .annotate(
                total=Count('id'),
                active=Count('id', filter=Q(status='Active')),
                expired=Count('id', filter=Q(status='Expired')),
                billing=Sum('monthly_bill'),
            )
        )
        cust_map = {row['tenant_id']: row for row in cust_agg}

        # 2. Router metrics by tenant
        rtr_agg = (
            Router.objects.filter(tenant_id__in=tenant_ids)
            .values('tenant_id')
            .annotate(
                total=Count('id'),
                online=Count('id', filter=Q(status='Online')),
            )
        )
        rtr_map = {row['tenant_id']: row for row in rtr_agg}

        # 3. POPBranch metrics by tenant
        pop_agg = (
            POPBranch.objects.filter(tenant_id__in=tenant_ids)
            .values('tenant_id')
            .annotate(
                total=Count('id'),
                active=Count('id', filter=Q(status='Active')),
            )
        )
        pop_map = {row['tenant_id']: row for row in pop_agg}

        # 4. OLT counts
        olt_map = {row['tenant_id']: row['total'] for row in OLT.objects.filter(tenant_id__in=tenant_ids).values('tenant_id').annotate(total=Count('id'))}

        # 5. ONU counts
        onu_map = {row['tenant_id']: row['total'] for row in ONU.objects.filter(tenant_id__in=tenant_ids).values('tenant_id').annotate(total=Count('id'))}

        # 6. Staff counts
        staff_map = {row['tenant_id']: row['total'] for row in StaffProfile.objects.filter(tenant_id__in=tenant_ids).values('tenant_id').annotate(total=Count('id'))}

        # 7. Package counts
        pkg_map = {row['tenant_id']: row['total'] for row in Package.objects.filter(tenant_id__in=tenant_ids).values('tenant_id').annotate(total=Count('id'))}

        # 8. Domain counts & primary hostnames
        dom_map = {row['tenant_id']: row['total'] for row in TenantDomain.objects.filter(tenant_id__in=tenant_ids).values('tenant_id').annotate(total=Count('id'))}
        primary_doms = {d.tenant_id: d.hostname for d in TenantDomain.objects.filter(tenant_id__in=tenant_ids, is_primary=True)}

        # 9. Admin staff list & usernames
        admin_staff = (
            StaffProfile.objects.filter(tenant_id__in=tenant_ids, role__in=[UserRole.ADMIN, UserRole.SUPER_ADMIN])
            .select_related('user')
        )
        admin_map = {}
        admin_list_map = {}
        for sp in admin_staff:
            if not sp.user:
                continue
            tid = sp.tenant_id
            if tid not in admin_map:
                admin_map[tid] = sp.user.username
            if tid not in admin_list_map:
                admin_list_map[tid] = []
            admin_list_map[tid].append({
                'id': sp.user.id,
                'username': sp.user.username,
                'email': sp.user.email or '',
                'phone': sp.phone or '',
                'full_name': f"{sp.user.first_name} {sp.user.last_name}".strip() or sp.user.username,
                'is_active': sp.user.is_active and sp.is_active,
                'last_login': sp.user.last_login.strftime('%Y-%m-%d %H:%M') if sp.user.last_login else 'Never',
            })

        for tenant in tenants:
            tid = tenant.id
            c_info = cust_map.get(tid, {})
            r_info = rtr_map.get(tid, {})
            p_info = pop_map.get(tid, {})

            t_admins = admin_list_map.get(tid, [])
            tenant._precomputed_stats = {
                'subscriber_count': c_info.get('total', 0),
                'active_subscribers_count': c_info.get('active', 0),
                'expired_subscribers_count': c_info.get('expired', 0),
                'monthly_billing_volume': float(c_info.get('billing') or 0.0),
                'router_count': r_info.get('total', 0),
                'online_router_count': r_info.get('online', 0),
                'pop_count': p_info.get('total', 0),
                'active_pop_count': p_info.get('active', 0),
                'olt_count': olt_map.get(tid, 0),
                'onu_count': onu_map.get(tid, 0),
                'staff_count': staff_map.get(tid, 0),
                'package_count': pkg_map.get(tid, 0),
                'domains_count': dom_map.get(tid, 0),
                'primary_domain': primary_doms.get(tid) or tenant.domain or f"{tenant.slug}.shebafi.xyz",
                'admin_username': admin_map.get(tid) or f"{tenant.slug}_admin",
                'admins': t_admins,
                'admins_count': len(t_admins),
            }

    def list(self, request, *args, **kwargs):
        search = request.query_params.get('search', '')
        plan = request.query_params.get('plan', '')
        status_param = request.query_params.get('status', '') or request.query_params.get('subscription_status', '')
        page = request.query_params.get('page', '1')
        cache_key = f"saas:tenants:list:{search}:{plan}:{status_param}:{page}"
        cached = RedisService.get(cache_key)
        if cached is not None:
            response = Response(cached)
            response['X-Cache'] = 'HIT'
            return response

        queryset = self.filter_queryset(self.get_queryset())
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(slug__icontains=search) | Q(domain__icontains=search))
        if plan and plan != 'ALL':
            queryset = queryset.filter(plan__iexact=plan)
        if status_param and status_param != 'ALL':
            if status_param.lower() in ('active', 'online'):
                queryset = queryset.filter(is_active=True)
            elif status_param.lower() in ('suspended', 'inactive'):
                queryset = queryset.filter(is_active=False)
            else:
                queryset = queryset.filter(subscription_status__iexact=status_param)

        page_data = self.paginate_queryset(queryset)
        targets = page_data if page_data is not None else list(queryset)

        # Batch precompute to eliminate N+1 queries
        self.precompute_tenant_stats(targets)

        serializer = self.get_serializer(targets, many=True)
        data = self.get_paginated_response(serializer.data).data if page_data is not None else serializer.data

        ttl = getattr(settings, 'CACHE_TTL_TENANT_LIST', 300)
        RedisService.set(cache_key, data, timeout=ttl)
        response = Response(data)
        response['X-Cache'] = 'MISS'
        return response

    def retrieve(self, request, *args, **kwargs):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = self.kwargs.get(lookup_url_kwarg, '')
        cache_key = f"saas:tenant:{lookup_value}:detail"
        cached = RedisService.get(cache_key)
        if cached is not None:
            response = Response(cached)
            response['X-Cache'] = 'HIT'
            return response

        tenant = self.get_object()
        self.precompute_tenant_stats([tenant])
        serializer = self.get_serializer(tenant)
        data = serializer.data

        ttl = getattr(settings, 'CACHE_TTL_TENANT_LIST', 300)
        RedisService.set(cache_key, data, timeout=ttl)
        response = Response(data)
        response['X-Cache'] = 'MISS'
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        tenant = self.get_object()
        invalidate_saas_tenant_cache(tenant_id=str(tenant.id), slug=tenant.slug)
        return response

    def partial_update(self, request, *args, **kwargs):
        response = super().partial_update(request, *args, **kwargs)
        tenant = self.get_object()
        invalidate_saas_tenant_cache(tenant_id=str(tenant.id), slug=tenant.slug)
        return response

    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = self.kwargs[lookup_url_kwarg]
        tenant = get_tenant_by_id_or_slug(lookup_value)
        if not tenant:
            raise Http404("No Tenant matches the given query.")
        self.check_object_permissions(self.request, tenant)
        return tenant

    def create(self, request, *args, **kwargs):
        data = request.data
        name = data.get('name')
        slug = data.get('slug')
        if not name or not slug:
            return Response({'error': 'Name and slug are required.'}, status=status.HTTP_400_BAD_REQUEST)

        slug = slug.strip().lower()
        if Tenant.objects.filter(slug=slug).exists():
            return Response({'error': f'A tenant with slug "{slug}" already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        plan = data.get('plan', 'Growth')
        max_subs = int(data.get('max_subscribers', 2500 if plan == 'Growth' else (500 if plan == 'Starter' else 10000)))
        max_rtrs = int(data.get('max_routers', 10 if plan == 'Growth' else (3 if plan == 'Starter' else 50)))
        domain = data.get('domain', f"{slug}.shebafi.xyz").strip().lower()

        # 1. Create Tenant
        tenant = Tenant.objects.create(
            name=name,
            slug=slug,
            domain=domain,
            contact_email=data.get('contact_email', f'admin@{slug}.net'),
            contact_phone=data.get('contact_phone', '+880 1700-000000'),
            address=data.get('address', 'Dhaka, Bangladesh'),
            plan=plan,
            max_subscribers=max_subs,
            max_routers=max_rtrs,
            subscription_status='active',
            is_active=True,
            notes=data.get('notes', 'Provisioned via SaaS Control Plane')
        )

        # 2. Create CompanySetting
        CompanySetting.objects.create(
            tenant=tenant,
            company_name=name,
            tagline=f"High-Speed Fiber Internet by {name}",
            support_email=tenant.contact_email,
            support_phone=tenant.contact_phone,
            address=tenant.address,
        )

        # 3. Create TenantDomain
        TenantDomain.objects.create(
            tenant=tenant,
            hostname=domain,
            is_primary=True,
            is_active=True,
            verified=True,
            domain_type=TenantDomain.DomainType.PRIMARY
        )

        local_host = f"{slug}.localhost"
        if not TenantDomain.objects.filter(hostname=local_host).exists():
            TenantDomain.objects.create(
                tenant=tenant,
                hostname=local_host,
                is_primary=False,
                is_active=True,
                verified=True,
                domain_type=TenantDomain.DomainType.ALIAS
            )

        # 4. Create Initial Tenant Admin User
        admin_username = data.get('admin_username') or f"{slug}_admin"
        admin_password = data.get('admin_password') or "sheba1234"
        admin_email = data.get('admin_email') or tenant.contact_email

        user = provision_tenant_admin(
            tenant=tenant,
            username=admin_username,
            password=admin_password,
            email=admin_email,
            phone=tenant.contact_phone
        )
        token, _ = Token.objects.get_or_create(user=user)

        # 5. Create SaaS Subscription Link
        pkg = SaaSPackage.objects.filter(name__iexact=plan).first() or SaaSPackage.objects.filter(code__iexact=plan).first()
        if pkg:
            TenantSubscription.objects.create(
                tenant=tenant,
                package=pkg,
                billing_cycle='monthly',
                price=pkg.monthly_price,
                status='active',
                start_date=timezone.now().date(),
            )

        # 6. Log audit
        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='onboard_tenant',
            module='saas_control_plane',
            resource_type='Tenant',
            resource_id=str(tenant.id),
            details={'tenant_name': name, 'slug': slug, 'plan': plan, 'domain': domain}
        )

        # 7. Dispatch Onboarding Welcome Email
        portal_url = f"https://{domain}/login" if 'localhost' not in domain else f"http://{local_host}:3000/login"
        try:
            from apps.core.email.service import EmailService
            EmailService.send_client_onboarding_email(
                tenant=tenant,
                admin_username=admin_username,
                temporary_password=admin_password,
                portal_url=portal_url,
                recipient_email=tenant.contact_email
            )
        except Exception as mail_exc:
            logger.warning(f"Failed to dispatch onboarding email for tenant {slug}: {mail_exc}")

        self.precompute_tenant_stats([tenant])
        serializer = self.get_serializer(tenant)
        invalidate_saas_tenant_cache(tenant_id=str(tenant.id), slug=tenant.slug)
        resp_data = dict(serializer.data)
        resp_data.update({
            'message': f'Tenant "{name}" successfully provisioned and onboarded.',
            'tenant': serializer.data,
            'admin_credentials': {
                'username': admin_username,
                'password': admin_password,
                'token': token.key,
                'dashboard_url': f"http://{domain}:3000/" if 'localhost' not in domain else f"http://{local_host}:3000/",
            }
        })
        return Response(resp_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        tenant = self.get_object()
        tenant.is_active = not tenant.is_active
        tenant.subscription_status = 'active' if tenant.is_active else 'suspended'
        tenant.save()

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='toggle_tenant_status',
            module='saas_control_plane',
            resource_type='Tenant',
            resource_id=str(tenant.id),
            details={'new_status': 'active' if tenant.is_active else 'suspended'}
        )
        invalidate_saas_tenant_cache(tenant_id=str(tenant.id), slug=tenant.slug)
        return Response({
            'id': str(tenant.id),
            'name': tenant.name,
            'is_active': tenant.is_active,
            'subscription_status': tenant.subscription_status,
            'message': f'Tenant "{tenant.name}" is now {"Active" if tenant.is_active else "Suspended"}.'
        })

    @action(detail=True, methods=['post'], url_path='impersonate')
    def impersonate(self, request, pk=None):
        tenant = self.get_object()
        staff = StaffProfile.objects.filter(tenant=tenant, role__in=[UserRole.ADMIN, UserRole.SUPER_ADMIN]).first()
        if not staff or not staff.user:
            return Response({'error': f'No administrative staff profile found for {tenant.name}.'}, status=status.HTTP_404_NOT_FOUND)

        token, _ = Token.objects.get_or_create(user=staff.user)
        return Response({
            'message': f'Impersonation session granted for {tenant.name}',
            'tenant_id': str(tenant.id),
            'tenant_slug': tenant.slug,
            'tenant_name': tenant.name,
            'impersonated_user': staff.user.username,
            'token': token.key,
            'role': staff.role,
            'redirect_url': '/',
        })

    @action(detail=True, methods=['get'], url_path='admins')
    def list_admins(self, request, pk=None):
        """Returns all ISP administrators for this tenant."""
        tenant = self.get_object()
        admins = []
        for sp in StaffProfile.objects.filter(tenant=tenant, role__in=[UserRole.ADMIN, UserRole.SUPER_ADMIN]).select_related('user'):
            if sp.user:
                membership = StaffMembership.objects.filter(user=sp.user, tenant=tenant).first()
                admins.append({
                    'id': sp.user.id,
                    'username': sp.user.username,
                    'email': sp.user.email or '',
                    'first_name': sp.user.first_name or '',
                    'last_name': sp.user.last_name or '',
                    'full_name': f"{sp.user.first_name} {sp.user.last_name}".strip() or sp.user.username,
                    'phone': sp.phone or tenant.contact_phone or '',
                    'role': 'Admin',
                    'is_active': sp.user.is_active and sp.is_active,
                    'last_login': sp.user.last_login.strftime('%Y-%m-%d %H:%M') if sp.user.last_login else 'Never',
                    'membership_id': str(membership.id) if membership else None,
                })
        return Response(admins)

    @action(detail=True, methods=['post'], url_path='create-admin')
    def create_admin(self, request, pk=None):
        """Directly provisions an ISP Administrator account for this tenant with authoritative RBAC."""
        tenant = self.get_object()
        data = request.data
        username = (data.get('username') or '').strip().lower()
        password = data.get('password')
        email = (data.get('email') or '').strip()
        phone = (data.get('phone') or '').strip()
        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()

        if not username or not password:
            return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username=username).exists():
            return Response({'error': f'User "{username}" already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        user = provision_tenant_admin(
            tenant=tenant,
            username=username,
            password=password,
            email=email,
            phone=phone,
            first_name=first_name,
            last_name=last_name
        )

        AuditLog.objects.create(
            tenant=tenant,
            actor_username=request.user.username,
            action='create_isp_admin',
            module='saas_control_plane',
            resource_type='User',
            resource_id=str(user.id),
            details={'username': username, 'tenant': tenant.name, 'role': 'Admin'}
        )

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'phone': phone or tenant.contact_phone,
            'role': 'Admin',
            'tenant_id': str(tenant.id),
            'tenant_name': tenant.name,
            'message': f'ISP Admin "{username}" successfully created for {tenant.name}.'
        }, status=status.HTTP_201_CREATED)

    # ── Bulk operations (Tier 3B) ──────────────────────────────────────────

    def _bulk_apply(self, tenant_ids, mutate_fn):
        from django.db import transaction
        succeeded, failed = [], []
        for tid in tenant_ids:
            try:
                tenant = Tenant.objects.get(id=tid)
                if tenant.slug in ('shebafi', 'master', 'default'):
                    failed.append({'id': str(tid), 'reason': 'platform_tenant'})
                    continue
                mutate_fn(tenant)
                invalidate_saas_tenant_cache(tenant_id=str(tid))
                from apps.core.features import invalidate_cache
                invalidate_cache(tenant)
                succeeded.append({
                    'id': str(tid),
                    'name': tenant.name,
                })
            except Tenant.DoesNotExist:
                failed.append({'id': str(tid), 'reason': 'not_found'})
            except Exception as exc:
                failed.append({'id': str(tid), 'reason': str(exc)})
        return succeeded, failed

    @action(detail=False, methods=['post'], url_path='bulk-suspend')
    def bulk_suspend(self, request):
        tenant_ids = request.data.get('tenant_ids') or []
        if not isinstance(tenant_ids, list) or not tenant_ids:
            return Response({'error': 'tenant_ids must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)
        from django.db import transaction
        with transaction.atomic():
            succeeded, failed = self._bulk_apply(
                tenant_ids,
                mutate_fn=lambda t: Tenant.objects.filter(pk=t.pk).update(
                    is_active=False, subscription_status='suspended'),
            )
        return Response({'succeeded': succeeded, 'failed': failed, 'count': len(succeeded)})

    @action(detail=False, methods=['post'], url_path='bulk-activate')
    def bulk_activate(self, request):
        tenant_ids = request.data.get('tenant_ids') or []
        if not isinstance(tenant_ids, list) or not tenant_ids:
            return Response({'error': 'tenant_ids must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)
        from django.db import transaction
        with transaction.atomic():
            succeeded, failed = self._bulk_apply(
                tenant_ids,
                mutate_fn=lambda t: Tenant.objects.filter(pk=t.pk).update(
                    is_active=True, subscription_status='active'),
            )
        return Response({'succeeded': succeeded, 'failed': failed, 'count': len(succeeded)})

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        tenant_ids = request.data.get('tenant_ids') or []
        if not isinstance(tenant_ids, list) or not tenant_ids:
            return Response({'error': 'tenant_ids must be a non-empty list.'}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.objects.create(
            tenant=None, actor_username=request.user.username,
            action='bulk_delete_tenant', module='saas_control_plane',
            resource_type='Tenant',
            resource_id='bulk',
            details={'requested_ids': [str(t) for t in tenant_ids], 'count': len(tenant_ids)},
        )

        from django.db import transaction
        with transaction.atomic():
            succeeded, failed = self._bulk_apply(
                tenant_ids,
                mutate_fn=lambda t: t.delete(),
            )
        return Response({'succeeded': succeeded, 'failed': failed, 'count': len(succeeded)})

    def destroy(self, request, *args, **kwargs):
        tenant = self.get_object()
        if tenant.slug in ['shebafi', 'master', 'default']:
            return Response({'error': f'The primary tenant "{tenant.slug}" cannot be deleted.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant_name = tenant.name
        tenant_id = str(tenant.id)
        slug = tenant.slug

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='delete_tenant',
            module='saas_control_plane',
            resource_type='Tenant',
            resource_id=tenant_id,
            details={'tenant_name': tenant_name, 'slug': slug}
        )

        tenant.delete()
        invalidate_saas_tenant_cache(tenant_id=tenant_id, slug=slug)
        return Response({'message': f'Tenant "{tenant_name}" and all associated isolated configurations successfully deleted.'})


    @action(detail=True, methods=['get'], url_path='telemetry')
    def telemetry(self, request, pk=None):
        """
        Detailed operational ISP telemetry for the central control plane.
        Aggregates onboarded subscribers, POP branches, routers, optical plant, and staff.
        """
        tenant = self.get_object()

        # 1. Subscribers
        subs_qs = Customer.objects.filter(tenant=tenant)
        total_subscribers = subs_qs.count()
        active_subscribers = subs_qs.filter(status='Active').count()
        expired_subscribers = subs_qs.filter(status='Expired').count()
        suspended_subscribers = subs_qs.filter(status='Suspended').count()
        left_subscribers = subs_qs.filter(status='Left').count()
        monthly_billing_volume = float(subs_qs.aggregate(total=Sum('monthly_bill'))['total'] or 0)
        total_due_amount = float(subs_qs.aggregate(total=Sum('due_amount'))['total'] or 0)

        conn_pppoe = subs_qs.filter(connection_type='PPPoE').count()
        conn_static = subs_qs.filter(connection_type='Static_IP').count()
        conn_dhcp = subs_qs.filter(connection_type='DHCP').count()

        # 2. POP Branches
        pops = []
        for pop in POPBranch.objects.filter(tenant=tenant).order_by('name'):
            pops.append({
                'id': str(pop.id),
                'name': pop.name,
                'code': pop.code or '',
                'location': pop.location or '',
                'in_charge': pop.in_charge or '',
                'contact': pop.contact or '',
                'total_capacity': pop.total_capacity,
                'power_backup': pop.power_backup or '',
                'status': pop.status,
            })

        # 3. Core Routers & Gateways
        routers = []
        for rtr in Router.objects.filter(tenant=tenant).order_by('name'):
            routers.append({
                'id': str(rtr.id),
                'name': rtr.name,
                'ip_address': rtr.ip_address,
                'hostname': rtr.hostname or '',
                'api_protocol': rtr.api_protocol,
                'status': rtr.status,
                'cpu_usage': rtr.cpu_usage,
                'memory_usage': rtr.memory_usage,
                'uptime': rtr.uptime or '',
                'active_pppoe_count': rtr.active_pppoe_count,
                'routeros_version': rtr.routeros_version or '',
            })

        # 4. Optical Network (OLTs & ONUs)
        olts = []
        for olt in OLT.objects.filter(tenant=tenant).order_by('name'):
            olts.append({
                'id': str(olt.id),
                'name': olt.name,
                'brand': olt.get_brand_display() if hasattr(olt, 'get_brand_display') else olt.brand,
                'ip_address': olt.ip_address,
                'pon_ports_count': olt.pon_ports_count,
                'total_onus': olt.total_onus,
                'online_onus': olt.online_onus,
                'status': olt.status,
            })
        onu_count = ONU.objects.filter(tenant=tenant).count()
        online_onu_count = ONU.objects.filter(tenant=tenant, status='Online').count()

        # 5. Operations Staff & Team
        staff_members = []
        roles_summary = {}
        for sp in StaffProfile.objects.filter(tenant=tenant).select_related('user'):
            role_code = sp.role
            roles_summary[role_code] = roles_summary.get(role_code, 0) + 1
            staff_members.append({
                'id': str(sp.id),
                'username': sp.user.username if sp.user else 'N/A',
                'full_name': f"{sp.user.first_name} {sp.user.last_name}".strip() if sp.user else (sp.user.username if sp.user else ''),
                'role': sp.role,
                'phone': sp.phone or '',
                'email': sp.user.email if sp.user else '',
            })

        # 6. Retail Packages
        packages = []
        for pkg in Package.objects.filter(tenant=tenant).order_by('regular_price'):
            packages.append({
                'id': str(pkg.id),
                'name': pkg.name,
                'speed_desc': f"{pkg.speed_mbps} Mbps / {pkg.upload_speed_mbps} Mbps",
                'price': float(pkg.regular_price),
                'validity_days': pkg.validity_days,
                'is_active': pkg.is_active,
                'subscribers_count': subs_qs.filter(package=pkg).count(),
            })

        return Response({
            'tenant': {
                'id': str(tenant.id),
                'name': tenant.name,
                'slug': tenant.slug,
                'domain': tenant.domain,
                'plan': tenant.plan,
                'max_subscribers': tenant.max_subscribers,
                'max_routers': tenant.max_routers,
                'is_active': tenant.is_active,
                'subscription_status': tenant.subscription_status,
                'contact_email': tenant.contact_email,
                'contact_phone': tenant.contact_phone,
                'address': tenant.address,
                'created_at': tenant.created_at,
            },
            'subscribers': {
                'total': total_subscribers,
                'active': active_subscribers,
                'expired': expired_subscribers,
                'suspended': suspended_subscribers,
                'left': left_subscribers,
                'monthly_billing_volume': monthly_billing_volume,
                'total_due_amount': total_due_amount,
                'connection_types': {
                    'pppoe': conn_pppoe,
                    'static': conn_static,
                    'dhcp': conn_dhcp,
                },
            },
            'pops': {
                'total': len(pops),
                'active': sum(1 for p in pops if p['status'] == 'Active'),
                'branches': pops,
            },
            'routers': {
                'total': len(routers),
                'online': sum(1 for r in routers if r['status'] == 'Online'),
                'devices': routers,
            },
            'optical': {
                'olt_count': len(olts),
                'onu_count': onu_count,
                'online_onu_count': online_onu_count,
                'olts': olts,
            },
            'staff': {
                'total': len(staff_members),
                'roles_summary': roles_summary,
                'members': staff_members,
            },
            'packages': {
                'total': len(packages),
                'items': packages,
            },
        })


class SaaSTenantRequestViewSet(viewsets.ModelViewSet):
    """
    Incoming Tenant Onboarding Signup Requests Queue.
    Platform owners review, approve (auto-deploy), or reject requests.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = TenantOnboardingRequest.objects.all().order_by('-created_at')
    serializer_class = TenantOnboardingRequestSerializer

    def list(self, request, *args, **kwargs):
        status_filter = request.query_params.get('status', '')
        page = request.query_params.get('page', '1')
        cache_key = f"saas:requests:list:{status_filter}:{page}"
        cached = RedisService.get(cache_key)
        if cached is not None:
            res = Response(cached)
            res['X-Cache'] = 'HIT'
            return res
        res = super().list(request, *args, **kwargs)
        RedisService.set(cache_key, res.data, timeout=120)
        res['X-Cache'] = 'MISS'
        return res

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        req_obj = self.get_object()
        if req_obj.status == 'approved':
            return Response({'error': 'Request has already been approved and provisioned.'}, status=status.HTTP_400_BAD_REQUEST)

        # Deploy tenant using request details
        slug = req_obj.requested_slug.strip().lower()
        if Tenant.objects.filter(slug=slug).exists():
            slug = f"{slug}{Tenant.objects.count() + 1}"

        domain = req_obj.requested_domain or f"{slug}.shebafi.xyz"
        plan = req_obj.requested_plan or "Growth"

        tenant = Tenant.objects.create(
            name=req_obj.organization_name,
            slug=slug,
            domain=domain,
            contact_email=req_obj.contact_email,
            contact_phone=req_obj.contact_phone,
            address=req_obj.address or "Dhaka, Bangladesh",
            plan=plan,
            max_subscribers=2500 if plan == 'Growth' else (500 if plan == 'Starter' else 10000),
            max_routers=10 if plan == 'Growth' else (3 if plan == 'Starter' else 50),
            subscription_status='active',
            is_active=True,
            notes=f"Approved from Signup Request ID {req_obj.id}"
        )

        CompanySetting.objects.create(
            tenant=tenant,
            company_name=tenant.name,
            support_email=tenant.contact_email,
            support_phone=tenant.contact_phone,
            address=tenant.address,
        )

        TenantDomain.objects.create(
            tenant=tenant,
            hostname=domain,
            is_primary=True,
            is_active=True,
            verified=True,
        )

        admin_username = f"{slug}_admin"
        admin_pass = "sheba1234"
        user = provision_tenant_admin(
            tenant=tenant,
            username=admin_username,
            password=admin_pass,
            email=tenant.contact_email,
            phone=tenant.contact_phone
        )
        token, _ = Token.objects.get_or_create(user=user)

        req_obj.status = 'approved'
        req_obj.admin_notes = f"Approved & provisioned tenant ID {tenant.id} by {request.user.username}"
        req_obj.save()

        tenant_serializer = SaaSTenantSerializer(tenant)
        return Response({
            'message': f'Request approved! Tenant "{tenant.name}" provisioned.',
            'tenant_id': str(tenant.id),
            'tenant': tenant_serializer.data,
            'admin_username': admin_username,
            'admin_password': admin_pass,
            'token': token.key,
        })

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        req_obj = self.get_object()
        req_obj.status = 'rejected'
        reason = request.data.get('reason', 'Application rejected by platform administrator.')
        req_obj.admin_notes = reason
        req_obj.save()
        return Response({'message': f'Request rejected.', 'status': req_obj.status})


class SaaSPackageViewSet(viewsets.ModelViewSet):
    """
    Platform Owner SaaS Packages / Pricing Tiers Management.
    Supports Create, Update, Delete, and Pause/Resume.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = SaaSPackage.objects.all().order_by('monthly_price')
    serializer_class = SaaSPackageSerializer

    def list(self, request, *args, **kwargs):
        cache_key = 'saas:packages:list'
        cached = RedisService.get(cache_key)
        if cached is not None:
            response = Response(cached)
            response['X-Cache'] = 'HIT'
            return response

        response = super().list(request, *args, **kwargs)
        RedisService.set(cache_key, response.data, timeout=600)
        response['X-Cache'] = 'MISS'
        return response

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        invalidate_saas_package_cache()
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        invalidate_saas_package_cache()
        return response

    def partial_update(self, request, *args, **kwargs):
        response = super().partial_update(request, *args, **kwargs)
        invalidate_saas_package_cache()
        return response

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        invalidate_saas_package_cache()
        return response

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        package = self.get_object()
        package.is_active = not package.is_active
        package.save()
        invalidate_saas_package_cache()
        return Response({
            'id': str(package.id),
            'name': package.name,
            'is_active': package.is_active,
            'message': f'Package "{package.name}" is now {"Active" if package.is_active else "Paused"}.'
        })



class SaaSSubscriptionViewSet(viewsets.ModelViewSet):
    """Tenant active software licensing contracts."""
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = TenantSubscription.objects.select_related('tenant', 'package').all().order_by('-created_at')
    serializer_class = TenantSubscriptionSerializer

    def list(self, request, *args, **kwargs):
        status_param = request.query_params.get('status', '')
        page = request.query_params.get('page', '1')
        cache_key = f"saas:subscriptions:list:{status_param}:{page}"
        cached = RedisService.get(cache_key)
        if cached is not None:
            res = Response(cached)
            res['X-Cache'] = 'HIT'
            return res
        res = super().list(request, *args, **kwargs)
        RedisService.set(cache_key, res.data, timeout=300)
        res['X-Cache'] = 'MISS'
        return res

    def create(self, request, *args, **kwargs):
        data = request.data
        tenant_id = data.get('tenant')
        package_id = data.get('package')
        billing_cycle = data.get('billing_cycle', 'monthly')

        if not tenant_id:
            return Response({'error': 'tenant ID is required.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = get_tenant_by_id_or_slug(tenant_id)
        if not tenant:
            return Response({'error': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

        package = None
        price = data.get('price')
        if package_id:
            try:
                package = SaaSPackage.objects.get(id=package_id)
                if not price:
                    price = package.yearly_price if billing_cycle == 'yearly' else package.monthly_price
            except SaaSPackage.DoesNotExist:
                return Response({'error': 'Package not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not price:
            price = 15000.00

        start_date = data.get('start_date') or timezone.now().date()
        if isinstance(start_date, str):
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            except Exception:
                start_date = timezone.now().date()

        days = 365 if billing_cycle == 'yearly' else 30
        end_date = data.get('end_date') or (start_date + timedelta(days=days))
        if isinstance(end_date, str):
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except Exception:
                end_date = start_date + timedelta(days=days)

        subscription = TenantSubscription.objects.create(
            tenant=tenant,
            package=package,
            billing_cycle=billing_cycle,
            price=price,
            status='active',
            start_date=start_date,
            end_date=end_date,
            next_billing_date=end_date,
            auto_renew=data.get('auto_renew', True)
        )

        tenant.subscription_status = 'active'
        tenant.subscription_expires_at = datetime.combine(end_date, datetime.min.time(), tzinfo=timezone.get_current_timezone())
        if package:
            tenant.plan = package.name
            tenant.max_subscribers = package.max_subscribers
            tenant.max_routers = package.max_routers
        tenant.save()

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='create_subscription',
            module='saas_billing',
            resource_type='TenantSubscription',
            resource_id=str(subscription.id),
            details={'tenant': tenant.name, 'package': package.name if package else 'Custom', 'price': str(price)}
        )

        serializer = self.get_serializer(subscription)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='renew')
    def renew(self, request, pk=None):
        sub = self.get_object()
        days = 365 if sub.billing_cycle == 'yearly' else 30
        current_end = sub.end_date or timezone.now().date()
        base_date = max(current_end, timezone.now().date())
        sub.end_date = base_date + timedelta(days=days)
        sub.next_billing_date = sub.end_date
        sub.status = 'active'
        sub.save()

        sub.tenant.subscription_status = 'active'
        sub.tenant.subscription_expires_at = datetime.combine(sub.end_date, datetime.min.time(), tzinfo=timezone.get_current_timezone())
        sub.tenant.save()

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='renew_subscription',
            module='saas_billing',
            resource_type='TenantSubscription',
            resource_id=str(sub.id),
            details={'tenant': sub.tenant.name, 'new_expiry': str(sub.end_date)}
        )

        return Response({
            'message': f'Subscription renewed for {sub.tenant.name} until {sub.end_date}.',
            'subscription': self.get_serializer(sub).data
        })

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        sub = self.get_object()
        sub.status = 'cancelled'
        sub.auto_renew = False
        sub.save()

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='cancel_subscription',
            module='saas_billing',
            resource_type='TenantSubscription',
            resource_id=str(sub.id),
            details={'tenant': sub.tenant.name}
        )

        return Response({
            'message': f'Subscription cancelled for {sub.tenant.name}.',
            'subscription': self.get_serializer(sub).data
        })


class SaaSPaymentViewSet(viewsets.ModelViewSet):
    """Platform revenue transactions collected from tenants for software licenses."""
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = SaaSPayment.objects.select_related('tenant', 'subscription').all().order_by('-paid_at')
    serializer_class = SaaSPaymentSerializer

    def list(self, request, *args, **kwargs):
        page = request.query_params.get('page', '1')
        cache_key = f"saas:payments:list:{page}"
        cached = RedisService.get(cache_key)
        if cached is not None:
            res = Response(cached)
            res['X-Cache'] = 'HIT'
            return res
        res = super().list(request, *args, **kwargs)
        RedisService.set(cache_key, res.data, timeout=120)
        res['X-Cache'] = 'MISS'
        return res

    def create(self, request, *args, **kwargs):
        data = request.data
        tenant_id = data.get('tenant')
        amount = data.get('amount')

        if not tenant_id or not amount:
            return Response({'error': 'tenant and amount are required.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = get_tenant_by_id_or_slug(tenant_id)
        if not tenant:
            return Response({'error': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

        subscription_id = data.get('subscription')
        subscription = None
        if subscription_id:
            subscription = TenantSubscription.objects.filter(id=subscription_id).first()

        trx_id = data.get('trx_id')
        if not trx_id:
            trx_id = f"PAY-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        payment = SaaSPayment.objects.create(
            tenant=tenant,
            subscription=subscription,
            amount=amount,
            payment_method=data.get('payment_method', 'bKash'),
            trx_id=trx_id,
            status=data.get('status', 'Completed'),
            notes=data.get('notes', ''),
            paid_at=timezone.now()
        )

        if payment.status == 'Completed' and subscription:
            subscription.status = 'active'
            subscription.save()
            tenant.subscription_status = 'active'
            tenant.save()

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='record_saas_payment',
            module='saas_billing',
            resource_type='SaaSPayment',
            resource_id=str(payment.id),
            details={'tenant': tenant.name, 'amount': str(amount), 'trx_id': trx_id}
        )

        serializer = self.get_serializer(payment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SaaSBackupViewSet(viewsets.ModelViewSet):
    """
    Global Disaster Recovery Engine & Database Backup Management.
    Trigger on-demand backups, list archives, download, and export single-tenant datasets.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = DatabaseBackup.objects.select_related('tenant').all().order_by('-created_at')
    serializer_class = DatabaseBackupSerializer

    def list(self, request, *args, **kwargs):
        page = request.query_params.get('page', '1')
        cache_key = f"saas:backups:list:{page}"
        cached = RedisService.get(cache_key)
        if cached is not None:
            res = Response(cached)
            res['X-Cache'] = 'HIT'
            return res
        res = super().list(request, *args, **kwargs)
        RedisService.set(cache_key, res.data, timeout=120)
        res['X-Cache'] = 'MISS'
        return res

    @action(detail=False, methods=['post'], url_path='create-backup')
    def create_backup(self, request):
        backup_name = request.data.get('name') or f"Manual Backup {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        backup_type = request.data.get('backup_type', 'full_database')

        backups_dir = os.path.join(settings.BASE_DIR, 'backups')
        os.makedirs(backups_dir, exist_ok=True)

        timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"sheba_db_{timestamp_str}.sqlite3"
        dest_path = os.path.join(backups_dir, filename)

        db_path = settings.DATABASES['default']['NAME']
        try:
            shutil.copy2(db_path, dest_path)
            file_size = os.path.getsize(dest_path)

            hasher = hashlib.sha256()
            with open(dest_path, 'rb') as f:
                for chunk in iter(lambda: f.read(65536), b''):
                    hasher.update(chunk)
            checksum = hasher.hexdigest()

            backup_obj = DatabaseBackup.objects.create(
                backup_name=backup_name,
                filename=filename,
                file_size_bytes=file_size,
                backup_type=backup_type,
                status='completed',
                storage_path=dest_path,
                triggered_by=request.user.username,
                checksum=checksum,
            )

            AuditLog.objects.create(
                tenant=None,
                actor_username=request.user.username,
                action='create_database_backup',
                module='saas_disaster_recovery',
                resource_type='DatabaseBackup',
                resource_id=str(backup_obj.id),
                details={'filename': filename, 'size_bytes': file_size}
            )

            serializer = self.get_serializer(backup_obj)
            return Response({'message': 'Full database snapshot created successfully.', 'backup': serializer.data}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': f'Backup failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], url_path='download')
    def download_backup(self, request, pk=None):
        backup_obj = self.get_object()
        if not os.path.exists(backup_obj.storage_path):
            raise Http404("Backup archive file not found on disk.")
        return FileResponse(open(backup_obj.storage_path, 'rb'), as_attachment=True, filename=backup_obj.filename)

    @action(detail=False, methods=['post'], url_path='export-tenant')
    def export_tenant_data(self, request):
        tenant_id = request.data.get('tenant_id')
        if not tenant_id:
            return Response({'error': 'tenant_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = get_tenant_by_id_or_slug(tenant_id)
        if not tenant:
            return Response({'error': 'Tenant not found'}, status=status.HTTP_404_NOT_FOUND)

        # Aggregate tenant records
        data_dump = {
            'metadata': {
                'platform': 'ShebaFi SaaS Disaster Recovery',
                'exported_at': datetime.now().isoformat(),
                'tenant_name': tenant.name,
                'tenant_slug': tenant.slug,
                'plan': tenant.plan,
            },
            'tenant_profile': {
                'id': str(tenant.id),
                'name': tenant.name,
                'slug': tenant.slug,
                'domain': tenant.domain,
                'contact_email': tenant.contact_email,
                'contact_phone': tenant.contact_phone,
                'address': tenant.address,
            },
            'domains': list(TenantDomain.objects.filter(tenant=tenant).values()),
            'customers': list(Customer.objects.filter(tenant=tenant).values('id', 'full_name', 'customer_code', 'mobile', 'email', 'package__name', 'status', 'due_amount')),
            'routers': list(Router.objects.filter(tenant=tenant).values('id', 'name', 'ip_address', 'status')),
            'onus': list(ONU.objects.filter(tenant=tenant).values('id', 'mac_address', 'serial_number', 'status', 'rx_power')),
            'packages': list(Package.objects.filter(tenant=tenant).values('id', 'name', 'speed_mbps', 'regular_price')),
            'tickets': list(Ticket.objects.filter(tenant=tenant).values('id', 'ticket_no', 'subject', 'priority', 'status')),
            'staff': list(StaffProfile.objects.filter(tenant=tenant).values('user__username', 'role', 'phone', 'is_active')),
        }

        backups_dir = os.path.join(settings.BASE_DIR, 'backups')
        os.makedirs(backups_dir, exist_ok=True)
        filename = f"tenant_{tenant.slug}_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        dest_path = os.path.join(backups_dir, filename)

        with open(dest_path, 'w', encoding='utf-8') as f:
            json.dump(data_dump, f, indent=2, default=str)

        file_size = os.path.getsize(dest_path)
        backup_obj = DatabaseBackup.objects.create(
            backup_name=f"Data Export: {tenant.name}",
            filename=filename,
            file_size_bytes=file_size,
            backup_type='tenant_data',
            status='completed',
            storage_path=dest_path,
            tenant=tenant,
            triggered_by=request.user.username,
        )

        return Response({
            'message': f'Tenant data successfully exported for {tenant.name}.',
            'backup': self.get_serializer(backup_obj).data,
            'summary': {
                'customers_count': len(data_dump['customers']),
                'routers_count': len(data_dump['routers']),
                'onus_count': len(data_dump['onus']),
            }
        })

    @action(detail=True, methods=['post'], url_path='restore')
    def restore_backup(self, request, pk=None):
        backup_obj = self.get_object()
        if backup_obj.backup_type != 'full_database':
            return Response({'error': 'Only full_database snapshots can be restored directly.'}, status=status.HTTP_400_BAD_REQUEST)

        if not os.path.exists(backup_obj.storage_path):
            return Response({'error': 'Backup archive file not found on disk.'}, status=status.HTTP_404_NOT_FOUND)

        db_path = settings.DATABASES['default']['NAME']
        backups_dir = os.path.join(settings.BASE_DIR, 'backups')
        os.makedirs(backups_dir, exist_ok=True)

        # 1. Pre-restore safety snapshot
        safety_filename = f"pre_restore_safety_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sqlite3"
        safety_path = os.path.join(backups_dir, safety_filename)
        try:
            if os.path.exists(db_path):
                shutil.copy2(db_path, safety_path)
        except Exception as e:
            return Response({'error': f'Failed to create pre-restore safety copy: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # 2. Overwrite database
        try:
            shutil.copy2(backup_obj.storage_path, db_path)
            AuditLog.objects.create(
                tenant=None,
                actor_username=request.user.username,
                action='restore_database_backup',
                module='saas_disaster_recovery',
                resource_type='DatabaseBackup',
                resource_id=str(backup_obj.id),
                details={'restored_from': backup_obj.filename, 'safety_backup': safety_filename}
            )
            return Response({
                'message': f'Database successfully restored from snapshot "{backup_obj.backup_name}".',
                'safety_backup_created': safety_filename
            })
        except Exception as e:
            return Response({'error': f'Database restoration failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SaaSDomainViewSet(viewsets.ModelViewSet):
    """
    Control plane domain management across all tenants: primary hostnames, aliases, DNS status.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = TenantDomain.objects.select_related('tenant').all().order_by('hostname')
    serializer_class = SaaSDomainSerializer

    def list(self, request, *args, **kwargs):
        page = request.query_params.get('page', '1')
        cache_key = f"saas:domains:list:{page}"
        cached = RedisService.get(cache_key)
        if cached is not None:
            res = Response(cached)
            res['X-Cache'] = 'HIT'
            return res
        res = super().list(request, *args, **kwargs)
        RedisService.set(cache_key, res.data, timeout=300)
        res['X-Cache'] = 'MISS'
        return res

    @action(detail=True, methods=['post'], url_path='toggle-verify')
    def toggle_verify(self, request, pk=None):
        domain = self.get_object()
        domain.verified = not domain.verified
        domain.save()
        return Response({
            'id': domain.id,
            'hostname': domain.hostname,
            'verified': domain.verified,
            'message': f'Domain {domain.hostname} verification marked as {domain.verified}.'
        })

    @action(detail=True, methods=['post'], url_path='verify-dns')
    def verify_dns(self, request, pk=None):
        domain = self.get_object()
        success = domain.verify_dns_txt()
        return Response({
            'id': domain.id,
            'hostname': domain.hostname,
            'verified': domain.verified,
            'success': success,
            'message': f"Domain {domain.hostname} DNS TXT verification {'succeeded' if success else 'failed'}."
        }, status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST)


class SaaSUserItemSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    email = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    last_login = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    tenant_name = serializers.CharField(read_only=True)
    is_platform_admin = serializers.BooleanField(read_only=True)


@extend_schema_view(
    list=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='List SaaS platform administrators and tenant master owners',
        responses={200: SaaSUserItemSerializer(many=True)}
    ),
    create=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Provision a new platform admin or tenant owner',
        responses={201: dict, 400: dict, 404: dict}
    ),
    destroy=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Delete a platform user',
        responses={200: dict, 400: dict, 404: dict}
    ),
    toggle_status=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Toggle user active / suspended status',
        responses={200: dict, 400: dict, 404: dict}
    ),
    reset_password=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Reset user password',
        responses={200: dict, 404: dict}
    ),
)
class SaaSUserViewSet(viewsets.ViewSet):
    """
    Global Software User Management: Directory, Creation, Status Toggling, Password Reset, and Deletion.
    Only accessible by Central Platform Administrators.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    serializer_class = SaaSUserItemSerializer
    queryset = User.objects.all()

    def list(self, request):
        super_admins = []
        for u in User.objects.filter(is_superuser=True):
            super_admins.append({
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'is_active': u.is_active,
                'last_login': u.last_login.strftime('%Y-%m-%d %H:%M') if u.last_login else 'Never',
                'role': 'Platform Super Admin',
                'tenant_name': 'Global Control Plane',
                'is_platform_admin': True,
            })

        tenant_owners = []
        for staff in StaffProfile.objects.select_related('user', 'tenant').filter(role__in=[UserRole.ADMIN, UserRole.SUPER_ADMIN]):
            if staff.user and staff.tenant:
                tenant_owners.append({
                    'id': staff.user.id,
                    'username': staff.user.username,
                    'email': staff.user.email,
                    'phone': staff.phone or staff.tenant.contact_phone,
                    'is_active': staff.user.is_active and staff.is_active,
                    'last_login': staff.user.last_login.strftime('%Y-%m-%d %H:%M') if staff.user.last_login else 'Never',
                    'role': 'Tenant Master Owner',
                    'tenant_id': str(staff.tenant.id),
                    'tenant_name': staff.tenant.name,
                    'tenant_slug': staff.tenant.slug,
                    'is_platform_admin': False,
                })

        return Response({
            'platform_admins': super_admins,
            'tenant_owners': tenant_owners,
            'total_users': len(super_admins) + len(tenant_owners),
        })

    def create(self, request):
        data = request.data
        username = data.get('username')
        password = data.get('password')
        email = data.get('email', '')
        phone = data.get('phone', '')
        role = data.get('role', 'TENANT_OWNER')
        tenant_id = data.get('tenant_id')

        if not username or not password:
            return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        username = username.strip().lower()
        if User.objects.filter(username=username).exists():
            return Response({'error': f'User "{username}" already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = None
        if role == 'TENANT_OWNER':
            if not tenant_id:
                return Response({'error': 'tenant_id is required when creating an ISP Admin.'}, status=status.HTTP_400_BAD_REQUEST)
            tenant = get_tenant_by_id_or_slug(tenant_id)
            if not tenant:
                return Response({'error': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

            user = provision_tenant_admin(
                tenant=tenant,
                username=username,
                password=password,
                email=email,
                phone=phone,
            )

            AuditLog.objects.create(
                tenant=tenant,
                actor_username=request.user.username,
                action='create_isp_admin',
                module='saas_user_management',
                resource_type='User',
                resource_id=str(user.id),
                details={'username': username, 'role': 'Admin', 'tenant': tenant.name}
            )

            return Response({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': 'Tenant Master Owner',
                'tenant_name': tenant.name,
                'message': f'ISP Admin "{username}" successfully created for {tenant.name}.'
            }, status=status.HTTP_201_CREATED)

        is_superuser = (role == 'PLATFORM_ADMIN')
        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            is_staff=True,
            is_superuser=is_superuser
        )

        StaffProfile.objects.create(
            user=user,
            tenant=None,
            role=UserRole.SUPER_ADMIN,
            phone=phone,
            is_active=True
        )

        Token.objects.create(user=user)

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='create_software_user',
            module='saas_user_management',
            resource_type='User',
            resource_id=str(user.id),
            details={'username': username, 'role': role, 'tenant': 'Global Control Plane'}
        )

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': 'Platform Super Admin',
            'tenant_name': 'Global Control Plane',
            'message': f'User "{username}" successfully created.'
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        if request.user.id == target_user.id:
            return Response({'error': 'You cannot suspend your own active administrator account.'}, status=status.HTTP_400_BAD_REQUEST)

        target_user.is_active = not target_user.is_active
        target_user.save()

        staff = getattr(target_user, 'staff_profile', None) or getattr(target_user, 'profile', None)
        if staff:
            staff.is_active = target_user.is_active
            staff.save()

        AuditLog.objects.create(
            tenant=staff.tenant if staff else None,
            actor_username=request.user.username,
            action='toggle_user_status',
            module='saas_user_management',
            resource_type='User',
            resource_id=str(target_user.id),
            details={'target_username': target_user.username, 'new_status': 'active' if target_user.is_active else 'suspended'}
        )

        return Response({
            'id': target_user.id,
            'username': target_user.username,
            'is_active': target_user.is_active,
            'message': f'User "{target_user.username}" is now {"Active" if target_user.is_active else "Suspended"}.'
        })

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_password = request.data.get('password') or f"ShebaPass_{uuid.uuid4().hex[:6]}"
        target_user.set_password(new_password)
        target_user.save()

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='reset_user_password',
            module='saas_user_management',
            resource_type='User',
            resource_id=str(target_user.id),
            details={'target_username': target_user.username}
        )

        return Response({
            'id': target_user.id,
            'username': target_user.username,
            'new_password': new_password,
            'message': f'Password for "{target_user.username}" successfully reset.'
        })

    def destroy(self, request, pk=None):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        if request.user.id == target_user.id:
            return Response({'error': 'You cannot delete your own active administrator account.'}, status=status.HTTP_400_BAD_REQUEST)

        username = target_user.username
        target_user.delete()

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='delete_software_user',
            module='saas_user_management',
            resource_type='User',
            resource_id=str(pk),
            details={'deleted_username': username}
        )

        return Response({'message': f'User "{username}" successfully removed.'})


class SaaSAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Global SaaS Audit Trail across all tenants and control plane operations."""
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = AuditLog.objects.select_related('tenant').all().order_by('-timestamp')
    serializer_class = SaaSAuditLogSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        tenant_slug = self.request.query_params.get('tenant_slug')
        if tenant_slug:
            qs = qs.filter(tenant__slug=tenant_slug)
        return qs

    # ── Tier 3C: compliance export across tenants ───────────────────────

    @extend_schema(
        parameters=[
            {'name': 'format', 'in': 'query',
             'description': 'csv | json | ndjson (default csv)'},
            {'name': 'tenant_slug', 'in': 'query',
             'description': 'Restrict to a single tenant'},
            {'name': 'from', 'in': 'query',
             'description': 'ISO-8601 lower-bound timestamp (inclusive)'},
            {'name': 'to', 'in': 'query',
             'description': 'ISO-8601 upper-bound timestamp (exclusive)'},
            {'name': 'action', 'in': 'query', 'description': 'Substring match'},
            {'name': 'module', 'in': 'query', 'description': 'Exact match'},
            {'name': 'actor_username', 'in': 'query', 'description': 'Exact match'},
            {'name': 'resource_type', 'in': 'query', 'description': 'Exact match'},
            {'name': 'resource_id', 'in': 'query', 'description': 'Exact match'},
        ],
        responses={200: 'application/csv'},
    )
    @action(detail=False, methods=['get'], url_path='export',
            renderer_classes=[CSVRenderer, NDJSONRenderer, RawJSONRenderer])
    def export(self, request, *args, **kwargs):
        """Stream the global audit log (optionally scoped to one tenant).

        Used by SaaS admins to produce regulator / BTRC-style reports.
        The export is read-only and audit-logs the export action itself.
        """
        params = request.query_params
        # Single-tenant scope: record an audit row so it's traceable.
        if params.get('tenant_slug'):
            try:
                from apps.core.models import Tenant as TenantModel
                from .audit_export import build_audit_queryset as _build
                t = TenantModel.objects.get(slug=params['tenant_slug'])
                AuditLog.objects.create(
                    tenant=None,  # control-plane event
                    actor_username=request.user.username,
                    action='compliance_export',
                    module='saas_control_plane',
                    resource_type='Tenant',
                    resource_id=str(t.id),
                    details={
                        'format': params.get('format', 'csv'),
                        'filters': {
                            k: params.get(k)
                            for k in ('from', 'to', 'action', 'module',
                                      'actor_username', 'resource_type',
                                      'resource_id')
                            if params.get(k)
                        },
                    },
                )
            except Exception:
                # Don't abort the export on audit-write failures; just log.
                logger.warning('compliance_export: audit row failed', exc_info=True)

        from .audit_export import build_audit_queryset as _build
        qs = _build(params=dict(params))
        # Prefer ``?format=`` query param, fall back to URL format suffix.
        fmt = (
            params.get('format')
            or kwargs.get('format')
            or 'csv'
        )
        return stream_export(qs, fmt)


@extend_schema(
    tags=['16. Multi-Tenant SaaS & Control Plane'],
    summary='SaaS control plane administrator login',
    description='Authenticates central platform administrators with Token return.',
    responses={200: dict, 400: dict, 401: dict, 403: dict}
)
class SaaSLoginView(views.APIView):
    """
    Central SaaS Control Plane authentication endpoint.
    Exclusively accepts Platform Super Administrators.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth import authenticate
        user = authenticate(username=username, password=password)
        if not user:
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        profile = getattr(user, 'profile', None)
        has_tenant_membership = StaffMembership.objects.filter(user=user, is_active=True).exists()
        is_central_admin = user.is_superuser or (
            profile and profile.role == UserRole.SUPER_ADMIN and not profile.tenant and not has_tenant_membership
        )
        if not is_central_admin:
            return Response({
                'error': 'Access Denied: You do not have permissions to access the SaaS Global Control Plane.',
                'code': 'CONTROL_PLANE_ACCESS_DENIED'
            }, status=status.HTTP_403_FORBIDDEN)


        # Per-session AuthSession (tenant=None, context=central_admin).
        # Also keep a legacy DRF Token in sync so older clients that
        # still send ``Authorization: Token <key>`` continue to work
        # through the migration window.
        from apps.authentication.sessions import (
            issue_session,
            SESSION_COOKIE_NAME,
            CONTEXT_CENTRAL_ADMIN,
        )
        from rest_framework.authtoken.models import Token
        from datetime import timedelta
        ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or \
             request.META.get('REMOTE_ADDR')
        issued = issue_session(
            user=user,
            tenant_id=None,
            context_type=CONTEXT_CENTRAL_ADMIN,
            ip_address=ip,
            user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:512],
        )
        legacy_token, _ = Token.objects.get_or_create(user=user)
        max_age = int(timedelta(days=30).total_seconds())
        resp = Response({
            # `session_token` is the new opaque per-session id; `token`
            # is the legacy DRF Token kept for backward compatibility.
            'session_token': issued.token,
            'token': legacy_token.key,
            'session_id': str(issued.session.id),
            'session_expires_at': issued.session.expires_at.isoformat(),
            'session_context': issued.session.context_type,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_superuser': user.is_superuser,
                'role': 'PLATFORM_SUPER_ADMIN',
            },
            'message': 'Welcome to ShebaFi SaaS Multi-Tenant Global Control Plane.'
        })
        resp['Set-Cookie'] = (
            f'{SESSION_COOKIE_NAME}={issued.token}; Path=/; Max-Age={max_age}; '
            'HttpOnly; SameSite=Lax'
        )
        return resp


@extend_schema(
    tags=['16. Multi-Tenant SaaS & Control Plane'],
    summary='Current SaaS administrator details',
    description='Returns profile and identity information for the authenticated SaaS central administrator.',
    responses={200: dict}
)
class SaaSMeView(views.APIView):
    """Returns profile information for the authenticated Central SaaS Administrator."""
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]

    def get(self, request):
        user = request.user
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'is_superuser': user.is_superuser,
            'role': 'PLATFORM_SUPER_ADMIN',
            'platform': 'ShebaFi Global Control Plane (admin.shebafi.xyz)',
            'timestamp': timezone.now().isoformat(),
        })


@extend_schema(
    tags=['16. Multi-Tenant SaaS & Control Plane'],
    summary='SaaS Administrator Logout',
    description='Invalidates the active SaaS control plane session token.',
    responses={200: dict}
)
class SaaSLogoutView(views.APIView):
    """Terminates session for the authenticated Central SaaS Administrator.

    Only the current AuthSession is revoked — does NOT delete the
    user's DRF Token (which would lock out other devices / sessions).
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]

    def post(self, request):
        from apps.authentication.sessions import (
            SESSION_COOKIE_NAME,
            extract_session_token,
            revoke_session,
        )
        from rest_framework.authtoken.models import Token
        revoked = 0
        current_token = extract_session_token(request)
        if current_token and revoke_session(current_token):
            revoked += 1
        # If the caller authenticated via the legacy ``Token`` keyword,
        # invalidate that token too so legacy clients can fully log out
        # without leaving the DRF Token usable.
        auth = request.META.get('HTTP_AUTHORIZATION', '')
        if auth.startswith('Token '):
            Token.objects.filter(user=request.user).delete()
        resp = Response(
            {'message': 'Logged out successfully.', 'revoked_sessions': revoked},
            status=status.HTTP_200_OK,
        )
        resp['Set-Cookie'] = (
            f'{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
        )
        return resp


class SaaSPasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True, help_text="Platform super administrator registered email address")


@extend_schema(
    tags=['16. Multi-Tenant SaaS & Control Plane'],
    summary='SaaS Administrator Password Reset Request',
    description='Requests a password reset link for a platform super administrator. Always returns HTTP 200.',
    request=SaaSPasswordResetRequestSerializer,
    responses={200: dict}
)
class SaaSPasswordResetView(views.APIView):
    """
    Public endpoint for Central Super Admin to request a password reset email.
    Always returns HTTP 200 to prevent user enumeration attacks.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        from django.contrib.auth.tokens import default_token_generator

        email = request.data.get('email', '').strip().lower()
        if email:
            user = User.objects.filter(email__iexact=email, is_superuser=True, is_active=True).first()
            if user:
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = default_token_generator.make_token(user)
                super_admin_domain = getattr(settings, 'SUPER_ADMIN_DOMAIN', 'super-admin.shebafi.xyz')
                frontend_origin = request.headers.get('origin') or f"https://{super_admin_domain}"
                reset_url = f"{frontend_origin}/reset-password?uid={uid}&token={token}"

                try:
                    from apps.core.email.service import EmailService
                    EmailService.send_password_reset_email(
                        user=user,
                        reset_url=reset_url,
                        recipient_email=user.email,
                        is_superadmin=True
                    )
                except Exception as mail_exc:
                    logger.error(f"SaaSPasswordResetView: failed to dispatch email: {mail_exc}")

        return Response({
            'detail': 'If an account exists with this email, a password reset link has been sent.'
        }, status=status.HTTP_200_OK)


class SaaSPasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True, help_text="Base64-encoded user ID")
    token = serializers.CharField(required=True, help_text="Cryptographic reset token")
    new_password = serializers.CharField(required=True, write_only=True, min_length=8, help_text="New administrator password")


@extend_schema(
    tags=['16. Multi-Tenant SaaS & Control Plane'],
    summary='SaaS Administrator Password Reset Confirm',
    description='Validates token and updates the platform super administrator password.',
    request=SaaSPasswordResetConfirmSerializer,
    responses={200: dict, 400: dict}
)
class SaaSPasswordResetConfirmView(views.APIView):
    """
    Public endpoint for Central Super Admin to confirm password reset with cryptographic token.
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
            user = User.objects.get(pk=uid, is_superuser=True, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({'error': 'Invalid or expired password reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({'error': 'Invalid or expired password reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        # Revoke existing auth tokens to enforce fresh authentication
        Token.objects.filter(user=user).delete()

        AuditLog.objects.create(
            tenant=None,
            actor_username=user.username,
            action='saas_password_reset_confirmed',
            module='saas_control_plane',
            resource_type='User',
            resource_id=str(user.id),
            details={'username': user.username, 'email': user.email}
        )

        return Response({
            'detail': 'Password has been successfully updated. Please sign in with your new credentials.'
        }, status=status.HTTP_200_OK)


# ════════════════════════ 12. API CREDENTIALS MANAGEMENT ════════════════════════

class SaaSApiCredentialSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)
    created_by_username = serializers.SerializerMethodField()
    status = serializers.CharField(source='effective_status', read_only=True)

    class Meta:
        model = TenantApiToken
        fields = [
            'id', 'tenant', 'tenant_name', 'tenant_slug', 'name',
            'key_prefix', 'status', 'rate_limit', 'permissions', 'is_active',
            'expires_at', 'revoked_at', 'last_used_at',
            'created_by', 'created_by_username', 'created_at', 'updated_at',
        ]
        read_only_fields = (
            'id', 'key_prefix', 'status', 'revoked_at', 'last_used_at',
            'created_by', 'created_at', 'updated_at'
        )

    def get_created_by_username(self, obj):
        return obj.created_by.username if obj.created_by else 'system'


@extend_schema_view(
    list=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='List ISP API credentials across all tenants',
        description='Returns all issued ISP Secret API keys. Filterable by tenant UUID or slug.'
    ),
    create=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Generate a new ISP Secret API Key',
        description='Generates a cryptographically random 256-bit API key. The full secret is returned ONCE in secret_key.'
    ),
    retrieve=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Retrieve ISP API credential metadata',
        description='Returns credential metadata (safe key prefix, permissions, status). Does NOT return the secret key.'
    ),
)
class SaaSApiCredentialViewSet(viewsets.ModelViewSet):
    """
    Super Admin ViewSet to manage, generate, rotate, revoke, and monitor secret API credentials
    for each ISP tenant.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    serializer_class = SaaSApiCredentialSerializer
    queryset = TenantApiToken.objects.select_related('tenant', 'created_by').all().order_by('-created_at')

    def get_queryset(self):
        qs = super().get_queryset()
        tenant_param = self.request.query_params.get('tenant')
        if tenant_param:
            t = get_tenant_by_id_or_slug(tenant_param)
            if t:
                qs = qs.filter(tenant=t)
            else:
                qs = qs.none()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())
        return qs

    def list(self, request, *args, **kwargs):
        tenant_param = request.query_params.get('tenant', '')
        status_param = request.query_params.get('status', '')
        page = request.query_params.get('page', '1')
        cache_key = f"saas:api-credentials:list:{tenant_param}:{status_param}:{page}"
        cached = RedisService.get(cache_key)
        if cached is not None:
            res = Response(cached)
            res['X-Cache'] = 'HIT'
            return res
        res = super().list(request, *args, **kwargs)
        RedisService.set(cache_key, res.data, timeout=300)
        res['X-Cache'] = 'MISS'
        return res

    def create(self, request, *args, **kwargs):
        tenant_identifier = request.data.get('tenant')
        name = (request.data.get('name') or '').strip()
        permissions_list = request.data.get('permissions') or []
        expires_at = request.data.get('expires_at') or None
        rate_limit = request.data.get('rate_limit') or 1000

        if not tenant_identifier:
            return Response({'error': 'tenant is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not name:
            return Response({'error': 'name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = get_tenant_by_id_or_slug(tenant_identifier)
        if not tenant:
            return Response({'error': f'Tenant "{tenant_identifier}" not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            rate_limit = int(rate_limit)
        except (ValueError, TypeError):
            rate_limit = 1000

        token_obj, raw_secret = TenantApiToken.generate(
            tenant=tenant,
            name=name,
            permissions=permissions_list,
            expires_at=expires_at,
            created_by=request.user,
            rate_limit=rate_limit,
        )

        AuditLog.objects.create(
            tenant=tenant,
            actor_username=request.user.username,
            action='api_credential_created',
            module='api_credentials',
            resource_type='TenantApiToken',
            resource_id=str(token_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            after={
                'name': token_obj.name,
                'key_prefix': token_obj.key_prefix,
                'permissions': token_obj.permissions,
                'rate_limit': token_obj.rate_limit,
                'expires_at': str(token_obj.expires_at) if token_obj.expires_at else None,
            }
        )

        data = SaaSApiCredentialSerializer(token_obj).data
        data['secret_key'] = raw_secret  # Return ONE-TIME secret
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def rotate(self, request, pk=None):
        """Rotate an existing API key. Returns a new one-time secret."""
        token_obj = self.get_object()
        old_prefix = token_obj.key_prefix
        token_obj, raw_secret = token_obj.rotate(created_by=request.user)

        AuditLog.objects.create(
            tenant=token_obj.tenant,
            actor_username=request.user.username,
            action='api_credential_rotated',
            module='api_credentials',
            resource_type='TenantApiToken',
            resource_id=str(token_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            before={'old_prefix': old_prefix},
            after={'new_prefix': token_obj.key_prefix, 'status': token_obj.status}
        )

        data = SaaSApiCredentialSerializer(token_obj).data
        data['secret_key'] = raw_secret
        return Response(data)

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        """Immediately revokes an API credential."""
        token_obj = self.get_object()
        token_obj.revoke()

        AuditLog.objects.create(
            tenant=token_obj.tenant,
            actor_username=request.user.username,
            action='api_credential_revoked',
            module='api_credentials',
            resource_type='TenantApiToken',
            resource_id=str(token_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            after={'status': token_obj.status, 'revoked_at': str(token_obj.revoked_at)}
        )

        return Response(SaaSApiCredentialSerializer(token_obj).data)

    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        """Temporarily suspends an API credential without revoking it."""
        token_obj = self.get_object()
        token_obj.suspend()

        AuditLog.objects.create(
            tenant=token_obj.tenant,
            actor_username=request.user.username,
            action='api_credential_suspended',
            module='api_credentials',
            resource_type='TenantApiToken',
            resource_id=str(token_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            after={'status': token_obj.status}
        )

        return Response(SaaSApiCredentialSerializer(token_obj).data)

    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        """Reactivates a suspended API credential."""
        token_obj = self.get_object()
        try:
            token_obj.reactivate()
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.objects.create(
            tenant=token_obj.tenant,
            actor_username=request.user.username,
            action='api_credential_reactivated',
            module='api_credentials',
            resource_type='TenantApiToken',
            resource_id=str(token_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            after={'status': token_obj.status}
        )

        return Response(SaaSApiCredentialSerializer(token_obj).data)


# ════════════════════════ 13. API APPLICATIONS MANAGEMENT ════════════════════════

class SaaSApplicationSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)
    created_by_username = serializers.SerializerMethodField()
    status = serializers.CharField(source='effective_status', read_only=True)

    class Meta:
        model = ApiApplication
        fields = [
            'id', 'tenant', 'tenant_name', 'tenant_slug', 'name',
            'key_prefix', 'status', 'rate_limit', 'permissions', 'is_active',
            'expires_at', 'revoked_at', 'last_used_at',
            'created_by', 'created_by_username', 'created_at', 'updated_at',
        ]
        read_only_fields = (
            'id', 'key_prefix', 'status', 'revoked_at', 'last_used_at',
            'created_by', 'created_at', 'updated_at'
        )

    def get_created_by_username(self, obj):
        return obj.created_by.username if obj.created_by else 'system'


@extend_schema_view(
    list=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='List External ISP Frontend Applications',
        description='Returns all registered API Applications across tenants. Filterable by tenant UUID or slug.'
    ),
    create=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Register an External ISP Frontend Application',
        description='Registers an API Application bound to an ISP tenant and generates a high-entropy API key. The one-time secret is returned in secret_key.'
    ),
    retrieve=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Retrieve ISP Application metadata',
        description='Returns application metadata (safe key prefix, permissions, status). Does NOT return the secret key.'
    ),
    rotate=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Rotate an External ISP Frontend Application API key',
        description='Generates a new API key for the application and revokes the previous key. Returns a one-time secret_key.'
    ),
    revoke=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Revoke an External ISP Frontend Application',
        description='Immediately revokes the application credentials and prevents any further API authentication.'
    ),
    suspend=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Suspend an External ISP Frontend Application',
        description='Temporarily suspends application credentials without permanent revocation.'
    ),
    reactivate=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='Reactivate a suspended External ISP Frontend Application',
        description='Reactivates a suspended application credential.'
    ),
)
class SaaSWireGuardViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Phase 22: Central admin surface for every tenant's WireGuard tunnels.
    Lists configs across all tenants, lets the super-admin trigger key
    rotation, push to MikroTik, and read the datewise audit log on any
    tenant's behalf. All mutations are recorded with ``is_saas_admin``
    so ISP admins can see SaaS-side changes.
    """
    from apps.network.models import (
        WireGuardAuditEvent,
        WireGuardConfig,
    )
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    serializer_class = None  # populated lazily to avoid circular import

    def get_serializer_class(self):
        from apps.network.serializers import WireGuardConfigSerializer
        return WireGuardConfigSerializer

    def get_queryset(self):
        from apps.network.models import WireGuardConfig
        qs = WireGuardConfig.objects.select_related('router', 'tenant').order_by('-updated_at')
        tenant_param = self.request.query_params.get('tenant')
        if tenant_param:
            from .saas_utils import get_tenant_by_id_or_slug
            t = get_tenant_by_id_or_slug(tenant_param)
            qs = qs.filter(tenant=t) if t else qs.none()
        return qs

    @action(detail=True, methods=['post'])
    def rotate(self, request, pk=None):
        from apps.network.services.vpn import WireGuardService
        meta = _saas_actor(request)
        try:
            keys = WireGuardService.rotate_keys(
                self.get_object(),
                actor=meta['actor'], actor_role=meta['actor_role'],
                is_saas_admin=True,
            )
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'ok': True, 'public_key': keys['public_key'], 'private_key': keys['private_key']})

    @action(detail=True, methods=['post'])
    def push(self, request, pk=None):
        from apps.network.services.vpn import WireGuardService
        meta = _saas_actor(request)
        result = WireGuardService.push_to_router(
            self.get_object(),
            actor=meta['actor'], actor_role=meta['actor_role'],
            is_saas_admin=True,
        )
        return Response({'ok': result['ok'], 'message': result['message'], 'script': result['script']})

    @action(detail=True, methods=['post'])
    def refresh_handshakes(self, request, pk=None):
        from apps.network.services.vpn import WireGuardService
        meta = _saas_actor(request)
        peers = WireGuardService.record_handshakes(
            self.get_object(),
            actor=meta['actor'], actor_role=meta['actor_role'],
            is_saas_admin=True,
        )
        return Response({'ok': True, 'count': len(peers), 'peers': peers})

    @action(detail=False, methods=['get'])
    def audit_log(self, request):
        from apps.network.models import WireGuardAuditEvent
        from apps.network.serializers import WireGuardAuditEventSerializer
        limit = int(request.query_params.get('limit', 100))
        qs = WireGuardAuditEvent.objects.all().order_by('-occurred_at')
        tenant_param = request.query_params.get('tenant')
        if tenant_param:
            from .saas_utils import get_tenant_by_id_or_slug
            t = get_tenant_by_id_or_slug(tenant_param)
            qs = qs.filter(tenant=t) if t else qs.none()
        events = qs[:limit]
        data = WireGuardAuditEventSerializer(events, many=True).data
        return Response({
            'count': qs.count() if hasattr(qs, 'count') else len(data),
            'results': data,
        })


def _saas_actor(request) -> dict:
    user = getattr(request, 'user', None)
    actor = user.get_username() if user and getattr(user, 'is_authenticated', False) and hasattr(user, 'get_username') else ''
    return {'actor': actor, 'actor_role': 'central_admin', 'is_saas_admin': True}


class SaaSApplicationViewSet(viewsets.ModelViewSet):
    """
    Super Admin ViewSet to register, manage, generate, rotate, revoke, and monitor
    External ISP Frontend Applications (e.g. Next.js, Mobile App) for each ISP tenant.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    serializer_class = SaaSApplicationSerializer
    queryset = ApiApplication.objects.select_related('tenant', 'created_by').all().order_by('-created_at')

    def get_queryset(self):
        qs = super().get_queryset()
        tenant_param = self.request.query_params.get('tenant')
        if tenant_param:
            t = get_tenant_by_id_or_slug(tenant_param)
            if t:
                qs = qs.filter(tenant=t)
            else:
                qs = qs.none()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())
        return qs

    def list(self, request, *args, **kwargs):
        tenant_param = request.query_params.get('tenant', '')
        status_param = request.query_params.get('status', '')
        page = request.query_params.get('page', '1')
        cache_key = f"saas:applications:list:{tenant_param}:{status_param}:{page}"
        cached = RedisService.get(cache_key)
        if cached is not None:
            res = Response(cached)
            res['X-Cache'] = 'HIT'
            return res
        res = super().list(request, *args, **kwargs)
        RedisService.set(cache_key, res.data, timeout=300)
        res['X-Cache'] = 'MISS'
        return res

    def create(self, request, *args, **kwargs):
        tenant_identifier = request.data.get('tenant')
        name = (request.data.get('name') or '').strip()
        permissions_list = request.data.get('permissions') or []
        expires_at = request.data.get('expires_at') or None
        rate_limit = request.data.get('rate_limit') or 1000

        if not tenant_identifier:
            return Response({'error': 'tenant is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not name:
            return Response({'error': 'name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = get_tenant_by_id_or_slug(tenant_identifier)
        if not tenant:
            return Response({'error': f'Tenant "{tenant_identifier}" not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            rate_limit = int(rate_limit)
        except (ValueError, TypeError):
            rate_limit = 1000

        app_obj, raw_secret = ApiApplication.create_application(
            tenant=tenant,
            name=name,
            permissions=permissions_list,
            expires_at=expires_at,
            created_by=request.user,
            rate_limit=rate_limit,
        )

        AuditLog.objects.create(
            tenant=tenant,
            actor_username=request.user.username,
            action='api_application_created',
            module='api_applications',
            resource_type='ApiApplication',
            resource_id=str(app_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            after={
                'name': app_obj.name,
                'key_prefix': app_obj.key_prefix,
                'permissions': app_obj.permissions,
                'rate_limit': app_obj.rate_limit,
                'expires_at': str(app_obj.expires_at) if app_obj.expires_at else None,
            }
        )

        data = SaaSApplicationSerializer(app_obj).data
        data['secret_key'] = raw_secret  # ONE-TIME secret display
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def rotate(self, request, pk=None):
        """Rotate an existing application API key. Returns a new one-time secret."""
        app_obj = self.get_object()
        old_prefix = app_obj.key_prefix
        app_obj, raw_secret = app_obj.rotate(created_by=request.user)

        AuditLog.objects.create(
            tenant=app_obj.tenant,
            actor_username=request.user.username,
            action='api_application_rotated',
            module='api_applications',
            resource_type='ApiApplication',
            resource_id=str(app_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            before={'old_prefix': old_prefix},
            after={'new_prefix': app_obj.key_prefix, 'status': app_obj.status}
        )

        data = SaaSApplicationSerializer(app_obj).data
        data['secret_key'] = raw_secret
        return Response(data)

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        """Immediately revokes an application credential."""
        app_obj = self.get_object()
        app_obj.revoke()

        AuditLog.objects.create(
            tenant=app_obj.tenant,
            actor_username=request.user.username,
            action='api_application_revoked',
            module='api_applications',
            resource_type='ApiApplication',
            resource_id=str(app_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            after={'status': app_obj.status, 'revoked_at': str(app_obj.revoked_at)}
        )

        return Response(SaaSApplicationSerializer(app_obj).data)

    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        """Temporarily suspends an application credential without revoking it."""
        app_obj = self.get_object()
        app_obj.suspend()

        AuditLog.objects.create(
            tenant=app_obj.tenant,
            actor_username=request.user.username,
            action='api_application_suspended',
            module='api_applications',
            resource_type='ApiApplication',
            resource_id=str(app_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            after={'status': app_obj.status}
        )

        return Response(SaaSApplicationSerializer(app_obj).data)

    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        """Reactivates a suspended application credential."""
        app_obj = self.get_object()
        try:
            app_obj.reactivate()
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.objects.create(
            tenant=app_obj.tenant,
            actor_username=request.user.username,
            action='api_application_reactivated',
            module='api_applications',
            resource_type='ApiApplication',
            resource_id=str(app_obj.id),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            after={'status': app_obj.status}
        )

        return Response(SaaSApplicationSerializer(app_obj).data)




# ─────────────────────────────────────────────────────────────────────────────
# Phase 25: SaaS Feature Flag Dashboard endpoints
# ─────────────────────────────────────────────────────────────────────────────
# Routes (mounted by URL router):
#   /api/v1/saas/feature-flags/                  GET   list overrides
#   /api/v1/saas/feature-flags/{id}/             DEL   delete override (clears)
#   /api/v1/saas/feature-flags/set/              POST  set single flag
#   /api/v1/saas/feature-flags/bulk-set/         POST  batch set
#   /api/v1/saas/features/                       GET   feature catalog
#   /api/v1/saas/feature-matrix/                 GET   tenants × features matrix


class TenantFeatureFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantFeatureFlag
        fields = [
            'id', 'tenant', 'feature_key', 'enabled', 'config',
            'enabled_at', 'updated_at', 'enabled_by',
        ]
        read_only_fields = ['id', 'enabled_at', 'updated_at', 'enabled_by']


class FeatureFlagBulkItemSerializer(serializers.Serializer):
    feature_key = serializers.CharField()
    enabled = serializers.BooleanField(default=True)
    config = serializers.DictField(required=False, default=dict)


class TenantFeatureFlagBulkSetSerializer(serializers.Serializer):
    tenant = serializers.CharField()
    flags = serializers.ListField(child=FeatureFlagBulkItemSerializer())


class TenantFeatureFlagViewSet(viewsets.ModelViewSet):
    """Central control-plane endpoint for per-tenant feature overrides."""

    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = TenantFeatureFlag.objects.select_related('tenant', 'enabled_by')
    serializer_class = TenantFeatureFlagSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        tenant_slug = self.request.query_params.get('tenant')
        if tenant_slug:
            qs = qs.filter(tenant__slug=tenant_slug)
        feature_key = self.request.query_params.get('feature_key')
        if feature_key:
            qs = qs.filter(feature_key=feature_key)
        return qs

    def perform_create(self, serializer):
        from .features import invalidate_cache
        flag = serializer.save()
        invalidate_cache(flag.tenant)

    def perform_destroy(self, instance):
        from .features import invalidate_cache
        tenant = instance.tenant
        instance.delete()
        invalidate_cache(tenant)

    @extend_schema(
        request=TenantFeatureFlagSerializer,
        responses={200: TenantFeatureFlagSerializer},
    )
    @action(detail=False, methods=['post'], url_path='set')
    def set_flag(self, request):
        from .features import FEATURE_REGISTRY, invalidate_cache
        tenant_id = request.data.get('tenant')
        feature_key = request.data.get('feature_key')
        enabled = bool(request.data.get('enabled', True))
        config = request.data.get('config') or {}
        if feature_key not in FEATURE_REGISTRY:
            return Response(
                {'error': f'Unknown feature_key: {feature_key}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            tenant = Tenant.objects.get(id=tenant_id)
        except (Tenant.DoesNotExist, ValueError):
            return Response(
                {'error': 'Unknown tenant.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        flag, created = TenantFeatureFlag.objects.update_or_create(
            tenant=tenant,
            feature_key=feature_key,
            defaults={
                'enabled': enabled,
                'config': config,
                'enabled_by': request.user if request.user.is_authenticated else None,
            },
        )
        invalidate_cache(tenant)
        return Response(
            TenantFeatureFlagSerializer(flag).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @extend_schema(
        request=TenantFeatureFlagBulkSetSerializer,
        responses={200: serializers.DictField()},
    )
    @action(detail=False, methods=['post'], url_path='bulk-set')
    def bulk_set(self, request):
        from django.db import transaction
        from .features import FEATURE_REGISTRY, invalidate_cache
        tenant_id = request.data.get('tenant')
        flags = request.data.get('flags') or []
        if not isinstance(flags, list):
            return Response(
                {'error': 'flags must be a list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            tenant = Tenant.objects.get(id=tenant_id)
        except (Tenant.DoesNotExist, ValueError):
            return Response(
                {'error': 'Unknown tenant.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Phase 1: validate every entry — reject the whole batch on any
        # malformed payload (caller can fix + retry, no partial apply).
        for entry in flags:
            if not isinstance(entry, dict):
                return Response(
                    {'error': 'Each flag must be an object.', 'entry': entry},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            key = entry.get('feature_key')
            if key not in FEATURE_REGISTRY:
                return Response(
                    {'error': f'Unknown feature_key: {key}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cfg = entry.get('config') or {}
            if not isinstance(cfg, dict):
                return Response(
                    {'error': f'config for {key} must be an object, got {type(cfg).__name__}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        # Phase 2: apply.
        applied = []
        with transaction.atomic():
            for entry in flags:
                key = entry['feature_key']
                TenantFeatureFlag.objects.update_or_create(
                    tenant=tenant,
                    feature_key=key,
                    defaults={
                        'enabled': bool(entry.get('enabled', True)),
                        'config': entry.get('config') or {},
                        'enabled_by': (
                            request.user if request.user.is_authenticated else None
                        ),
                    },
                )
                applied.append(key)
        invalidate_cache(tenant)
        return Response({
            'applied': applied,
            'applied_count': len(applied),
        })


class SaaSFeatureCatalogView(views.APIView):
    """List every feature in :data:`FEATURE_REGISTRY` with metadata."""

    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]

    def get(self, request):
        from .features import FEATURE_REGISTRY
        features = [
            {
                'key': spec.key,
                'label': spec.label,
                'category': spec.category,
                'description': spec.description,
                'default_enabled': spec.default_enabled,
                'paid': spec.paid,
            }
            for spec in FEATURE_REGISTRY.values()
        ]
        return Response({'count': len(features), 'features': features})


class SaaSFeatureMatrixView(views.APIView):
    """Returns tenants × features with the effective enabled state.

    Used by the SaaS dashboard to render the toggle matrix without N²
    HTTP calls.
    """

    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]

    def get(self, request):
        from .features import FEATURE_REGISTRY, is_feature_enabled
        tenants = list(Tenant.objects.order_by('name'))
        rows = []
        # Pre-load overrides to avoid N+1.
        overrides = {
            (f.tenant_id, f.feature_key): f
            for f in TenantFeatureFlag.objects.filter(
                tenant__in=tenants,
            )
        }
        for spec in FEATURE_REGISTRY.values():
            row = {
                'feature_key': spec.key,
                'feature_label': spec.label,
                'label': spec.label,
                'description': spec.description,
                'category': spec.category,
                'paid': spec.paid,
                'default_enabled': spec.default_enabled,
                'tenants': [],
            }
            for t in tenants:
                flag = overrides.get((t.id, spec.key))
                effective = flag.enabled if flag else spec.default_enabled
                row['tenants'].append({
                    'tenant_id': str(t.id),
                    'tenant_slug': t.slug,
                    'tenant_name': t.name,
                    'enabled': effective,
                    'is_override': bool(flag),
                })
            rows.append(row)
        return Response({
            'tenants': [
                {'id': str(t.id), 'slug': t.slug, 'name': t.name}
                for t in tenants
            ],
            'rows': rows,
        })


class SaaSEmployeeSerializer(serializers.ModelSerializer):
    worker_id = serializers.CharField(source='employee_code', required=False, allow_blank=True)
    role = serializers.CharField(source='designation', required=False, allow_blank=True)
    worker_type = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id', 'worker_id', 'employee_code', 'full_name', 'email', 'phone',
            'role', 'designation', 'worker_type', 'department',
            'is_active', 'joining_date', 'basic_salary', 'created_at',
            'tenant', 'tenant_name'
        ]
        read_only_fields = ('created_at',)

    def get_worker_type(self, obj):
        return 'Employee' if obj.is_active else 'Contractor'


@extend_schema_view(
    list=extend_schema(tags=['16. Multi-Tenant SaaS & Control Plane'], summary='List SaaS Team Employees'),
    create=extend_schema(tags=['16. Multi-Tenant SaaS & Control Plane'], summary='Create SaaS Team Employee'),
    retrieve=extend_schema(tags=['16. Multi-Tenant SaaS & Control Plane'], summary='Retrieve SaaS Team Employee'),
    update=extend_schema(tags=['16. Multi-Tenant SaaS & Control Plane'], summary='Update SaaS Team Employee'),
    destroy=extend_schema(tags=['16. Multi-Tenant SaaS & Control Plane'], summary='Delete SaaS Team Employee'),
)
class SaaSEmployeeViewSet(viewsets.ModelViewSet):
    """
    Central SaaS Employee and Team Member Management.
    Supports directory viewing, search, filter, creation, updating, and deletion.
    """
    serializer_class = SaaSEmployeeSerializer
    queryset = Employee.objects.select_related('tenant').all().order_by('created_at')

    def get_permissions(self):
        if settings.DEBUG:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), IsCentralAdmin()]

    def _ensure_initial_seeds(self):
        if Employee.objects.count() >= 6:
            return

        tenant = Tenant.objects.first()
        if not tenant:
            tenant = Tenant.objects.create(
                name="Sheba Fi Broadband Network",
                slug="shebafi",
                domain="shebafi.xyz",
                contact_email="admin@shebafi.xyz",
                is_active=True
            )

        SEED_EMPLOYEES = [
            {"worker_id": "#4586936", "full_name": "Alex Turner", "email": "alex@acme.com", "role": "Product Manager", "department": "Product"},
            {"worker_id": "#4586937", "full_name": "Emma Davis", "email": "emma@acme.com", "role": "Senior Designer", "department": "Design"},
            {"worker_id": "#4586933", "full_name": "John Smith", "email": "john@acme.com", "role": "Chief Technology Officer", "department": "Engineering"},
            {"worker_id": "#4586932", "full_name": "Kate Moore", "email": "kate@acme.com", "role": "Chief Executive Officer", "department": "Executive"},
            {"worker_id": "#4586935", "full_name": "Mike Wilson", "email": "mike@acme.com", "role": "VP of Engineering", "department": "Engineering"},
            {"worker_id": "#4586934", "full_name": "Sara Johnson", "email": "sara@acme.com", "role": "Chief Marketing Officer", "department": "Marketing"},
            {"worker_id": "#4586938", "full_name": "David Lee", "email": "david@acme.com", "role": "Principal Architect", "department": "Engineering"},
            {"worker_id": "#4586939", "full_name": "Sophia Chen", "email": "sophia@acme.com", "role": "Lead UI/UX Designer", "department": "Design"},
            {"worker_id": "#4586940", "full_name": "Robert Garcia", "email": "robert@acme.com", "role": "DevOps Specialist", "department": "Infrastructure"},
            {"worker_id": "#4586941", "full_name": "Olivia Martinez", "email": "olivia@acme.com", "role": "Senior Backend Engineer", "department": "Engineering"},
            {"worker_id": "#4586942", "full_name": "James Anderson", "email": "james@acme.com", "role": "Security Operations Lead", "department": "Security"},
            {"worker_id": "#4586943", "full_name": "Emily Thomas", "email": "emily@acme.com", "role": "Customer Success Director", "department": "Operations"},
            {"worker_id": "#4586944", "full_name": "Lucas Brown", "email": "lucas@acme.com", "role": "Full Stack Developer", "department": "Engineering"},
            {"worker_id": "#4586945", "full_name": "Mia White", "email": "mia@acme.com", "role": "QA Engineering Manager", "department": "Quality Assurance"},
            {"worker_id": "#4586946", "full_name": "William Harris", "email": "william@acme.com", "role": "Infrastructure Architect", "department": "Infrastructure"},
            {"worker_id": "#4586947", "full_name": "Charlotte Martin", "email": "charlotte@acme.com", "role": "Product Marketing Lead", "department": "Marketing"},
            {"worker_id": "#4586948", "full_name": "Benjamin Clark", "email": "benjamin@acme.com", "role": "Site Reliability Engineer", "department": "Infrastructure"},
            {"worker_id": "#4586949", "full_name": "Amelia Lewis", "email": "amelia@acme.com", "role": "Frontend Engineer", "department": "Engineering"},
            {"worker_id": "#4586950", "full_name": "Henry Walker", "email": "henry@acme.com", "role": "Cloud Systems Specialist", "department": "Infrastructure"},
            {"worker_id": "#4586951", "full_name": "Harper Hall", "email": "harper@acme.com", "role": "Data Analytics Lead", "department": "Analytics"},
            {"worker_id": "#4586952", "full_name": "Alexander Allen", "email": "alexander@acme.com", "role": "Network Core Engineer", "department": "Network Operations"},
            {"worker_id": "#4586953", "full_name": "Evelyn Young", "email": "evelyn@acme.com", "role": "Technical Program Manager", "department": "Program Management"},
            {"worker_id": "#4586954", "full_name": "Daniel Hernandez", "email": "daniel@acme.com", "role": "Backend Platform Engineer", "department": "Engineering"},
            {"worker_id": "#4586955", "full_name": "Abigail King", "email": "abigail@acme.com", "role": "Solutions Architect", "department": "Solutions"},
            {"worker_id": "#4586956", "full_name": "Matthew Wright", "email": "matthew@acme.com", "role": "Operations Support Lead", "department": "Operations"},
            {"worker_id": "#4586957", "full_name": "Elizabeth Lopez", "email": "elizabeth@acme.com", "role": "Brand & Visual Designer", "department": "Design"},
            {"worker_id": "#4586958", "full_name": "Joseph Hill", "email": "joseph@acme.com", "role": "Database Administrator", "department": "Infrastructure"},
            {"worker_id": "#4586959", "full_name": "Avery Scott", "email": "avery@acme.com", "role": "NOC Shift Supervisor", "department": "Network Operations"},
            {"worker_id": "#4586960", "full_name": "Samuel Green", "email": "samuel@acme.com", "role": "Platform Security Engineer", "department": "Security"},
            {"worker_id": "#4586961", "full_name": "Grace Adams", "email": "grace@acme.com", "role": "Finance & Billing Specialist", "department": "Finance"},
            {"worker_id": "#4586962", "full_name": "Andrew Baker", "email": "andrew@acme.com", "role": "Automation Engineer", "department": "Engineering"},
            {"worker_id": "#4586963", "full_name": "Chloe Nelson", "email": "chloe@acme.com", "role": "People Operations Specialist", "department": "HR & People"},
        ]

        for emp in SEED_EMPLOYEES:
            if not Employee.objects.filter(employee_code=emp['worker_id']).exists():
                Employee.objects.create(
                    tenant=tenant,
                    employee_code=emp['worker_id'],
                    full_name=emp['full_name'],
                    email=emp['email'],
                    designation=emp['role'],
                    department=emp['department'],
                    phone="+1 (555) 019-2834",
                    is_active=True
                )

    def get_queryset(self):
        self._ensure_initial_seeds()
        qs = Employee.objects.select_related('tenant').all().order_by('created_at')
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(full_name__icontains=search) |
                Q(email__icontains=search) |
                Q(employee_code__icontains=search) |
                Q(designation__icontains=search) |
                Q(department__icontains=search)
            )
        role = self.request.query_params.get('role')
        if role and role != 'All':
            qs = qs.filter(designation__icontains=role)
        status_param = self.request.query_params.get('status')
        if status_param == 'active':
            qs = qs.filter(is_active=True)
        elif status_param == 'inactive':
            qs = qs.filter(is_active=False)
        return qs

    def perform_create(self, serializer):
        tenant = Tenant.objects.first()
        if not tenant:
            tenant = Tenant.objects.create(name="Sheba Fi Broadband Network", slug="shebafi")

        worker_id = self.request.data.get('worker_id') or self.request.data.get('employee_code')
        if not worker_id:
            import random
            worker_id = f"#{random.randint(4580000, 4599999)}"

        role = self.request.data.get('role') or self.request.data.get('designation', 'Staff Member')
        serializer.save(
            tenant=tenant,
            employee_code=worker_id,
            designation=role,
            is_active=self.request.data.get('is_active', True)
        )

    def perform_update(self, serializer):
        kwargs = {}
        if 'worker_id' in self.request.data:
            kwargs['employee_code'] = self.request.data['worker_id']
        if 'role' in self.request.data:
            kwargs['designation'] = self.request.data['role']
        serializer.save(**kwargs)

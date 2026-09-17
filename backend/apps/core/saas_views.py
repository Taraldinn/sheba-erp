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
from django.db.models import Count, Sum
from django.utils import timezone
from django.conf import settings
from django.http import FileResponse, Http404
from django.core.exceptions import ValidationError
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.authtoken.models import Token

from .models import (
    Tenant, TenantDomain, CompanySetting, AuditLog,
    TenantOnboardingRequest, SaaSPackage, TenantSubscription, SaaSPayment, DatabaseBackup,
    TenantApiToken
)
from .permissions import IsCentralAdmin
from apps.authentication.models import StaffProfile, StaffMembership, UserRole

from apps.customers.models import Customer
from apps.network.models import POPBranch, Router, OLT, ONU
from apps.billing.models import Recharge, Package, Invoice
from apps.support.models import Ticket


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
            'primary_domain', 'domains_count', 'admin_username'
        ]
        read_only_fields = ('created_at', 'updated_at')

    def get_subscriber_count(self, obj):
        try:
            return Customer.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_active_subscribers_count(self, obj):
        try:
            return Customer.objects.filter(tenant=obj, status='Active').count()
        except Exception:
            return 0

    def get_expired_subscribers_count(self, obj):
        try:
            return Customer.objects.filter(tenant=obj, status='Expired').count()
        except Exception:
            return 0

    def get_router_count(self, obj):
        try:
            return Router.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_online_router_count(self, obj):
        try:
            return Router.objects.filter(tenant=obj, status='Online').count()
        except Exception:
            return 0

    def get_pop_count(self, obj):
        try:
            return POPBranch.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_active_pop_count(self, obj):
        try:
            return POPBranch.objects.filter(tenant=obj, status='Active').count()
        except Exception:
            return 0

    def get_olt_count(self, obj):
        try:
            return OLT.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_onu_count(self, obj):
        try:
            return ONU.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_staff_count(self, obj):
        try:
            return StaffProfile.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_package_count(self, obj):
        try:
            return Package.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_monthly_billing_volume(self, obj):
        try:
            res = Customer.objects.filter(tenant=obj).aggregate(total=Sum('monthly_bill'))
            return float(res['total'] or 0)
        except Exception:
            return 0.0

    def get_primary_domain(self, obj):
        try:
            primary = TenantDomain.objects.filter(tenant=obj, is_primary=True).first()
            return primary.hostname if primary else (obj.domain or f"{obj.slug}.shebafi.xyz")
        except Exception:
            return obj.domain or f"{obj.slug}.shebafi.xyz"

    def get_domains_count(self, obj):
        try:
            return TenantDomain.objects.filter(tenant=obj).count()
        except Exception:
            return 0

    def get_admin_username(self, obj):
        try:
            staff = StaffProfile.objects.filter(tenant=obj, role__in=[UserRole.ADMIN, UserRole.SUPER_ADMIN]).first()
            return staff.user.username if staff and staff.user else f"{obj.slug}_admin"
        except Exception:
            return f"{obj.slug}_admin"


class SaaSDomainSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)

    class Meta:
        model = TenantDomain
        fields = [
            'id', 'tenant', 'tenant_name', 'tenant_slug',
            'hostname', 'is_primary', 'is_active', 'verified',
            'domain_type', 'created_at', 'updated_at'
        ]
        read_only_fields = ('created_at', 'updated_at')


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
        total_tenants = Tenant.objects.count()
        active_tenants = Tenant.objects.filter(is_active=True).count()
        suspended_tenants = Tenant.objects.filter(is_active=False).count()
        pending_requests = TenantOnboardingRequest.objects.filter(status='pending').count()

        total_subscribers = Customer.objects.count()
        active_subscribers = Customer.objects.filter(status='Active').count()
        
        total_routers = Router.objects.count()
        online_routers = Router.objects.filter(status='Online').count()

        total_pops = POPBranch.objects.count()
        active_pops = POPBranch.objects.filter(status='Active').count()
        total_olts = OLT.objects.count()
        total_onus = ONU.objects.count()
        online_onus = ONU.objects.filter(status='Online').count()
        total_staff = StaffProfile.objects.count()

        total_packages = SaaSPackage.objects.count()
        active_packages = SaaSPackage.objects.filter(is_active=True).count()
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

        platform_mrr = sum(
            plan_pricing.get(t.plan, 15000) for t in Tenant.objects.filter(is_active=True)
        )

        return Response({
            'platform': {
                'name': 'ShebaFi SaaS Multi-Tenant Control Plane',
                'control_domain': 'admin.shebafi.xyz',
                'version': 'v2.4-ControlPlane',
                'environment': 'Production',
                'system_status': 'Healthy',
                'database_cluster': 'Online',
            },
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
        })


class SaaSTenantViewSet(viewsets.ModelViewSet):
    """
    Control Plane Tenant Management: Onboard new ISPs, modify quotas, activate/suspend, delete, and impersonate.
    """
    permission_classes = [permissions.IsAuthenticated, IsCentralAdmin]
    queryset = Tenant.objects.all().order_by('-created_at')
    serializer_class = SaaSTenantSerializer

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
        admin_email = tenant.contact_email

        user, created = User.objects.get_or_create(
            username=admin_username,
            defaults={'email': admin_email, 'is_staff': True}
        )
        user.set_password(admin_password)
        user.save()

        StaffProfile.objects.update_or_create(
            user=user,
            defaults={'tenant': tenant, 'role': UserRole.ADMIN, 'phone': tenant.contact_phone}
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

        serializer = self.get_serializer(tenant)
        return Response({
            'message': f'Tenant "{name}" successfully provisioned and onboarded.',
            'tenant': serializer.data,
            'admin_credentials': {
                'username': admin_username,
                'password': admin_password,
                'token': token.key,
                'dashboard_url': f"http://{domain}:3000/" if 'localhost' not in domain else f"http://{local_host}:3000/",
            }
        }, status=status.HTTP_201_CREATED)

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

    def destroy(self, request, *args, **kwargs):
        tenant = self.get_object()
        if tenant.slug in ['shebafi', 'master', 'default']:
            return Response({'error': f'The primary tenant "{tenant.slug}" cannot be deleted.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant_name = tenant.name
        tenant_id = str(tenant.id)

        AuditLog.objects.create(
            tenant=None,
            actor_username=request.user.username,
            action='delete_tenant',
            module='saas_control_plane',
            resource_type='Tenant',
            resource_id=tenant_id,
            details={'tenant_name': tenant_name, 'slug': tenant.slug}
        )

        tenant.delete()
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
        user, _ = User.objects.get_or_create(username=admin_username, defaults={'email': tenant.contact_email, 'is_staff': True})
        user.set_password(admin_pass)
        user.save()

        StaffProfile.objects.update_or_create(user=user, defaults={'tenant': tenant, 'role': UserRole.ADMIN, 'phone': tenant.contact_phone})
        token, _ = Token.objects.get_or_create(user=user)

        req_obj.status = 'approved'
        req_obj.admin_notes = f"Approved & provisioned tenant ID {tenant.id} by {request.user.username}"
        req_obj.save()

        return Response({
            'message': f'Request approved! Tenant "{tenant.name}" provisioned.',
            'tenant_id': str(tenant.id),
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

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        package = self.get_object()
        package.is_active = not package.is_active
        package.save()
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


@extend_schema_view(
    list=extend_schema(
        tags=['16. Multi-Tenant SaaS & Control Plane'],
        summary='List SaaS platform administrators and tenant master owners',
        responses={200: dict}
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
                return Response({'error': 'tenant_id is required when creating a Tenant Owner.'}, status=status.HTTP_400_BAD_REQUEST)
            tenant = get_tenant_by_id_or_slug(tenant_id)
            if not tenant:
                return Response({'error': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_superuser = (role == 'PLATFORM_ADMIN')
        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            is_staff=True,
            is_superuser=is_superuser
        )

        staff_role = UserRole.SUPER_ADMIN if is_superuser else UserRole.ADMIN
        StaffProfile.objects.create(
            user=user,
            tenant=tenant,
            role=staff_role,
            phone=phone,
            is_active=True
        )

        Token.objects.create(user=user)

        AuditLog.objects.create(
            tenant=tenant,
            actor_username=request.user.username,
            action='create_software_user',
            module='saas_user_management',
            resource_type='User',
            resource_id=str(user.id),
            details={'username': username, 'role': role, 'tenant': tenant.name if tenant else 'Global Control Plane'}
        )

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': 'Platform Super Admin' if is_superuser else 'Tenant Master Owner',
            'tenant_name': tenant.name if tenant else 'Global Control Plane',
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


        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_superuser': user.is_superuser,
                'role': 'PLATFORM_SUPER_ADMIN',
            },
            'message': 'Welcome to ShebaFi SaaS Multi-Tenant Global Control Plane.'
        })


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
    """Terminates session for the authenticated Central SaaS Administrator."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            if hasattr(request.user, 'auth_token'):
                request.user.auth_token.delete()
        except Exception:
            pass
        return Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)


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


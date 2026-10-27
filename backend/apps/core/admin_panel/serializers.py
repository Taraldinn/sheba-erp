"""
Admin-panel serializers — thin wrappers over existing models.
"""
from rest_framework import serializers

from apps.core.models import Tenant, TenantDomain


# ──── Domains ──────────────────────────────────────────────────────────────
class IspAdminDomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantDomain
        fields = [
            'id', 'hostname', 'domain_type', 'is_primary', 'is_active',
            'verified', 'verified_at', 'verification_method',
            'dns_challenge_token', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'verified', 'verified_at', 'dns_challenge_token',
            'created_at', 'updated_at',
        ]


# ──── Modules / Feature flags ──────────────────────────────────────────────
class IspAdminModuleCatalogSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    category = serializers.CharField()
    paid = serializers.BooleanField()
    enabled = serializers.BooleanField()
    is_override = serializers.BooleanField()
    config = serializers.JSONField()


class IspAdminModuleSubscribeSerializer(serializers.Serializer):
    feature_key = serializers.CharField(max_length=80)
    enabled = serializers.BooleanField(default=True)
    config = serializers.JSONField(required=False, default=dict)


# ──── Child tenants ────────────────────────────────────────────────────────
class IspAdminChildTenantListSerializer(serializers.ModelSerializer):
    domain_count = serializers.IntegerField(read_only=True)
    admin_username = serializers.SerializerMethodField()
    admin_email = serializers.SerializerMethodField()
    customer_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'is_active', 'subscription_status',
            'plan', 'max_subscribers', 'max_routers', 'created_at',
            'domain_count', 'customer_count',
            'admin_username', 'admin_email',
        ]
        read_only_fields = ['created_at']

    def _get_admin_staff(self, obj):
        # Imported here to avoid circular import at module load.
        from apps.authentication.models import StaffProfile, UserRole
        return (
            StaffProfile.objects
            .filter(tenant=obj, role__in=[UserRole.ADMIN, UserRole.SUPER_ADMIN])
            .select_related('user')
            .first()
        )

    def get_admin_username(self, obj):
        sp = self._get_admin_staff(obj)
        return sp.user.username if sp and sp.user else None

    def get_admin_email(self, obj):
        sp = self._get_admin_staff(obj)
        return sp.user.email if sp and sp.user else None


class IspAdminChildTenantCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    slug = serializers.SlugField(max_length=100)
    domain = serializers.CharField(
        required=False, allow_blank=True, max_length=255,
        help_text='Optional primary custom CNAME for the child tenant.',
    )
    admin_username = serializers.CharField(max_length=150)
    admin_password = serializers.CharField(min_length=8, write_only=True)
    admin_email = serializers.EmailField(required=False, allow_blank=True)
    admin_phone = serializers.CharField(
        required=False, allow_blank=True, max_length=30,
    )
    admin_first_name = serializers.CharField(
        required=False, allow_blank=True, max_length=150,
    )
    admin_last_name = serializers.CharField(
        required=False, allow_blank=True, max_length=150,
    )


class IspAdminChildTenantUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = [
            'name', 'is_active', 'notes', 'contact_email',
            'contact_phone', 'address',
            'max_subscribers', 'max_routers',
        ]


# ──── Child admin user ─────────────────────────────────────────────────────
class IspAdminChildAdminUserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    phone = serializers.CharField(
        required=False, allow_blank=True, max_length=30,
    )


class IspAdminChildAdminResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(min_length=8, write_only=True)


class IspAdminChildAdminChangeEmailSerializer(serializers.Serializer):
    new_email = serializers.EmailField()

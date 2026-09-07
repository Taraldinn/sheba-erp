from rest_framework import serializers
from django.contrib.auth.models import User
from .models import StaffProfile, StaffMembership, UserRole


class StaffMembershipSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source='role.name', read_only=True, default=None)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)

    class Meta:
        model = StaffMembership
        fields = [
            'id', 'tenant', 'tenant_name', 'tenant_slug',
            'role', 'role_name', 'scope', 'is_active', 'joined_at'
        ]


class StaffProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = StaffProfile
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'role_display', 'phone', 'national_id', 'address',
            'wallet_balance', 'credit_limit', 'commission_rate',
            'is_active', 'created_at'
        ]


class UserDetailSerializer(serializers.ModelSerializer):
    profile = StaffProfileSerializer(read_only=True)
    membership = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_staff', 'is_superuser', 'profile', 'membership']

    def get_membership(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return None
        membership = getattr(request, 'membership', None)
        if not membership:
            membership = StaffMembership.objects.filter(
                user=obj, tenant=tenant, is_active=True
            ).select_related('role', 'tenant').first()
        if membership:
            return StaffMembershipSerializer(membership).data
        return None


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


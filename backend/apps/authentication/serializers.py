from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from django.contrib.auth.models import User
from .models import StaffProfile, StaffMembership, UserRole, Role, Permission


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'codename', 'name', 'module']


class RoleSerializer(serializers.ModelSerializer):
    permissions_detail = PermissionSerializer(source='permissions', many=True, read_only=True)
    permission_ids = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.all(),
        many=True,
        write_only=True,
        required=False,
        source='permissions'
    )
    members_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            'id', 'tenant', 'name', 'description', 'is_active',
            'permissions', 'permissions_detail', 'permission_ids',
            'members_count', 'created_at'
        ]
        read_only_fields = ['id', 'tenant', 'permissions', 'created_at']

    @extend_schema_field(serializers.IntegerField())
    def get_members_count(self, obj):
        return obj.memberships.filter(is_active=True).count()


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
    username = serializers.CharField(required=False)
    password = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    scope = serializers.ChoiceField(
        choices=StaffMembership.Scope.choices, required=False, default=StaffMembership.Scope.TENANT
    )
    role_name = serializers.SerializerMethodField()
    # role_id is injected in to_representation() from the associated StaffMembership and
    # used in create/update to look up the Role object; it is not a StaffProfile model field.
    role_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = StaffProfile
        fields = [
            'id', 'username', 'password', 'email', 'first_name', 'last_name',
            'role', 'role_display', 'role_id', 'role_name', 'scope',
            'phone', 'national_id', 'address',
            'wallet_balance', 'credit_limit', 'commission_rate',
            'is_active', 'created_at'
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_role_name(self, obj):
        membership = getattr(obj.user, '_cached_membership', None)
        if not membership or membership.tenant_id != obj.tenant_id:
            membership = StaffMembership.objects.filter(user=obj.user, tenant=obj.tenant, is_active=True).select_related('role').first()
        if membership and membership.role:
            return membership.role.name
        return obj.get_role_display()

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if instance.user:
            ret['username'] = instance.user.username
            ret['email'] = instance.user.email
            ret['first_name'] = instance.user.first_name
            ret['last_name'] = instance.user.last_name
            membership = StaffMembership.objects.filter(user=instance.user, tenant=instance.tenant, is_active=True).first()
            if membership:
                ret['scope'] = membership.scope
                if membership.role:
                    ret['role_id'] = str(membership.role.id)
                    ret['role_name'] = membership.role.name
        return ret

    def create(self, validated_data):
        username = validated_data.pop('username', None)
        password = validated_data.pop('password', None)
        email = validated_data.pop('email', '')
        first_name = validated_data.pop('first_name', '')
        last_name = validated_data.pop('last_name', '')
        role_id = validated_data.pop('role_id', None)
        scope = validated_data.pop('scope', StaffMembership.Scope.TENANT)
        # tenant is injected by perform_create(serializer.save(tenant=...))
        tenant = validated_data.pop('tenant', None)

        if not username:
            raise serializers.ValidationError({'username': 'This field is required.'})
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError({'username': 'This username is already taken.'})
        user = User.objects.create(
            username=username, email=email,
            first_name=first_name, last_name=last_name,
        )
        if password:
            from django.contrib.auth.password_validation import validate_password
            validate_password(password, user)
            user.set_password(password)
            user.save()

        validated_data['user'] = user
        validated_data['tenant'] = tenant
        profile = super().create(validated_data)

        # Attach role & membership
        if tenant:
            role_obj = None
            if role_id:
                role_obj = Role.objects.filter(id=role_id, tenant=tenant).first()
            if not role_obj:
                role_obj = Role.objects.filter(name=profile.role, tenant=tenant).first()

            membership, created = StaffMembership.objects.get_or_create(
                user=user,
                tenant=tenant,
                defaults={'role': role_obj, 'scope': scope, 'is_active': profile.is_active}
            )
            if not created:
                membership.role = role_obj or membership.role
                membership.scope = scope or membership.scope
                membership.is_active = profile.is_active
                membership.save()

        return profile

    def update(self, instance, validated_data):
        if 'username' in validated_data:
            validated_data.pop('username')
            raise serializers.ValidationError({'username': 'Username cannot be changed.'})
        password = validated_data.pop('password', None)
        email = validated_data.pop('email', None)
        first_name = validated_data.pop('first_name', None)
        last_name = validated_data.pop('last_name', None)
        role_id = validated_data.pop('role_id', None)
        scope = validated_data.pop('scope', None)

        user = instance.user
        if user:
            user_updated = False
            if email is not None:
                user.email = email
                user_updated = True
            if first_name is not None:
                user.first_name = first_name
                user_updated = True
            if last_name is not None:
                user.last_name = last_name
                user_updated = True
            if password:
                from django.contrib.auth.password_validation import validate_password
                validate_password(password, user)
                user.set_password(password)
                user_updated = True
            if user_updated:
                user.save()

        profile = super().update(instance, validated_data)

        if instance.tenant and user:
            role_obj = None
            if role_id:
                role_obj = Role.objects.filter(id=role_id, tenant=instance.tenant).first()
            elif 'role' in validated_data:
                role_obj = Role.objects.filter(name=profile.role, tenant=instance.tenant).first()

            membership = StaffMembership.objects.filter(user=user, tenant=instance.tenant).first()
            if membership:
                if role_obj:
                    membership.role = role_obj
                if scope:
                    membership.scope = scope
                membership.is_active = profile.is_active
                membership.save()

        return profile


class UserDetailSerializer(serializers.ModelSerializer):
    profile = StaffProfileSerializer(read_only=True)
    membership = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_staff', 'is_superuser', 'profile', 'membership']

    @extend_schema_field(StaffMembershipSerializer)
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


from rest_framework import permissions
from apps.authentication.models import UserRole, StaffMembership


class IsTenantMember(permissions.BasePermission):
    """
    Ensures the authenticated user belongs strictly to the request's active tenant.
    Authoritative identity chain: Host -> Tenant -> User -> StaffMembership -> active.

    Rules:
    - Superusers bypass tenant checks.
    - If request is on the Central Control Plane (admin.shebafi.com, etc.), regular ISP users are denied.
    - If request is on an ISP domain, user must have an active StaffMembership in request.tenant.
    - An employee of ISP1 cannot access ISP2 resources even with valid credentials (403).
    - Inactive memberships are denied (403).
    - Suspended/inactive tenants are denied (403).
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        # Central control plane: ordinary ISP users are denied access
        if getattr(request, 'is_control_plane', False):
            if StaffMembership.objects.filter(user=request.user, is_active=True).exists():
                return False
            profile = getattr(request.user, 'profile', None)
            if profile and profile.tenant:
                return False
            return bool(profile and profile.role == UserRole.SUPER_ADMIN)

        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return False

        if not tenant.is_active:
            return False

        # Authoritative identity check: StaffMembership
        membership = StaffMembership.objects.filter(
            user=request.user,
            tenant=tenant
        ).select_related('role', 'tenant').first()

        if membership is not None:
            if not membership.is_active:
                return False
            request.membership = membership
            return True

        # Backward compatibility: Fallback sync for unmigrated legacy StaffProfile
        profile = getattr(request.user, 'profile', None)
        if profile and profile.tenant_id == tenant.id and profile.is_active:
            membership, _ = StaffMembership.objects.get_or_create(
                user=request.user,
                tenant=tenant,
                defaults={'is_active': True}
            )
            request.membership = membership
            return True

        return False

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True

        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return False

        obj_tenant_id = getattr(obj, 'tenant_id', None)
        if obj_tenant_id is not None:
            return obj_tenant_id == tenant.id

        return True


class IsCentralAdmin(permissions.BasePermission):
    """
    Restricts access to Central Platform Administrators on the Control Plane.
    ISP staff are completely blocked.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if StaffMembership.objects.filter(user=request.user, is_active=True).exists():
            return False
        profile = getattr(request.user, 'profile', None)
        if profile and profile.tenant:
            return False
        return bool(profile and profile.role == UserRole.SUPER_ADMIN)


from apps.core.authorization import can


class HasTenantPermission(permissions.BasePermission):
    """
    Evaluates fine-grained RBAC permissions against the central authorization service.
    Usage on ViewSet:
        permission_classes = [permissions.IsAuthenticated, IsTenantMember, HasTenantPermission]
        required_permission = 'customer.recharge'
    Or action-level:
        action_permissions = {'recharge': 'customer.recharge'}
    """
    def __init__(self, permission_codename=None):
        self.permission_codename = permission_codename

    def has_permission(self, request, view):
        if not IsTenantMember().has_permission(request, view):
            return False

        perm = self.permission_codename or getattr(view, 'required_permission', None)
        if not perm and hasattr(view, 'action_permissions'):
            perm = view.action_permissions.get(getattr(view, 'action', None))

        if not perm:
            return True

        return can(request.user, getattr(request, 'tenant', None), perm)

    def has_object_permission(self, request, view, obj):
        if not IsTenantMember().has_object_permission(request, view, obj):
            return False

        perm = self.permission_codename or getattr(view, 'required_permission', None)
        if not perm and hasattr(view, 'action_permissions'):
            perm = view.action_permissions.get(getattr(view, 'action', None))

        if not perm:
            return True

        return can(request.user, getattr(request, 'tenant', None), perm, resource=obj)


def requires_permission(permission_codename: str):
    """Factory creating a DRF Permission class checking the given capability."""
    class CustomTenantPermission(permissions.BasePermission):
        def has_permission(self, request, view):
            if not IsTenantMember().has_permission(request, view):
                return False
            return can(request.user, getattr(request, 'tenant', None), permission_codename)

        def has_object_permission(self, request, view, obj):
            if not IsTenantMember().has_object_permission(request, view, obj):
                return False
            return can(request.user, getattr(request, 'tenant', None), permission_codename, resource=obj)

    CustomTenantPermission.__name__ = f"RequiresPermission_{permission_codename.replace('.', '_')}"
    return CustomTenantPermission


class IsAdminOrManager(permissions.BasePermission):
    """
    Full administrative access within the tenant (Super Admin or Admin / Managing Director).
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if not IsTenantMember().has_permission(request, view):
            return False

        tenant = getattr(request, 'tenant', None)
        if can(request.user, tenant, 'staff.manage') or can(request.user, tenant, 'setting.manage'):
            return True

        membership = getattr(request, 'membership', None)
        if membership and membership.role:
            if membership.role.name in [UserRole.SUPER_ADMIN, UserRole.ADMIN, 'Admin', 'Super Admin', 'Admin / Managing Director']:
                return True

        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN])


class IsBillingStaff(permissions.BasePermission):
    """
    Access for Admins, Billing Operators, and Agents within the tenant.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if not IsTenantMember().has_permission(request, view):
            return False

        tenant = getattr(request, 'tenant', None)
        if (
            can(request.user, tenant, 'customer.recharge') or
            can(request.user, tenant, 'invoice.create') or
            can(request.user, tenant, 'invoice.view') or
            can(request.user, tenant, 'payment.view')
        ):
            return True

        membership = getattr(request, 'membership', None)
        if membership and membership.role:
            allowed_role_names = [
                UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING_OPERATOR,
                UserRole.BILLING, UserRole.AGENT, UserRole.RESELLER,
                'Admin', 'Super Admin', 'Billing Operator', 'Billing', 'Agent', 'Reseller'
            ]
            if membership.role.name in allowed_role_names:
                return True

        profile = getattr(request.user, 'profile', None)
        allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING_OPERATOR, UserRole.BILLING, UserRole.AGENT, UserRole.RESELLER]
        return bool(profile and profile.role in allowed_roles)


class IsTechnicalStaff(permissions.BasePermission):
    """
    Access for Admins, Support Staff, and Line Men within the tenant.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if not IsTenantMember().has_permission(request, view):
            return False

        tenant = getattr(request, 'tenant', None)
        if (
            can(request.user, tenant, 'router.view') or
            can(request.user, tenant, 'router.manage') or
            can(request.user, tenant, 'ticket.view') or
            can(request.user, tenant, 'ticket.manage') or
            can(request.user, tenant, 'task.view')
        ):
            return True

        membership = getattr(request, 'membership', None)
        if membership and membership.role:
            allowed_role_names = [
                UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPORT_STAFF,
                UserRole.TECHNICIAN, UserRole.LINE_MAN,
                'Admin', 'Super Admin', 'Support Staff', 'Technician', 'Line Man'
            ]
            if membership.role.name in allowed_role_names:
                return True

        profile = getattr(request.user, 'profile', None)
        allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPORT_STAFF, UserRole.TECHNICIAN, UserRole.LINE_MAN]
        return bool(profile and profile.role in allowed_roles)


class IsAdminUserOrReadOnly(permissions.BasePermission):
    """
    Authenticated staff can read; only Admins can create/update/delete.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if not IsTenantMember().has_permission(request, view):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_superuser:
            return True

        tenant = getattr(request, 'tenant', None)
        if can(request.user, tenant, 'setting.manage') or can(request.user, tenant, 'staff.manage'):
            return True

        membership = getattr(request, 'membership', None)
        if membership and membership.role:
            if membership.role.name in [UserRole.SUPER_ADMIN, UserRole.ADMIN, 'Admin', 'Super Admin']:
                return True

        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN])



from rest_framework import permissions
from apps.authentication.models import UserRole


class IsTenantMember(permissions.BasePermission):
    """
    Ensures the authenticated user belongs strictly to the request's active tenant.
    
    Rules:
    - Superusers bypass tenant checks.
    - If request is on the Central Control Plane (admin.shebafi.com), regular ISP users are denied.
    - If request is on an ISP domain, user's profile.tenant must match request.tenant.
    - An employee of ISP1 cannot access ISP2 resources even with valid credentials (403).
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        # Central control plane: ordinary ISP users are denied access
        if getattr(request, 'is_control_plane', False):
            profile = getattr(request.user, 'profile', None)
            if profile and profile.tenant:
                return False
            return bool(profile and profile.role == UserRole.SUPER_ADMIN)

        tenant = getattr(request, 'tenant', None)
        profile = getattr(request.user, 'profile', None)

        if not tenant:
            return False

        if profile and profile.tenant:
            return profile.tenant_id == tenant.id

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
        profile = getattr(request.user, 'profile', None)
        if profile and profile.tenant:
            return False
        return bool(profile and profile.role == UserRole.SUPER_ADMIN)


class IsAdminOrManager(permissions.BasePermission):
    """
    Full administrative access within the tenant (Super Admin or Admin / Managing Director).
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
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
        profile = getattr(request.user, 'profile', None)
        allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING_OPERATOR, UserRole.AGENT, UserRole.RESELLER]
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
        profile = getattr(request.user, 'profile', None)
        allowed_roles = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPORT_STAFF, UserRole.LINE_MAN]
        return bool(profile and profile.role in allowed_roles)


class IsAdminUserOrReadOnly(permissions.BasePermission):
    """
    Authenticated staff can read; only Admins can create/update/delete.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN])

from rest_framework import permissions
from apps.authentication.models import UserRole


class IsTenantMember(permissions.BasePermission):
    """
    Ensures the authenticated user belongs to the active tenant.
    Superusers bypass this check.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True

        tenant = getattr(request, 'tenant', None)
        profile = getattr(request.user, 'profile', None)

        # If user has a profile with a tenant, it must match request.tenant
        if profile and profile.tenant:
            if tenant and profile.tenant_id != tenant.id:
                return False
            # If request.tenant was not set, bind user's tenant
            if not tenant:
                request.tenant = profile.tenant

        return True


class IsAdminOrManager(permissions.BasePermission):
    """
    Full administrative access (Super Admin or Admin / Managing Director).
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
    Access for Admins, Billing Operators, and Agents.
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
    Access for Admins, Support Staff, and Line Men.
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

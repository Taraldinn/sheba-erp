"""
Network-specific RBAC permissions.
"""
from rest_framework import permissions
from apps.authentication.models import UserRole
from apps.core.permissions import IsTenantMember


class CanManageRouters(permissions.BasePermission):
    """
    Permission to add, update, delete or reconfigure routers.
    Restricted to Super Admin and Tenant Admin.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN])


class CanViewNetworkMetrics(permissions.BasePermission):
    """
    Permission to view network devices, metrics, and live traffic.
    Allows Admins, Managers, Support Staff, and Line Men.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        allowed = [
            UserRole.SUPER_ADMIN,
            UserRole.ADMIN,
            UserRole.SUPPORT_STAFF,
            UserRole.LINE_MAN,
            UserRole.BILLING_OPERATOR,
        ]
        return bool(profile and profile.role in allowed)


class CanControlDevices(permissions.BasePermission):
    """
    Permission to trigger operational actions: test-connection, reboot, sync.
    Restricted to Admins and Technical Staff.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        allowed = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPORT_STAFF, UserRole.LINE_MAN]
        return bool(profile and profile.role in allowed)


class CanViewAdvancedHealth(permissions.BasePermission):
    """
    Phase 21: Strict admin gate for the Advanced Health + diagnostics
    endpoints. The plan reserves these screens for Super Admin +
    Tenant Admin only because they expose live router internals
    (ARP, neighbors, log tail, on-demand ping).
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        allowed = [
            UserRole.SUPER_ADMIN,
            UserRole.ADMIN,
        ]
        return bool(profile and profile.role in allowed)

class CanExportNetworkArchive(permissions.BasePermission):
    """
    Permission for the datewise archive query + export endpoints.

    Restricted to Super Admin and Tenant Admin only — these endpoints
    can carry sensitive per-customer session metadata and complete
    RouterOS diagnostics.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        allowed = [
            UserRole.SUPER_ADMIN,
            UserRole.ADMIN,
        ]
        return bool(profile and profile.role in allowed)

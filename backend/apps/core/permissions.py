"""
apps/core/permissions.py — DRF permission classes for the Sheba ISP ERP.

Authorization chain (single authoritative source):
    Host → Tenant → User → StaffMembership (active) → Role → Permission

StaffProfile is a legacy user-profile model and MUST NOT be used for
authorization decisions in this file. All role/capability checks go
exclusively through StaffMembership + the `can()` helper.
"""

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
            # Only superusers may reach the control plane; all StaffMembership holders are denied.
            if StaffMembership.objects.filter(user=request.user, is_active=True).exists():
                return False
            return False  # non-superuser, non-staff: also deny (require explicit superuser)

        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return False

        if not tenant.is_active:
            return False

        # Authoritative identity check: StaffMembership only.
        membership = StaffMembership.objects.filter(
            user=request.user,
            tenant=tenant
        ).select_related('role', 'tenant').first()

        if membership is not None:
            if not membership.is_active:
                return False
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
        # Any tenant-scoped membership holder is denied control-plane access.
        if StaffMembership.objects.filter(user=request.user, is_active=True).exists():
            return False
        return False  # non-superuser always denied


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

    Authorization source: StaffMembership.role exclusively.
    StaffProfile.role is NOT consulted — it is a legacy user profile, not an auth record.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if not IsTenantMember().has_permission(request, view):
            return False

        tenant = getattr(request, 'tenant', None)
        # Preferred path: capability check via RBAC
        if can(request.user, tenant, 'staff.manage') or can(request.user, tenant, 'setting.manage'):
            return True

        # Fallback: role name check via StaffMembership only
        membership = getattr(request, 'membership', None)
        if membership and membership.role:
            if membership.role.name in [
                UserRole.SUPER_ADMIN, UserRole.ADMIN,
                'Admin', 'Super Admin', 'Admin / Managing Director'
            ]:
                return True

        return False  # Never fall through to StaffProfile


class IsBillingStaff(permissions.BasePermission):
    """
    Access for Admins, Billing Operators, and Agents within the tenant.

    Authorization source: StaffMembership.role exclusively.
    StaffProfile.role is NOT consulted.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if not IsTenantMember().has_permission(request, view):
            return False

        tenant = getattr(request, 'tenant', None)
        # Preferred path: capability check via RBAC
        if (
            can(request.user, tenant, 'customer.recharge') or
            can(request.user, tenant, 'invoice.create') or
            can(request.user, tenant, 'invoice.view') or
            can(request.user, tenant, 'payment.view')
        ):
            return True

        # Fallback: role name check via StaffMembership only
        membership = getattr(request, 'membership', None)
        if membership and membership.role:
            allowed_role_names = [
                UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BILLING_OPERATOR,
                UserRole.BILLING, UserRole.AGENT, UserRole.RESELLER,
                'Admin', 'Super Admin', 'Billing Operator', 'Billing', 'Agent', 'Reseller'
            ]
            if membership.role.name in allowed_role_names:
                return True

        return False  # Never fall through to StaffProfile


class IsTechnicalStaff(permissions.BasePermission):
    """
    Access for Admins, Support Staff, and Line Men within the tenant.

    Authorization source: StaffMembership.role exclusively.
    StaffProfile.role is NOT consulted.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if not IsTenantMember().has_permission(request, view):
            return False

        tenant = getattr(request, 'tenant', None)
        # Preferred path: capability check via RBAC
        if (
            can(request.user, tenant, 'router.view') or
            can(request.user, tenant, 'router.manage') or
            can(request.user, tenant, 'ticket.view') or
            can(request.user, tenant, 'ticket.manage') or
            can(request.user, tenant, 'task.view')
        ):
            return True

        # Fallback: role name check via StaffMembership only
        membership = getattr(request, 'membership', None)
        if membership and membership.role:
            allowed_role_names = [
                UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPORT_STAFF,
                UserRole.TECHNICIAN, UserRole.LINE_MAN,
                'Admin', 'Super Admin', 'Support Staff', 'Technician', 'Line Man'
            ]
            if membership.role.name in allowed_role_names:
                return True

        return False  # Never fall through to StaffProfile


class IsAdminUserOrReadOnly(permissions.BasePermission):
    """
    Authenticated staff can read; only Admins can create/update/delete.

    Authorization source: StaffMembership.role exclusively.
    StaffProfile.role is NOT consulted.
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
        # Preferred path: capability check via RBAC
        if can(request.user, tenant, 'setting.manage') or can(request.user, tenant, 'staff.manage'):
            return True

        # Fallback: role name check via StaffMembership only
        membership = getattr(request, 'membership', None)
        if membership and membership.role:
            if membership.role.name in [UserRole.SUPER_ADMIN, UserRole.ADMIN, 'Admin', 'Super Admin']:
                return True

        return False  # Never fall through to StaffProfile

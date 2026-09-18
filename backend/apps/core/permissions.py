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

        # API Key machine caller verification
        if getattr(request, 'auth_type', None) == 'api_key':
            token = getattr(request, 'api_token', None)
            tenant = getattr(request, 'tenant', None)
            if token and tenant and token.tenant_id == tenant.id and token.effective_status == 'ACTIVE' and tenant.is_active:
                return True
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

        if getattr(request, 'auth_type', None) == 'api_key':
            token = getattr(request, 'api_token', None)
            if not token or token.tenant_id != tenant.id or token.effective_status != 'ACTIVE':
                return False

        obj_tenant_id = getattr(obj, 'tenant_id', None)
        if obj_tenant_id is not None:
            return obj_tenant_id == tenant.id

        return True


class IsCentralAdmin(permissions.BasePermission):
    """
    Restricts access to Central Platform Administrators on the Control Plane.
    ISP staff and API Key clients are completely blocked.
    """
    def has_permission(self, request, view):
        # API Keys are strictly forbidden from accessing SaaS Control Plane endpoints
        if getattr(request, 'auth_type', None) == 'api_key':
            return False
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        # Any tenant-scoped membership holder is denied control-plane access.
        if StaffMembership.objects.filter(user=request.user, is_active=True).exists():
            return False
        return False  # non-superuser always denied


class HasApiKeyScope(permissions.BasePermission):
    """
    Evaluates required permission scopes for machine API clients.
    Standard scopes:
        customers:read, customers:write
        billing:read, billing:write
        invoices:read, invoices:write
        payments:read, payments:write
        network:read, network:write
        mikrotik:read, mikrotik:write
        olt:read, olt:write
        reports:read
        settings:read, settings:write
        * (all scopes)
    """
    message = "API key lacks the required permission scope for this operation."

    MODULE_MAP = {
        'customer': 'customers',
        'customers': 'customers',
        'package': 'billing',
        'packages': 'billing',
        'offer': 'billing',
        'offers': 'billing',
        'invoice': 'invoices',
        'invoices': 'invoices',
        'invoice-line': 'invoices',
        'recharge': 'billing',
        'recharges': 'billing',
        'billing-account': 'billing',
        'billing-accounts': 'billing',
        'ledger-entry': 'billing',
        'ledger-entries': 'billing',
        'payment-gateway': 'payments',
        'payment-gateways': 'payments',
        'gateways': 'payments',
        'transaction': 'payments',
        'transactions': 'payments',
        'payment-transaction': 'payments',
        'payments': 'payments',
        'inbound-payment-event': 'payments',
        'payment-event': 'payments',
        'router': 'network',
        'routers': 'network',
        'olt': 'olt',
        'olts': 'olt',
        'onu': 'network',
        'onus': 'network',
        'branch': 'network',
        'branches': 'network',
        'setting': 'settings',
        'settings': 'settings',
        'voice-setting': 'settings',
        'voice-template': 'settings',
        'report': 'reports',
        'reports': 'reports',
        'ticket': 'support',
        'tickets': 'support',
        'task': 'tasks',
        'tasks': 'tasks',
        'employee': 'hr',
        'employees': 'hr',
        'attendance': 'hr',
        'leave': 'hr',
        'leaves': 'hr',
        'advance-salary': 'hr',
        'advance-salaries': 'hr',
        'payroll': 'hr',
        'payrolls': 'hr',
        'store-item': 'store',
        'store-items': 'store',
        'stock-transaction': 'store',
        'stock-transactions': 'store',
        'corporate': 'corporate',
        'corporate-customer': 'corporate',
        'corporate-customers': 'corporate',
        'corporate-connection': 'corporate',
        'corporate-connections': 'corporate',
        'corporate-ip-pool': 'corporate',
        'corporate-ip-pools': 'corporate',
        'corporate-ip-address': 'corporate',
        'corporate-ip-addresses': 'corporate',
        'corporate-vlan': 'corporate',
        'corporate-vlans': 'corporate',
        'corporate-telemetry': 'corporate',
        'corporate-traffic-sample': 'corporate',
        'corporate-traffic-samples': 'corporate',
        'corporate-billing-period': 'corporate',
        'corporate-billing-periods': 'corporate',
    }

    def has_permission(self, request, view):
        if getattr(request, 'auth_type', None) != 'api_key':
            return True

        api_scopes = getattr(request, 'api_scopes', set())
        if '*' in api_scopes:
            return True

        # Derive module from view basename or app_label
        basename = getattr(view, 'basename', '')
        module = self.MODULE_MAP.get(basename)
        if not module and hasattr(view, 'queryset') and view.queryset is not None:
            module = getattr(view.queryset.model._meta, 'app_label', '')

        if not module:
            path_parts = [p for p in request.path.strip('/').split('/') if p not in ('api', 'v1')]
            if path_parts:
                module = self.MODULE_MAP.get(path_parts[0], path_parts[0])

        is_read_only = request.method in permissions.SAFE_METHODS
        action_type = 'read' if is_read_only else 'write'

        needed_scope = f"{module}:{action_type}"
        write_fallback_for_read = f"{module}:write" if is_read_only else None

        if needed_scope in api_scopes or (write_fallback_for_read and write_fallback_for_read in api_scopes):
            return True

        # Also support legacy dot notation (e.g. 'customers.view')
        legacy_read = f"{module}.view" if is_read_only else f"{module}.manage"
        if legacy_read in api_scopes:
            return True

        self.message = f"API key lacks required permission scope: {needed_scope}"
        return False

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


from apps.core.authorization import can


class HasTenantPermission(permissions.BasePermission):
    """
    Evaluates fine-grained RBAC permissions against the central authorization service
    for staff users, and evaluates API scopes for machine API clients.
    """
    def __init__(self, permission_codename=None):
        self.permission_codename = permission_codename

    def has_permission(self, request, view):
        if not IsTenantMember().has_permission(request, view):
            return False

        # If authenticated via API Key, evaluate API scopes
        if getattr(request, 'auth_type', None) == 'api_key':
            scope_perm = HasApiKeyScope()
            allowed = scope_perm.has_permission(request, view)
            if not allowed:
                self.message = scope_perm.message
            return allowed

        perm = self.permission_codename or getattr(view, 'required_permission', None)
        if not perm and hasattr(view, 'action_permissions'):
            perm = view.action_permissions.get(getattr(view, 'action', None))

        if not perm:
            return True

        return can(request.user, getattr(request, 'tenant', None), perm)

    def has_object_permission(self, request, view, obj):
        if not IsTenantMember().has_object_permission(request, view, obj):
            return False

        if getattr(request, 'auth_type', None) == 'api_key':
            return HasApiKeyScope().has_object_permission(request, view, obj)

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

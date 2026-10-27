"""
Central Authorization Service (Stage 3).
=========================================
Authoritative authorization evaluation:
  User -> StaffMembership -> Role -> Permission -> Scope

Usage:
  from apps.core.authorization import can

  if not can(request.user, request.tenant, 'customer.recharge', customer):
      raise PermissionDenied("Insufficient permissions.")
"""

from apps.authentication.models import StaffMembership, UserRole


def can(user, tenant, permission_codename: str, resource=None) -> bool:
    """
    Evaluates whether user has the given permission within tenant,
    optionally checking scope on the specific resource.

    Args:
        user: Django User instance or ApiKeyPrincipal
        tenant: Tenant instance
        permission_codename: Capability string (e.g. 'customer.recharge')
        resource: Optional model instance for object-level / scope verification

    Returns:
        bool: True if authorized, False otherwise.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False

    # Superusers bypass checks
    if getattr(user, 'is_superuser', False):
        return True

    if not tenant or not tenant.is_active:
        return False

    # API Key Principal evaluation
    if hasattr(user, 'api_token'):
        api_token = getattr(user, 'api_token', None)
        if not api_token or api_token.tenant_id != tenant.id:
            return False
        if api_token.effective_status != 'ACTIVE':
            return False
        perms = getattr(user, 'permissions', [])
        if not perms or '*' in perms or '__all__' in perms or 'all' in perms:
            return True
        if permission_codename in perms:
            return True
        module = permission_codename.split('.')[0] if '.' in permission_codename else permission_codename
        if f"{module}:*" in perms or f"{module}s:*" in perms or f"{module}:read" in perms or f"{module}:write" in perms:
            return True
        if hasattr(user, 'has_perm') and user.has_perm(permission_codename):
            return True
        return False

    # Retrieve authoritative active membership
    membership = getattr(user, '_cached_membership', None)
    if not membership or membership.tenant_id != tenant.id:
        membership = StaffMembership.get_active_membership(user, tenant)
        if membership:
            user._cached_membership = membership

    if not membership or not membership.is_active:
        # Backward compatibility for legacy StaffProfile
        profile = getattr(user, 'profile', None)
        if profile and profile.tenant_id == tenant.id and profile.is_active:
            if profile.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN]:
                return True
        return False

    # Check Role
    role = membership.role
    if not role or not role.is_active:
        profile = getattr(user, 'profile', None)
        if profile and profile.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN]:
            return True

        return False

    # Full tenant admin roles bypass individual capability checks
    admin_roles = ['Super Admin', 'SUPER_ADMIN', 'Admin', 'ADMIN', 'Admin / Managing Director']
    if role.name in admin_roles:
        role_has_perm = True
    else:
        role_has_perm = role.has_permission(permission_codename)

    if not role_has_perm:
        return False

    # Scope validation on specific resource if provided
    if resource is not None:
        # Cross-tenant resource block
        resource_tenant_id = getattr(resource, 'tenant_id', None)
        if resource_tenant_id and resource_tenant_id != tenant.id:
            return False

        scope = membership.scope
        if scope in [StaffMembership.Scope.GLOBAL, StaffMembership.Scope.TENANT]:
            return True

        if scope == StaffMembership.Scope.POP:
            user_pop = getattr(membership, 'pop_id', None) or getattr(getattr(user, 'profile', None), 'pop_id', None)
            res_pop = getattr(resource, 'pop_id', None) or getattr(resource, 'pop_branch_id', None)
            return user_pop is not None and res_pop is not None and user_pop == res_pop

        if scope == StaffMembership.Scope.AREA:
            user_area = getattr(membership, 'area_id', None) or getattr(getattr(user, 'profile', None), 'area_id', None)
            res_area = getattr(resource, 'area_id', None) or getattr(resource, 'zone_id', None)
            return user_area is not None and res_area is not None and user_area == res_area

        if scope == StaffMembership.Scope.ASSIGNED:
            if hasattr(resource, 'assigned_to_id'):
                return resource.assigned_to_id == user.id
            if hasattr(resource, 'assigned_to'):
                return resource.assigned_to == user
            return True

        if scope == StaffMembership.Scope.SELF:
            if hasattr(resource, 'assigned_to_id') and resource.assigned_to_id is not None:
                return resource.assigned_to_id == user.id
            if hasattr(resource, 'user_id') and resource.user_id is not None:
                return resource.user_id == user.id
            if hasattr(resource, 'reseller_id') and resource.reseller_id is not None:
                profile = getattr(user, 'profile', None)
                if profile:
                    return resource.reseller_id == profile.id
            return True

    return True

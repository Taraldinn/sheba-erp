from rest_framework import permissions
from apps.core.permissions import IsTenantMember, HasApiKeyScope
from apps.core.authorization import can


class HasCorporatePermission(permissions.BasePermission):
    """
    Fine-grained RBAC permission class for Corporate / Enterprise views.
    Evaluates:
      1. IsTenantMember (host-derived tenant check, active membership)
      2. For API Keys: HasApiKeyScope with module 'corporate'
      3. For Staff Users: can(user, tenant, required_capability)
    """

    def has_permission(self, request, view):
        if not IsTenantMember().has_permission(request, view):
            return False

        if getattr(request, 'auth_type', None) == 'api_key':
            scope_perm = HasApiKeyScope()
            allowed = scope_perm.has_permission(request, view)
            if not allowed:
                self.message = scope_perm.message
            return allowed

        # Determine required permission from view (action_permissions first for ViewSets)
        perm = None
        if hasattr(view, 'action_permissions') and getattr(view, 'action', None):
            perm = view.action_permissions.get(view.action)

        if not perm:
            perm = getattr(view, 'required_permission', None)

        if not perm:
            # Fallback based on HTTP method
            if request.method in permissions.SAFE_METHODS:
                perm = 'corporate.view'
            else:
                perm = 'corporate.update'

        return can(request.user, getattr(request, 'tenant', None), perm)

    def has_object_permission(self, request, view, obj):
        if not IsTenantMember().has_object_permission(request, view, obj):
            return False

        if getattr(request, 'auth_type', None) == 'api_key':
            return HasApiKeyScope().has_object_permission(request, view, obj)

        perm = None
        if hasattr(view, 'action_permissions') and getattr(view, 'action', None):
            perm = view.action_permissions.get(view.action)

        if not perm:
            perm = getattr(view, 'required_permission', None)

        if not perm:
            if request.method in permissions.SAFE_METHODS:
                perm = 'corporate.view'
            else:
                perm = 'corporate.update'

        return can(request.user, getattr(request, 'tenant', None), perm, resource=obj)

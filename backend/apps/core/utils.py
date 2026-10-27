from django.db.models import QuerySet


def get_tenant_for_request(request):
    """
    Returns the authoritative tenant resolved by Domain-Based TenantResolutionMiddleware.
    Client-provided headers/parameters cannot override this on public domains.
    """
    if not request:
        return None
    return getattr(request, 'tenant', None)


def get_scoped_queryset(request, queryset_or_model):
    """
    Scopes a model queryset strictly to request.tenant, and further filters
    by membership scope (GLOBAL, TENANT, ASSIGNED, SELF, etc.).
    Central control plane superusers can query across tenants.
    All other requests are filtered by request.tenant or return qs.none().
    """
    if isinstance(queryset_or_model, QuerySet):
        qs = queryset_or_model
        model = qs.model
    else:
        model = queryset_or_model
        qs = model.objects.all()

    # Central control plane superuser access
    if getattr(request, 'is_control_plane', False):
        user = getattr(request, 'user', None)
        if user and user.is_superuser:
            return qs

    tenant = getattr(request, 'tenant', None)
    if not tenant:
        return qs.none()

    qs = qs.filter(tenant=tenant)

    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated or user.is_superuser:
        return qs

    # API Key Principal has tenant-level scope for its granted permissions
    if getattr(request, 'auth_type', None) == 'api_key' or hasattr(user, 'api_token'):
        return qs

    # Retrieve membership scope
    from apps.authentication.models import StaffMembership
    membership = getattr(request, 'membership', None)
    if not membership or membership.tenant_id != tenant.id:
        membership = getattr(user, '_cached_membership', None)
        if not membership or membership.tenant_id != tenant.id:
            membership = StaffMembership.get_active_membership(user, tenant)
            if membership:
                user._cached_membership = membership

    if not membership:
        return qs

    scope = membership.scope
    if scope in [StaffMembership.Scope.GLOBAL, StaffMembership.Scope.TENANT]:
        return qs

    field_names = {f.name for f in model._meta.fields}

    if scope == StaffMembership.Scope.ASSIGNED:
        if 'assigned_to' in field_names:
            qs = qs.filter(assigned_to=user)
        else:
            qs = qs.none()
    elif scope == StaffMembership.Scope.SELF:
        if 'reseller' in field_names:
            reseller_profile = getattr(user, 'reseller_profile', None)
            if reseller_profile:
                qs = qs.filter(reseller=reseller_profile)
            else:
                qs = qs.none()
        elif 'assigned_to' in field_names:
            qs = qs.filter(assigned_to=user)
        elif 'user' in field_names:
            qs = qs.filter(user=user)
        else:
            qs = qs.none()

    return qs

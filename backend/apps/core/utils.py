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
    Scopes a model queryset strictly to request.tenant.
    Central control plane superusers can query across tenants.
    All other requests are filtered by request.tenant or return qs.none().
    """
    if isinstance(queryset_or_model, QuerySet):
        qs = queryset_or_model
    else:
        qs = queryset_or_model.objects.all()

    # Central control plane superuser access
    if getattr(request, 'is_control_plane', False):
        user = getattr(request, 'user', None)
        if user and user.is_superuser:
            return qs

    tenant = getattr(request, 'tenant', None)
    if tenant:
        return qs.filter(tenant=tenant)

    # Superuser on localhost/testserver without tenant bound
    user = getattr(request, 'user', None)
    if user and user.is_superuser:
        raw_host = request.get_host().split(':')[0].lower() if hasattr(request, 'get_host') else ''
        if raw_host in ('localhost', '127.0.0.1', 'testserver'):
            return qs

    return qs.none()

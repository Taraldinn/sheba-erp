from django.db.models import QuerySet


def get_tenant_for_request(request):
    """
    Safely resolves the authoritative tenant for a given request.
    If the user is authenticated with a profile tenant, that takes precedence over headers to prevent IDOR.
    Superusers can query across tenants or specify a target tenant via header/parameter.
    """
    if not request:
        return None

    user = getattr(request, 'user', None)
    profile = getattr(user, 'profile', None) if user and user.is_authenticated else None

    # For non-superuser staff, their assigned tenant is authoritative
    if profile and profile.tenant and not user.is_superuser:
        return profile.tenant

    # For superusers or public endpoints, use request.tenant resolved by middleware
    return getattr(request, 'tenant', None)


def get_scoped_queryset(request, queryset_or_model):
    """
    Scopes a model queryset to the authoritative tenant.
    """
    if isinstance(queryset_or_model, QuerySet):
        qs = queryset_or_model
    else:
        qs = queryset_or_model.objects.all()

    tenant = get_tenant_for_request(request)
    if tenant:
        return qs.filter(tenant=tenant)

    user = getattr(request, 'user', None)
    if user and user.is_superuser:
        return qs

    return qs.none()

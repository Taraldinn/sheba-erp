from django.utils.deprecation import MiddlewareMixin
from .models import Tenant


class TenantResolutionMiddleware(MiddlewareMixin):
    """
    Resolves active tenant based on:
    1. HTTP header 'X-Tenant-ID' or 'X-Tenant-Key' (slug or UUID)
    2. Subdomain from HTTP_HOST
    3. Fallback to default/main tenant
    """
    def process_request(self, request):
        tenant_identifier = request.headers.get('X-Tenant-ID') or request.headers.get('X-Tenant-Key')
        tenant = None

        if tenant_identifier:
            tenant = Tenant.objects.filter(slug=tenant_identifier).first() or \
                     Tenant.objects.filter(id=tenant_identifier).first()

        if not tenant:
            host = request.get_host().split(':')[0]
            parts = host.split('.')
            if len(parts) > 2 and parts[0] not in ['www', 'api', 'admin', 'localhost', '127']:
                subdomain = parts[0]
                tenant = Tenant.objects.filter(slug=subdomain).first()

        if not tenant:
            # Fallback to the first active tenant or create a default 'main' tenant on demand
            tenant = Tenant.objects.filter(is_active=True).first()

        request.tenant = tenant

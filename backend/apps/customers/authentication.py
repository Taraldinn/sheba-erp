"""
DRF Authentication backend for ShebaFi ISP Customer Portal.
Validates signed JWT tokens and injects request.customer.
"""

from rest_framework import authentication, exceptions
from apps.customers.models import Customer
from apps.customers.jwt import decode_customer_jwt


class CustomerPrincipal:
    """
    Lightweight auth principal wrapper around Customer to satisfy DRF's request.user contract.
    """
    def __init__(self, customer: Customer):
        self.customer = customer
        self.id = customer.id
        self.username = customer.pppoe_username
        self.is_authenticated = True
        self.is_staff = False
        self.is_superuser = False
        self.is_active = True

    def __getattr__(self, name):
        return getattr(self.customer, name)

    def __str__(self):
        return f"CustomerPrincipal({self.customer.pppoe_username})"


class CustomerJWTAuthentication(authentication.BaseAuthentication):
    """
    Authenticates customer requests via signed JWT.
    Header format:
        Authorization: Bearer <token>
        Authorization: Token <token>
    """
    keyword = 'Bearer'

    def authenticate(self, request):
        auth_header = authentication.get_authorization_header(request).split()

        if not auth_header:
            return None

        prefix = auth_header[0].decode('utf-8').lower()
        if prefix not in ('bearer', 'token'):
            return None

        if len(auth_header) == 1:
            raise exceptions.AuthenticationFailed('Invalid token header. No credentials provided.')
        elif len(auth_header) > 2:
            raise exceptions.AuthenticationFailed('Invalid token header. Token string should not contain spaces.')

        token = auth_header[1].decode('utf-8')
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            raise exceptions.AuthenticationFailed('Tenant context missing from request.')

        claims = decode_customer_jwt(token, tenant_id=tenant.id)
        if not claims:
            raise exceptions.AuthenticationFailed('Invalid or expired customer token for this tenant.')

        customer_id = claims.get('customer_id')
        customer = Customer.objects.filter(id=customer_id, tenant=tenant).first()
        if not customer:
            raise exceptions.AuthenticationFailed('Customer account not found.')

        principal = CustomerPrincipal(customer)
        request.customer = customer
        return (principal, token)

    def authenticate_header(self, request):
        return 'Bearer realm="customer_portal"'


try:
    from drf_spectacular.extensions import OpenApiAuthenticationExtension

    class CustomerJWTScheme(OpenApiAuthenticationExtension):
        target_class = 'apps.customers.authentication.CustomerJWTAuthentication'
        name = 'customerJwtAuth'

        def get_security_definition(self, auto_schema):
            return {
                'type': 'http',
                'scheme': 'bearer',
                'bearerFormat': 'JWT',
                'description': 'Customer Portal signed JWT access token (`Bearer <token>`)',
            }
except ImportError:
    pass

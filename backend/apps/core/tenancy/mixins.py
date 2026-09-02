"""
Reusable ViewSet and Serializer mixins for tenant-aware operations (Plan Phase 5).

TenantScopedViewSetMixin:
  - get_queryset() scopes to request.tenant, raises 403 if tenant missing
  - perform_create() forces tenant=request.tenant, discards any client-supplied tenant
  - get_object() validates tenant on the retrieved object

TenantScopedSerializerMixin:
  - Automatically marks 'tenant' as read-only
  - Injects request.tenant on create
"""
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from .exceptions import TenantContextMissing


class TenantScopedViewSetMixin:
    """
    Mixin for DRF ViewSets that enforces tenant scoping.

    Override `tenant_field` if the model uses a field name other than 'tenant'.

    Usage:
        class CustomerViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
            queryset = Customer.objects.all()
            serializer_class = CustomerSerializer
    """

    tenant_field = 'tenant'

    def _get_tenant(self):
        """Returns request.tenant, raising PermissionDenied if None (not control plane)."""
        tenant = getattr(self.request, 'tenant', None)
        if tenant is None and not getattr(self.request, 'is_control_plane', False):
            raise PermissionDenied(
                detail='No tenant context resolved for this request. '
                       'Ensure you are accessing via a valid ISP domain.',
                code='TENANT_CONTEXT_MISSING'
            )
        return tenant

    def get_queryset(self):
        """Auto-scopes the base queryset to request.tenant."""
        qs = super().get_queryset()
        tenant = self._get_tenant()
        if tenant is not None:
            qs = qs.filter(**{self.tenant_field: tenant})
        return qs

    def perform_create(self, serializer):
        """Forces tenant=request.tenant on every create. Ignores any client-supplied tenant."""
        tenant = self._get_tenant()
        serializer.save(**{self.tenant_field: tenant})

    def perform_update(self, serializer):
        """Saves update without allowing tenant reassignment."""
        serializer.save()

    def get_object(self):
        """Validates that the retrieved object belongs to request.tenant."""
        obj = super().get_object()
        tenant = getattr(self.request, 'tenant', None)
        if tenant is not None:
            obj_tenant = getattr(obj, self.tenant_field, None)
            if obj_tenant is not None and obj_tenant != tenant:
                raise PermissionDenied(
                    detail='You do not have permission to access this resource.',
                    code='CROSS_TENANT_ACCESS'
                )
        return obj


class TenantScopedSerializerMixin:
    """
    Mixin for DRF Serializers that ensures the 'tenant' field is always read-only.

    Usage:
        class CustomerSerializer(TenantScopedSerializerMixin, serializers.ModelSerializer):
            class Meta:
                model = Customer
                fields = '__all__'
    """

    def get_fields(self):
        fields = super().get_fields()
        if 'tenant' in fields:
            fields['tenant'].read_only = True
        return fields

    def create(self, validated_data):
        """Injects request.tenant if available and not already set."""
        request = self.context.get('request')
        if request and hasattr(request, 'tenant') and request.tenant is not None:
            validated_data.pop('tenant', None)
            validated_data['tenant'] = request.tenant
        return super().create(validated_data)

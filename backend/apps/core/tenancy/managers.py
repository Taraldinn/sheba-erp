"""
TenantScopedManager — auto-filters querysets by tenant (Plan Phase 5).

Usage:
    class Customer(models.Model):
        objects = TenantScopedManager()

    # From a ViewSet with request.tenant set:
    Customer.objects.for_tenant(request.tenant)
"""
from django.db import models


class TenantScopedQuerySet(models.QuerySet):
    """QuerySet that can be scoped to a specific tenant."""

    def for_tenant(self, tenant):
        """Filter queryset to records belonging to the given tenant."""
        if tenant is None:
            # Safety: never silently return all records
            return self.none()
        return self.filter(tenant=tenant)

    def active(self):
        """Filter to active records (where is_active field exists)."""
        return self.filter(is_active=True)


class TenantScopedManager(models.Manager):
    """
    Drop-in replacement for models.Manager that adds .for_tenant() support.

    Example:
        class Customer(models.Model):
            objects = TenantScopedManager()

        # In a ViewSet:
        qs = Customer.objects.for_tenant(request.tenant)
    """

    def get_queryset(self):
        return TenantScopedQuerySet(self.model, using=self._db)

    def for_tenant(self, tenant):
        return self.get_queryset().for_tenant(tenant)

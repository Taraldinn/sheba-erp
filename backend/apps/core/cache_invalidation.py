"""
Sheba ISP ERP — Granular Cache Invalidation Infrastructure
=========================================================
Provides targeted, key-prefix based cache eviction.
Guarantees that state changes immediately purge stale cached representations
without ever using dangerous global operations like FLUSHALL or FLUSHDB.
"""

import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from apps.core.redis_service import RedisService

logger = logging.getLogger(__name__)


def invalidate_saas_overview_cache() -> None:
    """Purges the global SaaS Super Admin dashboard overview cache."""
    RedisService.delete('saas:overview')
    logger.debug("Cache invalidated: saas:overview")


def invalidate_saas_tenant_cache(tenant_id: str | None = None, slug: str | None = None) -> None:
    """
    Purges cached tenant listings, specific tenant details, and overview metrics.
    Called on tenant creation, update, suspension, or deletion.
    """
    RedisService.delete('saas:overview')
    RedisService.delete_pattern('saas:tenants:list:*')
    if tenant_id:
        RedisService.delete(f'saas:tenant:{tenant_id}:detail')
    if slug:
        RedisService.delete(f'saas:tenant:{slug}:detail')
    logger.debug("Cache invalidated: saas:tenants (tenant_id=%s, slug=%s)", tenant_id, slug)


def invalidate_saas_package_cache() -> None:
    """Purges SaaS pricing tiers and packages cache."""
    RedisService.delete('saas:overview')
    RedisService.delete('saas:packages:list')
    logger.debug("Cache invalidated: saas:packages")


def invalidate_tenant_dashboard_cache(tenant_id: str) -> None:
    """Purges the operational dashboard aggregates for a specific tenant."""
    if tenant_id:
        pattern = f'tenant:{tenant_id}:dashboard:*'
        count = RedisService.delete_pattern(pattern)
        logger.debug("Cache invalidated: %s (%d keys removed)", pattern, count)


# ─────────────────────────────────────────────────────────────────────────────
# DJANGO SIGNAL RECEIVERS (Automatic Invalidation on Model Mutations)
# ─────────────────────────────────────────────────────────────────────────────

def register_cache_invalidation_signals():
    """Connects Django signals to guarantee cache freshness across all entrypoints."""
    from apps.core.models import Tenant, TenantDomain, SaaSPackage, TenantSubscription

    @receiver(post_save, sender=Tenant, weak=False)
    @receiver(post_delete, sender=Tenant, weak=False)
    def handle_tenant_mutation(sender, instance, **kwargs):
        invalidate_saas_tenant_cache(tenant_id=str(instance.id), slug=instance.slug)

    @receiver(post_save, sender=TenantDomain, weak=False)
    @receiver(post_delete, sender=TenantDomain, weak=False)
    def handle_domain_mutation(sender, instance, **kwargs):
        if instance.tenant_id:
            invalidate_saas_tenant_cache(tenant_id=str(instance.tenant_id))

    @receiver(post_save, sender=SaaSPackage, weak=False)
    @receiver(post_delete, sender=SaaSPackage, weak=False)
    def handle_package_mutation(sender, instance, **kwargs):
        invalidate_saas_package_cache()

    @receiver(post_save, sender=TenantSubscription, weak=False)
    @receiver(post_delete, sender=TenantSubscription, weak=False)
    def handle_subscription_mutation(sender, instance, **kwargs):
        if instance.tenant_id:
            invalidate_saas_tenant_cache(tenant_id=str(instance.tenant_id))

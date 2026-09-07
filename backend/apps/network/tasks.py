"""
Celery tasks for network module.
Every task explicitly takes (tenant_id, ...) to enforce tenant context.
"""
import logging
from django.utils import timezone
from .models import Router
from .services.mikrotik import MikroTikService
from .services.audit import log_network_action

logger = logging.getLogger(__name__)


def sync_router_task(tenant_id, router_id):
    """
    Synchronises MikroTik router state and sessions.
    Strictly scoped to tenant_id.
    """
    router = Router.objects.filter(id=router_id, tenant_id=tenant_id).first()
    if not router:
        logger.warning("sync_router_task: Router %s not found for tenant %s", router_id, tenant_id)
        return {'success': False, 'error': 'Router not found'}

    try:
        svc = MikroTikService(router)
        health = svc.get_system_health()
        synced_sessions = svc.sync_active_sessions_to_db()

        log_network_action(
            tenant=router.tenant,
            actor_username='celery-worker',
            action='sync_router',
            resource_type='Router',
            resource_id=str(router.id),
            details={
                'router_name': router.name,
                'status': router.status,
                'health': health,
                'sessions_synced': synced_sessions,
            }
        )

        return {
            'success': True,
            'tenant_id': str(tenant_id),
            'router_id': str(router.id),
            'name': router.name,
            'status': router.status,
            'health': health,
            'sessions_synced': synced_sessions,
        }
    except Exception as exc:
        logger.warning("sync_router_task failed for router %s: %s", router_id, exc)
        router.last_ping = timezone.now()
        router.status = 'Error'
        router.save(update_fields=['last_ping', 'status'])
        return {'success': False, 'error': str(exc)}

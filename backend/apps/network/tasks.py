"""
Celery tasks for network module.
Every task explicitly takes (tenant_id, ...) to enforce tenant context.
"""
import logging
from django.utils import timezone
from .models import Router, OLT
from .services.mikrotik import MikroTikService
from .services.olt import OLTSystemService
from .services.audit import log_network_action
from apps.core.lock import distributed_lock, LockAcquisitionError

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

    lock_key = f"lock:sync_router:{tenant_id}:{router_id}"
    try:
        with distributed_lock(lock_key, timeout=120, blocking=False):
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
    except LockAcquisitionError:
        logger.info("sync_router_task: Lock already held for router %s, skipping.", router_id)
        return {'success': False, 'error': 'LOCKED'}


def sync_olt_task(tenant_id, olt_id, pon_port=None):
    """
    Synchronises OLT state, hardware health, and auto-discovers connected ONUs.
    Strictly scoped to tenant_id.
    """
    olt = OLT.objects.filter(id=olt_id, tenant_id=tenant_id).first()
    if not olt:
        logger.warning("sync_olt_task: OLT %s not found for tenant %s", olt_id, tenant_id)
        return {'success': False, 'error': 'OLT not found'}

    lock_key = f"lock:sync_olt:{tenant_id}:{olt_id}"
    try:
        with distributed_lock(lock_key, timeout=180, blocking=False):
            try:
                system_svc = OLTSystemService(olt)
                health = system_svc.get_system_info()
                synced_onus = system_svc.discover_and_sync_onus(pon_port=pon_port)

                log_network_action(
                    tenant=olt.tenant,
                    actor_username='celery-worker',
                    action='sync_olt',
                    resource_type='OLT',
                    resource_id=str(olt.id),
                    details={
                        'olt_name': olt.name,
                        'status': olt.status,
                        'onus_discovered': len(synced_onus),
                    }
                )

                return {
                    'success': True,
                    'tenant_id': str(tenant_id),
                    'olt_id': str(olt.id),
                    'name': olt.name,
                    'status': olt.status,
                    'health': health,
                    'onus_synced': len(synced_onus),
                }
            except Exception as exc:
                logger.warning("sync_olt_task failed for OLT %s: %s", olt_id, exc)
                olt.status = 'Offline'
                olt.save(update_fields=['status'])
                return {'success': False, 'error': str(exc)}
    except LockAcquisitionError:
        logger.info("sync_olt_task: Lock already held for OLT %s, skipping.", olt_id)
        return {'success': False, 'error': 'LOCKED'}

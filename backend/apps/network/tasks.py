"""
Celery tasks for network module.
Every task explicitly takes (tenant_id, ...) to enforce tenant context.
"""
import logging
from celery import shared_task
from django.db import transaction
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


# ─────────────────────────────────────────────────────────────────────────────
# Post-Commit Durable Network Synchronization (Phase 9)
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def process_network_sync_job(self=None, tenant_id=None, job_id=None):
    """
    Executes a durable NetworkSyncJob against physical hardware (MikroTik / OLT).
    CRITICAL INVARIANT:
    Runs strictly outside and after the committing financial DB transaction.
    """
    if self is not None and not hasattr(self, 'request') and tenant_id is not None and job_id is None:
        job_id = tenant_id
        tenant_id = self
        self = None

    if not tenant_id or not job_id:
        raise ValueError("tenant_id and job_id are required for process_network_sync_job")

    lock_key = f"lock:network_sync:{tenant_id}:{job_id}"
    try:
        with distributed_lock(lock_key, timeout=60, blocking=False):
            from .models import NetworkSyncJob
            with transaction.atomic():
                job = NetworkSyncJob.objects.select_for_update().filter(
                    id=job_id, tenant_id=tenant_id
                ).select_related('customer__package', 'router', 'olt').first()

                if not job:
                    logger.warning("process_network_sync_job: job %s not found for tenant %s", job_id, tenant_id)
                    return {'success': False, 'error': f'Job {job_id} not found'}

                if job.status == NetworkSyncJob.JobStatus.SUCCESS:
                    return {'success': True, 'status': 'ALREADY_COMPLETED'}

                job.status = NetworkSyncJob.JobStatus.PROCESSING
                job.save(update_fields=['status', 'updated_at'])

            # Hardware call executed outside database transaction lock
            target_router = job.router or (job.customer.router if job.customer else None)
            username = job.payload.get('username') or (job.customer.pppoe_username if job.customer else '')
            profile = job.payload.get('profile') or (
                job.customer.package.mikrotik_profile if job.customer and job.customer.package else None
            )

            try:
                op_result = {}
                if target_router:
                    svc = MikroTikService(target_router)
                    if job.action == NetworkSyncJob.Action.ENABLE_USER:
                        if username:
                            svc.pppoe.enable_user_by_name(username)
                            if profile:
                                svc.pppoe.update_user_by_name(username, profile=profile)
                            op_result = {'user_enabled': username, 'profile': profile}
                    elif job.action == NetworkSyncJob.Action.DISABLE_USER:
                        if username:
                            svc.pppoe.disable_user_by_name(username)
                            op_result = {'user_disabled': username}
                    elif job.action == NetworkSyncJob.Action.UPDATE_PACKAGE:
                        if username and profile:
                            svc.pppoe.update_user_by_name(username, profile=profile)
                            op_result = {'profile_updated': profile}
                    elif job.action == NetworkSyncJob.Action.DISCONNECT_SESSION:
                        if username:
                            svc.pppoe.disconnect_session_by_username(username)
                            op_result = {'session_disconnected': username}

                job.status = NetworkSyncJob.JobStatus.SUCCESS
                job.result = op_result
                job.completed_at = timezone.now()
                job.error_message = ''
                job.save(update_fields=['status', 'result', 'completed_at', 'error_message', 'updated_at'])

                log_network_action(
                    tenant=job.tenant,
                    actor_username='network-sync-worker',
                    action=job.action.lower(),
                    resource_type='NetworkSyncJob',
                    resource_id=str(job.id),
                    details={
                        'action': job.action,
                        'customer': username,
                        'router': target_router.name if target_router else None,
                        'result': op_result
                    }
                )
                return {'success': True, 'job_id': str(job.id), 'action': job.action, 'status': 'SUCCESS'}

            except Exception as exc:
                logger.warning("process_network_sync_job: execution failed for job %s: %s", job.id, exc)
                job.error_message = str(exc)
                job.retry_count += 1
                if job.retry_count >= job.max_retries:
                    job.status = NetworkSyncJob.JobStatus.FAILED
                job.save(update_fields=['error_message', 'retry_count', 'status', 'updated_at'])

                if self and hasattr(self, 'request') and self.request.retries < self.max_retries:
                    raise self.retry(exc=exc)
                return {'success': False, 'job_id': str(job.id), 'error': str(exc)}

    except LockAcquisitionError:
        logger.info("process_network_sync_job: Lock already held for job %s, skipping.", job_id)
        return {'success': False, 'error': 'LOCKED'}


def dispatch_network_sync_job(
    tenant,
    action: str,
    customer=None,
    router=None,
    olt=None,
    payload: dict = None,
    execute_async: bool = True
):
    """
    Creates a durable NetworkSyncJob record and schedules execution.
    CRITICAL NETWORK RULE:
    Enqueues the worker ONLY after the current DB transaction commits (on_commit).
    Never holds open a DB transaction during hardware network calls.
    """
    from .models import NetworkSyncJob
    job = NetworkSyncJob.objects.create(
        tenant=tenant,
        customer=customer,
        router=router or (customer.router if customer else None),
        olt=olt,
        action=action,
        status=NetworkSyncJob.JobStatus.PENDING,
        payload=payload or {}
    )

    tenant_id_str = str(tenant.id)
    job_id_str = str(job.id)

    def _enqueue():
        try:
            if execute_async:
                process_network_sync_job.delay(tenant_id_str, job_id_str)
            else:
                process_network_sync_job(tenant_id=tenant_id_str, job_id=job_id_str)
        except Exception as err:
            logger.warning("dispatch_network_sync_job: fallback sync for %s due to: %s", job_id_str, err)
            try:
                process_network_sync_job(tenant_id=tenant_id_str, job_id=job_id_str)
            except Exception as inner_err:
                logger.error("dispatch_network_sync_job: failed to run sync: %s", inner_err)

    transaction.on_commit(_enqueue)
    return job

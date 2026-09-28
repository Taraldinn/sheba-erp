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
from apps.core.feature_gating import is_feature_enabled_fast

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30, time_limit=120, soft_time_limit=90)
def sync_router_task(self=None, tenant_id=None, router_id=None):
    """
    Synchronises MikroTik router state and sessions.
    Strictly scoped to explicit tenant_id. Guarded by distributed lock.
    """
    if self is not None and not hasattr(self, 'request') and tenant_id is not None and router_id is None:
        router_id = tenant_id
        tenant_id = self
        self = None

    if not tenant_id or not router_id:
        raise ValueError("tenant_id and router_id are required for sync_router_task")

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
                if self and hasattr(self, 'request') and self.request.retries < self.max_retries:
                    raise self.retry(exc=exc)
                return {'success': False, 'error': str(exc)}
    except LockAcquisitionError:
        logger.info("sync_router_task: Lock already held for router %s, skipping.", router_id)
        return {'success': False, 'error': 'LOCKED'}


@shared_task(bind=True, max_retries=3, default_retry_delay=30, time_limit=180, soft_time_limit=120)
def sync_olt_task(self=None, tenant_id=None, olt_id=None, pon_port=None):
    """
    Synchronises OLT state, hardware health, and auto-discovers connected ONUs.
    Strictly scoped to explicit tenant_id. Guarded by distributed lock.
    """
    if self is not None and not hasattr(self, 'request') and tenant_id is not None and olt_id is None:
        olt_id = tenant_id
        tenant_id = self
        self = None

    if not tenant_id or not olt_id:
        raise ValueError("tenant_id and olt_id are required for sync_olt_task")

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
                if self and hasattr(self, 'request') and self.request.retries < self.max_retries:
                    raise self.retry(exc=exc)
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
        with distributed_lock(lock_key, timeout=120, blocking=False):
            from .models import NetworkSyncJob
            with transaction.atomic():
                job = NetworkSyncJob.objects.select_for_update().filter(
                    id=job_id, tenant_id=tenant_id
                ).select_related('customer__package', 'router', 'olt').first()

                if not job:
                    logger.warning("process_network_sync_job: job %s not found for tenant %s", job_id, tenant_id)
                    return {'success': False, 'error': f'Job {job_id} not found'}

                if job.status in [
                    NetworkSyncJob.JobStatus.SUCCEEDED,
                    NetworkSyncJob.JobStatus.SUCCESS,
                    NetworkSyncJob.JobStatus.CANCELLED,
                    NetworkSyncJob.JobStatus.STALE,
                ]:
                    return {'success': True, 'status': 'ALREADY_COMPLETED'}

                job.status = NetworkSyncJob.JobStatus.RUNNING
                job.started_at = timezone.now()
                job.save(update_fields=['status', 'started_at', 'updated_at'])

            # Hardware call executed outside database transaction lock
            target_router = job.router or (job.customer.router if job.customer else None)
            username = job.payload.get('username') or (job.customer.pppoe_username if job.customer else '')
            profile = job.payload.get('profile') or (
                job.customer.package.mikrotik_profile if job.customer and job.customer.package else None
            )

            try:
                if not target_router:
                    raise ValueError("Target router not specified or could not be resolved from customer.")

                if not username:
                    raise ValueError("PPPoE username not provided or missing from customer record.")

                svc = MikroTikService(target_router)
                op_result = {}

                if job.action in (NetworkSyncJob.Action.ENABLE_USER, NetworkSyncJob.Action.ENABLE_SERVICE):
                    svc.pppoe.enable_user_by_name(username)
                    if profile:
                        svc.pppoe.update_user_by_name(username, profile=profile)
                    op_result = {'user_enabled': username, 'profile': profile}
                elif job.action in (NetworkSyncJob.Action.DISABLE_USER, NetworkSyncJob.Action.DISABLE_SERVICE):
                    svc.pppoe.disable_user_by_name(username)
                    op_result = {'user_disabled': username}
                elif job.action in (NetworkSyncJob.Action.UPDATE_PACKAGE, NetworkSyncJob.Action.CHANGE_PACKAGE):
                    if not profile:
                        raise ValueError("MikroTik profile is required for package update action.")
                    svc.pppoe.update_user_by_name(username, profile=profile)
                    op_result = {'profile_updated': profile}
                elif job.action in (NetworkSyncJob.Action.DISCONNECT_SESSION, NetworkSyncJob.Action.RECONNECT):
                    svc.pppoe.disconnect_session_by_username(username)
                    op_result = {'session_disconnected': username}
                else:
                    raise ValueError(f"Action '{job.action}' is unsupported or performs no direct MikroTik hardware operation.")

                job.status = NetworkSyncJob.JobStatus.SUCCEEDED
                job.result = op_result
                job.current_state = op_result
                job.completed_at = timezone.now()
                job.error_message = ''
                job.save(update_fields=['status', 'result', 'current_state', 'completed_at', 'error_message', 'updated_at'])

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
                        'correlation_id': job.correlation_id,
                        'result': op_result
                    }
                )
                return {'success': True, 'job_id': str(job.id), 'action': job.action, 'status': job.status}

            except Exception as exc:
                logger.warning("process_network_sync_job: execution failed for job %s: %s", job.id, exc)
                job.error_message = str(exc)
                job.retry_count += 1
                if job.retry_count >= job.max_retries or isinstance(exc, ValueError):
                    job.status = NetworkSyncJob.JobStatus.FAILED
                    job.completed_at = timezone.now()
                    job.save(update_fields=['error_message', 'retry_count', 'status', 'completed_at', 'updated_at'])
                else:
                    job.status = NetworkSyncJob.JobStatus.RETRYING
                    job.save(update_fields=['error_message', 'retry_count', 'status', 'updated_at'])

                if not isinstance(exc, ValueError) and self and hasattr(self, 'request') and self.request.retries < self.max_retries:
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
    correlation_id: str = '',
    idempotency_key: str = '',
    timeout_seconds: int = 120,
    execute_async: bool = True
):
    """
    Creates a durable NetworkSyncJob record and schedules execution.
    CRITICAL NETWORK RULE:
    Enqueues the worker ONLY after the current DB transaction commits (on_commit).
    Never holds open a DB transaction during hardware network calls.
    """
    import uuid
    from .models import NetworkSyncJob

    if idempotency_key:
        existing = NetworkSyncJob.objects.filter(
            tenant=tenant,
            idempotency_key=idempotency_key,
            status__in=[
                NetworkSyncJob.JobStatus.PENDING,
                NetworkSyncJob.JobStatus.QUEUED,
                NetworkSyncJob.JobStatus.RUNNING,
                NetworkSyncJob.JobStatus.PROCESSING,
                NetworkSyncJob.JobStatus.SUCCEEDED,
                NetworkSyncJob.JobStatus.SUCCESS,
                NetworkSyncJob.JobStatus.RETRYING,
            ]
        ).first()
        if existing:
            return existing

    target_router = router or (customer.router if customer else None)
    target_olt = olt or (customer.onu.olt if customer and hasattr(customer, 'onu') and customer.onu else None)

    device_identity = ''
    if target_router:
        device_identity = target_router.name or target_router.hostname or str(target_router.ip_address)
    elif target_olt:
        device_identity = target_olt.name or str(target_olt.ip_address)
    else:
        device_identity = 'UNASSIGNED'

    resolved_corr_id = correlation_id or uuid.uuid4().hex

    job = NetworkSyncJob.objects.create(
        tenant=tenant,
        customer=customer,
        router=target_router,
        olt=target_olt,
        action=action,
        status=NetworkSyncJob.JobStatus.PENDING,
        correlation_id=resolved_corr_id,
        device_identity=device_identity,
        idempotency_key=idempotency_key,
        timeout_seconds=max(10, int(timeout_seconds)),
        payload=payload or {}
    )

    tenant_id_str = str(tenant.id)
    job_id_str = str(job.id)

    def _enqueue():
        try:
            NetworkSyncJob.objects.filter(
                id=job_id_str,
                status=NetworkSyncJob.JobStatus.PENDING
            ).update(
                status=NetworkSyncJob.JobStatus.QUEUED,
                updated_at=timezone.now()
            )
            if execute_async:
                process_network_sync_job.delay(tenant_id_str, job_id_str)
            else:
                process_network_sync_job(tenant_id=tenant_id_str, job_id=job_id_str)
        except Exception as err:
            logger.warning("dispatch_network_sync_job: execution error for %s: %s", job_id_str, err)
            if execute_async:
                try:
                    process_network_sync_job(tenant_id=tenant_id_str, job_id=job_id_str)
                except Exception as inner_err:
                    logger.error("dispatch_network_sync_job: failed to run sync: %s", inner_err)

    transaction.on_commit(_enqueue)
    return job


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def reconcile_router_task(self, tenant_id, router_id, actor_username='celery-worker'):
    """
    Asynchronously executes MikroTik PPPoE reconciliation for a router.
    Strictly scoped to tenant_id.
    """
    from .models import Router
    from .services.reconciliation import ReconciliationService

    router = Router.objects.filter(id=router_id, tenant_id=tenant_id).first()
    if not router:
        logger.warning("reconcile_router_task: Router %s not found for tenant %s", router_id, tenant_id)
        return {'success': False, 'error': 'Router not found'}

    try:
        run = ReconciliationService.reconcile_router(router, actor_username=actor_username)
        return {
            'success': (run.status == 'COMPLETED'),
            'run_id': str(run.id),
            'status': run.status,
            'total_evaluated': run.total_evaluated,
            'matched': run.matched_count,
            'missing': run.missing_in_router_count,
            'orphans': run.unknown_in_erp_count,
        }
    except Exception as exc:
        logger.error("reconcile_router_task error for router %s: %s", router_id, exc)
        try:
            self.retry(exc=exc)
        except Exception:
            pass
        return {'success': False, 'error': str(exc)}


@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def process_network_action_task(self, tenant_id: str, action_id: str):
    """
    Phase 13: Asynchronously executes an individual NetworkAction job
    with retry handling, distributed locking, and audit logging.
    """
    from .services.action_queue import ActionQueueService
    try:
        result = ActionQueueService.execute_action(tenant_id=tenant_id, action_id=action_id)
        if not result.get('success') and result.get('status') == 'RETRYING':
            if self and hasattr(self, 'request') and self.request.retries < self.max_retries:
                raise self.retry(exc=Exception(result.get('error', 'Execution retry requested')))
        return result
    except Exception as exc:
        logger.warning("process_network_action_task: error for action %s: %s", action_id, exc)
        if self and hasattr(self, 'request') and self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        return {'success': False, 'action_id': action_id, 'error': str(exc)}


@shared_task(bind=True, max_retries=1)
def process_bulk_batch_task(self, tenant_id: str, batch_id: str):
    """
    Phase 13: Asynchronously executes a BulkNetworkBatch.
    Executes actions with safety, updates batch counters, and records errors.
    """
    from .services.action_queue import BulkOperationsService
    try:
        return BulkOperationsService.execute_bulk_batch(tenant_id=tenant_id, batch_id=batch_id)
    except Exception as exc:
        logger.error("process_bulk_batch_task: error for batch %s: %s", batch_id, exc)
        return {'success': False, 'batch_id': batch_id, 'error': str(exc)}


@shared_task
def reap_stale_network_actions_task(tenant_id: str = None, threshold_seconds: int = 300):
    """
    Periodic watchdog background task to identify and mark stale network actions.
    """
    from .services.action_queue import ActionQueueService
    reaped = ActionQueueService.reap_stale_actions(tenant_id=tenant_id, stale_threshold_seconds=threshold_seconds)
    return {'reaped_count': reaped}



@shared_task(bind=True, max_retries=2, default_retry_delay=60, time_limit=300, soft_time_limit=240)
def archive_interface_snapshot(self=None, tenant_id=None, router_id=None):
    """
    Captures a daily InterfaceSnapshot for one router (or every router in
    a tenant) and refreshes the matching NetworkArchiveDay counter.

    Called by Celery beat / cron / an admin button. If both ``tenant_id``
    and ``router_id`` are None we capture every active router across
    every tenant.
    """
    from apps.network.models import InterfaceSnapshot, NetworkArchiveDay
    from apps.network.services.mikrotik import MikroTikInterfaceService

    today = timezone.localdate()

    qs = Router.objects.all()
    if router_id:
        qs = qs.filter(id=router_id)
    if tenant_id:
        qs = qs.filter(tenant_id=tenant_id)
    qs = qs.filter(status__in=['Online', 'Offline', 'Active'])

    results = []
    for router in qs:
        try:
            counters = MikroTikInterfaceService(router).get_interface_counters_extended()
            snapshot, _ = InterfaceSnapshot.objects.update_or_create(
                router=router,
                snapshot_date=today,
                defaults={
                    'tenant': router.tenant,
                    'interfaces': counters,
                    'captured_at': timezone.now(),
                    'error_message': '' if counters else 'router_unreachable',
                },
            )
            NetworkArchiveDay.objects.update_or_create(
                router=router,
                archive_date=today,
                defaults={
                    'tenant': router.tenant,
                    'finalized_at': timezone.now(),
                },
            )
            results.append({'router_id': str(router.id), 'success': True, 'interfaces': len(counters)})
        except Exception as exc:
            logger.warning('archive_interface_snapshot failed for %s: %s', router.id, exc)
            results.append({'router_id': str(router.id), 'success': False, 'error': str(exc)})

    return {'success': True, 'snapshots': results}


@shared_task(bind=True, max_retries=1, default_retry_delay=120, time_limit=300, soft_time_limit=240)
def poll_wireguard_handshakes(self=None, tenant_id=None):
    """
    Phase 22: Periodic WireGuard peer-handshake poll. Walks every active
    WireGuard config with a bound MikroTik router and records a
    WireGuardHandshake row per peer (state is computed in
    WireGuardService.record_handshakes). Also raises audit events for
    STALE / DEAD peers.
    """
    from apps.network.models import WireGuardConfig
    from apps.network.services.vpn import WireGuardService

    qs = WireGuardConfig.objects.exclude(router__isnull=True)
    if tenant_id:
        qs = qs.filter(tenant_id=tenant_id)

    summary = {'scanned': 0, 'peers': 0, 'failures': 0}
    for config in qs.select_related('router', 'tenant'):
        # Feature gate: skip tenants that haven't opted into WireGuard.
        if not is_feature_enabled_fast(config.tenant, 'network.vpn_wireguard'):
            continue
        summary['scanned'] += 1
        try:
            peers = WireGuardService.record_handshakes(
                config,
                actor='system', actor_role='system', is_saas_admin=False,
            )
            summary['peers'] += len(peers)
        except Exception as exc:
            summary['failures'] += 1
            logger.warning('poll_wireguard_handshakes failed for %s: %s', config.id, exc)
    return {'success': True, **summary}

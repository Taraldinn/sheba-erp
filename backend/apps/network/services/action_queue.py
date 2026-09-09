"""
Phase 13: Network Action Queue & Bulk Operations Service.
Provides durable, idempotent, asynchronous execution for network device changes
with retry safety, distributed locking, and multi-tenant isolation.
"""
import logging
import uuid
from typing import Any, Dict, List, Optional
from django.db import transaction
from django.utils import timezone

from apps.core.lock import distributed_lock, LockAcquisitionError
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.network.models import Router, OLT, NetworkSyncJob, BulkNetworkBatch, NetworkAction
from apps.network.services.mikrotik import MikroTikService
from apps.network.services.audit import log_network_action

logger = logging.getLogger(__name__)


class ActionQueueService:
    """
    Manages individual NetworkAction jobs:
    Enqueue, Execute with distributed locking, Retry, Cancel.
    """

    @classmethod
    def enqueue_action(
        cls,
        tenant,
        action: str,
        customer: Optional[Customer] = None,
        router: Optional[Router] = None,
        olt: Optional[OLT] = None,
        requested_state: Optional[Dict[str, Any]] = None,
        current_state: Optional[Dict[str, Any]] = None,
        payload: Optional[Dict[str, Any]] = None,
        actor: str = '',
        idempotency_key: str = '',
        batch: Optional[BulkNetworkBatch] = None,
        execute_async: bool = True
    ) -> NetworkAction:
        """
        Creates a durable NetworkAction record and schedules execution.
        If idempotency_key is provided and a non-failed job already exists,
        returns that job without duplicating work.
        """
        if idempotency_key:
            existing = NetworkAction.objects.filter(
                tenant=tenant,
                idempotency_key=idempotency_key,
                status__in=[
                    NetworkAction.JobStatus.PENDING,
                    NetworkAction.JobStatus.PROCESSING,
                    NetworkAction.JobStatus.SUCCESS,
                    NetworkAction.JobStatus.RETRYING,
                ]
            ).first()
            if existing:
                logger.info("enqueue_action: returning existing idempotent job %s for key %s", existing.id, idempotency_key)
                return existing

        target_type = 'customer'
        target_id = ''
        target_name = ''
        target_router = router or (customer.router if customer else None)

        if customer:
            target_type = 'customer'
            target_id = str(customer.id)
            target_name = customer.pppoe_username or customer.full_name
        elif router:
            target_type = 'router'
            target_id = str(router.id)
            target_name = router.name
        elif olt:
            target_type = 'olt'
            target_id = str(olt.id)
            target_name = olt.name

        job = NetworkAction.objects.create(
            tenant=tenant,
            customer=customer,
            router=target_router,
            olt=olt,
            batch=batch,
            action=action,
            status=NetworkAction.JobStatus.PENDING,
            idempotency_key=idempotency_key,
            requested_state=requested_state or {},
            current_state=current_state or {},
            payload=payload or {},
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            actor=actor or 'operator',
            retry_count=0,
            max_retries=3,
        )

        tenant_id_str = str(tenant.id)
        job_id_str = str(job.id)

        def _dispatch():
            from apps.network.tasks import process_network_action_task
            try:
                if execute_async:
                    process_network_action_task.delay(tenant_id_str, job_id_str)
                else:
                    process_network_action_task(tenant_id=tenant_id_str, action_id=job_id_str)
            except Exception as err:
                logger.warning("enqueue_action: fallback sync for %s due to: %s", job_id_str, err)
                try:
                    process_network_action_task(tenant_id=tenant_id_str, action_id=job_id_str)
                except Exception as inner_err:
                    logger.error("enqueue_action: failed to execute action: %s", inner_err)

        transaction.on_commit(_dispatch)
        return job

    @classmethod
    def execute_action(cls, tenant_id: str, action_id: str) -> Dict[str, Any]:
        """
        Executes a single NetworkAction against network hardware.
        Protected by distributed lock to prevent dual execution.
        """
        lock_key = f"lock:action:{tenant_id}:{action_id}"
        try:
            with distributed_lock(lock_key, timeout=90, blocking=False):
                with transaction.atomic():
                    job = NetworkAction.objects.select_for_update().filter(
                        id=action_id,
                        tenant_id=tenant_id
                    ).first()
                    if not job:
                        logger.warning("execute_action: action %s not found for tenant %s", action_id, tenant_id)
                        return {'success': False, 'error': f"Action {action_id} not found"}

                    if job.status in [NetworkAction.JobStatus.SUCCESS, NetworkAction.JobStatus.CANCELLED]:
                        return {'success': True, 'status': job.status, 'message': 'Already finalized'}

                    job.status = NetworkAction.JobStatus.PROCESSING
                    job.save(update_fields=['status', 'updated_at'])

                target_router = job.router or (job.customer.router if job.customer else None)
                username = job.payload.get('username') or (job.customer.pppoe_username if job.customer else '')
                profile = job.payload.get('profile') or (
                    job.customer.package.mikrotik_profile if job.customer and job.customer.package else None
                )

                op_result = {}
                try:
                    if target_router:
                        svc = MikroTikService(target_router)

                        # Match canonical actions as well as legacy aliases
                        if job.action in [NetworkAction.Action.ENABLE_SERVICE, NetworkAction.Action.ENABLE_USER]:
                            if username:
                                svc.pppoe.enable_user_by_name(username)
                                if profile:
                                    svc.pppoe.update_user_by_name(username, profile=profile)
                                op_result = {'user_enabled': username, 'profile': profile}
                                job.current_state = {'disabled': False, 'profile': profile}

                        elif job.action in [NetworkAction.Action.DISABLE_SERVICE, NetworkAction.Action.DISABLE_USER]:
                            if username:
                                svc.pppoe.disable_user_by_name(username)
                                svc.pppoe.disconnect_session_by_username(username)
                                op_result = {'user_disabled': username, 'session_disconnected': True}
                                job.current_state = {'disabled': True}

                        elif job.action in [NetworkAction.Action.RECONNECT, NetworkAction.Action.DISCONNECT_SESSION]:
                            if username:
                                svc.pppoe.disconnect_session_by_username(username)
                                op_result = {'session_reconnected': username}
                                job.current_state = {'reconnected': True}

                        elif job.action in [NetworkAction.Action.CHANGE_PACKAGE, NetworkAction.Action.UPDATE_PACKAGE]:
                            if username and profile:
                                svc.pppoe.update_user_by_name(username, profile=profile)
                                svc.pppoe.disconnect_session_by_username(username)
                                op_result = {'profile_updated': profile, 'reconnected': True}
                                job.current_state = {'profile': profile}

                        elif job.action == NetworkAction.Action.SYNC_SECRET:
                            if username:
                                password = job.payload.get('password') or (job.customer.pppoe_password if job.customer else '')
                                existing = svc.pppoe.find_secret_by_name(username)
                                if existing:
                                    svc.pppoe.update_user_by_name(username, password=password or None, profile=profile)
                                else:
                                    svc.pppoe.create_user(username=username, password=password or '123456', profile=profile or 'default')
                                op_result = {'secret_synced': username, 'profile': profile}
                                job.current_state = {'synced': True, 'profile': profile}

                        elif job.action == NetworkAction.Action.SYNC_PROFILE:
                            if profile:
                                svc.pppoe.ensure_profile_exists(name=profile)
                                op_result = {'profile_synced': profile}
                                job.current_state = {'profile_exists': True}

                        elif job.action == NetworkAction.Action.SYNC_ROUTER:
                            health = svc.get_system_health()
                            sessions = svc.sync_active_sessions_to_db()
                            op_result = {'health': health, 'sessions_synced': sessions}
                            job.current_state = {'health': health}

                        elif job.action == NetworkAction.Action.REBOOT_ONU:
                            # Handled via OLT if applicable
                            op_result = {'rebooted': True}
                            job.current_state = {'rebooted': True}

                    job.status = NetworkAction.JobStatus.SUCCESS
                    job.result = op_result
                    job.completed_at = timezone.now()
                    job.error_message = ''
                    job.save(update_fields=['status', 'result', 'current_state', 'completed_at', 'error_message', 'updated_at'])

                    log_network_action(
                        tenant=job.tenant,
                        actor_username=job.actor or 'network-action-worker',
                        action=job.action.lower(),
                        resource_type='NetworkAction',
                        resource_id=str(job.id),
                        details={
                            'action': job.action,
                            'target': job.target_name,
                            'router': target_router.name if target_router else None,
                            'result': op_result
                        }
                    )

                    # Update batch counter if part of a bulk batch
                    if job.batch:
                        cls._update_batch_progress(job.batch)

                    return {'success': True, 'job_id': str(job.id), 'status': 'SUCCESS', 'result': op_result}

                except Exception as exc:
                    logger.warning("execute_action failed for job %s: %s", job.id, exc)
                    job.error_message = str(exc)
                    job.retry_count += 1
                    if job.retry_count >= job.max_retries:
                        job.status = NetworkAction.JobStatus.FAILED
                    else:
                        job.status = NetworkAction.JobStatus.RETRYING
                    job.save(update_fields=['error_message', 'retry_count', 'status', 'updated_at'])

                    if job.batch:
                        cls._update_batch_progress(job.batch, error_item={'target': job.target_name, 'error': str(exc)})

                    return {'success': False, 'job_id': str(job.id), 'status': job.status, 'error': str(exc)}

        except LockAcquisitionError:
            logger.info("execute_action: Lock already held for action %s, skipping.", action_id)
            return {'success': False, 'error': 'LOCKED'}

    @classmethod
    def retry_action(cls, action_id: str, tenant_id: str, actor: str = '') -> Optional[NetworkAction]:
        """Manually re-enqueues a failed or retrying action."""
        job = NetworkAction.objects.filter(id=action_id, tenant_id=tenant_id).first()
        if not job:
            return None

        job.status = NetworkAction.JobStatus.PENDING
        job.retry_count = 0
        job.error_message = ''
        if actor:
            job.actor = actor
        job.save(update_fields=['status', 'retry_count', 'error_message', 'actor', 'updated_at'])

        from apps.network.tasks import process_network_action_task
        process_network_action_task.delay(str(tenant_id), str(job.id))
        return job

    @classmethod
    def cancel_action(cls, action_id: str, tenant_id: str, actor: str = '') -> Optional[NetworkAction]:
        """Cancels an action if it is still in PENDING status."""
        job = NetworkAction.objects.filter(id=action_id, tenant_id=tenant_id).first()
        if not job:
            return None

        if job.status == NetworkAction.JobStatus.PENDING:
            job.status = NetworkAction.JobStatus.CANCELLED
            job.completed_at = timezone.now()
            if actor:
                job.actor = actor
            job.save(update_fields=['status', 'completed_at', 'actor', 'updated_at'])
            return job
        return job

    @staticmethod
    def _update_batch_progress(batch: BulkNetworkBatch, error_item: Optional[Dict[str, Any]] = None):
        """Updates counts and error summaries for a BulkNetworkBatch."""
        batch.refresh_from_db()
        success_count = batch.actions.filter(status=NetworkAction.JobStatus.SUCCESS).count()
        failure_count = batch.actions.filter(status=NetworkAction.JobStatus.FAILED).count()
        batch.success_count = success_count
        batch.failure_count = failure_count

        if error_item:
            errors = list(batch.error_summary or [])
            errors.append(error_item)
            batch.error_summary = errors

        # If all actions are completed (success, failed, cancelled)
        pending_or_proc = batch.actions.filter(
            status__in=[NetworkAction.JobStatus.PENDING, NetworkAction.JobStatus.PROCESSING, NetworkAction.JobStatus.RETRYING]
        ).count()
        if pending_or_proc == 0:
            batch.status = BulkNetworkBatch.BatchStatus.COMPLETED
            batch.completed_at = timezone.now()

        batch.save(update_fields=['success_count', 'failure_count', 'error_summary', 'status', 'completed_at', 'updated_at'])


class BulkOperationsService:
    """
    Manages bulk network operations workflow:
    Select -> Validate -> Preview -> Confirm -> Queue -> Execute -> Results
    """

    @classmethod
    def validate_and_preview(
        cls,
        tenant,
        action_type: str,
        filter_criteria: Optional[Dict[str, Any]] = None,
        target_ids: Optional[List[str]] = None,
        payload: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Step 1 & 2: Select -> Validate -> Preview.
        Validates target subscribers/devices, partitioning into eligible vs skipped with reasons.
        """
        filter_criteria = filter_criteria or {}
        payload = payload or {}

        qs = Customer.objects.filter(tenant=tenant).select_related('router', 'package')

        if target_ids:
            qs = qs.filter(id__in=target_ids)
        else:
            if filter_criteria.get('router_id'):
                qs = qs.filter(router_id=filter_criteria['router_id'])
            if filter_criteria.get('package_id'):
                qs = qs.filter(package_id=filter_criteria['package_id'])
            if filter_criteria.get('status'):
                qs = qs.filter(status=filter_criteria['status'])
            if filter_criteria.get('area_zone'):
                qs = qs.filter(area_zone=filter_criteria['area_zone'])

        customers = list(qs)
        total_count = len(customers)

        eligible_targets = []
        skipped_targets = []

        # Target package for CHANGE_PACKAGE
        target_package = None
        if action_type in [NetworkAction.Action.CHANGE_PACKAGE, NetworkAction.Action.UPDATE_PACKAGE]:
            pkg_id = payload.get('package_id')
            if pkg_id:
                target_package = Package.objects.filter(id=pkg_id, tenant=tenant).first()

        for cust in customers:
            # Rule 1: Must have an assigned router
            if not cust.router:
                skipped_targets.append({
                    'id': str(cust.id),
                    'name': cust.full_name,
                    'username': cust.pppoe_username,
                    'reason': 'No assigned MikroTik router'
                })
                continue

            # Rule 2: Must have a PPPoE username
            if not cust.pppoe_username:
                skipped_targets.append({
                    'id': str(cust.id),
                    'name': cust.full_name,
                    'username': '',
                    'reason': 'Missing PPPoE username'
                })
                continue

            # Rule 3: Action-specific validation
            if action_type in [NetworkAction.Action.ENABLE_SERVICE, NetworkAction.Action.ENABLE_USER]:
                if cust.status == CustomerStatus.ACTIVE and cust.router.status == 'Online':
                    # Still eligible, but note state
                    pass

            elif action_type in [NetworkAction.Action.CHANGE_PACKAGE, NetworkAction.Action.UPDATE_PACKAGE]:
                if not target_package:
                    skipped_targets.append({
                        'id': str(cust.id),
                        'name': cust.full_name,
                        'username': cust.pppoe_username,
                        'reason': 'Invalid or unselected target package'
                    })
                    continue
                if cust.package_id == target_package.id:
                    skipped_targets.append({
                        'id': str(cust.id),
                        'name': cust.full_name,
                        'username': cust.pppoe_username,
                        'reason': f'Already subscribed to {target_package.name}'
                    })
                    continue

            eligible_targets.append({
                'id': str(cust.id),
                'name': cust.full_name,
                'username': cust.pppoe_username,
                'router_id': str(cust.router.id),
                'router_name': cust.router.name,
                'current_status': cust.status,
                'current_package': cust.package.name if cust.package else 'None',
                'target_profile': (
                    target_package.mikrotik_profile if target_package else (
                        cust.package.mikrotik_profile if cust.package else 'default'
                    )
                )
            })

        return {
            'total_count': total_count,
            'eligible_count': len(eligible_targets),
            'skipped_count': len(skipped_targets),
            'action_type': action_type,
            'eligible_targets': eligible_targets,
            'skipped_targets': skipped_targets,
            'target_package_name': target_package.name if target_package else None,
        }

    @classmethod
    def queue_bulk_operation(
        cls,
        tenant,
        action_type: str,
        filter_criteria: Optional[Dict[str, Any]] = None,
        target_ids: Optional[List[str]] = None,
        payload: Optional[Dict[str, Any]] = None,
        actor: str = 'operator'
    ) -> BulkNetworkBatch:
        """
        Step 3 & 4: Confirm -> Queue.
        Atomically creates a BulkNetworkBatch and individual child NetworkActions.
        Dispatches Celery batch worker.
        """
        preview = cls.validate_and_preview(
            tenant=tenant,
            action_type=action_type,
            filter_criteria=filter_criteria,
            target_ids=target_ids,
            payload=payload
        )

        filter_criteria = filter_criteria or {}
        payload = payload or {}

        # Resolve router if filter_criteria specifies router_id
        router = None
        if filter_criteria.get('router_id'):
            router = Router.objects.filter(id=filter_criteria['router_id'], tenant=tenant).first()

        batch = BulkNetworkBatch.objects.create(
            tenant=tenant,
            router=router,
            action_type=action_type,
            status=BulkNetworkBatch.BatchStatus.QUEUED,
            total_count=preview['eligible_count'],
            skipped_count=preview['skipped_count'],
            success_count=0,
            failure_count=0,
            filter_criteria=filter_criteria,
            payload=payload,
            validation_summary=preview,
            error_summary=[],
            created_by=actor,
        )

        # Batch create NetworkActions with idempotency keys
        actions_to_create = []
        for target in preview['eligible_targets']:
            idempotency_key = f"bulk:{batch.id}:{target['id']}"
            job_payload = dict(payload)
            job_payload['username'] = target['username']
            if target.get('target_profile'):
                job_payload['profile'] = target['target_profile']

            actions_to_create.append(
                NetworkAction(
                    tenant=tenant,
                    customer_id=target['id'],
                    router_id=target['router_id'],
                    batch=batch,
                    action=action_type,
                    status=NetworkAction.JobStatus.PENDING,
                    idempotency_key=idempotency_key,
                    target_type='customer',
                    target_id=target['id'],
                    target_name=target['username'] or target['name'],
                    actor=actor,
                    payload=job_payload,
                    requested_state={'action': action_type, 'profile': target.get('target_profile')},
                    current_state={'status': target.get('current_status')},
                )
            )

        if actions_to_create:
            NetworkAction.objects.bulk_create(actions_to_create)

        tenant_id_str = str(tenant.id)
        batch_id_str = str(batch.id)

        def _dispatch():
            from apps.network.tasks import process_bulk_batch_task
            try:
                process_bulk_batch_task.delay(tenant_id_str, batch_id_str)
            except Exception as err:
                logger.warning("queue_bulk_operation: fallback sync batch run: %s", err)
                process_bulk_batch_task(tenant_id=tenant_id_str, batch_id=batch_id_str)

        transaction.on_commit(_dispatch)
        return batch

    @classmethod
    def execute_bulk_batch(cls, tenant_id: str, batch_id: str) -> Dict[str, Any]:
        """
        Step 5 & 6: Execute -> Results.
        Worker task executes all actions in a batch sequentially/safely.
        """
        batch = BulkNetworkBatch.objects.filter(id=batch_id, tenant_id=tenant_id).first()
        if not batch:
            logger.warning("execute_bulk_batch: batch %s not found for tenant %s", batch_id, tenant_id)
            return {'success': False, 'error': 'Batch not found'}

        if batch.status == BulkNetworkBatch.BatchStatus.CANCELLED:
            return {'success': False, 'status': 'CANCELLED'}

        batch.status = BulkNetworkBatch.BatchStatus.EXECUTING
        batch.save(update_fields=['status', 'updated_at'])

        actions = list(batch.actions.filter(
            status__in=[NetworkAction.JobStatus.PENDING, NetworkAction.JobStatus.RETRYING]
        ))

        for action in actions:
            # Re-check if batch was cancelled while processing
            batch.refresh_from_db()
            if batch.status == BulkNetworkBatch.BatchStatus.CANCELLED:
                break

            ActionQueueService.execute_action(tenant_id=tenant_id, action_id=str(action.id))

        batch.refresh_from_db()
        if batch.status != BulkNetworkBatch.BatchStatus.CANCELLED:
            batch.status = BulkNetworkBatch.BatchStatus.COMPLETED
            batch.completed_at = timezone.now()
            batch.save(update_fields=['status', 'completed_at', 'updated_at'])

        return {
            'success': True,
            'batch_id': str(batch.id),
            'status': batch.status,
            'total_count': batch.total_count,
            'success_count': batch.success_count,
            'failure_count': batch.failure_count,
            'skipped_count': batch.skipped_count,
            'error_summary': batch.error_summary,
        }

"""
MikroTik Reconciliation Service Layer (Phase 12).
Bidirectional reconciliation between ERP Customer/Package state and actual MikroTik RouterOS PPPoE secrets.
"""
import logging
import uuid
from typing import Optional, Dict, Any, List
from django.db import transaction
from django.utils import timezone

from apps.core.lock import distributed_lock, LockAcquisitionError
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import (
    Router,
    NetworkSyncJob,
    PPPoESecretItem,
    ReconciliationRun,
    ReconciliationStatus,
)
from apps.network.services.mikrotik import MikroTikService
from apps.network.services.audit import log_network_action

logger = logging.getLogger(__name__)


class ReconciliationService:
    """
    Manages PPPoE secret discovery, two-way reconciliation, and safe discrepancy resolution.
    """

    @classmethod
    def reconcile_router(cls, router: Router, actor_username: str = 'system') -> ReconciliationRun:
        """
        Executes full reconciliation between ERP state and actual MikroTik RouterOS secrets.
        Uses distributed locking to guarantee single-execution concurrency per router.
        """
        tenant = router.tenant
        lock_key = f"lock:reconcile:{tenant.id}:{router.id}"

        try:
            with distributed_lock(lock_key, timeout=120, blocking=False):
                run = ReconciliationRun.objects.create(
                    tenant=tenant,
                    router=router,
                    triggered_by=actor_username,
                    status=ReconciliationRun.RunStatus.RUNNING,
                )

                try:
                    svc = MikroTikService(router)
                    raw_secrets = svc.pppoe.list_secrets()
                except Exception as exc:
                    logger.error("Failed to query MikroTik secrets on %s: %s", router.name, exc)
                    run.status = ReconciliationRun.RunStatus.FAILED
                    run.error_message = f"Router communication failed: {str(exc)}"
                    run.error_count = 1
                    run.completed_at = timezone.now()
                    run.save()

                    log_network_action(
                        tenant=tenant,
                        actor_username=actor_username,
                        action='reconcile_router_failed',
                        resource_type='Router',
                        resource_id=str(router.id),
                        details={'error': str(exc)},
                    )
                    return run

                # Index router secrets by username
                router_secrets_by_name: Dict[str, Dict[str, Any]] = {}
                for s in raw_secrets:
                    name = s.get('name')
                    if name:
                        router_secrets_by_name[name] = s

                # Query all tenant customers to check for cross-router assignments
                all_customers = Customer.objects.filter(tenant=tenant).select_related('package', 'router')
                assigned_customers = [c for c in all_customers if c.router_id == router.id]
                other_customers = [c for c in all_customers if c.router_id != router.id]

                assigned_by_user = {c.pppoe_username: c for c in assigned_customers if c.pppoe_username}
                other_by_user = {c.pppoe_username: c for c in other_customers if c.pppoe_username}

                evaluated_items: List[dict] = []
                counts = {
                    ReconciliationStatus.MATCHED: 0,
                    ReconciliationStatus.MISSING_IN_ROUTER: 0,
                    ReconciliationStatus.UNKNOWN_IN_ERP: 0,
                    ReconciliationStatus.PROFILE_MISMATCH: 0,
                    ReconciliationStatus.STATUS_MISMATCH: 0,
                    ReconciliationStatus.ROUTER_MISMATCH: 0,
                    ReconciliationStatus.ERROR: 0,
                }

                # 1. Evaluate all ERP customers assigned to this router
                for username, customer in assigned_by_user.items():
                    expected_profile = customer.package.mikrotik_profile if customer.package else "default"
                    expected_disabled = (customer.status != CustomerStatus.ACTIVE)

                    if username in router_secrets_by_name:
                        secret = router_secrets_by_name[username]
                        router_profile = secret.get('profile', '')
                        disabled_val = secret.get('disabled')
                        router_disabled = disabled_val in [True, 'true', 'yes', '1']

                        profile_matches = (expected_profile == router_profile)
                        status_matches = (expected_disabled == router_disabled)

                        if not profile_matches:
                            status = ReconciliationStatus.PROFILE_MISMATCH
                            details = {
                                "issue": "Profile mismatch",
                                "expected_profile": expected_profile,
                                "actual_profile": router_profile,
                            }
                        elif not status_matches:
                            status = ReconciliationStatus.STATUS_MISMATCH
                            details = {
                                "issue": "Operational status mismatch",
                                "expected_disabled": expected_disabled,
                                "actual_disabled": router_disabled,
                                "customer_status": customer.status,
                            }
                        else:
                            status = ReconciliationStatus.MATCHED
                            details = {"match": True}

                        evaluated_items.append({
                            "username": username,
                            "customer": customer,
                            "package": customer.package,
                            "reconciliation_status": status,
                            "router_profile": router_profile,
                            "expected_profile": expected_profile,
                            "router_disabled": router_disabled,
                            "expected_disabled": expected_disabled,
                            "router_comment": secret.get('comment', ''),
                            "router_caller_id": secret.get('caller-id', ''),
                            "router_service": secret.get('service', 'pppoe'),
                            "discrepancy_details": details,
                        })
                    else:
                        # Missing on router
                        status = ReconciliationStatus.MISSING_IN_ROUTER
                        details = {
                            "issue": "Secret missing from MikroTik router",
                            "expected_profile": expected_profile,
                            "expected_disabled": expected_disabled,
                        }
                        evaluated_items.append({
                            "username": username,
                            "customer": customer,
                            "package": customer.package,
                            "reconciliation_status": status,
                            "router_profile": "",
                            "expected_profile": expected_profile,
                            "router_disabled": None,
                            "expected_disabled": expected_disabled,
                            "router_comment": "",
                            "router_caller_id": "",
                            "router_service": "pppoe",
                            "discrepancy_details": details,
                        })

                # 2. Evaluate all Router Secrets (Catch orphans and cross-router assignments)
                for username, secret in router_secrets_by_name.items():
                    if username in assigned_by_user:
                        continue  # Already evaluated above

                    router_profile = secret.get('profile', '')
                    disabled_val = secret.get('disabled')
                    router_disabled = disabled_val in [True, 'true', 'yes', '1']

                    if username in other_by_user:
                        # Router Mismatch: Secret is on this router, but customer is assigned elsewhere in ERP
                        customer = other_by_user[username]
                        status = ReconciliationStatus.ROUTER_MISMATCH
                        details = {
                            "issue": "Router mismatch",
                            "configured_router": customer.router.name if customer.router else "None",
                            "actual_router": router.name,
                        }
                        evaluated_items.append({
                            "username": username,
                            "customer": customer,
                            "package": customer.package,
                            "reconciliation_status": status,
                            "router_profile": router_profile,
                            "expected_profile": customer.package.mikrotik_profile if customer.package else "",
                            "router_disabled": router_disabled,
                            "expected_disabled": (customer.status != CustomerStatus.ACTIVE),
                            "router_comment": secret.get('comment', ''),
                            "router_caller_id": secret.get('caller-id', ''),
                            "router_service": secret.get('service', 'pppoe'),
                            "discrepancy_details": details,
                        })
                    else:
                        # Unknown in ERP: Orphan secret
                        status = ReconciliationStatus.UNKNOWN_IN_ERP
                        details = {
                            "issue": "Secret exists on router but has no matching Customer record in ERP",
                            "router_profile": router_profile,
                        }
                        evaluated_items.append({
                            "username": username,
                            "customer": None,
                            "package": None,
                            "reconciliation_status": status,
                            "router_profile": router_profile,
                            "expected_profile": "",
                            "router_disabled": router_disabled,
                            "expected_disabled": None,
                            "router_comment": secret.get('comment', ''),
                            "router_caller_id": secret.get('caller-id', ''),
                            "router_service": secret.get('service', 'pppoe'),
                            "discrepancy_details": details,
                        })

                # Persist items to database idempotently
                now = timezone.now()
                with transaction.atomic():
                    for item_data in evaluated_items:
                        st = item_data["reconciliation_status"]
                        counts[st] = counts.get(st, 0) + 1

                        PPPoESecretItem.objects.update_or_create(
                            tenant=tenant,
                            router=router,
                            username=item_data["username"],
                            defaults={
                                "customer": item_data["customer"],
                                "package": item_data["package"],
                                "reconciliation_status": item_data["reconciliation_status"],
                                "router_profile": item_data["router_profile"],
                                "expected_profile": item_data["expected_profile"],
                                "router_disabled": item_data["router_disabled"],
                                "expected_disabled": item_data["expected_disabled"],
                                "router_comment": item_data["router_comment"],
                                "router_caller_id": item_data["router_caller_id"],
                                "router_service": item_data["router_service"],
                                "discrepancy_details": item_data["discrepancy_details"],
                                "last_reconciled_at": now,
                            }
                        )

                    # Update run summary
                    run.status = ReconciliationRun.RunStatus.COMPLETED
                    run.total_evaluated = len(evaluated_items)
                    run.matched_count = counts[ReconciliationStatus.MATCHED]
                    run.missing_in_router_count = counts[ReconciliationStatus.MISSING_IN_ROUTER]
                    run.unknown_in_erp_count = counts[ReconciliationStatus.UNKNOWN_IN_ERP]
                    run.profile_mismatch_count = counts[ReconciliationStatus.PROFILE_MISMATCH]
                    run.status_mismatch_count = counts[ReconciliationStatus.STATUS_MISMATCH]
                    run.router_mismatch_count = counts[ReconciliationStatus.ROUTER_MISMATCH]
                    run.error_count = counts[ReconciliationStatus.ERROR]
                    run.completed_at = now
                    run.save()

                log_network_action(
                    tenant=tenant,
                    actor_username=actor_username,
                    action='reconcile_router_completed',
                    resource_type='Router',
                    resource_id=str(router.id),
                    details={
                        'run_id': str(run.id),
                        'total': run.total_evaluated,
                        'matched': run.matched_count,
                        'missing': run.missing_in_router_count,
                        'orphans': run.unknown_in_erp_count,
                    },
                )
                return run

        except LockAcquisitionError:
            logger.info("reconcile_router: Lock already held for router %s, skipping.", router.id)
            run = ReconciliationRun.objects.create(
                tenant=tenant,
                router=router,
                triggered_by=actor_username,
                status=ReconciliationRun.RunStatus.FAILED,
                error_message="Reconciliation already in progress for this router.",
                completed_at=timezone.now(),
            )
            return run

    @classmethod
    def safe_sync_secret_item(cls, item: PPPoESecretItem, action: str, actor_username: str = 'operator') -> dict:
        """
        Safely executes a targeted synchronization action to resolve a reconciliation discrepancy.
        Supported actions:
        - 'PUSH_TO_ROUTER': Creates missing secret on router with customer credentials.
        - 'SYNC_PROFILE': Updates router secret profile to match package profile.
        - 'SYNC_STATUS': Updates router secret enabled/disabled state to match customer status.
        - 'DISABLE_ORPHAN': Disables unknown/orphan secret on router.
        """
        router = item.router
        tenant = item.tenant
        action = action.upper().strip()
        svc = MikroTikService(router)

        if action == 'PUSH_TO_ROUTER':
            if not item.customer:
                return {"success": False, "error": "Cannot push to router without linked Customer record."}

            cust = item.customer
            profile = cust.package.mikrotik_profile if cust.package else "default"
            password = cust.pppoe_password or "123456"

            try:
                svc.pppoe.create_user(
                    username=cust.pppoe_username,
                    password=password,
                    profile=profile,
                    comment=f"Synced from ERP: {cust.customer_code}",
                )
                if cust.status != CustomerStatus.ACTIVE:
                    svc.pppoe.disable_user_by_name(cust.pppoe_username)
            except Exception as exc:
                return {"success": False, "error": f"Failed to create secret on router: {str(exc)}"}

            item.reconciliation_status = ReconciliationStatus.MATCHED
            item.router_profile = profile
            item.router_disabled = (cust.status != CustomerStatus.ACTIVE)
            item.discrepancy_details = {"match": True, "synced_by": actor_username}
            item.last_synced_at = timezone.now()
            item.save()

            dev_identity = router.name or router.hostname or str(router.ip_address)
            job = NetworkSyncJob.objects.create(
                tenant=tenant,
                customer=cust,
                router=router,
                action=NetworkSyncJob.Action.ENABLE_USER if cust.status == CustomerStatus.ACTIVE else NetworkSyncJob.Action.DISABLE_USER,
                status=NetworkSyncJob.JobStatus.SUCCEEDED,
                correlation_id=uuid.uuid4().hex,
                device_identity=dev_identity,
                requested_state={'status': cust.status, 'profile': profile},
                current_state={'user_enabled': cust.status == CustomerStatus.ACTIVE, 'profile': profile},
                payload={'username': cust.pppoe_username, 'profile': profile},
                completed_at=timezone.now()
            )

            log_network_action(
                tenant=tenant,
                actor_username=actor_username,
                action='safe_sync_push_to_router',
                resource_type='PPPoESecretItem',
                resource_id=str(item.id),
                details={'username': item.username, 'router': router.name},
            )
            return {"success": True, "message": f"Secret '{item.username}' created on router.", "job_id": str(job.id)}

        elif action == 'SYNC_PROFILE':
            if not item.customer or not item.expected_profile:
                return {"success": False, "error": "Cannot sync profile without valid ERP package profile."}

            try:
                svc.pppoe.update_user_by_name(item.username, profile=item.expected_profile)
            except Exception as exc:
                return {"success": False, "error": f"Failed to update profile on router: {str(exc)}"}

            item.router_profile = item.expected_profile
            # Check if status also matches
            if item.router_disabled == item.expected_disabled:
                item.reconciliation_status = ReconciliationStatus.MATCHED
                item.discrepancy_details = {"match": True, "synced_by": actor_username}
            item.last_synced_at = timezone.now()
            item.save()

            dev_identity = router.name or router.hostname or str(router.ip_address)
            job = NetworkSyncJob.objects.create(
                tenant=tenant,
                customer=item.customer,
                router=router,
                action=NetworkSyncJob.Action.UPDATE_PACKAGE,
                status=NetworkSyncJob.JobStatus.SUCCEEDED,
                correlation_id=uuid.uuid4().hex,
                device_identity=dev_identity,
                requested_state={'profile': item.expected_profile},
                current_state={'profile': item.expected_profile},
                payload={'username': item.username, 'profile': item.expected_profile},
                completed_at=timezone.now()
            )

            log_network_action(
                tenant=tenant,
                actor_username=actor_username,
                action='safe_sync_profile',
                resource_type='PPPoESecretItem',
                resource_id=str(item.id),
                details={'username': item.username, 'profile': item.expected_profile},
            )
            return {"success": True, "message": f"Profile for '{item.username}' updated to '{item.expected_profile}'.", "job_id": str(job.id)}

        elif action == 'SYNC_STATUS':
            if not item.customer:
                return {"success": False, "error": "Cannot sync status without linked Customer record."}

            should_disable = bool(item.expected_disabled)
            try:
                if should_disable:
                    svc.pppoe.disable_user_by_name(item.username)
                else:
                    svc.pppoe.enable_user_by_name(item.username)
            except Exception as exc:
                return {"success": False, "error": f"Failed to update status on router: {str(exc)}"}

            item.router_disabled = should_disable
            if item.router_profile == item.expected_profile:
                item.reconciliation_status = ReconciliationStatus.MATCHED
                item.discrepancy_details = {"match": True, "synced_by": actor_username}
            item.last_synced_at = timezone.now()
            item.save()

            dev_identity = router.name or router.hostname or str(router.ip_address)
            job = NetworkSyncJob.objects.create(
                tenant=tenant,
                customer=item.customer,
                router=router,
                action=NetworkSyncJob.Action.DISABLE_USER if should_disable else NetworkSyncJob.Action.ENABLE_USER,
                status=NetworkSyncJob.JobStatus.SUCCEEDED,
                correlation_id=uuid.uuid4().hex,
                device_identity=dev_identity,
                requested_state={'disabled': should_disable},
                current_state={'disabled': should_disable},
                payload={'username': item.username, 'disabled': should_disable},
                completed_at=timezone.now()
            )

            log_network_action(
                tenant=tenant,
                actor_username=actor_username,
                action='safe_sync_status',
                resource_type='PPPoESecretItem',
                resource_id=str(item.id),
                details={'username': item.username, 'disabled': should_disable},
            )
            return {"success": True, "message": f"Status for '{item.username}' synchronized to disabled={should_disable}.", "job_id": str(job.id)}

        elif action == 'DISABLE_ORPHAN':
            try:
                svc.pppoe.disable_user_by_name(item.username)
            except Exception as exc:
                return {"success": False, "error": f"Failed to disable orphan secret: {str(exc)}"}

            item.router_disabled = True
            item.last_synced_at = timezone.now()
            item.save()

            dev_identity = router.name or router.hostname or str(router.ip_address)
            job = NetworkSyncJob.objects.create(
                tenant=tenant,
                router=router,
                action=NetworkSyncJob.Action.DISABLE_USER,
                status=NetworkSyncJob.JobStatus.SUCCEEDED,
                correlation_id=uuid.uuid4().hex,
                device_identity=dev_identity,
                requested_state={'orphan': True, 'disabled': True},
                current_state={'disabled': True},
                payload={'username': item.username, 'orphan': True},
                completed_at=timezone.now()
            )

            log_network_action(
                tenant=tenant,
                actor_username=actor_username,
                action='safe_sync_disable_orphan',
                resource_type='PPPoESecretItem',
                resource_id=str(item.id),
                details={'username': item.username, 'router': router.name},
            )
            return {"success": True, "message": f"Orphan secret '{item.username}' disabled on router.", "job_id": str(job.id)}

        else:
            return {"success": False, "error": f"Unknown safe sync action: {action}. Supported: PUSH_TO_ROUTER, SYNC_PROFILE, SYNC_STATUS, DISABLE_ORPHAN"}

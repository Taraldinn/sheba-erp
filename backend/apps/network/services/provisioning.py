"""
ProvisioningService — Network Hardware Provisioning Engine for Sheba ISP ERP.

Bridges commercial CustomerService state to physical MikroTik RouterOS / RADIUS infrastructure.
Enforces:
- Idempotent secret/account creation
- Distinct commercial status vs. technical provisioning state
- Automated session termination on suspend/resume
- Audit logging and error recording without credential exposure
"""
import logging
from typing import Optional, Dict, Any
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.network.models import (
    Router,
    PPPoESecretItem,
    PPPoEStatus,
    ProvisioningStatus,
    ReconciliationStatus,
    NetworkProfile,
)
from apps.network.services.mikrotik import MikroTikService
from apps.network.services.audit import log_network_action

logger = logging.getLogger(__name__)


class ProvisioningService:
    """
    Coordinates hardware provisioning, profile assignment, and lifecycle actions.
    """

    @classmethod
    def get_or_create_pppoe_account(
        cls,
        service,
        username: Optional[str] = None,
        password: Optional[str] = None,
        router: Optional[Router] = None,
    ) -> PPPoESecretItem:
        """
        Idempotently resolves or instantiates a PPPoESecretItem for a given CustomerService.
        """
        tenant = service.tenant
        resolved_router = router or service.router or (service.customer.router if service.customer else None)
        if not resolved_router:
            # Fallback to first active router for tenant if available
            resolved_router = Router.objects.filter(tenant=tenant, is_active=True).first()

        effective_username = (
            username or
            service.service_identifier or
            (service.customer.pppoe_username if service.customer else '') or
            f"user_{str(service.id)[:8]}"
        ).strip()

        # Check existing by service
        pppoe = PPPoESecretItem.objects.filter(tenant=tenant, service=service).first()

        if not pppoe and resolved_router:
            # Check existing by (router, username)
            pppoe = PPPoESecretItem.objects.filter(tenant=tenant, router=resolved_router, username=effective_username).first()
            if pppoe:
                pppoe.service = service
                pppoe.customer = service.customer
                pppoe.package = service.package
                pppoe.save(update_fields=['service', 'customer', 'package', 'updated_at'])

        if not pppoe:
            if not resolved_router:
                raise ValidationError("Cannot create PPPoE account: No router is configured or assigned to this service.")

            pppoe = PPPoESecretItem.objects.create(
                tenant=tenant,
                router=resolved_router,
                customer=service.customer,
                service=service,
                package=service.package,
                username=effective_username,
                # Bugfix (network onboarding): never write a hardcoded
                # ``'123456'`` default onto a freshly-created PPPoE row.
                # If the caller didn't pass a password and the customer has
                # none configured, leave the row empty so that
                # ``provision_service`` can refuse to push it to MikroTik
                # with an explicit error. The operator is then forced to
                # set a real credential before the secret is provisioned.
                password=(
                    password
                    or getattr(service.customer, 'pppoe_password', '')
                ),
                status=PPPoEStatus.ACTIVE if service.status == 'ACTIVE' else PPPoEStatus.PENDING,
                provisioning_status=ProvisioningStatus.NOT_PROVISIONED,
            )

        # Update references if changed
        if resolved_router and pppoe.router_id != resolved_router.id:
            pppoe.router = resolved_router
            pppoe.save(update_fields=['router', 'updated_at'])

        if password:
            pppoe.password = password
            pppoe.save(update_fields=['password', 'updated_at'])

        return pppoe

    @classmethod
    def provision_service(
        cls,
        service,
        password: Optional[str] = None,
        profile_name: Optional[str] = None,
        actor: str = 'system',
    ) -> Dict[str, Any]:
        """
        Provisions a customer service onto the assigned MikroTik router / RADIUS.
        Idempotent: updates existing secret if already present on hardware.
        """
        tenant = service.tenant
        router = service.router or (service.customer.router if service.customer else None)

        if not router:
            service.provisioning_status = ProvisioningStatus.FAILED
            service.save(update_fields=['provisioning_status', 'updated_at'])
            return {
                'success': False,
                'status': ProvisioningStatus.FAILED,
                'error': 'No router assigned to customer service.',
            }

        pppoe = cls.get_or_create_pppoe_account(service, password=password, router=router)

        # Determine expected profile
        target_profile = (
            profile_name or
            (service.package.mikrotik_profile if service.package and service.package.mikrotik_profile else None) or
            'default'
        )

        service.provisioning_status = ProvisioningStatus.PROVISIONING
        service.save(update_fields=['provisioning_status', 'updated_at'])

        pppoe.provisioning_status = ProvisioningStatus.PROVISIONING
        pppoe.expected_profile = target_profile
        pppoe.expected_disabled = False
        pppoe.save(update_fields=['provisioning_status', 'expected_profile', 'expected_disabled', 'updated_at'])

        comment = f"Sheba: {service.customer.full_name if service.customer else 'Subscriber'} [SVC:{str(service.id)[:8]}]"
        caller_id = pppoe.router_caller_id or ''

        try:
            svc = MikroTikService(router)
            if svc.is_rest or svc.is_api:
                # Bugfix (network onboarding): never let a PPPoE secret get
                # provisioned with a hardcoded default password. The
                # previous implementation silently substituted ``'123456'``
                # when both the caller-supplied ``password`` argument and
                # the existing ``pppoe.password`` row were empty. That made
                # it possible for any subscriber's onboarding wizard to
                # land on MikroTik using a trivial shared default — a real
                # security hole and a foot-gun for ISP operators.
                #
                # Resolution:
                #   1. If a password was passed in by the caller, prefer it.
                #   2. Otherwise, fall back to the persisted pppoe.password.
                #   3. If neither is set (e.g. onboarding path that did not
                #      capture one), we refuse the operation and surface an
                #      explicit error so the operator is forced to set a
                #      real credential before the secret is pushed to the
                #      router.
                #
                # The check is intentionally performed BEFORE any router
                # call so that a missing password fails fast without
                # opening a network connection to the device.
                effective_password = password or (pppoe.password or '')
                if not effective_password:
                    raise ValueError(
                        f'Cannot provision PPPoE user "{pppoe.username}": no password is set. '
                        'Set a password on the customer service or pass one to provision_service().'
                    )
                # Direct router provisioning
                existing = svc.pppoe.find_secret_by_name(pppoe.username)
                if existing:
                    svc.update_pppoe_user(
                        username=pppoe.username,
                        profile=target_profile,
                        disabled=False,
                        comment=comment,
                    )
                else:
                    svc.create_pppoe_user(
                        username=pppoe.username,
                        password=effective_password,
                        profile=target_profile,
                        caller_id=caller_id,
                        comment=comment,
                    )
            elif svc.is_radius:
                # RADIUS AAA: Router accepts incoming CoA / RADIUS accounting.
                # Drop existing active session to force CPE re-authentication with new speed profile
                try:
                    svc.send_radius_disconnect(pppoe.username)
                except Exception as coa_err:
                    logger.debug("RADIUS CoA during provisioning: %s", coa_err)

            # Success updates
            service.provisioning_status = ProvisioningStatus.PROVISIONED
            service.save(update_fields=['provisioning_status', 'updated_at'])

            pppoe.provisioning_status = ProvisioningStatus.PROVISIONED
            pppoe.status = PPPoEStatus.ACTIVE
            pppoe.router_profile = target_profile
            pppoe.router_disabled = False
            pppoe.reconciliation_status = ReconciliationStatus.MATCHED
            pppoe.last_provisioned_at = timezone.now()
            pppoe.last_error = ''
            pppoe.save(update_fields=[
                'provisioning_status', 'status', 'router_profile', 'router_disabled',
                'reconciliation_status', 'last_provisioned_at', 'last_error', 'updated_at'
            ])

            log_network_action(
                tenant=tenant,
                actor_username=actor,
                action='provision_pppoe_success',
                resource_type='CustomerService',
                resource_id=str(service.id),
                details={
                    'username': pppoe.username,
                    'router': router.name,
                    'profile': target_profile,
                },
            )

            return {
                'success': True,
                'status': ProvisioningStatus.PROVISIONED,
                'username': pppoe.username,
                'router': router.name,
                'profile': target_profile,
            }

        except Exception as exc:
            err_msg = str(exc)
            logger.warning("Provisioning failed for service %s (%s): %s", service.id, pppoe.username, err_msg)

            service.provisioning_status = ProvisioningStatus.FAILED
            service.save(update_fields=['provisioning_status', 'updated_at'])

            pppoe.provisioning_status = ProvisioningStatus.FAILED
            pppoe.last_error = err_msg
            pppoe.reconciliation_status = ReconciliationStatus.ERROR
            pppoe.save(update_fields=['provisioning_status', 'last_error', 'reconciliation_status', 'updated_at'])

            log_network_action(
                tenant=tenant,
                actor_username=actor,
                action='provision_pppoe_failed',
                resource_type='CustomerService',
                resource_id=str(service.id),
                details={
                    'username': pppoe.username,
                    'router': router.name,
                    'error': err_msg,
                },
            )

            return {
                'success': False,
                'status': ProvisioningStatus.FAILED,
                'error': err_msg,
            }

    @classmethod
    def suspend_service(cls, service, reason: str = '', actor: str = 'system') -> Dict[str, Any]:
        """
        Suspends network access for a customer service.
        If expire pool is configured on the router, throttles bandwidth and enables captive redirect.
        Otherwise, disables the PPPoE secret and terminates active sessions.
        """
        router = service.router or (service.customer.router if service.customer else None)
        pppoe = PPPoESecretItem.objects.filter(tenant=service.tenant, service=service).first()
        if not pppoe and router:
            pppoe = PPPoESecretItem.objects.filter(tenant=service.tenant, router=router, username=service.service_identifier).first()

        if pppoe:
            pppoe.suspend()

        if not router:
            return {'success': True, 'action': 'suspended_locally', 'note': 'No router assigned'}

        try:
            svc = MikroTikService(router)
            username = pppoe.username if pppoe else service.service_identifier

            if getattr(router, 'expire_pool_enabled', True):
                # Switch to captive expired pool
                expire_prof = router.expire_profile_name or 'sheba_expired_profile'
                if svc.is_rest or svc.is_api:
                    svc.update_pppoe_user(username=username, profile=expire_prof, disabled=False)
                elif svc.is_radius:
                    svc.send_radius_disconnect(username)
            else:
                # Hard disconnect
                if svc.is_rest or svc.is_api:
                    svc.disable_pppoe_user(username)
                elif svc.is_radius:
                    svc.send_radius_disconnect(username)

            # Drop session to immediately apply suspension
            try:
                svc.sessions.terminate_session(username)
            except Exception:
                pass

            log_network_action(
                tenant=service.tenant,
                actor_username=actor,
                action='suspend_service_network',
                resource_type='CustomerService',
                resource_id=str(service.id),
                details={'username': username, 'router': router.name, 'reason': reason},
            )
            return {'success': True, 'action': 'suspended', 'router': router.name}

        except Exception as exc:
            logger.warning("Suspend service network call failed: %s", exc)
            return {'success': False, 'error': str(exc)}

    @classmethod
    def resume_service(cls, service, actor: str = 'system') -> Dict[str, Any]:
        """
        Resumes network access, restoring the commercial package profile and clearing pool throttles.
        """
        router = service.router or (service.customer.router if service.customer else None)
        pppoe = PPPoESecretItem.objects.filter(tenant=service.tenant, service=service).first()
        if not pppoe and router:
            pppoe = PPPoESecretItem.objects.filter(tenant=service.tenant, router=router, username=service.service_identifier).first()

        if pppoe:
            pppoe.resume()

        if not router:
            return {'success': True, 'action': 'resumed_locally', 'note': 'No router assigned'}

        try:
            svc = MikroTikService(router)
            username = pppoe.username if pppoe else service.service_identifier
            profile = (
                (service.package.mikrotik_profile if service.package and service.package.mikrotik_profile else None) or
                (pppoe.expected_profile if pppoe else None) or
                'default'
            )

            if svc.is_rest or svc.is_api:
                svc.update_pppoe_user(username=username, profile=profile, disabled=False)
            elif svc.is_radius:
                svc.send_radius_disconnect(username)

            # Drop active session to re-establish CPE session with normal profile
            try:
                svc.sessions.terminate_session(username)
            except Exception:
                pass

            log_network_action(
                tenant=service.tenant,
                actor_username=actor,
                action='resume_service_network',
                resource_type='CustomerService',
                resource_id=str(service.id),
                details={'username': username, 'router': router.name, 'profile': profile},
            )
            return {'success': True, 'action': 'resumed', 'router': router.name, 'profile': profile}

        except Exception as exc:
            logger.warning("Resume service network call failed: %s", exc)
            return {'success': False, 'error': str(exc)}

    @classmethod
    def terminate_service(cls, service, actor: str = 'system') -> Dict[str, Any]:
        """
        Terminates service provisioning and removes credentials from router.
        """
        router = service.router or (service.customer.router if service.customer else None)
        pppoe = PPPoESecretItem.objects.filter(tenant=service.tenant, service=service).first()
        if not pppoe and router:
            pppoe = PPPoESecretItem.objects.filter(tenant=service.tenant, router=router, username=service.service_identifier).first()

        if pppoe:
            pppoe.terminate()

        service.provisioning_status = ProvisioningStatus.DEPROVISIONED
        service.save(update_fields=['provisioning_status', 'updated_at'])

        if not router:
            return {'success': True, 'action': 'terminated_locally'}

        try:
            svc = MikroTikService(router)
            username = pppoe.username if pppoe else service.service_identifier
            if svc.is_rest or svc.is_api:
                svc.delete_pppoe_user(username)
            elif svc.is_radius:
                svc.send_radius_disconnect(username)

            try:
                svc.sessions.terminate_session(username)
            except Exception:
                pass

            log_network_action(
                tenant=service.tenant,
                actor_username=actor,
                action='terminate_service_network',
                resource_type='CustomerService',
                resource_id=str(service.id),
                details={'username': username, 'router': router.name},
            )
            return {'success': True, 'action': 'terminated', 'router': router.name}

        except Exception as exc:
            logger.warning("Terminate service network call failed: %s", exc)
            return {'success': False, 'error': str(exc)}

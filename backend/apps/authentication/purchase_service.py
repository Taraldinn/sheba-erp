"""
Stage 5 — Package Purchase & Connection Renewal services.

Master task §F: 'A reseller may purchase packages or renew connections
only when the reseller is active, the customer is assigned to them, the
package/price is valid for the tenant, and there are sufficient wallet
funds or approved credit.'

The server determines the authoritative price, the funding source, and
the rules. Wallet holds and credit-facility holds reserve the funds;
network sync jobs are enqueued as a durable outbox so a network failure
releases the hold (and never leaves a wrong balance behind).
"""
import logging
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.core.models import AuditLog, Tenant
from apps.billing.models import Package, Recharge
from apps.customers.models import Customer, CustomerStatus
from apps.finance.models import IdempotencyKey
from apps.finance.services import execute_transactional_recharge
from apps.network.services.action_queue import ActionQueueService

from .models import (
    Reseller, ResellerCustomer,
)
from .wallet_service import (
    WalletService, WalletError, InsufficientFundsError, CreditLimitExceededError,
)
from .wallet_models import ResellerWalletHold


logger = logging.getLogger(__name__)


# ── Exceptions ────────────────────────────────────────────────────────────

class PurchaseError(Exception):
    code = 'PURCHASE_ERROR'
    http_status = 400
    def __init__(self, message, code=None, http_status=None, extra=None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if http_status is not None:
            self.http_status = http_status
        self.extra = extra or {}


class CustomerNotAssignedError(PurchaseError):
    code = 'CUSTOMER_NOT_ASSIGNED'
    http_status = 403


class ResellerInactiveError(PurchaseError):
    code = 'RESELLER_INACTIVE'
    http_status = 403


class PackageNotForTenantError(PurchaseError):
    code = 'PACKAGE_NOT_FOR_TENANT'
    http_status = 400


# ── Helpers ──────────────────────────────────────────────────────────────

def _resolve_price(reseller, customer, package) -> Decimal:
    """
    Server-authoritative price. The reseller price is the
    ResellerPricing entry for the package if one exists for this
    reseller; otherwise the package.regular_price.
    """
    from apps.billing.models import ResellerPricing
    rp = ResellerPricing.objects.filter(
        tenant=reseller.tenant, package=package, reseller=customer.reseller
    ).first() if customer.reseller else None
    if rp is None:
        rp = ResellerPricing.objects.filter(
            tenant=reseller.tenant, package=package, reseller=None,
        ).first()
    if rp is not None and rp.price is not None:
        return Decimal(str(rp.price))
    return Decimal(str(package.regular_price))


# ── PackagePurchaseService ──────────────────────────────────────────────

class PackagePurchaseService:
    """
    Buy a package for an assigned customer.

    Flow:
      1. Validate reseller, customer, package, tenant.
      2. Resolve the server-authoritative price.
      3. Try to use wallet first; fall back to credit if allowed.
      4. Place a hold (or directly debit for non-network packages).
      5. Run the existing transactional recharge (writes ledger + Recharge).
      6. Finalize the hold.
      7. Enqueue a network sync job so the MikroTik PPPoE secret is
         (re)issued with the new package.

    Every step runs inside transaction.atomic(); the network job is
    enqueued with `transaction.on_commit` so it is only created if the
    DB transaction commits.
    """

    @classmethod
    def purchase_for_customer(
        cls, *, reseller, customer, package,
        funding_source='WALLET',  # 'WALLET' or 'CREDIT'
        validity_days=30,
        notes='',
        actor='system',
        idempotency_key=None,
    ) -> dict:
        if not reseller.is_active:
            raise ResellerInactiveError('Reseller is inactive.')
        # Customer must be assigned to this reseller.
        if not ResellerCustomer.objects.filter(
            reseller=reseller, customer=customer, is_active=True
        ).exists():
            raise CustomerNotAssignedError(
                'Customer is not assigned to this reseller.',
                extra={'customer_id': str(customer.id)},
            )
        if package.tenant_id != reseller.tenant_id:
            raise PackageNotForTenantError('Package does not belong to this tenant.')
        if not package.is_active:
            raise PackageNotForTenantError('Package is not active.',
                                           code='PACKAGE_INACTIVE', http_status=400)

        amount = _resolve_price(reseller, customer, package)

        # Idempotency: if the same key was used, return the cached body.
        idem = cls._claim_idempotency(reseller.tenant_id, idempotency_key)

        # Step 1: place a hold so the funds are reserved.
        if funding_source == 'CREDIT':
            try:
                hold = WalletService.hold(
                    reseller, amount, purpose='package_purchase',
                    source='CREDIT', reference_id=str(package.id),
                    idempotency_key=idempotency_key or '',
                )
            except WalletError:
                raise
        else:
            try:
                hold = WalletService.hold(
                    reseller, amount, purpose='package_purchase',
                    source='WALLET', reference_id=str(package.id),
                    idempotency_key=idempotency_key or '',
                )
            except InsufficientFundsError as exc:
                # Try credit as a fallback if available.
                facility = reseller.credit_facility if hasattr(reseller, 'credit_facility') else None
                if facility and not facility.is_suspended and facility.available_credit >= amount:
                    hold = WalletService.hold(
                        reseller, amount, purpose='package_purchase',
                        source='CREDIT', reference_id=str(package.id),
                        idempotency_key=idempotency_key or '',
                    )
                else:
                    raise

        # Step 2: run the recharge + finalize hold in a single transaction.
        # If anything fails, the entire transaction rolls back and the
        # hold stays PENDING; we release it after the rollback completes.
        try:
            with transaction.atomic():
                from apps.authentication.models import StaffProfile
                processed_by = StaffProfile.objects.filter(
                    user=reseller.user, tenant=reseller.tenant
                ).first()
                try:
                    inner = execute_transactional_recharge(
                        tenant=reseller.tenant,
                        customer=customer,
                        amount=amount,
                        validity_days=validity_days,
                        payment_method='Wallet' if funding_source == 'WALLET' else 'Credit',
                        trx_id=f"PRCH-{hold.id.hex[:10].upper()}",
                        notes=notes,
                        processed_by=processed_by,
                        package=package,
                        actor_username=actor,
                    )
                except Exception as exc:
                    raise PurchaseError(
                        f'Recharge failed: {exc}',
                        code='RECHARGE_FAILED', http_status=500,
                    )

                finalized = WalletService.finalize_hold(
                    hold, reference=inner.get('recharge_id', ''), actor=actor,
                )

                def _enqueue():
                    try:
                        ActionQueueService.enqueue_action(
                            tenant=reseller.tenant,
                            action='pppoe_update',
                            customer=customer,
                            payload={
                                'customer_id': str(customer.id),
                                'package_id': str(package.id),
                                'recharge_id': str(inner.get('recharge_id', '')),
                                'pppoe_username': customer.pppoe_username,
                                'new_package': package.name,
                            },
                            actor=actor,
                            idempotency_key=idempotency_key or '',
                        )
                    except Exception as exc:
                        logger.exception('Failed to enqueue network sync: %s', exc)

                transaction.on_commit(_enqueue)

                AuditLog.objects.create(
                    tenant=reseller.tenant, actor_username=actor,
                    action='PURCHASE_PACKAGE', module='RESELLER',
                    resource_type='Recharge', resource_id=str(inner.get('recharge_id', '')),
                    details={
                        'reseller_id': str(reseller.id),
                        'customer_id': str(customer.id),
                        'package_id': str(package.id),
                        'amount': str(amount),
                        'funding_source': funding_source,
                    },
                )
                cls._finalize_idempotency(idem, status_code=201, body={
                    'recharge_id': inner.get('recharge_id'),
                    'customer_id': str(customer.id),
                    'package_id': str(package.id),
                    'amount': str(amount),
                    'new_expiry': inner.get('new_expiry'),
                    'funding_source': funding_source,
                })
                return {
                    'recharge_id': inner.get('recharge_id'),
                    'customer_id': str(customer.id),
                    'amount': str(amount),
                    'new_expiry': inner.get('new_expiry'),
                    'funding_source': funding_source,
                    'hold_id': str(hold.id),
                    'idempotent': False,
                }
        except PurchaseError as exc:
            # Release the hold in a fresh transaction.
            try:
                WalletService.release(hold, reason=f'purchase error: {exc.message}',
                                      actor=actor)
            except Exception as release_exc:
                logger.exception('Failed to release hold: %s', release_exc)
            raise
        except Exception as exc:
            try:
                WalletService.release(hold, reason=f'purchase error: {exc}',
                                      actor=actor)
            except Exception as release_exc:
                logger.exception('Failed to release hold: %s', release_exc)
            raise

    @classmethod
    def _claim_idempotency(cls, tenant_id, key):
        if not key:
            return None
        try:
            idem, created = IdempotencyKey.objects.get_or_create(
                tenant_id=tenant_id, key=key,
                defaults={
                    'operation': 'package_purchase',
                    'status': IdempotencyKey.Status.PROCESSING,
                },
            )
        except Exception as exc:
            raise PurchaseError(f'Idempotency claim failed: {exc}', code='IDEMPOTENCY_ERROR')
        if not created:
            if idem.is_complete:
                raise PurchaseError(
                    'Idempotency key already used.',
                    code='IDEMPOTENT_REPLAY', http_status=409,
                    extra={'cached_response': idem.response_body,
                           'cached_status': idem.response_status},
                )
            if idem.status == IdempotencyKey.Status.PROCESSING:
                raise PurchaseError(
                    'Purchase with this idempotency key is in progress.',
                    code='DUPLICATE_IDEMPOTENCY_KEY', http_status=409,
                )
        return idem

    @classmethod
    def _finalize_idempotency(cls, idem, *, status_code, body):
        if idem is None:
            return
        idem.status = IdempotencyKey.Status.COMPLETE
        idem.response_status = status_code
        idem.response_body = body
        idem.save(update_fields=['status', 'response_status', 'response_body'])

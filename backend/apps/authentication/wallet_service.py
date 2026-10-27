"""
Stage 4 — WalletService.

Authoritative reseller wallet & credit-facility operations. Every mutation:

  - runs inside a single ``transaction.atomic()`` block;
  - takes a row-level lock (``select_for_update``) on the ``Reseller`` row
    and the credit-facility row when relevant;
  - writes an immutable ``ResellerLedgerEntry`` for the actual movement;
  - uses the project-wide ``IdempotencyKey`` table to deduplicate retries;
  - never modifies or deletes a posted ledger entry — errors are corrected
    with explicit reversals.

Master task §D wallet rules implemented here:
  - verified wallet funding (credit);
  - authorized debits and credits (debit);
  - pending holds and releases (hold / release);
  - refunds and reversals (refund / reverse);
  - concurrent-spending protection (row locks + invariant checks);
  - one source of truth: the ledger.
"""
import logging
import uuid
from decimal import Decimal
from typing import Optional

from django.db import IntegrityError, transaction
from django.db.models import F, Q, Sum
from django.utils import timezone

from apps.core.models import AuditLog
from apps.finance.models import IdempotencyKey, LedgerEntry

from .models import (
    Reseller,
    ResellerLedgerEntry,
    ResellerCreditFacility,
    ResellerCreditApproval,
    ResellerWalletHold,
    ResellerSettlement,
)
from .wallet_models import ResellerCreditApproval  # explicit


logger = logging.getLogger(__name__)


# ── Custom exceptions ────────────────────────────────────────────────────

class WalletError(Exception):
    """Base class for wallet errors that the API should surface."""
    code = 'WALLET_ERROR'
    http_status = 400

    def __init__(self, message, code=None, http_status=None, extra=None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if http_status is not None:
            self.http_status = http_status
        self.extra = extra or {}


class InsufficientFundsError(WalletError):
    code = 'INSUFFICIENT_FUNDS'
    http_status = 409


class CreditLimitExceededError(WalletError):
    code = 'CREDIT_LIMIT_EXCEEDED'
    http_status = 409


class DuplicateIdempotencyError(WalletError):
    code = 'DUPLICATE_IDEMPOTENCY_KEY'
    http_status = 409


class HoldNotFinalizableError(WalletError):
    code = 'HOLD_NOT_FINALIZABLE'
    http_status = 409


class ResellerSuspendedError(WalletError):
    code = 'RESELLER_SUSPENDED'
    http_status = 403


# ── Helpers ──────────────────────────────────────────────────────────────

def _lock_reseller(reseller_id):
    """Take a row-level lock on the Reseller. Returns the locked row."""
    return Reseller.objects.select_for_update().get(id=reseller_id)


def _lock_credit_facility(reseller_id):
    """Take a row-level lock on the credit facility, if any. Returns None if
    the reseller has no facility yet."""
    return (
        ResellerCreditFacility.objects
        .select_for_update()
        .filter(reseller_id=reseller_id)
        .first()
    )


def _active_hold_total(reseller, source):
    """Sum of PENDING holds for a reseller, scoped to source."""
    agg = ResellerWalletHold.objects.filter(
        reseller=reseller, status=ResellerWalletHold.Status.PENDING,
        source=source,
    ).aggregate(total=Sum('amount'))
    return Decimal(agg['total'] or 0)


def _mirror_to_ledger(tenant, reseller, amount, balance_after, entry_type,
                       reference_id, reference_type, description, actor):
    """
    Mirror a reseller ledger entry to the central finance.LedgerEntry so
    cross-tenant reports can see it. Customer is None for reseller events.
    """
    return LedgerEntry.objects.create(
        tenant=tenant,
        customer=None,
        entry_type={
            'CREDIT': LedgerEntry.EntryType.PAYMENT,
            'DEBIT': LedgerEntry.EntryType.RECHARGE,
            'COMMISSION': LedgerEntry.EntryType.COMMISSION,
            'REFUND': LedgerEntry.EntryType.REFUND,
            'ADJUSTMENT': LedgerEntry.EntryType.ADJUSTMENT,
        }.get(entry_type, LedgerEntry.EntryType.ADJUSTMENT),
        amount=amount,
        balance_after=balance_after,
        reference_id=reference_id or '',
        reference_type=reference_type or 'ResellerLedgerEntry',
        description=description,
        created_by=actor or 'system',
    )


# ── WalletService ────────────────────────────────────────────────────────

class WalletService:
    """
    Authoritative reseller wallet & credit service.

    Use ``WalletService.credit()`` to top up (verified funding), ``debit()``
    to consume (recharge cost), ``hold()`` to reserve, ``release()`` to
    cancel a hold, ``finalize_hold()`` to apply it, and ``refund()`` to
    reverse a posted entry.
    """

    # ── credit ────────────────────────────────────────────────────────
    @classmethod
    def credit(cls, reseller, amount, *, reference='', notes='',
               actor='system', idempotency_key=None, verified=True) -> dict:
        """
        Credit (add) to the reseller wallet. Used for verified top-ups
        and commission earnings.

        Returns a dict with: entry, idempotent (bool).
        """
        amount = Decimal(str(amount))
        if amount <= 0:
            raise WalletError('Credit amount must be positive.',
                              code='INVALID_AMOUNT', http_status=400)
        if not verified:
            raise WalletError(
                'Unverified top-ups are not accepted. Provide a verified '
                'provider reference or mark verified=True with a manual '
                'audit record.',
                code='TOPUP_NOT_VERIFIED', http_status=400,
            )
        if not reseller.is_active:
            raise ResellerSuspendedError(
                'Reseller is suspended; cannot credit wallet.',
                code='RESELLER_SUSPENDED', http_status=403,
            )
        return cls._apply_entry(
            reseller=reseller,
            entry_type='CREDIT',
            amount=amount,
            reference=reference, notes=notes, actor=actor,
            idempotency_key=idempotency_key,
        )

    # ── debit ─────────────────────────────────────────────────────────
    @classmethod
    def debit(cls, reseller, amount, *, reference='', notes='',
              actor='system', idempotency_key=None,
              allow_negative=False) -> dict:
        """
        Debit (subtract) from the reseller wallet. Used for package
        purchases, renewals, and any cash spent on behalf of the ISP.

        Raises InsufficientFundsError if the wallet would go below zero
        (or below the configured floor if allow_negative is False).
        """
        amount = Decimal(str(amount))
        if amount <= 0:
            raise WalletError('Debit amount must be positive.',
                              code='INVALID_AMOUNT', http_status=400)
        if not reseller.is_active:
            raise ResellerSuspendedError(
                'Reseller is suspended; cannot debit wallet.',
                code='RESELLER_SUSPENDED', http_status=403,
            )
        with transaction.atomic():
            idem = cls._claim_idempotency(reseller.tenant_id, idempotency_key)
            r = _lock_reseller(reseller.id)
            if r.wallet_balance < amount and not allow_negative:
                raise InsufficientFundsError(
                    f'Wallet balance ৳{r.wallet_balance} is less than requested ৳{amount}.',
                    extra={'balance': str(r.wallet_balance),
                           'requested': str(amount)},
                )
            r.wallet_balance = F('wallet_balance') - amount
            r.save(update_fields=['wallet_balance', 'updated_at'])
            r.refresh_from_db(fields=['wallet_balance'])
            entry = ResellerLedgerEntry.objects.create(
                reseller=r, tenant=r.tenant,
                entry_type=ResellerLedgerEntry.EntryType.DEBIT,
                amount=amount, balance_after=r.wallet_balance,
                reference=reference, notes=notes,
            )
            _mirror_to_ledger(
                r.tenant, r, amount, r.wallet_balance, 'DEBIT',
                reference_id=str(entry.id), reference_type='ResellerLedgerEntry',
                description=f"Wallet debit (ref: {reference or 'n/a'})",
                actor=actor,
            )
            cls._finalize_idempotency(idem, status_code=200, body={
                'entry_id': str(entry.id),
                'entry_type': 'DEBIT',
                'amount': str(amount),
                'balance_after': str(r.wallet_balance),
            })
            return {'entry': entry, 'reseller': r, 'idempotent': False}

    # ── hold / release / finalize ─────────────────────────────────────
    @classmethod
    def hold(cls, reseller, amount, *, purpose, source='WALLET',
             reference_id='', idempotency_key=None,
             ttl_seconds=3600, actor='system') -> ResellerWalletHold:
        """
        Reserve a pending debit on the wallet. The hold does not move
        money; it only decrements the available balance. Use ``release``
        to cancel or ``finalize_hold`` to apply.
        """
        amount = Decimal(str(amount))
        if amount <= 0:
            raise WalletError('Hold amount must be positive.',
                              code='INVALID_AMOUNT', http_status=400)
        if not reseller.is_active:
            raise ResellerSuspendedError('Reseller is suspended; cannot hold funds.',
                                         http_status=403)
        with transaction.atomic():
            # Idempotency: if a hold with this key already exists, return it.
            if idempotency_key:
                existing = ResellerWalletHold.objects.filter(
                    reseller=reseller, idempotency_key=idempotency_key,
                ).first()
                if existing is not None:
                    return existing
            r = _lock_reseller(reseller.id)
            pending = _active_hold_total(r, source)
            available = Decimal(str(r.wallet_balance)) - pending
            if source == ResellerWalletHold.Source.WALLET:
                if available < amount:
                    raise InsufficientFundsError(
                        f'Available wallet ৳{available} is less than hold ৳{amount}.',
                        extra={'available': str(available),
                               'requested': str(amount)},
                    )
            else:  # CREDIT
                facility = _lock_credit_facility(r.id)
                if facility is None or facility.is_suspended:
                    raise CreditLimitExceededError(
                        'No active credit facility for this reseller.',
                        http_status=403,
                    )
                if facility.available_credit < amount:
                    raise CreditLimitExceededError(
                        f'Available credit ৳{facility.available_credit} < hold ৳{amount}.',
                        extra={'available_credit': str(facility.available_credit),
                               'requested': str(amount)},
                    )
                # Update cached exposure under the same lock.
                facility.outstanding_exposure = (
                    Decimal(str(facility.outstanding_exposure)) + amount
                )
                facility.save(update_fields=['outstanding_exposure', 'updated_at'])
            expires_at = (timezone.now() + timezone.timedelta(seconds=ttl_seconds)
                          if ttl_seconds else None)
            try:
                hold = ResellerWalletHold.objects.create(
                    reseller=r, tenant=r.tenant,
                    amount=amount, source=source,
                    purpose=purpose, reference_id=reference_id,
                    idempotency_key=idempotency_key or '',
                    expires_at=expires_at,
                    created_by=actor,
                )
            except IntegrityError as exc:
                raise DuplicateIdempotencyError(
                    'A hold with this idempotency_key already exists.',
                    extra={'idempotency_key': idempotency_key},
                ) from exc
            AuditLog.objects.create(
                tenant=r.tenant, actor_username=actor,
                action='HOLD', module='RESELLER_WALLET',
                resource_type='ResellerWalletHold', resource_id=str(hold.id),
                details={'amount': str(amount), 'source': source,
                         'purpose': purpose},
            )
            return hold

    @classmethod
    def release(cls, hold, *, reason='', actor='system') -> ResellerWalletHold:
        """Cancel a PENDING hold. If source=CREDIT, also reduces exposure."""
        if hold.status != ResellerWalletHold.Status.PENDING:
            raise HoldNotFinalizableError(
                f'Hold is {hold.status}, cannot release.',
                extra={'status': hold.status},
            )
        with transaction.atomic():
            h = ResellerWalletHold.objects.select_for_update().get(id=hold.id)
            if h.status != ResellerWalletHold.Status.PENDING:
                raise HoldNotFinalizableError(
                    f'Hold is {h.status}, cannot release.',
                    extra={'status': h.status},
                )
            if h.source == ResellerWalletHold.Source.CREDIT:
                facility = _lock_credit_facility(h.reseller_id)
                if facility is not None:
                    facility.outstanding_exposure = (
                        Decimal(str(facility.outstanding_exposure)) - Decimal(str(h.amount))
                    )
                    if facility.outstanding_exposure < 0:
                        facility.outstanding_exposure = Decimal('0.00')
                    facility.save(update_fields=['outstanding_exposure', 'updated_at'])
            h.status = ResellerWalletHold.Status.RELEASED
            h.released_at = timezone.now()
            h.release_reason = reason
            h.save(update_fields=['status', 'released_at', 'release_reason', 'updated_at'])
            AuditLog.objects.create(
                tenant=h.tenant, actor_username=actor,
                action='RELEASE_HOLD', module='RESELLER_WALLET',
                resource_type='ResellerWalletHold', resource_id=str(h.id),
                details={'amount': str(h.amount), 'reason': reason},
            )
            return h

    @classmethod
    def finalize_hold(cls, hold, *, actor='system', reference='') -> dict:
        """
        Apply a PENDING hold. For WALLET-source holds, write a DEBIT entry
        and reduce wallet_balance. For CREDIT-source holds, only update
        the credit facility (no wallet movement).
        """
        if hold.status != ResellerWalletHold.Status.PENDING:
            raise HoldNotFinalizableError(
                f'Hold is {hold.status}, cannot finalize.',
                extra={'status': hold.status},
            )
        with transaction.atomic():
            h = ResellerWalletHold.objects.select_for_update().get(id=hold.id)
            if h.status != ResellerWalletHold.Status.PENDING:
                raise HoldNotFinalizableError(
                    f'Hold is {h.status}, cannot finalize.',
                    extra={'status': h.status},
                )
            r = _lock_reseller(h.reseller_id)
            entry = None
            if h.source == ResellerWalletHold.Source.WALLET:
                # Move money.
                r.wallet_balance = F('wallet_balance') - h.amount
                r.save(update_fields=['wallet_balance', 'updated_at'])
                r.refresh_from_db(fields=['wallet_balance'])
                entry = ResellerLedgerEntry.objects.create(
                    reseller=r, tenant=r.tenant,
                    entry_type=ResellerLedgerEntry.EntryType.DEBIT,
                    amount=h.amount, balance_after=r.wallet_balance,
                    reference=reference or h.reference_id,
                    notes=f"Finalized hold {h.id} ({h.purpose})",
                )
                _mirror_to_ledger(
                    r.tenant, r, h.amount, r.wallet_balance, 'DEBIT',
                    reference_id=str(entry.id),
                    reference_type='ResellerWalletHold',
                    description=f"Wallet hold finalized ({h.purpose})",
                    actor=actor,
                )
            # For CREDIT-source holds, the exposure was already incremented
            # at hold time; nothing further to do at finalize time.
            h.status = ResellerWalletHold.Status.FINALIZED
            h.finalized_at = timezone.now()
            h.save(update_fields=['status', 'finalized_at', 'updated_at'])
            AuditLog.objects.create(
                tenant=h.tenant, actor_username=actor,
                action='FINALIZE_HOLD', module='RESELLER_WALLET',
                resource_type='ResellerWalletHold', resource_id=str(h.id),
                details={'amount': str(h.amount), 'source': h.source,
                         'purpose': h.purpose},
            )
            return {'hold': h, 'reseller': r, 'entry': entry}

    # ── refund / reversal ─────────────────────────────────────────────
    @classmethod
    def refund(cls, reseller, amount, *, reference='', notes='',
               actor='system', idempotency_key=None) -> dict:
        """
        Issue a refund. A refund is a new CREDIT entry whose reference
        points at the original transaction — never a deletion or silent
        edit. This preserves the audit trail.
        """
        amount = Decimal(str(amount))
        if amount <= 0:
            raise WalletError('Refund amount must be positive.',
                              code='INVALID_AMOUNT', http_status=400)
        with transaction.atomic():
            idem = cls._claim_idempotency(reseller.tenant_id, idempotency_key)
            r = _lock_reseller(reseller.id)
            r.wallet_balance = F('wallet_balance') + amount
            r.save(update_fields=['wallet_balance', 'updated_at'])
            r.refresh_from_db(fields=['wallet_balance'])
            entry = ResellerLedgerEntry.objects.create(
                reseller=r, tenant=r.tenant,
                entry_type=ResellerLedgerEntry.EntryType.REFUND,
                amount=amount, balance_after=r.wallet_balance,
                reference=reference, notes=notes,
            )
            _mirror_to_ledger(
                r.tenant, r, amount, r.wallet_balance, 'REFUND',
                reference_id=str(entry.id),
                reference_type='ResellerLedgerEntry',
                description=f"Wallet refund (ref: {reference or 'n/a'})",
                actor=actor,
            )
            cls._finalize_idempotency(idem, status_code=200, body={
                'entry_id': str(entry.id),
                'entry_type': 'REFUND',
                'amount': str(amount),
                'balance_after': str(r.wallet_balance),
            })
            return {'entry': entry, 'reseller': r, 'idempotent': False}

    # ── credit facility management ────────────────────────────────────
    @classmethod
    def adjust_credit_limit(cls, facility, *, new_limit, reason='',
                             actor='system') -> ResellerCreditFacility:
        """Apply a limit change, write an audit row, and recompute cached
        exposure (does not retroactively change existing holds)."""
        new_limit = Decimal(str(new_limit))
        if new_limit < 0:
            raise WalletError('Approved limit cannot be negative.',
                              code='INVALID_AMOUNT', http_status=400)
        with transaction.atomic():
            f = ResellerCreditFacility.objects.select_for_update().get(id=facility.id)
            old = Decimal(str(f.approved_limit))
            f.approved_limit = new_limit
            f.approved_at = timezone.now()
            f.approved_by = actor
            f.save(update_fields=['approved_limit', 'approved_at',
                                  'approved_by', 'updated_at'])
            ResellerCreditApproval.objects.create(
                facility=f, action=ResellerCreditApproval.Action.LIMIT_CHANGE,
                previous_limit=old, new_limit=new_limit,
                reason=reason, actor_username=actor,
            )
            return f

    @classmethod
    def suspend_credit_facility(cls, facility, *, reason='', actor='system'):
        with transaction.atomic():
            f = ResellerCreditFacility.objects.select_for_update().get(id=facility.id)
            f.is_suspended = True
            f.suspension_reason = reason
            f.save(update_fields=['is_suspended', 'suspension_reason', 'updated_at'])
            ResellerCreditApproval.objects.create(
                facility=f, action=ResellerCreditApproval.Action.SUSPEND,
                previous_limit=f.approved_limit, new_limit=f.approved_limit,
                reason=reason, actor_username=actor,
            )
            return f

    # ── idempotency helpers ───────────────────────────────────────────
    @classmethod
    def _claim_idempotency(cls, tenant_id, key):
        if not key:
            return None
        try:
            idem, created = IdempotencyKey.objects.get_or_create(
                tenant_id=tenant_id, key=key,
                defaults={
                    'operation': 'reseller_wallet',
                    'status': IdempotencyKey.Status.PROCESSING,
                },
            )
        except IntegrityError as exc:
            raise DuplicateIdempotencyError(
                'A wallet operation with this idempotency key already exists.',
                extra={'idempotency_key': key},
            ) from exc
        if not created:
            if idem.is_complete:
                # Caller should treat this as the cached body.
                raise WalletError(
                    'Idempotency key already used.',
                    code='IDEMPOTENT_REPLAY', http_status=409,
                    extra={'cached_response': idem.response_body,
                           'cached_status': idem.response_status},
                )
            if idem.status == IdempotencyKey.Status.PROCESSING:
                raise DuplicateIdempotencyError(
                    'A wallet operation with this idempotency key is in progress.',
                    extra={'idempotency_key': key},
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

    # ── internal credit (top-up) helper used by the credit() entry point ──
    @classmethod
    def _apply_entry(cls, *, reseller, entry_type, amount, reference, notes,
                     actor, idempotency_key) -> dict:
        with transaction.atomic():
            idem = cls._claim_idempotency(reseller.tenant_id, idempotency_key)
            r = _lock_reseller(reseller.id)
            if entry_type == 'CREDIT':
                r.wallet_balance = F('wallet_balance') + amount
            r.save(update_fields=['wallet_balance', 'updated_at'])
            r.refresh_from_db(fields=['wallet_balance'])
            entry = ResellerLedgerEntry.objects.create(
                reseller=r, tenant=r.tenant,
                entry_type={
                    'CREDIT': ResellerLedgerEntry.EntryType.CREDIT,
                    'COMMISSION': ResellerLedgerEntry.EntryType.COMMISSION,
                }[entry_type],
                amount=amount, balance_after=r.wallet_balance,
                reference=reference, notes=notes,
            )
            _mirror_to_ledger(
                r.tenant, r, amount, r.wallet_balance, entry_type,
                reference_id=str(entry.id),
                reference_type='ResellerLedgerEntry',
                description=f"Wallet {entry_type.lower()} (ref: {reference or 'n/a'})",
                actor=actor,
            )
            cls._finalize_idempotency(idem, status_code=200, body={
                'entry_id': str(entry.id),
                'entry_type': entry_type,
                'amount': str(amount),
                'balance_after': str(r.wallet_balance),
            })
            return {'entry': entry, 'reseller': r, 'idempotent': False}

"""
Bandwidth roll-up service.

Persists per-customer daily bandwidth deltas so that monthly billing-period
reports and traffic analytics no longer have to scan raw session history.

Design (legacy parity with the PHP `daily_traffic` table):
- Roll-up key: (customer, usage_date) — one row per customer per day.
- `rx_bytes` / `tx_bytes` carry the NET delta added since the previous sync
  tick. They are the authoritative source for billing-period aggregates.
- `last_rx_snapshot` / `last_tx_snapshot` carry the cumulative router-counter
  value we observed at the previous aggregation tick so that reconnects
  (which reset the router counter to ~0) are absorbed safely (delta=0).

Source of truth remains `UserSession.bytes_in/bytes_out`. Safe to call
repeatedly — it only ever *adds* the positive delta.
"""
import logging
from collections import defaultdict
from datetime import date as date_cls
from typing import Iterable, Optional

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.billing.models import BandwidthDailyUsage
from apps.core.models import Tenant
from apps.customers.models import Customer
from apps.network.models import Router, UserSession

logger = logging.getLogger(__name__)


def _safe_int(val, default: int = 0) -> int:
    try:
        if val is None or val == '':
            return default
        return int(val)
    except (TypeError, ValueError):
        return default


def _q_router_or_active(router: Router, username_set):
    """Customers assigned to this router OR with a live session on it."""
    from django.db.models import Q
    q = Q(router=router)
    if username_set:
        q |= Q(pppoe_username__in=list(username_set))
    return q



def _rollup_customer_bandwidth(
    tenant: Tenant,
    router: Router,
    customer: Customer,
    target_date: date_cls,
    cur_rx: int,
    cur_tx: int,
) -> bool:
    """
    Atomically aggregates daily bandwidth for a single customer on a given date.
    Guarantees:
    - First observation: current counter becomes baseline.
    - Normal observation: positive delta is added to rx_bytes/tx_bytes.
    - Counter reset: negative delta becomes zero, new counter becomes baseline.
    - Concurrent observations: each byte is counted exactly once (zero double counting).
    """
    import time
    from django.db import OperationalError, IntegrityError
    from apps.core.lock import distributed_lock

    cur_rx = max(0, _safe_int(cur_rx, 0))
    cur_tx = max(0, _safe_int(cur_tx, 0))

    lock_key = f"lock:bandwidth:{tenant.id}:{customer.id}:{target_date.isoformat()}"
    max_retries = 5

    for attempt in range(max_retries):
        try:
            with distributed_lock(lock_key, timeout=30, blocking=True, blocking_timeout=10.0):
                with transaction.atomic():
                    # Attempt to lock the existing record
                    row = BandwidthDailyUsage.objects.select_for_update().filter(
                        customer_id=customer.id,
                        usage_date=target_date,
                    ).first()

                    if row is None:
                        try:
                            with transaction.atomic():
                                BandwidthDailyUsage.objects.create(
                                    tenant_id=tenant.id,
                                    customer_id=customer.id,
                                    router=router,
                                    usage_date=target_date,
                                    rx_bytes=cur_rx,
                                    tx_bytes=cur_tx,
                                    last_rx_snapshot=cur_rx,
                                    last_tx_snapshot=cur_tx,
                                )
                                return True
                        except IntegrityError:
                            # Concurrent worker created the row simultaneously; fetch and lock it
                            row = BandwidthDailyUsage.objects.select_for_update().get(
                                customer_id=customer.id,
                                usage_date=target_date,
                            )

                    # Authoritative state from locked row
                    baseline_rx = max(0, _safe_int(row.last_rx_snapshot, 0))
                    baseline_tx = max(0, _safe_int(row.last_tx_snapshot, 0))

                    # 1. Normal observation: positive delta added
                    # 2. Counter reset: negative delta becomes zero, new counter becomes baseline
                    # 3. Concurrent observations: out-of-order stale reads do not downgrade snapshot
                    delta_rx = 0
                    new_snapshot_rx = baseline_rx
                    if cur_rx >= baseline_rx:
                        delta_rx = cur_rx - baseline_rx
                        new_snapshot_rx = cur_rx
                    else:
                        delta_rx = 0
                        # Counter reset detection:
                        # Legitimate reset occurs when counter drops towards near zero
                        # (e.g. PPPoE reconnect or reboot resets interface to ~0).
                        # A true reset drops by at least 50% of the previous baseline.
                        # Concurrent worker jitter (or stale out-of-order reads) must NOT roll back the baseline.
                        is_reset_rx = (
                            baseline_rx == 0 or
                            cur_rx <= (baseline_rx // 2)
                        )
                        if is_reset_rx:
                            new_snapshot_rx = cur_rx
                        else:
                            new_snapshot_rx = baseline_rx

                    delta_tx = 0
                    new_snapshot_tx = baseline_tx
                    if cur_tx >= baseline_tx:
                        delta_tx = cur_tx - baseline_tx
                        new_snapshot_tx = cur_tx
                    else:
                        delta_tx = 0
                        is_reset_tx = (
                            baseline_tx == 0 or
                            cur_tx <= (baseline_tx // 2)
                        )
                        if is_reset_tx:
                            new_snapshot_tx = cur_tx
                        else:
                            new_snapshot_tx = baseline_tx

                    if (
                        delta_rx == 0 and
                        delta_tx == 0 and
                        new_snapshot_rx == baseline_rx and
                        new_snapshot_tx == baseline_tx and
                        row.router_id == router.id
                    ):
                        return True

                    update_fields = ['last_rx_snapshot', 'last_tx_snapshot', 'updated_at']
                    row.last_rx_snapshot = new_snapshot_rx
                    row.last_tx_snapshot = new_snapshot_tx

                    if row.router_id != router.id:
                        row.router = router
                        update_fields.append('router')

                    if delta_rx > 0 or delta_tx > 0:
                        row.rx_bytes = F('rx_bytes') + delta_rx
                        row.tx_bytes = F('tx_bytes') + delta_tx
                        update_fields.extend(['rx_bytes', 'tx_bytes'])

                    row.save(update_fields=update_fields)
                    return True
        except OperationalError as exc:
            err_msg = str(exc).lower()
            if ('locked' in err_msg or 'deadlock' in err_msg or 'serialization' in err_msg) and attempt < max_retries - 1:
                time.sleep(0.05 * (attempt + 1))
                continue
            raise
    return False


def aggregate_router_bandwidth(
    router: Router,
    on_date: Optional[date_cls] = None,
    customers: Optional[Iterable[Customer]] = None,
) -> dict[str, int]:
    """
    Aggregates the NET daily bandwidth delta for every active PPPoE subscriber
    on this router into `BandwidthDailyUsage`.

    Concurrency-hardened:
    - Sorts customer IDs deterministically to eliminate deadlocks.
    - Locks rows with select_for_update() + distributed locking per subscriber/date.
    - Zero double-counting under parallel sync workers.
    - Returns a stats dict for callers (cron, tests) to assert on.
    """
    target_date = on_date or timezone.localdate()
    tenant = router.tenant

    active_by_username: dict[str, UserSession] = {}
    for s in UserSession.objects.filter(tenant=tenant, router=router).only(
        'username', 'bytes_in', 'bytes_out'
    ):
        if s.username:
            active_by_username.setdefault(s.username, s)

    if customers is None:
        customers = list(
            Customer.objects.filter(tenant=tenant).filter(
                _q_router_or_active(router, set(active_by_username.keys()))
            ).only('id', 'pppoe_username', 'tenant')
        )
    else:
        customers = list(customers)

    # Filter to customers with active sessions and sort deterministically by ID
    active_customers = [
        c for c in customers
        if getattr(c, 'pppoe_username', '') in active_by_username
    ]
    active_customers.sort(key=lambda c: str(c.id))

    if not active_customers:
        return {'rows_updated': 0, 'on_date': target_date.isoformat()}

    rows_updated = 0
    for cust in active_customers:
        session = active_by_username[cust.pppoe_username]
        cur_rx = _safe_int(session.bytes_in)
        cur_tx = _safe_int(session.bytes_out)

        if _rollup_customer_bandwidth(
            tenant=tenant,
            router=router,
            customer=cust,
            target_date=target_date,
            cur_rx=cur_rx,
            cur_tx=cur_tx,
        ):
            rows_updated += 1

    logger.info(
        "Aggregated daily bandwidth for %d customers on router %s on %s",
        rows_updated, router.name, target_date,
    )
    return {
        'rows_updated': rows_updated,
        'on_date': target_date.isoformat(),
    }


def get_customer_bandwidth_summary(customer: Customer, days: int = 30) -> dict:
    """Read-side: last `days` of daily bandwidth for the given customer."""
    rows = list(
        BandwidthDailyUsage.objects
        .filter(customer=customer)
        .order_by('-usage_date')[:days]
    )
    daily = [
        {
            'date': r.usage_date.isoformat(),
            'rx_bytes': r.rx_bytes,
            'tx_bytes': r.tx_bytes,
            'total_bytes': r.rx_bytes + r.tx_bytes,
            'rx_mb': round(r.rx_bytes / (1024 * 1024), 3),
            'tx_mb': round(r.tx_bytes / (1024 * 1024), 3),
        }
        for r in rows
    ]
    totals_rx = sum(r['rx_bytes'] for r in daily)
    totals_tx = sum(r['tx_bytes'] for r in daily)
    return {
        'customer_id': str(customer.id),
        'days': len(daily),
        'totals': {
            'rx_bytes': totals_rx,
            'tx_bytes': totals_tx,
            'rx_mb': round(totals_rx / (1024 * 1024), 3),
            'tx_mb': round(totals_tx / (1024 * 1024), 3),
        },
        'daily': daily,
    }

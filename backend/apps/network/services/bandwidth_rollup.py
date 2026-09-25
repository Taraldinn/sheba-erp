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


def aggregate_router_bandwidth(
    router: Router,
    on_date: Optional[date_cls] = None,
    customers: Optional[Iterable[Customer]] = None,
) -> dict[str, int]:
    """
    Aggregates the NET daily bandwidth delta for every active PPPoE subscriber
    on this router into `BandwidthDailyUsage`.

    Returns a stats dict for callers (cron, tests) to assert on.
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

    deltas: dict = defaultdict(lambda: {'rx': 0, 'tx': 0, 'rx_snap': 0, 'tx_snap': 0})

    # Pre-fetch today's daily rows (one per customer) to use as baselines.
    existing_rows = {
        r.customer_id: r
        for r in BandwidthDailyUsage.objects.filter(
            customer__in=[c.id for c in customers],
            usage_date=target_date,
        ).only('customer_id', 'last_rx_snapshot', 'last_tx_snapshot')
    }

    for cust in customers:
        uname = getattr(cust, 'pppoe_username', '') or ''
        session = active_by_username.get(uname)
        if not session:
            continue

        cur_rx = _safe_int(session.bytes_in)
        cur_tx = _safe_int(session.bytes_out)

        prev = existing_rows.get(cust.id)
        if prev is None:
            # First observation for today (legacy `daily_traffic` parity):
            # treat the entire cumulative counter as today's running total.
            # Future ticks compute their delta from the snapshot saved here.
            deltas[cust.id]['rx'] = cur_rx
            deltas[cust.id]['tx'] = cur_tx
            deltas[cust.id]['rx_snap'] = cur_rx
            deltas[cust.id]['tx_snap'] = cur_tx
            continue

        baseline_rx = prev.last_rx_snapshot
        baseline_tx = prev.last_tx_snapshot

        # Counter resets on reconnect absorb to 0 delta (safer than negative).
        delta_rx = max(0, cur_rx - baseline_rx)
        delta_tx = max(0, cur_tx - baseline_tx)

        if delta_rx or delta_tx:
            deltas[cust.id]['rx'] = delta_rx
            deltas[cust.id]['tx'] = delta_tx
        deltas[cust.id]['rx_snap'] = cur_rx
        deltas[cust.id]['tx_snap'] = cur_tx

    if not deltas:
        return {'rows_updated': 0, 'on_date': target_date.isoformat()}

    with transaction.atomic():
        for cust_id, d in deltas.items():
            BandwidthDailyUsage.objects.update_or_create(
                customer_id=cust_id,
                usage_date=target_date,
                defaults={
                    'tenant_id': tenant.id,
                    'router': router,
                    'last_rx_snapshot': d['rx_snap'],
                    'last_tx_snapshot': d['tx_snap'],
                },
            )
            if d['rx'] or d['tx']:
                BandwidthDailyUsage.objects.filter(
                    customer_id=cust_id, usage_date=target_date
                ).update(
                    rx_bytes=F('rx_bytes') + d['rx'],
                    tx_bytes=F('tx_bytes') + d['tx'],
                )

    logger.info(
        "Aggregated daily bandwidth for %d customers on router %s on %s",
        len(deltas), router.name, target_date,
    )
    return {
        'rows_updated': len(deltas),
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

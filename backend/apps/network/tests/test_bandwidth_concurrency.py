"""
Deterministic Concurrency and Integrity Tests for BandwidthDailyUsage Roll-Up.
=============================================================================
Audits and verifies:
1. First observation baseline initialization (legacy daily_traffic parity).
2. Normal positive delta aggregation.
3. Counter reset handling (reconnect/reboot: negative delta becomes zero).
4. Concurrent worker deduplication:
   - Concurrent first observation (multiple workers inserting simultaneously).
   - Concurrent normal observations (identical counter reads).
   - Staggered concurrent observations (each byte counted exactly once).
5. Multi-customer concurrent execution without deadlocks.
6. Tenant and date isolation invariants.
"""
import concurrent.futures
import uuid
from datetime import date, timedelta
from unittest.mock import patch, MagicMock

from django.test import TransactionTestCase
from django.utils import timezone
from django.db import connection

from apps.billing.models import BandwidthDailyUsage
from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router, UserSession
from apps.network.services.bandwidth_rollup import (
    aggregate_router_bandwidth,
    get_customer_bandwidth_summary,
    _rollup_customer_bandwidth,
)


class BandwidthConcurrencyAndIntegrityTests(TransactionTestCase):
    """
    Validates atomic updates, select_for_update locking, and zero double-counting
    under concurrent execution against BandwidthDailyUsage.
    """

    def setUp(self):
        super().setUp()
        self.tenant = Tenant.objects.create(
            name="Rollup Concurrency ISP",
            slug=f"rollup-isp-{uuid.uuid4().hex[:6]}",
            domain=f"rollup-{uuid.uuid4().hex[:6]}.sheba.net"
        )
        self.router = Router.objects.create(
            tenant=self.tenant,
            name="Core-Rollup-Router",
            ip_address="10.40.40.1",
            username="admin",
            password="secretpassword"
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            router=self.router,
            customer_code=f"C-{uuid.uuid4().hex[:6]}",
            full_name="Concurrency Subscriber",
            pppoe_username="conc_sub_01",
            pppoe_password="password123",
            status=CustomerStatus.ACTIVE,
        )
        self.today = timezone.localdate()

    def _create_session(self, username: str, bytes_in: int, bytes_out: int):
        return UserSession.objects.create(
            tenant=self.tenant,
            router=self.router,
            username=username,
            ip_address="100.64.10.5",
            bytes_in=bytes_in,
            bytes_out=bytes_out,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Baseline & Counter-Reset Invariants (Single-Worker)
    # ─────────────────────────────────────────────────────────────────────────

    def test_first_observation_becomes_baseline(self):
        """
        On the very first observation for a customer on a given day,
        the current cumulative counter becomes both the initial total and the baseline.
        """
        self._create_session("conc_sub_01", bytes_in=1_000_000, bytes_out=4_000_000)

        stats = aggregate_router_bandwidth(self.router, on_date=self.today)
        self.assertEqual(stats['rows_updated'], 1)

        row = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        self.assertEqual(row.rx_bytes, 1_000_000)
        self.assertEqual(row.tx_bytes, 4_000_000)
        self.assertEqual(row.last_rx_snapshot, 1_000_000)
        self.assertEqual(row.last_tx_snapshot, 4_000_000)

    def test_normal_observation_adds_positive_delta(self):
        """
        Subsequent observations add only the positive delta (cur - baseline) to rx/tx_bytes.
        """
        session = self._create_session("conc_sub_01", bytes_in=1_000_000, bytes_out=4_000_000)
        aggregate_router_bandwidth(self.router, on_date=self.today)

        # Increment session counters
        session.bytes_in = 1_350_000
        session.bytes_out = 4_700_000
        session.save(update_fields=['bytes_in', 'bytes_out'])

        stats = aggregate_router_bandwidth(self.router, on_date=self.today)
        self.assertEqual(stats['rows_updated'], 1)

        row = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        self.assertEqual(row.rx_bytes, 1_000_000 + 350_000)
        self.assertEqual(row.tx_bytes, 4_000_000 + 700_000)
        self.assertEqual(row.last_rx_snapshot, 1_350_000)
        self.assertEqual(row.last_tx_snapshot, 4_700_000)

    def test_counter_reset_absorbs_negative_delta_to_zero(self):
        """
        When a subscriber reconnects or router restarts, session counter resets to near-zero.
        Negative delta must become zero (no bytes subtracted or corrupted).
        The new small counter becomes the new baseline.
        """
        session = self._create_session("conc_sub_01", bytes_in=5_000_000, bytes_out=10_000_000)
        aggregate_router_bandwidth(self.router, on_date=self.today)

        row_before = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        self.assertEqual(row_before.rx_bytes, 5_000_000)
        self.assertEqual(row_before.tx_bytes, 10_000_000)

        # Simulate reconnect reset: counters drop to 50_000 / 100_000
        session.bytes_in = 50_000
        session.bytes_out = 100_000
        session.save(update_fields=['bytes_in', 'bytes_out'])

        aggregate_router_bandwidth(self.router, on_date=self.today)

        row_reset = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        # Total bytes must remain unchanged (delta=0)
        self.assertEqual(row_reset.rx_bytes, 5_000_000)
        self.assertEqual(row_reset.tx_bytes, 10_000_000)
        # Snapshot is now the new baseline
        self.assertEqual(row_reset.last_rx_snapshot, 50_000)
        self.assertEqual(row_reset.last_tx_snapshot, 100_000)

        # Subsequent traffic after reset adds normal delta from new baseline
        session.bytes_in = 80_000
        session.bytes_out = 150_000
        session.save(update_fields=['bytes_in', 'bytes_out'])

        aggregate_router_bandwidth(self.router, on_date=self.today)

        row_after = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        self.assertEqual(row_after.rx_bytes, 5_000_000 + (80_000 - 50_000))
        self.assertEqual(row_after.tx_bytes, 10_000_000 + (150_000 - 100_000))
        self.assertEqual(row_after.last_rx_snapshot, 80_000)
        self.assertEqual(row_after.last_tx_snapshot, 150_000)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Concurrency: First Observation Race
    # ─────────────────────────────────────────────────────────────────────────

    def test_concurrent_first_observation_no_double_counting(self):
        """
        Multiple workers run aggregate_router_bandwidth at the exact same moment
        when NO row exists yet for today.
        Every worker observes cur_rx=1_000_000, cur_tx=4_000_000.
        Result: exactly 1 row created, rx_bytes=1_000_000 (NOT 4_000_000 or 5_000_000).
        """
        self._create_session("conc_sub_01", bytes_in=1_000_000, bytes_out=4_000_000)

        num_workers = 4
        router_id = self.router.id
        target_date = self.today

        def worker_task():
            connection.close()
            r = Router.objects.get(id=router_id)
            return aggregate_router_bandwidth(r, on_date=target_date)

        with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
            futures = [executor.submit(worker_task) for _ in range(num_workers)]
            results = [f.result() for f in futures]

        # Verify only 1 row exists
        rows = list(BandwidthDailyUsage.objects.filter(customer=self.customer, usage_date=self.today))
        self.assertEqual(len(rows), 1)

        row = rows[0]
        # Must be exactly 1_000_000 / 4_000_000, zero double-counting
        self.assertEqual(row.rx_bytes, 1_000_000)
        self.assertEqual(row.tx_bytes, 4_000_000)
        self.assertEqual(row.last_rx_snapshot, 1_000_000)
        self.assertEqual(row.last_tx_snapshot, 4_000_000)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Concurrency: Simultaneous Identical Observations
    # ─────────────────────────────────────────────────────────────────────────

    def test_concurrent_identical_observations_no_double_counting(self):
        """
        Row already exists with baseline 1_000_000 / 4_000_000.
        Session moves to 1_500_000 / 5_500_000 (delta: 500k / 1.5M).
        4 workers concurrently run aggregate_router_bandwidth.
        Result: rx_bytes = 1_500_000 (delta added ONCE, not 4 times).
        """
        session = self._create_session("conc_sub_01", bytes_in=1_000_000, bytes_out=4_000_000)
        aggregate_router_bandwidth(self.router, on_date=self.today)

        # Update session
        session.bytes_in = 1_500_000
        session.bytes_out = 5_500_000
        session.save(update_fields=['bytes_in', 'bytes_out'])

        num_workers = 4
        router_id = self.router.id
        target_date = self.today

        def worker_task():
            connection.close()
            r = Router.objects.get(id=router_id)
            return aggregate_router_bandwidth(r, on_date=target_date)

        with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
            futures = [executor.submit(worker_task) for _ in range(num_workers)]
            results = [f.result() for f in futures]

        row = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        self.assertEqual(row.rx_bytes, 1_500_000)
        self.assertEqual(row.tx_bytes, 5_500_000)
        self.assertEqual(row.last_rx_snapshot, 1_500_000)
        self.assertEqual(row.last_tx_snapshot, 5_500_000)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Concurrency: Multi-Customer Parallel Aggregation (No Deadlocks)
    # ─────────────────────────────────────────────────────────────────────────

    def test_concurrent_multi_customer_aggregation(self):
        """
        Multiple active subscribers on the same router synced concurrently
        by parallel workers without deadlocks or cross-customer state corruption.
        """
        customers = []
        for i in range(5):
            c = Customer.objects.create(
                tenant=self.tenant,
                router=self.router,
                customer_code=f"C-MULTI-{i}",
                full_name=f"Subscriber {i}",
                pppoe_username=f"sub_multi_{i}",
                status=CustomerStatus.ACTIVE,
            )
            self._create_session(f"sub_multi_{i}", bytes_in=100_000 * (i + 1), bytes_out=200_000 * (i + 1))
            customers.append(c)

        router_id = self.router.id
        target_date = self.today

        def worker_task():
            connection.close()
            r = Router.objects.get(id=router_id)
            return aggregate_router_bandwidth(r, on_date=target_date)

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(worker_task) for _ in range(3)]
            results = [f.result() for f in futures]

        # Verify all 5 customers have accurate usage recorded
        for i, c in enumerate(customers):
            row = BandwidthDailyUsage.objects.get(customer=c, usage_date=self.today)
            expected_rx = 100_000 * (i + 1)
            expected_tx = 200_000 * (i + 1)
            self.assertEqual(row.rx_bytes, expected_rx)
            self.assertEqual(row.tx_bytes, expected_tx)
            self.assertEqual(row.last_rx_snapshot, expected_rx)
            self.assertEqual(row.last_tx_snapshot, expected_tx)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Concurrency: Staggered Advancing Observations (Exact Byte Counting)
    # ─────────────────────────────────────────────────────────────────────────

    def test_staggered_concurrent_observations_exact_byte_counting(self):
        """
        4 parallel workers invoke aggregation with staggered advancing counters:
        Worker 1: 1.2M / 4.5M
        Worker 2: 1.5M / 5.2M
        Worker 3: 1.8M / 6.0M
        Worker 4: 2.0M / 7.0M
        Regardless of the order or concurrency, final rx_bytes must be exactly 2.0M
        and tx_bytes exactly 7.0M (zero double-counting).
        """
        session = self._create_session("conc_sub_01", bytes_in=1_000_000, bytes_out=4_000_000)
        aggregate_router_bandwidth(self.router, on_date=self.today)

        staggered_reads = [
            (1_200_000, 4_500_000),
            (1_500_000, 5_200_000),
            (1_800_000, 6_000_000),
            (2_000_000, 7_000_000),
        ]

        customer_id = self.customer.id
        router_id = self.router.id
        tenant_id = self.tenant.id
        target_date = self.today

        def worker_task(rx_val, tx_val):
            connection.close()
            t = Tenant.objects.get(id=tenant_id)
            r = Router.objects.get(id=router_id)
            c = Customer.objects.get(id=customer_id)
            return _rollup_customer_bandwidth(
                tenant=t,
                router=r,
                customer=c,
                target_date=target_date,
                cur_rx=rx_val,
                cur_tx=tx_val,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(worker_task, rx, tx) for rx, tx in staggered_reads]
            results = [f.result() for f in futures]

        row = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        self.assertEqual(row.rx_bytes, 2_000_000)
        self.assertEqual(row.tx_bytes, 7_000_000)
        self.assertEqual(row.last_rx_snapshot, 2_000_000)
        self.assertEqual(row.last_tx_snapshot, 7_000_000)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Concurrency: Out-Of-Order Snapshot Downgrade Protection
    # ─────────────────────────────────────────────────────────────────────────

    def test_out_of_order_snapshot_downgrade_protection(self):
        """
        Verifies that an older, delayed worker observing 1,800,000 does NOT roll back
        last_rx_snapshot when a faster worker has already committed 2,000,000.
        A subsequent reading of 2,100,000 must add only 100,000 (not 300,000).
        """
        self._create_session("conc_sub_01", bytes_in=1_000_000, bytes_out=4_000_000)
        aggregate_router_bandwidth(self.router, on_date=self.today)

        # Worker A commits 2.0M first
        _rollup_customer_bandwidth(
            tenant=self.tenant,
            router=self.router,
            customer=self.customer,
            target_date=self.today,
            cur_rx=2_000_000,
            cur_tx=7_000_000,
        )

        row_after_a = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        self.assertEqual(row_after_a.rx_bytes, 2_000_000)
        self.assertEqual(row_after_a.last_rx_snapshot, 2_000_000)

        # Worker B (delayed from earlier) arrives with 1.8M
        _rollup_customer_bandwidth(
            tenant=self.tenant,
            router=self.router,
            customer=self.customer,
            target_date=self.today,
            cur_rx=1_800_000,
            cur_tx=6_500_000,
        )

        row_after_b = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        # Snapshot must NOT have been rolled back to 1.8M
        self.assertEqual(row_after_b.rx_bytes, 2_000_000)
        self.assertEqual(row_after_b.last_rx_snapshot, 2_000_000)

        # Worker C arrives with 2.1M
        _rollup_customer_bandwidth(
            tenant=self.tenant,
            router=self.router,
            customer=self.customer,
            target_date=self.today,
            cur_rx=2_100_000,
            cur_tx=7_200_000,
        )

        row_after_c = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        # Exactly 100k delta added, NOT 300k
        self.assertEqual(row_after_c.rx_bytes, 2_100_000)
        self.assertEqual(row_after_c.last_rx_snapshot, 2_100_000)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Concurrency: Counter Reset Race under Parallel Execution
    # ─────────────────────────────────────────────────────────────────────────

    def test_concurrent_counter_reset_and_reconnect_race(self):
        """
        Simulates parallel workers running during a reconnect counter reset:
        Initial baseline: 10,000,000 / 20,000,000.
        User reconnects, counter drops to 50,000 / 100,000.
        Concurrent workers query during and after reset:
        - Worker 1 & 2 observe reset counter 50k / 100k
        - Worker 3 observes post-reset counter 80k / 150k
        Negative delta becomes zero, baseline resets, delta 30k/50k added.
        Final: 10,030,000 / 20,050,000.
        """
        self._create_session("conc_sub_01", bytes_in=10_000_000, bytes_out=20_000_000)
        aggregate_router_bandwidth(self.router, on_date=self.today)

        # Phase 1: Multiple workers observe the reconnect counter-reset simultaneously
        reset_readings = [
            (50_000, 100_000),
            (50_000, 100_000),
        ]

        customer_id = self.customer.id
        router_id = self.router.id
        tenant_id = self.tenant.id
        target_date = self.today

        def worker_task(rx_val, tx_val):
            connection.close()
            t = Tenant.objects.get(id=tenant_id)
            r = Router.objects.get(id=router_id)
            c = Customer.objects.get(id=customer_id)
            return _rollup_customer_bandwidth(
                tenant=t,
                router=r,
                customer=c,
                target_date=target_date,
                cur_rx=rx_val,
                cur_tx=tx_val,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(worker_task, rx, tx) for rx, tx in reset_readings]
            results = [f.result() for f in futures]

        row_reset = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        self.assertEqual(row_reset.rx_bytes, 10_000_000)
        self.assertEqual(row_reset.tx_bytes, 20_000_000)
        self.assertEqual(row_reset.last_rx_snapshot, 50_000)
        self.assertEqual(row_reset.last_tx_snapshot, 100_000)

        # Phase 2: Concurrent workers observe post-reset traffic increase simultaneously
        traffic_readings = [
            (80_000, 150_000),
            (80_000, 150_000),
        ]

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(worker_task, rx, tx) for rx, tx in traffic_readings]
            results = [f.result() for f in futures]

        row_final = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        # Exactly +30k RX and +50k TX added from baseline (zero double counting)
        self.assertEqual(row_final.rx_bytes, 10_000_000 + 30_000)
        self.assertEqual(row_final.tx_bytes, 20_000_000 + 50_000)
        self.assertEqual(row_final.last_rx_snapshot, 80_000)
        self.assertEqual(row_final.last_tx_snapshot, 150_000)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Date and Midnight Boundary Isolation
    # ─────────────────────────────────────────────────────────────────────────

    def test_date_isolation_and_midnight_boundary(self):
        """
        Usage aggregated across a date boundary (e.g. yesterday vs today)
        creates isolated rows with distinct snapshots and baselines.
        """
        yesterday = self.today - timedelta(days=1)
        session = self._create_session("conc_sub_01", bytes_in=5_000_000, bytes_out=10_000_000)

        # Yesterday's rollup
        aggregate_router_bandwidth(self.router, on_date=yesterday)
        y_row = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=yesterday)
        self.assertEqual(y_row.rx_bytes, 5_000_000)
        self.assertEqual(y_row.tx_bytes, 10_000_000)

        # Session continues past midnight to 6_500_000 / 12_000_000
        session.bytes_in = 6_500_000
        session.bytes_out = 12_000_000
        session.save(update_fields=['bytes_in', 'bytes_out'])

        # Today's rollup
        aggregate_router_bandwidth(self.router, on_date=self.today)
        t_row = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        # Today's first observation sets baseline to 6.5M / 12M
        self.assertEqual(t_row.rx_bytes, 6_500_000)
        self.assertEqual(t_row.tx_bytes, 12_000_000)

        # Ensure yesterday's row remains untouched
        y_row.refresh_from_db()
        self.assertEqual(y_row.rx_bytes, 5_000_000)
        self.assertEqual(y_row.tx_bytes, 10_000_000)

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Disconnect & Carrier Drop Bandwidth Preservation
    # ─────────────────────────────────────────────────────────────────────────

    @patch('apps.network.services.live_sessions.MikroTikService')
    def test_stale_session_disconnect_preserves_bandwidth(self, mock_mikrotik_cls):
        """
        When a subscriber drops carrier, LiveSessionService.sync_router_live_sessions
        must roll up their closing bandwidth delta before deleting the UserSession record.
        """
        from apps.network.services.live_sessions import LiveSessionService
        from apps.network.models import UserSessionHistory

        # Initial active session: 1,000,000 / 2,000,000
        mock_svc = MagicMock()
        mock_mikrotik_cls.return_value = mock_svc
        mock_svc.get_active_sessions.return_value = [
            {
                'name': 'conc_sub_01',
                'address': '100.64.10.5',
                'caller-id': '00:11:22:33:44:55',
                'uptime': '1h',
                'bytes-in': 1_000_000,
                'bytes-out': 2_000_000,
            }
        ]

        count = LiveSessionService.sync_router_live_sessions(self.router)
        self.assertEqual(count, 1)

        row = BandwidthDailyUsage.objects.get(customer=self.customer, usage_date=self.today)
        self.assertEqual(row.rx_bytes, 1_000_000)
        self.assertEqual(row.tx_bytes, 2_000_000)

        # User transfers 500k/1M more, then disconnects: router returns empty session list
        UserSession.objects.filter(username='conc_sub_01').update(
            bytes_in=1_500_000, bytes_out=3_000_000
        )
        mock_svc.get_active_sessions.return_value = []

        count_after = LiveSessionService.sync_router_live_sessions(self.router)
        self.assertEqual(count_after, 0)

        # Bandwidth row must have rolled up the final 500k / 1M delta!
        row.refresh_from_db()
        self.assertEqual(row.rx_bytes, 1_500_000)
        self.assertEqual(row.tx_bytes, 3_000_000)

        # Session was deleted and archived to history
        self.assertFalse(UserSession.objects.filter(username='conc_sub_01').exists())
        self.assertTrue(UserSessionHistory.objects.filter(username='conc_sub_01').exists())

    # ─────────────────────────────────────────────────────────────────────────
    # 10. Database Constraints: Check Non-Negative Bytes
    # ─────────────────────────────────────────────────────────────────────────

    def test_check_constraint_enforces_non_negative_bytes(self):
        """Database constraint rejects negative rx_bytes or tx_bytes."""
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            BandwidthDailyUsage.objects.create(
                tenant=self.tenant,
                customer=self.customer,
                router=self.router,
                usage_date=self.today + timedelta(days=10),
                rx_bytes=-100,
                tx_bytes=1000,
            )

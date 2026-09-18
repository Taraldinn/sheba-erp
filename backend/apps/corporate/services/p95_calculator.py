import math
import logging
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.corporate.models import (
    CorporateBillingPeriod,
    CorporateTrafficSample,
    PeriodCalculationStatus,
    AggregationPolicy,
)

logger = logging.getLogger('corporate.p95')

BPS_TO_MBPS = Decimal('1000000')


class P95CalculationEngine:
    """
    Deterministic 95th-percentile (p95) bandwidth calculation engine for Corporate circuits.
    Calculates aggregated multi-circuit throughput, enforces the 80% coverage quality gate,
    and computes burst overage charges against contracted CIR.
    """

    @classmethod
    @transaction.atomic
    def calculate_period(
        cls,
        period: CorporateBillingPeriod,
        min_coverage_ratio: float = 0.80
    ) -> CorporateBillingPeriod:
        """
        Executes p95 calculation for a given billing period.
        """
        period_locked = CorporateBillingPeriod.objects.select_for_update().get(id=period.id)

        if period_locked.status in [PeriodCalculationStatus.FINALIZED, PeriodCalculationStatus.INVOICED]:
            raise ValidationError(f"Cannot recalculate period {period_locked.id} in status {period_locked.status}.")

        period_locked.status = PeriodCalculationStatus.CALCULATING
        period_locked.save(update_fields=['status'])

        cust = period_locked.corporate_customer
        tenant = period_locked.tenant
        start = period_locked.period_start
        end = period_locked.period_end

        # Calculate expected sample count based on 5-minute (300-second) intervals
        total_seconds = (end - start).total_seconds()
        if total_seconds <= 0:
            raise ValidationError("Invalid billing period duration: end time must be after start time.")

        expected_buckets = max(1, int(total_seconds // 300))

        # Retrieve traffic samples for customer's connections
        samples = CorporateTrafficSample.objects.filter(
            tenant=tenant,
            connection__corporate_customer=cust,
            timestamp__gte=start,
            timestamp__lt=end
        ).select_related('connection')

        # Group samples into discrete 5-minute timestamp buckets
        # Bucket key: rounded to 300-second epoch
        bucket_inbound = defaultdict(int)
        bucket_outbound = defaultdict(int)
        bucket_timestamps = set()

        for s in samples:
            epoch = int(s.timestamp.timestamp())
            bucket_key = epoch - (epoch % 300)
            bucket_timestamps.add(bucket_key)
            bucket_inbound[bucket_key] += s.inbound_bps
            bucket_outbound[bucket_key] += s.outbound_bps

        actual_buckets = len(bucket_timestamps)
        coverage_ratio = actual_buckets / expected_buckets
        coverage_percent = (Decimal(str(coverage_ratio)) * Decimal('100')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

        period_locked.total_samples = actual_buckets
        period_locked.coverage_percent = coverage_percent

        # Quality Gate: Coverage must be >= min_coverage_ratio (default 80%)
        if coverage_ratio < min_coverage_ratio:
            period_locked.status = PeriodCalculationStatus.INSUFFICIENT_DATA
            period_locked.calculation_metadata = {
                'expected_buckets': expected_buckets,
                'actual_buckets': actual_buckets,
                'coverage_ratio': float(coverage_ratio),
                'gate_error': f"Coverage {coverage_percent}% is below required {int(min_coverage_ratio * 100)}% gate.",
            }
            period_locked.save(update_fields=['total_samples', 'coverage_percent', 'status', 'calculation_metadata'])
            logger.warning(
                "Billing period %s failed 80%% coverage gate: %d/%d (%.2f%%)",
                period_locked.id, actual_buckets, expected_buckets, coverage_percent
            )
            return period_locked

        if actual_buckets == 0:
            period_locked.status = PeriodCalculationStatus.INSUFFICIENT_DATA
            period_locked.save(update_fields=['total_samples', 'coverage_percent', 'status'])
            return period_locked

        # Build metric series
        # Bucket metric = max(inbound_bps, outbound_bps)
        billable_series = []
        inbound_series = []
        outbound_series = []

        for b_ts in sorted(bucket_timestamps):
            in_bps = bucket_inbound[b_ts]
            out_bps = bucket_outbound[b_ts]
            billable_series.append(max(in_bps, out_bps))
            inbound_series.append(in_bps)
            outbound_series.append(out_bps)

        billable_series.sort()
        inbound_series.sort()
        outbound_series.sort()

        # Deterministic 95th-percentile rank index: ceil(0.95 * N) - 1
        p95_rank_index = math.ceil(0.95 * actual_buckets) - 1
        p95_rank_index = max(0, min(p95_rank_index, actual_buckets - 1))

        p95_billable_bps = billable_series[p95_rank_index]
        p95_inbound_bps = inbound_series[p95_rank_index]
        p95_outbound_bps = outbound_series[p95_rank_index]

        p95_billable_mbps = (Decimal(p95_billable_bps) / BPS_TO_MBPS).quantize(
            Decimal('0.001'), rounding=ROUND_HALF_UP
        )
        p95_inbound_mbps = (Decimal(p95_inbound_bps) / BPS_TO_MBPS).quantize(
            Decimal('0.001'), rounding=ROUND_HALF_UP
        )
        p95_outbound_mbps = (Decimal(p95_outbound_bps) / BPS_TO_MBPS).quantize(
            Decimal('0.001'), rounding=ROUND_HALF_UP
        )

        # Burst overage and financial calculation
        committed_cir = cust.committed_bandwidth_mbps
        burst_mbps = max(Decimal('0.000'), p95_billable_mbps - Decimal(committed_cir))
        burst_rate = cust.burst_rate_per_mbps
        base_fee = cust.base_monthly_fee
        burst_charge = (burst_mbps * burst_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        total_payable = (base_fee + burst_charge).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        period_locked.p95_inbound_mbps = p95_inbound_mbps
        period_locked.p95_outbound_mbps = p95_outbound_mbps
        period_locked.p95_billable_mbps = p95_billable_mbps
        period_locked.committed_mbps = committed_cir
        period_locked.burst_mbps = burst_mbps
        period_locked.burst_rate_per_mbps = burst_rate
        period_locked.base_charge = base_fee
        period_locked.burst_charge = burst_charge
        period_locked.total_payable = total_payable
        period_locked.status = PeriodCalculationStatus.CALCULATED
        period_locked.calculated_at = timezone.now()
        period_locked.calculation_metadata = {
            'expected_buckets': expected_buckets,
            'actual_buckets': actual_buckets,
            'p95_rank_index': p95_rank_index,
            'top_5_percent_samples_dropped': actual_buckets - (p95_rank_index + 1),
            'p95_billable_bps': p95_billable_bps,
            'burst_mbps': str(burst_mbps),
        }

        period_locked.save(update_fields=[
            'total_samples', 'coverage_percent',
            'p95_inbound_mbps', 'p95_outbound_mbps', 'p95_billable_mbps',
            'committed_mbps', 'burst_mbps', 'burst_rate_per_mbps',
            'base_charge', 'burst_charge', 'total_payable',
            'status', 'calculated_at', 'calculation_metadata'
        ])

        logger.info(
            "Calculated p95 for %s [%s]: P95=%.3f Mbps (CIR=%d, Burst=%.3f, Payable=%.2f)",
            cust.company_name, period_locked.id, p95_billable_mbps,
            committed_cir, burst_mbps, total_payable
        )
        return period_locked

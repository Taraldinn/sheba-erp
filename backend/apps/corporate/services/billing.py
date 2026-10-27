import uuid
import datetime
import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.billing.models import Invoice
from apps.finance.services import create_invoice_with_lines
from apps.corporate.models import (
    CorporateBillingPeriod,
    PeriodCalculationStatus,
)
from apps.corporate.services.p95_calculator import P95CalculationEngine

logger = logging.getLogger('corporate.billing')


class CorporateBillingService:
    """
    Manages Corporate invoicing and financial integration.
    Generates itemized invoices adhering to single-ledger truth:
    Base contracted fee line + 95th-percentile burst overage line.
    """

    @classmethod
    @transaction.atomic
    def finalize_period_and_invoice(
        cls,
        period: CorporateBillingPeriod,
        actor_username: str = 'system'
    ) -> Invoice:
        """
        Finalizes a corporate billing period, locks the calculation,
        and generates an itemized Invoice linked to finance.LedgerEntry.
        """
        period_locked = CorporateBillingPeriod.objects.select_for_update().get(id=period.id)

        if period_locked.status == PeriodCalculationStatus.INVOICED:
            if period_locked.invoice:
                return period_locked.invoice
            raise ValidationError(f"Billing period {period_locked.id} is already invoiced.")

        if period_locked.status == PeriodCalculationStatus.OPEN:
            period_locked = P95CalculationEngine.calculate_period(period_locked)

        if period_locked.status == PeriodCalculationStatus.INSUFFICIENT_DATA:
            raise ValidationError(
                f"Cannot invoice billing period {period_locked.id}: "
                f"Insufficient sample coverage ({period_locked.coverage_percent}% < 80%). "
                "Manual review or SLA adjustment required."
            )

        if period_locked.status != PeriodCalculationStatus.CALCULATED:
            raise ValidationError(
                f"Cannot invoice billing period {period_locked.id} with status {period_locked.status}."
            )

        tenant = period_locked.tenant
        corp_cust = period_locked.corporate_customer
        base_cust = corp_cust.customer

        start_str = period_locked.period_start.strftime('%Y-%m-%d')
        end_str = period_locked.period_end.strftime('%Y-%m-%d')
        month_str = period_locked.period_start.strftime('%B %Y')

        # Prepare itemized lines
        lines_data = [
            {
                'description': f"Corporate Base CIR ({period_locked.committed_mbps} Mbps) - {start_str} to {end_str}",
                'quantity': Decimal('1.00'),
                'unit_price': period_locked.base_charge,
                'discount': Decimal('0.00'),
                'tax_amount': Decimal('0.00'),
                'total': period_locked.base_charge,
            }
        ]

        if period_locked.burst_mbps > Decimal('0.000') and period_locked.burst_charge > Decimal('0.00'):
            lines_data.append({
                'description': (
                    f"95th Percentile Burst Overage ({period_locked.burst_mbps} Mbps @ "
                    f"{period_locked.burst_rate_per_mbps}/Mbps)"
                ),
                'quantity': period_locked.burst_mbps,
                'unit_price': period_locked.burst_rate_per_mbps,
                'discount': Decimal('0.00'),
                'tax_amount': Decimal('0.00'),
                'total': period_locked.burst_charge,
            })

        credit_days = corp_cust.credit_terms_days or 30
        due_date = period_locked.period_end.date() + datetime.timedelta(days=credit_days)
        inv_no = f"CORP-INV-{period_locked.period_start.strftime('%y%m')}-{uuid.uuid4().hex[:6].upper()}"

        invoice = create_invoice_with_lines(
            tenant=tenant,
            customer=base_cust,
            lines_data=lines_data,
            billing_month=month_str,
            due_date=due_date,
            package_name=f"Enterprise CIR ({corp_cust.company_name})",
            invoice_no=inv_no,
            package_amount=period_locked.total_payable,
            total_payable=period_locked.total_payable,
            actor_username=actor_username,
        )

        period_locked.invoice = invoice
        period_locked.status = PeriodCalculationStatus.INVOICED
        period_locked.finalized_at = timezone.now()
        period_locked.save(update_fields=['invoice', 'status', 'finalized_at'])

        logger.info(
            "Created Corporate Invoice #%s for %s (%s): Base=%.2f, Burst=%.2f, Total=%.2f",
            invoice.invoice_no, corp_cust.company_name, month_str,
            period_locked.base_charge, period_locked.burst_charge, period_locked.total_payable
        )
        return invoice

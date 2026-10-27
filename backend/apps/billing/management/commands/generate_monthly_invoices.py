import uuid
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Invoice


class Command(BaseCommand):
    help = 'Generates monthly recurring billing invoices for all active customers.'

    def add_arguments(self, parser):
        parser.add_argument('--month', type=str, help='Target billing month (e.g. "September 2026"). Defaults to current month.')
        parser.add_argument('--dry-run', action='store_true', help='Simulate generation without writing records to DB.')

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        now = timezone.now()
        billing_month = options.get('month') or now.strftime('%B %Y')

        customers = Customer.objects.filter(
            status__in=[CustomerStatus.ACTIVE, CustomerStatus.EXPIRED]
        ).select_related('tenant', 'package')

        created_count = 0
        skipped_count = 0

        self.stdout.write(self.style.NOTICE(f"Generating invoices for {billing_month} across {customers.count()} customers."))

        for customer in customers:
            # Check if invoice already exists for this customer + month
            existing = Invoice.objects.filter(
                customer=customer,
                billing_month=billing_month
            ).exists()

            if existing:
                skipped_count += 1
                continue

            if dry_run:
                self.stdout.write(f"[DRY RUN] Would generate invoice for {customer.pppoe_username} (৳{customer.monthly_bill})")
                created_count += 1
                continue

            with transaction.atomic():
                package_name = customer.package.name if customer.package else 'Custom Plan'
                package_amount = customer.monthly_bill
                previous_due = customer.due_amount
                total_payable = package_amount + previous_due - customer.discount
                invoice_no = f"INV-{now.strftime('%y%m')}-{str(uuid.uuid4())[:6].upper()}"

                Invoice.objects.create(
                    tenant=customer.tenant,
                    customer=customer,
                    invoice_no=invoice_no,
                    billing_month=billing_month,
                    package_name=package_name,
                    package_amount=package_amount,
                    previous_due=previous_due,
                    discount=customer.discount,
                    total_payable=total_payable,
                    paid_amount=0.00,
                    due_amount=total_payable,
                    status=Invoice.InvoiceStatus.UNPAID,
                    due_date=now.date() + timezone.timedelta(days=10)
                )
                created_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Completed invoice generation for {billing_month}: {created_count} created, {skipped_count} skipped (already billed)."
        ))

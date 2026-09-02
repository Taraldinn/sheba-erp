from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import UserSession
from apps.core.models import AuditLog


class Command(BaseCommand):
    help = 'Auto-locks expired customers and clears active router PPPoE sessions.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview accounts to lock without changing database.')

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        today = timezone.now().date()

        expired_customers = Customer.objects.filter(
            status=CustomerStatus.ACTIVE,
            auto_lock_enabled=True,
            expiry_date__lt=today
        ).select_related('tenant')

        count = expired_customers.count()
        self.stdout.write(self.style.NOTICE(f"Found {count} expired active customer(s) to process as of {today}."))

        if dry_run:
            for cust in expired_customers:
                self.stdout.write(f"[DRY RUN] Would lock: {cust.pppoe_username} (Expired: {cust.expiry_date})")
            return

        locked_count = 0
        for customer in expired_customers:
            with transaction.atomic():
                locked_cust = Customer.objects.select_for_update().get(id=customer.id)
                locked_cust.status = CustomerStatus.EXPIRED
                locked_cust.save(update_fields=['status', 'updated_at'])

                # Terminate active PPPoE router session
                UserSession.objects.filter(username=locked_cust.pppoe_username).delete()

                AuditLog.objects.create(
                    tenant=locked_cust.tenant,
                    actor_username='CRON_EXPIRY_ENGINE',
                    action='AUTO_LOCK_EXPIRED',
                    module='CUSTOMERS',
                    target_id=str(locked_cust.id),
                    details={
                        'pppoe_username': locked_cust.pppoe_username,
                        'expiry_date': str(locked_cust.expiry_date),
                        'status': CustomerStatus.EXPIRED
                    }
                )
                locked_count += 1
                self.stdout.write(f"Locked expired account: {locked_cust.pppoe_username}")

        self.stdout.write(self.style.SUCCESS(f"Successfully processed and locked {locked_count} expired subscriber(s)."))

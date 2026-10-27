"""
backfill_platform_admins — Phase 4.1 of the SaaS Owner Admin Panel plan.

For every existing Django user with is_superuser=True, create a
PlatformAdmin(role=OWNER, is_active=True) row. The user can keep using
the legacy is_superuser shortcut; the PlatformAdmin row just ensures they
also pass the new IsCentralOrPlatformAdmin gate.

This is a one-shot migration script intended to run once during the
Week 2 cutover (see plan §Phase 4). Safe to re-run: already-backed-up
rows are skipped.

Usage:
    python manage.py backfill_platform_admins
    python manage.py backfill_platform_admins --dry-run
    python manage.py backfill_platform_admins --role=ADMIN  # if you want non-OWNER default
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from apps.authentication.models import PlatformAdmin, PlatformAdminRole


class Command(BaseCommand):
    help = "Create a PlatformAdmin(OWNER) row for every existing Django superuser."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would happen without writing anything',
        )
        parser.add_argument(
            '--role',
            choices=[r.value for r in PlatformAdminRole],
            default=PlatformAdminRole.OWNER.value,
            help='Default role to assign to backfilled rows (default: OWNER)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        default_role = options['role']

        supers = User.objects.filter(is_superuser=True).order_by('id')
        total = supers.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("No superusers found. Nothing to backfill."))
            return

        created = 0
        skipped = 0
        for user in supers:
            existing = PlatformAdmin.objects.filter(user=user).first()
            if existing is not None:
                if not existing.is_active:
                    self.stdout.write(f"  {user.username}: existing PA is_active=False, leaving alone")
                else:
                    self.stdout.write(f"  {user.username}: PA already exists (role={existing.role})")
                skipped += 1
                continue
            self.stdout.write(
                f"  {user.username}: create PlatformAdmin(role={default_role}, is_active=True)"
            )
            if not dry_run:
                PlatformAdmin.objects.create(
                    user=user,
                    role=default_role,
                    is_active=True,
                    invited_by=None,
                    invited_at=None,
                )
            created += 1

        verb = "Would create" if dry_run else "Created"
        self.stdout.write(self.style.SUCCESS(
            f"\n{verb} {created} PlatformAdmin row(s); skipped {skipped} existing; "
            f"of {total} superuser(s) total."
        ))
        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run — no rows were written."))

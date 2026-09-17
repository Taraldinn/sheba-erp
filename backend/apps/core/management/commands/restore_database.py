"""
Database Restore Management Command (Stage 10 / S10.12).
Restores a verified compressed database backup.
"""

import os
import gzip
import shutil
import tempfile
from django.core.management.base import BaseCommand, CommandError
from django.core.management import call_command
from django.db import transaction


class Command(BaseCommand):
    help = 'Restores a verified database backup archive with safety confirmations.'

    def add_arguments(self, parser):
        parser.add_argument(
            'backup_file',
            type=str,
            help='Path to the backup archive (.json.gz or .json) to restore.',
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            default=False,
            help='Bypasses the interactive confirmation prompt.',
        )

    def handle(self, *args, **options):
        backup_file = options['backup_file']
        confirm = options['confirm']

        if not os.path.exists(backup_file):
            raise CommandError(f"Backup file not found: {backup_file}")

        if not confirm:
            self.stdout.write(
                self.style.WARNING(
                    f"WARNING: Restoring will overwrite existing records in the database!\n"
                    f"Target backup: {backup_file}\n"
                    f"Type 'YES' to proceed with database restoration: "
                ),
                ending='',
            )
            val = input()
            if val.strip() != 'YES':
                self.stdout.write(self.style.NOTICE("Restoration cancelled."))
                return

        self.stdout.write(self.style.NOTICE("Decompressing backup archive..."))

        temp_dir = tempfile.mkdtemp()
        temp_json = os.path.join(temp_dir, 'restore_payload.json')

        try:
            if backup_file.endswith('.gz'):
                with gzip.open(backup_file, 'rb') as f_in, open(temp_json, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            else:
                shutil.copy(backup_file, temp_json)

            self.stdout.write(self.style.NOTICE("Loading database records..."))

            with transaction.atomic():
                call_command('loaddata', temp_json)

            self.stdout.write(self.style.SUCCESS("Database restoration completed successfully."))

        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"Restoration failed: {str(exc)}"))
            raise exc
        finally:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)

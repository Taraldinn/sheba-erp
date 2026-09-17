"""
Database Backup Management Command (Stage 10 / S10.12).
Executes a compressed, checksum-verified backup of the shared database.
"""

import os
import gzip
import hashlib
import shutil
import subprocess
from datetime import datetime
from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.conf import settings
from apps.core.models import DatabaseBackup


class Command(BaseCommand):
    help = 'Executes a compressed database backup with SHA-256 checksum and tracking.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--output-dir',
            type=str,
            default=str(settings.BASE_DIR / 'backups'),
            help='Directory where the backup archive will be written.',
        )
        parser.add_argument(
            '--backup-type',
            type=str,
            default='full_database',
            choices=['full_database', 'tenant_data'],
            help='Type of backup to generate.',
        )
        parser.add_argument(
            '--note',
            type=str,
            default='Automated Stage 10 Backup',
            help='Optional note or label for the backup record.',
        )

    def handle(self, *args, **options):
        output_dir = options['output_dir']
        backup_type = options['backup_type']
        note = options['note']

        os.makedirs(output_dir, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        raw_filename = f"sheba_backup_{timestamp}.json"
        gz_filename = f"{raw_filename}.gz"
        raw_path = os.path.join(output_dir, raw_filename)
        gz_path = os.path.join(output_dir, gz_filename)

        self.stdout.write(self.style.NOTICE(f"Starting database backup ({backup_type})..."))

        db_settings = settings.DATABASES['default']
        engine = db_settings.get('ENGINE', '')

        try:
            # 1. Generate dump using Django's dumpdata to guarantee portable schema serialization
            with open(raw_path, 'w', encoding='utf-8') as f:
                call_command(
                    'dumpdata',
                    exclude=['contenttypes', 'auth.permission'],
                    stdout=f,
                    indent=2,
                )

            # 2. Compress the dump file with gzip
            with open(raw_path, 'rb') as f_in, gzip.open(gz_path, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)

            # Remove uncompressed raw dump
            if os.path.exists(raw_path):
                os.remove(raw_path)

            # 3. Calculate SHA-256 Checksum
            sha256 = hashlib.sha256()
            with open(gz_path, 'rb') as f:
                while chunk := f.read(65536):
                    sha256.update(chunk)
            checksum = sha256.hexdigest()

            # 4. Calculate File Size
            file_size_bytes = os.path.getsize(gz_path)
            file_size_mb = round(file_size_bytes / (1024 * 1024), 2)
            if file_size_mb == 0:
                file_size_mb = 0.01

            # 5. Record metadata in DatabaseBackup
            record = DatabaseBackup.objects.create(
                backup_name=f"Backup {timestamp}",
                filename=gz_filename,
                file_size_bytes=file_size_bytes,
                backup_type=backup_type,
                status='completed',
                storage_path=gz_path,
                checksum=checksum,
                triggered_by='cli_backup',
            )

            file_size_mb = round(file_size_bytes / (1024 * 1024), 2)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully created backup archive:\n"
                    f"  File: {gz_path}\n"
                    f"  Size: {file_size_mb} MB ({file_size_bytes} bytes)\n"
                    f"  SHA-256: {checksum}\n"
                    f"  Record ID: {record.id}"
                )
            )

        except Exception as exc:
            if os.path.exists(raw_path):
                os.remove(raw_path)
            self.stdout.write(self.style.ERROR(f"Backup failed: {str(exc)}"))
            raise exc

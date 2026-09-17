import logging
from django.core.management.base import BaseCommand
from django.db import connection
from apps.payments.models import PaymentGateway
from apps.core.encryption import encrypt_str, reencrypt_str, is_encrypted

logger = logging.getLogger(__name__)

CREDENTIAL_FIELDS = [
    'app_key',
    'app_secret',
    'username',
    'password',
    'sandbox_app_key',
    'sandbox_app_secret',
    'sandbox_username',
    'sandbox_password',
    'merchant_number',
    'merchant_phone',
    'public_key',
    'private_key',
    'store_id',
    'store_password',
    'webhook_secret',
]


class Command(BaseCommand):
    help = "Safely encrypts legacy plaintext PaymentGateway credentials or rotates keys for existing ciphertexts."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Simulate encryption without writing changes to the database.",
        )
        parser.add_argument(
            '--rotate',
            action='store_true',
            help="Re-encrypt already encrypted credentials with the primary key (for key rotation).",
        )
        parser.add_argument(
            '--tenant',
            type=str,
            default=None,
            help="Filter execution to a specific Tenant ID (UUID).",
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        rotate = options['rotate']
        tenant_id = options.get('tenant')

        qs = PaymentGateway.objects.all()
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        total_gateways = qs.count()
        encrypted_fields_count = 0
        rotated_fields_count = 0
        updated_gateways_count = 0

        self.stdout.write(
            self.style.NOTICE(
                f"Starting credential encryption on {total_gateways} payment gateway record(s)... "
                f"(dry_run={dry_run}, rotate={rotate})"
            )
        )

        for gw in qs:
            gw_updated = False
            fields_to_update = []

            # Read raw database values to avoid automatic model field decryption
            with connection.cursor() as cursor:
                cols_sql = ", ".join([f'"{f}"' for f in CREDENTIAL_FIELDS])
                target_id = gw.id.hex if hasattr(gw.id, 'hex') and connection.vendor == 'sqlite' else gw.pk
                cursor.execute(
                    f"SELECT {cols_sql} FROM payments_paymentgateway WHERE id = %s",
                    [target_id]
                )
                row = cursor.fetchone()
                raw_db_values = dict(zip(CREDENTIAL_FIELDS, row)) if row else {}

            for field_name in CREDENTIAL_FIELDS:
                raw_val = raw_db_values.get(field_name) or ''
                if not raw_val:
                    continue

                if rotate:
                    if is_encrypted(raw_val):
                        new_val = reencrypt_str(raw_val)
                        if new_val != raw_val:
                            rotated_fields_count += 1
                            gw_updated = True
                            fields_to_update.append(field_name)
                            if not dry_run:
                                setattr(gw, field_name, new_val)
                else:
                    if not is_encrypted(raw_val):
                        new_val = encrypt_str(raw_val)
                        encrypted_fields_count += 1
                        gw_updated = True
                        fields_to_update.append(field_name)
                        if not dry_run:
                            setattr(gw, field_name, new_val)

            if gw_updated:
                updated_gateways_count += 1
                if not dry_run:
                    gw.save(update_fields=fields_to_update)

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN COMPLETE] {updated_gateways_count}/{total_gateways} gateway(s) require update. "
                    f"Plaintext fields: {encrypted_fields_count}, Rotated fields: {rotated_fields_count}."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"[SUCCESS] Successfully updated {updated_gateways_count}/{total_gateways} gateway(s). "
                    f"Encrypted fields: {encrypted_fields_count}, Rotated fields: {rotated_fields_count}."
                )
            )

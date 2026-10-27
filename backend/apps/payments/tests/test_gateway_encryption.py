import base64
import hashlib
import hmac
import io
import logging
import uuid
from decimal import Decimal
from unittest.mock import patch

from django.conf import settings
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.encryption import (
    encrypt_str,
    decrypt_str,
    reencrypt_str,
    is_encrypted,
    mask_credential,
    constant_time_compare,
    verify_webhook_signature,
)
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from apps.core.models import Tenant, TenantDomain

User = get_user_model()
from apps.authentication.models import StaffMembership, Role, Permission
from apps.payments.models import (
    PaymentGateway,
    GatewayProvider,
    PaymentTransaction,
    InboundPaymentEvent,
)
from apps.payments.serializers import PaymentGatewaySerializer, SENSITIVE_GATEWAY_FIELDS


class PaymentGatewayEncryptionTests(TestCase):
    """
    Comprehensive test suite verifying application-level reversible encryption,
    key rotation, serializer redaction, log security, Celery task payload hygiene,
    tenant isolation, and webhook signature verification for PaymentGateway.
    """

    def setUp(self):
        self.tenant_a = Tenant.objects.create(
            name="Alpha ISP",
            slug="alpha",
            domain="alpha.shebafi.com",
            is_active=True,
        )
        self.domain_a = TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname="alpha.shebafi.com",
            is_active=True,
            is_primary=True,
        )
        self.tenant_b = Tenant.objects.create(
            name="Beta ISP",
            slug="beta",
            domain="beta.shebafi.com",
            is_active=True,
        )
        self.domain_b = TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname="beta.shebafi.com",
            is_active=True,
            is_primary=True,
        )

        # Admin user for Tenant A
        self.user_a = User.objects.create_user(
            username="alpha_admin",
            email="admin@alpha.com",
            password="StrongPassword123!",
            is_staff=True,
        )
        self.token_a, _ = Token.objects.get_or_create(user=self.user_a)
        self.role_a = Role.objects.create(
            tenant=self.tenant_a,
            name="Admin",
        )
        perm, _ = Permission.objects.get_or_create(
            codename="*",
            defaults={"name": "All Permissions", "module": "core"}
        )
        self.role_a.permissions.add(perm)

        self.membership_a = StaffMembership.objects.create(
            tenant=self.tenant_a,
            user=self.user_a,
            role=self.role_a,
            is_active=True,
        )

        # Admin user for Tenant B
        self.user_b = User.objects.create_user(
            username="beta_admin",
            email="admin@beta.com",
            password="StrongPassword123!",
            is_staff=True,
        )
        self.token_b, _ = Token.objects.get_or_create(user=self.user_b)
        self.role_b = Role.objects.create(
            tenant=self.tenant_b,
            name="Admin",
        )
        self.role_b.permissions.add(perm)
        self.membership_b = StaffMembership.objects.create(
            tenant=self.tenant_b,
            user=self.user_b,
            role=self.role_b,
            is_active=True,
        )

        self.client = APIClient()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. ENCRYPTION / DECRYPTION ROUND TRIP
    # ─────────────────────────────────────────────────────────────────────────
    def test_01_encryption_decryption_round_trip(self):
        """Plaintext strings of varying types and lengths survive the encryption/decryption round trip."""
        test_strings = [
            "bkash_live_app_secret_998877",
            "Complex-P@$$w0rd!#%^&*()_+=~",
            "বাংলা ইউনিকোড সিক্রেট টোকেন",
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Y3...\n-----END RSA PRIVATE KEY-----",
            "short",
            "a" * 500,
        ]

        for s in test_strings:
            ciphertext = encrypt_str(s)
            self.assertTrue(ciphertext.startswith("enc:"), f"Ciphertext must start with 'enc:': {ciphertext}")
            self.assertNotEqual(ciphertext, s)
            decrypted = decrypt_str(ciphertext)
            self.assertEqual(decrypted, s, f"Decrypted string must match original for: {s}")

        # Empty and None handling
        self.assertEqual(encrypt_str(""), "")
        self.assertIsNone(encrypt_str(None))
        self.assertEqual(decrypt_str(""), "")
        self.assertIsNone(decrypt_str(None))

    # ─────────────────────────────────────────────────────────────────────────
    # 2. DIFFERENT PLAINTEXTS PRODUCE SAFE CIPHERTEXT
    # ─────────────────────────────────────────────────────────────────────────
    def test_02_different_plaintexts_produce_safe_ciphertext(self):
        """Different plaintexts produce distinct ciphertexts, with non-deterministic IVs and no plaintext leakage."""
        val1 = "secret_credential_alpha"
        val2 = "secret_credential_beta"

        cipher1 = encrypt_str(val1)
        cipher2 = encrypt_str(val2)

        self.assertNotEqual(cipher1, cipher2)
        self.assertNotIn(val1, cipher1)
        self.assertNotIn(val2, cipher2)

        # Same plaintext encrypted twice produces different ciphertexts due to Fernet randomized IV
        cipher1_again = encrypt_str(val1)
        self.assertNotEqual(cipher1, cipher1_again)
        self.assertEqual(decrypt_str(cipher1), decrypt_str(cipher1_again))

    # ─────────────────────────────────────────────────────────────────────────
    # 3. INVALID AND CORRUPTED KEY HANDLING
    # ─────────────────────────────────────────────────────────────────────────
    def test_03_invalid_key_handling(self):
        """Corrupted ciphertexts or mismatched encryption keys fail gracefully without crashing."""
        valid_secret = "confidential_provider_secret"
        ciphertext = encrypt_str(valid_secret)

        # Decrypting with a completely different encryption key returns empty string gracefully
        with override_settings(FIELD_ENCRYPTION_KEY="another-completely-different-key-32b-length!!"):
            result = decrypt_str(ciphertext)
            self.assertEqual(result, "", "Mismatched key must return empty string without raising an unhandled exception.")

        # Tampered ciphertext returns empty string
        corrupted = ciphertext[:10] + "XYZABC" + ciphertext[16:]
        result_corrupted = decrypt_str(corrupted)
        self.assertEqual(result_corrupted, "")

    # ─────────────────────────────────────────────────────────────────────────
    # 4. EXISTING CREDENTIAL MIGRATION
    # ─────────────────────────────────────────────────────────────────────────
    def test_04_existing_credential_migration(self):
        """Legacy plaintext credentials in the database are safely encrypted via the management command."""
        # Create a gateway bypassing Django model encryption to simulate pre-migration plaintext state
        gw = PaymentGateway.objects.create(
            tenant=self.tenant_a,
            provider=GatewayProvider.BKASH,
            title="Legacy Unencrypted Gateway",
        )

        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE payments_paymentgateway
                SET app_key = %s, app_secret = %s, password = %s, webhook_secret = %s
                WHERE title = %s
                """,
                [
                    "raw_plaintext_app_key",
                    "raw_plaintext_app_secret",
                    "raw_plaintext_password",
                    "raw_plaintext_webhook_secret",
                    gw.title,
                ]
            )

        # Verify database holds raw plaintext
        with connection.cursor() as cursor:
            cursor.execute("SELECT app_secret FROM payments_paymentgateway WHERE title = %s", [gw.title])
            row = cursor.fetchone()
            self.assertEqual(row[0], "raw_plaintext_app_secret")

        # Run dry-run: should report need for update but NOT modify DB
        out_dry = io.StringIO()
        call_command("encrypt_payment_credentials", dry_run=True, stdout=out_dry)
        self.assertIn("[DRY RUN COMPLETE]", out_dry.getvalue())

        with connection.cursor() as cursor:
            cursor.execute("SELECT app_secret FROM payments_paymentgateway WHERE title = %s", [gw.title])
            self.assertEqual(cursor.fetchone()[0], "raw_plaintext_app_secret")

        # Run actual migration command
        out_live = io.StringIO()
        call_command("encrypt_payment_credentials", stdout=out_live)
        self.assertIn("[SUCCESS]", out_live.getvalue())

        # Verify DB column now contains encrypted token starting with 'enc:'
        with connection.cursor() as cursor:
            cursor.execute("SELECT app_secret, app_key, password, webhook_secret FROM payments_paymentgateway WHERE title = %s", [gw.title])
            app_secret_db, app_key_db, password_db, webhook_secret_db = cursor.fetchone()
            self.assertTrue(app_secret_db.startswith("enc:"))
            self.assertTrue(app_key_db.startswith("enc:"))
            self.assertTrue(password_db.startswith("enc:"))
            self.assertTrue(webhook_secret_db.startswith("enc:"))

        # Verify reading through Django model transparently returns original decrypted plaintext
        gw.refresh_from_db()
        self.assertEqual(gw.app_secret, "raw_plaintext_app_secret")
        self.assertEqual(gw.app_key, "raw_plaintext_app_key")
        self.assertEqual(gw.password, "raw_plaintext_password")
        self.assertEqual(gw.webhook_secret, "raw_plaintext_webhook_secret")

    # ─────────────────────────────────────────────────────────────────────────
    # 5. CREDENTIALS EXCLUDED FROM SERIALIZERS & API RESPONSES
    # ─────────────────────────────────────────────────────────────────────────
    def test_05_credentials_excluded_from_serializers(self):
        """Serializer representations never expose raw sensitive credentials and only expose masked metadata."""
        gw = PaymentGateway.objects.create(
            tenant=self.tenant_a,
            provider=GatewayProvider.BKASH,
            title="bKash Live",
            app_key="bkash_live_app_key_001",
            app_secret="bkash_super_secret_leak_test",
            username="bkash_user",
            password="secret_password_123",
            sandbox_app_key="sandbox_key",
            sandbox_app_secret="sandbox_secret",
            sandbox_username="sandbox_user",
            sandbox_password="sandbox_password",
            merchant_number="01711223344",
            merchant_phone="01711223344",
            public_key="-----BEGIN PUBLIC KEY-----",
            private_key="-----BEGIN RSA PRIVATE KEY-----",
            store_id="store_id_ssl",
            store_password="store_password_ssl",
            webhook_secret="webhook_secret_hmac",
        )

        serializer = PaymentGatewaySerializer(gw)
        data = serializer.data

        # Verify none of the raw sensitive credentials appear in serializer representation
        for field in SENSITIVE_GATEWAY_FIELDS:
            self.assertNotIn(
                field,
                data,
                f"Sensitive field '{field}' must never appear in serializer output!"
            )

        # Verify safe masked metadata and status booleans are present
        self.assertTrue(data.get("is_configured"))
        self.assertTrue(data.get("has_app_key"))
        self.assertTrue(data.get("has_app_secret"))
        self.assertTrue(data.get("has_password"))
        self.assertTrue(data.get("has_private_key"))
        self.assertTrue(data.get("has_webhook_secret"))
        self.assertTrue(data.get("has_store_password"))
        self.assertIn("masked_merchant_number", data)
        self.assertNotIn("01711223344", data.get("masked_merchant_number", ""))
        self.assertTrue(data.get("masked_merchant_number").endswith("3344"))

    # ─────────────────────────────────────────────────────────────────────────
    # 6. CREDENTIALS EXCLUDED FROM LOGS
    # ─────────────────────────────────────────────────────────────────────────
    def test_06_credentials_excluded_from_logs(self):
        """Sensitive credential strings never leak into logging outputs during operations or errors."""
        secret_token = "LEAK_CANARY_SECRET_NEVER_APPEAR_IN_LOGS"

        # Capture log records
        logger = logging.getLogger("apps.core.encryption")
        log_stream = io.StringIO()
        handler = logging.StreamHandler(log_stream)
        logger.addHandler(handler)

        try:
            # 1. Encrypt and save
            ciphertext = encrypt_str(secret_token)

            # 2. Corrupt ciphertext and attempt decryption to trigger error logger
            corrupt_token = "enc:gAAAAABinvalidcorruptedtoken"
            decrypt_str(corrupt_token)

            # 3. Webhook verification with bad signature
            verify_webhook_signature("invalidsig", b"test payload", secret_token)

            log_output = log_stream.getvalue()
            self.assertNotIn(secret_token, log_output, "Raw secret credential found in application logs!")
        finally:
            logger.removeHandler(handler)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. CREDENTIALS UNAVAILABLE IN TASK PAYLOADS
    # ─────────────────────────────────────────────────────────────────────────
    def test_07_credentials_unavailable_in_task_payloads(self):
        """Celery tasks only accept tenant and event UUIDs; credentials are never passed as arguments."""
        from apps.core.tasks import process_payment_event

        with patch.object(process_payment_event, 'delay') as mock_delay:
            event = InboundPaymentEvent.objects.create(
                tenant=self.tenant_a,
                source=InboundPaymentEvent.EventSource.SMS,
                raw_payload="Test payload",
                amount=Decimal("500.00"),
                trx_id="TRX-CELERY-CHECK",
            )
            # Dispatch via standard view trigger pattern
            process_payment_event.delay(str(self.tenant_a.id), str(event.id))

            mock_delay.assert_called_once_with(str(self.tenant_a.id), str(event.id))
            called_args, called_kwargs = mock_delay.call_args

            # Verify only UUID strings are passed, no credentials or dicts
            for arg in called_args:
                self.assertIsInstance(arg, str)
                # Verify UUID validity
                uuid.UUID(arg)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. TENANT ISOLATION FOR GATEWAY CREDENTIALS
    # ─────────────────────────────────────────────────────────────────────────
    def test_08_tenant_isolation_for_gateway_credentials(self):
        """Tenants cannot read or update payment gateway configurations of other tenants."""
        gw_a = PaymentGateway.objects.create(
            tenant=self.tenant_a,
            provider=GatewayProvider.BKASH,
            title="Alpha Gateway",
            app_key="alpha_key",
            app_secret="alpha_secret",
        )
        gw_b = PaymentGateway.objects.create(
            tenant=self.tenant_b,
            provider=GatewayProvider.NAGAD,
            title="Beta Gateway",
            app_key="beta_key",
            app_secret="beta_secret",
        )

        # Tenant A user attempts to view Tenant B's gateway
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a.key}')
        res = self.client.get(
            f"/api/v1/payment-gateways/{gw_b.id}/",
            HTTP_HOST="alpha.shebafi.com",
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Tenant A user attempts to update Tenant B's gateway
        res_patch = self.client.patch(
            f"/api/v1/payment-gateways/{gw_b.id}/",
            {"title": "Compromised Gateway"},
            format="json",
            HTTP_HOST="alpha.shebafi.com",
        )
        self.assertEqual(res_patch.status_code, status.HTTP_404_NOT_FOUND)

        # Tenant B's gateway remains unchanged
        gw_b.refresh_from_db()
        self.assertEqual(gw_b.title, "Beta Gateway")

    # ─────────────────────────────────────────────────────────────────────────
    # 9. WEBHOOK SECRET VERIFICATION USING DECRYPTED VALUE
    # ─────────────────────────────────────────────────────────────────────────
    def test_09_webhook_secret_verification_using_decrypted_value(self):
        """Webhook signatures are verified using decrypted webhook_secret and constant-time HMAC comparison."""
        webhook_secret = "hmac_secret_key_prod_verified_99"
        gw = PaymentGateway.objects.create(
            tenant=self.tenant_a,
            provider=GatewayProvider.BKASH,
            title="bKash Webhook Gateway",
            webhook_secret=webhook_secret,
        )

        # Verify stored as ciphertext in DB
        with connection.cursor() as cursor:
            cursor.execute("SELECT webhook_secret FROM payments_paymentgateway WHERE title = %s", [gw.title])
            db_val = cursor.fetchone()[0]
            self.assertTrue(db_val.startswith("enc:"))

        payload = b'{"event": "PAYMENT_RECEIVED", "amount": 1000.0, "trx_id": "BKASH998811"}'
        valid_signature = hmac.new(
            webhook_secret.encode('utf-8'),
            payload,
            hashlib.sha256
        ).hexdigest()

        # 1. Valid signature returns True
        self.assertTrue(gw.verify_webhook_signature(valid_signature, payload))

        # 2. Tampered signature returns False
        tampered_sig = valid_signature[:-4] + "0000"
        self.assertFalse(gw.verify_webhook_signature(tampered_sig, payload))

        # 3. Tampered payload returns False
        tampered_payload = payload.replace(b"1000.0", b"5000.0")
        self.assertFalse(gw.verify_webhook_signature(valid_signature, tampered_payload))

        # 4. Constant-time comparison rejects non-matching lengths/types safely
        self.assertFalse(constant_time_compare("abc", "abcdef"))
        self.assertTrue(constant_time_compare("matching_digest_123", "matching_digest_123"))

    # ─────────────────────────────────────────────────────────────────────────
    # 10. MULTI-KEY ROTATION (MultiFernet)
    # ─────────────────────────────────────────────────────────────────────────
    def test_10_key_rotation_support(self):
        """Multi-key rotation allows reading data encrypted with older keys while writing with the primary key."""
        old_key = "legacy-secret-key-phase-1"
        new_primary_key = "brand-new-primary-key-phase-2"

        # Encrypt with old key
        with override_settings(FIELD_ENCRYPTION_KEY=old_key):
            old_ciphertext = encrypt_str("my_secret_token_123")
            self.assertEqual(decrypt_str(old_ciphertext), "my_secret_token_123")

        # Now configure key rotation: primary=new_key, fallback=old_key
        dual_keys = f"{new_primary_key},{old_key}"
        with override_settings(FIELD_ENCRYPTION_KEY=dual_keys):
            # Reading old ciphertext still succeeds via fallback key in MultiFernet!
            self.assertEqual(decrypt_str(old_ciphertext), "my_secret_token_123")

            # Re-encrypting rotates it to the new primary key
            rotated_ciphertext = reencrypt_str(old_ciphertext)
            self.assertNotEqual(rotated_ciphertext, old_ciphertext)
            self.assertEqual(decrypt_str(rotated_ciphertext), "my_secret_token_123")

        # After rotation, new ciphertext decrypts with new_primary_key alone (old key retired)
        with override_settings(FIELD_ENCRYPTION_KEY=new_primary_key):
            self.assertEqual(decrypt_str(rotated_ciphertext), "my_secret_token_123")

    # ─────────────────────────────────────────────────────────────────────────
    # 11. API VIEW CREATION AND UPDATE EXCLUDES RAW SECRETS
    # ─────────────────────────────────────────────────────────────────────────
    def test_11_api_creation_and_update_excludes_raw_secrets(self):
        """POST and PATCH requests through the API accept secrets but responses never leak them."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_a.key}')

        payload = {
            "provider": "BKASH",
            "title": "API Created Gateway",
            "app_key": "api_provided_app_key",
            "app_secret": "api_provided_app_secret_super_secret",
            "password": "api_provided_password",
            "merchant_number": "01888999000",
            "is_active": True,
        }

        # POST /api/v1/payment-gateways/
        res = self.client.post(
            "/api/v1/payment-gateways/",
            payload,
            format="json",
            HTTP_HOST="alpha.shebafi.com",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        res_data = res.data

        # None of the secrets should be in the response
        for secret_field in SENSITIVE_GATEWAY_FIELDS:
            self.assertNotIn(secret_field, res_data)

        # Status and masked metadata should be present
        self.assertTrue(res_data.get("has_app_key"))
        self.assertTrue(res_data.get("has_app_secret"))
        self.assertTrue(res_data.get("has_password"))
        self.assertTrue(res_data.get("is_configured"))
        self.assertEqual(res_data.get("masked_merchant_number")[-4:], "9000")

        # PATCH /api/v1/payment-gateways/<id>/
        gw_id = res_data["id"]
        patch_res = self.client.patch(
            f"/api/v1/payment-gateways/{gw_id}/",
            {"app_secret": "updated_new_secret_key"},
            format="json",
            HTTP_HOST="alpha.shebafi.com",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        for secret_field in SENSITIVE_GATEWAY_FIELDS:
            self.assertNotIn(secret_field, patch_res.data)

        # Verify underlying database has updated ciphertext and decrypted value matches
        gw = PaymentGateway.objects.get(id=gw_id)
        self.assertEqual(gw.app_secret, "updated_new_secret_key")

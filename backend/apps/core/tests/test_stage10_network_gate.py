"""
Stage 10 — S10.8: Network Boundary & Hardware Gate Test Suite.
Verifies encrypted credentials at rest (Router password, OLT SNMP community),
credential redaction in audit payloads, SSRF protection against cloud metadata and loopback,
and transaction.on_commit execution boundaries.
"""

from unittest.mock import patch
from django.test import TestCase, override_settings
from django.core.exceptions import ValidationError
from django.db import connection, transaction

from apps.core.models import Tenant, TenantDomain
from apps.network.models import Router, OLT, OLTBrand, NetworkSyncJob
from apps.network.validators import validate_router_host
from apps.network.services.audit import redact_sensitive_dict
from apps.network.services.action_queue import ActionQueueService


def _make_tenant(name="NetISP", domain="net.shebafi.com"):
    t = Tenant.objects.create(name=name, slug=name.lower(), domain=domain, is_active=True)
    TenantDomain.objects.create(tenant=t, hostname=domain, is_active=True, is_primary=True)
    return t


class Stage10NetworkGateTests(TestCase):
    def setUp(self):
        self.tenant = _make_tenant("NetworkTenant", "network.shebafi.com")

    # ── 1. Router credentials encrypted at rest ───────────────────

    def test_01_router_password_encrypted_at_rest(self):
        """Router.password is encrypted at rest in the DB (starts with enc:) and decrypts transparently."""
        raw_password = "super-secret-mikrotik-password-2026"
        router = Router.objects.create(
            tenant=self.tenant,
            name="Core-Edge-01",
            ip_address="192.168.100.1",
            username="admin",
            password=raw_password,
        )

        # Transparent in-memory / ORM decryption
        router.refresh_from_db()
        self.assertEqual(router.password, raw_password)

        # Verify raw DB row stores ciphertext
        with connection.cursor() as cursor:
            cursor.execute("SELECT password FROM network_router WHERE name = %s", [router.name])
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            db_value = row[0]

        self.assertNotEqual(db_value, raw_password)
        self.assertTrue(db_value.startswith("enc:"))

    # ── 2. OLT credentials encrypted at rest ──────────────────────

    def test_02_olt_snmp_community_encrypted_at_rest(self):
        """OLT.snmp_community and telnet_password are encrypted at rest in the database."""
        raw_community = "snmp-read-write-sec-999"
        raw_telnet = "telnet-secret-olt-pass"
        olt = OLT.objects.create(
            tenant=self.tenant,
            name="EPON-OLT-Main",
            brand=OLTBrand.VSOL,
            ip_address="10.200.1.5",
            snmp_community=raw_community,
            telnet_user="admin",
            telnet_password=raw_telnet,
        )

        olt.refresh_from_db()
        self.assertEqual(olt.snmp_community, raw_community)
        self.assertEqual(olt.telnet_password, raw_telnet)

        with connection.cursor() as cursor:
            cursor.execute("SELECT snmp_community, telnet_password FROM network_olt WHERE name = %s", [olt.name])
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            db_comm, db_telnet = row

        self.assertNotEqual(db_comm, raw_community)
        self.assertTrue(db_comm.startswith("enc:"))
        self.assertNotEqual(db_telnet, raw_telnet)
        self.assertTrue(db_telnet.startswith("enc:"))

    # ── 3. Credential redaction in audit payloads ──────────────────

    def test_03_credential_redaction_in_audit_details(self):
        """Sensitize dictionaries redact sensitive fields such as password, snmp_community, token."""
        raw_payload = {
            "username": "alice",
            "password": "super-secret-password",
            "snmp_community": "private",
            "token": "shb_tok_99999",
            "nested": {
                "secret_key": "hidden_secret",
                "safe_field": "visible_info",
            },
        }
        redacted = redact_sensitive_dict(raw_payload)
        self.assertEqual(redacted["password"], "********")
        self.assertEqual(redacted["snmp_community"], "********")
        self.assertEqual(redacted["token"], "********")
        self.assertEqual(redacted["nested"]["secret_key"], "********")
        self.assertEqual(redacted["nested"]["safe_field"], "visible_info")
        self.assertEqual(redacted["username"], "alice")

    # ── 4. SSRF protection ────────────────────────────────────────

    def test_04_ssrf_protection_blocks_cloud_metadata(self):
        """Router host validator strictly blocks AWS/GCP/Azure metadata IP 169.254.169.254."""
        with self.assertRaises(ValidationError) as ctx:
            validate_router_host("169.254.169.254")
        self.assertIn("forbidden range", str(ctx.exception).lower())

    @override_settings(ALLOW_LOCAL_NETWORK_DEVICES=False)
    def test_05_ssrf_protection_blocks_loopback_in_production(self):
        """When ALLOW_LOCAL_NETWORK_DEVICES is False, loopback 127.0.0.1 and localhost are blocked."""
        with self.assertRaises(ValidationError) as ctx:
            validate_router_host("127.0.0.1")
        self.assertIn("loopback", str(ctx.exception).lower())

        with self.assertRaises(ValidationError) as ctx:
            validate_router_host("localhost")
        self.assertIn("prohibited", str(ctx.exception).lower())

    # ── 5. Transaction on_commit hardware boundary ─────────────────

    def test_06_action_queue_dispatches_via_on_commit(self):
        """enqueue_action registers dispatch inside transaction.on_commit."""
        router = Router.objects.create(
            tenant=self.tenant,
            name="Commit-Edge-01",
            ip_address="192.168.10.1",
            username="admin",
            password="pwd",
        )

        with patch("django.db.transaction.on_commit") as mock_on_commit:
            job = ActionQueueService.enqueue_action(
                tenant=self.tenant,
                router=router,
                action=NetworkSyncJob.Action.ENABLE_SERVICE,
                payload={"username": "user1", "profile": "10M"},
                actor="",
            )
            self.assertIsNotNone(job.id)
            mock_on_commit.assert_called_once()

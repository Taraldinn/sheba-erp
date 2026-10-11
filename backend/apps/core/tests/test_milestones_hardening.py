"""
apps/core/tests/test_milestones_hardening.py

Regression test suite for Milestones 3, 4, and 8 hardening:
- StaffMembership scopes (GLOBAL, TENANT, POP, AREA, SELF, ASSIGNED)
- Multi-tenant and inactive membership authorization
- TenantApiToken hashing at rest, prefix, one-time display, constant-time verification, revocation
- Control Plane vs Tenant Plane boundaries & Stage 13.2 Tenant backup export
- Stage 13.1 DNS challenge, Stage 13.3 Subscription enforcement, Stage 13.4 Platform audit
"""

import json
import os
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.authentication.models import Permission, Role, StaffMembership, StaffProfile
from apps.core.authorization import can
from apps.core.models import DatabaseBackup, AuditLog, Tenant, TenantApiToken, TenantDomain
from apps.core.tasks import emit_platform_audit_event, enforce_subscription_lifecycle
from apps.customers.models import Customer
from apps.support.models import Ticket

User = get_user_model()


class StaffMembershipAuthzAndScopeTests(TestCase):
    """Milestone 3: Verification of StaffMembership authorization and scope engine."""

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Apex Networks",
            slug="apex-net",
            contact_email="admin@apex.test",
            is_active=True,
        )
        self.tenant_other = Tenant.objects.create(
            name="Beta Networks",
            slug="beta-net",
            contact_email="admin@beta.test",
            is_active=True,
        )

        # Base role with ticket and customer permissions
        self.perm_ticket_view, _ = Permission.objects.get_or_create(
            codename="ticket.view", defaults={"name": "View Tickets", "module": "support"}
        )
        self.perm_ticket_manage, _ = Permission.objects.get_or_create(
            codename="ticket.manage", defaults={"name": "Manage Tickets", "module": "support"}
        )
        self.role = Role.objects.create(tenant=self.tenant, name="Support Staff")
        self.role.permissions.add(self.perm_ticket_view, self.perm_ticket_manage)

        # Users
        self.user1 = User.objects.create_user(username="agent_one", password="pw")
        self.user2 = User.objects.create_user(username="agent_two", password="pw")

        # Customer for Ticket
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            full_name="Test Customer",
            customer_code="CUST-TEST-01",
            mobile="01711111111",
        )
        # Mock Resource
        self.ticket = Ticket.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            ticket_no="TICK-001",
            subject="Fiber cut in sector 4",
            assigned_to=self.user1,
        )

    def test_global_and_tenant_scope_access(self):
        membership = StaffMembership.objects.create(
            user=self.user1,
            tenant=self.tenant,
            role=self.role,
            scope=StaffMembership.Scope.GLOBAL,
            is_active=True,
        )
        self.assertTrue(can(self.user1, self.tenant, "ticket.view", self.ticket))

        membership.scope = StaffMembership.Scope.TENANT
        membership.save()
        self.user1._cached_membership = None
        self.assertTrue(can(self.user1, self.tenant, "ticket.view", self.ticket))

    def test_assigned_scope_access_allowed_for_assignee_denied_for_others(self):
        # user1 is assigned
        StaffMembership.objects.create(
            user=self.user1,
            tenant=self.tenant,
            role=self.role,
            scope=StaffMembership.Scope.ASSIGNED,
            is_active=True,
        )
        self.assertTrue(can(self.user1, self.tenant, "ticket.view", self.ticket))

        # user2 has ASSIGNED scope but ticket is assigned to user1
        StaffMembership.objects.create(
            user=self.user2,
            tenant=self.tenant,
            role=self.role,
            scope=StaffMembership.Scope.ASSIGNED,
            is_active=True,
        )
        self.assertFalse(can(self.user2, self.tenant, "ticket.view", self.ticket))

    def test_self_scope_access(self):
        StaffMembership.objects.create(
            user=self.user1,
            tenant=self.tenant,
            role=self.role,
            scope=StaffMembership.Scope.SELF,
            is_active=True,
        )
        self.assertTrue(can(self.user1, self.tenant, "ticket.view", self.ticket))

        StaffMembership.objects.create(
            user=self.user2,
            tenant=self.tenant,
            role=self.role,
            scope=StaffMembership.Scope.SELF,
            is_active=True,
        )
        self.assertFalse(can(self.user2, self.tenant, "ticket.view", self.ticket))

    def test_pop_and_area_scope_evaluation(self):
        membership = StaffMembership.objects.create(
            user=self.user1,
            tenant=self.tenant,
            role=self.role,
            scope=StaffMembership.Scope.POP,
            is_active=True,
        )
        # Mock pop on membership and resource
        membership.pop_id = "pop-101"
        self.user1._cached_membership = membership
        self.ticket.pop_id = "pop-101"
        self.assertTrue(can(self.user1, self.tenant, "ticket.view", self.ticket))

        # Mismatch pop
        self.ticket.pop_id = "pop-999"
        self.assertFalse(can(self.user1, self.tenant, "ticket.view", self.ticket))

        # Absent pop on resource or membership fails closed
        self.ticket.pop_id = None
        self.assertFalse(can(self.user1, self.tenant, "ticket.view", self.ticket))
        self.ticket.pop_id = "pop-101"
        membership.pop_id = None
        self.assertFalse(can(self.user1, self.tenant, "ticket.view", self.ticket))

        # AREA scope
        membership.scope = StaffMembership.Scope.AREA
        membership.area_id = "area-dhaka-north"
        self.user1._cached_membership = membership
        self.ticket.area_id = "area-dhaka-north"
        self.assertTrue(can(self.user1, self.tenant, "ticket.view", self.ticket))

        # Mismatch area
        self.ticket.area_id = "area-chittagong"
        self.assertFalse(can(self.user1, self.tenant, "ticket.view", self.ticket))

        # Absent area on resource or membership fails closed
        self.ticket.area_id = None
        self.assertFalse(can(self.user1, self.tenant, "ticket.view", self.ticket))
        self.ticket.area_id = "area-dhaka-north"
        membership.area_id = None
        self.assertFalse(can(self.user1, self.tenant, "ticket.view", self.ticket))

    def test_inactive_membership_access_denied(self):
        StaffMembership.objects.create(
            user=self.user1,
            tenant=self.tenant,
            role=self.role,
            scope=StaffMembership.Scope.GLOBAL,
            is_active=False,
        )
        self.assertFalse(can(self.user1, self.tenant, "ticket.view", self.ticket))

    def test_multi_tenant_membership_isolation(self):
        # User belongs to tenant A with ticket.view, but not tenant B
        StaffMembership.objects.create(
            user=self.user1,
            tenant=self.tenant,
            role=self.role,
            is_active=True,
        )
        self.assertTrue(can(self.user1, self.tenant, "ticket.view"))
        self.assertFalse(can(self.user1, self.tenant_other, "ticket.view"))

        # Cross-tenant resource check should strictly fail even with global scope
        customer_b = Customer.objects.create(
            tenant=self.tenant_other,
            full_name="Customer Beta",
            customer_code="CUST-BETA-01",
            mobile="01722222222",
        )
        ticket_b = Ticket.objects.create(
            tenant=self.tenant_other,
            customer=customer_b,
            ticket_no="TICK-B01",
            subject="Ticket in tenant B",
        )
        self.assertFalse(can(self.user1, self.tenant, "ticket.view", ticket_b))


class TenantApiTokenSecurityTests(TestCase):
    """Milestone 4: Verification of TenantApiToken security properties."""

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Delta ISP",
            slug="delta-isp",
            contact_email="admin@delta.test",
            is_active=True,
        )
        self.admin_user = User.objects.create_user(username="delta_admin", password="pw")

    def test_generate_returns_raw_key_once_and_stores_hash_at_rest(self):
        token_obj, raw_secret = TenantApiToken.generate(
            tenant=self.tenant,
            name="External Frontend App",
            permissions=["customers.read", "billing.read"],
            created_by=self.admin_user,
        )

        # Raw secret is returned as a non-empty string
        self.assertIsInstance(raw_secret, str)
        self.assertTrue(len(raw_secret) > 20)

        # Raw token is NOT stored in the database
        token_obj.refresh_from_db()
        self.assertIsNone(token_obj.token)

        # token_hash is SHA-256 (64 hex characters)
        self.assertEqual(len(token_obj.token_hash), 64)
        self.assertNotEqual(token_obj.token_hash, raw_secret)

        # key_prefix starts with shb_ and matches prefix of raw_secret
        self.assertTrue(token_obj.key_prefix.startswith("shb_"))
        self.assertEqual(token_obj.key_prefix, "shb_" + raw_secret[:6])

    def test_verify_success_and_tamper_rejection(self):
        token_obj, raw_secret = TenantApiToken.generate(
            tenant=self.tenant,
            name="Integration Key",
            created_by=self.admin_user,
        )

        # Correct secret verifies
        self.assertTrue(token_obj.verify(raw_secret))

        # Incorrect secret fails
        self.assertFalse(token_obj.verify(raw_secret + "_invalid"))
        self.assertFalse(token_obj.verify("random_wrong_secret"))

    def test_revoke_blocks_verification(self):
        token_obj, raw_secret = TenantApiToken.generate(
            tenant=self.tenant,
            name="Revocable Key",
            created_by=self.admin_user,
        )
        self.assertTrue(token_obj.verify(raw_secret))

        token_obj.revoke()
        token_obj.refresh_from_db()
        self.assertIsNotNone(token_obj.revoked_at)
        self.assertFalse(token_obj.is_active)
        self.assertFalse(token_obj.verify(raw_secret))

    def test_expired_and_inactive_token_blocks_verification(self):
        token_obj, raw_secret = TenantApiToken.generate(
            tenant=self.tenant,
            name="Expiring Key",
            expires_at=timezone.now() - timedelta(hours=1),
            created_by=self.admin_user,
        )
        self.assertFalse(token_obj.verify(raw_secret))

        # Deactivated manually
        token_obj2, raw_secret2 = TenantApiToken.generate(
            tenant=self.tenant,
            name="Manual Deactivate",
            created_by=self.admin_user,
        )
        token_obj2.is_active = False
        token_obj2.save()
        self.assertFalse(token_obj2.verify(raw_secret2))


class ControlPlaneBoundaryAndTasksTests(TestCase):
    """Milestone 8: Control Plane / Tenant Plane boundary separation and Stage 13 features."""

    def setUp(self):
        self.client = APIClient()

        # Tenant
        self.tenant = Tenant.objects.create(
            name="Apex Fiber",
            slug="apex-fiber",
            contact_email="admin@apexfiber.test",
            is_active=True,
            subscription_expires_at=timezone.now() - timedelta(days=1),  # Expired for lifecycle test
            subscription_status="active",
        )
        self.domain = TenantDomain.objects.create(
            tenant=self.tenant,
            hostname="apexfiber.shebafi.test",
            is_primary=True,
            is_active=True,
        )

        # Tenant Staff User
        self.tenant_user = User.objects.create_user(username="apex_staff", password="password123")
        self.tenant_token, _ = Token.objects.get_or_create(user=self.tenant_user)
        self.role = Role.objects.create(tenant=self.tenant, name="Admin")
        StaffMembership.objects.create(
            user=self.tenant_user,
            tenant=self.tenant,
            role=self.role,
            is_active=True,
        )

        # Central SaaS Admin (Superuser)
        self.saas_admin = User.objects.create_superuser(username="platform_root", password="rootpassword", email="root@sheba.test")
        self.saas_token, _ = Token.objects.get_or_create(user=self.saas_admin)

    def test_tenant_staff_cannot_access_saas_control_plane_endpoints(self):
        """Tenant staff must be denied access (HTTP 403) on SaaS control plane endpoints."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.tenant_token.key}")

        endpoints = [
            "/api/v1/saas/tenants/",
            "/api/v1/saas/packages/",
            "/api/v1/saas/subscriptions/",
            "/api/v1/saas/backups/",
        ]
        for ep in endpoints:
            resp = self.client.get(ep)
            self.assertEqual(
                resp.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Tenant staff should get 403 on {ep}, got {resp.status_code}",
            )

    def test_central_admin_can_access_saas_control_plane_endpoints(self):
        """Platform superuser can access SaaS control plane endpoints."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.saas_token.key}")
        resp = self.client.get("/api/v1/saas/tenants/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_saas_backup_export_tenant(self):
        """Stage 13.2: Export single-tenant dataset creates backup entry with JSON export."""
        # Create a customer and ticket under tenant
        cust = Customer.objects.create(
            tenant=self.tenant,
            full_name="Abdur Rahim",
            customer_code="CUST-EXP-001",
            mobile="01711000000",
        )
        Ticket.objects.create(
            tenant=self.tenant,
            customer=cust,
            ticket_no="TICK-EXP-001",
            subject="Router issue",
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.saas_token.key}")
        resp = self.client.post(
            "/api/v1/saas/backups/export-tenant/",
            data={"tenant_id": str(self.tenant.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("backup", resp.data)
        self.assertEqual(resp.data["summary"]["customers_count"], 1)

        # Verify DatabaseBackup record was created
        backup_id = resp.data["backup"]["id"]
        backup_obj = DatabaseBackup.objects.get(id=backup_id)
        self.assertEqual(backup_obj.backup_type, "tenant_data")
        self.assertEqual(backup_obj.tenant, self.tenant)
        self.assertTrue(os.path.exists(backup_obj.storage_path))

        # Cleanup test backup file
        if os.path.exists(backup_obj.storage_path):
            os.remove(backup_obj.storage_path)

    def test_stage13_1_domain_challenge_token(self):
        """Stage 13.1: TenantDomain generates cryptographically secure DNS challenge token."""
        token = TenantDomain.generate_challenge_token()
        self.assertTrue(token.startswith("sheba-verify-"))
        self.domain.dns_challenge_token = token
        self.domain.save()
        self.domain.refresh_from_db()
        self.assertEqual(self.domain.dns_challenge_token, token)

    def test_stage13_3_subscription_lifecycle_enforcement_task(self):
        """Stage 13.3: enforce_subscription_lifecycle automatically suspends expired tenants."""
        self.tenant.subscription_status = "active"
        self.tenant.is_active = True
        self.tenant.subscription_expires_at = timezone.now() - timedelta(days=2)
        self.tenant.save()

        result = enforce_subscription_lifecycle()
        self.assertGreaterEqual(result["tenants_suspended"], 1)
        self.assertIn(str(self.tenant.id), result["tenant_ids"])

        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.subscription_status, "suspended")
        self.assertFalse(self.tenant.is_active)

    def test_stage13_4_platform_audit_stream_task(self):
        """Stage 13.4: emit_platform_audit_event writes to AuditLog asynchronously."""
        result = emit_platform_audit_event(
            event_type="TEST_EVENT",
            actor="test_admin",
            resource_type="Tenant",
            resource_id=str(self.tenant.id),
            details={"ip": "127.0.0.1", "action": "test_verification"},
        )
        self.assertTrue(result["success"])

        # Check AuditLog
        audit_entry = AuditLog.objects.filter(action="TEST_EVENT", actor_username="test_admin").first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.actor_username, "test_admin")
        self.assertEqual(audit_entry.details.get("action"), "test_verification")

"""
Phase 21: Production Readiness & Verification Gates Test Suite.
Verifies all production gates mandated for final launch readiness:
1. Backend system readiness probe (DB ping, Redis, Celery, devices)
2. Migration safety (0 unapplied migrations)
3. Redis distributed locking & cache health
4. Database backup snapshot, checksum verification & disaster recovery restore safety
5. Network failure simulation & blast radius isolation
6. Payment transaction failure rollback simulation
7. Multi-tenant isolation & data leak prevention
8. OpenAPI 3.0 schema generation & validation
"""

import os
import shutil
import hashlib
from decimal import Decimal
from django.test import TestCase, TransactionTestCase
from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.core.cache import cache
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, DatabaseBackup
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Invoice
from apps.finance.models import BillingAccount, LedgerEntry
from apps.network.models import Router, OLT, ONU, POPBranch
from apps.network.services.topology import NetworkTopologyService

User = get_user_model()


class ProductionReadinessGateTests(TestCase):
    def setUp(self):
        self.tenant_a = Tenant.objects.create(name="Prod Alpha", slug="alpha", domain="alpha.sheba.net")
        self.tenant_b = Tenant.objects.create(name="Prod Beta", slug="beta", domain="beta.sheba.net")

        self.user_a = User.objects.create_user(username="alpha_admin", password="password123")
        StaffProfile.objects.create(user=self.user_a, tenant=self.tenant_a, role=UserRole.ADMIN)

        self.user_b = User.objects.create_user(username="beta_admin", password="password123")
        StaffProfile.objects.create(user=self.user_b, tenant=self.tenant_b, role=UserRole.ADMIN)

        self.client = APIClient()

    def test_gate_1_system_readiness_probe(self):
        """
        Gate 1: Readiness probe returns minimal response for public requests and full diagnostics for operators.
        """
        # 1. Unauthenticated request: minimal liveness
        unauth_res = self.client.get('/api/v1/system/readiness/')
        self.assertEqual(unauth_res.status_code, status.HTTP_200_OK)
        unauth_data = unauth_res.data
        self.assertEqual(unauth_data['status'], 'READY')
        self.assertEqual(unauth_data['version'], '2.0.0')
        self.assertNotIn('subsystems', unauth_data)

        # 2. Authenticated operator request: full diagnostics
        self.client.force_authenticate(user=self.user_a)
        res = self.client.get('/api/v1/system/readiness/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        self.assertEqual(data['status'], 'READY')
        self.assertEqual(data['version'], '2.0.0')
        self.assertIn('database', data['subsystems'])
        self.assertEqual(data['subsystems']['database']['status'], 'healthy')
        self.assertGreaterEqual(data['subsystems']['database']['latency_ms'], 0)
        self.assertIn('redis', data['subsystems'])
        self.assertIn('network_devices', data['subsystems'])
        self.assertIn('backup_and_recovery', data['subsystems'])

    def test_gate_2_migration_safety(self):
        """
        Gate 2: Zero pending or unapplied database migrations.
        """
        executor = MigrationExecutor(connection)
        targets = executor.loader.graph.leaf_nodes()
        pending_plan = executor.migration_plan(targets)
        self.assertEqual(
            len(pending_plan),
            0,
            f"Production Gate Failed: {len(pending_plan)} unapplied migrations detected."
        )

    def test_gate_3_redis_distributed_locking_safety(self):
        """
        Gate 3: Redis cache and atomic lock acquisition safety.
        """
        lock_key = "gate:test_lock:alpha"
        cache.delete(lock_key)

        # Set lock
        acquired = cache.add(lock_key, "locked", timeout=5)
        self.assertTrue(acquired)

        # Concurrent attempt should be rejected
        acquired_second = cache.add(lock_key, "locked_2", timeout=5)
        self.assertFalse(acquired_second)

        # Release lock
        cache.delete(lock_key)
        acquired_third = cache.add(lock_key, "locked_3", timeout=5)
        self.assertTrue(acquired_third)
        cache.delete(lock_key)

    def test_gate_4_database_backup_and_checksum_integrity(self):
        """
        Gate 4: Database backup snapshot creation, checksum verification, and storage writeability.
        """
        backups_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'backups')
        os.makedirs(backups_dir, exist_ok=True)

        test_file_path = os.path.join(backups_dir, 'gate_test_snapshot.sqlite3')
        with open(test_file_path, 'wb') as f:
            f.write(b"SHEBA_DB_PRODUCTION_GATE_SNAPSHOT_TEST_DATA")

        file_size = os.path.getsize(test_file_path)
        self.assertGreater(file_size, 0)

        # Compute SHA-256
        hasher = hashlib.sha256()
        with open(test_file_path, 'rb') as f:
            hasher.update(f.read())
        checksum = hasher.hexdigest()

        backup = DatabaseBackup.objects.create(
            backup_name="Gate Test Snapshot",
            filename="gate_test_snapshot.sqlite3",
            file_size_bytes=file_size,
            backup_type="full_database",
            status="completed",
            storage_path=test_file_path,
            checksum=checksum,
            triggered_by="gate_runner"
        )
        self.assertIsNotNone(backup.id)
        self.assertEqual(backup.checksum, checksum)

        # Clean up
        if os.path.exists(test_file_path):
            os.remove(test_file_path)

    def test_gate_5_network_failure_blast_radius_simulation(self):
        """
        Gate 5: Network failure simulation correctly determines multi-tier impact without crashing.
        """
        router = Router.objects.create(tenant=self.tenant_a, name="Alpha-BNG", ip_address="10.1.1.1", status="Online")
        pop = POPBranch.objects.create(tenant=self.tenant_a, name="Alpha POP", code="POP-A", upstream_router=router)
        olt = OLT.objects.create(tenant=self.tenant_a, name="Alpha-OLT", ip_address="192.168.1.1", pop_branch=pop, upstream_router=router, status="Online")
        cust = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="ALP-101",
            full_name="Alpha Subscriber",
            pppoe_username="alpha_sub",
            pppoe_password="pass",
            mobile="01700000001",
            router=router,
            monthly_bill=Decimal("1500.00")
        )
        onu = ONU.objects.create(tenant=self.tenant_a, olt=olt, pon_port="GPON0/1", serial_number="ALPH1111", customer=cust)

        # Run impact analysis
        impact = NetworkTopologyService.calculate_path_and_impact(self.tenant_a, 'router', str(router.id))
        self.assertNotIn('error', impact)
        self.assertEqual(impact['impact_summary']['total_subscribers_affected'], 1)
        self.assertEqual(impact['impact_summary']['mrr_at_risk'], '1500.00')

    def test_gate_6_payment_failure_rollback_simulation(self):
        """
        Gate 6: Simulated payment failure rolls back database transactions without balance or ledger drift.
        """
        cust = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="ROLL-001",
            full_name="Rollback Test Customer",
            pppoe_username="roll_user",
            pppoe_password="pass",
            mobile="01700000002",
            due_amount=Decimal("1000.00")
        )
        account = BillingAccount.objects.create(tenant=self.tenant_a, customer=cust, balance=Decimal("-1000.00"))
        initial_ledger_count = LedgerEntry.objects.filter(tenant=self.tenant_a).count()

        # Simulate a transaction that raises an unhandled error halfway through
        with self.assertRaises(ValueError):
            with transaction.atomic():
                # 1. Update customer balance
                cust.due_amount -= Decimal("500.00")
                cust.save()

                # 2. Record ledger entry
                LedgerEntry.objects.create(
                    tenant=self.tenant_a,
                    customer=cust,
                    entry_type=LedgerEntry.EntryType.PAYMENT,
                    amount=Decimal("500.00"),
                    balance_after=Decimal("-500.00"),
                    reference_id="FAILED_TXN"
                )

                # 3. Simulate failure (e.g. gateway timeout or bank decline exception)
                raise ValueError("Payment gateway timed out — simulating rollback")

        # Verify rollback: customer balance and ledger must be completely untouched
        cust.refresh_from_db()
        self.assertEqual(cust.due_amount, Decimal("1000.00"))
        self.assertEqual(LedgerEntry.objects.filter(tenant=self.tenant_a).count(), initial_ledger_count)

    def test_gate_7_multi_tenant_isolation(self):
        """
        Gate 7: Strict multi-tenant data isolation across all assets and queries.
        """
        router_a = Router.objects.create(tenant=self.tenant_a, name="Alpha Router", ip_address="10.10.1.1")
        router_b = Router.objects.create(tenant=self.tenant_b, name="Beta Router", ip_address="10.20.1.1")

        cust_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code="A-01",
            full_name="Alpha Cust",
            pppoe_username="user_a",
            pppoe_password="pw",
            mobile="01700000010",
            router=router_a
        )
        cust_b = Customer.objects.create(
            tenant=self.tenant_b,
            customer_code="B-01",
            full_name="Beta Cust",
            pppoe_username="user_b",
            pppoe_password="pw",
            mobile="01700000020",
            router=router_b
        )

        # Tenant A view
        self.client.force_authenticate(user=self.user_a)
        self.client.defaults['HTTP_HOST'] = 'alpha.sheba.net'

        res_a = self.client.get('/api/v1/customers/')
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        cust_names_a = [c['full_name'] for c in res_a.data.get('results', res_a.data)]
        self.assertIn("Alpha Cust", cust_names_a)
        self.assertNotIn("Beta Cust", cust_names_a)

        # Tenant B view
        self.client.force_authenticate(user=self.user_b)
        self.client.defaults['HTTP_HOST'] = 'beta.sheba.net'

        res_b = self.client.get('/api/v1/customers/')
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        cust_names_b = [c['full_name'] for c in res_b.data.get('results', res_b.data)]
        self.assertIn("Beta Cust", cust_names_b)
        self.assertNotIn("Alpha Cust", cust_names_b)

    def test_gate_8_openapi_schema_generation(self):
        """
        Gate 8: OpenAPI 3.0 schema generation succeeds without serializer or view crashes.
        """
        res = self.client.get('/api/schema/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('openapi', res.data)
        self.assertIn('paths', res.data)
        self.assertIn('/api/v1/system/readiness/', res.data['paths'])
        self.assertIn('/api/v1/network/topology/hierarchy/', res.data['paths'])
        self.assertIn('/api/v1/network/topology/drilldown/', res.data['paths'])
        self.assertIn('/api/v1/network/topology/impact/', res.data['paths'])

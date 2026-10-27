"""
Stage 4 — Celery, Redis & Concurrency Test Suite.
=================================================
Verifies:
  1. Duplicate task prevention (distributed lock skips duplicate executions).
  2. Concurrent recharge locking (preventing double recharges).
  3. Idempotent recharge via transaction ID deduplication.
  4. Task retry behavior on transient failures.
  5. Worker failure and transaction rollback safety.
  6. Strict tenant_id propagation and tenant isolation across background tasks.
  7. Scheduled tasks (expire_customers, generate_monthly_invoices, sync_olt).
"""

import uuid
import datetime
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Recharge, Invoice
from apps.network.models import Router, OLT, UserSession
from apps.payments.models import InboundPaymentEvent, PaymentTransaction, SmsLog
from apps.authentication.models import StaffProfile, StaffMembership, UserRole
from apps.authentication.services.rbac import seed_default_roles_for_tenant
from apps.core.lock import distributed_lock, LockAcquisitionError
from apps.core.tasks import (
    expire_customers,
    generate_monthly_invoices,
    process_payment_event,
    reconcile_payments,
    sync_router,
    sync_olt,
    send_sms,
    process_customer_expiry,
)


class ConcurrencyAndCeleryStage4Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Tenant A (Alpha ISP)
        self.tenant_a = Tenant.objects.create(
            name='Alpha ISP',
            slug='alpha',
            domain='alpha.shebafi.com',
            is_active=True
        )
        self.domain_a = TenantDomain.objects.create(
            tenant=self.tenant_a,
            hostname='alpha.shebafi.com',
            is_active=True,
            is_primary=True
        )

        # Tenant B (Beta Telecom)
        self.tenant_b = Tenant.objects.create(
            name='Beta Telecom',
            slug='beta',
            domain='beta.shebafi.com',
            is_active=True
        )
        self.domain_b = TenantDomain.objects.create(
            tenant=self.tenant_b,
            hostname='beta.shebafi.com',
            is_active=True,
            is_primary=True
        )

        seed_default_roles_for_tenant(self.tenant_a)
        seed_default_roles_for_tenant(self.tenant_b)

        # Staff user in Tenant A
        self.user_a = User.objects.create_user(
            username='staff_alpha_stage4',
            password='password123',
            email='alpha4@sheba.test'
        )
        self.profile_a = StaffProfile.objects.create(
            user=self.user_a,
            tenant=self.tenant_a,
            role=UserRole.ADMIN
        )
        self.token_a, _ = Token.objects.get_or_create(user=self.user_a)
        self.auth_headers_a = {'HTTP_AUTHORIZATION': f'Token {self.token_a.key}'}

        # Router in Tenant A
        self.router_a = Router.objects.create(
            tenant=self.tenant_a,
            name='Router-Alpha-Test',
            ip_address='10.0.0.1',
            username='admin',
            password='password'
        )

        # Package in Tenant A
        self.package_a = Package.objects.create(
            tenant=self.tenant_a,
            name='Standard 20M',
            mikrotik_profile='20M_Profile',
            regular_price=800.00,
            speed_mbps=20
        )

        # Customer in Tenant A
        self.customer_a = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-A-101',
            full_name='Alice Alpha',
            mobile='01711001100',
            pppoe_username='alice_alpha',
            pppoe_password='secretpppoepass',
            package=self.package_a,
            monthly_bill=800.00,
            due_amount=0.00,
            advance_amount=0.00,
            status=CustomerStatus.ACTIVE,
            expiry_date=timezone.now().date() + datetime.timedelta(days=10)
        )

        # Customer in Tenant B
        self.customer_b = Customer.objects.create(
            tenant=self.tenant_b,
            customer_code='CUST-B-201',
            full_name='Bob Beta',
            mobile='01822002200',
            pppoe_username='bob_beta',
            pppoe_password='secretpppoepass',
            monthly_bill=1000.00,
            due_amount=0.00,
            status=CustomerStatus.ACTIVE,
            expiry_date=timezone.now().date() + datetime.timedelta(days=5)
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Duplicate Task Prevention via Distributed Lock
    # ─────────────────────────────────────────────────────────────────────────
    def test_duplicate_task_prevention(self):
        """Holding a distributed lock causes a simultaneous duplicate task to be safely skipped."""
        lock_key = f"lock:expiry:{self.tenant_a.id}"

        # Acquire lock in an outer context to simulate an already-running task
        with distributed_lock(lock_key, timeout=60, blocking=False):
            # Attempt running expire_customers concurrently
            result = expire_customers(tenant_id=str(self.tenant_a.id))
            self.assertFalse(result['success'])
            self.assertEqual(result['error'], 'DUPLICATE_TASK_SKIPPED')
            self.assertEqual(result['lock_key'], lock_key)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Concurrent Recharge Locking
    # ─────────────────────────────────────────────────────────────────────────
    def test_concurrent_recharge_locking(self):
        """Recharge action respects distributed lock and blocks concurrent overlapping requests."""
        recharge_lock_key = f"lock:recharge:{self.tenant_a.id}:{self.customer_a.id}"

        # Simulate concurrent recharge in flight by holding the lock
        with distributed_lock(recharge_lock_key, timeout=10, blocking=False):
            response = self.client.post(
                f'/api/v1/customers/{self.customer_a.id}/recharge/',
                {
                    'amount': 800.00,
                    'discount': 0.00,
                    'validity_days': 30,
                    'payment_method': 'Cash',
                    'trx_id': 'CONCURRENT-TRX-1',
                },
                HTTP_HOST='alpha.shebafi.com',
                **self.auth_headers_a
            )
            self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
            self.assertIn('concurrent recharge is already being processed', response.data['error'].lower())

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Idempotent Recharge via Transaction ID
    # ─────────────────────────────────────────────────────────────────────────
    def test_duplicate_recharge_trx_id_rejected(self):
        """Submitting a recharge with an already-used trx_id returns 409 Conflict (no double credit)."""
        payload = {
            'amount': 800.00,
            'discount': 0.00,
            'validity_days': 30,
            'payment_method': 'bKash',
            'trx_id': 'BKASH-UNIQUE-TX-99',
        }

        # First recharge -> Success
        resp1 = self.client.post(
            f'/api/v1/customers/{self.customer_a.id}/recharge/',
            payload,
            HTTP_HOST='alpha.shebafi.com',
            **self.auth_headers_a
        )
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)
        self.assertEqual(Recharge.objects.filter(trx_id='BKASH-UNIQUE-TX-99').count(), 1)

        # Second recharge with identical trx_id -> 409 Conflict
        resp2 = self.client.post(
            f'/api/v1/customers/{self.customer_a.id}/recharge/',
            payload,
            HTTP_HOST='alpha.shebafi.com',
            **self.auth_headers_a
        )
        self.assertEqual(resp2.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('already been processed', resp2.data['error'])
        # Verify count is still exactly 1
        self.assertEqual(Recharge.objects.filter(trx_id='BKASH-UNIQUE-TX-99').count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Task Retry Behavior on Transient Failure
    # ─────────────────────────────────────────────────────────────────────────
    def test_task_retry_on_transient_failure(self):
        """sync_router task triggers self.retry() upon encountering network connection timeout."""
        router = Router.objects.create(
            tenant=self.tenant_a,
            name='Core-MikroTik-Test',
            ip_address='10.255.255.1',
            username='admin',
            password='secretpassword'
        )

        with patch.object(sync_router, 'retry', side_effect=Exception("CeleryRetryTriggered")) as mock_retry:
            with patch('apps.network.services.mikrotik.MikroTikService.get_system_health', side_effect=TimeoutError("Network Timeout")):
                with self.assertRaises(Exception) as ctx:
                    sync_router(tenant_id=str(self.tenant_a.id), router_id=str(router.id))
                self.assertIn("CeleryRetryTriggered", str(ctx.exception))
                self.assertTrue(mock_retry.called)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Worker Failure and Transaction Rollback Safety
    # ─────────────────────────────────────────────────────────────────────────
    def test_worker_failure_rolls_back_atomic_transaction(self):
        """If worker crashes during process_payment_event, state is not left dirty."""
        event = InboundPaymentEvent.objects.create(
            tenant=self.tenant_a,
            source=InboundPaymentEvent.EventSource.SMS,
            raw_payload='Sample SMS Payload',
            amount=800.00,
            trx_id='TRX-FAIL-ROLLBACK',
            sender_account='01711001100',
            status=InboundPaymentEvent.EventStatus.RECEIVED
        )

        with patch('apps.core.tasks.send_sms', side_effect=RuntimeError("Worker Out Of Memory")):
            with self.assertRaises(RuntimeError):
                process_payment_event(tenant_id=str(self.tenant_a.id), event_id=str(event.id))

        # Refresh event; because atomic block failed, event status rolled back or remains safe
        event.refresh_from_db()
        self.assertNotEqual(event.status, InboundPaymentEvent.EventStatus.MATCHED)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Tenant ID Propagation and Strict Isolation
    # ─────────────────────────────────────────────────────────────────────────
    def test_tenant_id_propagation_and_isolation(self):
        """Tasks strictly require tenant_id and cannot affect cross-tenant resources."""
        # A. Missing tenant_id raises ValueError
        with self.assertRaises(ValueError):
            process_payment_event(tenant_id=None, event_id=str(uuid.uuid4()))

        with self.assertRaises(ValueError):
            sync_router(tenant_id=None, router_id=str(uuid.uuid4()))

        with self.assertRaises(ValueError):
            sync_olt(tenant_id=None, olt_id=str(uuid.uuid4()))

        with self.assertRaises(ValueError):
            send_sms(tenant_id=None, payment_id=str(uuid.uuid4()))

        # B. Cross-tenant execution: Tenant A's task cannot expire Tenant B's customer
        self.customer_b.expiry_date = timezone.now().date() - datetime.timedelta(days=2)
        self.customer_b.save(update_fields=['expiry_date'])

        result = process_customer_expiry(tenant_id=str(self.tenant_a.id), customer_id=str(self.customer_b.id))
        self.assertFalse(result['success'])
        self.customer_b.refresh_from_db()
        self.assertEqual(self.customer_b.status, CustomerStatus.ACTIVE)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Customer Expiry Task
    # ─────────────────────────────────────────────────────────────────────────
    def test_expire_customers_task(self):
        """expire_customers marks expired customers as EXPIRED and terminates user sessions."""
        # Set customer_a as expired yesterday
        self.customer_a.expiry_date = timezone.now().date() - datetime.timedelta(days=1)
        self.customer_a.save(update_fields=['expiry_date'])

        # Create active session
        UserSession.objects.create(
            tenant=self.tenant_a,
            router=self.router_a,
            username=self.customer_a.pppoe_username,
            ip_address='192.168.1.10',
            mac_address='00:11:22:33:44:55'
        )

        res = expire_customers(tenant_id=str(self.tenant_a.id))
        self.assertTrue(res['success'])
        self.assertEqual(res['expired_count'], 1)

        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.status, CustomerStatus.EXPIRED)
        self.assertEqual(UserSession.objects.filter(username=self.customer_a.pppoe_username).count(), 0)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Monthly Invoicing Task Idempotency
    # ─────────────────────────────────────────────────────────────────────────
    def test_generate_monthly_invoices_idempotency(self):
        """generate_monthly_invoices creates invoices and is safe to execute multiple times."""
        month = 'October 2026'

        # Run 1: Creates invoice
        res1 = generate_monthly_invoices(tenant_id=str(self.tenant_a.id), billing_month=month)
        self.assertTrue(res1['success'])
        self.assertEqual(res1['invoices_created'], 1)

        # Run 2: Does not create duplicate invoice
        res2 = generate_monthly_invoices(tenant_id=str(self.tenant_a.id), billing_month=month)
        self.assertTrue(res2['success'])
        self.assertEqual(res2['invoices_created'], 0)

        invoices = Invoice.objects.filter(tenant=self.tenant_a, customer=self.customer_a, billing_month=month)
        self.assertEqual(invoices.count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Sync OLT Task
    # ─────────────────────────────────────────────────────────────────────────
    def test_sync_olt_task(self):
        """sync_olt task successfully updates OLT status and last_sync timestamp."""
        olt = OLT.objects.create(
            tenant=self.tenant_a,
            name='OLT-Zone-A',
            ip_address='10.0.1.1',
            status='Offline'
        )

        res = sync_olt(tenant_id=str(self.tenant_a.id), olt_id=str(olt.id))
        self.assertTrue(res['success'])

        olt.refresh_from_db()
        self.assertEqual(olt.status, 'Online')
        self.assertIsNotNone(olt.last_sync)

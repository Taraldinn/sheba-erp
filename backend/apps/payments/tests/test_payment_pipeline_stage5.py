"""
Stage 5 — Payment Event Pipeline Test Suite.
=============================================

Tests:
1. Webhook is ingestion-only (validates, stores event, returns 202 Accepted quickly).
2. Duplicate webhook deduplication.
3. Duplicate SMS deduplication.
4. Same reference ID cannot double-credit.
5. Same transaction ID cannot double-credit.
6. Wrong / unknown customer transitions to safe UNMATCHED state with 0 financial effects.
7. Unmatched payment recovery via staff resolve endpoint.
8. Concurrent event processing guarded by distributed lock and atomic transactions.
9. Worker retry triggered on transient failures.
"""

import uuid
import datetime
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, TenantDomain
from apps.authentication.models import StaffProfile, UserRole
from apps.authentication.services.rbac import seed_default_roles_for_tenant
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package, Recharge
from apps.payments.models import (
    InboundPaymentEvent, PaymentTransaction, SmsLog, TransactionStatus
)
from apps.finance.models import LedgerEntry, BillingAccount
from apps.core.tasks import process_payment_event
from apps.core.lock import distributed_lock

User = get_user_model()


class PaymentPipelineStage5Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Tenant Setup
        self.tenant = Tenant.objects.create(
            name='SpeedNet Fiber',
            slug='speednet',
            domain='speednet.shebafi.com',
            is_active=True
        )
        self.domain = TenantDomain.objects.create(
            tenant=self.tenant,
            hostname='speednet.shebafi.com',
            is_active=True,
            is_primary=True
        )

        seed_default_roles_for_tenant(self.tenant)

        # 2. Staff User Setup for Recovery API
        self.staff_user = User.objects.create_user(
            username='billing_agent_s5',
            password='password123',
            email='billing@speednet.test'
        )
        self.staff_profile = StaffProfile.objects.create(
            user=self.staff_user,
            tenant=self.tenant,
            role=UserRole.BILLING
        )
        self.token, _ = Token.objects.get_or_create(user=self.staff_user)
        self.auth_headers = {'HTTP_AUTHORIZATION': f'Token {self.token.key}'}

        # 3. Package Setup
        self.package = Package.objects.create(
            tenant=self.tenant,
            name='Turbo 50 Mbps',
            regular_price=1000.00,
            speed_mbps=50
        )

        # 4. Customer Setup
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code='CUST-501',
            full_name='Tanvir Rahman',
            mobile='01799887766',
            pppoe_username='tanvir_net',
            pppoe_password='tanvirpassword',
            package=self.package,
            monthly_bill=1000.00,
            due_amount=1000.00,
            advance_amount=0.00,
            status=CustomerStatus.EXPIRED,
            expiry_date=timezone.now().date() - datetime.timedelta(days=2)
        )

        # Ensure default host header matches tenant
        self.client.defaults['HTTP_HOST'] = 'speednet.shebafi.com'

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Webhook Ingestion-Only (HTTP 202 Accepted)
    # ─────────────────────────────────────────────────────────────────────────
    def test_webhook_ingestion_only(self):
        """
        Webhook validates input, stores event in RECEIVED status, and returns
        HTTP 202 Accepted immediately without synchronous recharge in the HTTP view.
        """
        url = reverse('sms-webhook')
        sample_sms = (
            "You have received Tk 1000.00 from 01799887766. "
            "Fee Tk 0.00. Balance Tk 45000.00. TrxID 9K9L9M9N. Ref tanvir_net"
        )

        # Mock process_payment_event.delay to verify ingestion-only behavior
        with patch('apps.payments.views.process_payment_event.delay') as mock_delay:
            resp = self.client.post(url, {
                'sender': 'bKash',
                'message': sample_sms
            })

            # Must return 202 Accepted immediately
            self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
            self.assertEqual(resp.data['status'], 'accepted')
            self.assertIn('event_id', resp.data)

            # Celery task must have been dispatched
            self.assertTrue(mock_delay.called)

            # Customer must NOT be modified synchronously
            self.customer.refresh_from_db()
            self.assertEqual(self.customer.status, CustomerStatus.EXPIRED)
            self.assertEqual(PaymentTransaction.objects.filter(customer=self.customer).count(), 0)

            # InboundPaymentEvent must exist in RECEIVED status
            event = InboundPaymentEvent.objects.get(id=resp.data['event_id'])
            self.assertEqual(event.status, InboundPaymentEvent.EventStatus.RECEIVED)
            self.assertEqual(event.tenant, self.tenant)
            self.assertEqual(event.trx_id, '9K9L9M9N')

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Duplicate Webhook Deduplication
    # ─────────────────────────────────────────────────────────────────────────
    def test_duplicate_webhook(self):
        """
        Submitting identical webhook messages with the same TrxID does not create
        duplicate transactions or double-credit the customer.
        """
        url = reverse('sms-webhook')
        sample_sms = (
            "You have received Tk 1000.00 from 01799887766. "
            "Fee Tk 0.00. Balance Tk 45000.00. TrxID TX-DUP-WEBHOOK-1"
        )

        # First delivery -> Processed
        res1 = self.client.post(url, {'sender': 'bKash', 'message': sample_sms})
        self.assertEqual(res1.status_code, status.HTTP_202_ACCEPTED)

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, CustomerStatus.ACTIVE)
        self.assertEqual(PaymentTransaction.objects.filter(trx_id='TX-DUP-WEBHOOK-1').count(), 1)
        self.assertEqual(Recharge.objects.filter(trx_id='TX-DUP-WEBHOOK-1').count(), 1)

        first_expiry = self.customer.expiry_date

        # Second delivery with identical TrxID -> Returns 202 with idempotent=True
        res2 = self.client.post(url, {'sender': 'bKash', 'message': sample_sms})
        self.assertEqual(res2.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(res2.data.get('idempotent'))

        # Verify no double credit occurred
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.expiry_date, first_expiry)
        self.assertEqual(PaymentTransaction.objects.filter(trx_id='TX-DUP-WEBHOOK-1').count(), 1)
        self.assertEqual(Recharge.objects.filter(trx_id='TX-DUP-WEBHOOK-1').count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Duplicate SMS Deduplication (Android App Forwarding)
    # ─────────────────────────────────────────────────────────────────────────
    def test_duplicate_sms(self):
        """
        Forwarding the same SMS via the event API twice sets the second event
        to DUPLICATE and produces zero additional financial entries.
        """
        events_url = '/api/v1/payments/events/'
        payload = {
            'source': 'SMS',
            'provider': 'Nagad',
            'amount': 1000.00,
            'trx_id': 'NAGAD-SMS-DUP-88',
            'sender_account': '01799887766',
            'reference_id': 'tanvir_net',
            'raw_payload': 'Nagad payment received Tk 1000.00 from 01799887766 TrxID NAGAD-SMS-DUP-88'
        }

        # First SMS -> MATCHED
        res1 = self.client.post(events_url, payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_202_ACCEPTED)

        event1 = InboundPaymentEvent.objects.get(id=res1.data['event_id'])
        self.assertEqual(event1.status, InboundPaymentEvent.EventStatus.MATCHED)
        self.assertEqual(PaymentTransaction.objects.filter(trx_id='NAGAD-SMS-DUP-88').count(), 1)

        # Second SMS -> Idempotent accepted / DUPLICATE
        res2 = self.client.post(events_url, payload, format='json')
        self.assertEqual(res2.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(res2.data.get('idempotent'))

        # Still only 1 transaction and 1 recharge
        self.assertEqual(PaymentTransaction.objects.filter(trx_id='NAGAD-SMS-DUP-88').count(), 1)
        self.assertEqual(Recharge.objects.filter(trx_id='NAGAD-SMS-DUP-88').count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Same Reference ID Cannot Double-Credit
    # ─────────────────────────────────────────────────────────────────────────
    def test_same_reference(self):
        """
        Two payment events with different TrxIDs but identical reference_id
        cannot double credit if the reference was already matched and processed.
        """
        # Event 1 with reference 'tanvir_net'
        event1 = InboundPaymentEvent.objects.create(
            tenant=self.tenant,
            source=InboundPaymentEvent.EventSource.SMS,
            amount=1000.00,
            trx_id='TRX-REF-101',
            sender_account='01799887766',
            reference_id='tanvir_net',
            raw_payload='Event 1',
            status=InboundPaymentEvent.EventStatus.RECEIVED
        )
        res1 = process_payment_event(tenant_id=str(self.tenant.id), event_id=str(event1.id))
        self.assertEqual(res1['result'], 'MATCHED')

        event1.refresh_from_db()
        self.assertEqual(event1.status, InboundPaymentEvent.EventStatus.MATCHED)
        self.assertEqual(PaymentTransaction.objects.filter(tenant=self.tenant).count(), 1)

        # Event 2 with different TrxID but SAME reference_id
        event2 = InboundPaymentEvent.objects.create(
            tenant=self.tenant,
            source=InboundPaymentEvent.EventSource.SMS,
            amount=1000.00,
            trx_id='TRX-REF-102',
            sender_account='01799887766',
            reference_id='tanvir_net',
            raw_payload='Event 2 duplicate ref',
            status=InboundPaymentEvent.EventStatus.RECEIVED
        )
        res2 = process_payment_event(tenant_id=str(self.tenant.id), event_id=str(event2.id))
        self.assertEqual(res2['result'], 'DUPLICATE')

        event2.refresh_from_db()
        self.assertEqual(event2.status, InboundPaymentEvent.EventStatus.DUPLICATE)
        # Verify transaction count is still 1
        self.assertEqual(PaymentTransaction.objects.filter(tenant=self.tenant).count(), 1)
        self.assertEqual(Recharge.objects.filter(tenant=self.tenant).count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Same Transaction ID Cannot Double-Credit
    # ─────────────────────────────────────────────────────────────────────────
    def test_same_transaction(self):
        """
        A transaction cannot produce duplicate financial effects even if triggered
        via direct task invocation or multiple sources.
        """
        event1 = InboundPaymentEvent.objects.create(
            tenant=self.tenant,
            source=InboundPaymentEvent.EventSource.WEBHOOK,
            amount=1000.00,
            trx_id='TRX-SAME-TX-777',
            sender_account='01799887766',
            reference_id='tanvir_net',
            raw_payload='Webhook payload',
            status=InboundPaymentEvent.EventStatus.RECEIVED
        )
        process_payment_event(tenant_id=str(self.tenant.id), event_id=str(event1.id))

        # Check ledger balance
        billing_acct = BillingAccount.objects.get(tenant=self.tenant, customer=self.customer)
        self.assertEqual(billing_acct.total_paid, Decimal('1000.00'))
        ledger_count = LedgerEntry.objects.filter(tenant=self.tenant, customer=self.customer).count()
        self.assertEqual(ledger_count, 2)  # 1 PAYMENT + 1 RECHARGE

        # Second event with exact same TrxID
        event2 = InboundPaymentEvent.objects.create(
            tenant=self.tenant,
            source=InboundPaymentEvent.EventSource.MANUAL,
            amount=1000.00,
            trx_id='TRX-SAME-TX-777',
            sender_account='01799887766',
            reference_id='tanvir_net',
            raw_payload='Manual retry payload',
            status=InboundPaymentEvent.EventStatus.RECEIVED
        )
        res2 = process_payment_event(tenant_id=str(self.tenant.id), event_id=str(event2.id))
        self.assertEqual(res2['result'], 'DUPLICATE')

        # Ledger and transactions must NOT have doubled
        billing_acct.refresh_from_db()
        self.assertEqual(billing_acct.total_paid, Decimal('1000.00'))
        self.assertEqual(LedgerEntry.objects.filter(tenant=self.tenant, customer=self.customer).count(), 2)
        self.assertEqual(PaymentTransaction.objects.filter(trx_id='TRX-SAME-TX-777').count(), 1)

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Wrong Customer Transitions to Safe UNMATCHED State
    # ─────────────────────────────────────────────────────────────────────────
    def test_wrong_customer(self):
        """
        A payment received from an unknown sender/account does NOT credit any
        customer and safely transitions to UNMATCHED.
        """
        url = reverse('sms-webhook')
        unknown_sms = (
            "You have received Tk 1000.00 from 01900000000. "
            "Fee Tk 0.00. Balance Tk 46000.00. TrxID TX-UNKNOWN-CUST-9"
        )
        resp = self.client.post(url, {'sender': 'bKash', 'message': unknown_sms})
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)

        event = InboundPaymentEvent.objects.get(trx_id='TX-UNKNOWN-CUST-9')
        self.assertEqual(event.status, InboundPaymentEvent.EventStatus.UNMATCHED)
        self.assertIn("No customer found", event.processing_error)

        # Zero financial effects
        self.assertEqual(PaymentTransaction.objects.filter(trx_id='TX-UNKNOWN-CUST-9').count(), 0)
        self.assertEqual(Recharge.objects.filter(trx_id='TX-UNKNOWN-CUST-9').count(), 0)
        self.assertEqual(LedgerEntry.objects.filter(tenant=self.tenant).count(), 0)

        # Existing customer unaffected
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, CustomerStatus.EXPIRED)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Unmatched Payment Recovery
    # ─────────────────────────────────────────────────────────────────────────
    def test_unmatched_payment_recovery(self):
        """
        An unmatched payment event can be reviewed and manually resolved by staff
        to link to a specific customer, authoritatively executing recharge.
        """
        # Create an unmatched event
        event = InboundPaymentEvent.objects.create(
            tenant=self.tenant,
            source=InboundPaymentEvent.EventSource.SMS,
            raw_payload='Manual recovery needed SMS without account',
            amount=1000.00,
            trx_id='TX-RECOVERABLE-555',
            sender_account='01999999999',
            reference_id='UNKNOWN_REF',
            status=InboundPaymentEvent.EventStatus.UNMATCHED,
            processing_error='No customer found for account 01999999999'
        )

        resolve_url = f'/api/v1/payments/events/{event.id}/resolve/'

        # Staff resolves event to self.customer
        resolve_resp = self.client.post(
            resolve_url,
            {'customer_id': str(self.customer.id)},
            format='json',
            **self.auth_headers
        )

        self.assertEqual(resolve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resolve_resp.data['status'], 'resolved')
        self.assertEqual(resolve_resp.data['matched_customer_username'], 'tanvir_net')

        # Event is now MATCHED
        event.refresh_from_db()
        self.assertEqual(event.status, InboundPaymentEvent.EventStatus.MATCHED)
        self.assertEqual(event.matched_customer, self.customer)
        self.assertIsNotNone(event.matched_transaction)

        # Customer is activated and recharged
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.status, CustomerStatus.ACTIVE)
        self.assertEqual(PaymentTransaction.objects.filter(trx_id='TX-RECOVERABLE-555').count(), 1)
        self.assertEqual(Recharge.objects.filter(trx_id='TX-RECOVERABLE-555').count(), 1)

        # Attempting to resolve an already matched event returns HTTP 400
        dup_resolve_resp = self.client.post(
            resolve_url,
            {'customer_id': str(self.customer.id)},
            format='json',
            **self.auth_headers
        )
        self.assertEqual(dup_resolve_resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Concurrent Event Processing
    # ─────────────────────────────────────────────────────────────────────────
    def test_concurrent_event_processing(self):
        """
        Distributed lock prevents two worker instances from concurrently processing
        the same payment event.
        """
        event = InboundPaymentEvent.objects.create(
            tenant=self.tenant,
            source=InboundPaymentEvent.EventSource.SMS,
            amount=1000.00,
            trx_id='TRX-CONCURRENT-999',
            sender_account='01799887766',
            reference_id='tanvir_net',
            raw_payload='Concurrent test event',
            status=InboundPaymentEvent.EventStatus.RECEIVED
        )

        lock_key = f"lock:payment_event:{self.tenant.id}:{event.id}"

        # Outer context holds lock to simulate concurrent execution by worker 1
        with distributed_lock(lock_key, timeout=60, blocking=False):
            # Worker 2 attempts execution while lock is held
            res = process_payment_event(tenant_id=str(self.tenant.id), event_id=str(event.id))
            self.assertFalse(res['success'])
            self.assertEqual(res['error'], 'DUPLICATE_TASK_SKIPPED')
            self.assertEqual(res['lock_key'], lock_key)

        # Event remains uncorrupted in RECEIVED state
        event.refresh_from_db()
        self.assertEqual(event.status, InboundPaymentEvent.EventStatus.RECEIVED)

        # Now when lock is released, worker can safely process
        res_after = process_payment_event(tenant_id=str(self.tenant.id), event_id=str(event.id))
        self.assertTrue(res_after['success'])
        self.assertEqual(res_after['result'], 'MATCHED')

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Worker Retry on Transient Failure
    # ─────────────────────────────────────────────────────────────────────────
    def test_worker_retry(self):
        """
        Transient database errors trigger self.retry() on the Celery task.
        """
        from django.db import OperationalError

        event = InboundPaymentEvent.objects.create(
            tenant=self.tenant,
            source=InboundPaymentEvent.EventSource.SMS,
            amount=1000.00,
            trx_id='TRX-RETRY-TEST',
            sender_account='01799887766',
            reference_id='tanvir_net',
            raw_payload='Retry test',
            status=InboundPaymentEvent.EventStatus.RECEIVED
        )

        with patch.object(process_payment_event, 'retry', side_effect=Exception("CeleryRetryTriggered")) as mock_retry:
            with patch('apps.payments.models.InboundPaymentEvent.objects.filter', side_effect=OperationalError("DB Connection Lost")):
                with self.assertRaises(Exception) as ctx:
                    process_payment_event(tenant_id=str(self.tenant.id), event_id=str(event.id))
                self.assertIn("CeleryRetryTriggered", str(ctx.exception))
                self.assertTrue(mock_retry.called)

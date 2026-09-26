"""
Tests for Phase 21 datewise archive query + CSV/JSON export.
"""
import csv
import io
import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import StaffProfile, UserRole
from apps.core.models import Tenant
from apps.network.models import (
    InterfaceSnapshot,
    NetworkSyncJob,
    Router,
    RouterPingResult,
    UserSessionHistory,
)

User = get_user_model()


class ArchiveAPITests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Archive ISP', slug='arch', domain='arch.sheba.net'
        )
        self.admin = User.objects.create_user(username='adminx', password='pw')
        StaffProfile.objects.create(user=self.admin, tenant=self.tenant, role=UserRole.ADMIN)
        self.billing = User.objects.create_user(username='bill', password='pw')
        StaffProfile.objects.create(
            user=self.billing, tenant=self.tenant, role=UserRole.BILLING_OPERATOR
        )
        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'arch.sheba.net'

        self.router = Router.objects.create(
            tenant=self.tenant,
            name='R1',
            ip_address='10.0.0.1',
            status='Online',
            latitude=Decimal('23.0'),
            longitude=Decimal('90.0'),
        )

        now = timezone.now()
        UserSessionHistory.objects.create(
            tenant=self.tenant,
            router=self.router,
            username='cust_one',
            ip_address='100.64.0.1',
            connected_at=now,
            disconnected_at=now,
            duration_seconds=600,
            bytes_in=1024,
            bytes_out=2048,
        )
        NetworkSyncJob.objects.create(
            tenant=self.tenant,
            router=self.router,
            action=NetworkSyncJob.Action.DISABLE_SERVICE,
            status=NetworkSyncJob.JobStatus.SUCCEEDED,
            actor='adminx',
            target_name='cust_one',
            created_at=now,
        )
        InterfaceSnapshot.objects.create(
            tenant=self.tenant,
            router=self.router,
            snapshot_date=timezone.localdate(),
            interfaces=[{'name': 'ether1', 'running': True}],
        )
        RouterPingResult.objects.create(
            tenant=self.tenant,
            router=self.router,
            target='8.8.8.8',
            packet_count=4,
            received=4,
            avg_latency_ms=1.5,
            status='SUCCESS',
            ran_by='adminx',
            ran_at=now,
        )

    def test_session_archive_query(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/network/archive/?type=sessions')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['type'], 'sessions')
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['username'], 'cust_one')

    def test_actions_archive_query(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/network/archive/?type=actions')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['action'], 'DISABLE_SERVICE')

    def test_interface_snapshot_archive_query(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/network/archive/?type=interfaces')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['router_name'], 'R1')

    def test_ping_archive_query(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/network/archive/?type=pings')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['count'], 1)

    def test_invalid_kind(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/network/archive/?type=mango')
        self.assertEqual(res.status_code, 400)

    def test_billing_operator_blocked(self):
        self.client.force_authenticate(user=self.billing)
        res = self.client.get('/api/v1/network/archive/?type=sessions')
        self.assertEqual(res.status_code, 403)

    def test_csv_export(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/network/archive/export/?type=sessions&export_format=csv')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('attachment; filename="network-archive-sessions-', res['Content-Disposition'])
        reader = csv.reader(io.StringIO(b''.join(res.streaming_content).decode('utf-8')))
        rows = list(reader)
        self.assertGreaterEqual(len(rows), 2)  # header + at least one row
        self.assertIn('username', rows[0])

    def test_json_export(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/network/archive/export/?type=actions&export_format=json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/json; charset=utf-8')
        body = json.loads(b''.join(res.streaming_content).decode('utf-8'))
        self.assertEqual(body['type'], 'actions')
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['action'], 'DISABLE_SERVICE')

    def test_date_from_filter_excludes_today(self):
        self.client.force_authenticate(user=self.admin)
        # Use a far-past window that excludes the just-inserted records.
        res = self.client.get('/api/v1/network/archive/?type=sessions&date_from=2000-01-01&date_to=2000-01-02')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['count'], 0)

    def test_router_filter_narrows_results(self):
        self.client.force_authenticate(user=self.admin)
        other = Router.objects.create(
            tenant=self.tenant, name='R2', ip_address='10.0.0.2', status='Online',
            latitude=Decimal('0'), longitude=Decimal('0'),
        )
        res = self.client.get(
            f'/api/v1/network/archive/?type=sessions&router_id={other.id}'
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['count'], 0)

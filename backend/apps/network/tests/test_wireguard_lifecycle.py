"""
Phase 22 — WireGuard full-lifecycle tests:
  - generate_keypair
  - rotate_keys (key material updates, audit ROTATED row, history length)
  - push_to_router (success + failure paths, audit PUSHED row)
  - record_handshakes (state classification + audit on STALE/DEAD)
  - audit_log endpoint surfaces events to the tenant
"""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.authentication.models import StaffProfile, UserRole
from apps.core.models import Tenant
from apps.network.models import (
    WireGuardAuditEvent,
    WireGuardConfig,
    WireGuardHandshake,
)
from apps.network.services.vpn import WireGuardService

User = get_user_model()


class WireGuardLifecycleTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='WG ISP', slug='wg', domain='wg.sheba.net'
        )
        self.admin = User.objects.create_user(username='wgadmin', password='pw')
        StaffProfile.objects.create(
            user=self.admin, tenant=self.tenant, role=UserRole.ADMIN
        )
        self.support = User.objects.create_user(username='wgsupport', password='pw')
        StaffProfile.objects.create(
            user=self.support, tenant=self.tenant, role=UserRole.SUPPORT_STAFF
        )
        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'wg.sheba.net'

        from apps.network.models import Router
        self.router = Router.objects.create(
            tenant=self.tenant,
            name='WG-RTR',
            ip_address='10.0.0.1',
            status='Online',
            latitude=Decimal('0'),
            longitude=Decimal('0'),
        )
        self.config = WireGuardConfig.objects.create(
            tenant=self.tenant,
            router=self.router,
            wg_ip='10.255.0.2/32',
            mik_public_key='AAAA',
            mik_private_key_enc=WireGuardService.encrypt_private_key('B' * 44, self.tenant.id),
            vps_public_key='CCCC',
            endpoint_ip='vps.example.com',
            endpoint_port=51820,
            allowed_ips='10.255.0.0/24',
            mik_private_key_set=True,
        )

    def test_generate_keypair_returns_distinct_keys(self):
        kp1 = WireGuardService.generate_keypair()
        kp2 = WireGuardService.generate_keypair()
        self.assertEqual(len(kp1['private_key']), 44)
        self.assertEqual(len(kp1['public_key']), 44)
        self.assertNotEqual(kp1['private_key'], kp2['private_key'])

    def test_rotate_keys_updates_public_and_audits(self):
        before_pub = self.config.mik_public_key
        keys = WireGuardService.rotate_keys(
            self.config, actor='wgadmin', actor_role='ADMIN',
        )
        self.config.refresh_from_db()
        self.assertNotEqual(self.config.mik_public_key, before_pub)
        self.assertEqual(self.config.key_rotation_count, 1)
        self.assertEqual(self.config.mik_public_key, keys['public_key'])
        # History contains the old key
        self.assertEqual(len(self.config.mik_public_key_history), 1)
        self.assertEqual(self.config.mik_public_key_history[0]['public_key'], before_pub)
        # Audit row recorded
        ev = WireGuardAuditEvent.objects.get(config=self.config, event_type='ROTATED')
        self.assertEqual(ev.actor, 'wgadmin')
        self.assertIn('Rotated MikroTik WireGuard keypair', ev.summary)
        # before/after snapshots
        self.assertIn('mik_public_key_fingerprint', ev.before)
        self.assertIn('mik_public_key_fingerprint', ev.after)
        self.assertNotEqual(ev.before['mik_public_key_fingerprint'], ev.after['mik_public_key_fingerprint'])

    def test_push_to_router_success(self):
        def fake_push(router, script):
            return True, 'ok'

        result = WireGuardService.push_to_router(
            self.config, actor='wgadmin', actor_role='ADMIN',
            push_fn=fake_push,
        )
        self.assertTrue(result['ok'])
        self.assertEqual(result['message'], 'ok')
        self.config.refresh_from_db()
        self.assertEqual(self.config.last_push_status, 'success')
        self.assertTrue(WireGuardAuditEvent.objects.filter(
            config=self.config, event_type='PUSHED').exists())

    def test_push_to_router_no_router(self):
        bare = WireGuardConfig.objects.create(
            tenant=self.tenant,
            router=None,
            wg_ip='10.255.0.3/32',
            mik_public_key='XXXX',
            vps_public_key='YYYY',
            endpoint_ip='vps.example.com',
            endpoint_port=51820,
            allowed_ips='10.255.0.0/24',
        )
        result = WireGuardService.push_to_router(
            bare, actor='wgadmin', actor_role='ADMIN',
        )
        self.assertFalse(result['ok'])
        self.assertIn('No MikroTik', result['message'])

    def test_record_handshakes_classifies_states(self):
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        rows = [
            {'public-key': 'FRESH', 'last-handshake': (now - timedelta(seconds=30)).isoformat(),
             'rx-byte': 100, 'tx-byte': 50, 'endpoint': '1.2.3.4:51820'},
            {'public-key': 'STALE1', 'last-handshake': (now - timedelta(seconds=240)).isoformat(),
             'rx-byte': 1, 'tx-byte': 1, 'endpoint': '1.2.3.4:51820'},
            {'public-key': 'DEAD1', 'last-handshake': (now - timedelta(seconds=600)).isoformat(),
             'rx-byte': 0, 'tx-byte': 0, 'endpoint': '1.2.3.4:51820'},
        ]
        captured = WireGuardService.record_handshakes(
            self.config, fetch_fn=lambda r: rows,
        )
        states = {p['public_key']: p['state'] for p in captured}
        self.assertEqual(states['FRESH'], 'ACTIVE')
        self.assertEqual(states['STALE1'], 'STALE')
        self.assertEqual(states['DEAD1'], 'DEAD')
        # Audit row written for STALE/DEAD
        self.assertTrue(WireGuardAuditEvent.objects.filter(
            config=self.config, event_type='HANDSHAKE_FAILED').exists())

    def test_audit_log_endpoint_returns_events(self):
        WireGuardService.rotate_keys(
            self.config, actor='wgadmin', actor_role='ADMIN',
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            f'/api/v1/network/wireguard/configs/{self.config.id}/audit-log/'
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertGreaterEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['event_type'], 'ROTATED')

    def test_support_can_read_but_not_rotate(self):
        self.client.force_authenticate(user=self.support)
        rotate = self.client.post(
            f'/api/v1/network/wireguard/configs/{self.config.id}/rotate-keys/'
        )
        self.assertEqual(rotate.status_code, 403)
        # Reading is fine
        list_res = self.client.get('/api/v1/network/wireguard/configs/')
        self.assertEqual(list_res.status_code, 200)

    def test_generate_keypair_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/network/wireguard/configs/generate-keypair/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('public_key', res.json())
        self.assertIn('private_key', res.json())

    def test_tenant_audit_log_endpoint(self):
        WireGuardService.rotate_keys(
            self.config, actor='wgadmin', actor_role='ADMIN',
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/network/wireguard/configs/audit-log/')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.json()['count'], 1)

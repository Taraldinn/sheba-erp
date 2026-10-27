"""
Phase 23: integration tests for the ported PHP controllers.

  * SMS balance         → ``sms_balance_controller.php``
  * Call-center legacy   → ``call_center_controller.php``
  * Usage tracking       → ``usage_controller.php``

These tests run fully offline — MikroTik clients, HTTP drivers and the SMS
cache are all stubbed via the dependency seams we added to the services.
"""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.authentication.models import StaffMembership, StaffProfile, UserRole
from apps.callcenter.models import (
    CallLog,
    CustomerFollowup,
    IPPhoneConfig,
    IPPhoneNumber,
    ReminderTemplate,
    VoiceCampaign,
    VoiceCampaignItem,
)
from apps.callcenter.services.ip_phone import (
    FlemsoftDriver, GenericRestDriver, encrypt_token, decrypt_token,
)
from apps.core.models import CompanySetting, Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router, UsageLog
from apps.network.usage import (
    compute_live_rates,
    format_bytes,
    format_uptime,
    get_usage_charts,
    get_usage_reports_data,
    sync_router_usage,
)
from django.utils import timezone as djtz
from datetime import timedelta as _td

User = get_user_model()


class _SingleProcessCache:
    """Provide an in-memory cache adapter so the service module can use
    Django's ``cache`` API without polluting other tests."""
    _store = {}

    def get(self, key, default=None):
        return self._store.get(key, default)

    def set(self, key, value, timeout=None):
        self._store[key] = value


class _FakeHttp:
    def __init__(self, status=200, body='{"balance": "1234.56"}', get_body=None):
        self.status = status
        self.body = body
        self.get_body = get_body
        self.calls = []

    def post(self, url, fields, timeout=15):
        self.calls.append(('post', url, fields, timeout))
        return self.status, self.body

    def get(self, url, timeout=15):
        self.calls.append(('get', url, timeout))
        if self.get_body is not None:
            return self.status, self.get_body
        return self.status, self.body


# ─────────────────────────────────────────────────────────────────────────────
# SMS balance tests
# ─────────────────────────────────────────────────────────────────────────────

class SmsBalanceTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='SMS ISP', slug='sms-test')
        self.admin = User.objects.create_user(username='smsadmin', password='pw')
        StaffProfile.objects.create(user=self.admin, tenant=self.tenant, role=UserRole.ADMIN)
        self.support = User.objects.create_user(username='smssupport', password='pw')
        StaffProfile.objects.create(
            user=self.support, tenant=self.tenant, role=UserRole.SUPPORT_STAFF
        )
        CompanySetting.objects.create(
            tenant=self.tenant,
            sms_enabled=True,
            sms_api_key='live-key-123',
            sms_provider='Custom URL Gateway',
        )
        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'sms-test.sheba.net'
        cache.clear()

    def _balance_payload(self, balance: str = '1234.56'):
        def post_fn(url, params, timeout):
            return 200, f'{{"response": "{balance}"}}'
        return post_fn

    def test_endpoint_403_when_user_cannot_read_provider(self):
        self.client.force_authenticate(user=self.support)
        res = self.client.get('/api/v1/sms/balance/')
        self.assertEqual(res.status_code, 403)
        self.assertIn('Only admins', res.json()['message'])

    def test_endpoint_403_when_disabled(self):
        CompanySetting.objects.filter(tenant=self.tenant).update(sms_enabled=False)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/sms/balance/')
        self.assertEqual(res.status_code, 403)
        self.assertIn('disabled', res.json()['message'])

    def test_endpoint_403_when_api_key_blank(self):
        CompanySetting.objects.filter(tenant=self.tenant).update(sms_api_key='')
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/sms/balance/')
        self.assertEqual(res.status_code, 403)
        self.assertIn('API key', res.json()['message'])

    def test_endpoint_returns_live_balance_with_injected_http(self):
        self.client.force_authenticate(user=self.admin)
        with patch('apps.callcenter.views.fetch_sheba_sms_balance') as mock:
            from apps.core.sms_balance import BalanceResult
            mock.return_value = BalanceResult(
                success=True, balance=4321.50, checked_at=1700000000,
                cached=False, stale=False, provider='Sheba SMS',
            )
            res = self.client.get('/api/v1/sms/balance/')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['balance'], 4321.50)
        self.assertEqual(body['balance_formatted'], '4321.50')
        self.assertEqual(body['provider'], 'Sheba SMS')
        self.assertIn('checked_at_iso', body)

    def test_endpoint_returns_502_when_provider_fails(self):
        self.client.force_authenticate(user=self.admin)
        with patch('apps.callcenter.views.fetch_sheba_sms_balance') as mock:
            from apps.core.sms_balance import BalanceResult
            mock.return_value = BalanceResult(success=False, message='Connection failed.')
            res = self.client.get('/api/v1/sms/balance/')
        self.assertEqual(res.status_code, 502)
        self.assertFalse(res.json()['success'])


class SmsBalanceHelperTests(TestCase):
    """Pure-Python tests for the cache + parse logic — no HTTP."""

    def setUp(self):
        cache.clear()

    def test_parse_accepts_json_envelope(self):
        from apps.core.sms_balance import _parse_balance_response
        self.assertEqual(_parse_balance_response('{"response": 1234}'), 1234.0)
        self.assertEqual(_parse_balance_response('{"balance": 99.5}'), 99.5)
        self.assertEqual(_parse_balance_response('{"data": {"balance": "12"}}'), 12.0)

    def test_parse_accepts_bare_numeric_string(self):
        from apps.core.sms_balance import _parse_balance_response
        self.assertEqual(_parse_balance_response('1,234.56'), 1234.56)
        self.assertEqual(_parse_balance_response(' 42 '), 42.0)

    def test_parse_rejects_garbage(self):
        from apps.core.sms_balance import _parse_balance_response
        self.assertIsNone(_parse_balance_response(''))
        self.assertIsNone(_parse_balance_response('not a number'))

    def test_fetch_returns_live_balance(self):
        from apps.core.sms_balance import fetch_sheba_sms_balance
        fake = lambda url, params, timeout: (200, '{"balance": "77"}')
        result = fetch_sheba_sms_balance(
            tenant_slug='smoke', api_key='k1', http_post_fn=fake,
        )
        self.assertTrue(result.success)
        self.assertEqual(result.balance, 77.0)
        self.assertFalse(result.cached)
        self.assertFalse(result.stale)

    def test_fetch_serves_from_cache_within_ttl(self):
        from apps.core.sms_balance import fetch_sheba_sms_balance
        success = lambda url, params, timeout: (200, '{"balance": "55"}')
        # First call populates cache
        fetch_sheba_sms_balance(tenant_slug='t', api_key='k2', http_post_fn=success)
        # Subsequent call serves from cache (we use a different http to confirm)
        result = fetch_sheba_sms_balance(
            tenant_slug='t', api_key='k2',
            http_post_fn=lambda *a, **k: (_ for _ in ()).throw(
                AssertionError('live fetch should not be called')
            ),
        )
        self.assertTrue(result.cached)
        self.assertEqual(result.balance, 55.0)

    def test_fetch_falls_back_to_last_known_on_provider_failure(self):
        from apps.core.sms_balance import fetch_sheba_sms_balance
        success = lambda url, params, timeout: (200, '{"balance": "200"}')
        fetch_sheba_sms_balance(tenant_slug='fallback', api_key='k3', http_post_fn=success)
        # Provider outage:
        fail = lambda url, params, timeout: (0, 'Connection failed: nope')
        result = fetch_sheba_sms_balance(
            tenant_slug='fallback', api_key='k3', http_post_fn=fail, force=True,
        )
        self.assertTrue(result.success)
        self.assertEqual(result.balance, 200.0)
        self.assertTrue(result.stale)

    def test_fetch_returns_error_when_no_cache_and_failure(self):
        from apps.core.sms_balance import fetch_sheba_sms_balance
        fail = lambda url, params, timeout: (503, '')
        result = fetch_sheba_sms_balance(
            tenant_slug='no-cache', api_key='k4', http_post_fn=fail,
        )
        self.assertFalse(result.success)
        self.assertIn('HTTP 503', result.message)


# ─────────────────────────────────────────────────────────────────────────────
# IP-Phone driver tests
# ─────────────────────────────────────────────────────────────────────────────

class IPPhoneDriverTests(TestCase):
    def test_encrypt_then_decrypt_round_trip(self):
        plain = 'flemsoft-token-12345'
        cipher = encrypt_token(plain)
        self.assertNotIn(plain, cipher)
        self.assertTrue(cipher.startswith('enc:gcm:v1:'))
        self.assertEqual(decrypt_token(cipher), plain)

    def test_decrypt_legacy_ciphertext(self):
        # Encrypt with the legacy AES-256-CBC pipeline to simulate migrating
        # a row from the PHP database.
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        import base64 as _b64
        from apps.callcenter.services.ip_phone import _aes_key
        key = _aes_key()
        iv = key[:16]
        plain = 'legacy-secret-987'
        pad = 16 - (len(plain) % 16)
        body = plain.encode() + bytes([pad]) * pad
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        enc = cipher.encryptor()
        ct = enc.update(body) + enc.finalize()
        ciphertext = _b64.b64encode(ct).decode()
        self.assertEqual(decrypt_token(ciphertext), plain)

    def test_flemsoft_driver_posts_to_base_url_with_expected_fields(self):
        cfg = {
            'driver': 'flemsoft', 'base_url': 'https://example.test/dial',
            'username': 'flemuser', 'password_token_enc': encrypt_token('tok-abc'),
            'caller_id': '01711000000', 'extension': '101',
            'enabled': True, 'test_mode': True,
        }
        http = _FakeHttp(status=201, body='{"call_status":"Answered","recording_url":"/r/1.wav"}')
        result = FlemsoftDriver(cfg, http=http).click_to_call('01711999999', '101')
        self.assertTrue(result.success)
        self.assertEqual(result.call_status, 'Answered')
        self.assertEqual(result.recording_url, '/r/1.wav')
        # Verify the driver POSTed to the configured URL with the expected payload
        method, url, fields, _ = http.calls[0]
        self.assertEqual(method, 'post')
        self.assertEqual(url, 'https://example.test/dial')
        self.assertEqual(fields['username'], 'flemuser')
        self.assertEqual(fields['token'], 'tok-abc')
        self.assertEqual(fields['callerid'], '01711000000')
        self.assertEqual(fields['phoneno'], '01711999999')

    def test_generic_rest_driver_uses_get_when_placeholders_in_url(self):
        cfg = {
            'driver': 'generic_rest',
            'base_url': 'https://api.test/call?u={USERNAME}&t={TOKEN}&p={PHONE}',
            'username': 'APIUSER', 'password_token_enc': encrypt_token('123'),
            'caller_id': '01711000000', 'extension': '200',
            'enabled': True,
        }
        http = _FakeHttp(status=200, body='OK')
        GenericRestDriver(cfg, http=http).click_to_call('01711000111', '200')
        method, url, _ = http.calls[0]
        self.assertEqual(method, 'get')
        self.assertIn('u=APIUSER', url)
        self.assertIn('t=123', url)
        self.assertIn('p=01711000111', url)


# ─────────────────────────────────────────────────────────────────────────────
# Click-to-call endpoint test
# ─────────────────────────────────────────────────────────────────────────────

class ClickToCallEndpointTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Call ISP', slug='call-isp')
        self.staff = User.objects.create_user(username='caller', password='pw')
        from apps.authentication.models import Role
        admin_role = Role.objects.create(tenant=self.tenant, name='Admin')
        StaffMembership.objects.create(
            user=self.staff, tenant=self.tenant, role=admin_role,
        )
        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'call-isp.sheba.net'

    def test_click_to_call_creates_call_log_via_injected_driver(self):
        config = IPPhoneConfig.objects.create(
            tenant=self.tenant, staff=self.staff,
            driver='flemsoft', base_url='https://example.test/dial',
            username='flemuser',
            password_token_enc=encrypt_token('tok-1'),
            caller_id='01711000000', extension='101', enabled=True,
        )
        self.client.force_authenticate(user=self.staff)

        from apps.callcenter.services.ip_phone import FlemsoftDriver
        with patch.object(FlemsoftDriver, 'click_to_call') as driver_mock:
            from apps.callcenter.services.ip_phone import ClickResult
            driver_mock.return_value = ClickResult(
                success=True, message='OK',
                raw_response='{"call_status":"Answered"}',
                call_status='Answered', recording_url='/r/x.wav', driver='flemsoft',
            )
            res = self.client.post(
                '/api/v1/callcenter/click-to-call/',
                {'phone': '01711999999', 'name': 'Test Customer'},
                format='json',
            )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertFalse(body['is_sip_client'])
        log = CallLog.objects.get(id=body['log_id'])
        self.assertEqual(log.status, 'Answered')
        self.assertEqual(log.customer_name, 'Test Customer')

    def test_click_to_call_returns_400_for_invalid_phone(self):
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            '/api/v1/callcenter/click-to-call/',
            {'phone': 'not-a-phone'}, format='json',
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.json()['success'])


# ─────────────────────────────────────────────────────────────────────────────
# Voice campaign + customer followup tests
# ─────────────────────────────────────────────────────────────────────────────

class VoiceCampaignTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='VC ISP', slug='vc')
        self.staff = User.objects.create_user(username='vcstaff', password='pw')
        StaffProfile.objects.create(
            user=self.staff, tenant=self.tenant, role=UserRole.ADMIN,
        )
        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'vc.sheba.net'
        for i in range(3):
            Customer.objects.create(
                tenant=self.tenant, full_name=f'C{i}', mobile='01711000000',
                pppoe_username=f'user{i}', package=None,
            )
        self.template = ReminderTemplate.objects.create(
            tenant=self.tenant, staff=self.staff,
            name='Due reminder', message_text='Dear [NAME], bill is [AMOUNT] taka.',
        )

    def _customer_with_status(self, status, **overrides):
        base = {
            'tenant': self.tenant, 'full_name': 'Status C',
            'mobile': '01711111111', 'pppoe_username': 'statusc',
        }
        base.update(overrides)
        customer = Customer.objects.create(**base)
        customer.status = status
        customer.save(update_fields=['status'])
        return customer

    def test_create_campaign_for_due_customers(self):
        due = self._customer_with_status(
            CustomerStatus.ACTIVE,
            full_name='Due C', pppoe_username='duec',
            mobile='01711222222', due_amount=Decimal('500.00'),
        )
        # only the customer with positive due should land in the queue; the
        # baseline setUp customers all default to due_amount=0.
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            '/api/v1/reminder-campaigns/',
            {'name': 'Due run', 'template': str(self.template.id), 'target': 'due'},
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.json())
        campaign = VoiceCampaign.objects.get(name='Due run')
        items = list(campaign.items.all())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].customer_id, due.id)
        self.assertEqual(items[0].phone, '8801711222222')

    def test_create_campaign_substitutes_placeholders(self):
        c = self._customer_with_status(
            CustomerStatus.ACTIVE, full_name='Mr Smith',
            pppoe_username='smith', mobile='01711222222',
            due_amount=Decimal('1234.50'),
        )
        self.client.force_authenticate(user=self.staff)
        res = self.client.post(
            '/api/v1/reminder-campaigns/',
            {'name': 'Sub run', 'template': str(self.template.id), 'target': 'due'},
            format='json',
        )
        self.assertEqual(res.status_code, 201)
        item = VoiceCampaignItem.objects.get()
        self.assertIn('Mr Smith', item.body_text)
        self.assertIn('1234.50', item.body_text)


class CustomerFollowupTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='FU ISP', slug='fu')
        self.staff = User.objects.create_user(username='fustaff', password='pw')
        StaffProfile.objects.create(
            user=self.staff, tenant=self.tenant, role=UserRole.ADMIN,
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant, full_name='Cust', mobile='01711000000',
            pppoe_username='c1',
        )
        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'fu.sheba.net'
        self.client.force_authenticate(user=self.staff)

    def test_create_followup_appends_to_customer_remarks(self):
        res = self.client.post(
            '/api/v1/followups/',
            {
                'customer': str(self.customer.id),
                'note': 'Door was locked', 'followup_date': '2099-01-01T10:00:00Z',
                'type': 'Complaint', 'status': 'Pending',
            },
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.json())
        self.customer.refresh_from_db()
        self.assertIn('Door was locked', self.customer.remarks)
        self.assertIn('Follow-up Date:', self.customer.remarks)


# ─────────────────────────────────────────────────────────────────────────────
# Usage tests
# ─────────────────────────────────────────────────────────────────────────────

class UsageServiceTests(TestCase):
    def test_format_bytes_and_uptime(self):
        self.assertEqual(format_bytes(0), '0.00 B')
        self.assertEqual(format_bytes(1024), '1.00 KB')
        self.assertEqual(format_bytes(1024 * 1024 * 1024), '1.00 GB')
        self.assertEqual(format_uptime(0), '0s')
        self.assertEqual(format_uptime(93784), '1d 2h 3m 4s')
        self.assertEqual(format_uptime('3722'), '1h 2m 2s')

    def test_sync_router_usage_persists_per_user(self):
        tenant = Tenant.objects.create(name='Usage', slug='u')
        router = Router.objects.create(
            tenant=tenant, name='router-1', ip_address='10.0.0.1',
            status='Online', latitude=Decimal('0'), longitude=Decimal('0'),
        )

        def fake_sessions(r):
            return [
                {'name': 'alice', 'bytes-in': 1024, 'bytes-out': 2048,
                 'uptime': '1d2h3m4s', 'address': '10.1.1.2',
                 'caller-id': 'AA:BB:CC:DD:EE:FF'},
                {'name': 'bob', 'bytes-in': 9999, 'bytes-out': 8888,
                 'uptime': '00:30:00', 'address': '', 'caller-id': ''},
            ]

        result = sync_router_usage(router, fetch_sessions_fn=fake_sessions)
        self.assertIsNone(result['error'])
        self.assertEqual(result['active_sessions'], 2)
        self.assertEqual(UsageLog.objects.filter(router=router).count(), 2)
        alice = UsageLog.objects.get(username='alice')
        self.assertEqual(alice.upload_bytes, 1024)
        self.assertEqual(alice.download_bytes, 2048)
        self.assertEqual(alice.uptime_seconds, 93784)

    def test_compute_live_rates_per_session_delta(self):
        cache.clear()
        # Snapshot 1 — small counter values
        first = [
            {'username': 'a', 'router_id': '1', 'bytes-in': 1_000_000, 'bytes-out': 1_000_000,
             'uptime': '0s', 'address': '10.0.0.2', 'caller-id': 'AA:AA:AA:AA:AA:AA'},
        ]
        out1 = compute_live_rates(
            '1', 'live-tenant',
            now=100.0, fetch_sessions_fn=lambda: first,
        )
        self.assertEqual(out1['down_speed'], 0.0)

        # Snapshot 2 — same session with substantially larger counters 1s later
        second = [
            {'username': 'a', 'router_id': '1', 'bytes-in': 1_500_000, 'bytes-out': 2_000_000,
             'uptime': '0s', 'address': '10.0.0.2', 'caller-id': 'AA:AA:AA:AA:AA:AA'},
        ]
        out2 = compute_live_rates(
            '1', 'live-tenant',
            now=101.0, fetch_sessions_fn=lambda: second,
        )
        # 500kB in / 1000kB out over 1s ≈ 4/8 Mbps
        self.assertGreater(out2['up_speed'], 0.1)
        self.assertGreater(out2['down_speed'], 0.1)

    def test_get_usage_charts_zero_fills_missing_dates(self):
        tenant = Tenant.objects.create(name='Charts', slug='charts')
        today = djtz.localdate()
        for delta, up in [(0, 1024 * 1024 * 1024), (1, 2 * 1024 * 1024 * 1024)]:
            router = Router.objects.create(
                tenant=tenant, name=f'r-{delta}', ip_address=f'10.0.0.{delta}',
                status='Online', latitude=Decimal('0'), longitude=Decimal('0'),
            )
            UsageLog.objects.create(
                tenant=tenant, router=router, username='u',
                usage_date=today - _td(days=delta),
                upload_bytes=up, download_bytes=up,
            )
        result = get_usage_charts(tenant=tenant, days=4)
        self.assertEqual(len(result['labels']), 4)
        # The first and second slots should be non-zero; later ones are 0
        self.assertGreater(sum(result['upload']), 0)

    def test_get_usage_reports_history_summarises_totals(self):
        tenant = Tenant.objects.create(name='Rep', slug='rep')
        router = Router.objects.create(
            tenant=tenant, name='rep-r', ip_address='10.0.0.10',
            status='Online', latitude=Decimal('0'), longitude=Decimal('0'),
        )
        UsageLog.objects.create(
            tenant=tenant, router=router, username='x',
            usage_date=djtz.localdate(),
            upload_bytes=2048, download_bytes=4096,
        )
        result = get_usage_reports_data(tenant=tenant, report_type='history')
        self.assertIn('summary', result)
        self.assertGreater(result['summary']['total_upload_raw'], 0)
        self.assertEqual(result['records'][0]['username'], 'x')

    def test_check_router_status_view_returns_ping_result(self):
        tenant = Tenant.objects.create(name='CRS', slug='crs')
        router = Router.objects.create(
            tenant=tenant, name='crs-r', ip_address='10.0.0.99',
            status='Online', latitude=Decimal('0'), longitude=Decimal('0'),
        )
        admin = User.objects.create_user(username='crsadm', password='pw')
        StaffProfile.objects.create(user=admin, tenant=tenant, role=UserRole.ADMIN)
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'crs.sheba.net'
        client.force_authenticate(user=admin)
        # patch the view's already-imported reference, not the source module
        from apps.network import views_legacy as vl_mod
        with patch.object(vl_mod, 'check_router_online', return_value=True):
            res = client.get(f'/api/v1/network/usage/router-status/?router_id={router.id}')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['online'])


# ─────────────────────────────────────────────────────────────────────────────
# Helper cleanup so other tests aren't polluted by the in-memory cache
# ─────────────────────────────────────────────────────────────────────────────

class CacheCleanupTests(TestCase):
    def test_cache_is_shared_in_default_test_runner(self):
        from django.core.cache import cache as _c
        _c.set('phase23:wipe', 1, timeout=60)
        self.assertEqual(_c.get('phase23:wipe'), 1)
        _c.delete('phase23:wipe')
        self.assertIsNone(_c.get('phase23:wipe'))

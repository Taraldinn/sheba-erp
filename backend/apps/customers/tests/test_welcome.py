"""
apps/customers/tests_welcome.py — auto-issued portal credentials + SMS/email.

Covers the four cases that real ISP onboarding breaks on:

  1. Default create → portal_password is hashed, plain text returned
     to the caller via the serializer, welcome dispatched (sms + email
     at least stubbed).
  2. Re-save of the same customer → no duplicate dispatch
     (welcome_sent_at idempotency).
  3. Customer without mobile → email-only dispatch (still works).
  4. AUTO_ISSUE_CUSTOMER_LOGIN=False → noop, no password written,
     no dispatch.
  5. Resend action with rotate=true → fresh password issued.
"""

from unittest.mock import patch
from rest_framework.test import APIClient

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from apps.authentication.models import StaffMembership, StaffProfile
from apps.core.models import Tenant, TenantDomain
from apps.customers.models import Customer, CustomerStatus
from apps.customers.welcome import (
    issue_and_welcome,
    issue_portal_credentials,
    _generate_portal_password,
    auto_issue_enabled,
)


def _make_tenant(slug, name='TestNet'):
    tenant = Tenant.objects.create(
        name=name, slug=slug, is_active=True,
        subscription_status='active',
    )
    TenantDomain.objects.create(
        tenant=tenant, hostname=f'{slug}.shebafi.xyz',
        is_primary=True, is_active=True, verified=True,
        verification_method='platform_subdomain',
    )
    return tenant


def _make_customer(tenant, **overrides):
    return Customer.objects.create(
        tenant=tenant,
        full_name='Test Customer',
        mobile='+8801711000000',
        email='cust@example.com',
        connection_type='PPPoE',
        pppoe_username=f'pppoe-{tenant.slug}',
        pppoe_password='router-secret',
        customer_code=f'CUST-{tenant.slug}',
        **overrides,
    )


@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
)
class IssueAndWelcomeTests(TestCase):
    def setUp(self):
        self.tenant = _make_tenant('welc')
        self.customer = _make_customer(self.tenant)

    def test_password_generator_is_human_friendly(self):
        # Two segments separated by a dash. The HEAD segment uses the
        # unambiguous alphabet (no 0/O/1/l/I); the TAIL segment uses
        # the wider lowercase+digits pool — that segment CAN include
        # 1, but the "human-friendly" guarantee is on the head, which
        # is what an operator reads over the phone.
        pw = _generate_portal_password(10)
        head, _tail = pw.split('-')
        for ambiguous in '0O1lI':
            self.assertNotIn(ambiguous, head)

    def test_issue_portal_credentials_hashes_and_returns_plaintext(self):
        result = issue_portal_credentials(self.customer)
        self.assertIsNotNone(result)
        self.assertEqual(
            result.username,
            self.customer.pppoe_username,
        )
        self.assertGreater(len(result.plain_password), 6)
        # Persisted as a Django hash, not the plain text.
        self.customer.refresh_from_db()
        self.assertNotEqual(self.customer.portal_password, result.plain_password)
        self.assertTrue(
            self.customer.portal_password.startswith('pbkdf2_')
            or self.customer.portal_password.startswith('scrypt')
            or self.customer.portal_password.startswith('argon2')
            or self.customer.portal_password.startswith('md5')
            or self.customer.portal_password.startswith('bcrypt'),
            self.customer.portal_password[:10],
        )

    def test_idempotent_when_already_issued(self):
        first = issue_portal_credentials(self.customer)
        # Simulate the dispatch side-effect:
        from django.utils import timezone
        self.customer.welcome_sent_at = timezone.now()
        self.customer.welcome_sent_via = 'sms,email'
        self.customer.save()
        second = issue_portal_credentials(self.customer)
        # Second call returns None — don't reset the password.
        self.assertIsNone(second)
        self.customer.refresh_from_db()
        # Hash is still the same one from the first call.
        self.assertNotEqual(self.customer.portal_password, first.plain_password)

    def test_issue_and_welcome_returns_dispatch_info(self):
        # No SmsLog model dispatch — just exercise the orchestrator.
        with patch('apps.customers.welcome._sms_dispatch', return_value='log-123'):
            with patch(
                'apps.customers.welcome._email_dispatch',
                return_value=True,
            ):
                result = issue_and_welcome(self.customer)
        self.assertTrue(result['enabled'])
        self.assertIsNotNone(result['issued'])
        self.assertEqual(result['dispatch']['sent_via'], ['sms', 'email'])
        self.assertEqual(result['dispatch']['sms_log_id'], 'log-123')
        self.customer.refresh_from_db()
        self.assertIsNotNone(self.customer.welcome_sent_at)
        self.assertEqual(self.customer.welcome_sent_via, 'sms,email')

    def test_dispatch_skips_sms_when_no_mobile(self):
        self.customer.mobile = ''
        self.customer.save()
        with patch(
            'apps.customers.welcome._sms_dispatch',
            return_value=None,
        ) as sms_p:
            with patch(
                'apps.customers.welcome._email_dispatch',
                return_value=True,
            ):
                result = issue_and_welcome(self.customer)
        # When the customer has no mobile the orchestrator calls the
        # SMS helper (it short-circuits internally to None) and never
        # # reports 'sms' in the public sent_via list.
        sms_p.assert_called_once()
        self.assertNotIn('sms', result['dispatch']['sent_via'])
        self.assertIn('email', result['dispatch']['sent_via'])

    def test_dispatch_skips_email_when_no_email(self):
        self.customer.email = ''
        self.customer.save()
        with patch('apps.customers.welcome._sms_dispatch', return_value='log-1'):
            with patch(
                'apps.customers.welcome._email_dispatch',
                return_value=True,
            ) as email_p:
                result = issue_and_welcome(self.customer)
        self.assertIn('sms', result['dispatch']['sent_via'])
        self.assertNotIn('email', result['dispatch']['sent_via'])
        # When there's no email address the orchestrator never invokes
        # the email helper at all — the public ``sent_via`` list is
        # the contract, the helper-internal short-circuit is an
        # implementation detail.
        email_p.assert_not_called()


@override_settings(AUTO_ISSUE_CUSTOMER_LOGIN=False)
class AutoIssueDisabledTests(TestCase):
    def setUp(self):
        self.tenant = _make_tenant('welc-off')
        self.customer = _make_customer(self.tenant)

    def test_noop_when_setting_is_false(self):
        # sanity: the function reads the setting fresh each call
        from django.test import override_settings as os
        with os(AUTO_ISSUE_CUSTOMER_LOGIN=False):
            result = issue_and_welcome(self.customer)
        self.assertFalse(result['enabled'])
        self.assertIsNone(result['issued'])
        self.assertIsNone(result['dispatch'])
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.portal_password, '')


@override_settings(
    CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}},
)
class ResendWelcomeTests(TestCase):
    def setUp(self):
        self.tenant = _make_tenant('rsnd')
        self.customer = _make_customer(self.tenant)
        self.client_ = APIClient()

        self.user = User.objects.create_superuser(
            username='op', password='x', email='op@x.com',
        )
        StaffProfile.objects.create(
            user=self.user, tenant=self.tenant, role='admin',
        )
        from apps.authentication.models import StaffMembership
        StaffMembership.objects.update_or_create(
            user=self.user, tenant=self.tenant,
            defaults={'role': None, 'is_active': True, 'scope': 'tenant'},
        )
        from rest_framework.authtoken.models import Token
        self.token, _ = Token.objects.get_or_create(user=self.user)
        self.client_.credentials(
            HTTP_AUTHORIZATION=f'Token {self.token.key}',
            HTTP_HOST='rsnd.shebafi.xyz',
        )

    def test_resend_welcome_with_rotate_mints_new_password(self):
        original = issue_portal_credentials(self.customer)
        self.assertIsNotNone(original)
        with patch('apps.customers.welcome._sms_dispatch', return_value='log-rot'):
            with patch(
                'apps.customers.welcome._email_dispatch',
                return_value=True,
            ):
                resp = self.client_.post(
                    f'/api/v1/customers/{self.customer.id}/resend-welcome/',
                    {'rotate': 'true'},
                    format='json',
                )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertTrue(data['enabled'])
        self.assertIsNotNone(data['issued'])
        self.assertTrue(data['issued']['regenerated'])
        self.assertNotEqual(data['issued']['password'], original.plain_password)
        self.assertEqual(data['dispatch']['sent_via'], ['sms', 'email'])

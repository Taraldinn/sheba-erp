"""
Tests for the onboarding-request `notify` endpoint (Phase 7 — option A).

The notify endpoint re-sends the claim email to the customer via
`EmailService.send_client_onboarding_email`, passing the operator's claim
URL as `portal_url` so the email body links the customer straight to the
wizard (with `?approval=1&request_id=…&username=…`).
"""
import uuid
from django.test import TestCase, override_settings
from django.core import mail
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from apps.core.models import (
    Tenant, TenantOnboardingRequest, AuditLog,
)


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='test@shebafi.xyz',
)
class OnboardingNotifyEndpointTests(TestCase):
    def setUp(self):
        # Super admin (only IsCentralAdmin can hit the endpoint).
        self.superuser = User.objects.create_superuser(
            username='central_admin',
            email='admin@shebafi.xyz',
            password='MasterSecretPassword123!',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.superuser)

        # Seed a tenant + admin user (mimics what /approve would have set up).
        self.tenant = Tenant.objects.create(
            name='Barisal Broadband',
            slug='barisal-bb',
            domain='barisal.shebafi.xyz',
            contact_email='owner@barisal.net',
            contact_phone='+880 1811-999888',
        )
        self.admin_user = User.objects.create_user(
            username='barisal-bb_admin',
            email='owner@barisal.net',
            password='sheba1234',
        )

        # Create an onboarding request that points at this tenant.
        self.req = TenantOnboardingRequest.objects.create(
            organization_name='Barisal Broadband',
            requested_slug='barisal-bb',
            requested_domain='barisal.shebafi.xyz',
            contact_email='owner@barisal.net',
            contact_phone='+880 1811-999888',
            requested_plan='Growth',
            status='approved',
            admin_notes=f'Approved & provisioned tenant ID {self.tenant.id} by central_admin',
        )

    def test_notify_sends_email_and_returns_claim_url(self):
        mail.outbox.clear()
        url = f'/api/v1/saas/requests/{self.req.id}/notify/'
        claim_url = (
            f'http://testserver/onboarding/barisal-bb/wizard'
            f'?request_id={self.req.id}&approval=1&username=barisal-bb_admin'
        )
        response = self.client.post(
            url,
            {'claim_url': claim_url, 'admin_password': 'sheba1234'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body['sent'])
        self.assertEqual(body['recipient'], 'owner@barisal.net')
        self.assertEqual(body['channel'], 'email')
        self.assertEqual(body['admin_username'], 'barisal-bb_admin')
        self.assertEqual(body['claim_url'], claim_url)
        self.assertIn('audit_log_id', body)
        # One email went out.
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['owner@barisal.net'])
        self.assertIn('Welcome to ShebaFi', email.subject)
        self.assertIn('barisal-bb_admin', email.body)
        # The claim URL must be embedded (the email service treats it as portal_url).
        self.assertIn('wizard', email.body)
        # Audit log row recorded.
        log = AuditLog.objects.get(action='onboarding_request_notify')
        self.assertEqual(log.actor_username, 'central_admin')
        self.assertEqual(log.details['recipient_email'], 'owner@barisal.net')
        self.assertTrue(log.details['sent'])
        self.assertEqual(log.details['channel'], 'email')

    def test_notify_rejects_pending_requests(self):
        self.req.status = 'pending'
        self.req.save()
        url = f'/api/v1/saas/requests/{self.req.id}/notify/'
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('approved', response.json()['error'].lower())

    def test_notify_404_when_admin_user_missing(self):
        self.admin_user.delete()
        url = f'/api/v1/saas/requests/{self.req.id}/notify/'
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, 404)

    def test_notify_requires_authentication(self):
        client = APIClient()  # unauthenticated
        url = f'/api/v1/saas/requests/{self.req.id}/notify/'
        response = client.post(url, {}, format='json')
        # Either 401 (unauthenticated) or 403 (forbidden). Both are acceptable.
        self.assertIn(response.status_code, (401, 403))

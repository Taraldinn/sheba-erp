import uuid
from django.test import TestCase, override_settings
from django.core import mail
from django.contrib.auth.models import User
from apps.core.models import Tenant, TenantDomain, CompanySetting
from apps.core.email.service import EmailService

class EmailServiceTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Apex Fiber Net",
            slug="apex-fiber",
            domain="apex.shebafi.xyz",
            contact_email="admin@apexfiber.net",
            contact_phone="+8801711000000"
        )
        self.user = User.objects.create_user(
            username="apex_admin",
            email="admin@apexfiber.net",
            password="testpassword123"
        )

    def test_send_client_onboarding_email(self):
        mail.outbox.clear()
        sent = EmailService.send_client_onboarding_email(
            tenant=self.tenant,
            admin_username="apex_admin",
            temporary_password="InitialSecret123!",
            portal_url="https://apex.shebafi.xyz/login",
            recipient_email=self.tenant.contact_email
        )
        self.assertTrue(sent)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ["admin@apexfiber.net"])
        self.assertIn("Welcome to ShebaFi", email.subject)
        self.assertIn("apex_admin", email.body)
        self.assertIn("InitialSecret123!", email.body)
        self.assertIn("https://apex.shebafi.xyz/login", email.body)

    def test_send_password_reset_email_superadmin(self):
        mail.outbox.clear()
        sent = EmailService.send_password_reset_email(
            user=self.user,
            reset_url="https://super-admin.shebafi.xyz/reset-password?uid=MQ&token=test-token",
            recipient_email="admin@apexfiber.net",
            is_superadmin=True
        )
        self.assertTrue(sent)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertIn("Password Reset", email.subject)
        self.assertIn("https://super-admin.shebafi.xyz/reset-password?uid=MQ&token=test-token", email.body)


class TenantOnboardingEmailTest(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username="central_admin",
            email="superadmin@shebafi.xyz",
            password="MasterSecretPassword123!"
        )
        self.client.force_authenticate(user=self.superuser)

    def test_tenant_creation_sends_welcome_email(self):
        mail.outbox.clear()
        payload = {
            "name": "Barisal Broadband",
            "slug": "barisal-bb",
            "domain": "barisal.shebafi.xyz",
            "contact_email": "owner@barisal.net",
            "contact_phone": "+880 1811-999888",
            "plan": "Growth",
            "admin_username": "barisal_root",
            "admin_password": "CustomPassword99!"
        }
        response = self.client.post("/api/v1/saas/tenants/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        sent_email = mail.outbox[0]
        self.assertEqual(sent_email.to, ["owner@barisal.net"])
        self.assertIn("Welcome to ShebaFi", sent_email.subject)
        self.assertIn("barisal_root", sent_email.body)
        self.assertIn("CustomPassword99!", sent_email.body)
        self.assertIn("barisal.shebafi.xyz", sent_email.body)


class SuperAdminPasswordResetTest(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from rest_framework.authtoken.models import Token
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(
            username="master_superadmin",
            email="root@shebafi.xyz",
            password="OriginalSuperPassword123!"
        )
        self.token, _ = Token.objects.get_or_create(user=self.superuser)

    def test_request_password_reset_for_valid_superadmin(self):
        mail.outbox.clear()
        response = self.client.post("/api/v1/saas/auth/password-reset/", {"email": "root@shebafi.xyz"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("detail", response.data)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ["root@shebafi.xyz"])
        self.assertIn("reset-password?uid=", sent.body)

    def test_request_password_reset_nonexistent_email_no_leak(self):
        mail.outbox.clear()
        response = self.client.post("/api/v1/saas/auth/password-reset/", {"email": "unknown@hacker.io"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("detail", response.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_password_reset_updates_credentials_and_revokes_tokens(self):
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        from django.contrib.auth.tokens import default_token_generator
        from rest_framework.authtoken.models import Token

        uid = urlsafe_base64_encode(force_bytes(self.superuser.pk))
        token = default_token_generator.make_token(self.superuser)

        response = self.client.post("/api/v1/saas/auth/password-reset-confirm/", {
            "uid": uid,
            "token": token,
            "new_password": "BrandNewSuperSecretPass456!"
        }, format="json")
        self.assertEqual(response.status_code, 200)

        # Token must be revoked
        self.assertFalse(Token.objects.filter(user=self.superuser).exists())

        # Old password must fail
        self.superuser.refresh_from_db()
        self.assertFalse(self.superuser.check_password("OriginalSuperPassword123!"))
        self.assertTrue(self.superuser.check_password("BrandNewSuperSecretPass456!"))

    def test_confirm_password_reset_rejects_invalid_token(self):
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        uid = urlsafe_base64_encode(force_bytes(self.superuser.pk))

        response = self.client.post("/api/v1/saas/auth/password-reset-confirm/", {
            "uid": uid,
            "token": "completely-forged-token",
            "new_password": "NewSecretPassword123!"
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.data)

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

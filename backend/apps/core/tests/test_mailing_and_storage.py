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
        res_json = response.json()
        self.assertIn("api_access", res_json)
        self.assertTrue(res_json["api_access"]["secret_key"].startswith("shb_") or len(res_json["api_access"]["secret_key"]) >= 32)
        self.assertIn("cname_instructions", res_json)

        self.assertEqual(len(mail.outbox), 1)
        sent_email = mail.outbox[0]
        self.assertEqual(sent_email.to, ["owner@barisal.net"])
        self.assertIn("Welcome to ShebaFi", sent_email.subject)
        self.assertIn("barisal_root", sent_email.body)
        self.assertIn("CustomPassword99!", sent_email.body)
        self.assertIn("barisal.shebafi.xyz", sent_email.body)
        self.assertIn("Frontend API Secret", sent_email.body)

        # Test SaaS Admin feature inspection and customization endpoint
        tenant_id = res_json["tenant"]["id"]
        feat_resp = self.client.get(f"/api/v1/saas/tenants/{tenant_id}/features/")
        self.assertEqual(feat_resp.status_code, 200)
        self.assertTrue(len(feat_resp.json()["features"]) > 10)

        # Test toggling an exclusive feature for this tenant
        toggle_resp = self.client.post(
            f"/api/v1/saas/tenants/{tenant_id}/features/",
            {"feature_key": "exclusive.olt_auto_provisioning", "enabled": True},
            format="json"
        )
        self.assertEqual(toggle_resp.status_code, 200)
        self.assertTrue(toggle_resp.json()["enabled"])


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


class TenantPasswordResetTest(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from rest_framework.authtoken.models import Token
        from apps.authentication.models import StaffProfile, UserRole

        self.client = APIClient()

        # Tenant 1
        self.tenant1 = Tenant.objects.create(name="Delta ISP", slug="delta-isp", domain="delta.shebafi.xyz")
        TenantDomain.objects.create(tenant=self.tenant1, hostname="delta.shebafi.xyz", is_primary=True, is_active=True, verified=True)
        self.staff1 = User.objects.create_user(username="delta_tech", email="tech@delta.net", password="OldPassword123!")
        StaffProfile.objects.create(user=self.staff1, tenant=self.tenant1, role=UserRole.TECHNICIAN)
        Token.objects.create(user=self.staff1)

        # Tenant 2
        self.tenant2 = Tenant.objects.create(name="Gamma Net", slug="gamma-net", domain="gamma.shebafi.xyz")
        TenantDomain.objects.create(tenant=self.tenant2, hostname="gamma.shebafi.xyz", is_primary=True, is_active=True, verified=True)
        self.staff2 = User.objects.create_user(username="gamma_tech", email="tech@gamma.net", password="OldPassword456!")
        StaffProfile.objects.create(user=self.staff2, tenant=self.tenant2, role=UserRole.TECHNICIAN)

    def test_request_password_reset_for_tenant_staff(self):
        mail.outbox.clear()
        response = self.client.post(
            "/api/v1/auth/password-reset/",
            {"email": "tech@delta.net"},
            format="json",
            HTTP_HOST="delta.shebafi.xyz"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("detail", response.data)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ["tech@delta.net"])
        self.assertIn("delta.shebafi.xyz/reset-password?uid=", sent.body)

    def test_cross_tenant_password_reset_isolation(self):
        mail.outbox.clear()
        # Request reset for Gamma's staff on Delta's domain -> must NOT send email
        response = self.client.post(
            "/api/v1/auth/password-reset/",
            {"email": "tech@gamma.net"},
            format="json",
            HTTP_HOST="delta.shebafi.xyz"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_tenant_password_reset(self):
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        from django.contrib.auth.tokens import default_token_generator
        from rest_framework.authtoken.models import Token

        uid = urlsafe_base64_encode(force_bytes(self.staff1.pk))
        token = default_token_generator.make_token(self.staff1)

        response = self.client.post(
            "/api/v1/auth/password-reset-confirm/",
            {
                "uid": uid,
                "token": token,
                "new_password": "NewDeltaSecurePass789!"
            },
            format="json",
            HTTP_HOST="delta.shebafi.xyz"
        )
        self.assertEqual(response.status_code, 200)

        # Verify old token revoked
        self.assertFalse(Token.objects.filter(user=self.staff1).exists())

        # Verify new password active
        self.staff1.refresh_from_db()
        self.assertTrue(self.staff1.check_password("NewDeltaSecurePass789!"))


class CloudStorageConfigurationTest(TestCase):
    def test_default_storage_backends(self):
        from django.conf import settings
        self.assertEqual(settings.STORAGES['default']['BACKEND'], 'django.core.files.storage.FileSystemStorage')
        self.assertEqual(settings.STORAGES['staticfiles']['BACKEND'], 'whitenoise.storage.CompressedManifestStaticFilesStorage')

    def test_s3_storage_classes(self):
        from apps.core.storage import MediaS3Storage, StaticS3Storage
        media_storage = MediaS3Storage()
        static_storage = StaticS3Storage()

        self.assertEqual(media_storage.location, 'media')
        self.assertFalse(media_storage.file_overwrite)
        self.assertEqual(static_storage.location, 'static')
        self.assertTrue(static_storage.file_overwrite)

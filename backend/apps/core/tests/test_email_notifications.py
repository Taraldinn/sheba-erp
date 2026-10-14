from django.test import TestCase
from django.core import mail
from django.contrib.auth.models import User
from apps.core.email.service import EmailService


class EmailNotificationsTest(TestCase):
    def test_send_system_failure_alert(self):
        result = EmailService.send_system_failure_alert(
            error_type='DatabaseTimeout',
            error_message='Connection to replica timed out',
            traceback_str='File "db.py", line 42 in query',
            path='/api/v1/subscribers/',
            tenant_slug='alpha-isp',
            recipient_list=['tech-alerts@shebafi.xyz']
        )
        self.assertTrue(result)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('[CRITICAL ALERT]', mail.outbox[0].subject)
        self.assertIn('DatabaseTimeout', mail.outbox[0].body)
        self.assertEqual(mail.outbox[0].to, ['tech-alerts@shebafi.xyz'])

    def test_send_password_changed_notification(self):
        user = User.objects.create_user(username='notify_user', email='user@sheba.net', password='password123')
        result = EmailService.send_password_changed_notification(
            user=user,
            ip_address='10.0.0.5'
        )
        self.assertTrue(result)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Password Was Changed', mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, ['user@sheba.net'])

    def test_send_network_failure_alert(self):
        result = EmailService.send_network_failure_alert(
            tenant_name='Alpha Fiber',
            router_name='MikroTik-Core-01',
            router_ip='192.168.88.1',
            error_details='API socket refused connection',
            recipient_email='noc@alpha.net'
        )
        self.assertTrue(result)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('[NETWORK ALERT]', mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, ['noc@alpha.net'])

    def test_send_tenant_request_status_email(self):
        result = EmailService.send_tenant_request_status_email(
            tenant_name='Apex ISP',
            status='Approved',
            recipient_email='owner@apex.net',
            notes='All documents verified.',
            portal_url='http://apex.localhost:3001/login'
        )
        self.assertTrue(result)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Approved', mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, ['owner@apex.net'])

from django.test import TestCase
from django.template.loader import render_to_string


class EmailTemplatesRenderTest(TestCase):
    def test_system_failure_alert_templates(self):
        ctx = {
            'error_type': 'ZeroDivisionError',
            'error_message': 'division by zero',
            'traceback_str': 'Traceback (most recent call last):\n  File "views.py", line 10\nZeroDivisionError',
            'path': '/api/v1/subscribers/',
            'method': 'GET',
            'tenant_slug': 'demo-isp',
            'user': 'john_admin',
            'timestamp': '2026-10-14 12:00:00 UTC',
            'current_year': 2026,
        }
        html = render_to_string('emails/system_failure_alert.html', ctx)
        text = render_to_string('emails/system_failure_alert.txt', ctx)
        self.assertIn('ZeroDivisionError', html)
        self.assertIn('/api/v1/subscribers/', text)

    def test_password_changed_templates(self):
        ctx = {
            'username': 'alpha_admin',
            'platform_name': 'ShebaFi Platform',
            'ip_address': '192.168.1.1',
            'current_year': 2026,
        }
        html = render_to_string('emails/password_changed_notification.html', ctx)
        text = render_to_string('emails/password_changed_notification.txt', ctx)
        self.assertIn('alpha_admin', html)
        self.assertIn('password', text.lower())

    def test_network_failure_templates(self):
        ctx = {
            'tenant_name': 'Alpha Net',
            'router_name': 'Core-MikroTik-CCR1009',
            'router_ip': '10.0.0.1',
            'error_details': 'Connection timed out after 5000ms',
            'current_year': 2026,
        }
        html = render_to_string('emails/network_failure_alert.html', ctx)
        text = render_to_string('emails/network_failure_alert.txt', ctx)
        self.assertIn('Core-MikroTik-CCR1009', html)
        self.assertIn('10.0.0.1', text)

    def test_tenant_request_status_templates(self):
        ctx = {
            'tenant_name': 'Beta Networks',
            'status': 'Approved',
            'notes': 'Payment verified via bKash TrxID TRX888999.',
            'portal_url': 'http://beta.localhost:3001/login',
            'current_year': 2026,
        }
        html = render_to_string('emails/tenant_request_status.html', ctx)
        text = render_to_string('emails/tenant_request_status.txt', ctx)
        self.assertIn('Beta Networks', html)
        self.assertIn('Approved', text)

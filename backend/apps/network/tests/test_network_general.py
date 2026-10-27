from unittest.mock import patch, MagicMock
import requests
from django.test import TestCase
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant, AuditLog
from apps.network.models import Router, OLT
from apps.network.validators import validate_router_host
from apps.network.services.mikrotik import MikroTikRESTClient, MikroTikSystemService


class NetworkN1Tests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant_a = Tenant.objects.create(name='Tenant Alpha', slug='alpha')
        self.tenant_b = Tenant.objects.create(name='Tenant Beta', slug='beta')

        self.user_a = User.objects.create_superuser(username='admin_a', password='password123')
        self.client.force_authenticate(user=self.user_a)

        # Ensure request.tenant resolves for tenant_a
        self.client.defaults['HTTP_HOST'] = 'alpha.shebafi.com'

        self.router = Router.objects.create(
            tenant=self.tenant_a,
            name='Core CCR2004',
            ip_address='10.10.10.1',
            hostname='router1.sheba.net',
            api_protocol='REST',
            https_port=443,
            username='admin',
            password='UltraSecretRouterPassword123',
            connection_timeout=5,
            retry_count=1,
            ssl_verify=False,
        )

    # 1. Credentials security: Never in API responses
    def test_network_credentials_not_in_response(self):
        response = self.client.get(f'/api/v1/routers/{self.router.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('password', response.data, 'Router password must never leak in API response!')
        self.assertEqual(response.data['name'], 'Core CCR2004')

        olt = OLT.objects.create(
            tenant=self.tenant_a,
            name='Huawei OLT MA5608T',
            ip_address='10.10.20.1',
            snmp_community='my_secret_snmp',
            telnet_user='root',
            telnet_password='UltraSecretOltPassword456',
        )
        response_olt = self.client.get(f'/api/v1/olts/{olt.id}/')
        self.assertEqual(response_olt.status_code, status.HTTP_200_OK)
        self.assertNotIn('telnet_password', response_olt.data)
        self.assertNotIn('snmp_community', response_olt.data)

    # 2. Credential encryption at rest in PostgreSQL/SQLite
    def test_credentials_encrypted_at_rest(self):
        from django.db import connection
        # Refresh from database and check property access returns decrypted value
        self.router.refresh_from_db()
        self.assertEqual(self.router.password, 'UltraSecretRouterPassword123')

        # Check raw stored value in database directly using raw SQL cursor
        with connection.cursor() as cursor:
            pk_val = self.router.pk.hex if connection.vendor == 'sqlite' else self.router.pk
            cursor.execute("SELECT password FROM network_router WHERE id = %s", [pk_val])
            raw_db_val = cursor.fetchone()[0]

        self.assertTrue(raw_db_val.startswith('enc:'), f"Raw DB value should start with 'enc:' but got {raw_db_val}")
        self.assertNotEqual(raw_db_val, 'UltraSecretRouterPassword123')

    # 3. Successful MikroTik REST connection
    @patch('requests.Session.get')
    def test_mikrotik_rest_connection_success(self, mock_get):
        def mocked_requests_get(url, **kwargs):
            mock_resp = MagicMock()
            mock_resp.ok = True
            mock_resp.status_code = 200
            if 'system/identity' in url:
                mock_resp.json.return_value = {'name': 'Sheba-Core-Router-01'}
            elif 'system/resource' in url:
                mock_resp.json.return_value = {
                    'version': '7.14.3',
                    'uptime': '5d12:30:15',
                    'cpu-load': 18,
                    'total-memory': 1000000,
                    'free-memory': 400000,
                    'total-hdd-space': 2000000,
                    'free-hdd-space': 1200000,
                    'board-name': 'CCR2004-1G-12S+2XS',
                    'architecture-name': 'arm64',
                }
            return mock_resp

        mock_get.side_effect = mocked_requests_get

        response = self.client.post(f'/api/v1/routers/{self.router.id}/test-connection/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['details']['version'], '7.14.3')
        self.assertEqual(response.data['details']['identity'], 'Sheba-Core-Router-01')

        # Verify router model updated in DB
        self.router.refresh_from_db()
        self.assertEqual(self.router.status, 'Online')
        self.assertEqual(self.router.cpu_usage, 18)
        self.assertEqual(self.router.memory_usage, 60)
        self.assertEqual(self.router.disk_usage, 40)
        self.assertEqual(self.router.routeros_version, '7.14.3')
        self.assertEqual(self.router.uptime, '5d12:30:15')
        self.assertIsNotNone(self.router.last_ping)

    # 4. Health endpoint
    @patch('requests.Session.get')
    def test_mikrotik_rest_health_endpoint(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.side_effect = [
            {'name': 'Sheba-Core-Router-01'},
            {
                'version': '7.14.3',
                'uptime': '2d01:10:00',
                'cpu-load': 25,
                'total-memory': 1000,
                'free-memory': 500,
                'total-hdd-space': 1000,
                'free-hdd-space': 800,
                'board-name': 'CCR2004',
            }
        ]
        mock_get.return_value = mock_resp

        response = self.client.get(f'/api/v1/routers/{self.router.id}/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_online'])
        self.assertEqual(response.data['cpu_load'], 25)
        self.assertEqual(response.data['memory_pct'], 50)

    # 5. Invalid credentials (401 Unauthorized)
    @patch('requests.Session.get')
    def test_mikrotik_rest_invalid_credentials(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.ok = False
        mock_resp.status_code = 401
        mock_get.return_value = mock_resp

        response = self.client.post(f'/api/v1/routers/{self.router.id}/test-connection/')
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(response.data['success'])
        self.assertIn('Authentication failed', response.data['message'])
        self.assertNotIn('UltraSecretRouterPassword123', str(response.data))

        self.router.refresh_from_db()
        self.assertEqual(self.router.status, 'Error')

    # 6. Connection timeout
    @patch('requests.Session.get')
    def test_mikrotik_rest_connection_timeout(self, mock_get):
        mock_get.side_effect = requests.exceptions.ConnectTimeout("Timed out")

        response = self.client.post(f'/api/v1/routers/{self.router.id}/test-connection/')
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(response.data['success'])
        self.assertIn('timed out', response.data['message'].lower())

        self.router.refresh_from_db()
        self.assertEqual(self.router.status, 'Offline')

    # 7. Router unreachable
    @patch('requests.Session.get')
    def test_mikrotik_rest_router_unreachable(self, mock_get):
        mock_get.side_effect = requests.exceptions.ConnectionError("Connection refused")

        response = self.client.post(f'/api/v1/routers/{self.router.id}/test-connection/')
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(response.data['success'])

        self.router.refresh_from_db()
        self.assertEqual(self.router.status, 'Offline')

    # 8. Cross-tenant router access prevention (IDOR)
    def test_cross_tenant_router_isolation(self):
        # Create router for Tenant B
        router_b = Router.objects.create(
            tenant=self.tenant_b,
            name='Tenant B Router',
            ip_address='10.20.30.1',
            username='admin',
            password='secret_b',
        )

        # Authenticated as user from Tenant A (Host: alpha.shebafi.com)
        # Attempt to retrieve Tenant B router -> must return 404
        response_get = self.client.get(f'/api/v1/routers/{router_b.id}/')
        self.assertEqual(response_get.status_code, status.HTTP_404_NOT_FOUND)

        # Attempt to test connection to Tenant B router -> must return 404
        response_test = self.client.post(f'/api/v1/routers/{router_b.id}/test-connection/')
        self.assertEqual(response_test.status_code, status.HTTP_404_NOT_FOUND)

    # 9. SSRF Protection: blocks cloud metadata & forbidden addresses
    def test_ssrf_protection_validator(self):
        # Link-local / Cloud metadata
        with self.assertRaises(ValidationError):
            validate_router_host('169.254.169.254')

        with self.assertRaises(ValidationError):
            validate_router_host('169.254.1.1')

        # Multicast
        with self.assertRaises(ValidationError):
            validate_router_host('224.0.0.1')

        # Loopback
        with self.assertRaises(ValidationError):
            validate_router_host('127.0.0.1')

        # Valid private ISP IP
        try:
            validate_router_host('10.0.50.1')
            validate_router_host('192.168.88.1')
            validate_router_host('172.16.1.1')
        except ValidationError:
            self.fail("Valid private network IPs should not raise ValidationError.")

    # 10. Network Audit Logging: Redacts passwords
    @patch('requests.Session.get')
    def test_network_audit_logging(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.status_code = 200
        mock_resp.json.side_effect = [
            {'name': 'Sheba-Core-Router-01'},
            {'version': '7.14.3', 'uptime': '1d00:00:00', 'cpu-load': 10, 'total-memory': 100, 'free-memory': 50, 'total-hdd-space': 100, 'free-hdd-space': 50}
        ]
        mock_get.return_value = mock_resp

        self.client.post(f'/api/v1/routers/{self.router.id}/test-connection/')

        log = AuditLog.objects.filter(resource_id=str(self.router.id), action='test_connection').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.module, 'network')
        self.assertEqual(log.resource_type, 'Router')
        # Ensure password is not present in audit log details
        self.assertNotIn('UltraSecretRouterPassword123', str(log.details))

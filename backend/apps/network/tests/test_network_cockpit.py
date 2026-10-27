"""
Tests for Phase 11 — Network Operations Cockpit.
Validates aggregated dashboard KPIs, router drilldown, OLT optical histogram,
customer network status panel, operational actions, and RBAC / multi-tenant isolation.
"""
from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.core.models import Tenant
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus, ConnectionType
from apps.billing.models import Package
from apps.network.models import Router, OLT, ONU, UserSession, NetworkSyncJob, POPBranch


class NetworkCockpitTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant_a = Tenant.objects.create(name='Sheba Net Alpha', slug='alpha')
        self.tenant_b = Tenant.objects.create(name='Sheba Net Beta', slug='beta')

        # Admin user for Tenant A
        self.admin_user = User.objects.create_user(username='net_admin', password='password123')
        self.admin_profile = StaffProfile.objects.create(
            tenant=self.tenant_a,
            user=self.admin_user,
            role=UserRole.ADMIN,
            phone='01700000001'
        )

        # Non-privileged technical user (Can view metrics, but cannot control devices if billing operator)
        self.billing_user = User.objects.create_user(username='billing_op', password='password123')
        self.billing_profile = StaffProfile.objects.create(
            tenant=self.tenant_a,
            user=self.billing_user,
            role=UserRole.BILLING_OPERATOR,
            phone='01700000002'
        )

        # Tenant B Admin
        self.tenant_b_user = User.objects.create_user(username='admin_b', password='password123')
        self.tenant_b_profile = StaffProfile.objects.create(
            tenant=self.tenant_b,
            user=self.tenant_b_user,
            role=UserRole.ADMIN,
            phone='01700000003'
        )

        # Set default host for Tenant A
        self.client.defaults['HTTP_HOST'] = 'alpha.shebafi.com'
        self.client.force_authenticate(user=self.admin_user)

        # Package
        self.pkg = Package.objects.create(
            tenant=self.tenant_a,
            name='Standard 20Mbps',
            regular_price=Decimal('1000.00'),
            speed_mbps=20,
            mikrotik_profile='prof_20m'
        )

        # POP Branch
        self.pop = POPBranch.objects.create(
            tenant=self.tenant_a,
            name='Central POP',
            code='POP-01',
            location='Dhanmondi, Dhaka',
            total_capacity=1000,
            status='Active'
        )

    def _seed_network_topology(self):
        # 1. Routers: 24 total (22 online, 2 degraded/offline)
        self.routers = []
        for i in range(22):
            r = Router.objects.create(
                tenant=self.tenant_a,
                name=f'Core-CCR-{i+1}',
                ip_address=f'10.10.1.{i+1}',
                status='Online',
                cpu_usage=25.0,
                memory_usage=45.0,
                disk_usage=15.0,
            )
            self.routers.append(r)

        for i in range(2):
            r = Router.objects.create(
                tenant=self.tenant_a,
                name=f'Degraded-CCR-{i+1}',
                ip_address=f'10.10.2.{i+1}',
                status='Offline',
                cpu_usage=99.0,
                memory_usage=90.0,
                disk_usage=80.0,
            )
            self.routers.append(r)

        self.primary_router = self.routers[0]

        # 2. OLTs: 18 healthy, 1 degraded
        self.olts = []
        for i in range(18):
            o = OLT.objects.create(
                tenant=self.tenant_a,
                name=f'Huawei-OLT-{i+1}',
                ip_address=f'10.20.1.{i+1}',
                status='Online',
                pon_ports_count=8,
            )
            self.olts.append(o)

        degraded_olt = OLT.objects.create(
            tenant=self.tenant_a,
            name='Degraded-OLT-19',
            ip_address='10.20.2.1',
            status='Offline',
            pon_ports_count=4,
        )
        self.olts.append(degraded_olt)
        self.primary_olt = self.olts[0]

        # 3. Customers
        # Customer 1: Online in Zone-North
        self.cust1 = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-001',
            full_name='Rahim Ahmed',
            mobile='01711111111',
            area_zone='Zone-North',
            connection_type=ConnectionType.PPPOE,
            router=self.primary_router,
            package=self.pkg,
            pppoe_username='rahim01',
            status=CustomerStatus.ACTIVE,
            monthly_bill=Decimal('1000.00'),
            due_amount=Decimal('0.00'),
        )

        # Customer 2: Offline in Zone-South
        self.cust2 = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-002',
            full_name='Karim Khan',
            mobile='01722222222',
            area_zone='Zone-South',
            connection_type=ConnectionType.PPPOE,
            router=self.primary_router,
            package=self.pkg,
            pppoe_username='karim02',
            status=CustomerStatus.ACTIVE,
            monthly_bill=Decimal('1000.00'),
            due_amount=Decimal('500.00'),
        )

        # Customer 3: Expired in Zone-North
        self.cust3 = Customer.objects.create(
            tenant=self.tenant_a,
            customer_code='CUST-003',
            full_name='Jamal Uddin',
            mobile='01733333333',
            area_zone='Zone-North',
            connection_type=ConnectionType.PPPOE,
            router=self.primary_router,
            package=self.pkg,
            pppoe_username='jamal03',
            status=CustomerStatus.EXPIRED,
            monthly_bill=Decimal('1000.00'),
            due_amount=Decimal('1000.00'),
        )

        # 4. UserSession (Live PPPoE Session for Cust 1)
        self.session1 = UserSession.objects.create(
            tenant=self.tenant_a,
            router=self.primary_router,
            username='rahim01',
            ip_address='100.64.10.25',
            mac_address='AA:BB:CC:DD:EE:01',
            uptime='2d 04:12:00',
            bytes_in=1024 * 1024 * 500,  # 500 MB
            bytes_out=1024 * 1024 * 1500,  # 1500 MB
            connected_at=timezone.now(),
            last_seen=timezone.now(),
        )

        # 5. ONUs:
        # ONU 1: Online, normal optical power (-19 dBm) linked to Cust 1
        self.onu1 = ONU.objects.create(
            tenant=self.tenant_a,
            olt=self.primary_olt,
            customer=self.cust1,
            customer_name=self.cust1.full_name,
            pon_port='gpon 0/1',
            onu_index=1,
            serial_number='HWTC111111',
            mac_address='00:11:22:33:44:01',
            rx_power=Decimal('-19.50'),
            tx_power=Decimal('2.40'),
            distance_meters=850,
            status='Online',
        )

        # ONU 2: Warning power (-25.5 dBm)
        self.onu2 = ONU.objects.create(
            tenant=self.tenant_a,
            olt=self.primary_olt,
            customer=self.cust2,
            customer_name=self.cust2.full_name,
            pon_port='gpon 0/1',
            onu_index=2,
            serial_number='HWTC222222',
            mac_address='00:11:22:33:44:02',
            rx_power=Decimal('-25.50'),
            tx_power=Decimal('1.80'),
            distance_meters=1400,
            status='Online',
        )

        # ONU 3: Critical / Optical Alert (-29.0 dBm)
        self.onu3 = ONU.objects.create(
            tenant=self.tenant_a,
            olt=self.primary_olt,
            customer=self.cust3,
            customer_name=self.cust3.full_name,
            pon_port='gpon 0/2',
            onu_index=1,
            serial_number='HWTC333333',
            mac_address='00:11:22:33:44:03',
            rx_power=Decimal('-29.00'),
            tx_power=Decimal('0.50'),
            distance_meters=3200,
            status='DyingGasp',
        )

        # 6. NetworkSyncJobs: 1 Pending, 1 Processing, 1 Failed
        self.job_pending = NetworkSyncJob.objects.create(
            tenant=self.tenant_a,
            customer=self.cust1,
            router=self.primary_router,
            action=NetworkSyncJob.Action.UPDATE_PACKAGE,
            status=NetworkSyncJob.JobStatus.PENDING,
            payload={'username': 'rahim01'},
        )
        self.job_proc = NetworkSyncJob.objects.create(
            tenant=self.tenant_a,
            customer=self.cust2,
            router=self.primary_router,
            action=NetworkSyncJob.Action.ENABLE_USER,
            status=NetworkSyncJob.JobStatus.PROCESSING,
            payload={'username': 'karim02'},
        )
        self.job_failed = NetworkSyncJob.objects.create(
            tenant=self.tenant_a,
            customer=self.cust3,
            router=self.primary_router,
            action=NetworkSyncJob.Action.DISABLE_USER,
            status=NetworkSyncJob.JobStatus.FAILED,
            error_message='MikroTik API Connection Refused (Timeout)',
            retry_count=3,
            payload={'username': 'jamal03'},
        )

    def test_cockpit_dashboard_kpis(self):
        """Validates exact top-level operational KPIs matching the cockpit specifications."""
        self._seed_network_topology()

        url = '/api/v1/network/cockpit/dashboard/?refresh=true'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        # Routers: 24 total, 22 healthy, 2 degraded
        self.assertEqual(data['routers']['total'], 24)
        self.assertEqual(data['routers']['healthy'], 22)
        self.assertEqual(data['routers']['degraded'], 2)

        # Customers: 3 total, 1 online, 2 offline, 2 active, 1 expired
        self.assertEqual(data['customers']['total'], 3)
        self.assertEqual(data['customers']['online'], 1)
        self.assertEqual(data['customers']['offline'], 2)
        self.assertEqual(data['customers']['active'], 2)
        self.assertEqual(data['customers']['expired'], 1)

        # Actions: 2 pending (pending + processing), 1 failed
        self.assertEqual(data['pending_actions'], 2)
        self.assertEqual(data['failed_actions'], 1)

        # OLT: 18 healthy, 1 degraded
        self.assertEqual(data['olt']['total'], 19)
        self.assertEqual(data['olt']['healthy'], 18)
        self.assertEqual(data['olt']['degraded'], 1)

        # ONU: 3 total, 2 online, 1 offline, 2 optical alerts (< -24 dBm or DyingGasp)
        self.assertEqual(data['onu']['total'], 3)
        self.assertEqual(data['onu']['online'], 2)
        self.assertEqual(data['onu']['offline'], 1)
        self.assertEqual(data['onu']['optical_alerts'], 2)

        # Sessions
        self.assertEqual(data['sessions']['total_active'], 1)
        self.assertGreater(data['sessions']['bytes_in'], 0)

        # Recent failures
        self.assertEqual(len(data['recent_failures']), 1)
        self.assertIn('Timeout', data['recent_failures'][0]['error_message'])

        # POP branches & Area zones
        self.assertTrue(len(data['pop_branches']) >= 1)
        self.assertTrue(len(data['area_breakdown']) >= 1)

    def test_area_scoping(self):
        """Verifies dashboard responds correctly to area zone filtering."""
        self._seed_network_topology()

        res = self.client.get('/api/v1/network/cockpit/dashboard/?area=Zone-North&refresh=true')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        # Zone-North has 2 customers (cust1 online, cust3 expired)
        self.assertEqual(data['customers']['total'], 2)
        self.assertEqual(data['customers']['online'], 1)
        self.assertEqual(data['customers']['offline'], 1)

    def test_router_cockpit_detail(self):
        """Validates Router -> Customers operational view."""
        self._seed_network_topology()

        url = f'/api/v1/network/cockpit/routers/{self.primary_router.id}/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        self.assertEqual(data['router']['name'], self.primary_router.name)
        self.assertEqual(data['customer_stats']['total_provisioned'], 3)
        self.assertEqual(data['customer_stats']['online_customers'], 1)
        self.assertEqual(data['customer_stats']['offline_customers'], 2)
        self.assertEqual(data['active_sessions_count'], 1)

        # Active session details
        self.assertEqual(data['active_sessions'][0]['username'], 'rahim01')
        self.assertEqual(data['active_sessions'][0]['ip_address'], '100.64.10.25')

    def test_olt_cockpit_detail(self):
        """Validates OLT -> ONUs operational view with optical distribution histogram."""
        self._seed_network_topology()

        url = f'/api/v1/network/cockpit/olts/{self.primary_olt.id}/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        self.assertEqual(data['olt']['name'], self.primary_olt.name)
        self.assertEqual(data['olt']['total_onus'], 3)
        self.assertEqual(data['olt']['online_onus'], 2)

        # Power distribution
        # Normal: rx_power >= -24 dBm (onu1: -19.50) -> 1
        # Warning: -27 <= rx_power < -24 (onu2: -25.50) -> 1
        # Critical or DyingGasp: (onu3: -29.00 and DyingGasp) -> 1
        self.assertEqual(data['optical_distribution']['normal'], 1)
        self.assertEqual(data['optical_distribution']['warning'], 1)
        self.assertEqual(data['optical_distribution']['critical_or_los'], 1)

        # PON ports summary
        self.assertEqual(len(data['pon_ports']), 2)

    def test_customer_network_status_panel(self):
        """Validates Customer -> Service operational diagnostic panel."""
        self._seed_network_topology()

        url = f'/api/v1/network/cockpit/customers/{self.cust1.id}/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        # Customer basics
        self.assertEqual(data['customer']['pppoe_username'], 'rahim01')
        self.assertEqual(data['customer']['package_name'], 'Standard 20Mbps')

        # Live session
        self.assertTrue(data['session']['is_online'])
        self.assertEqual(data['session']['ip_address'], '100.64.10.25')

        # Assigned router
        self.assertIsNotNone(data['router'])
        self.assertEqual(data['router']['name'], self.primary_router.name)

        # Optical link
        self.assertIsNotNone(data['onu'])
        self.assertEqual(data['onu']['rx_power'], '-19.50')
        self.assertEqual(data['onu']['olt_name'], self.primary_olt.name)

    def test_customer_operational_actions(self):
        """Tests operator control actions: disconnect, sync_profile, reboot_onu."""
        self._seed_network_topology()

        # 1. Disconnect Session
        with patch('apps.network.services.mikrotik.service.MikroTikService.disconnect_session') as mock_disc:
            mock_disc.return_value = True
            url = f'/api/v1/network/cockpit/customers/{self.cust1.id}/action/'
            res = self.client.post(url, {'action': 'disconnect'}, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertTrue(res.data['success'])

            # Session should be removed from database
            self.assertFalse(UserSession.objects.filter(username='rahim01').exists())

            # NetworkSyncJob recorded
            self.assertTrue(
                NetworkSyncJob.objects.filter(
                    customer=self.cust1,
                    action=NetworkSyncJob.Action.DISCONNECT_SESSION,
                    status=NetworkSyncJob.JobStatus.SUCCESS
                ).exists()
            )

        # 2. Sync Profile
        with patch('apps.network.services.mikrotik.service.MikroTikPPPoEService.update_user_by_name') as mock_sync:
            mock_sync.return_value = True
            url = f'/api/v1/network/cockpit/customers/{self.cust1.id}/action/'
            res = self.client.post(url, {'action': 'sync_profile'}, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertTrue(res.data['success'])

            self.assertTrue(
                NetworkSyncJob.objects.filter(
                    customer=self.cust1,
                    action=NetworkSyncJob.Action.UPDATE_PACKAGE,
                    status=NetworkSyncJob.JobStatus.SUCCESS
                ).exists()
            )

        # 3. Reboot ONU
        with patch('apps.network.services.olt.onu.ONUService.reboot') as mock_reboot:
            mock_reboot.return_value = True
            url = f'/api/v1/network/cockpit/customers/{self.cust1.id}/action/'
            res = self.client.post(url, {'action': 'reboot_onu'}, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertTrue(res.data['success'])

            self.assertTrue(
                NetworkSyncJob.objects.filter(
                    customer=self.cust1,
                    action=NetworkSyncJob.Action.REBOOT_ONU,
                    status=NetworkSyncJob.JobStatus.SUCCESS
                ).exists()
            )

    def test_rbac_action_restrictions(self):
        """Billing operators can view metrics but CANNOT execute destructive device commands."""
        self._seed_network_topology()

        self.client.force_authenticate(user=self.billing_user)

        # Can view dashboard
        res_view = self.client.get('/api/v1/network/cockpit/dashboard/')
        self.assertEqual(res_view.status_code, status.HTTP_200_OK)

        # Cannot execute control actions (Requires CanControlDevices)
        url = f'/api/v1/network/cockpit/customers/{self.cust1.id}/action/'
        res_action = self.client.post(url, {'action': 'disconnect'}, format='json')
        self.assertEqual(res_action.status_code, status.HTTP_403_FORBIDDEN)

    def test_cross_tenant_isolation(self):
        """Tenant B cannot view or manipulate Tenant A's network devices or subscribers."""
        self._seed_network_topology()

        # Switch to Tenant B host and auth
        self.client.defaults['HTTP_HOST'] = 'beta.shebafi.com'
        self.client.force_authenticate(user=self.tenant_b_user)

        # Tenant B dashboard shows 0 devices
        res = self.client.get('/api/v1/network/cockpit/dashboard/?refresh=true')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['routers']['total'], 0)
        self.assertEqual(res.data['customers']['total'], 0)

        # Tenant B router detail for Tenant A router -> 404 Not Found
        res_router = self.client.get(f'/api/v1/network/cockpit/routers/{self.primary_router.id}/')
        self.assertEqual(res_router.status_code, status.HTTP_404_NOT_FOUND)

        # Tenant B customer action on Tenant A customer -> 404 Not Found
        res_action = self.client.post(f'/api/v1/network/cockpit/customers/{self.cust1.id}/action/', {'action': 'disconnect'})
        self.assertEqual(res_action.status_code, status.HTTP_404_NOT_FOUND)

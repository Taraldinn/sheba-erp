import uuid
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Package
from apps.network.models import POPBranch, Router, TJBox


@patch('apps.customers.views.sync_customer_to_router')
class CustomerExtendedFormTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Sheba ISP', slug='sheba-isp', domain='sheba.shebafi.com')
        self.other_tenant = Tenant.objects.create(name='Other ISP', slug='other-isp', domain='other.shebafi.com')

        self.user = User.objects.create_superuser(username='superadmin', password='adminpassword')
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_HOST'] = 'sheba.shebafi.com'

        self.branch = POPBranch.objects.create(
            tenant=self.tenant,
            name='Mirpur POP',
            code='MIR',
            status='Active'
        )

        self.router = Router.objects.create(
            tenant=self.tenant,
            name='Core-CCR-01',
            ip_address='10.0.0.1',
            username='admin',
            password='secretpassword',
        )

        self.tj_box = TJBox.objects.create(
            tenant=self.tenant,
            name='BOX-MIR-01',
            zone=self.branch,
            box_category='Master Box',
            fiber_code=[{'capacity': '2 C', 'direction': 'In', 'cores': []}],
        )

        self.package = Package.objects.create(
            tenant=self.tenant,
            name='Home 20 Mbps Ultra',
            mikrotik_profile='20M_Home',
            speed_mbps=20,
            regular_price=600.00
        )

        # Existing customer in Sheba ISP
        self.existing_customer = Customer.objects.create(
            tenant=self.tenant,
            customer_code='CUST-EXISTING',
            full_name='Existing User',
            mobile='01700000001',
            pppoe_username='existing_user',
            pppoe_password='secretpassword',
            status=CustomerStatus.ACTIVE,
        )

    def test_check_username_availability_endpoint(self, mock_sync):
        # 1. Available username
        res = self.client.get('/api/v1/customers/check-username/', {'username': 'brand_new_user'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['available'])
        self.assertEqual(res.data['username'], 'brand_new_user')

        # 2. Taken username in current tenant
        res = self.client.get('/api/v1/customers/check-username/', {'username': 'existing_user'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['available'])
        self.assertEqual(res.data['username'], 'existing_user')

        # 3. Same username in another tenant should not collide
        Customer.objects.create(
            tenant=self.other_tenant,
            customer_code='OTHER-01',
            full_name='Other Tenant Customer',
            mobile='01800000002',
            pppoe_username='other_tenant_user',
            pppoe_password='secretpassword',
        )
        res = self.client.get('/api/v1/customers/check-username/', {'username': 'other_tenant_user'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['available'])

    def test_create_customer_with_extended_fields(self, mock_sync):
        payload = {
            'full_name': 'Kazi Nazrul',
            'mobile': '01711223344',
            'alternate_phone': '01911223344',
            'email': 'kazi@example.com',
            'national_id': '1990123456789',
            'pppoe_username': 'nazrul_net',
            'pppoe_password': 'pass12345Secure',
            'customer_code': 'CL-001',
            'district': 'Dhaka',
            'thana': 'Mirpur',
            'address': 'Road 4, Block C, Section 10',
            'package': str(self.package.id),
            'router': str(self.router.id),
            'area_zone': 'Mirpur POP',
            'tj_box': str(self.tj_box.id),
            'monthly_bill': '550.00',
            'discount': '50.00',
            'status': 'Active',
            'billing_cycle_day': 'Standard 30 Days',
            'auto_recharge': True,
            'auto_recharge_duration': '30 Days',
            'sms_notifications': True,
            'voice_notifications': False,
            'client_type': 'Home',
            'onu_mac_or_sn': '48:57:02:11:22:33',
            'latitude': '23.8041000',
            'longitude': '90.3667000',
            'remarks': 'Near Mirpur-10 round about',
            'btrc_info': {
                'connectivity_type': 'Shared',
                'allocated_ip_type': 'Shared',
                'allocated_ip': '103.145.11.20',
                'house_no': 'House 12',
                'road_no': 'Road 4',
                'area': 'Mirpur-10',
                'distribution_point': 'BOX-MIR-01'
            }
        }

        res = self.client.post('/api/v1/customers/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        customer_id = res.data['id']

        # Verify DB values
        customer = Customer.objects.get(id=customer_id)
        self.assertEqual(customer.full_name, 'Kazi Nazrul')
        self.assertEqual(customer.alternate_phone, '01911223344')
        self.assertEqual(customer.district, 'Dhaka')
        self.assertEqual(customer.thana, 'Mirpur')
        self.assertEqual(customer.client_type, 'Home')
        self.assertEqual(customer.tj_box, self.tj_box)
        self.assertTrue(customer.auto_recharge)
        self.assertEqual(customer.btrc_info.get('house_no'), 'House 12')
        self.assertEqual(customer.btrc_info.get('allocated_ip'), '103.145.11.20')

        # Verify retrieve endpoint returns extended fields
        get_res = self.client.get(f'/api/v1/customers/{customer_id}/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertEqual(get_res.data['district'], 'Dhaka')
        self.assertEqual(get_res.data['thana'], 'Mirpur')
        self.assertEqual(get_res.data['client_type'], 'Home')
        self.assertEqual(str(get_res.data['tj_box']), str(self.tj_box.id))
        self.assertEqual(get_res.data['btrc_info']['house_no'], 'House 12')

    def test_create_customer_without_customer_code_auto_generates(self, mock_sync):
        payload = {
            'full_name': 'No Code Customer',
            'mobile': '01755667788',
            'pppoe_username': 'no_code_customer',
            'pppoe_password': 'pass12345Secure',
        }
        res = self.client.post('/api/v1/customers/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertTrue(bool(res.data['customer_code']))
        created = Customer.objects.get(id=res.data['id'])
        self.assertTrue(bool(created.customer_code))
        self.assertTrue(created.customer_code.startswith('SI-') or created.customer_code.startswith('CUST-'))

    def test_create_customer_duplicate_customer_code_fails(self, mock_sync):
        payload = {
            'full_name': 'Duplicate Code Customer',
            'mobile': '01799887766',
            'pppoe_username': 'dup_code_customer',
            'pppoe_password': 'pass12345Secure',
            'customer_code': 'CUST-EXISTING',
        }
        res = self.client.post('/api/v1/customers/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('customer_code', res.data.get('field_errors', res.data))

    def test_create_customer_normalizes_connection_type_billing_type_and_status(self, mock_sync):
        # Testing case-insensitive and common frontend variations:
        # 'pppoe' -> 'PPPoE', 'PREPAID' -> 'Prepaid', 'ACTIVE' -> 'Active'
        payload = {
            'full_name': 'Flexible Inputs Customer',
            'mobile': '01788776655',
            'pppoe_username': 'flex_user',
            'pppoe_password': 'pass12345Secure',
            'connection_type': 'pppoe',
            'billing_type': 'PREPAID',
            'status': 'ACTIVE',
        }
        res = self.client.post('/api/v1/customers/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        created = Customer.objects.get(id=res.data['id'])
        self.assertEqual(created.connection_type, 'PPPoE')
        self.assertEqual(created.billing_type, 'Prepaid')
        self.assertEqual(created.status, 'Active')

    def test_create_customer_normalizes_static_and_dhcp_connection_types(self, mock_sync):
        payload_static = {
            'full_name': 'Static Customer',
            'mobile': '01711112222',
            'pppoe_username': 'static_user',
            'pppoe_password': 'pass12345Secure',
            'connection_type': 'static',
        }
        res_static = self.client.post('/api/v1/customers/', payload_static, format='json')
        self.assertEqual(res_static.status_code, status.HTTP_201_CREATED, res_static.data)
        created_static = Customer.objects.get(id=res_static.data['id'])
        self.assertEqual(created_static.connection_type, 'Static_IP')

        payload_dhcp = {
            'full_name': 'DHCP Customer',
            'mobile': '01733334444',
            'pppoe_username': 'dhcp_user',
            'pppoe_password': 'pass12345Secure',
            'connection_type': 'dhcp',
        }
        res_dhcp = self.client.post('/api/v1/customers/', payload_dhcp, format='json')
        self.assertEqual(res_dhcp.status_code, status.HTTP_201_CREATED, res_dhcp.data)
        created_dhcp = Customer.objects.get(id=res_dhcp.data['id'])
        self.assertEqual(created_dhcp.connection_type, 'DHCP')


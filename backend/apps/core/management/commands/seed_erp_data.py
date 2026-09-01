import datetime
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from apps.core.models import Tenant, CompanySetting, AuditLog
from apps.authentication.models import StaffProfile, UserRole
from apps.billing.models import Package, Invoice, Recharge
from apps.network.models import Router, OLT, ONU, UserSession, OLTBrand
from apps.customers.models import Customer, CustomerStatus, ConnectionType
from apps.payments.models import PaymentGateway, PaymentTransaction, SmsLog, GatewayProvider, TransactionStatus
from apps.support.models import Ticket, TicketReply
from apps.store.models import ItemCategory, StoreItem
from apps.tasks.models import Task


class Command(BaseCommand):
    help = 'Seeds initial ERP data including tenants, admin user, packages, routers, OLTs, and customers'

    def handle(self, *args, **options):
        self.stdout.write("Seeding Sheba ERP Database...")

        # 1. Create Main Tenant
        tenant, _ = Tenant.objects.get_or_create(
            slug='shebafi',
            defaults={
                'name': 'Sheba Fi Broadband Network',
                'contact_phone': '+8801712345678',
                'contact_email': 'admin@shebafi.net',
                'address': 'Level 4, Sheba Tower, Banani, Dhaka'
            }
        )

        CompanySetting.objects.get_or_create(
            tenant=tenant,
            defaults={
                'company_name': 'Sheba Fi Broadband Ltd.',
                'tagline': 'Gigabit Fiber Internet & Digital Solutions',
                'currency_symbol': '৳',
                'currency_code': 'BDT',
                'support_phone': '+8809612345678',
                'support_email': 'support@shebafi.net',
                'address': 'Level 4, Sheba Tower, Banani, Dhaka-1213'
            }
        )

        # 2. Create Admin User
        admin_user, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'email': 'admin@shebafi.net',
                'first_name': 'System',
                'last_name': 'Administrator',
                'is_staff': True,
                'is_superuser': True
            }
        )
        if created:
            admin_user.set_password('admin123')
            admin_user.save()

        StaffProfile.objects.get_or_create(
            user=admin_user,
            defaults={
                'tenant': tenant,
                'role': UserRole.SUPER_ADMIN,
                'phone': '+8801700000001'
            }
        )

        # 3. Create Reseller User
        reseller_user, r_created = User.objects.get_or_create(
            username='reseller_uttara',
            defaults={
                'email': 'uttara@reseller.net',
                'first_name': 'Uttara',
                'last_name': 'Sub-ISP',
                'is_staff': True
            }
        )
        if r_created:
            reseller_user.set_password('reseller123')
            reseller_user.save()

        reseller_profile, _ = StaffProfile.objects.get_or_create(
            user=reseller_user,
            defaults={
                'tenant': tenant,
                'role': UserRole.RESELLER,
                'phone': '+8801811223344',
                'wallet_balance': 45000.00,
                'credit_limit': 100000.00
            }
        )

        # 4. Create Routers
        r1, _ = Router.objects.get_or_create(
            tenant=tenant,
            name='Core-CCR1036-Dhaka-NOC',
            defaults={
                'ip_address': '103.145.110.1',
                'api_port': 8728,
                'username': 'admin',
                'password': 'routerpassword',
                'location': 'Dhaka NOC Datacenter',
                'status': 'Online',
                'cpu_usage': 24,
                'memory_usage': 42,
                'active_pppoe_count': 1420,
                'total_customers_count': 1850,
                'last_ping': timezone.now()
            }
        )

        r2, _ = Router.objects.get_or_create(
            tenant=tenant,
            name='BN-CCR2004-Banani-POP',
            defaults={
                'ip_address': '103.145.110.5',
                'api_port': 8728,
                'username': 'admin',
                'password': 'routerpassword',
                'location': 'Banani POP',
                'status': 'Online',
                'cpu_usage': 18,
                'memory_usage': 35,
                'active_pppoe_count': 860,
                'total_customers_count': 990,
                'last_ping': timezone.now()
            }
        )

        # 5. Create Packages
        p1, _ = Package.objects.get_or_create(
            tenant=tenant,
            name='Starter Fiber - 15 Mbps',
            defaults={
                'mikrotik_profile': '15M_Unlimited',
                'speed_mbps': 15,
                'upload_speed_mbps': 15,
                'validity_days': 30,
                'regular_price': 500.00,
                'min_reseller_price': 350.00,
                'description': 'Buffer-free browsing & streaming with BDIX 100M'
            }
        )

        p2, _ = Package.objects.get_or_create(
            tenant=tenant,
            name='Turbo Stream - 30 Mbps',
            defaults={
                'mikrotik_profile': '30M_Unlimited',
                'speed_mbps': 30,
                'upload_speed_mbps': 30,
                'validity_days': 30,
                'regular_price': 800.00,
                'min_reseller_price': 550.00,
                'description': '4K UHD Streaming, Gaming Low Latency & Cloud storage'
            }
        )

        p3, _ = Package.objects.get_or_create(
            tenant=tenant,
            name='Giga Prime - 60 Mbps',
            defaults={
                'mikrotik_profile': '60M_Unlimited',
                'speed_mbps': 60,
                'upload_speed_mbps': 60,
                'validity_days': 30,
                'regular_price': 1200.00,
                'min_reseller_price': 850.00,
                'description': 'Dedicated business bandwidth & Priority SLA'
            }
        )

        # 6. Create OLT and ONUs
        olt1, _ = OLT.objects.get_or_create(
            tenant=tenant,
            name='VSOL-GPON-OLT-Banani',
            defaults={
                'brand': OLTBrand.VSOL,
                'ip_address': '192.168.100.10',
                'pon_ports_count': 8,
                'total_onus': 256,
                'online_onus': 248,
                'status': 'Online',
                'last_sync': timezone.now()
            }
        )

        # 7. Create Demo Customers
        today = timezone.now().date()
        c1, _ = Customer.objects.get_or_create(
            tenant=tenant,
            pppoe_username='tanvir_home',
            defaults={
                'customer_code': 'SB-1001',
                'full_name': 'Tanvir Ahmed',
                'mobile': '01711223344',
                'email': 'tanvir@gmail.com',
                'address': 'House 12, Road 4, Sector 7, Uttara',
                'area_zone': 'Uttara Zone-A',
                'router': r1,
                'pppoe_password': 'pass1001',
                'package': p2,
                'monthly_bill': 800.00,
                'due_amount': 0.00,
                'advance_amount': 0.00,
                'bill_date': today.replace(day=1),
                'expiry_date': today + datetime.timedelta(days=18),
                'status': CustomerStatus.ACTIVE
            }
        )

        c2, _ = Customer.objects.get_or_create(
            tenant=tenant,
            pppoe_username='rafiq_banani',
            defaults={
                'customer_code': 'SB-1002',
                'full_name': 'Rafiqul Islam',
                'mobile': '01899887766',
                'email': 'rafiq@outlook.com',
                'address': 'Flat 3B, Road 11, Banani',
                'area_zone': 'Banani Block-D',
                'router': r2,
                'pppoe_password': 'pass1002',
                'package': p1,
                'monthly_bill': 500.00,
                'due_amount': 500.00,
                'advance_amount': 0.00,
                'bill_date': today.replace(day=1),
                'expiry_date': today - datetime.timedelta(days=2),
                'status': CustomerStatus.EXPIRED
            }
        )

        c3, _ = Customer.objects.get_or_create(
            tenant=tenant,
            pppoe_username='sheba_corporate',
            defaults={
                'customer_code': 'SB-1003',
                'full_name': 'Smart Tech Solution Ltd.',
                'mobile': '01977665544',
                'email': 'info@smarttech.bd',
                'address': 'Level 9, Navana Tower, Gulshan-1',
                'area_zone': 'Gulshan Commercial',
                'router': r1,
                'pppoe_password': 'pass1003',
                'package': p3,
                'monthly_bill': 1200.00,
                'due_amount': 0.00,
                'advance_amount': 2400.00,
                'bill_date': today.replace(day=1),
                'expiry_date': today + datetime.timedelta(days=45),
                'status': CustomerStatus.ACTIVE
            }
        )

        # 8. Create ONUs
        ONU.objects.get_or_create(
            tenant=tenant,
            olt=olt1,
            pon_port='EPON0/1',
            onu_index=1,
            defaults={
                'mac_address': '48:8F:5A:21:40:AA',
                'customer_name': c1.full_name,
                'customer_phone': c1.mobile,
                'rx_power': -19.45,
                'tx_power': 2.30,
                'status': 'Online',
                'distance_meters': 840
            }
        )

        ONU.objects.get_or_create(
            tenant=tenant,
            olt=olt1,
            pon_port='EPON0/1',
            onu_index=2,
            defaults={
                'mac_address': '48:8F:5A:21:40:AB',
                'customer_name': c2.full_name,
                'customer_phone': c2.mobile,
                'rx_power': -26.80, # Optical warning
                'tx_power': 1.95,
                'status': 'Online',
                'distance_meters': 1920
            }
        )

        # 9. Create Payment Gateways & Transactions
        gw_bkash, _ = PaymentGateway.objects.get_or_create(
            tenant=tenant,
            provider=GatewayProvider.BKASH,
            defaults={
                'title': 'bKash Automated Gateway',
                'merchant_number': '01700000000',
                'app_key': 'bkash_app_key_live',
                'is_active': True
            }
        )

        PaymentTransaction.objects.get_or_create(
            tenant=tenant,
            customer=c1,
            trx_id='9X7K2M91PQ',
            defaults={
                'gateway': gw_bkash,
                'amount': 800.00,
                'payment_method': 'bKash',
                'status': TransactionStatus.SUCCESS,
                'customer_account': '01711223344'
            }
        )

        # 10. Create Support Ticket
        t1, _ = Ticket.objects.get_or_create(
            tenant=tenant,
            ticket_no='TCK-882194',
            defaults={
                'customer': c2,
                'assigned_to': admin_user,
                'category': 'Low Optical Power / High Latency',
                'subject': 'Internet speed dropping during peak hours',
                'description': 'Customer reported packet drops. RX power is at -26.8 dBm on PON port 1.',
                'priority': Ticket.Priority.HIGH,
                'status': Ticket.Status.IN_PROGRESS
            }
        )

        TicketReply.objects.get_or_create(
            ticket=t1,
            sender=admin_user,
            sender_name='System Admin',
            defaults={
                'is_staff': True,
                'message': 'Assigned field team to inspect the fiber splice at Banani joint closure box #3.'
            }
        )

        # 11. Create Inventory Store Items
        cat_fiber, _ = ItemCategory.objects.get_or_create(tenant=tenant, name='Fiber Cables & Accessories')
        cat_onu, _ = ItemCategory.objects.get_or_create(tenant=tenant, name='ONU & Optical Equipment')

        StoreItem.objects.get_or_create(
            tenant=tenant,
            name='2-Core FTTH Drop Cable (1km Drum)',
            defaults={'category': cat_fiber, 'item_code': 'FBR-DRP-2C', 'unit': 'Drum', 'unit_price': 6500.00, 'stock_quantity': 18}
        )
        StoreItem.objects.get_or_create(
            tenant=tenant,
            name='V-SOL Dual Band XPON ONU (Router Mode)',
            defaults={'category': cat_onu, 'item_code': 'ONU-VSOL-DB', 'unit': 'Pcs', 'unit_price': 1650.00, 'stock_quantity': 45}
        )

        self.stdout.write(self.style.SUCCESS("✓ Sheba ERP seed data successfully loaded! (Admin user: admin / pass: admin123)"))

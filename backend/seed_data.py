import os
import django
import uuid
import random
import datetime
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sheba_core.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from django.utils import timezone

from apps.core.models import Tenant, CompanySetting, AuditLog
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer, CustomerStatus, ConnectionType, BillingType
from apps.billing.models import Package, ResellerPricing, Invoice, Recharge, Offer
from apps.payments.models import PaymentGateway, GatewayProvider, PaymentTransaction, TransactionStatus, SmsLog
from apps.network.models import POPBranch, Router, OLT, OLTBrand, ONU, UserSession
from apps.support.models import Ticket, TicketReply
from apps.hr.models import Employee, Attendance, LeaveRequest, AdvanceSalary, PayrollRecord
from apps.store.models import ItemCategory, StoreItem, StockTransaction
from apps.tasks.models import Task
from apps.callcenter.models import CallLog


def run_seed():
    print("🌱 Starting comprehensive database seed for Sheba Fi ISP ERP...")

    # 1. Tenant
    tenant, _ = Tenant.objects.get_or_create(
        slug='shebafi',
        defaults={
            'name': 'Sheba Fi Internet Ltd.',
            'domain': 'shebafi.net',
            'contact_phone': '+8801711000111',
            'contact_email': 'admin@shebafi.net',
            'address': 'Level 6, Sheba Tower, Road 27, Dhanmondi, Dhaka 1209, Bangladesh',
            'is_active': True,
        }
    )

    # Company Setting
    CompanySetting.objects.update_or_create(
        tenant=tenant,
        defaults={
            'company_name': 'Sheba Fi Internet & Network Technologies',
            'tagline': 'High-Speed Optical Fiber Broadband & Enterprise Bandwidth',
            'currency_symbol': '৳',
            'currency_code': 'BDT',
            'invoice_prefix': 'SHB-INV-',
            'customer_id_prefix': 'SHB-',
            'support_phone': '+8809612000000',
            'support_email': 'support@shebafi.net',
            'address': 'Level 6, Sheba Tower, Road 27, Dhanmondi, Dhaka 1209',
            'sms_sender_id': 'SHEBAFI',
            'auto_lock_on_expiry': True,
            'grace_period_days': 2,
        }
    )

    # 2. Users & Staff
    admin_user, _ = User.objects.get_or_create(
        username='admin',
        defaults={'email': 'admin@shebafi.net', 'first_name': 'Super', 'last_name': 'Admin', 'is_staff': True, 'is_superuser': True}
    )
    admin_user.set_password('admin123')
    admin_user.save()
    admin_token, _ = Token.objects.get_or_create(user=admin_user)
    print(f"🔑 Master Admin Auth Token: {admin_token.key}")

    StaffProfile.objects.update_or_create(
        user=admin_user,
        defaults={'tenant': tenant, 'role': UserRole.ADMIN, 'phone': '01711000111', 'wallet_balance': Decimal('150000.00'), 'credit_limit': Decimal('500000.00')}
    )

    staff_data = [
        ('reseller_dhanmondi', 'dhanmondi@reseller.net', 'Farhan', 'Ahmed', UserRole.RESELLER, '01811223344', Decimal('45000.00'), Decimal('100000.00'), Decimal('15.00')),
        ('reseller_mirpur', 'mirpur@reseller.net', 'Kamrul', 'Hasan', UserRole.RESELLER, '01899887766', Decimal('28500.00'), Decimal('80000.00'), Decimal('12.00')),
        ('agent_gulshan', 'gulshan@agent.net', 'Sajid', 'Rahman', UserRole.AGENT, '01755443322', Decimal('12500.00'), Decimal('30000.00'), Decimal('8.00')),
        ('billing_sarah', 'sarah@shebafi.net', 'Sarah', 'Khatun', UserRole.BILLING_OPERATOR, '01611223344', Decimal('0.00'), Decimal('0.00'), Decimal('0.00')),
        ('tech_tareq', 'tareq@shebafi.net', 'Tareq', 'Zia', UserRole.LINE_MAN, '01911223344', Decimal('0.00'), Decimal('0.00'), Decimal('0.00')),
        ('support_rafi', 'rafi@shebafi.net', 'Rafiul', 'Islam', UserRole.SUPPORT_STAFF, '01511223344', Decimal('0.00'), Decimal('0.00'), Decimal('0.00')),
    ]

    staff_profiles = {}
    for uname, email, fn, ln, role, phone, wallet, credit, comm in staff_data:
        u, _ = User.objects.get_or_create(username=uname, defaults={'email': email, 'first_name': fn, 'last_name': ln, 'is_staff': True})
        u.set_password('password123')
        u.save()
        Token.objects.get_or_create(user=u)
        p, _ = StaffProfile.objects.update_or_create(
            user=u,
            defaults={'tenant': tenant, 'role': role, 'phone': phone, 'wallet_balance': wallet, 'credit_limit': credit, 'commission_rate': comm}
        )
        staff_profiles[uname] = p

    # 3. POP Branches
    pop_branches = [
        POPBranch.objects.update_or_create(
            tenant=tenant, code='POP-01',
            defaults={'name': 'POP-01 Dhanmondi Central Hub', 'location': 'Dhanmondi 27, Dhaka', 'in_charge': 'Tareq Zia', 'contact': '01911223344', 'total_capacity': 1500, 'power_backup': 'Online UPS 6kVA + Generator', 'status': 'Active'}
        )[0],
        POPBranch.objects.update_or_create(
            tenant=tenant, code='POP-02',
            defaults={'name': 'POP-02 Mirpur-10 Main Hub', 'location': 'Mirpur-10 Roundabout, Dhaka', 'in_charge': 'Kamrul Hasan', 'contact': '01899887766', 'total_capacity': 2000, 'power_backup': 'Online UPS 10kVA + Solar 3kW', 'status': 'Active'}
        )[0],
        POPBranch.objects.update_or_create(
            tenant=tenant, code='POP-03',
            defaults={'name': 'POP-03 Uttara Sector-7 Gateway', 'location': 'Sector 7, Jashimuddin Ave, Uttara', 'in_charge': 'Imran Hossain', 'contact': '01711229988', 'total_capacity': 1800, 'power_backup': 'Online UPS 6kVA', 'status': 'Active'}
        )[0],
        POPBranch.objects.update_or_create(
            tenant=tenant, code='POP-04',
            defaults={'name': 'POP-04 Gulshan-2 Backbone Node', 'location': 'Gulshan-2 North Ave', 'in_charge': 'Sajid Rahman', 'contact': '01755443322', 'total_capacity': 1200, 'power_backup': 'Dual Online UPS 10kVA', 'status': 'Active'}
        )[0],
        POPBranch.objects.update_or_create(
            tenant=tenant, code='POP-OLD-1',
            defaults={'name': 'POP-OLD Old Town Chawkbazar Node', 'location': 'Chawkbazar, Old Dhaka', 'in_charge': 'Retired Node', 'contact': 'N/A', 'total_capacity': 500, 'power_backup': 'Decommissioned', 'status': 'Decommissioned'}
        )[0],
        POPBranch.objects.update_or_create(
            tenant=tenant, code='POP-OLD-2',
            defaults={'name': 'POP-OLD Mohakhali Tower Station', 'location': 'TB Gate, Mohakhali', 'in_charge': 'Relocated to Gulshan', 'contact': 'N/A', 'total_capacity': 400, 'power_backup': 'Decommissioned', 'status': 'Decommissioned'}
        )[0],
    ]

    # 4. Routers (MikroTik)
    routers = [
        Router.objects.update_or_create(
            tenant=tenant, ip_address='103.145.118.1',
            defaults={'name': 'Core-CCR2004-Dhanmondi', 'api_port': 8728, 'username': 'admin', 'password': 'mikrotik_secure_pass_1', 'location': 'Dhanmondi NOC', 'status': 'Online', 'cpu_usage': 24, 'memory_usage': 42, 'active_pppoe_count': 640, 'total_customers_count': 780, 'last_ping': timezone.now()}
        )[0],
        Router.objects.update_or_create(
            tenant=tenant, ip_address='103.145.118.2',
            defaults={'name': 'Core-CCR1036-Mirpur', 'api_port': 8728, 'username': 'admin', 'password': 'mikrotik_secure_pass_2', 'location': 'Mirpur-10 POP', 'status': 'Online', 'cpu_usage': 38, 'memory_usage': 55, 'active_pppoe_count': 920, 'total_customers_count': 1150, 'last_ping': timezone.now()}
        )[0],
        Router.objects.update_or_create(
            tenant=tenant, ip_address='103.145.118.3',
            defaults={'name': 'Edge-CCR2116-Uttara', 'api_port': 8728, 'username': 'admin', 'password': 'mikrotik_secure_pass_3', 'location': 'Uttara Hub', 'status': 'Online', 'cpu_usage': 18, 'memory_usage': 31, 'active_pppoe_count': 490, 'total_customers_count': 610, 'last_ping': timezone.now()}
        )[0],
        Router.objects.update_or_create(
            tenant=tenant, ip_address='103.145.118.4',
            defaults={'name': 'Dist-RB4011-Gulshan', 'api_port': 8728, 'username': 'admin', 'password': 'mikrotik_secure_pass_4', 'location': 'Gulshan Substation', 'status': 'Online', 'cpu_usage': 44, 'memory_usage': 62, 'active_pppoe_count': 380, 'total_customers_count': 450, 'last_ping': timezone.now()}
        )[0],
    ]

    # 5. OLTs
    olts = [
        OLT.objects.update_or_create(
            tenant=tenant, ip_address='172.16.10.1',
            defaults={'name': 'OLT-01 VSOL 16-PON Dhanmondi', 'brand': OLTBrand.VSOL, 'snmp_community': 'public', 'pon_ports_count': 16, 'total_onus': 580, 'online_onus': 562, 'status': 'Online', 'last_sync': timezone.now()}
        )[0],
        OLT.objects.update_or_create(
            tenant=tenant, ip_address='172.16.10.2',
            defaults={'name': 'OLT-02 Huawei MA5800 Mirpur', 'brand': OLTBrand.HUAWEI, 'snmp_community': 'public', 'pon_ports_count': 16, 'total_onus': 850, 'online_onus': 821, 'status': 'Online', 'last_sync': timezone.now()}
        )[0],
        OLT.objects.update_or_create(
            tenant=tenant, ip_address='172.16.10.3',
            defaults={'name': 'OLT-03 ZTE C320 Uttara', 'brand': OLTBrand.ZTE, 'snmp_community': 'public', 'pon_ports_count': 8, 'total_onus': 410, 'online_onus': 398, 'status': 'Online', 'last_sync': timezone.now()}
        )[0],
        OLT.objects.update_or_create(
            tenant=tenant, ip_address='172.16.10.4',
            defaults={'name': 'OLT-04 BDCOM GP3600 Gulshan', 'brand': OLTBrand.BDCOM, 'snmp_community': 'public', 'pon_ports_count': 8, 'total_onus': 320, 'online_onus': 315, 'status': 'Online', 'last_sync': timezone.now()}
        )[0],
    ]

    # 6. ONUs
    onu_templates = [
        ('EPON0/1', 1, 'AA:BB:CC:11:22:33', 'VSOL12345678', 'Anisur Rahman', '01711112233', Decimal('-18.40'), Decimal('2.15'), 'Online', 450),
        ('EPON0/1', 2, 'AA:BB:CC:11:22:34', 'VSOL12345679', 'Tahmina Akter', '01711112234', Decimal('-19.80'), Decimal('2.20'), 'Online', 620),
        ('EPON0/1', 3, 'AA:BB:CC:11:22:35', 'VSOL12345680', 'Mahmudul Hasan', '01711112235', Decimal('-25.60'), Decimal('2.05'), 'Online', 1450), # Warning signal
        ('EPON0/2', 1, 'AA:BB:CC:22:33:44', 'HWTC88990011', 'Arif Chowdhury', '01811112236', Decimal('-17.90'), Decimal('2.40'), 'Online', 380),
        ('EPON0/2', 2, 'AA:BB:CC:22:33:45', 'HWTC88990012', 'Farzana Yasmin', '01811112237', Decimal('-28.50'), Decimal('1.80'), 'Los', 2100), # Critical LOS
        ('EPON0/3', 1, 'AA:BB:CC:33:44:55', 'ZTEG99887766', 'Nusrat Jahan', '01911112238', Decimal('-20.10'), Decimal('2.10'), 'DyingGasp', 890), # Power outage
        ('EPON0/3', 2, 'AA:BB:CC:33:44:56', 'ZTEG99887767', 'Zubair Hossain', '01911112239', Decimal('-19.20'), Decimal('2.30'), 'Online', 540),
        ('EPON0/4', 1, 'AA:BB:CC:44:55:66', 'BDCM55443322', 'Monirul Islam', '01611112240', Decimal('-21.30'), Decimal('2.00'), 'Online', 780),
    ]

    for port, idx, mac, sn, cname, cphone, rx, tx, st, dist in onu_templates:
        ONU.objects.update_or_create(
            tenant=tenant, olt=olts[0], pon_port=port, onu_index=idx,
            defaults={'mac_address': mac, 'serial_number': sn, 'customer_name': cname, 'customer_phone': cphone, 'rx_power': rx, 'tx_power': tx, 'status': st, 'distance_meters': dist}
        )

    # 7. Packages
    packages = [
        Package.objects.update_or_create(
            tenant=tenant, name='Starter Fiber 10M',
            defaults={'mikrotik_profile': 'pkg_10mbps', 'speed_mbps': 10, 'upload_speed_mbps': 10, 'validity_days': 30, 'regular_price': Decimal('500.00'), 'min_reseller_price': Decimal('350.00'), 'description': 'Affordable 10 Mbps unlimited bufferless fiber for home internet.'}
        )[0],
        Package.objects.update_or_create(
            tenant=tenant, name='Turbo Stream 25M',
            defaults={'mikrotik_profile': 'pkg_25mbps', 'speed_mbps': 25, 'upload_speed_mbps': 25, 'validity_days': 30, 'regular_price': Decimal('800.00'), 'min_reseller_price': Decimal('550.00'), 'description': '25 Mbps high-speed streaming with YouTube, BDIX, Netflix caching.'}
        )[0],
        Package.objects.update_or_create(
            tenant=tenant, name='Ultra Gamer 50M',
            defaults={'mikrotik_profile': 'pkg_50mbps', 'speed_mbps': 50, 'upload_speed_mbps': 50, 'validity_days': 30, 'regular_price': Decimal('1200.00'), 'min_reseller_price': Decimal('850.00'), 'description': '50 Mbps low latency gaming package with optimized routing.'}
        )[0],
        Package.objects.update_or_create(
            tenant=tenant, name='Enterprise Gig 100M',
            defaults={'mikrotik_profile': 'pkg_100mbps', 'speed_mbps': 100, 'upload_speed_mbps': 100, 'validity_days': 30, 'regular_price': Decimal('2200.00'), 'min_reseller_price': Decimal('1600.00'), 'description': '100 Mbps symmetric dedicated enterprise fiber with 99.9% SLA.'}
        )[0],
        Package.objects.update_or_create(
            tenant=tenant, name='Free Community WiFi',
            defaults={'mikrotik_profile': 'pkg_free_hotspot', 'speed_mbps': 5, 'upload_speed_mbps': 5, 'validity_days': 30, 'regular_price': Decimal('0.00'), 'min_reseller_price': Decimal('0.00'), 'description': 'Sponsored zero-cost community hotspot connection.'}
        )[0],
    ]

    # Reseller Rates
    for pkg in packages:
        ResellerPricing.objects.update_or_create(
            tenant=tenant, reseller=staff_profiles['reseller_dhanmondi'], package=pkg,
            defaults={'custom_price': pkg.min_reseller_price + Decimal('50.00')}
        )

    # Offers / Promotions
    Offer.objects.update_or_create(
        tenant=tenant, name='Winter Super Saver (90+30 Days Free)',
        defaults={'buy_days': 90, 'free_days': 30, 'discount_amount': Decimal('200.00'), 'description': 'Pay 3 months upfront and get 1 month completely free with free optical fiber router.', 'valid_until': timezone.now().date() + datetime.timedelta(days=90), 'is_active': True}
    )
    Offer.objects.update_or_create(
        tenant=tenant, name='Half-Yearly Fiber Fest (180+60 Days Free)',
        defaults={'buy_days': 180, 'free_days': 60, 'discount_amount': Decimal('500.00'), 'description': 'Pay 6 months upfront and get 2 months free with double BDIX bandwidth boost.', 'valid_until': timezone.now().date() + datetime.timedelta(days=180), 'is_active': True}
    )

    # 8. Customers
    today = timezone.now().date()
    customers_raw = [
        ('SHB-1001', 'Tariqul Islam', '01712345678', 'tariqul@gmail.com', 'House 14, Road 5, Dhanmondi', 'Dhanmondi Zone', 'tariqul_dhn', packages[1], Decimal('800.00'), Decimal('0.00'), Decimal('0.00'), today + datetime.timedelta(days=22), CustomerStatus.ACTIVE, None, routers[0], staff_profiles['reseller_dhanmondi']),
        ('SHB-1002', 'Farhana Chowdhury', '01812345679', 'farhana@yahoo.com', 'Plot 45, Mirpur-10', 'Mirpur Zone', 'farhana_mpr', packages[2], Decimal('1200.00'), Decimal('0.00'), Decimal('400.00'), today + datetime.timedelta(days=18), CustomerStatus.ACTIVE, None, routers[1], staff_profiles['reseller_mirpur']),
        ('SHB-1003', 'Dr. Ahsan Habib', '01912345680', 'ahsan@hospital.bd', 'Sector 3, Uttara', 'Uttara Zone', 'dr_ahsan_utt', packages[3], Decimal('2200.00'), Decimal('0.00'), Decimal('0.00'), today + datetime.timedelta(days=28), CustomerStatus.ACTIVE, None, routers[2], None),
        ('SHB-1004', 'Tanvir Ahmed', '01612345681', 'tanvir@gmail.com', 'Road 11, Banani', 'Banani Zone', 'tanvir_bnn', packages[1], Decimal('800.00'), Decimal('800.00'), Decimal('0.00'), today - datetime.timedelta(days=3), CustomerStatus.EXPIRED, None, routers[3], staff_profiles['agent_gulshan']),
        ('SHB-1005', 'Kazi Moniruzzaman', '01512345682', 'kazi@techbd.com', 'Road 27, Dhanmondi', 'Dhanmondi Zone', 'kazi_monir', packages[2], Decimal('1200.00'), Decimal('1200.00'), Decimal('0.00'), today + datetime.timedelta(days=4), CustomerStatus.ACTIVE, today + datetime.timedelta(days=5), routers[0], staff_profiles['reseller_dhanmondi']), # Promise Active
        ('SHB-1006', 'Sadia Afrin', '01712345683', 'sadia@gmail.com', 'Block D, Mirpur-2', 'Mirpur Zone', 'sadia_mpr', packages[0], Decimal('500.00'), Decimal('1500.00'), Decimal('0.00'), today - datetime.timedelta(days=12), CustomerStatus.SUSPENDED, None, routers[1], staff_profiles['reseller_mirpur']), # Suspended
        ('SHB-1007', 'Shafiqul Alam', '01812345684', 'shafiq@mail.com', 'Green Road, Dhaka', 'Central Zone', 'shafiq_left', packages[0], Decimal('500.00'), Decimal('0.00'), Decimal('0.00'), today - datetime.timedelta(days=45), CustomerStatus.LEFT, None, routers[0], None), # Left
        ('SHB-1008', 'Dhanmondi Club Free WiFi', '01700000001', 'club@dhanmondi.org', 'Dhanmondi Lake View', 'Dhanmondi Zone', 'dhn_club_free', packages[4], Decimal('0.00'), Decimal('0.00'), Decimal('0.00'), today + datetime.timedelta(days=365), CustomerStatus.ACTIVE, None, routers[0], None), # Free Client
        ('SHB-1009', 'Naimur Rahman', '01912345685', 'naim@gmail.com', 'Sector 11, Uttara', 'Uttara Zone', 'naim_utt', packages[1], Decimal('800.00'), Decimal('0.00'), Decimal('1600.00'), today + datetime.timedelta(days=15), CustomerStatus.ACTIVE, None, routers[2], None),
        ('SHB-1010', 'Rehana Parveen', '01612345686', 'rehana@gmail.com', 'Gulshan Avenue', 'Gulshan Zone', 'rehana_gls', packages[2], Decimal('1200.00'), Decimal('600.00'), Decimal('0.00'), today + datetime.timedelta(days=9), CustomerStatus.ACTIVE, None, routers[3], staff_profiles['agent_gulshan']),
    ]

    saved_customers = []
    for code, name, mob, em, addr, zone, user_p, pkg, mbill, due, adv, exp, stat, pdate, rtr, res in customers_raw:
        c, _ = Customer.objects.update_or_create(
            tenant=tenant, pppoe_username=user_p,
            defaults={
                'customer_code': code,
                'full_name': name,
                'mobile': mob,
                'email': em,
                'address': addr,
                'area_zone': zone,
                'connection_type': ConnectionType.PPPOE,
                'router': rtr,
                'pppoe_password': 'pass_' + user_p,
                'package': pkg,
                'billing_type': BillingType.PREPAID,
                'monthly_bill': mbill,
                'due_amount': due,
                'advance_amount': adv,
                'expiry_date': exp,
                'promise_date': pdate,
                'status': stat,
                'reseller': res,
            }
        )
        saved_customers.append(c)

    # 9. Invoices & Recharges
    for c in saved_customers[:5]:
        inv_no = f"INV-{c.customer_code[-4:]}-{today.strftime('%Y%m')}"
        Invoice.objects.update_or_create(
            tenant=tenant, invoice_no=inv_no,
            defaults={
                'customer': c,
                'billing_month': 'September 2026',
                'package_name': c.package.name,
                'package_amount': c.monthly_bill,
                'previous_due': c.due_amount,
                'discount': Decimal('0.00'),
                'total_payable': c.monthly_bill + c.due_amount,
                'paid_amount': c.monthly_bill if c.status == CustomerStatus.ACTIVE else Decimal('0.00'),
                'due_amount': Decimal('0.00') if c.status == CustomerStatus.ACTIVE else c.due_amount,
                'status': Invoice.InvoiceStatus.PAID if c.status == CustomerStatus.ACTIVE else Invoice.InvoiceStatus.UNPAID,
                'due_date': today + datetime.timedelta(days=10),
            }
        )

        Recharge.objects.update_or_create(
            tenant=tenant, customer=c, trx_id='TXN-' + str(uuid.uuid4())[:8].upper(),
            defaults={
                'package': c.package,
                'processed_by': staff_profiles['billing_sarah'],
                'amount': c.monthly_bill,
                'validity_days': 30,
                'old_expiry': today - datetime.timedelta(days=8),
                'new_expiry': c.expiry_date,
                'payment_method': 'bKash / Auto SMS',
                'notes': 'Monthly bill auto-credited'
            }
        )

    # 10. Payment Gateways & Transactions
    bkash_gw, _ = PaymentGateway.objects.update_or_create(
        tenant=tenant, provider=GatewayProvider.BKASH,
        defaults={'title': 'bKash Merchant Gateway', 'merchant_number': '01711000111', 'app_key': 'bkash_live_app_key', 'is_active': True, 'is_sandbox': False}
    )
    nagad_gw, _ = PaymentGateway.objects.update_or_create(
        tenant=tenant, provider=GatewayProvider.NAGAD,
        defaults={'title': 'Nagad Online Payment', 'merchant_number': '01811000111', 'is_active': True, 'is_sandbox': False}
    )

    sample_txs = [
        (saved_customers[0], Decimal('800.00'), '9K8L7M6N5P', 'bKash', TransactionStatus.SUCCESS, '01712345678'),
        (saved_customers[1], Decimal('1200.00'), '8J7H6G5F4D', 'Nagad', TransactionStatus.SUCCESS, '01812345679'),
        (saved_customers[2], Decimal('2200.00'), '7S6A5D4F3G', 'SSLCommerz', TransactionStatus.SUCCESS, '01912345680'),
        (saved_customers[4], Decimal('1200.00'), '6Q5W4E3R2T', 'bKash', TransactionStatus.MATCHED, '01512345682'),
    ]

    for cust, amt, trx, method, st, acc in sample_txs:
        PaymentTransaction.objects.update_or_create(
            tenant=tenant, trx_id=trx,
            defaults={'customer': cust, 'gateway': bkash_gw if 'bkash' in method.lower() else nagad_gw, 'amount': amt, 'payment_method': method, 'status': st, 'customer_account': acc}
        )

    # SMS Logs
    sms_samples = [
        ('bKash', 'You have received Tk 800.00 from 01712345678. Fee Tk 0.00. Balance Tk 18500. TrxID 9K8L7M6N5P at 01/09/2026 14:30', 'bKash', Decimal('800.00'), '9K8L7M6N5P', '01712345678', True, saved_customers[0]),
        ('Nagad', 'Payment of Tk 1,200.00 received from 01812345679. Txn: 8J7H6G5F4D. Current Balance: Tk 32,450.00', 'Nagad', Decimal('1200.00'), '8J7H6G5F4D', '01812345679', True, saved_customers[1]),
        ('bKash', 'You have received Tk 500.00 from 01799887766. Fee Tk 0.00. Balance Tk 19000. TrxID 5Z4X3C2V1B at 01/09/2026 16:15', 'bKash', Decimal('500.00'), '5Z4X3C2V1B', '01799887766', False, None),
    ]

    for snd, raw, prov, amt, trx, acc, matched, mcust in sms_samples:
        SmsLog.objects.update_or_create(
            tenant=tenant, parsed_trx_id=trx,
            defaults={'sender': snd, 'raw_message': raw, 'parsed_provider': prov, 'parsed_amount': amt, 'parsed_account': acc, 'is_matched': matched, 'matched_customer': mcust}
        )

    # 11. User Sessions
    for i, c in enumerate(saved_customers[:6]):
        UserSession.objects.update_or_create(
            tenant=tenant, username=c.pppoe_username,
            defaults={
                'router': c.router or routers[0],
                'ip_address': f'10.20.{i+1}.145',
                'mac_address': f'C8:54:4B:{i*11:02X}:{i*13:02X}:9A',
                'caller_id': c.mobile,
                'uptime': f'{random.randint(1, 14)}d {random.randint(2, 23)}h {random.randint(5, 58)}m',
                'bytes_in': random.randint(15000000000, 85000000000),
                'bytes_out': random.randint(3500000000, 18000000000),
            }
        )

    # 12. Support Tickets
    tickets_data = [
        ('TCK-901', saved_customers[0], 'Fiber / Optical Loss', 'Red LOS light blinking on ONU', 'Customer reported internet went down after heavy rainfall. Optical power LOS detected on EPON0/1.', 'Critical', 'Open', admin_user),
        ('TCK-902', saved_customers[1], 'Speed & Latency', 'High ping latency on Singapore routing', 'Customer experiencing packet drops while gaming on Valorant and CS2 servers.', 'Medium', 'In_Progress', admin_user),
        ('TCK-903', saved_customers[2], 'Billing / Recharge', 'Invoice copy request for corporate audit', 'Customer requires signed GST invoice for tax submission.', 'Low', 'Resolved', admin_user),
    ]

    for tno, cust, cat, subj, desc, prio, st, assigned in tickets_data:
        t, _ = Ticket.objects.update_or_create(
            tenant=tenant, ticket_no=tno,
            defaults={'customer': cust, 'category': cat, 'subject': subj, 'description': desc, 'priority': prio, 'status': st, 'assigned_to': assigned}
        )
        TicketReply.objects.get_or_create(
            ticket=t, message='Support engineer has dispatched field team with OTDR splice machine to inspect distribution loop.', sender=admin_user, sender_name='NOC Support Dispatch', is_staff=True
        )

    # 13. HR Management
    employees_data = [
        ('EMP-001', 'Tarequl Islam', 'NOC Team Lead', 'Technical & NOC', '01911223344', 'tareq@shebafi.net', Decimal('45000.00')),
        ('EMP-002', 'Sarah Khatun', 'Senior Billing Executive', 'Finance & Billing', '01611223344', 'sarah@shebafi.net', Decimal('32000.00')),
        ('EMP-003', 'Rafiul Islam', 'Customer Care Specialist', 'Support & Helpdesk', '01511223344', 'rafi@shebafi.net', Decimal('26000.00')),
        ('EMP-004', 'Imran Hossain', 'Senior Fiber Optical Splicer', 'Field Operations', '01711229988', 'imran@shebafi.net', Decimal('28000.00')),
    ]

    saved_employees = []
    for ecode, name, desg, dept, ph, em, sal in employees_data:
        emp, _ = Employee.objects.update_or_create(
            tenant=tenant, employee_code=ecode,
            defaults={'full_name': name, 'designation': desg, 'department': dept, 'phone': ph, 'email': em, 'basic_salary': sal, 'is_active': True}
        )
        saved_employees.append(emp)

        # Attendance
        Attendance.objects.update_or_create(
            tenant=tenant, employee=emp, date=today,
            defaults={'check_in': datetime.time(9, 15), 'check_out': None, 'status': 'Present', 'punch_source': 'Biometric / Mobile App'}
        )

        # Payroll
        PayrollRecord.objects.update_or_create(
            tenant=tenant, employee=emp, month='September 2026',
            defaults={'basic_salary': sal, 'allowance': Decimal('3000.00'), 'deductions': Decimal('0.00'), 'net_payable': sal + Decimal('3000.00'), 'payment_status': 'Paid', 'disbursed_at': today}
        )

    # Leave & Advance Salary
    LeaveRequest.objects.update_or_create(
        tenant=tenant, employee=saved_employees[0], start_date=today + datetime.timedelta(days=7), end_date=today + datetime.timedelta(days=9),
        defaults={'leave_type': 'Casual', 'days_count': 3, 'reason': 'Family emergency out of city', 'status': 'Approved', 'approved_by': admin_user}
    )
    AdvanceSalary.objects.update_or_create(
        tenant=tenant, employee=saved_employees[1],
        defaults={'amount': Decimal('10000.00'), 'deduction_month': 'October 2026', 'reason': 'Medical treatment advance', 'status': 'Approved'}
    )

    # 14. Store & Inventory
    cat_fiber, _ = ItemCategory.objects.update_or_create(tenant=tenant, name='Fiber Optical Cables')
    cat_onu, _ = ItemCategory.objects.update_or_create(tenant=tenant, name='ONU & ONT Routers')
    cat_accessories, _ = ItemCategory.objects.update_or_create(tenant=tenant, name='TJ Boxes, Splitters & SFP')

    store_items_data = [
        (cat_fiber, '2-Core FTTH Drop Cable Roll', 'CBL-2C-1000M', 'Roll', Decimal('3800.00'), 45, 10),
        (cat_fiber, '24-Core Armored Backbone Cable', 'CBL-24C-ARMD', 'Meter', Decimal('85.00'), 1200, 300),
        (cat_onu, 'VSOL Single-Port Gigabit XPON ONU', 'VSOL-V2801SG', 'Pcs', Decimal('1150.00'), 180, 25),
        (cat_onu, 'Huawei Dual-Band Wi-Fi 6 GPON ONT', 'HW-EG8145V5', 'Pcs', Decimal('3200.00'), 60, 15),
        (cat_accessories, '1x8 PLC Optical Fiber Splitter Mini', 'SPL-1X8-MINI', 'Pcs', Decimal('220.00'), 140, 30),
        (cat_accessories, 'SFP+ 10G 20km Optical Transceiver', 'SFP-10G-20KM', 'Pcs', Decimal('1850.00'), 28, 8),
    ]

    for cat, iname, icode, unit, price, stock, alert in store_items_data:
        si, _ = StoreItem.objects.update_or_create(
            tenant=tenant, item_code=icode,
            defaults={'category': cat, 'name': iname, 'unit': unit, 'unit_price': price, 'stock_quantity': stock, 'min_stock_alert': alert}
        )
        StockTransaction.objects.get_or_create(
            tenant=tenant, item=si, transaction_type=StockTransaction.TransactionType.IN, quantity=stock, recipient_or_supplier='FiberTech International Supplies Ltd.'
        )

    # 15. Tasks
    tasks_data = [
        ('Core Fiber Splice Loop Optimization', 'Perform OTDR trace calibration on Dhanmondi-to-Mirpur 24-core backbone cable.', admin_user, 'High', 'In_Progress', today + datetime.timedelta(days=2)),
        ('Sub-Reseller Revenue Reconciliation', 'Audit wallet ledger balances and verify August commission payouts.', admin_user, 'Medium', 'Pending', today + datetime.timedelta(days=4)),
        ('MikroTik RouterOS 7.15 Long-Term Upgrade', 'Schedule nocturnal maintenance window (03:00 AM - 04:30 AM) for CCR routers.', admin_user, 'High', 'Pending', today + datetime.timedelta(days=6)),
    ]

    for title, desc, ass, prio, st, ddate in tasks_data:
        Task.objects.update_or_create(
            tenant=tenant, title=title,
            defaults={'description': desc, 'assigned_to': ass, 'priority': prio, 'status': st, 'due_date': ddate}
        )

    # 16. Call Center
    call_logs_data = [
        (saved_customers[0], '01712345678', admin_user, 'Inbound', 145, 'Answered', 'Customer inquired about fiber connection status and package upgrade.'),
        (saved_customers[3], '01612345681', admin_user, 'Outbound', 92, 'Answered', 'Automated bill expiry reminder call; customer agreed to pay via bKash today.'),
        (saved_customers[5], '01712345683', admin_user, 'Broadcast', 45, 'Answered', 'Voice broadcast reminder for overdue invoice.'),
    ]

    for cust, cnum, ag, ctype, dur, st, notes in call_logs_data:
        CallLog.objects.update_or_create(
            tenant=tenant, caller_number=cnum, call_type=ctype,
            defaults={'customer': cust, 'agent': ag, 'duration_seconds': dur, 'status': st, 'notes': notes}
        )

    # 17. Audit Logs
    AuditLog.objects.create(
        tenant=tenant, actor_username='admin', action='SEED_DATABASE', module='SYSTEM',
        details={'status': 'Database successfully seeded with comprehensive mock ISP records.'}
    )

    print("✅ Database seeding completed successfully with all models, subscribers, and network equipment!")


if __name__ == '__main__':
    run_seed()

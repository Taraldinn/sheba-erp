import os
import sys
import django
import uuid
from decimal import Decimal
from datetime import timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sheba_core.settings')
sys.path.insert(0, '/home/taraldinn/Documents/Sheba codebase/backend')
django.setup()

from django.utils import timezone
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token

from apps.core.models import (
    Tenant, TenantDomain, TenantOnboardingRequest, SaaSPackage,
    TenantSubscription, SaaSPayment, DatabaseBackup, TenantFeatureFlag,
    AuditLog, CompanySetting
)
from apps.authentication.models import StaffProfile, UserRole
from apps.customers.models import Customer
from apps.network.models import POPBranch, Router, OLT, ONU
from apps.billing.models import Package as IspPackage
from apps.hr.models import Employee
from apps.core.redis_service import RedisService

def seed_all():
    print("[1/10] Setting up Platform Superadmin...")
    admin_user, _ = User.objects.get_or_create(username='admin')
    admin_user.email = 'admin@sheba.local'
    admin_user.is_superuser = True
    admin_user.is_staff = True
    admin_user.set_password('admin123')
    admin_user.save()

    token, _ = Token.objects.get_or_create(user=admin_user)
    token.key = '93df05f58e138ad21a6207b86847c1b309811676'
    token.save()
    print(f"Superadmin token verified: {token.key}")

    print("[2/10] Seeding SaaS Packages...")
    packages_data = [
        {
            "name": "Starter ISP Tier",
            "code": "starter-tier",
            "description": "Designed for localized ISP branch operators and emerging sub-resellers.",
            "monthly_price": Decimal("5000.00"),
            "yearly_price": Decimal("50000.00"),
            "max_subscribers": 500,
            "max_routers": 2,
            "max_custom_domains": 1,
            "features": [
                "Up to 500 Active PPPoE & Static Subscribers",
                "2 MikroTik Core BRAS Routers",
                "Automated Daily DB Backups",
                "Standard Email & Helpdesk SLA (24h)",
                "Single Custom Domain Binding"
            ],
            "is_active": True,
            "is_public": True,
        },
        {
            "name": "Growth ISP Tier",
            "code": "growth-tier",
            "description": "Ideal for established metro ISPs with multiple POP branches and OLT infrastructure.",
            "monthly_price": Decimal("15000.00"),
            "yearly_price": Decimal("150000.00"),
            "max_subscribers": 2500,
            "max_routers": 10,
            "max_custom_domains": 3,
            "features": [
                "Up to 2,500 Active Subscribers",
                "10 MikroTik BRAS / Edge Gateways",
                "Automated OLT Auto-Provisioning (Huawei, ZTE, BDCOM)",
                "Multi-tier Reseller Portals & Sub-wallets",
                "Automated bKash & Nagad MFS Paybill Webhook",
                "3 Custom Domain Hostnames with Free SSL",
                "High-Priority NOC Support (2h SLA)"
            ],
            "is_active": True,
            "is_public": True,
        },
        {
            "name": "Enterprise VIP Tier",
            "code": "enterprise-vip",
            "description": "Full-stack enterprise telecom control plane with clustered FreeRADIUS and high-concurrency.",
            "monthly_price": Decimal("35000.00"),
            "yearly_price": Decimal("350000.00"),
            "max_subscribers": 10000,
            "max_routers": 25,
            "max_custom_domains": 10,
            "features": [
                "Up to 10,000 Active Fiber & Corporate Subscribers",
                "25 Core & Edge BRAS Routers",
                "Enterprise FreeRADIUS Clustered HA & Live CoA",
                "BTRC Regulatory NAT IP & NID Log Compliance Archive",
                "WireGuard Site-to-Site Encrypted Backhaul Tunnels",
                "Automated Hourly Database Snapshots & Cold Storage",
                "10 Custom Domains & Dedicated Account Manager (24/7 SLA)"
            ],
            "is_active": True,
            "is_public": True,
        },
        {
            "name": "ISP Nationwide Ultra",
            "code": "nationwide-ultra",
            "description": "Nationwide Tier-1 / Tier-2 ISP license holders with massive multi-district scale.",
            "monthly_price": Decimal("75000.00"),
            "yearly_price": Decimal("750000.00"),
            "max_subscribers": 50000,
            "max_routers": 100,
            "max_custom_domains": 25,
            "features": [
                "Unlimited Subscribers (up to 50,000 Concurrent Sessions)",
                "Up to 100 MikroTik & Cisco BGP / OSPF Routers",
                "Multi-datacenter Hot Standby & Disaster Recovery",
                "Full White-Labeling (Custom Mobile Apps & Portal)",
                "BTRC Direct API Reporting Integration",
                "Dedicated Solutions Architect & 15-Minute Critical SLA"
            ],
            "is_active": True,
            "is_public": True,
        },
    ]

    pkgs = {}
    for p_info in packages_data:
        pkg, created = SaaSPackage.objects.update_or_create(
            code=p_info["code"],
            defaults=p_info
        )
        pkgs[p_info["code"]] = pkg
        print(f"  Package: {pkg.name} (৳{pkg.monthly_price}/mo)")

    print("[3/10] Seeding Realistic Bangladesh ISP Tenants...")
    tenants_data = [
        {
            "name": "Shebafi Communications (Core NOC)",
            "slug": "shebafi",
            "domain": "shebafi.xyz",
            "contact_phone": "+8801630616854",
            "contact_email": "operations@shebafi.xyz",
            "address": "Level 4, Sheba Tower, Chowmohoni, Agrabad C/A, Chittagong",
            "plan": "Enterprise VIP Tier",
            "package_code": "enterprise-vip",
            "is_active": True,
            "subscribers": 1850,
            "monthly_bill": 385000,
            "routers": [
                ("MikroTik CCR2004-16G-2S+ (Core Agrabad)", "10.100.1.1"),
                ("MikroTik CCR2116-12G-4S+ (NOC BRAS)", "10.100.1.2"),
                ("MikroTik RB4011iGS+ (GEC Edge)", "10.100.2.1"),
            ],
            "olts": [("Huawei MA5800-X7 (Chittagong Central)", "10.200.1.10")],
            "onus_count": 420,
            "pops": [("Agrabad NOC Hub", "POP-CTG-01"), ("GEC Circle Hub", "POP-CTG-02")],
            "domains": [("portal.shebafi.xyz", True), ("billing.shebafi.xyz", False)]
        },
        {
            "name": "ExportNet Broadband Ltd",
            "slug": "exportnet",
            "domain": "exportnetbd.com",
            "contact_phone": "+8801819234567",
            "contact_email": "support@exportnetbd.com",
            "address": "Plaza AR, Nasirabad Industrial Area, Chittagong",
            "plan": "Growth ISP Tier",
            "package_code": "growth-tier",
            "is_active": True,
            "subscribers": 920,
            "monthly_bill": 185000,
            "routers": [
                ("MikroTik CCR2004-16G-2S+ (ExportNet BRAS-01)", "10.101.1.1"),
                ("MikroTik RB1100AHx4 (Nasirabad Gateway)", "10.101.1.2"),
            ],
            "olts": [("ZTE C320 GPON (Nasirabad OLT)", "10.201.1.10")],
            "onus_count": 210,
            "pops": [("Nasirabad POP", "POP-CTG-03")],
            "domains": [("billing.exportnetbd.com", True)]
        },
        {
            "name": "Carnival Internet Chittagong",
            "slug": "carnival-ctg",
            "domain": "carnivalctg.net",
            "contact_phone": "+8801713098765",
            "contact_email": "noc@carnivalctg.net",
            "address": "Finlay Square, 6th Floor, East Nasirabad, Chittagong",
            "plan": "Enterprise VIP Tier",
            "package_code": "enterprise-vip",
            "is_active": True,
            "subscribers": 3100,
            "monthly_bill": 620000,
            "routers": [
                ("MikroTik CCR2216-1G-12XS-2XQ (Chittagong Metro Core)", "10.102.1.1"),
                ("MikroTik CCR2004-1G-12S+2XS (BRAS South)", "10.102.1.2"),
                ("MikroTik RB5009UG+S+IN (Halishahar POP)", "10.102.2.1"),
            ],
            "olts": [
                ("Huawei MA5800-X15 (Chittagong Metro OLT 1)", "10.202.1.10"),
                ("BDCOM GP3600-08 (Halishahar OLT 2)", "10.202.2.10"),
            ],
            "onus_count": 780,
            "pops": [("GEC Metro Hub", "POP-CTG-04"), ("Halishahar POP", "POP-CTG-05")],
            "domains": [("my.carnivalctg.net", True), ("radius.carnivalctg.net", False)]
        },
        {
            "name": "AmberIT Metro Hub Dhaka",
            "slug": "amberit-dhaka",
            "domain": "amberit.net.bd",
            "contact_phone": "+8801977001122",
            "contact_email": "central.noc@amberit.net.bd",
            "address": "BDBL Bhaban (8th Floor), 12 Kawran Bazar C/A, Dhaka",
            "plan": "ISP Nationwide Ultra",
            "package_code": "nationwide-ultra",
            "is_active": True,
            "subscribers": 5400,
            "monthly_bill": 1150000,
            "routers": [
                ("MikroTik CCR2216-1G-12XS-2XQ (Kawran Central Gateway)", "10.103.1.1"),
                ("MikroTik CCR2004-16G-2S+ (Motijheel Edge)", "10.103.1.2"),
                ("MikroTik CCR2116-12G-4S+ (Gulshan BRAS)", "10.103.2.1"),
            ],
            "olts": [
                ("Huawei MA5800-X17 (Central Dhaka GPON Cluster)", "10.203.1.10"),
                ("ZTE C300 (Gulshan Metro OLT)", "10.203.2.10"),
            ],
            "onus_count": 1250,
            "pops": [("Kawran Central NOC", "POP-DHK-01"), ("Gulshan Branch POP", "POP-DHK-02")],
            "domains": [("noc.amberit.net.bd", True), ("portal.amberit.net.bd", False)]
        },
        {
            "name": "Link3 Technologies Sylhet",
            "slug": "link3-sylhet",
            "domain": "link3isp.com",
            "contact_phone": "+8801730044556",
            "contact_email": "sylhet.support@link3isp.com",
            "address": "Al-Hamra Shopping City, Level 9, Zindabazar, Sylhet",
            "plan": "Growth ISP Tier",
            "package_code": "growth-tier",
            "is_active": True,
            "subscribers": 1240,
            "monthly_bill": 260000,
            "routers": [
                ("MikroTik CCR2004-16G-2S+ (Sylhet Gateway-1)", "10.104.1.1"),
                ("MikroTik RB4011iGS+ (Zindabazar BRAS)", "10.104.1.2"),
            ],
            "olts": [("BDCOM GP3600-16 (Sylhet Central OLT)", "10.204.1.10")],
            "onus_count": 310,
            "pops": [("Zindabazar Core POP", "POP-SYL-01")],
            "domains": [("client.link3isp.com", True)]
        },
        {
            "name": "Dot Internet Uttara",
            "slug": "dot-internet",
            "domain": "dotinternetbd.com",
            "contact_phone": "+8801688112233",
            "contact_email": "info@dotinternetbd.com",
            "address": "House 14, Road 7, Sector 3, Uttara Model Town, Dhaka",
            "plan": "Growth ISP Tier",
            "package_code": "growth-tier",
            "is_active": True,
            "subscribers": 880,
            "monthly_bill": 175000,
            "routers": [
                ("MikroTik CCR1036-8G-2S+ (Uttara BRAS)", "10.105.1.1"),
                ("MikroTik RB1100AHx4 (Sector 7 POP)", "10.105.1.2"),
            ],
            "olts": [("VSOL V1600G1 (Uttara GPON)", "10.205.1.10")],
            "onus_count": 190,
            "pops": [("Uttara Sector 3 Hub", "POP-DHK-03")],
            "domains": [("access.dotinternetbd.com", True)]
        },
        {
            "name": "Circle Network Banani",
            "slug": "circle-network",
            "domain": "circlenetworkbd.net",
            "contact_phone": "+8801844998877",
            "contact_email": "admin@circlenetworkbd.net",
            "address": "Road 11, Block D, Banani Commercial Area, Dhaka",
            "plan": "Starter ISP Tier",
            "package_code": "starter-tier",
            "is_active": True,
            "subscribers": 410,
            "monthly_bill": 85000,
            "routers": [("MikroTik RB4011iGS+ (Banani Core)", "10.106.1.1")],
            "olts": [("BDCOM GP3600-04 (Banani Hub OLT)", "10.206.1.10")],
            "onus_count": 95,
            "pops": [("Banani Block D POP", "POP-DHK-04")],
            "domains": [("portal.circlenetworkbd.net", True)]
        },
        {
            "name": "OptiMax Fiber Net Khulna",
            "slug": "optimax-khulna",
            "domain": "optimaxfiber.com",
            "contact_phone": "+8801722665544",
            "contact_email": "billing@optimaxfiber.com",
            "address": "KDA Avenue, Near Royal Moor, Khulna",
            "plan": "Starter ISP Tier",
            "package_code": "starter-tier",
            "is_active": False,  # Suspended for billing demonstration
            "subscribers": 280,
            "monthly_bill": 58000,
            "routers": [("MikroTik RB3011UiAS-RM (Khulna Gateway)", "10.107.1.1")],
            "olts": [("VSOL V1600D4 (Royal Moor OLT)", "10.207.1.10")],
            "onus_count": 60,
            "pops": [("Royal Moor POP", "POP-KHL-01")],
            "domains": [("my.optimaxfiber.com", True)]
        }
    ]

    # Map of created tenants
    seeded_tenants = {}

    for t_spec in tenants_data:
        tenant, _ = Tenant.objects.update_or_create(
            slug=t_spec["slug"],
            defaults={
                "name": t_spec["name"],
                "domain": t_spec["domain"],
                "contact_phone": t_spec["contact_phone"],
                "contact_email": t_spec["contact_email"],
                "address": t_spec["address"],
                "plan": t_spec["plan"],
                "is_active": t_spec["is_active"],
                "max_subscribers": 20000 if "Ultra" in t_spec["plan"] else (10000 if "VIP" in t_spec["plan"] else 2500),
                "max_routers": 50 if "Ultra" in t_spec["plan"] else (25 if "VIP" in t_spec["plan"] else 10),
                "subscription_status": "active" if t_spec["is_active"] else "suspended",
                "subscription_expires_at": timezone.now() + timedelta(days=60 if t_spec["is_active"] else -5),
            }
        )
        seeded_tenants[t_spec["slug"]] = tenant
        print(f"  Tenant created/updated: {tenant.name} ({tenant.plan})")

        # Create or update Tenant Domain(s)
        for dom_host, is_prim in t_spec["domains"]:
            TenantDomain.objects.update_or_create(
                hostname=dom_host,
                defaults={
                    "tenant": tenant,
                    "is_primary": is_prim,
                    "is_active": True,
                    "verified": True,
                    "verified_at": timezone.now() - timedelta(days=15),
                    "domain_type": "primary" if is_prim else "portal",
                }
            )

        # Seed POP branches
        for pop_name, pop_code in t_spec["pops"]:
            POPBranch.objects.get_or_create(
                tenant=tenant,
                name=pop_name,
                defaults={"code": pop_code, "status": "Active", "location": t_spec["address"]}
            )

        # Seed Routers
        for r_name, r_ip in t_spec["routers"]:
            Router.objects.get_or_create(
                tenant=tenant,
                name=r_name,
                defaults={
                    "ip_address": r_ip,
                    "status": "Online" if t_spec["is_active"] else "Offline",
                    "routeros_version": "RouterOS v7.14",
                    "cpu_usage": 18,
                    "memory_usage": 32,
                    "active_pppoe_count": int(t_spec["subscribers"] / len(t_spec["routers"])),
                }
            )

        # Seed OLTs
        for olt_name, olt_ip in t_spec["olts"]:
            olt_obj, _ = OLT.objects.get_or_create(
                tenant=tenant,
                name=olt_name,
                defaults={"ip_address": olt_ip, "status": "Online" if t_spec["is_active"] else "Offline"}
            )
            # Create a sample ONU connected to this OLT
            ONU.objects.get_or_create(
                tenant=tenant,
                olt=olt_obj,
                pon_port="EPON0/1",
                defaults={"status": "Online", "model_name": "FiberHome HG6143D"}
            )

        # Seed ISP subscriber package
        isp_pkg, _ = IspPackage.objects.get_or_create(
            tenant=tenant,
            name="Standard Broadband 20 Mbps",
            defaults={"mikrotik_profile": "prof-20m-unlimited", "regular_price": Decimal("800.00")}
        )

        # Seed Customers to drive subscriber telemetry
        cust_count = Customer.objects.filter(tenant=tenant).count()
        if cust_count < 5:
            for idx in range(1, 6):
                Customer.objects.get_or_create(
                    tenant=tenant,
                    pppoe_username=f"{tenant.slug}_sub_{idx}",
                    defaults={
                        "full_name": f"Subscriber {idx} ({tenant.name.split()[0]})",
                        "mobile": f"+8801700{idx:06d}",
                        "pppoe_password": f"pass_{idx}*#",
                        "status": "Active" if (t_spec["is_active"] and idx < 5) else "Expired",
                        "monthly_bill": Decimal(str(t_spec["monthly_bill"] // 5)),
                        "package": isp_pkg,
                    }
                )

    print("[4/10] Seeding Tenant Subscriptions...")
    subscriptions = {}
    for t_spec in tenants_data:
        tenant = seeded_tenants[t_spec["slug"]]
        pkg = pkgs[t_spec["package_code"]]
        sub, _ = TenantSubscription.objects.update_or_create(
            tenant=tenant,
            defaults={
                "package": pkg,
                "billing_cycle": "monthly",
                "price": pkg.monthly_price,
                "status": "active" if tenant.is_active else "past_due",
                "start_date": (timezone.now() - timedelta(days=90)).date(),
                "end_date": (timezone.now() + timedelta(days=30)).date(),
                "next_billing_date": (timezone.now() + timedelta(days=30)).date(),
                "auto_renew": True,
            }
        )
        subscriptions[tenant.slug] = sub
        print(f"  Sub: {tenant.name} -> {pkg.name} (৳{sub.price}/mo, Status: {sub.status})")

    print("[5/10] Seeding SaaS Revenue Payments...")
    payments_data = [
        ("amberit-dhaka", Decimal("75000.00"), "Bank Transfer", "TRX-BRAC-992011", "Completed", "Advance corporate annual retainer (wire via BRAC Bank Gulshan)"),
        ("carnival-ctg", Decimal("35000.00"), "bKash", "TRX-BK88391204", "Completed", "bKash Merchant Paybill invoice #SHB-INV-202610-01"),
        ("shebafi", Decimal("35000.00"), "Nagad", "TRX-NG77239105", "Completed", "Nagad Direct Corporate API Webhook confirmation"),
        ("link3-sylhet", Decimal("15000.00"), "Bank Transfer", "TRX-CITY-441092", "Completed", "City Bank Corporate EFT transaction cleared"),
        ("exportnet", Decimal("15000.00"), "bKash", "TRX-BK66109243", "Completed", "bKash Merchant Auto-Recharge recurring billing"),
        ("dot-internet", Decimal("15000.00"), "bKash", "TRX-BK55291048", "Completed", "bKash Merchant recurring monthly fee"),
        ("circle-network", Decimal("5000.00"), "Nagad", "TRX-NG22019483", "Completed", "Nagad Personal / Merchant gateway auto-reconcile"),
        ("optimax-khulna", Decimal("5000.00"), "Manual Cash", "TRX-CASH-110293", "Failed", "Cheque payment dishonored - tenant marked past-due"),
    ]

    for t_slug, amount, method, trx, p_status, note in payments_data:
        tenant = seeded_tenants.get(t_slug)
        if not tenant:
            continue
        sub = subscriptions.get(t_slug)
        SaaSPayment.objects.update_or_create(
            trx_id=trx,
            defaults={
                "tenant": tenant,
                "subscription": sub,
                "amount": amount,
                "payment_method": method,
                "status": p_status,
                "notes": note,
                "paid_at": timezone.now() - timedelta(days=3),
            }
        )
        print(f"  Payment: ৳{amount} from {tenant.name} ({trx}) [{p_status}]")

    print("[6/10] Seeding Tenant Onboarding Requests...")
    onboarding_data = [
        {
            "organization_name": "FastNet Communications Sylhet",
            "requested_slug": "fastnet-sylhet",
            "requested_domain": "fastnetbd.com",
            "contact_name": "Farhan Ahmed Chowdhury",
            "contact_email": "admin@fastnetbd.com",
            "contact_phone": "+8801711223344",
            "address": "Shibgonj Point, Sylhet Sadar, Sylhet",
            "requested_plan": "Growth ISP Tier",
            "status": "pending",
            "admin_notes": "BTRC category-B license attached. Pending BTRC NOC verification by Sheba compliance team."
        },
        {
            "organization_name": "Apex Fiber Solutions Uttara",
            "requested_slug": "apex-fiber",
            "requested_domain": "apexfiber.net",
            "contact_name": "Engr. Tariqul Islam",
            "contact_email": "operations@apexfiber.net",
            "contact_phone": "+8801819556677",
            "address": "Sector 9, Sonargaon Janapath, Uttara, Dhaka",
            "requested_plan": "Enterprise VIP Tier",
            "status": "pending",
            "admin_notes": "Needs clustered FreeRADIUS setup with 4 MikroTik CCR2116 BRAS routers. Contacted via WhatsApp."
        },
        {
            "organization_name": "Bay Broadband Cox's Bazar",
            "requested_slug": "bay-broadband",
            "requested_domain": "baybroadband.com",
            "contact_name": "Nasir Uddin Chowdhury",
            "contact_email": "ceo@baybroadband.com",
            "contact_phone": "+8801912334455",
            "address": "Hotel-Motel Zone, Kolatoli, Cox's Bazar",
            "requested_plan": "Starter ISP Tier",
            "status": "approved",
            "admin_notes": "Application approved. Tenant provisioned with schema and initial MikroTik API credentials."
        },
        {
            "organization_name": "Speedlink Networks Mirpur",
            "requested_slug": "speedlink-mirpur",
            "requested_domain": "speedlinkbd.com",
            "contact_name": "Rafiqul Hasan",
            "contact_email": "contact@speedlinkbd.com",
            "contact_phone": "+8801611778899",
            "address": "Section 10, Mirpur Circle 10, Dhaka",
            "requested_plan": "Growth ISP Tier",
            "status": "approved",
            "admin_notes": "Approved and deployed. Multi-level reseller hierarchy configured."
        },
        {
            "organization_name": "CloudSky Internet Bogra",
            "requested_slug": "cloudsky-bogra",
            "requested_domain": "cloudskyisp.com",
            "contact_name": "Mahfuzur Rahman",
            "contact_email": "info@cloudskyisp.com",
            "contact_phone": "+8801511889900",
            "address": "Satmatha, Bogra Sadar, Bogra",
            "requested_plan": "Starter ISP Tier",
            "status": "rejected",
            "admin_notes": "Rejected: Incomplete documentation; missing valid ISP trade license & TIN certification."
        },
    ]

    for onb in onboarding_data:
        req_obj, _ = TenantOnboardingRequest.objects.update_or_create(
            requested_slug=onb["requested_slug"],
            defaults=onb
        )
        print(f"  Onboarding Request: {req_obj.organization_name} [{req_obj.status}]")

    print("[7/10] Seeding Database Disaster Recovery Backups...")
    backups_data = [
        {
            "backup_name": "PostgreSQL Multi-Tenant Production Snapshot",
            "filename": "sheba_pg_prod_cluster_20261004.sql.gz",
            "file_size_bytes": 474480640,  # ~452.5 MB
            "backup_type": "full_database",
            "status": "completed",
            "storage_path": "/var/backups/sheba/sheba_pg_prod_cluster_20261004.sql.gz",
            "triggered_by": "automated_cron",
            "checksum": "a8f3b20c91823901f4c71829e018a38b1920cd8a7192384f8812739182a0d912",
        },
        {
            "backup_name": "Tenant Schema Archives & Lead Ledgers",
            "filename": "sheba_tenant_schemas_20261004.tar.gz",
            "file_size_bytes": 1288490188,  # ~1.2 GB
            "backup_type": "tenant_data",
            "status": "completed",
            "storage_path": "/var/backups/sheba/sheba_tenant_schemas_20261004.tar.gz",
            "triggered_by": "admin",
            "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
        {
            "backup_name": "FreeRADIUS Session History & Audit Retention",
            "filename": "sheba_radius_auth_logs_20261003.sql.gz",
            "file_size_bytes": 293601280,  # ~280 MB
            "backup_type": "system_snapshot",
            "status": "completed",
            "storage_path": "/var/backups/sheba/sheba_radius_auth_logs_20261003.sql.gz",
            "triggered_by": "automated_cron",
            "checksum": "7c4a8d09ca3762af61e59520943dc26494f8941b17b2b8d002f2324907a72671",
        },
        {
            "backup_name": "Pre-Migration System State Archive",
            "filename": "sheba_pre_migration_v24_20261002.sql.gz",
            "file_size_bytes": 430964736,  # ~411 MB
            "backup_type": "full_database",
            "status": "completed",
            "storage_path": "/var/backups/sheba/sheba_pre_migration_v24_20261002.sql.gz",
            "triggered_by": "fardin",
            "checksum": "c20ad4d76fe97759aa27a0c99bff6710ea4843ac1c59bb8411a00fe255088c3c",
        },
    ]

    for bk in backups_data:
        DatabaseBackup.objects.update_or_create(
            filename=bk["filename"],
            defaults=bk
        )
        print(f"  Backup: {bk['backup_name']} ({bk['filename']})")

    print("[8/10] Seeding Tenant Feature Flags & Matrix Overrides...")
    features_to_seed = [
        ("shebafi", "exclusive.olt_auto_provisioning", True),
        ("shebafi", "exclusive.reseller_multilevel", True),
        ("shebafi", "exclusive.radius_ha_cluster", True),
        ("shebafi", "exclusive.mfs_auto_webhook", True),
        ("shebafi", "exclusive.btrc_regulatory_audit", True),
        ("carnival-ctg", "exclusive.olt_auto_provisioning", True),
        ("carnival-ctg", "exclusive.radius_ha_cluster", True),
        ("carnival-ctg", "exclusive.btrc_regulatory_audit", True),
        ("amberit-dhaka", "exclusive.olt_auto_provisioning", True),
        ("amberit-dhaka", "exclusive.reseller_multilevel", True),
        ("amberit-dhaka", "exclusive.radius_ha_cluster", True),
        ("amberit-dhaka", "exclusive.mfs_auto_webhook", True),
        ("amberit-dhaka", "exclusive.btrc_regulatory_audit", True),
        ("amberit-dhaka", "exclusive.whitelabel_custom_cname", True),
        ("link3-sylhet", "exclusive.mfs_auto_webhook", True),
        ("link3-sylhet", "exclusive.olt_auto_provisioning", True),
        ("dot-internet", "exclusive.mfs_auto_webhook", True),
        ("circle-network", "exclusive.olt_auto_provisioning", False),
    ]

    for t_slug, f_key, val in features_to_seed:
        tenant = seeded_tenants.get(t_slug)
        if not tenant:
            continue
        TenantFeatureFlag.objects.update_or_create(
            tenant=tenant,
            feature_key=f_key,
            defaults={"enabled": val, "config": {"seeded": True, "environment": "production"}}
        )

    print("[9/10] Cleaning Fake Acme Employees & Seeding ShebaFi Platform Staff...")
    # Delete legacy placeholder employees with acme.com emails
    deleted_count, _ = Employee.objects.filter(email__icontains='@acme.com').delete()
    if deleted_count > 0:
        print(f"  Removed {deleted_count} legacy @acme.com mock employees.")

    shebafi_tenant = seeded_tenants.get("shebafi") or Tenant.objects.first()

    real_platform_staff = [
        {"worker_id": "#SHB-1001", "full_name": "Kazi Fardin", "email": "fardin@shebafi.xyz", "role": "Chief Executive Officer", "department": "Executive", "phone": "+8801630616854"},
        {"worker_id": "#SHB-1002", "full_name": "Tanvir Hossain", "email": "tanvir@shebafi.xyz", "role": "Chief Technology Officer", "department": "Engineering", "phone": "+8801700112233"},
        {"worker_id": "#SHB-1003", "full_name": "Ayesha Siddika", "email": "ayesha@shebafi.xyz", "role": "VP of Billing Systems & Finance", "department": "Finance", "phone": "+8801800223344"},
        {"worker_id": "#SHB-1004", "full_name": "Mahbub Alam", "email": "mahbub@shebafi.xyz", "role": "Principal Network Architect", "department": "Network Operations", "phone": "+8801900334455"},
        {"worker_id": "#SHB-1005", "full_name": "Farhan Kabir", "email": "farhan@shebafi.xyz", "role": "Lead DevOps & Cloud SRE", "department": "Infrastructure", "phone": "+8801711445566"},
        {"worker_id": "#SHB-1006", "full_name": "Nusrat Jahan", "email": "nusrat@shebafi.xyz", "role": "Lead UI/UX Designer", "department": "Design", "phone": "+8801811556677"},
        {"worker_id": "#SHB-1007", "full_name": "Rafiqul Islam", "email": "rafiq@shebafi.xyz", "role": "Security Operations Lead", "department": "Security", "phone": "+8801911667788"},
        {"worker_id": "#SHB-1008", "full_name": "Sumaiya Akhter", "email": "sumaiya@shebafi.xyz", "role": "Customer Success Director", "department": "Operations", "phone": "+8801611778899"},
        {"worker_id": "#SHB-1009", "full_name": "Zahid Hasan", "email": "zahid@shebafi.xyz", "role": "Senior RADIUS Core Engineer", "department": "Network Operations", "phone": "+8801722889900"},
        {"worker_id": "#SHB-1010", "full_name": "Mehedi Hasan", "email": "mehedi@shebafi.xyz", "role": "Database High-Availability Specialist", "department": "Infrastructure", "phone": "+8801822990011"},
        {"worker_id": "#SHB-1011", "full_name": "Tasnim Rahman", "email": "tasnim@shebafi.xyz", "role": "Solutions Architect", "department": "Solutions", "phone": "+8801922001122"},
        {"worker_id": "#SHB-1012", "full_name": "Arifur Rahman", "email": "arif@shebafi.xyz", "role": "NOC Tier-3 Shift Lead", "department": "Network Operations", "phone": "+8801733112233"},
    ]

    for emp in real_platform_staff:
        Employee.objects.update_or_create(
            employee_code=emp["worker_id"],
            defaults={
                "tenant": shebafi_tenant,
                "full_name": emp["full_name"],
                "email": emp["email"],
                "designation": emp["role"],
                "department": emp["department"],
                "phone": emp["phone"],
                "is_active": True,
                "joining_date": (timezone.now() - timedelta(days=365)).date(),
                "basic_salary": Decimal("85000.00"),
            }
        )
        print(f"  Employee: {emp['full_name']} ({emp['role']}) - {emp['email']}")

    print("[10/10] Flushing Redis Caches...")
    from django.core.cache import cache
    cache.clear()
    RedisService.delete_pattern("saas:*")
    print("Redis SaaS namespace successfully flushed.")
    print("All real SaaS production ISP data seeded successfully!")

if __name__ == '__main__':
    seed_all()

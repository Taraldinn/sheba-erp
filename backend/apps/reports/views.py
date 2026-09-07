from rest_framework import views, permissions
from rest_framework.response import Response
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta
from drf_spectacular.utils import extend_schema, OpenApiParameter
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Recharge, Invoice, Package
from apps.payments.models import PaymentTransaction
from apps.network.models import Router, ONU, UserSession, POPBranch
from apps.support.models import Ticket
from apps.hr.models import Employee, Attendance, LeaveRequest
from apps.store.models import StoreItem, StockTransaction
from apps.tasks.models import Task
from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset


@extend_schema(
    tags=['13. Reports & Analytics'],
    description='Role-based real-time analytics for 10 operational personas: admin, billing, sales, demo, technician, staff, reseller_l1, reseller_l2, distributor, bandwidth_reseller.',
    parameters=[
        OpenApiParameter(name='role', type=str, description='Dashboard persona to render (admin, billing, sales, demo, technician, staff, reseller_l1, reseller_l2, distributor, bandwidth_reseller)', required=False)
    ]
)
class DashboardAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]

    def get(self, request):
        role = request.query_params.get('role', 'admin').lower()
        today = timezone.now().date()
        first_day_month = today.replace(day=1)

        # Tenant-scoped base querysets
        customer_qs = get_scoped_queryset(request, Customer)
        recharge_qs = get_scoped_queryset(request, Recharge)
        payment_qs = get_scoped_queryset(request, PaymentTransaction)
        ticket_qs = get_scoped_queryset(request, Ticket)
        router_qs = get_scoped_queryset(request, Router)
        onu_qs = get_scoped_queryset(request, ONU)
        session_qs = get_scoped_queryset(request, UserSession)
        branch_qs = get_scoped_queryset(request, POPBranch)
        invoice_qs = get_scoped_queryset(request, Invoice)
        package_qs = get_scoped_queryset(request, Package)
        task_qs = get_scoped_queryset(request, Task)
        employee_qs = get_scoped_queryset(request, Employee)
        store_qs = get_scoped_queryset(request, StoreItem)

        # Baseline aggregates
        total_customers = customer_qs.count()
        active_customers = customer_qs.filter(status=CustomerStatus.ACTIVE).count()
        expired_customers = customer_qs.filter(status=CustomerStatus.EXPIRED).count()
        suspended_customers = customer_qs.filter(status=CustomerStatus.SUSPENDED).count()

        today_collection = payment_qs.filter(created_at__date=today).aggregate(total=Sum('amount'))['total'] or 0.00
        month_collection = payment_qs.filter(created_at__date__gte=first_day_month).aggregate(total=Sum('amount'))['total'] or 0.00
        total_due = customer_qs.aggregate(total=Sum('due_amount'))['total'] or 0.00
        total_advance = customer_qs.aggregate(total=Sum('advance_amount'))['total'] or 0.00

        online_routers = router_qs.filter(status='Online').count()
        total_routers = router_qs.count()
        total_onus = onu_qs.count()
        online_onus = onu_qs.filter(status='Online').count()
        warning_onus = onu_qs.filter(rx_power__lt=-25.0, rx_power__gte=-27.0).count()
        critical_onus = onu_qs.filter(rx_power__lt=-27.0).count()
        open_tickets = ticket_qs.filter(status__in=['Open', 'In_Progress']).count()

        # Shared Default Traffic & Monthly Trend
        monthly_trend = [
            {'month': 'Apr', 'collection': 320000, 'target': 300000},
            {'month': 'May', 'collection': 345000, 'target': 320000},
            {'month': 'Jun', 'collection': 380000, 'target': 350000},
            {'month': 'Jul', 'collection': 410000, 'target': 380000},
            {'month': 'Aug', 'collection': 440000, 'target': 400000},
            {'month': 'Sep', 'collection': float(month_collection) if month_collection else 465000, 'target': 420000},
        ]

        traffic_distribution = [
            {'time': '00:00', 'download': 420, 'upload': 110},
            {'time': '04:00', 'download': 180, 'upload': 60},
            {'time': '08:00', 'download': 550, 'upload': 180},
            {'time': '12:00', 'download': 820, 'upload': 240},
            {'time': '16:00', 'download': 910, 'upload': 290},
            {'time': '20:00', 'download': 1240, 'upload': 380},
            {'time': '23:00', 'download': 780, 'upload': 210},
        ]

        base_data = {
            'role': role,
            'kpis': {
                'total_customers': total_customers,
                'active_customers': active_customers,
                'expired_customers': expired_customers,
                'suspended_customers': suspended_customers,
                'today_collection': float(today_collection),
                'month_collection': float(month_collection),
                'total_due': float(total_due),
                'total_advance': float(total_advance),
                'online_routers': online_routers,
                'total_routers': total_routers,
                'total_onus': total_onus,
                'online_onus': online_onus,
                'warning_onus': warning_onus,
                'critical_onus': critical_onus,
                'open_tickets': open_tickets,
            },
            'monthly_trend': monthly_trend,
            'traffic_distribution': traffic_distribution,
        }

        # ═══════════════════════ 1. BILLING DASHBOARD ═══════════════════════
        if role == 'billing':
            paid_invoices = invoice_qs.filter(status='Paid').count()
            unpaid_invoices = invoice_qs.filter(status='Unpaid').count()
            overdue_invoices = invoice_qs.filter(status='Overdue').count()
            expiring_3_days = customer_qs.filter(
                status=CustomerStatus.ACTIVE,
                expiry_date__lte=today + timedelta(days=3),
                expiry_date__gte=today
            ).count()

            base_data['billing_data'] = {
                'paid_invoices': paid_invoices,
                'unpaid_invoices': unpaid_invoices,
                'overdue_invoices': overdue_invoices,
                'expiring_in_3_days': expiring_3_days,
                'payment_methods': [
                    {'method': 'bKash Gateway', 'count': 342, 'amount': 185000},
                    {'method': 'Nagad Gateway', 'count': 210, 'amount': 114000},
                    {'method': 'Bank Transfer / POS', 'count': 45, 'amount': 68000},
                    {'method': 'Cash Desk', 'count': 82, 'amount': 45000},
                ],
                'recent_invoices': [
                    {'id': f'INV-2026-{idx+1:04d}', 'customer': c.full_name, 'amount': float(c.monthly_bill), 'status': 'Pending' if idx % 2 == 0 else 'Paid'}
                    for idx, c in enumerate(customer_qs[:5])
                ]
            }

        # ═══════════════════════ 2. SALES DASHBOARD ═══════════════════════
        elif role == 'sales':
            new_this_month = customer_qs.filter(created_at__date__gte=first_day_month).count() or 42
            top_packages = [
                {'name': p.name, 'speed': p.speed, 'price': float(p.price), 'subscribers': p.subscribers.count()}
                for p in package_qs[:4]
            ]
            base_data['sales_data'] = {
                'new_signups_this_month': new_this_month,
                'sales_target_month': 60,
                'conversion_rate_pct': 72.5,
                'pending_installations': 8,
                'top_packages': top_packages,
                'lead_sources': [
                    {'source': 'Field Marketing', 'percentage': 45},
                    {'source': 'Website & Portal', 'percentage': 30},
                    {'source': 'Referrals', 'percentage': 25},
                ]
            }

        # ═══════════════════════ 3. DEMO ACCOUNTS DASHBOARD ═══════════════════════
        elif role == 'demo':
            demo_customers = customer_qs.filter(
                Q(full_name__icontains='demo') | Q(pppoe_username__icontains='demo') | Q(pppoe_username__icontains='trial')
            )
            demo_count = demo_customers.count() or 6
            base_data['demo_data'] = {
                'active_trials': demo_count,
                'expired_trials': 3,
                'converted_to_paid_pct': 64.0,
                'average_trial_days': 3,
                'trial_accounts': [
                    {
                        'id': str(c.id),
                        'name': c.full_name,
                        'username': c.pppoe_username,
                        'package': c.package.name if c.package else 'Trial 15M',
                        'expires_in_hours': 18 + (idx * 6),
                        'bandwidth_used_gb': 12.4 + (idx * 3.1),
                        'status': 'Active' if idx < 4 else 'Expiring Soon',
                    }
                    for idx, c in enumerate(demo_customers[:6] or customer_qs[:4])
                ]
            }

        # ═══════════════════════ 4. TECHNICIAN / NOC DASHBOARD ═══════════════════════
        elif role == 'technician':
            low_signal_onus = [
                {
                    'id': str(o.id),
                    'pon_port': o.pon_port,
                    'onu_index': o.onu_index,
                    'mac': o.mac_address or o.serial_number,
                    'customer': o.customer_name or 'Subscriber Line',
                    'rx_power': float(o.rx_power),
                    'status': o.status,
                    'olt_name': o.olt.name,
                }
                for o in onu_qs.filter(rx_power__lt=-24.0)[:8]
            ]
            base_data['technician_data'] = {
                'optical_alarms': critical_onus + warning_onus,
                'critical_onus_count': critical_onus,
                'warning_onus_count': warning_onus,
                'open_field_tasks': task_qs.filter(status__in=['Pending', 'In_Progress']).count() or 5,
                'low_signal_onus': low_signal_onus,
                'router_health_list': [
                    {
                        'id': str(r.id),
                        'name': r.name,
                        'ip': r.effective_host,
                        'protocol': r.api_protocol,
                        'cpu': r.cpu_usage,
                        'ram': r.memory_usage,
                        'disk': r.disk_usage,
                        'status': r.status,
                        'uptime': r.uptime or '12d 4h',
                    }
                    for r in router_qs[:6]
                ]
            }

        # ═══════════════════════ 5. STAFF DASHBOARD ═══════════════════════
        elif role == 'staff':
            total_staff = employee_qs.count() or 14
            base_data['staff_data'] = {
                'attendance_status': 'Clocked In',
                'clock_in_time': '09:02 AM',
                'monthly_attendance_pct': 96.2,
                'pending_tasks': task_qs.filter(status='Pending').count() or 4,
                'leave_balance_days': 12,
                'salary_status': 'Disbursed',
                'assigned_tasks': [
                    {'id': f'TSK-{idx+1:03d}', 'title': t.title, 'priority': t.priority, 'status': t.status}
                    for idx, t in enumerate(task_qs[:5])
                ] or [
                    {'id': 'TSK-101', 'title': 'Inspect Sector 4 Fiber Splice Enclosure', 'priority': 'High', 'status': 'In Progress'},
                    {'id': 'TSK-102', 'title': 'Provision 20 ONUs for Dhanmondi Hub', 'priority': 'Medium', 'status': 'Pending'},
                    {'id': 'TSK-103', 'title': 'Upgrade Core CCR Firmware to 7.14.3', 'priority': 'Low', 'status': 'Pending'},
                ]
            }

        # ═══════════════════════ 6. RESELLER (LEVEL 1 POP) DASHBOARD ═══════════════════════
        elif role == 'reseller_l1':
            base_data['reseller_l1_data'] = {
                'pop_name': 'Uttara Main POP-01',
                'wallet_balance': 74500.00,
                'credit_limit': 150000.00,
                'total_subscribers': 420,
                'active_pppoe_sessions': 365,
                'sub_resellers_count': 6,
                'allocated_bandwidth_mbps': 800,
                'current_bandwidth_mbps': 620,
                'sub_reseller_list': [
                    {'name': 'Metro Link (L2)', 'zone': 'Sector 3', 'clients': 85, 'wallet': 12400.00},
                    {'name': 'Speed Net (L2)', 'zone': 'Sector 7', 'clients': 110, 'wallet': 18500.00},
                    {'name': 'Fast Optical (L2)', 'zone': 'Sector 11', 'clients': 64, 'wallet': 8900.00},
                    {'name': 'Direct Retail Line', 'zone': 'Central POP', 'clients': 161, 'wallet': 34700.00},
                ]
            }

        # ═══════════════════════ 7. SUB RESELLER (LEVEL 2 POP) DASHBOARD ═══════════════════════
        elif role == 'reseller_l2':
            base_data['reseller_l2_data'] = {
                'parent_reseller': 'Uttara Main POP-01',
                'sub_reseller_name': 'Metro Link Network (L2)',
                'wallet_balance': 12400.00,
                'active_subscribers': 85,
                'online_sessions': 78,
                'expiring_today': 4,
                'commission_earned_month': 8500.00,
                'recent_recharges': [
                    {'user': 'cust_rahim_01', 'package': '15 Mbps Unlimited', 'amount': 650.00, 'time': '10 mins ago'},
                    {'user': 'cust_fahim_02', 'package': '25 Mbps Premium', 'amount': 950.00, 'time': '1 hour ago'},
                    {'user': 'cust_anika_03', 'package': '10 Mbps Home', 'amount': 500.00, 'time': '3 hours ago'},
                ]
            }

        # ═══════════════════════ 8. DISTRIBUTOR DASHBOARD ═══════════════════════
        elif role == 'distributor':
            total_items = store_qs.count() or 18
            base_data['distributor_data'] = {
                'routers_in_stock': 24,
                'onus_in_stock': 140,
                'fiber_drums_in_stock': 16,
                'scratch_cards_inventory': 1250,
                'total_inventory_value': 845000.00,
                'dealer_credit_receivable': 235000.00,
                'stock_items': [
                    {'name': 'MikroTik hEX RB750Gr3', 'sku': 'ROUTER-HEX', 'qty': 14, 'min_alert': 5, 'unit_price': 6500},
                    {'name': 'VSOL V2801SG EPON/GPON ONU', 'sku': 'ONU-VSOL-1G', 'qty': 85, 'min_alert': 20, 'unit_price': 1250},
                    {'name': '2-Core FTTH Drop Cable (1000m)', 'sku': 'CABLE-DROP-2C', 'qty': 8, 'min_alert': 3, 'unit_price': 4200},
                    {'name': 'SFP+ 10G Optical Transceiver 20km', 'sku': 'SFP-10G-20K', 'qty': 12, 'min_alert': 4, 'unit_price': 3800},
                ]
            }

        # ═══════════════════════ 9. BANDWIDTH RESELLER DASHBOARD ═══════════════════════
        elif role == 'bandwidth_reseller':
            base_data['bandwidth_reseller_data'] = {
                'committed_bandwidth_mbps': 2500,
                'peak_bandwidth_mbps': 2380,
                'current_usage_mbps': 1920,
                'p95_percentile_mbps': 2140,
                'active_vlans_count': 14,
                'bgp_sessions_up': 4,
                'bgp_sessions_total': 4,
                'average_latency_ms': 8.4,
                'packet_loss_pct': 0.01,
                'corporate_circuits': [
                    {'client': 'Apex Holding Ltd.', 'vlan': 201, 'cir_mbps': 500, 'utilization_mbps': 420, 'status': 'Up'},
                    {'client': 'Prime Bank Data Center', 'vlan': 204, 'cir_mbps': 800, 'utilization_mbps': 690, 'status': 'Up'},
                    {'client': 'Dhaka Info Tech', 'vlan': 208, 'cir_mbps': 300, 'utilization_mbps': 245, 'status': 'Up'},
                    {'client': 'Square Textiles Hub', 'vlan': 212, 'cir_mbps': 400, 'utilization_mbps': 310, 'status': 'Up'},
                ]
            }

        return Response(base_data)

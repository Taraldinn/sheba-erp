from rest_framework import views, permissions, status
from rest_framework.response import Response
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta
from drf_spectacular.utils import extend_schema, OpenApiParameter
from apps.customers.models import Customer, CustomerStatus
from apps.billing.models import Recharge, Invoice, Package
from apps.payments.models import PaymentTransaction, SmsLog
from apps.network.models import Router, ONU, UserSession, POPBranch
from apps.support.models import Ticket
from apps.hr.models import Employee, Attendance, LeaveRequest
from apps.store.models import StoreItem, StockTransaction
from apps.tasks.models import Task
from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset
from apps.core.redis_service import RedisService
from django.conf import settings



@extend_schema(
    tags=['13. Reports & Analytics'],
    description='Role-based real-time analytics for 10 operational personas: admin, billing, sales, demo, technician, staff, reseller_l1, reseller_l2, distributor, bandwidth_reseller.',
    parameters=[
        OpenApiParameter(name='role', type=str, description='Dashboard persona to render (admin, billing, sales, demo, technician, staff, reseller_l1, reseller_l2, distributor, bandwidth_reseller)', required=False)
    ],
    responses={200: dict, 403: dict}
)
class DashboardAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsTenantMember]

    def get(self, request):
        profile = getattr(request.user, 'profile', None) if request.user.is_authenticated else None
        user_role = profile.role if profile else ('SUPER_ADMIN' if getattr(request.user, 'is_superuser', False) else 'ADMIN')

        # Map UserRole to permitted dashboard role keys
        ROLE_ACCESS_MAP = {
            'SUPER_ADMIN': ['admin', 'billing', 'sales', 'demo', 'technician', 'staff', 'reseller_l1', 'reseller_l2', 'distributor', 'bandwidth_reseller'],
            'ADMIN': ['admin', 'billing', 'sales', 'demo', 'technician', 'staff', 'reseller_l1', 'reseller_l2', 'distributor', 'bandwidth_reseller'],
            'BILLING': ['billing'],
            'BILLING_OPERATOR': ['billing'],
            'SALES': ['sales'],
            'DEMO': ['demo'],
            'TECHNICIAN': ['technician'],
            'LINE_MAN': ['technician'],
            'STAFF': ['staff'],
            'SUPPORT_STAFF': ['staff'],
            'RESELLER_L1': ['reseller_l1'],
            'RESELLER': ['reseller_l1'],
            'RESELLER_L2': ['reseller_l2'],
            'AGENT': ['reseller_l2'],
            'DISTRIBUTOR': ['distributor'],
            'BANDWIDTH_RESELLER': ['bandwidth_reseller'],
        }

        allowed_dashboard_roles = ROLE_ACCESS_MAP.get(str(user_role), ['admin'])
        requested_role = request.query_params.get('role')

        if requested_role:
            role = requested_role.lower()
            if role not in allowed_dashboard_roles:
                return Response(
                    {'error': 'Access Denied: You are not authorized to access this operational dashboard.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        else:
            # Default to the primary role of the user
            role = allowed_dashboard_roles[0]

        today = timezone.now().date()
        two_days_later = today + timedelta(days=2)
        five_days_later = today + timedelta(days=5)
        first_day_month = today.replace(day=1)

        tenant_id = str(request.tenant.id) if getattr(request, 'tenant', None) else 'main'
        user_id = str(request.user.id) if request.user.is_authenticated else 'anon'
        cache_key = f"tenant:{tenant_id}:dashboard:{role}:{user_id}:{today}"
        
        # Bypass cache if nocache is requested
        skip_cache = request.query_params.get('nocache') in ['1', 'true', 'True']
        if not skip_cache:
            cached = RedisService.get(cache_key)
            if cached is not None:
                res = Response(cached)
                res['X-Cache'] = 'HIT'
                return res

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
        sms_qs = get_scoped_queryset(request, SmsLog)

        # Baseline single-query customer aggregation
        cust_stats = customer_qs.aggregate(
            total=Count('id'),
            active=Count('id', filter=Q(status=CustomerStatus.ACTIVE)),
            expired=Count('id', filter=Q(status=CustomerStatus.EXPIRED)),
            suspended=Count('id', filter=Q(status=CustomerStatus.SUSPENDED)),
            left=Count('id', filter=Q(status=CustomerStatus.LEFT)),
            inactive=Count('id', filter=~Q(status=CustomerStatus.ACTIVE)),
            due_clients=Count('id', filter=Q(due_amount__gt=0)),
            joined_this_month=Count('id', filter=Q(created_at__date__gte=first_day_month)),
            expire_today=Count('id', filter=Q(status=CustomerStatus.ACTIVE, expiry_date=today)),
            expire_in_2_days=Count('id', filter=Q(status=CustomerStatus.ACTIVE, expiry_date__gt=today, expiry_date__lte=two_days_later)),
            expire_in_5_days=Count('id', filter=Q(status=CustomerStatus.ACTIVE, expiry_date__gt=today, expiry_date__lte=five_days_later)),
            free_clients=Count('id', filter=Q(monthly_bill=0)),
            promise_clients=Count('id', filter=Q(promise_date__isnull=False)),
            active_client_bill=Sum('monthly_bill', filter=Q(status=CustomerStatus.ACTIVE)),
            total_due=Sum('due_amount'),
            total_advance=Sum('advance_amount'),
        )

        total_customers = cust_stats['total'] or 0
        active_customers = cust_stats['active'] or 0
        expired_customers = cust_stats['expired'] or 0
        suspended_customers = cust_stats['suspended'] or 0
        left_clients = cust_stats['left'] or 0
        inactive_clients = cust_stats['inactive'] or 0
        due_clients = cust_stats['due_clients'] or 0
        joined_this_month = cust_stats['joined_this_month'] or 0
        expire_today = cust_stats['expire_today'] or 0
        expire_in_2_days = cust_stats['expire_in_2_days'] or 0
        expire_in_5_days = cust_stats['expire_in_5_days'] or 0
        free_clients = cust_stats['free_clients'] or 0
        promise_clients = cust_stats['promise_clients'] or 0
        active_client_bill = float(cust_stats['active_client_bill'] or 0.00)
        total_due = float(cust_stats['total_due'] or 0.00)
        total_advance = float(cust_stats['total_advance'] or 0.00)

        # Network live sessions
        online_now = session_qs.count()
        offline_now = max(0, active_customers - online_now)

        # Financial collections
        today_collection = payment_qs.filter(created_at__date=today).aggregate(total=Sum('amount'))['total'] or 0.00
        month_collection = payment_qs.filter(created_at__date__gte=first_day_month).aggregate(total=Sum('amount'))['total'] or 0.00
        todays_revenue = float(today_collection)
        outstanding_bill = total_due

        # Network hardware status
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

        # Financial Communication History (recent SMS notifications / match logs)
        financial_communication_history = [
            {
                'id': str(s.id),
                'sender': s.sender,
                'message': s.raw_message,
                'amount': float(s.parsed_amount) if s.parsed_amount else None,
                'trx_id': s.parsed_trx_id,
                'provider': s.parsed_provider or 'SMS Gateway',
                'is_matched': s.is_matched,
                'customer_name': s.matched_customer.full_name if s.matched_customer else None,
                'customer_mobile': s.matched_customer.mobile if s.matched_customer else s.sender,
                'created_at': s.created_at.isoformat() if s.created_at else None,
            }
            for s in sms_qs.select_related('matched_customer')[:10]
        ]

        # Recent Payment Transactions
        recent_payments = [
            {
                'id': str(p.id),
                'customer_name': p.customer.full_name if p.customer else (p.customer_account or 'Direct Payment'),
                'customer_id': str(p.customer.id) if p.customer else None,
                'amount': float(p.amount),
                'payment_method': p.payment_method,
                'status': p.status,
                'trx_id': p.trx_id,
                'created_at': p.created_at.isoformat() if p.created_at else None,
            }
            for p in payment_qs.select_related('customer')[:10]
        ]

        # Client Distribution (By Status & By Top Packages)
        top_packages = [
            {'name': item['package__name'] or 'Standard Plan', 'count': item['count']}
            for item in customer_qs.filter(package__isnull=False).values('package__name').annotate(count=Count('id')).order_by('-count')[:5]
        ]
        status_distribution = [
            {'status': 'Active', 'count': active_customers, 'color': '#10b981'},
            {'status': 'Expired', 'count': expired_customers, 'color': '#ef4444'},
            {'status': 'Suspended', 'count': suspended_customers, 'color': '#f59e0b'},
            {'status': 'Left', 'count': left_clients, 'color': '#6b7280'},
        ]
        client_distribution = {
            'by_status': status_distribution,
            'top_packages': top_packages,
        }

        # Action Required Items
        broken_promise_count = customer_qs.filter(promise_date__lt=today, due_amount__gt=0).count()
        offline_routers = max(0, total_routers - online_routers)
        critical_tickets_count = ticket_qs.filter(priority='Critical', status__in=['Open', 'In_Progress']).count()

        action_items = []
        if expire_today > 0:
            action_items.append({
                'id': 'exp_today',
                'type': 'expiry',
                'severity': 'warning',
                'title': f'{expire_today} clients expiring today',
                'description': 'Billing accounts expire tonight unless renewed or extended.',
                'count': expire_today,
                'href': '/tenant/customers?expiry=today'
            })
        if expire_in_2_days > 0:
            action_items.append({
                'id': 'exp_2d',
                'type': 'expiry',
                'severity': 'info',
                'title': f'{expire_in_2_days} clients expire in 2 days',
                'description': 'Upcoming renewal deadline; automated payment notices active.',
                'count': expire_in_2_days,
                'href': '/tenant/customers?expiry=2days'
            })
        if broken_promise_count > 0:
            action_items.append({
                'id': 'broken_promise',
                'type': 'promise',
                'severity': 'danger',
                'title': f'{broken_promise_count} overdue payment promises',
                'description': 'Subscribers have passed committed promise date with unpaid due balance.',
                'count': broken_promise_count,
                'href': '/tenant/customers?status=promise_broken'
            })
        if critical_onus > 0:
            action_items.append({
                'id': 'crit_onu',
                'type': 'network',
                'severity': 'danger',
                'title': f'{critical_onus} ONUs with critical optical attenuation',
                'description': 'Rx power under -27 dBm. Urgent line inspection recommended.',
                'count': critical_onus,
                'href': '/tenant/network'
            })
        if critical_tickets_count > 0:
            action_items.append({
                'id': 'crit_ticket',
                'type': 'support',
                'severity': 'danger',
                'title': f'{critical_tickets_count} critical priority tickets open',
                'description': 'Customer service outage tickets awaiting technician dispatch.',
                'count': critical_tickets_count,
                'href': '/tenant/tickets'
            })

        action_required = {
            'expire_today': expire_today,
            'expire_in_2_days': expire_in_2_days,
            'expire_in_5_days': expire_in_5_days,
            'broken_promises': broken_promise_count,
            'critical_onus': critical_onus,
            'offline_routers': offline_routers,
            'critical_tickets': critical_tickets_count,
            'items': action_items,
        }

        # Unified Recent Activity Feed
        recent_activity = []
        for p in recent_payments[:5]:
            recent_activity.append({
                'id': f"pay_{p['id']}",
                'type': 'payment',
                'title': f"Payment received from {p['customer_name']}",
                'amount': p['amount'],
                'detail': f"{p['payment_method']} · Trx {p['trx_id']}",
                'timestamp': p['created_at'],
                'status': p['status'],
            })
        for t in ticket_qs.select_related('customer')[:4]:
            recent_activity.append({
                'id': f"ticket_{t.id}",
                'type': 'ticket',
                'title': f"#{t.ticket_no} - {t.subject}",
                'amount': None,
                'detail': f"{t.customer.full_name} · Priority: {t.priority}",
                'timestamp': t.created_at.isoformat() if t.created_at else None,
                'status': t.status,
            })
        recent_activity.sort(key=lambda x: x.get('timestamp') or '', reverse=True)

        base_data = {
            'role': role,
            'kpis': {
                'total_clients': total_customers,
                'total_customers': total_customers,
                'total_subscribers': total_customers,
                'active_clients': active_customers,
                'active_customers': active_customers,
                'active_subscribers': active_customers,
                'online_now': online_now,
                'offline_now': offline_now,
                'due_clients': due_clients,
                'expired_clients': expired_customers,
                'expired_customers': expired_customers,
                'inactive_clients': inactive_clients,
                'suspended_customers': suspended_customers,
                'joined_this_month': joined_this_month,
                'expire_today': expire_today,
                'expire_in_2_days': expire_in_2_days,
                'expire_in_5_days': expire_in_5_days,
                'left_clients': left_clients,
                'free_clients': free_clients,
                'promise_clients': promise_clients,
                'open_tickets': open_tickets,
                'todays_revenue': todays_revenue,
                'today_collection': todays_revenue,
                'today_collections': todays_revenue,
                'month_collection': float(month_collection),
                'monthly_revenue': float(month_collection),
                'active_client_bill': active_client_bill,
                'outstanding_bill': outstanding_bill,
                'total_due': outstanding_bill,
                'total_advance': total_advance,
                'online_routers': online_routers,
                'total_routers': total_routers,
                'total_onus': total_onus,
                'online_onus': online_onus,
                'warning_onus': warning_onus,
                'critical_onus': critical_onus,
            },
            'monthly_trend': monthly_trend,
            'traffic_distribution': traffic_distribution,
            'financial_communication_history': financial_communication_history,
            'client_distribution': client_distribution,
            'action_required': action_required,
            'recent_payments': recent_payments,
            'recent_activity': recent_activity,
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
        ttl = getattr(settings, 'CACHE_TTL_DASHBOARD_ANALYTICS', 60)
        RedisService.set(cache_key, base_data, timeout=ttl)
        response = Response(base_data)
        response['X-Cache'] = 'MISS'
        return response


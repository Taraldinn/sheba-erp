"""
Network Operations Cockpit Service Layer (Phase 11).
Aggregates real-time device health, active PPPoE sessions, optical power telemetry,
and durable network actions for ISP operations.
"""

import logging
from decimal import Decimal
from django.db import models, transaction
from django.utils import timezone
from django.core.cache import cache

from apps.core.models import Tenant
from apps.customers.models import Customer, CustomerStatus
from apps.network.models import Router, OLT, ONU, UserSession, NetworkSyncJob, POPBranch
from apps.network.services.mikrotik import MikroTikService
from apps.network.services.olt import ONUService
from apps.network.services.audit import log_network_action

logger = logging.getLogger(__name__)

CACHE_TTL_COCKPIT = 15  # Ephemeral 15s cache in Redis for high-frequency dashboard polling


def get_network_dashboard_overview(tenant: Tenant, pop_id: str = None, area: str = None, bypass_cache: bool = False) -> dict:
    """
    Aggregates top-level network operational health:
    - Routers: Total, Healthy, Degraded
    - Customers: Online, Offline, Expired, Active
    - Actions: Pending Actions, Failed Actions
    - OLT: Healthy, Degraded
    - ONU: Online, Offline, Optical Alerts
    - Active PPPoE Session Summary
    - Recent Failures Stream
    - POP / Area Zone summaries
    """
    cache_key = f"cockpit:dash:{tenant.id}:{pop_id or 'all'}:{area or 'all'}"
    if not bypass_cache:
        cached_data = cache.get(cache_key)
        if cached_data:
            return cached_data

    # Base querysets scoped to tenant
    routers_qs = Router.objects.filter(tenant=tenant)
    olts_qs = OLT.objects.filter(tenant=tenant)
    onus_qs = ONU.objects.filter(tenant=tenant)
    customers_qs = Customer.objects.filter(tenant=tenant)
    sessions_qs = UserSession.objects.filter(tenant=tenant)
    jobs_qs = NetworkSyncJob.objects.filter(tenant=tenant)

    # Apply POP / Area filters if provided
    if area:
        customers_qs = customers_qs.filter(area_zone__iexact=area)
        # Filter sessions belonging to customers in this area
        area_usernames = set(customers_qs.values_list('pppoe_username', flat=True))
        sessions_qs = sessions_qs.filter(username__in=area_usernames)

    # 1. Router Health
    total_routers = routers_qs.count()
    healthy_routers = routers_qs.filter(status='Online').count()
    degraded_routers = total_routers - healthy_routers
    router_stats = routers_qs.aggregate(
        avg_cpu=models.Avg('cpu_usage'),
        avg_memory=models.Avg('memory_usage'),
        avg_disk=models.Avg('disk_usage'),
    )

    # 2. OLT & Optical Health
    total_olts = olts_qs.count()
    healthy_olts = olts_qs.filter(status='Online').count()
    degraded_olts = total_olts - healthy_olts

    total_onus = onus_qs.count()
    online_onus = onus_qs.filter(status='Online').count()
    offline_onus = total_onus - online_onus
    optical_alerts = onus_qs.filter(
        models.Q(rx_power__lt=Decimal('-24.00')) | models.Q(status__in=['DyingGasp', 'Los'])
    ).count()

    # 3. Customer Status & Online Sessions
    total_customers = customers_qs.count()
    active_customers = customers_qs.filter(status=CustomerStatus.ACTIVE).count()
    expired_customers = customers_qs.filter(status=CustomerStatus.EXPIRED).count()

    # Online subscribers: customers with an active UserSession in this tenant
    active_session_usernames = set(sessions_qs.values_list('username', flat=True))
    online_customers = customers_qs.filter(pppoe_username__in=active_session_usernames).count()
    offline_customers = max(0, total_customers - online_customers)

    # 4. PPPoE Sessions & Throughput
    total_sessions = sessions_qs.count()
    session_bandwidth = sessions_qs.aggregate(
        total_in=models.Sum('bytes_in'),
        total_out=models.Sum('bytes_out')
    )
    total_bytes_in = session_bandwidth.get('total_in') or 0
    total_bytes_out = session_bandwidth.get('total_out') or 0

    # 5. Pending & Failed Actions
    pending_actions = jobs_qs.filter(
        status__in=[
            NetworkSyncJob.JobStatus.PENDING,
            NetworkSyncJob.JobStatus.QUEUED,
            NetworkSyncJob.JobStatus.RUNNING,
            NetworkSyncJob.JobStatus.PROCESSING,
            NetworkSyncJob.JobStatus.RETRYING,
        ]
    ).count()
    failed_actions = jobs_qs.filter(
        status__in=[
            NetworkSyncJob.JobStatus.FAILED,
            NetworkSyncJob.JobStatus.STALE,
        ]
    ).count()

    # 6. Recent Network Failures (last 10)
    recent_failures_raw = jobs_qs.filter(
        status__in=[
            NetworkSyncJob.JobStatus.FAILED,
            NetworkSyncJob.JobStatus.STALE,
        ]
    ).select_related('customer', 'router', 'olt').order_by('-created_at')[:10]

    recent_failures = []
    for f in recent_failures_raw:
        recent_failures.append({
            "id": str(f.id),
            "action": f.action,
            "status": f.status,
            "error_message": f.error_message or "Execution failed",
            "retry_count": f.retry_count,
            "router_name": f.router.name if f.router else (f.customer.router.name if f.customer and f.customer.router else None),
            "olt_name": f.olt.name if f.olt else None,
            "customer_code": f.customer.customer_code if f.customer else None,
            "pppoe_username": f.customer.pppoe_username if f.customer else f.payload.get('username', ''),
            "created_at": f.created_at.isoformat(),
        })

    # 7. POP Branch Summary
    pop_branches = []
    for branch in POPBranch.objects.filter(tenant=tenant).order_by('name'):
        # Estimated customers in this branch area
        branch_customers = Customer.objects.filter(tenant=tenant, area_zone__icontains=branch.name).count()
        pop_branches.append({
            "id": str(branch.id),
            "name": branch.name,
            "code": branch.code,
            "location": branch.location,
            "total_capacity": branch.total_capacity,
            "status": branch.status,
            "customer_count": branch_customers,
        })

    # 8. Area Zone Breakdown
    area_breakdown = []
    area_zones = Customer.objects.filter(tenant=tenant).values('area_zone').annotate(
        total_subscribers=models.Count('id'),
        expired_count=models.Count('id', filter=models.Q(status=CustomerStatus.EXPIRED))
    ).order_by('-total_subscribers')[:15]

    for az in area_zones:
        zone_name = az['area_zone'] or "Main Zone"
        zone_usernames = set(Customer.objects.filter(tenant=tenant, area_zone=az['area_zone']).values_list('pppoe_username', flat=True))
        zone_online = UserSession.objects.filter(tenant=tenant, username__in=zone_usernames).count()
        total_subs = az['total_subscribers']
        area_breakdown.append({
            "area_zone": zone_name,
            "total_subscribers": total_subs,
            "online_count": zone_online,
            "offline_count": max(0, total_subs - zone_online),
            "expired_count": az['expired_count'],
        })

    data = {
        "routers": {
            "total": total_routers,
            "healthy": healthy_routers,
            "degraded": degraded_routers,
            "avg_cpu_usage": round(router_stats.get('avg_cpu') or 0, 1),
            "avg_memory_usage": round(router_stats.get('avg_memory') or 0, 1),
            "avg_disk_usage": round(router_stats.get('avg_disk') or 0, 1),
        },
        "customers": {
            "total": total_customers,
            "online": online_customers,
            "offline": offline_customers,
            "active": active_customers,
            "expired": expired_customers,
        },
        "pending_actions": pending_actions,
        "failed_actions": failed_actions,
        "olt": {
            "total": total_olts,
            "healthy": healthy_olts,
            "degraded": degraded_olts,
        },
        "onu": {
            "total": total_onus,
            "online": online_onus,
            "offline": offline_onus,
            "optical_alerts": optical_alerts,
        },
        "sessions": {
            "total_active": total_sessions,
            "bytes_in": total_bytes_in,
            "bytes_out": total_bytes_out,
            "total_gb": round((total_bytes_in + total_bytes_out) / (1024 ** 3), 2),
        },
        "recent_failures": recent_failures,
        "pop_branches": pop_branches,
        "area_breakdown": area_breakdown,
        "timestamp": timezone.now().isoformat(),
    }

    cache.set(cache_key, data, timeout=CACHE_TTL_COCKPIT)
    return data


def get_router_operational_detail(router: Router, area: str = None) -> dict:
    """
    Returns operational diagnostics for a specific router (Router -> Customers).
    Includes hardware telemetry, provisioned customers list, and active PPPoE sessions.
    """
    tenant = router.tenant

    # Associated customers provisioned on this router
    customers_qs = Customer.objects.filter(tenant=tenant, router=router).select_related('package')
    if area:
        customers_qs = customers_qs.filter(area_zone__iexact=area)

    total_provisioned = customers_qs.count()

    # Active PPPoE sessions on this router
    sessions_qs = UserSession.objects.filter(tenant=tenant, router=router).order_by('-connected_at')
    active_sessions_count = sessions_qs.count()
    active_usernames = set(sessions_qs.values_list('username', flat=True))

    online_customers = customers_qs.filter(pppoe_username__in=active_usernames).count()
    offline_customers = max(0, total_provisioned - online_customers)

    # Customers summary list (max 100 for responsive UI)
    customer_list = []
    for c in customers_qs[:100]:
        is_online = c.pppoe_username in active_usernames
        customer_list.append({
            "id": str(c.id),
            "customer_code": c.customer_code,
            "full_name": c.full_name,
            "pppoe_username": c.pppoe_username,
            "static_ip": c.static_ip or "",
            "area_zone": c.area_zone,
            "package_name": c.package.name if c.package else "No Package",
            "speed_mbps": c.package.speed_mbps if c.package else 0,
            "monthly_bill": str(c.monthly_bill),
            "due_amount": str(c.due_amount),
            "expiry_date": c.expiry_date.isoformat() if c.expiry_date else None,
            "status": c.status,
            "is_online": is_online,
        })

    # Active sessions details (max 50)
    recent_sessions = []
    for s in sessions_qs[:50]:
        recent_sessions.append({
            "id": str(s.id),
            "username": s.username,
            "ip_address": s.ip_address,
            "mac_address": s.mac_address,
            "uptime": s.uptime,
            "bytes_in": s.bytes_in,
            "bytes_out": s.bytes_out,
            "connected_at": s.connected_at.isoformat() if s.connected_at else None,
        })

    # Recent sync jobs for this router
    jobs_qs = NetworkSyncJob.objects.filter(
        tenant=tenant,
        router=router
    ).order_by('-created_at')[:10]

    recent_jobs = [{
        "id": str(j.id),
        "action": j.action,
        "status": j.status,
        "error_message": j.error_message,
        "created_at": j.created_at.isoformat(),
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
    } for j in jobs_qs]

    return {
        "router": {
            "id": str(router.id),
            "name": router.name,
            "ip_address": router.ip_address,
            "hostname": router.hostname,
            "effective_host": router.effective_host,
            "status": router.status,
            "api_protocol": router.api_protocol,
            "routeros_version": router.routeros_version,
            "cpu_usage": router.cpu_usage,
            "memory_usage": router.memory_usage,
            "disk_usage": router.disk_usage,
            "uptime": router.uptime,
            "last_ping": router.last_ping.isoformat() if router.last_ping else None,
        },
        "customer_stats": {
            "total_provisioned": total_provisioned,
            "online_customers": online_customers,
            "offline_customers": offline_customers,
        },
        "active_sessions_count": active_sessions_count,
        "customers": customer_list,
        "active_sessions": recent_sessions,
        "recent_jobs": recent_jobs,
    }


def get_olt_operational_detail(olt: OLT) -> dict:
    """
    Returns operational diagnostics for a specific OLT (OLT -> ONUs).
    Includes PON port breakdown, optical power histogram, and connected ONUs.
    """
    tenant = olt.tenant
    onus_qs = ONU.objects.filter(tenant=tenant, olt=olt).select_related('customer')

    total_onus = onus_qs.count()
    online_onus = onus_qs.filter(status='Online').count()
    offline_onus = total_onus - online_onus

    # Optical Power Distribution
    # Normal: >= -24.00 dBm
    # Warning: -27.00 dBm <= power < -24.00 dBm
    # Critical / High Loss: < -27.00 dBm or LOS / DyingGasp
    normal_power_count = onus_qs.filter(status='Online', rx_power__gte=Decimal('-24.00')).count()
    warning_power_count = onus_qs.filter(status='Online', rx_power__lt=Decimal('-24.00'), rx_power__gte=Decimal('-27.00')).count()
    critical_power_count = onus_qs.filter(
        models.Q(rx_power__lt=Decimal('-27.00')) | models.Q(status__in=['DyingGasp', 'Los'])
    ).count()

    # PON Port Breakdown
    pon_ports = []
    pon_port_names = sorted(list(set(onus_qs.values_list('pon_port', flat=True))))
    for port in pon_port_names:
        port_onus = onus_qs.filter(pon_port=port)
        port_total = port_onus.count()
        port_online = port_onus.filter(status='Online').count()
        pon_ports.append({
            "pon_port": port,
            "total_onus": port_total,
            "online_onus": port_online,
            "offline_onus": port_total - port_online,
        })

    # Connected ONUs list (max 100)
    onu_list = []
    for o in onus_qs[:100]:
        onu_list.append({
            "id": str(o.id),
            "pon_port": o.pon_port,
            "onu_index": o.onu_index,
            "mac_address": o.mac_address or "",
            "serial_number": o.serial_number or "",
            "customer_name": o.customer.full_name if o.customer else o.customer_name,
            "customer_code": o.customer.customer_code if o.customer else "",
            "rx_power": str(o.rx_power),
            "tx_power": str(o.tx_power),
            "distance_meters": o.distance_meters,
            "status": o.status,
            "last_offline_reason": o.last_offline_reason,
            "last_sync": o.last_sync.isoformat() if o.last_sync else None,
        })

    # Recent sync jobs for this OLT
    jobs_qs = NetworkSyncJob.objects.filter(
        tenant=tenant,
        olt=olt
    ).order_by('-created_at')[:10]

    recent_jobs = [{
        "id": str(j.id),
        "action": j.action,
        "status": j.status,
        "error_message": j.error_message,
        "created_at": j.created_at.isoformat(),
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
    } for j in jobs_qs]

    return {
        "olt": {
            "id": str(olt.id),
            "name": olt.name,
            "brand": olt.brand,
            "brand_display": olt.get_brand_display(),
            "ip_address": olt.ip_address,
            "status": olt.status,
            "pon_ports_count": olt.pon_ports_count,
            "total_onus": total_onus,
            "online_onus": online_onus,
            "offline_onus": offline_onus,
            "last_sync": olt.last_sync.isoformat() if olt.last_sync else None,
        },
        "optical_distribution": {
            "normal": normal_power_count,
            "warning": warning_power_count,
            "critical_or_los": critical_power_count,
        },
        "pon_ports": pon_ports,
        "onus": onu_list,
        "recent_jobs": recent_jobs,
    }


def get_customer_network_status(customer: Customer) -> dict:
    """
    Returns full network operational telemetry for a single subscriber (Customer -> Service).
    Combines router session telemetry, OLT/ONU fiber diagnostics, and sync job history.
    """
    tenant = customer.tenant

    # 1. Live Session (MikroTik)
    session = UserSession.objects.filter(
        tenant=tenant,
        username=customer.pppoe_username
    ).order_by('-last_seen').first()

    session_data = {
        "is_online": bool(session),
        "ip_address": session.ip_address if session else (customer.static_ip or ""),
        "mac_address": session.mac_address if session else (customer.mac_address or ""),
        "caller_id": session.caller_id if session else "",
        "uptime": session.uptime if session else "0s",
        "bytes_in": session.bytes_in if session else 0,
        "bytes_out": session.bytes_out if session else 0,
        "connected_at": session.connected_at.isoformat() if session and session.connected_at else None,
        "last_seen": session.last_seen.isoformat() if session and session.last_seen else None,
    }

    # 2. Router Binding
    router_data = None
    if customer.router:
        r = customer.router
        router_data = {
            "id": str(r.id),
            "name": r.name,
            "ip_address": r.ip_address,
            "effective_host": r.effective_host,
            "status": r.status,
            "api_protocol": r.api_protocol,
        }

    # 3. Optical Link & ONU Binding
    onu = ONU.objects.filter(tenant=tenant, customer=customer).select_related('olt').first()
    onu_data = None
    if onu:
        onu_data = {
            "id": str(onu.id),
            "olt_name": onu.olt.name if onu.olt else "Unknown OLT",
            "olt_ip": onu.olt.ip_address if onu.olt else "",
            "pon_port": onu.pon_port,
            "onu_index": onu.onu_index,
            "mac_address": onu.mac_address or "",
            "serial_number": onu.serial_number or "",
            "rx_power": str(onu.rx_power),
            "tx_power": str(onu.tx_power),
            "distance_meters": onu.distance_meters,
            "status": onu.status,
            "last_offline_reason": onu.last_offline_reason,
            "last_sync": onu.last_sync.isoformat() if onu.last_sync else None,
        }

    # 4. Recent Network Actions
    jobs = NetworkSyncJob.objects.filter(
        tenant=tenant,
        customer=customer
    ).order_by('-created_at')[:10]

    recent_jobs = [{
        "id": str(j.id),
        "action": j.action,
        "status": j.status,
        "error_message": j.error_message,
        "created_at": j.created_at.isoformat(),
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
    } for j in jobs]

    return {
        "customer": {
            "id": str(customer.id),
            "customer_code": customer.customer_code,
            "full_name": customer.full_name,
            "mobile": customer.mobile,
            "email": customer.email,
            "area_zone": customer.area_zone,
            "connection_type": customer.connection_type,
            "pppoe_username": customer.pppoe_username,
            "package_name": customer.package.name if customer.package else "No Package",
            "monthly_bill": str(customer.monthly_bill),
            "due_amount": str(customer.due_amount),
            "advance_amount": str(customer.advance_amount),
            "expiry_date": customer.expiry_date.isoformat() if customer.expiry_date else None,
            "status": customer.status,
        },
        "session": session_data,
        "router": router_data,
        "onu": onu_data,
        "recent_jobs": recent_jobs,
    }


def execute_customer_network_action(customer: Customer, action_type: str, actor_username: str = "operator") -> dict:
    """
    Executes an operator action on a customer:
    - 'disconnect': Drops active PPPoE session from MikroTik device and deletes UserSession.
    - 'sync_profile': Re-pushes bandwidth speed profile and credentials to MikroTik.
    - 'reboot_onu': Sends reboot command to subscriber's connected ONU via OLT.
    """
    tenant = customer.tenant
    action_type = action_type.lower().strip()

    if action_type == 'disconnect':
        if not customer.router:
            return {"success": False, "error": "Customer has no assigned router."}

        try:
            svc = MikroTikService(customer.router)
            svc.disconnect_session(customer.pppoe_username)
        except Exception as exc:
            logger.warning("Failed to disconnect session on router device: %s", exc)

        # Clear UserSession
        deleted_count, _ = UserSession.objects.filter(
            tenant=tenant,
            username=customer.pppoe_username
        ).delete()

        # Enqueue/Record NetworkSyncJob
        job = NetworkSyncJob.objects.create(
            tenant=tenant,
            customer=customer,
            router=customer.router,
            action=NetworkSyncJob.Action.DISCONNECT_SESSION,
            status=NetworkSyncJob.JobStatus.SUCCESS,
            payload={'pppoe_username': customer.pppoe_username},
            completed_at=timezone.now()
        )

        log_network_action(
            tenant=tenant,
            actor_username=actor_username,
            action='disconnect_session',
            resource_type='Customer',
            resource_id=str(customer.id),
            details={'pppoe_username': customer.pppoe_username, 'router': customer.router.name}
        )

        return {
            "success": True,
            "action": "disconnect",
            "message": f"Session for {customer.pppoe_username} disconnected.",
            "job_id": str(job.id),
        }

    elif action_type == 'sync_profile':
        if not customer.router:
            return {"success": False, "error": "Customer has no assigned router."}

        profile_name = customer.package.mikrotik_profile if customer.package else "default"
        try:
            svc = MikroTikService(customer.router)
            svc.pppoe.update_user_by_name(customer.pppoe_username, profile=profile_name)
        except Exception as exc:
            logger.warning("Failed to sync profile on router: %s", exc)

        job = NetworkSyncJob.objects.create(
            tenant=tenant,
            customer=customer,
            router=customer.router,
            action=NetworkSyncJob.Action.UPDATE_PACKAGE,
            status=NetworkSyncJob.JobStatus.SUCCESS,
            payload={'pppoe_username': customer.pppoe_username, 'profile': profile_name},
            completed_at=timezone.now()
        )

        log_network_action(
            tenant=tenant,
            actor_username=actor_username,
            action='sync_profile',
            resource_type='Customer',
            resource_id=str(customer.id),
            details={'pppoe_username': customer.pppoe_username, 'profile': profile_name}
        )

        return {
            "success": True,
            "action": "sync_profile",
            "message": f"Profile {profile_name} synced to router for {customer.pppoe_username}.",
            "job_id": str(job.id),
        }

    elif action_type == 'reboot_onu':
        onu = ONU.objects.filter(tenant=tenant, customer=customer).select_related('olt').first()
        if not onu or not onu.olt:
            return {"success": False, "error": "Customer has no linked ONU / OLT."}

        try:
            onu_svc = ONUService(onu)
            onu_svc.reboot()
        except Exception as exc:
            logger.warning("Failed to dispatch reboot to ONU: %s", exc)

        job = NetworkSyncJob.objects.create(
            tenant=tenant,
            customer=customer,
            olt=onu.olt,
            action=NetworkSyncJob.Action.REBOOT_ONU,
            status=NetworkSyncJob.JobStatus.SUCCESS,
            payload={'onu_id': str(onu.id), 'pon_port': onu.pon_port, 'onu_index': onu.onu_index},
            completed_at=timezone.now()
        )

        log_network_action(
            tenant=tenant,
            actor_username=actor_username,
            action='reboot_onu',
            resource_type='ONU',
            resource_id=str(onu.id),
            details={'pon_port': onu.pon_port, 'onu_index': onu.onu_index, 'customer': customer.full_name}
        )

        return {
            "success": True,
            "action": "reboot_onu",
            "message": f"Reboot command dispatched to ONU ({onu.pon_port}:{onu.onu_index}).",
            "job_id": str(job.id),
        }

    else:
        return {"success": False, "error": f"Unknown action: {action_type}. Supported: disconnect, sync_profile, reboot_onu"}

"""
Phase 23: legacy usage_controller.php port. Endpoints:
  POST /api/v1/network/usage/sync/              sync every router
  GET  /api/v1/network/usage/router-status/     single-router liveness probe
  GET  /api/v1/network/usage/live/?router_id=N  per-session Mbps sample
  GET  /api/v1/network/usage/charts/?range=7d   aggregated chart data
  GET  /api/v1/network/usage/reports/?type=...  history / top_users / router_wise
"""
from __future__ import annotations

import logging
from datetime import date, datetime

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import IsTenantMember
from apps.core.utils import get_scoped_queryset, get_tenant_for_request
from apps.network.models import Router, UsageLog
from apps.network.usage import (
    check_router_online,
    compute_live_rates,
    format_bytes,
    get_usage_charts,
    get_usage_reports_data,
    sync_router_usage,
)
from apps.customers.models import Customer

logger = logging.getLogger(__name__)


def _has_monitoring_perm(request) -> bool:
    """Mirrors PHP ``hasRole('Admin') || hasPermission('monitoring')`` —
    only admins or staff explicitly granted monitoring may access."""
    if not getattr(request.user, 'is_authenticated', False):
        return False
    if request.user.is_superuser:
        return True
    tenant = getattr(request, 'tenant', None) or get_tenant_for_request(request)
    if not tenant:
        return False
    from apps.authentication.models import StaffMembership
    role_name = (
        StaffMembership.objects
        .filter(user=request.user, tenant=tenant)
        .values_list('role__name', flat=True)
        .first()
    ) or ''
    name = role_name.lower()
    if name in ('admin', 'super admin', 'manager', 'isp_admin', 'isp admin'):
        return True
    profile = getattr(request.user, 'profile', None)
    if profile and getattr(profile, 'role', '').lower() in ('admin', 'manager'):
        return True
    return False


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsTenantMember])
def sync_now(request):
    if not _has_monitoring_perm(request):
        return Response({'success': False, 'message': 'Forbidden.'},
                        status=status.HTTP_403_FORBIDDEN)
    tenant = get_tenant_for_request(request)
    routers = Router.objects.filter(tenant=tenant)
    success_count = 0
    failed_count = 0
    details = []
    for router in routers:
        result = sync_router_usage(router)
        if result.get('error'):
            failed_count += 1
            details.append({
                'router_name': router.name,
                'status': 'failed',
                'error': result['error'],
            })
        else:
            success_count += 1
            details.append({
                'router_name': router.name,
                'status': 'success',
                'active_sessions': result['active_sessions'],
                'synced_sessions': result['synced_sessions'],
                'bytes_uploaded': format_bytes(result['bytes_uploaded']),
                'bytes_downloaded': format_bytes(result['bytes_downloaded']),
            })
    return Response({
        'success': True,
        'summary': f'Synced {success_count} routers, {failed_count} failed.',
        'details': details,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantMember])
def check_router_status(request):
    if not _has_monitoring_perm(request):
        return Response({'success': False, 'message': 'Forbidden.'},
                        status=status.HTTP_403_FORBIDDEN)
    router_id = request.query_params.get('router_id') or ''
    if not router_id:
        return Response({'success': False, 'message': 'router_id required.'},
                        status=status.HTTP_400_BAD_REQUEST)
    router = Router.objects.filter(id=router_id).first()
    if not router:
        return Response({'success': False, 'message': 'Router not found.'},
                        status=status.HTTP_404_NOT_FOUND)
    online = check_router_online(router)
    return Response({
        'success': True,
        'online': online,
        'router_name': router.name,
        'ip_address': router.ip_address,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantMember])
def get_live_usage(request):
    if not _has_monitoring_perm(request):
        return Response({'success': False, 'message': 'Forbidden.'},
                        status=status.HTTP_403_FORBIDDEN)
    tenant = get_tenant_for_request(request)
    tenant_slug = tenant.slug if tenant else 'main'
    router_id = request.query_params.get('router_id') or '0'
    search = (request.query_params.get('search') or '').strip()
    try:
        page = max(1, int(request.query_params.get('page') or 1))
        limit = int(request.query_params.get('limit') or 100)
    except ValueError:
        page, limit = 1, 100
    limit = max(10, min(500, limit))
    force_refresh = request.query_params.get('force_refresh') in ('1', 'true')

    def fetch_sessions():
        from apps.network.services.mikrotik.client import MikroTikRESTClient
        sessions = []
        routers = Router.objects.filter(tenant=tenant)
        if router_id not in (None, '', '0'):
            routers = routers.filter(id=router_id)
        for rtr in routers:
            try:
                with MikroTikRESTClient.from_router(rtr) as client:
                    resp = client.get('/ppp/active')
            except Exception as exc:
                logger.debug('ppp/active failed for %s: %s', rtr.id, exc)
                continue
            rows = resp if isinstance(resp, list) else ([resp] if isinstance(resp, dict) else [])
            for p in rows:
                if not isinstance(p, dict):
                    continue
                if not p.get('name'):
                    continue
                sessions.append({
                    'username': p['name'],
                    'router_id': str(rtr.id),
                    'router_name': rtr.name,
                    'address': p.get('address') or '',
                    'caller-id': p.get('caller-id') or '',
                    'bytes-in': float(p.get('bytes-in') or 0),
                    'bytes-out': float(p.get('bytes-out') or 0),
                    'uptime': p.get('uptime') or '0s',
                })
        return sessions

    rates = compute_live_rates(
        str(router_id), tenant_slug,
        fetch_sessions_fn=fetch_sessions,
    )

    # Filter by router + search against customer DB
    sessions = fetch_sessions()
    if router_id not in (None, '', '0'):
        sessions = [s for s in sessions if str(s['router_id']) == str(router_id)]

    db_user_map = {}
    if sessions:
        usernames = list({s['username'] for s in sessions})
        for c in Customer.objects.filter(tenant=tenant, pppoe_username__in=usernames):
            db_user_map[c.pppoe_username.lower()] = c

    matched = []
    for s in sessions:
        s_lower = s['username'].lower()
        db_user = db_user_map.get(s_lower)
        if search:
            query = search.lower()
            haystack = ' '.join([
                s_lower,
                (db_user.full_name if db_user else '') or '',
                (db_user.mobile if db_user else '') or '',
                (str(db_user.package) if db_user and db_user.package_id else ''),
            ]).lower()
            if query not in haystack and query not in s['address'].lower() and query not in (s['caller-id'] or '').lower():
                continue
        up = float(s['bytes-in'])
        down = float(s['bytes-out'])
        matched.append({
            'username': s['username'],
            'name': db_user.full_name if db_user else 'Unmapped PPPoE User',
            'phone': db_user.mobile if db_user else 'N/A',
            'ip': s.get('address') or 'N/A',
            'mac': s.get('caller-id') or 'N/A',
            'uptime': s['uptime'],
            'upload_raw': up,
            'download_raw': down,
            'upload_formatted': format_bytes(up),
            'download_formatted': format_bytes(down),
            'package': str(db_user.package) if db_user and db_user.package_id else 'N/A',
            'status': (db_user.status if db_user and hasattr(db_user, 'status') else 'Active'),
            'router_name': s.get('router_name') or 'Unknown',
        })
    total = len(matched)
    total_pages = max(1, (total + limit - 1) // limit)
    page = min(page, total_pages)
    offset = (page - 1) * limit
    slice_ = matched[offset:offset + limit]

    return Response({
        'success': True,
        'count': len(sessions),
        'filtered_count': total,
        'down_speed': rates['down_speed'],
        'up_speed': rates['up_speed'],
        'sample_id': rates['sample_id'],
        'sample_time': rates['sample_time'],
        'rate_mode': 'per_session',
        'page': page,
        'limit': limit,
        'total_pages': total_pages,
        'sessions': slice_,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantMember])
def get_usage_charts_view(request):
    if not _has_monitoring_perm(request):
        return Response({'success': False, 'message': 'Forbidden.'},
                        status=status.HTTP_403_FORBIDDEN)
    range_q = request.query_params.get('range', '7days')
    days = 30 if range_q == '30days' else 7
    tenant = get_tenant_for_request(request)
    return Response(get_usage_charts(tenant=tenant, days=days))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantMember])
def get_usage_reports(request):
    if not _has_monitoring_perm(request):
        return Response({'success': False, 'message': 'Forbidden.'},
                        status=status.HTTP_403_FORBIDDEN)
    tenant = get_tenant_for_request(request)
    report_type = request.query_params.get('type', 'history')
    router_id = request.query_params.get('router_id') or None
    customer_id = request.query_params.get('customer_id') or None
    date_from = request.query_params.get('date_from') or None
    date_to = request.query_params.get('date_to') or None
    return Response(get_usage_reports_data(
        tenant=tenant,
        report_type=report_type,
        date_from=date_from,
        date_to=date_to,
        router_id=router_id,
        customer_id=customer_id,
    ))

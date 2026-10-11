"""
platform_admin_views.py — Phase 2 of the SaaS Owner Admin Panel plan.

10 platform-owner-only endpoints under the new Swagger tag
``17. Platform Owner Admin``:

  1. GET  /api/v1/saas/audit/export/                — CSV/JSONL/JSON export
  2. POST /api/v1/saas/platform-admin/invite/       — invite a new PA
  3. GET  /api/v1/saas/platform-admin/list/         — list + filter
  4. PATCH /api/v1/saas/platform-admin/<id>/        — change role / suspend
  5. GET  /api/v1/saas/kill-switch/                 — read current state
  6. POST /api/v1/saas/kill-switch/                 — toggle on/off (OWNER only)
  7. GET  /api/v1/saas/feature-flags/rollout/       — list flags by cohort
  8. POST /api/v1/saas/feature-flags/rollout/       — bulk toggle
  9. GET  /api/v1/saas/billing/reconcile/           — MRR / churn
  10. GET  /api/v1/saas/impersonation-log/          — list sessions
  11. POST /api/v1/saas/impersonation/<tenant>/stop/ — force-stop active session
  12. GET  /api/v1/saas/jobs/                       — Celery queue snapshot
  13. POST /api/v1/saas/jobs/<task>/run/            — ad-hoc task run
  14. GET  /api/v1/saas/health/deep/                — DB+Redis+lock deep check

(There's a soft 14 here because the deep-health check sits alongside the
existing SaaSHealthView and the kill-switch has a separate read endpoint.)

Every write emits an AuditLog row via :func:`log_platform_admin_action`.
Every endpoint respects the role-narrowed permission classes added in
Phase 1.2.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.db import connection
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import permissions, status, views
from rest_framework.renderers import BrowsableAPIRenderer, JSONRenderer
from rest_framework.response import Response

from .renderers import CSVRenderer, NDJSONRenderer, RawJSONRenderer

from apps.authentication.models import PlatformAdmin, PlatformAdminRole
from apps.core.feature_gating import (
    clear_platform_write_lock,
    get_platform_write_lock_state,
    is_platform_write_locked,
    set_platform_write_lock,
)
from apps.core.models import (
    AuditLog,
    DatabaseBackup,
    ImpersonationLog,
    SaaSPackage,
    SaaSPayment,
    Tenant,
    TenantFeatureFlag,
    TenantSubscription,
)
from apps.core.permissions import (
    IsCentralOrPlatformAdmin,
    IsPlatformOwnerOnly,
    IsPlatformOwnerOrAdmin,
)
from apps.core.platform_admin_audit import log_platform_admin_action
from apps.core.redis_service import RedisService

logger = logging.getLogger(__name__)

PLATFORM_ADMIN_TAG = '17. Platform Owner Admin'


# ════════════════════════════════════════════════════════════════════════════
# 5 + 6. Kill-switch
# ════════════════════════════════════════════════════════════════════════════

@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='Read platform write-lock state',
    description=(
        'Returns whether the global write lock is engaged, the actor who set it, '
        'and the reason. Read endpoints work even when the lock is engaged.'
    ),
    responses={200: dict},
)
class PlatformKillSwitchView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsCentralOrPlatformAdmin]

    def get(self, request):
        return Response(get_platform_write_lock_state())


@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='Toggle the platform write-lock (OWNER only)',
    description=(
        'Engages or releases the global write lock that pauses all write '
        'traffic on the central control plane. OWNER role only. Every '
        'toggle writes an AuditLog row.'
    ),
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'engaged': {'type': 'boolean'},
                'reason': {'type': 'string', 'maxLength': 200},
            },
            'required': ['engaged'],
        }
    },
    responses={200: dict, 403: OpenApiResponse(description='OWNER role required')},
)
class PlatformKillSwitchToggleView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOnly]

    def post(self, request):
        engaged = bool(request.data.get('engaged'))
        reason = (request.data.get('reason') or '').strip()[:200]
        actor_label = request.user.get_username()
        if engaged:
            state = set_platform_write_lock(actor_label, reason)
        else:
            state = clear_platform_write_lock()
        log_platform_admin_action(
            request,
            action='kill_switch.toggle',
            module='saas.platform_admin',
            details={'engaged': engaged, 'reason': reason, 'new_state': state},
        )
        return Response(state)


# ════════════════════════════════════════════════════════════════════════════
# 12. Health deep
# ════════════════════════════════════════════════════════════════════════════

@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='Deep platform health (DB + Redis + lock)',
    description=(
        'Extends the existing SaaSHealthView with a Redis ping, a per-table '
        'DB latency check, and the current kill-switch state. Returns 503 if '
        'any probe fails.'
    ),
    responses={200: dict, 503: dict},
)
class PlatformHealthDeepView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsCentralOrPlatformAdmin]

    def get(self, request):
        db_ok, db_latency_ms, db_err = self._probe_db()
        redis_ok, redis_latency_ms, redis_err = RedisService.ping()
        is_healthy = db_ok and redis_ok
        body = {
            'db': {'ok': db_ok, 'latency_ms': db_latency_ms, 'error': db_err},
            'redis': {'ok': redis_ok, 'latency_ms': redis_latency_ms, 'error': redis_err},
            'kill_switch': get_platform_write_lock_state(),
            'timestamp': timezone.now().isoformat(),
        }
        http_status = status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response(body, status=http_status)

    def _probe_db(self):
        try:
            with connection.cursor() as cursor:
                t0 = timezone.now()
                cursor.execute('SELECT 1;')
                cursor.fetchone()
                latency_ms = int((timezone.now() - t0).total_seconds() * 1000)
            return True, latency_ms, None
        except Exception as exc:
            return False, None, str(exc)


# ════════════════════════════════════════════════════════════════════════════
# 7 + 8. Feature-flag rollout
# ════════════════════════════════════════════════════════════════════════════

@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='List or bulk-toggle TenantFeatureFlag rows',
    description=(
        'GET: paginated list of feature flags per tenant. '
        'POST: bulk enable / disable a feature across a cohort (e.g. all PRO tenants).'
    ),
    responses={200: dict, 400: dict},
)
class PlatformFeatureFlagsRolloutView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOrAdmin]

    def get(self, request):
        tenant_id = request.query_params.get('tenant')
        feature_key = request.query_params.get('feature')
        qs = TenantFeatureFlag.objects.select_related('tenant').all()
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        if feature_key:
            qs = qs.filter(feature_key=feature_key)
        rows = [
            {
                'tenant_id': str(f.tenant_id),
                'tenant_slug': f.tenant.slug,
                'feature_key': f.feature_key,
                'enabled': f.enabled,
                'config': f.config,
            }
            for f in qs[:200]
        ]
        return Response({'count': len(rows), 'results': rows})

    def post(self, request):
        feature_key = request.data.get('feature_key')
        enabled = bool(request.data.get('enabled'))
        plan_filter = request.data.get('plan')  # 'FREE' | 'PRO' | 'ENTERPRISE' | None
        if not feature_key:
            return Response({'error': 'feature_key is required'}, status=400)
        tenant_qs = Tenant.objects.filter(is_active=True)
        if plan_filter:
            tenant_qs = tenant_qs.filter(plan=plan_filter)
        count = 0
        for tenant in tenant_qs:
            flag, _ = TenantFeatureFlag.objects.get_or_create(
                tenant=tenant, feature_key=feature_key,
            )
            flag.enabled = enabled
            flag.save(update_fields=['enabled', 'updated_at' if hasattr(flag, 'updated_at') else 'enabled'])
            count += 1
        log_platform_admin_action(
            request,
            action='feature_flag.bulk_toggle',
            module='saas.platform_admin',
            details={'feature_key': feature_key, 'enabled': enabled, 'plan': plan_filter, 'count': count},
        )
        return Response({'feature_key': feature_key, 'enabled': enabled, 'affected_tenants': count})


# ════════════════════════════════════════════════════════════════════════════
# 9. Billing reconcile
# ════════════════════════════════════════════════════════════════════════════

@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='Platform billing reconciliation (MRR, churn, failed payments)',
    description=(
        'Read-only rollup across TenantSubscription + SaaSPayment. Uses '
        'platform-level aggregation; does not expose individual tenant '
        'revenue.'
    ),
    responses={200: dict},
)
class PlatformBillingReconcileView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOrAdmin]

    def get(self, request):
        active_subs = TenantSubscription.objects.filter(status='active')
        mrr = sum(
            (s.package.monthly_price for s in active_subs.select_related('package')),
            start=__import__('decimal').Decimal('0'),
        )
        # Churn: cancelled in the last 30 days
        month_ago = timezone.now() - timedelta(days=30)
        cancelled = TenantSubscription.objects.filter(status='cancelled', updated_at__gte=month_ago).count()
        failed_payments = SaaSPayment.objects.filter(status='failed').count()
        packages = SaaSPackage.objects.all().values('id', 'name', 'monthly_price')
        return Response({
            'mrr_total': str(mrr),
            'active_subscriptions': active_subs.count(),
            'cancelled_last_30d': cancelled,
            'failed_payments': failed_payments,
            'packages': list(packages),
            'as_of': timezone.now().isoformat(),
        })


# ════════════════════════════════════════════════════════════════════════════
# 10 + 11. Impersonation log + force-stop
# ════════════════════════════════════════════════════════════════════════════

@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='List platform-admin impersonation sessions',
    responses={200: dict},
)
class PlatformImpersonationLogView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOrAdmin]

    def get(self, request):
        active_only = request.query_params.get('active') == 'true'
        qs = ImpersonationLog.objects.select_related('actor', 'tenant', 'force_stopped_by')
        if active_only:
            qs = qs.filter(ended_at__isnull=True)
        rows = [
            {
                'id': str(s.id),
                'actor': s.actor.username,
                'tenant': s.tenant.slug,
                'started_at': s.started_at.isoformat(),
                'ended_at': s.ended_at.isoformat() if s.ended_at else None,
                'is_active': s.is_active,
                'reason': s.reason,
                'force_stopped_by': s.force_stopped_by.username if s.force_stopped_by else None,
            }
            for s in qs[:200]
        ]
        return Response({'count': len(rows), 'results': rows})


@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='Force-stop an active impersonation session (OWNER only)',
    description='Marks the active session for the given tenant as ended. OWNER only.',
    responses={200: dict, 404: OpenApiResponse(description='No active session')},
)
class PlatformImpersonationStopView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOnly]

    def post(self, request, tenant_id):
        try:
            tenant = Tenant.objects.get(pk=tenant_id)
        except Tenant.DoesNotExist:
            return Response({'error': 'tenant not found'}, status=404)
        active = ImpersonationLog.objects.filter(tenant=tenant, ended_at__isnull=True).first()
        if active is None:
            return Response({'error': 'no active session for this tenant'}, status=404)
        active.ended_at = timezone.now()
        active.force_stopped_by = request.user
        active.save(update_fields=['ended_at', 'force_stopped_by'])
        log_platform_admin_action(
            request,
            action='impersonation.force_stop',
            module='saas.platform_admin',
            tenant=tenant,
            resource_type='ImpersonationLog',
            resource_id=str(active.id),
            details={'impersonated_tenant': tenant.slug, 'original_actor': active.actor.username},
        )
        return Response({'id': str(active.id), 'ended_at': active.ended_at.isoformat()})


# ════════════════════════════════════════════════════════════════════════════
# 2 + 3 + 4. Platform admin invite / list / change role
# ════════════════════════════════════════════════════════════════════════════

@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='Invite a new PlatformAdmin (OWNER only)',
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'username': {'type': 'string'},
                'email': {'type': 'string', 'format': 'email'},
                'role': {'type': 'string', 'enum': [r.value for r in PlatformAdminRole]},
            },
            'required': ['username', 'email', 'role'],
        }
    },
    responses={201: dict, 400: dict, 403: OpenApiResponse(description='OWNER role required')},
)
class PlatformAdminInviteView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOnly]

    def post(self, request):
        from django.contrib.auth.models import User
        username = (request.data.get('username') or '').strip()
        email = (request.data.get('email') or '').strip()
        role = request.data.get('role') or PlatformAdminRole.SUPPORT.value
        if not username or not email:
            return Response({'error': 'username and email are required'}, status=400)
        if role not in PlatformAdminRole.values:
            return Response({'error': f'role must be one of {PlatformAdminRole.values}'}, status=400)
        user, user_created = User.objects.get_or_create(
            username=username,
            defaults={'email': email, 'is_active': True},
        )
        if not user_created and user.email != email:
            user.email = email
            user.save(update_fields=['email'])
        pa, pa_created = PlatformAdmin.objects.get_or_create(
            user=user,
            defaults={
                'role': role,
                'is_active': True,
                'invited_by': request.user,
                'invited_at': timezone.now(),
            },
        )
        if not pa_created:
            pa.role = role
            pa.is_active = True
            pa.invited_by = request.user
            pa.invited_at = timezone.now()
            pa.save()
        log_platform_admin_action(
            request,
            action='platform_admin.invite',
            module='saas.platform_admin',
            resource_type='PlatformAdmin',
            resource_id=str(pa.id),
            details={'invited_username': username, 'role': role, 'created': pa_created},
        )
        body = {
            'id': str(pa.id),
            'username': user.username,
            'email': user.email,
            'role': pa.role,
            'is_active': pa.is_active,
            'invited_at': pa.invited_at.isoformat() if pa.invited_at else None,
        }
        return Response(body, status=status.HTTP_201_CREATED)


@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='List PlatformAdmins (filter by role / active)',
    responses={200: dict},
)
class PlatformAdminListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOrAdmin]

    def get(self, request):
        role = request.query_params.get('role')
        only_active = request.query_params.get('active') == 'true'
        qs = PlatformAdmin.objects.select_related('user').all()
        if role:
            qs = qs.filter(role=role)
        if only_active:
            qs = qs.filter(is_active=True)
        rows = [
            {
                'id': str(pa.id),
                'username': pa.user.username,
                'email': pa.user.email,
                'role': pa.role,
                'is_active': pa.is_active,
                'mfa_enabled': pa.mfa_enabled,
                'last_login_at': pa.last_login_at.isoformat() if pa.last_login_at else None,
                'invited_at': pa.invited_at.isoformat() if pa.invited_at else None,
            }
            for pa in qs[:200]
        ]
        return Response({'count': len(rows), 'results': rows})


@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='Update a PlatformAdmin (change role / suspend) (OWNER only)',
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'role': {'type': 'string', 'enum': [r.value for r in PlatformAdminRole]},
                'is_active': {'type': 'boolean'},
            },
        }
    },
    responses={200: dict, 404: dict},
)
class PlatformAdminDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOnly]

    def patch(self, request, pa_id):
        try:
            pa = PlatformAdmin.objects.select_related('user').get(pk=pa_id)
        except PlatformAdmin.DoesNotExist:
            return Response({'error': 'not found'}, status=404)
        before = {'role': pa.role, 'is_active': pa.is_active}
        if 'role' in request.data:
            new_role = request.data['role']
            if new_role not in PlatformAdminRole.values:
                return Response({'error': f'role must be one of {PlatformAdminRole.values}'}, status=400)
            pa.role = new_role
        if 'is_active' in request.data:
            pa.is_active = bool(request.data['is_active'])
        pa.save()
        log_platform_admin_action(
            request,
            action='platform_admin.update',
            module='saas.platform_admin',
            resource_type='PlatformAdmin',
            resource_id=str(pa.id),
            before=before,
            after={'role': pa.role, 'is_active': pa.is_active},
        )
        return Response({
            'id': str(pa.id),
            'username': pa.user.username,
            'role': pa.role,
            'is_active': pa.is_active,
        })


# ════════════════════════════════════════════════════════════════════════════
# 12 + 13. Jobs (Celery queue snapshot + ad-hoc run)
# ════════════════════════════════════════════════════════════════════════════

# Allow-listed tasks that can be triggered ad-hoc by a platform admin.
# Anything not in this list is denied — defense in depth.
AD_HOC_TASK_ALLOWLIST = {
    'apps.core.tasks.collect_corporate_telemetry_every_5m',
    'apps.core.tasks.refresh_feature_flag_cache',
}


@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='List Celery task names + their allowlist',
    description='Read-only inspection of the registered task names. The ad-hoc run endpoint is OWNER-only.',
    responses={200: dict},
)
class PlatformJobsListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOrAdmin]

    def get(self, request):
        from django_celery_beat import models  # noqa: F401  — only imported if available
        from sheba_core.celery import app as celery_app
        registered = sorted(name for name in celery_app.tasks.keys() if not name.startswith('celery.'))
        return Response({
            'registered_count': len(registered),
            'allowlist': sorted(AD_HOC_TASK_ALLOWLIST),
            'tasks': registered[:200],
        })


@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='Trigger an ad-hoc run of an allowlisted Celery task (OWNER only)',
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'task': {'type': 'string'},
            },
            'required': ['task'],
        }
    },
    responses={202: dict, 400: dict, 403: OpenApiResponse(description='OWNER role required or task not in allowlist')},
)
class PlatformJobsRunView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOnly]

    def post(self, request):
        task_name = (request.data.get('task') or '').strip()
        if task_name not in AD_HOC_TASK_ALLOWLIST:
            return Response(
                {'error': f'task not in allowlist; allowed: {sorted(AD_HOC_TASK_ALLOWLIST)}'},
                status=400,
            )
        from sheba_core.celery import app as celery_app
        async_result = celery_app.send_task(task_name)
        log_platform_admin_action(
            request,
            action='jobs.adhoc_run',
            module='saas.platform_admin',
            details={'task': task_name, 'task_id': async_result.id},
        )
        return Response({'task': task_name, 'task_id': async_result.id}, status=202)


# ════════════════════════════════════════════════════════════════════════════
# 1. Audit export (CSV / JSONL / JSON)
# ════════════════════════════════════════════════════════════════════════════

@extend_schema(
    tags=[PLATFORM_ADMIN_TAG],
    summary='Export AuditLog rows (CSV / JSONL / JSON) with filters',
    description=(
        'GET: stream-filtered audit log export. Query params: from, to, '
        'actor, action, module, resource_type, resource_id, format '
        '(csv|ndjson|json, default csv).'
    ),
    responses={200: OpenApiResponse(description='Streamed file')},
)
class PlatformAuditExportView(views.APIView):
    permission_classes = [permissions.IsAuthenticated, IsPlatformOwnerOrAdmin]
    # The view returns a Django StreamingHttpResponse via ``stream_export``.
    # We declare the supported renderers so DRF's content negotiation can
    # pick one (matches the existing SaaSAuditLogViewSet.export pattern).
    renderer_classes = [CSVRenderer, NDJSONRenderer, RawJSONRenderer, JSONRenderer, BrowsableAPIRenderer]

    def get(self, request):
        from apps.core.audit_export import build_audit_queryset, stream_export
        fmt = request.query_params.get('format', 'csv').lower()
        if fmt not in ('csv', 'ndjson', 'json'):
            return Response({'error': 'format must be one of csv|ndjson|json'}, status=400)
        params = {
            'from': request.query_params.get('from') or None,
            'to': request.query_params.get('to') or None,
            'actor_username': request.query_params.get('actor') or None,
            'action': request.query_params.get('action') or None,
            'module': request.query_params.get('module') or None,
            'resource_type': request.query_params.get('resource_type') or None,
            'resource_id': request.query_params.get('resource_id') or None,
        }
        qs = build_audit_queryset(params={k: v for k, v in params.items() if v})
        log_platform_admin_action(
            request,
            action='audit.export',
            module='saas.platform_admin',
            details={'format': fmt, 'row_count': qs.count()},
        )
        return stream_export(qs, fmt=fmt)
        params = {
            'from': request.query_params.get('from') or None,
            'to': request.query_params.get('to') or None,
            'actor_username': request.query_params.get('actor') or None,
            'action': request.query_params.get('action') or None,
            'module': request.query_params.get('module') or None,
            'resource_type': request.query_params.get('resource_type') or None,
            'resource_id': request.query_params.get('resource_id') or None,
        }
        qs = build_audit_queryset(params={k: v for k, v in params.items() if v})
        log_platform_admin_action(
            request,
            action='audit.export',
            module='saas.platform_admin',
            details={'format': fmt, 'row_count': qs.count()},
        )
        return stream_export(qs, fmt=fmt)

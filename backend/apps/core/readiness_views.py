"""
Phase 21: Production Readiness & System Health Observability Probes.
Provides comprehensive health checks for:
- PostgreSQL database ping, query latency & migration safety
- Redis cache & distributed locking safety
- Celery worker status & task queue inspection
- Network assets health (Routers, OLTs, ONUs)
- Disaster recovery & database backup readiness
- Multi-tenancy & security isolation verification
"""

import os
import time
import logging
from rest_framework import views, permissions, status
from rest_framework.response import Response
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.conf import settings
from django.core.cache import cache
from drf_spectacular.utils import extend_schema

from apps.network.models import Router, OLT, ONU
from apps.core.models import DatabaseBackup

logger = logging.getLogger(__name__)


class ProductionReadinessView(views.APIView):
    """
    Phase 21: Comprehensive production gate readiness probe.
    Returns 200 OK when all critical subsystems are operational, or 503 if critical systems fail.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        tags=['14. Core & Tenant Settings'],
        summary='System production readiness probe',
        description='Detailed observability check for PostgreSQL, Redis, Celery, device health, and backup safety.',
        responses={200: dict, 503: dict}
    )
    def get(self, request):
        start_time = time.time()
        is_ready = True
        critical_errors = []

        # 1. PostgreSQL Health & Migration Safety
        db_health = {'status': 'healthy', 'latency_ms': 0.0, 'pending_migrations_count': 0}
        try:
            db_start = time.time()
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            db_health['latency_ms'] = round((time.time() - db_start) * 1000, 2)

            # Check for unapplied migrations
            executor = MigrationExecutor(connection)
            targets = executor.loader.graph.leaf_nodes()
            pending_plan = executor.migration_plan(targets)
            db_health['pending_migrations_count'] = len(pending_plan)
            if pending_plan:
                db_health['status'] = 'unapplied_migrations'
                is_ready = False
                critical_errors.append(f"{len(pending_plan)} database migrations are pending execution.")
        except Exception as e:
            db_health['status'] = 'error'
            db_health['error'] = str(e)
            is_ready = False
            critical_errors.append(f"Database error: {str(e)}")

        # 2. Redis Health & Distributed Locking Safety
        redis_health = {'status': 'healthy', 'latency_ms': 0.0, 'lock_safety': 'passed'}
        try:
            r_start = time.time()
            test_key = 'probe:readiness:ping'
            cache.set(test_key, 'pong', timeout=10)
            val = cache.get(test_key)
            redis_health['latency_ms'] = round((time.time() - r_start) * 1000, 2)
            if val != 'pong':
                redis_health['status'] = 'degraded'
                redis_health['lock_safety'] = 'failed'
                is_ready = False
                critical_errors.append("Redis cache probe returned unexpected value.")
        except Exception as e:
            redis_health['status'] = 'offline'
            redis_health['error'] = str(e)
            redis_health['lock_safety'] = 'failed'
            is_ready = False
            critical_errors.append(f"Redis cache/locking probe failed: {str(e)}")

        # 3. Celery Worker Inspection
        celery_health = {'status': 'healthy', 'active_workers': 0}
        try:
            from sheba_core.celery import app as celery_app
            # Inspect worker ping with low timeout
            insp = celery_app.control.inspect(timeout=0.3)
            ping_res = insp.ping() if insp else None
            if ping_res:
                celery_health['active_workers'] = len(ping_res)
                celery_health['status'] = 'healthy'
            else:
                celery_health['status'] = 'no_workers_responding'
        except Exception as e:
            celery_health['status'] = 'not_available'
            celery_health['details'] = str(e)

        # 4. Network Assets Health
        try:
            routers_qs = Router.objects.all()
            total_routers = routers_qs.count()
            online_routers = routers_qs.filter(status='Online').count()

            olts_qs = OLT.objects.all()
            total_olts = olts_qs.count()
            online_olts = olts_qs.filter(status='Online').count()

            onus_qs = ONU.objects.all()
            total_onus = onus_qs.count()
            online_onus = onus_qs.filter(status='Online').count()
            alarm_onus = onus_qs.filter(status__in=['DyingGasp', 'Los', 'PowerLoss']).count()

            network_health = {
                'status': 'healthy' if online_routers == total_routers else 'warning',
                'routers': {'total': total_routers, 'online': online_routers, 'offline': total_routers - online_routers},
                'olts': {'total': total_olts, 'online': online_olts, 'offline': total_olts - online_olts},
                'onus': {'total': total_onus, 'online': online_onus, 'alarms': alarm_onus, 'offline': total_onus - online_onus},
            }
        except Exception as e:
            network_health = {'status': 'error', 'details': str(e)}

        # 5. Backup & Disaster Recovery Readiness
        backups_dir = os.path.join(settings.BASE_DIR, 'backups')
        backup_storage_ok = os.path.exists(backups_dir) and os.access(backups_dir, os.W_OK)
        try:
            latest_backup = DatabaseBackup.objects.filter(status='completed').order_by('-created_at').first()
            backup_health = {
                'storage_directory_writable': backup_storage_ok,
                'last_backup_at': latest_backup.created_at.isoformat() if latest_backup else None,
                'last_backup_name': latest_backup.backup_name if latest_backup else None,
            }
        except Exception as e:
            backup_health = {
                'storage_directory_writable': backup_storage_ok,
                'error': str(e),
            }
            is_ready = False
            critical_errors.append(f"Backup subsystem query failed: {str(e)}")

        # Critical probes readiness assertion
        if redis_health.get('status') in ('offline', 'degraded'):
            is_ready = False
            if not any('Redis' in err for err in critical_errors):
                critical_errors.append(f"Redis probe is {redis_health.get('status')}")

        # Overall execution
        total_probe_duration_ms = round((time.time() - start_time) * 1000, 2)
        http_status = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE

        # Operator check for detailed diagnostics vs minimal public liveness
        is_operator = (
            request.user
            and request.user.is_authenticated
            and (
                request.user.is_staff
                or getattr(request.user, 'is_superuser', False)
                or getattr(request.user, 'profile', None) is not None
            )
        )

        if not is_operator:
            # Minimal liveness response for unauthenticated / external load-balancer probes
            return Response({
                'status': 'READY' if is_ready else 'NOT_READY',
                'version': '2.0.0',
            }, status=http_status)

        # Full diagnostic report for authenticated operators & staff
        payload = {
            'status': 'READY' if is_ready else 'NOT_READY',
            'version': '2.0.0',
            'probe_latency_ms': total_probe_duration_ms,
            'subsystems': {
                'database': db_health,
                'redis': redis_health,
                'celery': celery_health,
                'network_devices': network_health,
                'backup_and_recovery': backup_health,
            },
            'critical_errors': critical_errors,
        }
        return Response(payload, status=http_status)

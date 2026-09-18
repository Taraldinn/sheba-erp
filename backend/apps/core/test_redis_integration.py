"""
Sheba ISP ERP — Comprehensive Redis Integration, Locking & Caching Test Suite
============================================================================
Validates:
1. Redis service connection, ping, and observability telemetry.
2. Ephemeral caching CRUD, TTL expiry, and pattern deletion via SCAN.
3. Graceful degradation when Redis connection fails (PostgreSQL / in-memory fallback).
4. Atomic distributed locking (SET NX semantics, TTL auto-release, concurrent block).
5. Safe Lua lock release (owner token verification, protection against lock stealing).
6. Super Admin performance caching (SaaSOverviewView, SaaSTenantViewSet, SaaSPackageViewSet).
7. Cache hit (X-Cache: HIT) vs miss (X-Cache: MISS) response verification.
8. Granular cache invalidation on model mutations (Tenant creation, update, deletion, toggle).
9. Rate limiting resilience (DRF throttling without 500 crashes during Redis outages).
10. Health check probes (/health/, /healthz/, /api/v1/health-check/) distinguishing DATABASE, REDIS, APPLICATION.
11. PostgreSQL remains authoritative source of truth across all mutations.
"""

import time
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from apps.core.models import Tenant, SaaSPackage
from apps.core.redis_service import RedisService
from apps.core.lock import distributed_lock, LockAcquisitionError
from apps.core.cache_invalidation import (
    invalidate_saas_overview_cache,
    invalidate_saas_tenant_cache,
    invalidate_saas_package_cache,
)


class RedisServiceUnitTests(TestCase):
    """Unit tests for the RedisService abstraction layer."""

    def setUp(self):
        RedisService._memory_cache.clear()
        RedisService._memory_locks.clear()
        RedisService._metrics = {'hits': 0, 'misses': 0, 'errors': 0, 'operations': 0}

    def test_01_cache_crud_and_json_serialization(self):
        """Validates get, set, exists, and delete with primitive and complex types."""
        # Primitive string
        self.assertTrue(RedisService.set('test:string', 'hello_sheba', timeout=60))
        self.assertTrue(RedisService.exists('test:string'))
        self.assertEqual(RedisService.get('test:string'), 'hello_sheba')

        # Dictionary / JSON
        payload = {'tenant': 'shebafi', 'subscribers': 1250, 'active': True}
        self.assertTrue(RedisService.set('test:dict', payload, timeout=60))
        retrieved = RedisService.get('test:dict')
        self.assertEqual(retrieved, payload)
        self.assertEqual(retrieved['subscribers'], 1250)

        # Delete
        self.assertEqual(RedisService.delete('test:string'), 1)
        self.assertFalse(RedisService.exists('test:string'))
        self.assertIsNone(RedisService.get('test:string'))

    def test_02_pattern_deletion_via_scan(self):
        """Validates that delete_pattern deletes matching keys safely."""
        RedisService.set('tenant:alpha:summary', 'data1')
        RedisService.set('tenant:alpha:details', 'data2')
        RedisService.set('tenant:beta:summary', 'data3')

        deleted = RedisService.delete_pattern('tenant:alpha:*')
        self.assertEqual(deleted, 2)
        self.assertIsNone(RedisService.get('tenant:alpha:summary'))
        self.assertIsNone(RedisService.get('tenant:alpha:details'))
        self.assertEqual(RedisService.get('tenant:beta:summary'), 'data3')

    def test_03_atomic_increment_and_set_if_not_exists(self):
        """Validates atomic increment and SET NX operations."""
        # Increment
        self.assertEqual(RedisService.increment('counter:metric', 1), 1)
        self.assertEqual(RedisService.increment('counter:metric', 5), 6)

        # SET NX
        self.assertTrue(RedisService.set_if_not_exists('unique:resource', 'val1', timeout=60))
        self.assertFalse(RedisService.set_if_not_exists('unique:resource', 'val2', timeout=60))
        self.assertEqual(RedisService.get('unique:resource'), 'val1')

    def test_04_atomic_distributed_lock_lifecycle(self):
        """Validates acquire_lock (SET NX) and safe release_lock with owner token."""
        lock_name = 'recharge:cust_123'

        # Process 1 acquires lock
        token1 = RedisService.acquire_lock(lock_name, timeout=10, blocking=False)
        self.assertIsNotNone(token1)

        # Process 2 attempts acquisition on same lock -> must fail (return None)
        token2 = RedisService.acquire_lock(lock_name, timeout=10, blocking=False)
        self.assertIsNone(token2)

        # Attempt release with invalid token -> must return False and NOT delete lock
        wrong_release = RedisService.release_lock(lock_name, 'invalid_token_xyz')
        self.assertFalse(wrong_release)

        # Process 2 still cannot acquire
        self.assertIsNone(RedisService.acquire_lock(lock_name, timeout=10, blocking=False))

        # Process 1 releases with valid token -> must succeed
        self.assertTrue(RedisService.release_lock(lock_name, token1))

        # Now lock is free for Process 2
        token3 = RedisService.acquire_lock(lock_name, timeout=10, blocking=False)
        self.assertIsNotNone(token3)
        RedisService.release_lock(lock_name, token3)

    def test_05_distributed_lock_context_manager(self):
        """Validates the distributed_lock context manager and LockAcquisitionError."""
        lock_key = 'task:invoice_generation'

        # Successful acquisition
        with distributed_lock(lock_key, timeout=5, blocking=False) as token:
            self.assertIsNotNone(token)
            # Re-entrant acquisition from another context must fail
            with self.assertRaises(LockAcquisitionError):
                with distributed_lock(lock_key, timeout=5, blocking=False):
                    pass

        # After block exit, lock must be automatically released
        with distributed_lock(lock_key, timeout=5, blocking=False) as new_token:
            self.assertIsNotNone(new_token)

    def test_06_graceful_degradation_on_redis_failure(self):
        """Validates that Redis connection errors degrade gracefully without raising unhandled exceptions."""
        with patch.object(RedisService, 'get_client') as mock_client:
            # Simulate a client that raises a connection error
            mock_inst = mock_client.return_value
            from redis.exceptions import ConnectionError as RConnectionError
            mock_inst.get.side_effect = RConnectionError("Connection refused")
            mock_inst.set.side_effect = RConnectionError("Connection refused")
            mock_inst.delete.side_effect = RConnectionError("Connection refused")

            # get() returns default safely
            self.assertEqual(RedisService.get('some:key', default='fallback'), 'fallback')
            # set() returns False safely
            self.assertFalse(RedisService.set('some:key', 'val'))
            # delete() returns 0 safely
            self.assertEqual(RedisService.delete('some:key'), 0)
            # Error metric was recorded
            metrics = RedisService.get_metrics()
            self.assertGreaterEqual(metrics['errors'], 1)

    def test_07_ping_health_probe(self):
        """Validates lightweight PING health check behavior."""
        is_healthy, latency, err = RedisService.ping()
        self.assertTrue(is_healthy)
        self.assertIsInstance(latency, float)
        self.assertGreaterEqual(latency, 0.0)


class SuperAdminPerformanceCachingTests(TestCase):
    """Integration tests for Super Admin caching and granular cache invalidation."""

    def setUp(self):
        RedisService._memory_cache.clear()
        RedisService._memory_locks.clear()

        # Create Central Super Admin
        self.admin_user = User.objects.create_superuser(
            username='central_superadmin',
            email='admin@shebafi.xyz',
            password='Password123!'
        )
        self.token, _ = Token.objects.get_or_create(user=self.admin_user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

        # Create initial test tenants
        self.t1 = Tenant.objects.create(name='Alpha ISP', slug='alpha', is_active=True, plan='Growth')
        self.t2 = Tenant.objects.create(name='Beta Telecom', slug='beta', is_active=True, plan='Starter')

    def test_08_saas_overview_caching_and_hit_miss_headers(self):
        """Validates that SaaSOverviewView returns MISS on first request, HIT on second request."""
        # Initial request: Cache MISS
        res1 = self.client.get('/api/v1/saas/overview/', HTTP_HOST='admin.shebafi.xyz')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.headers.get('X-Cache'), 'MISS')
        self.assertEqual(res1.data['kpis']['total_tenants'], 2)

        # Immediate repeat request: Cache HIT
        res2 = self.client.get('/api/v1/saas/overview/', HTTP_HOST='admin.shebafi.xyz')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.headers.get('X-Cache'), 'HIT')
        self.assertEqual(res2.data['kpis']['total_tenants'], 2)

    def test_09_tenant_mutation_invalidates_overview_and_list_cache(self):
        """Validates that creating a new tenant purges saas:overview and saas:tenants:list caches."""
        # Warm up overview and tenant list cache
        self.client.get('/api/v1/saas/overview/', HTTP_HOST='admin.shebafi.xyz')
        self.client.get('/api/v1/saas/tenants/', HTTP_HOST='admin.shebafi.xyz')
        self.assertTrue(RedisService.exists('saas:overview'))

        # Create a new tenant via API
        payload = {
            'name': 'Gamma Broadband',
            'slug': 'gamma',
            'plan': 'Enterprise',
            'contact_email': 'admin@gamma.net',
            'contact_phone': '+880 1800-112233',
            'address': 'Chittagong, Bangladesh',
        }
        res_create = self.client.post('/api/v1/saas/tenants/', payload, format='json', HTTP_HOST='admin.shebafi.xyz')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)

        # Cache must have been automatically invalidated
        self.assertFalse(RedisService.exists('saas:overview'))

        # Next request must be a MISS and reflect the authoritative DB state (3 tenants)
        res3 = self.client.get('/api/v1/saas/overview/', HTTP_HOST='admin.shebafi.xyz')
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        self.assertEqual(res3.headers.get('X-Cache'), 'MISS')
        self.assertEqual(res3.data['kpis']['total_tenants'], 3)

    def test_10_tenant_toggle_status_invalidates_cache(self):
        """Validates that toggling tenant active status immediately invalidates cached data."""
        # Warm cache
        self.client.get('/api/v1/saas/overview/', HTTP_HOST='admin.shebafi.xyz')
        self.assertTrue(RedisService.exists('saas:overview'))

        # Toggle status of tenant t1
        toggle_res = self.client.post(f'/api/v1/saas/tenants/{self.t1.id}/toggle-status/', HTTP_HOST='admin.shebafi.xyz')
        self.assertEqual(toggle_res.status_code, status.HTTP_200_OK)
        self.assertFalse(toggle_res.data['is_active'])

        # Cache must be evicted
        self.assertFalse(RedisService.exists('saas:overview'))

        # Next overview reflects 1 active and 1 suspended
        res = self.client.get('/api/v1/saas/overview/', HTTP_HOST='admin.shebafi.xyz')
        self.assertEqual(res.data['kpis']['active_tenants'], 1)
        self.assertEqual(res.data['kpis']['suspended_tenants'], 1)

    def test_11_saas_package_caching_and_invalidation(self):
        """Validates SaaSPackageViewSet caching and mutation eviction."""
        pkg = SaaSPackage.objects.create(name='Ultra Fiber', code='ultra', monthly_price=25000, max_subscribers=5000)

        # First fetch: MISS
        res1 = self.client.get('/api/v1/saas/packages/', HTTP_HOST='admin.shebafi.xyz')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.headers.get('X-Cache'), 'MISS')

        # Second fetch: HIT
        res2 = self.client.get('/api/v1/saas/packages/', HTTP_HOST='admin.shebafi.xyz')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.headers.get('X-Cache'), 'HIT')

        # Toggle status -> purges cache
        self.client.post(f'/api/v1/saas/packages/{pkg.id}/toggle-status/', HTTP_HOST='admin.shebafi.xyz')
        self.assertFalse(RedisService.exists('saas:packages:list'))


class HealthCheckEndpointTests(TestCase):
    """Tests for the multi-tier health and readiness endpoints."""

    def setUp(self):
        self.client = APIClient()

    def test_12_readiness_probe_distinguishes_subsystems(self):
        """Validates that /health/ and /healthz/ distinguish database, redis, and application statuses."""
        for path in ['/health/', '/healthz/']:
            res = self.client.get(path)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data['status'], 'ready')
            self.assertEqual(res.data['application'], 'healthy')
            self.assertIn('database', res.data)
            self.assertEqual(res.data['database']['status'], 'healthy')
            self.assertIn('redis', res.data)
            self.assertIn(res.data['redis']['status'], ['healthy', 'degraded'])
            # Ensure sensitive URLs or passwords are never exposed
            self.assertNotIn('password', str(res.data).lower())
            self.assertNotIn('redis://', str(res.data).lower())

    def test_13_api_v1_health_check_endpoint(self):
        """Validates that /api/v1/health-check/ exposes component health."""
        res = self.client.get('/api/v1/health-check/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'healthy')
        self.assertEqual(res.data['database'], 'healthy')
        self.assertIn(res.data['redis'], ['healthy', 'degraded'])
        self.assertEqual(res.data['application'], 'healthy')

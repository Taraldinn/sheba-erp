"""
Sheba ISP ERP — Redis Application Service & Infrastructure Abstraction
======================================================================
Provides a centralized, production-grade interface for:
- Ephemeral caching with JSON serialization/deserialization
- Safe pattern invalidation via SCAN (avoids KEYS blocking)
- Atomic distributed locking (SET NX + Lua release script)
- Rate limiting primitives (atomic increment, TTL)
- High-resolution health check (lightweight PING probe)
- Hit/miss/error telemetry and observability
- Resilient graceful degradation (PostgreSQL and in-memory fallbacks)
"""

import json
import time
import uuid
import logging
from typing import Any, Optional, Tuple, Dict
from django.conf import settings

logger = logging.getLogger(__name__)

try:
    import redis
    from redis.exceptions import RedisError, ConnectionError as RedisConnectionError, TimeoutError as RedisTimeoutError
except ImportError:
    redis = None
    RedisError = Exception
    RedisConnectionError = Exception
    RedisTimeoutError = Exception


# Lua script for atomic, safe distributed lock release.
# Guarantees that a process only releases its own lock and cannot delete a lock
# that expired and was re-acquired by another process.
LUA_RELEASE_LOCK = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


class RedisService:
    """
    Authoritative Redis Service facade for Sheba ERP.
    Handles all communication with Redis clusters or standalone instances.
    Guarantees that temporary Redis outages never crash business logic.
    """

    _client: Optional[Any] = None
    _connection_pool: Optional[Any] = None
    _lua_release_script: Optional[Any] = None
    _metrics = {
        'hits': 0,
        'misses': 0,
        'errors': 0,
        'operations': 0,
    }

    # In-memory storage fallback for local development or when Redis is absent/in-test
    _memory_cache: Dict[str, Tuple[Any, Optional[float]]] = {}
    _memory_locks: Dict[str, Tuple[str, float]] = {}

    @classmethod
    def get_client(cls) -> Optional[Any]:
        """
        Retrieves or initializes the thread-safe Redis client connection.
        Returns None if Redis is disabled or the redis library is not installed.
        """
        redis_url = getattr(settings, 'REDIS_URL', '')
        if not redis_url or redis is None or redis_url.startswith('memory://'):
            return None

        if cls._client is None:
            try:
                # Configure robust connection pool with aggressive timeouts
                cls._connection_pool = redis.ConnectionPool.from_url(
                    redis_url,
                    socket_connect_timeout=1.0,
                    socket_timeout=1.0,
                    retry_on_timeout=True,
                    health_check_interval=30,
                    decode_responses=True,  # Automatically return strings instead of bytes
                )
                client = redis.Redis(connection_pool=cls._connection_pool)
                # Register the atomic Lua lock script
                cls._lua_release_script = client.register_script(LUA_RELEASE_LOCK)
                cls._client = client
            except Exception as e:
                logger.warning("RedisService: Failed to initialize Redis connection pool: %s", e)
                cls._client = None

        return cls._client

    @classmethod
    def reset_client(cls) -> None:
        """Forces re-initialization of the Redis client (useful in tests)."""
        cls._client = None
        cls._connection_pool = None
        cls._lua_release_script = None

    # ─────────────────────────────────────────────────────────────────────────
    # CACHING OPERATIONS
    # ─────────────────────────────────────────────────────────────────────────

    @classmethod
    def get(cls, key: str, default: Any = None) -> Any:
        """
        Retrieves an item from Redis.
        Automatically deserializes JSON values if applicable.
        Falls back to default on cache miss or Redis connection failure.
        """
        cls._metrics['operations'] += 1
        client = cls.get_client()

        if client is None:
            # In-memory fallback
            val_tuple = cls._memory_cache.get(key)
            if val_tuple:
                val, expires_at = val_tuple
                if expires_at is None or expires_at > time.time():
                    cls._metrics['hits'] += 1
                    return val
                else:
                    cls._memory_cache.pop(key, None)
            cls._metrics['misses'] += 1
            return default

        try:
            raw = client.get(key)
            if raw is None:
                cls._metrics['misses'] += 1
                return default

            cls._metrics['hits'] += 1
            # Attempt JSON decode
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return raw
        except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
            cls._metrics['errors'] += 1
            logger.warning("RedisService.get failure on key '%s': %s", key, exc)
            return default

    @classmethod
    def set(cls, key: str, value: Any, timeout: Optional[int] = None) -> bool:
        """
        Stores an item in Redis with an optional TTL (in seconds).
        Serializes dicts, lists, and booleans to JSON automatically.
        """
        cls._metrics['operations'] += 1
        client = cls.get_client()

        # Serialize complex types to JSON
        if isinstance(value, (dict, list, tuple, bool)):
            payload = json.dumps(value)
        else:
            payload = str(value)

        if client is None:
            expires_at = (time.time() + timeout) if timeout else None
            cls._memory_cache[key] = (value, expires_at)
            return True

        try:
            if timeout:
                return bool(client.setex(key, timeout, payload))
            else:
                return bool(client.set(key, payload))
        except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
            cls._metrics['errors'] += 1
            logger.warning("RedisService.set failure on key '%s': %s", key, exc)
            # Ephemeral write failure degrades safely (caller relies on PostgreSQL)
            return False

    @classmethod
    def delete(cls, key: str) -> int:
        """Deletes a single key from Redis. Returns count of deleted keys."""
        cls._metrics['operations'] += 1
        client = cls.get_client()

        if client is None:
            return 1 if cls._memory_cache.pop(key, None) is not None else 0

        try:
            return int(client.delete(key))
        except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
            cls._metrics['errors'] += 1
            logger.warning("RedisService.delete failure on key '%s': %s", key, exc)
            return 0

    @classmethod
    def delete_pattern(cls, pattern: str) -> int:
        """
        Deletes all keys matching the glob pattern using non-blocking SCAN.
        Never calls KEYS to avoid blocking the Redis server event loop.
        """
        cls._metrics['operations'] += 1
        client = cls.get_client()

        if client is None:
            # In-memory pattern delete
            import fnmatch
            to_delete = [k for k in cls._memory_cache.keys() if fnmatch.fnmatch(k, pattern)]
            for k in to_delete:
                cls._memory_cache.pop(k, None)
            return len(to_delete)

        try:
            deleted_count = 0
            keys_batch = []
            # SCAN in batches of 100
            for k in client.scan_iter(match=pattern, count=100):
                keys_batch.append(k)
                if len(keys_batch) >= 100:
                    deleted_count += client.delete(*keys_batch)
                    keys_batch = []

            if keys_batch:
                deleted_count += client.delete(*keys_batch)

            return deleted_count
        except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
            cls._metrics['errors'] += 1
            logger.warning("RedisService.delete_pattern failure on pattern '%s': %s", pattern, exc)
            return 0

    @classmethod
    def exists(cls, key: str) -> bool:
        """Checks if a key exists in Redis."""
        cls._metrics['operations'] += 1
        client = cls.get_client()

        if client is None:
            val_tuple = cls._memory_cache.get(key)
            if val_tuple:
                _, expires_at = val_tuple
                if expires_at is None or expires_at > time.time():
                    return True
                cls._memory_cache.pop(key, None)
            return False

        try:
            return bool(client.exists(key))
        except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
            cls._metrics['errors'] += 1
            logger.warning("RedisService.exists failure on key '%s': %s", key, exc)
            return False

    @classmethod
    def expire(cls, key: str, timeout: int) -> bool:
        """Sets or updates the TTL of a key in seconds."""
        cls._metrics['operations'] += 1
        client = cls.get_client()

        if client is None:
            val_tuple = cls._memory_cache.get(key)
            if val_tuple:
                val, _ = val_tuple
                cls._memory_cache[key] = (val, time.time() + timeout)
                return True
            return False

        try:
            return bool(client.expire(key, timeout))
        except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
            cls._metrics['errors'] += 1
            logger.warning("RedisService.expire failure on key '%s': %s", key, exc)
            return False

    @classmethod
    def increment(cls, key: str, amount: int = 1) -> int:
        """
        Atomically increments a counter in Redis by amount.
        Useful for distributed rate limiting and metrics counters.
        """
        cls._metrics['operations'] += 1
        client = cls.get_client()

        if client is None:
            val_tuple = cls._memory_cache.get(key)
            current_val = 0
            if val_tuple:
                try:
                    current_val = int(val_tuple[0])
                except (ValueError, TypeError):
                    current_val = 0
            new_val = current_val + amount
            cls._memory_cache[key] = (new_val, val_tuple[1] if val_tuple else None)
            return new_val

        try:
            return int(client.incrby(key, amount))
        except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
            cls._metrics['errors'] += 1
            logger.warning("RedisService.increment failure on key '%s': %s", key, exc)
            return 1

    @classmethod
    def set_if_not_exists(cls, key: str, value: Any, timeout: Optional[int] = None) -> bool:
        """
        Sets a key with SET NX semantics (only if it does not already exist).
        Returns True if the key was set, False if it already existed or failed.
        """
        cls._metrics['operations'] += 1
        client = cls.get_client()
        payload = json.dumps(value) if isinstance(value, (dict, list, tuple, bool)) else str(value)

        if client is None:
            val_tuple = cls._memory_cache.get(key)
            if val_tuple:
                _, expires_at = val_tuple
                if expires_at is None or expires_at > time.time():
                    return False
            expires_at = (time.time() + timeout) if timeout else None
            cls._memory_cache[key] = (value, expires_at)
            return True

        try:
            return bool(client.set(key, payload, nx=True, ex=timeout))
        except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
            cls._metrics['errors'] += 1
            logger.warning("RedisService.set_if_not_exists failure on key '%s': %s", key, exc)
            return False

    # ─────────────────────────────────────────────────────────────────────────
    # DISTRIBUTED LOCKING (SET NX + LUA RELEASE)
    # ─────────────────────────────────────────────────────────────────────────

    @classmethod
    def acquire_lock(
        cls,
        lock_name: str,
        timeout: int = 30,
        blocking: bool = True,
        blocking_timeout: float = 5.0
    ) -> Optional[str]:
        """
        Acquires a distributed lock using SET NX semantics with a unique owner token.
        
        Args:
            lock_name: Identification string for the lock (e.g. 'lock:recharge:tenant_id:customer_id')
            timeout: Maximum TTL in seconds before automatic auto-release
            blocking: Whether to poll and wait for the lock if currently held
            blocking_timeout: Max seconds to wait when blocking=True

        Returns:
            A unique owner token (str) if acquired successfully; None if lock acquisition failed.
        """
        full_key = f"sheba:lock:{lock_name}"
        owner_token = f"token_{uuid.uuid4().hex}"
        start_time = time.time()
        client = cls.get_client()

        # In-memory lock fallback when Redis is absent
        if client is None:
            while True:
                now = time.time()
                existing = cls._memory_locks.get(full_key)
                if existing is None or existing[1] <= now:
                    cls._memory_locks[full_key] = (owner_token, now + timeout)
                    return owner_token

                if not blocking or (time.time() - start_time) >= blocking_timeout:
                    return None

                time.sleep(0.05)

        # Redis-backed distributed lock
        while True:
            try:
                acquired = client.set(full_key, owner_token, nx=True, ex=timeout)
                if acquired:
                    return owner_token
            except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
                cls._metrics['errors'] += 1
                logger.warning("RedisService: Lock acquisition error on '%s': %s", lock_name, exc)
                return None

            if not blocking:
                return None

            if (time.time() - start_time) >= blocking_timeout:
                return None

            time.sleep(0.05)

    @classmethod
    def release_lock(cls, lock_name: str, owner_token: str) -> bool:
        """
        Safely releases a distributed lock using an atomic Lua script.
        Guarantees that the lock is ONLY removed if the current stored value
        matches the provided owner_token.
        """
        if not owner_token:
            return False

        full_key = f"sheba:lock:{lock_name}"
        client = cls.get_client()

        if client is None:
            existing = cls._memory_locks.get(full_key)
            if existing and existing[0] == owner_token:
                cls._memory_locks.pop(full_key, None)
                return True
            return False

        try:
            if cls._lua_release_script:
                result = cls._lua_release_script(keys=[full_key], args=[owner_token])
            else:
                result = client.eval(LUA_RELEASE_LOCK, 1, full_key, owner_token)
            return bool(result)
        except (RedisError, RedisConnectionError, RedisTimeoutError, OSError) as exc:
            cls._metrics['errors'] += 1
            logger.warning("RedisService: Lock release error on '%s': %s", lock_name, exc)
            return False

    # ─────────────────────────────────────────────────────────────────────────
    # HEALTH CHECK & OBSERVABILITY
    # ─────────────────────────────────────────────────────────────────────────

    @classmethod
    def ping(cls) -> Tuple[bool, float, Optional[str]]:
        """
        Performs a lightweight PING probe against Redis.
        Returns:
            Tuple of (is_healthy, latency_ms, error_message)
        """
        client = cls.get_client()
        if client is None:
            redis_url = getattr(settings, 'REDIS_URL', '')
            if not redis_url:
                return True, 0.0, "Redis is not configured (running in local in-memory fallback)"
            return False, 0.0, "Redis client could not be initialized"

        start = time.time()
        try:
            res = client.ping()
            latency = round((time.time() - start) * 1000, 2)
            if res:
                return True, latency, None
            return False, latency, "PING did not return PONG"
        except Exception as exc:
            latency = round((time.time() - start) * 1000, 2)
            cls._metrics['errors'] += 1
            return False, latency, str(exc)

    @classmethod
    def get_metrics(cls) -> Dict[str, Any]:
        """Returns internal telemetry metrics for observability."""
        total_cache_lookups = cls._metrics['hits'] + cls._metrics['misses']
        hit_ratio = round((cls._metrics['hits'] / total_cache_lookups) * 100, 1) if total_cache_lookups > 0 else 0.0
        return {
            'hits': cls._metrics['hits'],
            'misses': cls._metrics['misses'],
            'errors': cls._metrics['errors'],
            'operations': cls._metrics['operations'],
            'hit_ratio': hit_ratio,
        }

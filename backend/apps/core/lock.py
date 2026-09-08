"""
Distributed Locking Infrastructure (Stage 4).
============================================
Provides distributed locking across Celery workers and HTTP processes.
Uses Redis locks when available; falls back to an in-process thread-safe
lock registry when Redis is unreachable or during unit tests.

Usage:
    from apps.core.lock import distributed_lock, LockAcquisitionError

    try:
        with distributed_lock(f"lock:recharge:{tenant_id}:{customer_id}", timeout=15):
            # critical section
            ...
    except LockAcquisitionError:
        # handle duplicate / concurrent operation
        ...
"""

import time
import logging
import threading
from contextlib import contextmanager
from django.conf import settings

logger = logging.getLogger(__name__)


class LockAcquisitionError(Exception):
    """Raised when a distributed lock cannot be acquired."""
    pass


# Thread-safe in-memory fallback lock registry for test / standalone environments
_in_memory_locks = {}
_in_memory_registry_lock = threading.Lock()


@contextmanager
def distributed_lock(lock_key: str, timeout: int = 30, blocking: bool = True, blocking_timeout: float = 5.0):
    """
    Context manager that acquires a lock for `lock_key`.

    Args:
        lock_key: Unique lock identifier (e.g. 'lock:recharge:tenant_id:customer_id')
        timeout: Expiration time in seconds for the lock (auto-releases if process dies)
        blocking: Whether to wait for the lock if held
        blocking_timeout: Maximum time in seconds to wait if blocking=True

    Raises:
        LockAcquisitionError: If the lock could not be acquired within the timeout.
    """
    # 1. Attempt Redis Lock if configured and not in eager memory test mode
    redis_url = getattr(settings, 'REDIS_URL', '')
    is_eager = getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False)
    redis_lock_obj = None

    if redis_url and not is_eager and not redis_url.startswith('memory://'):
        try:
            import redis
            client = redis.Redis.from_url(redis_url, socket_connect_timeout=1.0)
            redis_lock_obj = client.lock(
                name=f"sheba:{lock_key}",
                timeout=timeout,
                blocking=blocking,
                blocking_timeout=blocking_timeout if blocking else None
            )
            acquired = redis_lock_obj.acquire()
            if not acquired:
                raise LockAcquisitionError(f"Could not acquire Redis lock for '{lock_key}' within {blocking_timeout}s")
        except (redis.ConnectionError, redis.TimeoutError) as exc:
            logger.debug("Redis unavailable for lock '%s', falling back to in-memory lock: %s", lock_key, exc)
            redis_lock_obj = None
        except LockAcquisitionError:
            raise
        except Exception as exc:
            logger.warning("Redis lock error on '%s': %s", lock_key, exc)
            redis_lock_obj = None

    # 2. In-memory fallback if Redis is unavailable or in eager test mode
    acquired_memory_lock = False
    if redis_lock_obj is None:
        start_time = time.time()
        while True:
            with _in_memory_registry_lock:
                current_time = time.time()
                # Check if lock exists and is not expired
                lock_info = _in_memory_locks.get(lock_key)
                if lock_info is None or lock_info['expires_at'] <= current_time:
                    _in_memory_locks[lock_key] = {
                        'expires_at': current_time + timeout,
                        'thread_id': threading.get_ident()
                    }
                    acquired_memory_lock = True
                    break

            if not blocking:
                raise LockAcquisitionError(f"Lock '{lock_key}' already held (non-blocking).")

            if (time.time() - start_time) >= blocking_timeout:
                raise LockAcquisitionError(f"Timed out waiting for in-memory lock '{lock_key}' after {blocking_timeout}s.")

            time.sleep(0.05)

    try:
        yield
    finally:
        if redis_lock_obj is not None:
            try:
                redis_lock_obj.release()
            except Exception as exc:
                logger.debug("Redis lock release warning for '%s': %s", lock_key, exc)

        if acquired_memory_lock:
            with _in_memory_registry_lock:
                _in_memory_locks.pop(lock_key, None)

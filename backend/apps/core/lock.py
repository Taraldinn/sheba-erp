"""
Distributed Locking Infrastructure (Stage 4 & Stage 10 Hardened).
================================================================
Provides distributed locking across Celery workers and HTTP processes.
Uses Redis locks with SET NX and atomic Lua script release via RedisService;
falls back to thread-safe in-process lock registry when Redis is unreachable
or during standalone unit tests.

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

import logging
from contextlib import contextmanager
from apps.core.redis_service import RedisService

logger = logging.getLogger(__name__)


class LockAcquisitionError(Exception):
    """Raised when a distributed lock cannot be acquired."""
    pass


@contextmanager
def distributed_lock(lock_key: str, timeout: int = 30, blocking: bool = True, blocking_timeout: float = 5.0):
    """
    Context manager that acquires a distributed lock for `lock_key`.

    Args:
        lock_key: Unique lock identifier (e.g. 'lock:recharge:tenant_id:customer_id')
        timeout: Expiration time in seconds for the lock (auto-releases if process dies)
        blocking: Whether to wait for the lock if held
        blocking_timeout: Maximum time in seconds to wait if blocking=True

    Raises:
        LockAcquisitionError: If the lock could not be acquired within the timeout.
    """
    owner_token = RedisService.acquire_lock(
        lock_name=lock_key,
        timeout=timeout,
        blocking=blocking,
        blocking_timeout=blocking_timeout
    )

    if not owner_token:
        if not blocking:
            raise LockAcquisitionError(f"Lock '{lock_key}' already held (non-blocking).")
        raise LockAcquisitionError(f"Could not acquire distributed lock for '{lock_key}' within {blocking_timeout}s")

    try:
        yield owner_token
    finally:
        RedisService.release_lock(lock_key, owner_token)

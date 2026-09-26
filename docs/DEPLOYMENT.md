# Sheba ISP ERP — Production Deployment Guide
=============================================

This document specifies the production architecture, service topology, and deployment requirements for **Sheba ISP ERP & SaaS Control Plane**.

---

## 1. Production Topology Overview

The system runs as decoupled services connected via a high-performance network:

```
                          Internet / Clients
                                  │
                                  ▼
                   [ Reverse Proxy / Load Balancer ]
                           (Nginx / Traefik)
                                  │
         ┌────────────────────────┴────────────────────────┐
         │                                                 │
         ▼                                                 ▼
   [ web (Gunicorn) ]                             [ External Frontends ]
   Port: 8000                                     (Tenant ISP Portals)
   API & SaaS Control Plane                                │
         │                                                 │
         ├───────────────────────┬─────────────────────────┘
         │                       │
         ▼                       ▼
  [ PostgreSQL 16+ ]       [ Redis 7+ ]
  Shared DB                Broker, Locks, & Cache
         ▲                       ▲
         │                       │
   ┌─────┴───────────────┬───────┴─────────────────┐
   │                     │                         │
   ▼                     ▼                         ▼
[ worker-default ]  [ worker-network ]      [ celery-beat ]
Billing & General   Hardware MikroTik/OLT   Singleton Scheduler
```

The four core application runtime components are:
1. **`web`**: Synchronous HTTP/REST API processes served by Gunicorn.
2. **`worker`**: Celery asynchronous execution daemon(s) with segregated queue pools.
3. **`beat`**: Singleton Celery periodic task scheduler.
4. **`redis`**: Message broker, distributed lock coordinator, and high-speed cache.

---

## 2. Service 1: `web`

### Role
Handles incoming HTTP traffic, tenant domain identification via middleware, RBAC enforcement, REST API endpoints, customer portal views, and synchronous database transactions.

### Process Command
```bash
gunicorn sheba_core.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers ${WEB_CONCURRENCY:-4} \
    --worker-class gthread \
    --threads 4 \
    --timeout 60 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile -
```

### Configuration & Guidelines
* **Worker Sizing**: Recommended formula: `(2 x CPU_CORES) + 1` worker processes, each with 2–4 threads.
* **Non-Root Execution**: Runs strictly as non-privileged `appuser` (UID 1001).
* **Reverse Proxy Trust**:
  * Set `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')`
  * Set `USE_X_FORWARDED_HOST = True`
* **Static Assets**: Handled by Whitenoise (`CompressedManifestStaticFilesStorage`) or offloaded to Cloudflare/S3.
* **Healthcheck**: Probe `http://localhost:8000/healthz/` returns HTTP 200 with database and Redis ping status.

---

## 3. Service 2: `worker`

### Role
Executes long-running, asynchronous, and hardware I/O jobs outside the web request cycle:
* Network synchronization against physical MikroTik routers and GPON/EPON OLTs.
* Billing generation and double-entry ledger settlement.
* Webhook ingestion matching and asynchronous customer recharge.
* SMS notifications and transactional email dispatch.

### Queue Architecture & Routing

Tasks are strictly partitioned into three specialized queues to prevent slow network hardware sockets from blocking customer financial transactions:

| Queue | Tasks Consumed | Characteristics |
| :--- | :--- | :--- |
| `network` | `apps.network.tasks.*`, `sync_router`, `sync_olt`, `collect_corporate_telemetry` | High latency (device ping, SSH/API sockets), strict timeouts (90–180s) |
| `billing` | `generate_monthly_invoices`, `expire_customers`, `process_payment_event`, `reconcile_payments`, `corporate_invoices` | Transactional financial logic, ACID row locking, strict idempotency |
| `default` | `send_sms`, `retry_sms`, `send_transactional_email_task`, `emit_platform_audit_event`, `enforce_subscription_lifecycle` | Fast fire-and-forget messaging and control-plane auditing |

### Process Commands

#### Option A: Unified Worker (Small/Medium Deployments)
Consumes all queues in priority order:
```bash
celery -A sheba_core worker \
    --loglevel=info \
    --concurrency=${CELERY_WORKER_CONCURRENCY:-4} \
    --queues=billing,network,default \
    --max-tasks-per-child=1000 \
    --max-memory-per-child=250000
```

#### Option B: Segregated Worker Pools (Large / High-Throughput ISP Deployments)
Deploy dedicated container replicas for specific workloads:
```bash
# 1. Hardware & Network Worker Pool (isolated from billing)
celery -A sheba_core worker -l INFO -c 8 -Q network -n worker_net@%h

# 2. Billing & Financial Worker Pool
celery -A sheba_core worker -l INFO -c 4 -Q billing -n worker_bill@%h

# 3. Notification & Audit Worker Pool
celery -A sheba_core worker -l INFO -c 2 -Q default -n worker_default@%h
```

### Reliability & Worker Protection Flags
* **`CELERY_TASK_ACKS_LATE = True`**: Tasks are acknowledged **only after** completion. If a worker is terminated midway, the unacknowledged task is returned to the queue.
* **`CELERY_TASK_REJECT_ON_WORKER_LOST = True`**: Automatically requeues tasks if a child process terminates unexpectedly (e.g. OOM killer).
* **`CELERY_WORKER_PREFETCH_MULTIPLIER = 1`**: Disables aggressive prefetching. Each worker process takes one task at a time, preventing task hoarding and queue starvation.
* **`--max-tasks-per-child = 1000`**: Recycles worker processes after 1,000 tasks to reclaim memory and eliminate Python garbage collection bloat.
* **`--max-memory-per-child = 250000`**: Automatically recycles child processes exceeding 250MB resident memory.
* **Timeouts**: Soft time limit of 25 minutes (`CELERY_TASK_SOFT_TIME_LIMIT = 1500`), hard limit of 30 minutes (`CELERY_TASK_TIME_LIMIT = 1800`). Network-specific tasks enforce granular timeouts (60–120s).

---

## 4. Service 3: `beat`

### Role
The periodic scheduler triggering recurring maintenance, billing, customer expiration, and monitoring jobs according to defined cron expressions.

### CRITICAL INVARIANT: SINGLETON INSTANCE
> [!CAUTION]
> **Exactly ONE instance of `celery-beat` must run across the entire cluster.**
> Never scale the `celery-beat` container to multiple replicas. Scaling beat causes duplicate cron ticks and triggers duplicate task dispatches.

### Process Command
```bash
celery -A sheba_core beat \
    --loglevel=info \
    --schedule=/app/media/celerybeat-schedule.db
```

### Persistent Schedule Storage
The schedule database file (`/app/media/celerybeat-schedule.db`) MUST be mounted to a persistent volume (`backend_media:/app/media`). This ensures that last-run timestamps survive container restarts and preventing missed or burst schedules on boot.

### Configured Recurring Schedules (`CELERY_BEAT_SCHEDULE`)

| Task Name | Cron Schedule | Task Path | Lock Key & Deduplication |
| :--- | :--- | :--- | :--- |
| `expire_customers_daily` | Daily at 00:00 | `apps.core.tasks.expire_customers` | `lock:expiry:{tenant_id}`, filters `status=ACTIVE` |
| `enforce_subscription_lifecycle_daily` | Daily at 00:30 | `apps.core.tasks.enforce_subscription_lifecycle` | `lock:subscription_lifecycle`, atomic update |
| `generate_monthly_invoices_monthly` | 1st of month at 01:00 | `apps.core.tasks.generate_monthly_invoices` | `lock:invoice_gen:{tenant_id}`, DB unique constraint |
| `generate_monthly_corporate_invoices_monthly` | 1st of month at 02:00 | `apps.corporate.tasks.generate_monthly_corporate_invoices` | `lock:corp_invoices:{tenant_id}`, status check |
| `reconcile_payments_hourly` | Hourly at minute 30 | `apps.core.tasks.reconcile_payments` | `lock:reconcile:{tenant_id}`, filters `is_matched=False` |
| `collect_corporate_telemetry_every_5m` | Every 5 minutes (`*/5`) | `apps.corporate.tasks.collect_corporate_telemetry` | `lock:corp_telemetry:{tenant_id}`, discrete 5m bucket check |

---

## 5. Service 4: `redis`

### Role
Redis acts as:
1. Celery task message broker.
2. Celery task result backend (with 1-hour expiration).
3. Distributed lock manager (via `redis-py` redlock pattern).
4. High-performance cache for user sessions, tenant domain lookups, and API key verification.

### Redis Configuration Best Practices

#### 1. Eviction Policy (CRITICAL)
In `redis.conf`:
```ini
# For dedicated Celery Redis:
maxmemory 512mb
maxmemory-policy noeviction
```
> [!IMPORTANT]
> If Redis is used as the Celery broker, `maxmemory-policy` must NEVER be set to `allkeys-lru` or `volatile-lru` on the broker DB, as Redis would evict unconsumed Celery queue messages when memory fills up. Use `noeviction`.

#### 2. Connection Parameters & Timeouts
```ini
timeout 300
tcp-keepalive 60
tcp-backlog 511
maxclients 10000
```

#### 3. Security Hardening
* Set a strong password with `requirepass <REDIS_PASSWORD>`.
* Bind strictly to localhost or private container network: `bind 127.0.0.1` or internal Docker network.
* For cloud deployments (e.g. AWS ElastiCache, Upstash, DigitalOcean Managed Redis), use TLS connections (`rediss://...`).

---

## 6. Tenant Isolation & Security Invariants in Background Processing

1. **Explicit Tenant Context**: Every tenant-scoped background task strictly accepts and requires explicit `tenant_id`.
2. **Zero Dependency on Web Request Context**: Celery workers execute outside the web request cycle; tasks NEVER inspect `request.tenant` or thread-local storage.
3. **Zero Plaintext Secrets in Task Payloads**:
   * Task payloads passed through Redis contain ONLY UUIDs and business state parameters (`tenant_id`, `job_id`, `router_id`, `amount`, `action`).
   * Plaintext passwords, MikroTik credentials, OLT API secrets, and payment tokens are **strictly forbidden** in Celery payloads, args, kwargs, and logging messages.
   * Devices and gateways are retrieved securely from the database within the task, and secrets are decrypted in-memory using `FIELD_ENCRYPTION_KEY`.
4. **`FIELD_ENCRYPTION_KEY` Availability**: The symmetric encryption key MUST be supplied to the `worker` container so it can decrypt device credentials during hardware provisioning.

---

## 7. Docker Compose Production Reference

Below is the verified multi-service specification from `backend/docker-compose.yml`:

```yaml
version: '3.8'

services:
  # ── 1. Web Application ──
  web:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: sheba-backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - DEBUG=False
      - SECRET_KEY=${SECRET_KEY:?Required}
      - ALLOWED_HOSTS=${ALLOWED_HOSTS:-localhost,127.0.0.1}
      - DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
      - FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY:?Required}
      - WEB_CONCURRENCY=4
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    volumes:
      - backend_media:/app/media
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz/"]
      interval: 30s
      timeout: 5s
      retries: 3

  # ── 2. Celery Worker ──
  celery-worker:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: sheba-celery-worker
    restart: unless-stopped
    command: celery -A sheba_core worker --loglevel=info --concurrency=${CELERY_WORKER_CONCURRENCY:-4} --queues=billing,network,default
    environment:
      - DEBUG=False
      - SECRET_KEY=${SECRET_KEY:?Required}
      - ALLOWED_HOSTS=${ALLOWED_HOSTS:-localhost,127.0.0.1}
      - DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
      - FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY:?Required}
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    volumes:
      - backend_media:/app/media
    healthcheck:
      test: ["CMD", "celery", "-A", "sheba_core", "inspect", "ping", "--timeout", "5"]
      interval: 60s
      timeout: 10s
      retries: 3

  # ── 3. Celery Beat Scheduler (Singleton) ──
  celery-beat:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: sheba-celery-beat
    restart: unless-stopped
    command: celery -A sheba_core beat --loglevel=info --schedule=/app/media/celerybeat-schedule.db
    environment:
      - DEBUG=False
      - SECRET_KEY=${SECRET_KEY:?Required}
      - DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
      - FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY:?Required}
    depends_on:
      postgres:      { condition: service_healthy }
      redis:         { condition: service_healthy }
      celery-worker: { condition: service_started }
    volumes:
      - backend_media:/app/media

  # ── 4. Redis ──
  redis:
    image: redis:7-alpine
    container_name: sheba-redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 512mb
      --maxmemory-policy noeviction
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  backend_media:
  redis_data:
```

---

## 8. Operational Verification Runbook

### Verify Redis Connectivity
```bash
redis-cli -u redis://:your_password@localhost:6379/0 ping
# Expected response: PONG
```

### Inspect Worker Queues & Active Workers
```bash
celery -A sheba_core inspect active_queues
# Expected output: lists default, network, billing for each registered worker
```

### Verify Registered Celery Tasks
```bash
celery -A sheba_core inspect registered
# Expected output: lists all 30 production tasks
```

### Ping Celery Worker Health
```bash
celery -A sheba_core inspect ping --timeout 5
# Expected output: -> celery@hostname: OK
```

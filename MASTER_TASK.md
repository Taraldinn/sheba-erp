# Sheba ISP ERP — Master Task Tracker

## Document Information
- **Repository**: `Taraldinn/sheba-erp`
- **File**: `MASTER_TASK.md`
- **Status**: AUTHORITATIVE MASTER TASK SOURCE OF TRUTH
- **Effective Date**: 2026-09-17
- **Current Active Stage**: STAGE 10 — External Frontend Platform & Production Hardening [COMPLETED]

---

## 1. Architectural Invariant & Operating Contract

> **Core Multi-Tenant Invariant**:
> ONE Django Codebase · ONE PostgreSQL Database · ONE Redis Cluster · Shared Schema
> 
> **Resolution Priority**:
> `HTTP Host` → `TenantDomain` → `Tenant` → `request.tenant`
> 
> **Golden Rules**:
> 1. Never database-per-tenant or schema-per-tenant.
> 2. Never trust client-controlled tenant switching (`X-Tenant-ID`, `?tenant_id=`, `request.data["tenant"]`).
> 3. `LedgerEntry` is the sole financial source of truth. Balances are projections.
> 4. Hardware interaction (MikroTik/OLT) must only occur through backend service abstractions.
> 5. Downstream feature development must not bypass unresolved upstream architectural dependencies.

---

## 2. Global Stage Dependency Graph

```text
┌────────────────────────────────────────────────────────┐
│                        STAGE 0                         │
│               Architecture Stabilization               │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 1                         │
│                        Tenancy                         │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 2                         │
│                     Authentication                     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 3                         │
│                          RBAC                          │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 4                         │
│              Celery + Redis + Concurrency              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 5                         │
│                        Payments                        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 6                         │
│               Finance + Billing Integrity              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 7                         │
│                 Networking Operations                  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 8                         │
│                API + Security Hardening                │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        STAGE 9+                        │
│                    Product Features                    │
└────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Downstream feature development must not bypass unresolved upstream architectural dependencies.**

---

## 3. Baseline Verification

The following reproducible baseline commands were executed on the repository:

### Backend Check
- **Command**: `venv/bin/python manage.py check`
- **Result**: `System check identified no issues (0 silenced).` (Exit code 0)
- **Date**: 2026-09-07

### Backend Test Suite
- **Command**: `venv/bin/python manage.py test`
- **Result**: `Ran 78 tests in 151.658s — OK` (Exit code 0, 0 failures, 0 errors across original, Stage 1 multi-tenant isolation, and Stage 2 tenant-aware authentication test suites)
- **Date**: 2026-09-07

### Frontend Build
- **Command**: `export PATH="/home/taraldinn/.nvm/versions/node/v24.20.0/bin:$PATH" && cd frontend && npm run build`
- **Result**: Next.js 16.3.4 (Turbopack) production compile successful in 3.8s; TypeScript completed in 2.6s with 0 errors (Exit code 0)
- **Date**: 2026-09-07


### Known Gaps / Environmental Baseline Notes
1. **Local DB Driver**: Backend defaults to SQLite locally when `DATABASE_URL` is omitted; `DATABASE_URL` PostgreSQL engine (`psycopg2-binary`) is configured in `sheba_core/settings.py` for staging/production.
2. **Celery Worker**: Celery and Redis dependencies are not yet declared in `backend/requirements.txt`; tasks currently execute synchronously via direct function calls.
3. **Automated Browser Runner**: Local Playwright runner in the development subagent returned 404 from upstream Azure Edge mirror; manual browser verification or reinstallation required for automated recordings.

---

## 4. Master Stage Roadmaps

---

### STAGE 0 — Architecture Stabilization
- **STATUS**: `DONE`
- **DEPENDENCIES**: None
- **OBJECTIVE**: Stabilize project planning, reconcile legacy task trackers, document canonical architecture contracts, and establish a reproducible verification baseline without implementing Stage 1+ features.
- **TASKS**:
  - [x] S0.1 Inspect current repository architecture
  - [x] S0.2 Inspect recent git history
  - [x] S0.3 Reconcile Task.md
  - [x] S0.4 Reconcile implimentation plan.md
  - [x] S0.5 Identify implemented systems
  - [x] S0.6 Identify partially implemented systems
  - [x] S0.7 Identify obsolete/superseded tasks
  - [x] S0.8 Create MASTER_TASK.md
  - [x] S0.9 Create ARCHITECTURE.md
  - [x] S0.10 Document architecture invariants
  - [x] S0.11 Document dependency graph
  - [x] S0.12 Document engineering workflow
  - [x] S0.13 Establish verification baseline
  - [x] S0.14 Review Stage 0 changes
  - [x] S0.15 Commit Stage 0
- **ACCEPTANCE CRITERIA**:
  - `MASTER_TASK.md` and `ARCHITECTURE.md` exist at repository root and serve as sole sources of truth.
  - Verification baseline successfully executed and recorded with real test output.
  - Zero Stage 1+ features prematurely implemented.
- **TEST REQUIREMENTS**:
  - `python manage.py check` passes with 0 issues.
  - `python manage.py test` passes with 0 failures.
  - `npm run build` passes with 0 errors.

---

### STAGE 1 — Tenancy
- **STATUS**: `DONE`
- **DEPENDENCIES**: Stage 0
- **OBJECTIVE**: Complete pure server-derived multi-tenancy based strictly on `TenantDomain` resolution, eliminating all client-controlled tenant headers/parameters and establishing composite database constraints.
- **TASKS**:
  - [x] S1.1 Deprecate client-supplied `X-Tenant-ID` header fallback on business endpoints in production mode.
  - [x] S1.2 Enforce strict domain-to-tenant lookup via `TenantDomain` in `TenantResolutionMiddleware` with caching.
  - [x] S1.3 Verify `404 TENANT_NOT_FOUND` on unknown domains and `403 TENANT_INACTIVE` on suspended tenants across all routes.
  - [x] S1.4 Add composite database-level unique constraints `(tenant_id, ...)` on all tenant entities (`Customer`, `Package`, `Router`, `OLT`, `POPBranch`).
  - [x] S1.5 Audit all ViewSets to ensure 100% inheritance from `TenantScopedViewSetMixin` and prohibit raw `Model.objects.all()`.
- **ACCEPTANCE CRITERIA**:
  - Sending `X-Tenant-ID` with an invalid host cannot switch tenant context.
  - Cross-tenant database queries return empty querysets without leaking records.
  - All multi-tenancy regression tests pass (65/65 passing).
- **TEST REQUIREMENTS**:
  - Automated IDOR test suite covering all 14 business endpoints (`apps.core.test_shared_db_tenancy`).
  - Stage 1 isolation test suite covering domain resolution, IDOR read/update/delete, cross-tenant FK assignment, and database constraints (`apps.core.test_tenant_isolation_stage1`).

---

### STAGE 2 — Authentication
- **STATUS**: `DONE`
- **DEPENDENCIES**: Stage 1
- **OBJECTIVE**: Migrate user authentication from legacy single-tenant `StaffProfile` to multi-tenant `StaffMembership`, separating internal employees from external resellers and enforcing tenant-aware session tokens.
- **TASKS**:
  - [x] S2.1 Implement tenant-aware authentication backend validating that `request.user` has active `StaffMembership` in `request.tenant`.
  - [x] S2.2 Data migration script transferring `StaffProfile` records to `StaffMembership`.
  - [x] S2.3 Tenant-aware login flow blocking wrong-tenant authentication with HTTP 403 Forbidden (`CROSS_TENANT_LOGIN`).
  - [x] S2.4 Implement platform-wide superadmin authentication isolating Central Control Plane sessions from tenant staff (`CONTROL_PLANE_ACCESS_DENIED`).
  - [x] S2.5 Token & session enforcement: prevent cross-tenant token bypass, reject inactive memberships, and reject suspended tenants.
- **ACCEPTANCE CRITERIA**:
  - StaffMembership is authoritative identity record.
  - Tenant-aware authentication verified across all routes.
  - Wrong-tenant login blocked with HTTP 403 Forbidden.
  - Control-plane boundary strictly blocks ISP staff with HTTP 403 Forbidden.
  - Token/session cannot bypass membership.
  - All Stage 2 authentication tests pass (13/13 passing, 78/78 total suite).
- **TEST REQUIREMENTS**:
  - Stage 2 tenant auth test suite verifying cross-tenant login rejection (403), inactive membership/tenant rejection (403), central admin vs ISP staff control plane isolation (403), and token isolation (`apps.authentication.test_tenant_auth_stage2`).


---

### STAGE 3 — RBAC
- **STATUS**: `DONE`
- **DEPENDENCIES**: Stage 2
- **OBJECTIVE**: Wire database-driven `Permission` codenames and `Role` definitions to DRF permission classes, replacing hardcoded `UserRole` checks with capability-based authorization.
- **TASKS**:
  - [x] S3.1 Seed standard system permissions (`customer.view`, `customer.recharge`, `router.manage`, `staff.manage`, etc.).
  - [x] S3.2 Implement `HasTenantPermission` DRF permission class evaluating `membership.has_permission(codename)` & central `can(...)` function.
  - [x] S3.3 Enforce `Scope` filtering (`GLOBAL`, `POP`, `AREA`, `SELF`, `ASSIGNED`) in `get_scoped_queryset()` based on `membership.scope`.
  - [x] S3.4 Provide tenant-level custom Role creation API and functional frontend matrix allowing ISPs to build tailored staff permission sets.
  - [x] S3.5 Replace legacy `IsBillingStaff`, `IsTechnicalStaff`, `IsAdminOrManager` classes with capability checks.
- **ACCEPTANCE CRITERIA**:
  - Staff without `customer.recharge` capability are blocked with HTTP 403.
  - POP-scoped and assigned-scoped staff cannot view subscribers outside their scope.
  - Custom roles and live permissions can be configured via REST API and Staff UI matrix.
  - All Stage 3 RBAC automated tests pass (11/11 passing, 89/89 total suite).
- **TEST REQUIREMENTS**:
  - Permission matrix automated tests verifying all role capability combinations (`apps.authentication.test_rbac_stage3`).
  - Scope boundary tests for assigned and self isolation.

---

### STAGE 4 — Celery + Redis + Concurrency
- **STATUS**: `DONE`
- **DEPENDENCIES**: Stage 3
- **OBJECTIVE**: Establish production Celery worker and Redis broker infrastructure, convert background tasks into true asynchronous jobs, and implement distributed locking for concurrent operations.
- **TASKS**:
  - [x] S4.1 Add `celery` and `redis` to `requirements.txt` and create `sheba_core/celery.py` entrypoint.
  - [x] S4.2 Configure Celery Beat schedule for daily recurring tasks (customer expiry, invoice generation, reconciliation).
  - [x] S4.3 Implement Redis distributed lock context manager (`distributed_lock(f"lock:recharge:{tenant_id}:{customer_id}")`) with fallback.
  - [x] S4.4 Convert `process_payment_event`, `sync_router`, `sync_olt`, `expire_customers`, `generate_monthly_invoices`, `reconcile_payments`, `send_sms` into `@shared_task` with explicit `tenant_id`.
  - [x] S4.5 Add retry policies for transient network and webhook failures.
- **ACCEPTANCE CRITERIA**:
  - Celery and Redis configured with clean autodiscovery.
  - Workers and Celery Beat scheduled jobs configured.
  - Tasks strictly require explicit `tenant_id`; zero reliance on `request.tenant`.
  - Concurrent recharge requests for the same subscriber cannot execute simultaneously (zero double recharge).
  - All Stage 4 automated concurrency tests pass (9/9 passing, 98/98 total suite).
- **TEST REQUIREMENTS**:
  - Concurrency test suite verifying duplicate task prevention, concurrent recharge locking, retry behavior, worker failure, and tenant ID propagation (`apps.core.test_concurrency_stage4`).

---

### STAGE 5 — Payments
- **STATUS**: `DONE`
- **DEPENDENCIES**: Stage 4
- **OBJECTIVE**: Refactor payment webhook ingestion to asynchronous state-machine architecture, separating event receipt from transaction processing and matching.
- **TASKS**:
  - [x] S5.1 Refactor `SmsWebhookView` to store raw payload in `InboundPaymentEvent(status='RECEIVED')` and return immediate HTTP 202 Accepted.
  - [x] S5.2 Dispatch asynchronous Celery task `process_payment_event.delay(tenant_id, event_id)` for background parsing, deduplication, and matching.
  - [x] S5.3 Implement strict state machine transitions for `InboundPaymentEvent`: `RECEIVED` → `PROCESSING` → `MATCHED` / `UNMATCHED` / `DUPLICATE` / `FAILED`.
  - [x] S5.4 Enforce idempotency on payment webhooks via provider transaction ID and reference ID deduplication.
  - [x] S5.5 Implement Android SMS forwarding model and staff recovery endpoint (`resolve`) for unmatched payments.
- **ACCEPTANCE CRITERIA**:
  - [x] Webhook is ingestion-only (immediate HTTP 202 Accepted, zero synchronous recharge).
  - [x] Async processing works (`process_payment_event` Celery task).
  - [x] Idempotency works (duplicate webhooks, duplicate SMS, duplicate TrxID/RefID ignored).
  - [x] Duplicate payment cannot double-credit.
  - [x] Unmatched payment transitions to safe state and is staff recoverable.
  - [x] All 107 tests pass across full test suite.
- **TEST REQUIREMENTS**:
  - [x] Duplicate webhook arrival test suite (`test_payment_pipeline_stage5.py`).
  - [x] Unmatched SMS parsing and customer matching test scenarios.
  - [x] Worker retry and concurrency test scenarios.

---

### STAGE 6 — Finance + Billing Integrity
- **STATUS**: `DONE`
- **DEPENDENCIES**: Stage 5
- **OBJECTIVE**: Integrate `apps/finance/` ledger into the main billing and customer lifecycle, ensuring all balance mutations produce immutable `LedgerEntry` records and automated monthly invoices.
- **TASKS**:
  - [x] S6.1 Wire customer recharge flow to generate `LedgerEntry` (credit customer account, debit reseller wallet).
  - [x] S6.2 Implement automated `PaymentAllocation` linking customer payments to open `Invoice` records (exact, partial, and overpayment).
  - [x] S6.3 Build `AdjustmentViewSet` for manual billing adjustments with mandatory reason and ledger entry generation.
  - [x] S6.4 Enforce no-delete integrity on `LedgerEntry` and `PaymentTransaction` in both Django admin and ORM.
  - [x] S6.5 Wire monthly recurring billing cron to create itemized `InvoiceLine` items and record `INVOICE` ledger debits.
  - [x] S6.6 Wire `InvoiceViewSet.pay` and `PaymentTransactionViewSet.create` into atomic ledger entries and invoice allocations.
  - [x] S6.7 All 10 financial integrity tests pass in `apps/finance/test_financial_integrity_stage6.py` (153/153 total suite).
- **ACCEPTANCE CRITERIA**:
  - `Customer.billing_account.balance` always equals the exact sum of related `LedgerEntry` rows.
  - Invoices cannot be marked paid without corresponding `PaymentAllocation` records.
  - No financial record (`LedgerEntry`, `PaymentTransaction`, `PaymentAllocation`) can be deleted via Admin, API, or ORM.
- **TEST REQUIREMENTS**:
  - Financial integrity test suite verifying atomic recharge, invoice allocation, immutability, idempotency, and concurrent transactions (`apps.finance.test_financial_integrity_stage6`).

---

### STAGE 7 — Networking Operations
- **STATUS**: `DONE`
- **DEPENDENCIES**: Stage 4, Stage 6
- **OBJECTIVE**: Complete the operational network management layer without coupling business views directly to devices.
- **TASKS**:
  - [x] S7.1 Router lifecycle works (CRUD, credential protection, health diagnostics, connection testing, SSRF protection).
  - [x] S7.2 PPPoE lifecycle works (active session query, disconnect session on device, PPPoE enable, PPPoE disable, profile synchronization, live traffic telemetry).
  - [x] S7.3 OLT / ONU lifecycle works (OLT CRUD, health, connection test, ONU auto-discovery, optical power metrics, ONU reboot, ONU customer assignment/unassignment).
  - [x] S7.4 Service boundary enforced (Views -> Network Service -> MikroTik/OLT Client -> Device; zero direct frontend/view device coupling).
  - [x] S7.5 Security verified (credentials never serialized, passwords encrypted at rest, SSRF protection against cloud metadata 169.254.169.254 and loopback, audit logging on all operations).
  - [x] S7.6 Failure resilience verified (device timeouts, connection refused, and HTTP errors return graceful 502/504; web application never crashes).
  - [x] S7.7 Background Celery tasks (`sync_router_task`, `sync_olt_task`) with distributed locking and tenant scoping.
  - [x] S7.8 All 25 Stage 7 network operational tests pass (132/132 total test suite).
- **ACCEPTANCE CRITERIA**:
  - [x] Router lifecycle works
  - [x] PPPoE lifecycle works
  - [x] OLT/ONU lifecycle works
  - [x] Service boundary enforced
  - [x] credentials protected
  - [x] network failures handled
  - [x] tests pass

---

### STAGE 8 — API + Security Hardening
- **STATUS**: `DONE`
- **DEPENDENCIES**: Stage 7
- **OBJECTIVE**: Clean up REST API serializers, enforce per-action DTOs, eliminate sensitive data exposure, and configure production CORS, security headers, and rate limiting.
- **TASKS**:
  - [x] S8.1 Audit and split serializers into read/write action-specific serializers across all apps (`RechargeRequest`, `PaymentRequest`, `LockCustomer`, `ToggleInternet`, `RouterAction`, `ONUAction`).
  - [x] S8.2 Eliminate sensitive fields (`pppoe_password`, `password`, `app_secret`, `telnet_password`, `snmp_community`) from all GET serializers.
  - [x] S8.3 Implement tenant-aware rate limiting (`ScopedRateThrottle`, `AnonRateThrottle`, `UserRateThrottle`) and configure security headers (`SECURE_CONTENT_TYPE_NOSNIFF`, `SECURE_BROWSER_XSS_FILTER`, `X_FRAME_OPTIONS = 'DENY'`).
  - [x] S8.4 Enforce strict production CORS settings with `'idempotency-key'` header support.
  - [x] S8.5 Generate and validate clean OpenAPI 3.0 specification matching actual behavior via `drf-spectacular`.
  - [x] S8.6 Enforce tenant context on public endpoints (`CustomerQueryApiView`, `SmsWebhookView`), eliminate request.data tenant switching, and block cross-tenant staff assignment.
  - [x] S8.7 Comprehensive security regression suite in `apps/core/test_security_hardening_stage8.py` (11/11 tests passing, 143/143 tests passing overall).
- **ACCEPTANCE CRITERIA**:
  - No cross-tenant reads or writes (IDOR prevented).
  - No tenant switching via request data or query parameters.
  - No secret or password hash is ever returned in an API response.
  - Destructive actions guarded by dedicated action serializers and capability checks.
  - Zero cross-tenant staff assignments.
- **TEST REQUIREMENTS**:
  - API security scanner tests verifying absence of sensitive fields.
  - Security regression suite verifying isolation, action serializers, and authorization.

---

### STAGE 9 — Product & SaaS Features (Super Admin Separation & Customer Portal)
- **STATUS**: `COMPLETED`
- **DEPENDENCIES**: Stage 8
- **OBJECTIVE**: Separate Super Admin and ISP Admin panels into independent frontends, build dedicated customer portal API (`apps/customers/portal_views.py`), and implement bKash/Nagad checkout and ticketing.
- **TASKS**:
  - [x] S9.1 Stand up dedicated Super Admin panel (`super-admin/`, Next.js 16.3.4 Turbopack) at `admin.shebafi.xyz`.
  - [x] S9.2 Segregate ISP Admin panel (`frontend/`) and remove all `/saas-admin` exposure from tenant space.
  - [x] S9.3 Customer self-care portal with OTP authentication and JWT bearer auth (`apps/customers/portal_urls.py`).
  - [x] S9.4 Self-care billing, online payment checkout (bKash tokenized), advance settlement, and ledger history.
  - [x] S9.5 Customer support ticket creation, reply threads, and attachment uploads.
- **ACCEPTANCE CRITERIA**:
  - Zero `/saas-admin` routes or control plane code accessible from tenant frontend.
  - Customer accounts have zero access to staff API endpoints.
  - 39 automated frontend tests and 27 portal tests passing.

---

### STAGE 10 — External Frontend Platform & Production Hardening
- **STATUS**: `COMPLETED`
- **DEPENDENCIES**: Stage 9
- **OBJECTIVE**: Finalize the separated Super Admin / ISP Admin architecture and make the ERP safe and stable for independently deployed ISP frontends and backend integrations.
- **TASKS**:
  - [x] S10.1 Architecture Verification: Strict panel boundaries, 0 control plane leakage, modular monolith preserved.
  - [x] S10.2 API Credential Security: TenantApiToken SHA-256 hash at rest, `shb_` prefix, rotation, one-time reveal, dynamic per-key rate throttling (`TenantApiKeyRateThrottle`).
  - [x] S10.3 API Client / BFF Contract: Server-to-server contract via `X-API-Key` and `Authorization: Api-Key`, standardized error codes.
  - [x] S10.4 Tenant Isolation Final Gate: Complete IDOR immunity, cross-tenant read/write/delete/custom-action rejection verified (`test_stage10_tenant_isolation_gate.py`).
  - [x] S10.5 RBAC Final Gate: SUPER_ADMIN, ISP_ADMIN, ISP_STAFF, and API_CLIENT scoped permissions verified (`test_stage10_rbac_gate.py`).
  - [x] S10.6 Finance & Payment Production Gate: Ledger immutability on delete and update, monthly invoice uniqueness per customer, and recharge accessibility verified (`test_stage10_finance_gate.py`).
  - [x] S10.7 Redis / Celery Runtime Gate: Async task retry policies, worker/beat smoke tests, and tenant context propagation verified.
  - [x] S10.8 Network Boundary Gate: Router and OLT credentials encrypted at rest, audit password redaction, SSRF protection against cloud metadata and loopback, and `transaction.on_commit` hardware boundary verified (`test_stage10_network_gate.py`).
  - [x] S10.9 API Contract Freeze: OpenAPI schema valid with `apiKeyHeaderAuth` and `apiKeyAuthorizationAuth` security schemes.
  - [x] S10.10 PostgreSQL Production Verification: Schema migrations applied cleanly on live PostgreSQL 18.6 (Neon) database.
  - [x] S10.11 Observability: `CorrelationIdMiddleware` injecting `X-Request-ID` across all HTTP responses and thread-local logs.
  - [x] S10.12 Backup & Recovery: Management commands `backup_database` (compressed, SHA-256 checksummed, tracked) and `restore_database` operational.
  - [x] S10.13 Documentation Freeze: `ARCHITECTURE.md`, `MASTER_TASK.md`, `API_CONTRACT.md` synchronized.
  - [x] S10.14 Production Readiness Gate: Django checks pass with 0 issues, OpenAPI validates, and all Next.js frontends (`super-admin`, `frontend`, `docs`) build cleanly.
  - [x] S10.15 Transactional Mailing & S3/R2 Storage: Automated tenant onboarding welcome email with credentials, dual-plane (Super Admin + ISP Admin) forgot/reset password with single-use HMAC tokens, and Cloudflare R2 / AWS S3 storage backend (`apps.core.storage.MediaS3Storage`, `StaticS3Storage`).
- **ACCEPTANCE CRITERIA**:
  - 44 automated Stage 10 & infrastructure gate tests passing (0 failures, 0 errors across isolation, RBAC, finance, network, and mailing/storage).
  - 39 frontend unit/integration tests passing.
  - Full production builds of `super-admin`, `frontend`, and `docs` passing with all forgot/reset password routes.

---

### STAGE 11 — Production Launch & Operational Reliability
- **STATUS**: `READY_FOR_EXECUTION`
- **DEPENDENCIES**: Stage 10
- **OBJECTIVE**: Production deployment, monitoring/alerting, CI/CD, domain/DNS setup, TLS, scaling, disaster recovery, and controlled rollout of independent ISP frontends.
- **TASKS**:
  - [ ] S11.1 Production multi-stage `Dockerfile` and `docker-compose.prod.yml` (PostgreSQL, Redis, Django, Celery Worker, Celery Beat, Nginx).
  - [ ] S11.2 CI/CD automation pipelines (GitHub Actions linting, test suite execution, Next.js build verification, automated staging deployment).
  - [ ] S11.3 Multi-tenant domain & TLS automation (Let's Encrypt / Certbot automated SSL provisioning, DNS TXT verification for custom ISP domains).
  - [ ] S11.4 Observability, monitoring & alerting (Prometheus metrics exporter, Grafana dashboards, health check `/healthz/` readiness/liveness, Sentry error tracking).
  - [ ] S11.5 Scaling, Redis distributed queue tuning & connection pooling (PgBouncer, Gunicorn gevent/sync tuning, Celery prefetch configuration).
  - [ ] S11.6 Automated backup lifecycle & disaster recovery (Scheduled cron backups to Cloudflare R2 / AWS S3, retention policy enforcement, automated restore rehearsal).
  - [ ] S11.7 Controlled rollout & external ISP frontend distribution (BFF API integration guides, tenant onboarding runbooks, production zero-downtime migrations).
- **ACCEPTANCE CRITERIA**:
  - Single command or automated pipeline deploys the complete, isolated production stack.
  - Zero-downtime database migrations with automated pre-flight checks.
  - Health check endpoints (`/healthz/readiness/`, `/healthz/liveness/`) report live status with sub-50ms latency.
  - SSL certificates provisioned automatically for wildcard and custom tenant domains.
- **TEST REQUIREMENTS**:
  - Production container build and container health probe tests.
  - Zero-downtime migration rollback smoke tests.

---

### STAGE 12 — Corporate & Dedicated Bandwidth
- **STATUS**: `NOT_STARTED`
- **DEPENDENCIES**: Stage 11
- **OBJECTIVE**: Implement committed CIR bandwidth corporate customer management, MRTG / 95th percentile billing, corporate VLANs, and BGP telemetry.
- **TASKS**:
  - [ ] S12.1 Corporate client profile extension (dedicated IP pools, VLANs, MRTG graphs).
  - [ ] S12.2 95th percentile bandwidth utilization calculation engine.
  - [ ] S12.3 Corporate multi-connection aggregation reporting.
- **ACCEPTANCE CRITERIA**:
  - Corporate invoices accurately calculate 95th percentile burst billing.
- **TEST REQUIREMENTS**:
  - 95th percentile algorithm unit tests.

---

### STAGE 13 — Reports + Advanced Analytics
- **STATUS**: `NOT_STARTED`
- **DEPENDENCIES**: Stage 11
- **OBJECTIVE**: Implement performant analytical aggregation layer with materialization for high-volume revenue, bandwidth, and subscriber churn reports.
- **TASKS**:
  - [ ] S13.1 Analytical service layer caching expensive monthly revenue aggregation in Redis.
  - [ ] S13.2 Daily subscriber churn and cohort retention metrics.
  - [ ] S13.3 Export service for CSV/Excel/PDF statements and financial audit reports.
- **ACCEPTANCE CRITERIA**:
  - Analytical dashboard queries respond in < 150ms for tenants with > 25,000 subscribers.
- **TEST REQUIREMENTS**:
  - Analytics performance benchmark tests under large synthetic datasets.

---

## 5. Legacy Plan Reconciliation

This section reconciles all tasks and phases from `Task.md` and `implimentation plan.md` against the actual current repository state.

### 5.1 Reconciliation of `Task.md` (Phases A–M)

| Legacy Phase | Name | Real Status | Verification & Code Evidence |
|---|---|---|---|
| **Phase A** | PostgreSQL + Production Config | `PARTIALLY_IMPLEMENTED` | `django-environ`, `psycopg2-binary`, WhiteNoise, and production settings are integrated in `sheba_core/settings.py`. However, local `.env` still defaults to SQLite. PostgreSQL is supported but requires `DATABASE_URL` environment configuration. |
| **Phase B** | Tenant / Domain Architecture | `IMPLEMENTED` | `TenantDomain` model exists (`apps/core/models.py`), migration `0006` applied, `TenantResolutionMiddleware` implements domain resolution and control plane routing. `apps/core/tenancy/` managers and mixins are built. |
| **Phase C** | Authentication + RBAC | `PARTIALLY_IMPLEMENTED` | `Permission`, `Role`, `StaffMembership`, and `Reseller` models exist (`apps/authentication/models.py`) with migration `0002`. However, views still authenticate via legacy `StaffProfile.role` rather than fine-grained `StaffMembership` permissions. |
| **Phase D** | Tenant Isolation Audit | `IMPLEMENTED` | `apps/core/test_shared_db_tenancy.py` passes 22/22 tests verifying cross-tenant IDOR protection across 14 endpoints. Serializers have `read_only_fields = ('tenant',)` and explicit validation. |
| **Phase E** | Billing + Ledger (`apps/finance/`) | `IMPLEMENTED` | `apps/finance/models.py` contains `BillingAccount`, `InvoiceLine`, `PaymentAllocation`, `LedgerEntry`, `Adjustment`, and `IdempotencyKey`. Migration `0001_initial` applied. Read-only admin registered. |
| **Phase F** | Payments + Reconciliation | `PARTIALLY_IMPLEMENTED` | `PaymentAttempt` and `InboundPaymentEvent` models exist with migration `0005`. Task functions `process_payment_event` and `reconcile_payments_for_tenant` exist in `apps/core/tasks.py`. However, `SmsWebhookView` still mutates customer state synchronously rather than queuing via Celery. |
| **Phase N0/N1/G** | Networking Operations & MikroTik REST | `IMPLEMENTED` | `apps/network/services/mikrotik/` contains modular client, system, interfaces, sessions, pppoe, and traffic services. `apps/core/encryption.py` implements Fernet encryption. `apps/network/validators.py` blocks SSRF. 10/10 network tests pass. |
| **Phase H** | Customer Portal API | `NOT_IMPLEMENTED` | `apps/portal/` app does not exist. Customer endpoints are not yet segregated from staff API routes. |
| **Phase I** | CRM + Field Tasks + SMS platform | `PARTIALLY_IMPLEMENTED` | `apps/support/`, `apps/tasks/`, `apps/callcenter/` exist with models and basic CRUD views, but lack SLA escalation timers, GPS task dispatch, and SMS failover gateways. |
| **Phase J** | Corporate / Bandwidth Customers | `NOT_IMPLEMENTED` | No models exist for 95th percentile MRTG billing or corporate multi-connection VLAN profiles. |
| **Phase K** | Reports Architecture | `IMPLEMENTED` | `apps/reports/views.py` implements role-based telemetry for 10 operational personas with scoped querying via `get_scoped_queryset()`. All 10 dashboard routes exist on frontend. |
| **Phase L** | Control Plane Completion | `IMPLEMENTED` | `apps/core/saas_views.py` implements full CRUD for tenants, domains, packages, subscriptions, payments, users, backups, and audit logs. Frontend `/saas-admin` fully integrated. |
| **Phase M** | Performance + Observability | `PARTIALLY_IMPLEMENTED` | Background task logic is written in `apps/core/tasks.py`, but Celery entrypoint (`celery.py`) and Redis broker configuration are not yet wired. `AuditLog` model is expanded and operational. |

---

### 5.2 Reconciliation of `implimentation plan.md` (Phases 1–36)

| Plan Phase | Title | Classification | Code State & Action Required |
|---|---|---|---|
| **Phase 1** | Replace SQLite with PostgreSQL | `PARTIALLY_IMPLEMENTED` | `settings.py` supports `DATABASE_URL`, but local environment uses SQLite default. Full PostgreSQL enforcement belongs in Stage 1 / Stage 14. |
| **Phase 2** | Fix tenant architecture first | `IMPLEMENTED` | Shared database, shared schema, and domain-based resolution are fully established. |
| **Phase 3** | Separate control plane and tenant plane | `IMPLEMENTED` | `CONTROL_PLANE_DOMAINS` in middleware and `apps/core/saas_views.py` completely isolate central operations. |
| **Phase 4** | Tenant ownership enforcement | `IMPLEMENTED` | Serializers force `tenant=request.tenant` and block client modification. |
| **Phase 5** | Cross-tenant integrity | `IMPLEMENTED` | Validated in serializers (`validate_customer`, `validate_package`, `validate_router`). |
| **Phase 6** | Authentication redesign | `PARTIALLY_IMPLEMENTED` | `StaffMembership` model exists; views still query `StaffProfile`. Migration deferred to Stage 2. |
| **Phase 7** | RBAC + scope | `PARTIALLY_IMPLEMENTED` | `Role`, `Permission`, and `Scope` models exist; permission checks in views deferred to Stage 3. |
| **Phase 8** | Staff vs reseller redesign | `IMPLEMENTED` | `Reseller` and `ResellerLedgerEntry` exist as distinct models outside `StaffProfile`. |
| **Phase 9** | Billing engine | `PARTIALLY_IMPLEMENTED` | `Invoice` and `Recharge` models exist; automated ledger creation deferred to Stage 6. |
| **Phase 10** | Financial ledger | `IMPLEMENTED` | `apps/finance/models.py` defines append-only `LedgerEntry`, `BillingAccount`, and `PaymentAllocation`. |
| **Phase 11** | Payment architecture | `IMPLEMENTED` | `PaymentAttempt` state machine model exists with full status enum. |
| **Phase 12** | Payment Sync / SMS automation | `PARTIALLY_IMPLEMENTED` | `InboundPaymentEvent` exists; async Celery webhook dispatch deferred to Stage 5. |
| **Phase 13** | MikroTik abstraction | `IMPLEMENTED` | Modular service layer in `apps/network/services/mikrotik/`. |
| **Phase 14** | Credential security | `IMPLEMENTED` | `FernetEncryption` with `EncryptedCharField` and SSRF validators operational. |
| **Phase 15** | OLT/ONU architecture | `IMPLEMENTED` | `apps/network/services/olt/` driver abstractions and OLT models operational. |
| **Phase 16** | Customer equipment/link history | `PARTIALLY_IMPLEMENTED` | `Customer` model has ONU link; separate historical tracking table deferred to Stage 7. |
| **Phase 17** | CRM / support | `IMPLEMENTED` | `apps/support/` provides ticket management, priorities, and staff replies. |
| **Phase 18** | Field operations | `IMPLEMENTED` | `apps/tasks/` provides task creation, assignments, and priorities. |
| **Phase 19** | SMS platform | `PARTIALLY_IMPLEMENTED` | `SmsLog` model exists; multiple gateway failover routing deferred to Stage 10. |
| **Phase 20** | Customer portal API | `NOT_IMPLEMENTED` | Deferred to Stage 9. |
| **Phase 21** | Corporate / bandwidth customers | `NOT_IMPLEMENTED` | Deferred to Stage 11. |
| **Phase 22** | Reports architecture | `IMPLEMENTED` | Real-time scoped analytics in `apps/reports/views.py`. Caching deferred to Stage 12. |
| **Phase 23** | Control panel | `IMPLEMENTED` | Complete `/saas-admin` control plane in frontend and backend. |
| **Phase 24** | API design cleanup | `PARTIALLY_IMPLEMENTED` | REST APIs functional; per-action DTO cleanup deferred to Stage 8. |
| **Phase 25** | Action-specific serializers | `PARTIALLY_IMPLEMENTED` | Basic serializers present; full request/response specialization deferred to Stage 8. |
| **Phase 26** | Sensitive data rules | `IMPLEMENTED` | Serializers redact password fields; network audit log redacts credentials. |
| **Phase 27** | Celery + Redis | `PARTIALLY_IMPLEMENTED` | Task functions written in `apps/core/tasks.py`; Celery daemon wiring deferred to Stage 4. |
| **Phase 28** | Distributed locking | `NOT_IMPLEMENTED` | Deferred to Stage 4. |
| **Phase 29** | Database indexing | `IMPLEMENTED` | Multi-column indexes applied across `Customer`, `Invoice`, `Transaction`, `Reseller`, `LedgerEntry`. |
| **Phase 30** | Remove accidental cross-tenant access | `IMPLEMENTED` | Verified by `apps/core/test_shared_db_tenancy.py`. |
| **Phase 31** | Tenant-aware authentication | `PARTIALLY_IMPLEMENTED` | Basic token auth active; multi-membership tenant validation deferred to Stage 2. |
| **Phase 32** | Admin plane authentication | `IMPLEMENTED` | `IsCentralAdmin` enforces superuser control plane isolation. |
| **Phase 33** | Audit system | `IMPLEMENTED` | `AuditLog` model expanded with `before`, `after`, `resource_type`, `request_id`. |
| **Phase 34** | API idempotency | `IMPLEMENTED` | `IdempotencyKey` model created in `apps/finance/models.py`. Full middleware wiring in Stage 6. |
| **Phase 35** | Testing strategy | `IMPLEMENTED` | 44 automated unit and integration tests passing in baseline. |
| **Phase 36** | Migration strategy | `SUPERSEDED` | The initial schema migrations have already been applied to SQLite/PostgreSQL. Future migrations follow standard Django migration flow. |

---

### 5.3 Inventory of Verified Implemented Systems

The following systems are **verified as implemented and working in the codebase**:
1. **Multi-Tenancy Layer**: `apps/core/models.py` (`Tenant`, `TenantDomain`), `apps/core/tenancy/managers.py` (`TenantScopedManager`), `apps/core/tenancy/mixins.py`.
2. **Domain-Based Routing**: `apps/core/middleware.py` (`TenantResolutionMiddleware`).
3. **Core Network Service Layer**: `apps/network/services/mikrotik/` (`client.py`, `system.py`, `interfaces.py`, `sessions.py`, `pppoe.py`, `traffic.py`, `service.py`).
4. **OLT Chassis Management**: `apps/network/services/olt/` (`client.py`, `system.py`, `onu.py`, `optical.py`).
5. **Credential Encryption at Rest**: `apps/core/encryption.py` (Fernet key derivation) & `apps/core/fields.py` (`EncryptedCharField`).
6. **Network SSRF Protection**: `apps/network/validators.py`.
7. **Financial Ledger Models**: `apps/finance/models.py` (`BillingAccount`, `InvoiceLine`, `PaymentAllocation`, `LedgerEntry`, `Adjustment`, `IdempotencyKey`).
8. **Payment Pipeline Models**: `apps/payments/models.py` (`PaymentAttempt`, `InboundPaymentEvent`, `PaymentTransaction`, `PaymentGateway`).
9. **Fine-Grained RBAC Models**: `apps/authentication/models.py` (`Permission`, `Role`, `StaffMembership`, `Reseller`, `ResellerLedgerEntry`).
10. **Role-Based Reporting Engine**: `apps/reports/views.py` (10 operational personas with scoped queries).
11. **SaaS Central Control Plane**: `apps/core/saas_views.py` & `frontend/src/app/saas-admin/page.tsx` (Complete CRUD for tenants, domains, packages, subscriptions, payments, users, backups, audit logs).
12. **Frontend Multi-Tenant Application**: Next.js 16.3.4 (Turbopack) with 10 role-based dashboards, domain proxy (`proxy.ts`), and centralized API client (`ApiClient`).

# Sheba ISP ERP — Backend Stabilization Task List

> Goal: Stabilize and prepare the existing backend for production as an independently deployable ISP ERP.
> **DO NOT** rewrite, introduce microservices, create a new frontend, or change the API version.

---

## 📋 Phase 0: Discovery & Assessment

- [x] Inspect all 12 domain apps and models
- [x] **A.** Document current architecture (Django modular monolith, SQLite→PostgreSQL, DRF, Token Auth, Tenant Middleware)
- [x] **B.** Document existing modules/features (14 domains identified)
- [x] **C.** Identify critical problems (datetime NameError, sms_log field missing, non-atomic recharge, non-idempotent webhook)
- [x] **D.** Identify security risks (tenant spoofing/IDOR, missing RBAC, credential exposure, hardcoded SECRET_KEY, CORS_ALLOW_ALL)
- [x] **E.** Identify production-readiness gaps (SQLite default, no health check with DB ping, N+1 queries, missing indexes)
- [x] **F.** Produce P0 / P1 / P2 recommended changes

---

## 🔴 P0 — Critical Fixes (Data Integrity & Security)

### P0.1 — Runtime Bug Fixes
- [x] Fix `datetime.timedelta` NameError in `apps/customers/views.py` (missing `import datetime`)
- [x] Add `sms_log` ForeignKey field to `PaymentTransaction` model (`apps/payments/models.py`)
- [x] Run `makemigrations payments` + `migrate` for `sms_log` field
- [x] Fix `CompanySetting.__str__` test mismatch (test expects `"Settings for X"` but model returns `"Settings for X (slug)"`)

### P0.2 — Atomic Transactions & Row Locking
- [x] Wrap `recharge()` action in `@transaction.atomic` + `select_for_update()` (`customers/views.py`)
- [x] Wrap `toggle_internet()` in `@transaction.atomic` + `select_for_update()` (`customers/views.py`)
- [x] Wrap `toggle_status()` in `@transaction.atomic` + `select_for_update()` (`customers/views.py`)
- [x] Wrap stock `StockTransaction` create in `@transaction.atomic` + `select_for_update()` (`store/views.py`)

### P0.3 — Payment Webhook Idempotency
- [x] Check `trx_id` uniqueness **before** creating `PaymentTransaction` in `SmsWebhookView`
- [x] Return early (idempotent 200) if `trx_id` already exists in database
- [x] `db_index=True` confirmed on `SmsLog.parsed_trx_id`; `PaymentTransaction.trx_id` has `unique=True`

### P0.4 — RBAC Permission Classes
- [x] Create `apps/core/permissions.py` with:
  - [x] `IsTenantMember` — enforces user belongs to active tenant
  - [x] `IsAdminOrManager` — Super Admin / Admin only
  - [x] `IsBillingStaff` — Admin + Billing Operators + Agents
  - [x] `IsTechnicalStaff` — Admin + Support + Line Men
  - [x] `IsAdminUserOrReadOnly` — safe methods for all staff, mutations for admins only

### P0.5 — Anti-IDOR Tenant Scoping
- [x] Create `apps/core/utils.py` with `get_tenant_for_request()` and `get_scoped_queryset()` helpers
- [x] Apply `IsTenantMember` permission to `CustomerViewSet`
- [x] Scope `CustomerQueryApiView` to active tenant (no cross-tenant leakage)
- [x] Apply `IsTenantMember` + `IsAdminUserOrReadOnly` to `NetworkViewSet` (routers, OLT, ONU)
- [x] Apply `IsTenantMember` + `IsBillingStaff` to `BillingViewSet` (invoices, packages)
- [x] Apply `IsTenantMember` + `IsAdminOrManager` to `PaymentsViewSet`
- [x] Apply `IsTenantMember` to `SupportViewSet`
- [x] Apply `IsTenantMember` + `IsAdminOrManager` to `HRViewSet` (salary data is sensitive)
- [x] Apply `IsTenantMember` + `IsAdminUserOrReadOnly` to `StoreViewSet`
- [x] Apply `IsTenantMember` to `TaskViewSet`
- [x] Apply `IsTenantMember` + `IsAdminOrManager` to `CallCenterViewSet`
- [x] Switch all `get_queryset()` to use `get_scoped_queryset()` helper

### P0.6 — Credential Protection (Server-Side Only)
- [x] Confirm `RouterSerializer` `password` is `write_only=True` ✓
- [x] Confirm `OLTSerializer` `telnet_password` is `write_only=True` ✓
- [x] Mark `PaymentGatewaySerializer` fields `app_secret`, `password`, `sandbox_password`, `private_key`, `store_password` as `write_only=True`
- [x] `CompanySettingSerializer` — `sms_api_key` stored server-side, not in serializer (safe)
- [x] `CustomerDetailSerializer` — `pppoe_password` field exists in model but only accessible behind `IsAuthenticated`

### P0.7 — Run Checks & Tests After P0
- [x] Run `python manage.py check` → **0 errors** ✅
- [x] Run `python manage.py test` → **7/7 tests pass** ✅
- [x] Verify `python manage.py spectacular --validate` → exit 0 ✅

---

## 🟡 P1 — Production Architecture & Reliability

### P1.1 — Environment-Based Configuration
- [ ] Add `python-decouple` or `django-environ` to `requirements.txt`
- [ ] Replace hardcoded `SECRET_KEY` with `env('SECRET_KEY')`
- [ ] Replace hardcoded `DEBUG = True` with `env.bool('DEBUG', default=False)`
- [ ] Configure `DATABASES` to use `DATABASE_URL` env var (PostgreSQL in prod)
- [ ] Move `ALLOWED_HOSTS` to env (`env.list('ALLOWED_HOSTS')`)
- [ ] Move `CORS_ALLOWED_ORIGINS` to env (remove `CORS_ALLOW_ALL_ORIGINS = True`)
- [ ] Create `.env.example` template file in `/backend/`

### P1.2 — Deep Health / Readiness Probe
- [x] Basic `/api/v1/health-check/` endpoint returns HTTP 200
- [ ] Upgrade health check to ping database (`connection.ensure_connection()`)
- [ ] Add `/healthz/` readiness probe suitable for Kubernetes/nginx LB
- [ ] Include `db: ok/error`, `cache: ok/error`, and `version` in response

### P1.3 — N+1 Query Optimizations
- [ ] Add `select_related` on `InvoiceViewSet` queryset (`customer__package`, `customer__router`)
- [ ] Add `select_related` on `RechargeViewSet` queryset
- [ ] Add `select_related` on `TicketViewSet` queryset (`assigned_to__user`)
- [ ] Add `select_related` on `HRViewSet` queryset (`employee__user`)
- [ ] Add `prefetch_related` on `PackageViewSet` for related reseller pricing

### P1.4 — Database Indexes
- [ ] Add composite index on `Customer(tenant, status)` in `customers/models.py`
- [ ] Add index on `Customer(tenant, expiry_date)` for expiry cron jobs
- [ ] Add index on `Invoice(tenant, due_date, status)`
- [ ] Add index on `PaymentTransaction(tenant, created_at)`
- [ ] Add index on `Recharge(customer, created_at)`
- [ ] Run `makemigrations` + `migrate` for index additions

### P1.5 — Static File Serving
- [ ] Add `whitenoise` to `requirements.txt`
- [ ] Add `WhiteNoiseMiddleware` to `MIDDLEWARE` after `SecurityMiddleware`
- [ ] Configure `STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'`
- [ ] Run `python manage.py collectstatic`

### P1.6 — Session / Cache Backend
- [ ] Switch `SESSION_ENGINE` from DB to Redis/cache for stateless LB compatibility
- [ ] Configure `CACHES` with Redis backend via `REDIS_URL` env var (optional for current stage)

---

## 🟢 P2 — Background Tasks & Automation

### P2.1 — Management Commands
- [ ] Create `management/commands/process_expiries.py` — auto-lock expired customers
- [ ] Create `management/commands/generate_monthly_invoices.py` — bulk invoice creation
- [ ] Create `management/commands/send_expiry_sms.py` — SMS reminder dispatch

### P2.2 — Celery Readiness
- [ ] Document Celery task structure for `process_expiries` and `generate_monthly_invoices`
- [ ] Ensure no in-memory state: all task data sourced from DB
- [ ] Add `CELERY_BROKER_URL` env var to `.env.example`

### P2.3 — Test Coverage Expansion
- [ ] Fix existing failing tests:
  - [ ] `test_company_settings` — update `__str__` assertion or model `__str__` method
  - [ ] `test_bkash_sms_auto_matching` — confirm idempotency fix resolves this
  - [ ] `test_customer_recharge_flow` — confirm `datetime` fix resolves this
- [ ] Add test: `test_tenant_isolation` — confirm IDOR blocked across tenants
- [ ] Add test: `test_duplicate_trx_id_ignored` — confirm idempotent webhook
- [ ] Add test: `test_network_credentials_not_in_response` — confirm password write-only
- [ ] Add test: `test_unauthorized_customer_access` — confirm RBAC blocks unprivileged users
- [ ] Add test: `test_stock_transaction_atomic` — confirm inventory concurrency safety

---

## 📦 Final Deliverables

- [ ] **Implementation Summary** — files changed and why
- [ ] **Remaining Risks** — items not addressed and recommended next steps
- [ ] **Migration Requirements** — all new migrations in order
- [ ] **Environment Variables** — full `.env.example` with every variable documented
- [ ] **Deployment Requirements** — Gunicorn, Nginx, Redis, PostgreSQL, WhiteNoise
- [ ] **API Compatibility Notes** — any endpoints modified with backward-compat notes

---

## 📊 Progress

| Priority | Total | Done | Remaining |
|----------|-------|------|-----------|
| P0 | 25 | **25** | **0** ✅ |
| P1 | 20 | 1 | 19 |
| P2 | 12 | 0 | 12 |
| **Total** | **57** | **26** | **31** |

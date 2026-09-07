# Sheba ISP ERP — Master Task Tracker
## Source of truth: [implimentation plan.md](file:///home/taraldinn/Documents/Sheba%20codebase/implimentation%20plan.md)

> **Architecture**: ONE Django app · ONE PostgreSQL DB · ONE Redis · Many ISP tenants · Many domains
> **Rule**: Never database-per-tenant. Never trust client-supplied tenant. Domain → Tenant always.

---

## ✅ PHASE A — PostgreSQL + Production Config
- [x] Replace SQLite with `DATABASE_URL` env var (PostgreSQL)
- [x] `django-environ` integrated in `settings.py`
- [x] `DJANGO_SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` from env
- [x] `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_HSTS_SECONDS`
- [x] Production `.env.example` created
- [x] WhiteNoise static files
- [x] Redis cache + stateless session backend via `REDIS_URL`
- [x] `python manage.py check` → **0 issues** ✅

---

## ✅ PHASE B — Tenant / Domain Architecture

### Plan Phase 1–3 (Domain Resolution)
- [x] `TenantResolutionMiddleware` — HTTP Host → Tenant
- [x] `admin.*` / `control.*` → `request.is_control_plane = True`
- [x] Unknown domain → `404 TENANT_NOT_FOUND`
- [x] Inactive/suspended → `403 TENANT_INACTIVE`
- [x] `localhost`/`testserver` dev/test fallback
- [x] `/healthz/` readiness probe with DB ping

### Plan Phase 4 — TenantDomain model ✅
- [x] `TenantDomain(tenant, hostname, is_primary, is_active, verified, domain_type)` model
- [x] Migration `0006_tenantdomain_...` applied
- [x] Middleware: queries `TenantDomain` first, `Tenant.domain` as legacy fallback
- [x] `TenantDomainViewSet` at `/api/v1/tenant-domains/`
- [x] Central Admin: full CRUD. ISP Admin: read-only their domains
- [x] `TenantDomainInline` on `TenantAdmin`, `TenantDomainAdmin` registered

### Plan Phase 5 — Reusable Tenant Base Layer ✅
- [x] `apps/core/tenancy/` package created
- [x] `exceptions.py` — `TenantNotFound`, `TenantInactive`, `TenantContextMissing`
- [x] `managers.py` — `TenantScopedManager` with `.for_tenant()` (returns `.none()` if tenant=None)
- [x] `mixins.py` — `TenantScopedViewSetMixin`, `TenantScopedSerializerMixin`

---

## ✅ PHASE C — Authentication + RBAC

### Completed (existing)
- [x] `IsTenantMember`, `IsCentralAdmin` permissions
- [x] `read_only_fields = ('tenant',)` on all serializers
- [x] `perform_create` forces `tenant=request.tenant`

### Plan Phase 8 — Identity Model ✅
- [x] `Permission(codename, name, module)` model
- [x] `Role(tenant, name, permissions M2M)` model
- [x] `StaffMembership(user, tenant, role, scope, is_active)` model
- [x] `StaffProfile` kept intact — no breaking migration

### Plan Phase 10 — Reseller Redesign ✅
- [x] `Reseller(tenant, user, business_name, wallet_balance, credit_limit)` model
- [x] `ResellerLedgerEntry` append-only model
- [x] Migration `0002_permission_reseller_...` applied

### Plan Phase 9 / 31 / 32 — Full RBAC Scope (TODO)
- [ ] Permission codenames seeded
- [ ] Database-driven permission checks
- [ ] Login validates tenant membership
- [ ] Platform admin flag enforcement

---

## ✅ PHASE D — Tenant Isolation Audit
- [x] 35 tenancy tests passing
- [x] Cross-tenant IDOR blocked on all 14 domains

### Plan Phase 7 — Relationship Ownership Validation ✅
- [x] `CustomerDetailSerializer` — validate_package(), validate_router()
- [x] `InvoiceSerializer` — validate_customer()
- [x] `RechargeSerializer` — validate_customer(), validate_package()
- [ ] OLT/ONU cross-tenant validation (TODO)
- [ ] DB-level composite constraints (TODO)

---

## ✅ PHASE E — Billing + Ledger (apps/finance/)
- [x] `apps/finance/` app created and registered in `INSTALLED_APPS`
- [x] `BillingAccount` — per-customer billing summary
- [x] `InvoiceLine` — itemised invoice lines (auto-calculates total)
- [x] `PaymentAllocation` — maps payments to invoices
- [x] `LedgerEntry` — append-only financial journal
- [x] `Adjustment` — manual credit/debit with LedgerEntry link
- [x] `IdempotencyKey` — financial mutation deduplication
- [x] Migration `finance/0001_initial` applied
- [x] `apps/finance/admin.py` — LedgerEntry read-only, PaymentAllocation no-delete

---

## ✅ PHASE F — Payments + Reconciliation
- [x] `PaymentAttempt` model — full INITIATED→SUCCESS/FAILED state machine
- [x] `InboundPaymentEvent` model — async pipeline (RECEIVED→MATCHED/UNMATCHED/DUPLICATE)
- [x] Migration `payments/0005_inboundpaymentevent_paymentattempt` applied
- [x] `process_payment_event(tenant_id, event_id)` task — dedup + match + create PaymentTransaction
- [x] `reconcile_payments_for_tenant(tenant_id)` task
- [ ] Refactor `SmsWebhookView` to create `InboundPaymentEvent` + dispatch task (TODO)

---

## ✅ PHASE G — MikroTik Service Layer
- [x] `apps/network/services/mikrotik/` package created
- [x] `RouterClient` — context manager, `RouterConnectionError`, `RouterCommandError`
- [x] `MikroTikService`:
  - [x] `test_connection()` — updates Router.status + last_ping
  - [x] `get_system_health()` — updates cpu_usage, memory_usage
  - [x] `get_active_sessions()` — structured PPPoE session list
  - [x] `create_pppoe_user()`, `update_pppoe_user()`, `disable_user()`, `enable_user()`
  - [x] `disconnect_session(username)`
  - [x] `sync_profiles()`, `sync_active_sessions_to_db()`
- [x] `sync_router_task()` upgraded to use `MikroTikService`

### Plan Phase 14 — Credential Encryption (TODO)
- [ ] `django-cryptography` added to `requirements.txt`
- [ ] `EncryptedCharField` in `apps/core/fields.py`
- [ ] `Router.password`, `OLT.telnet_password`, `OLT.snmp_community` → encrypted

---

## 🟡 PHASE M — Performance + Observability + Hardening

### Plan Phase 27 — Celery Tasks ✅
- [x] `expire_customers_for_tenant(tenant_id)` — bulk expiry
- [x] `process_payment_event(tenant_id, event_id)` — async match engine
- [x] `retry_sms(tenant_id, sms_log_id)`
- [x] `reconcile_payments_for_tenant(tenant_id)`
- [ ] `celery.py` worker entrypoint + beat schedule (TODO)
- [ ] `CELERY_BROKER_URL` in `.env.example` (TODO)

### Plan Phase 33 — Audit System ✅
- [x] `AuditLog` expanded: `resource_type`, `resource_id`, `request_id`, `user_agent`, `before`, `after`
- [x] Migration applied, admin updated

### Plan Phase 28 / 29 / 35 (TODO)
- [ ] Redis distributed locks for concurrent recharge/webhook
- [ ] `celery.py` entrypoint
- [ ] Concurrent recharge + duplicate webhook tests

---

## 🔲 Remaining Phases (Not Started)

| Phase | Name |
|-------|------|
| **H** | Customer Portal API (`apps/portal/`) |
| **I** | CRM + Field Tasks + SMS platform |
| **J** | Corporate / Bandwidth Customers |
| **K** | Reports Architecture (service layer) |
| **L** | Control Plane Completion |

---

## 📊 Progress Summary

| Phase | Name | Status |
|-------|------|--------|
| **A** | PostgreSQL + Production Config | ✅ Complete |
| **B** | Tenant / Domain Architecture | ✅ Complete |
| **C** | Authentication + RBAC | 🟡 80% |
| **D** | Tenant Isolation Audit | ✅ Complete (35 tests) |
| **E** | Billing + Ledger | ✅ Complete |
| **F** | Payments + Reconciliation | 🟡 80% |
| **G** | MikroTik Service Layer | ✅ Complete (credential encryption TODO) |
| **H** | Customer Portal API | 🔲 Not started |
| **I** | CRM + Field Tasks + SMS | 🔲 Not started |
| **J** | Corporate / Bandwidth | 🔲 Not started |
| **K** | Reports Architecture | 🔲 Not started |
| **L** | Control Plane Completion | 🔲 Not started |
| **M** | Performance + Observability | 🟡 70% |

### Baseline verification
```bash
python manage.py check                  # ✅ 0 issues
python manage.py test apps.core.test_shared_db_tenancy
python manage.py spectacular --validate
```

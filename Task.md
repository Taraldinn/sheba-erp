# Sheba ISP ERP — Master Task Tracker
## Source of truth: [implimentation plan.md](file:///home/taraldinn/Documents/Sheba%20codebase/implimentation%20plan.md)

> **Architecture**: ONE Django app · ONE PostgreSQL DB · ONE Redis · Many ISP tenants · Many domains
> **Rule**: Never database-per-tenant. Never trust client-supplied tenant. Domain → Tenant always.

---

## Implementation Order (A → M)

```
A → B → C → D → E → F → G → H → I → J → K → L → M
```

---

## ✅ PHASE A — PostgreSQL + Production Config

- [x] Replace SQLite with `DATABASE_URL` env var (PostgreSQL)
- [x] `django-environ` integrated in `settings.py`
- [x] `DJANGO_SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` from env
- [x] `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_HSTS_SECONDS`, `X_FRAME_OPTIONS`
- [x] Production `.env.example` created at `/backend/.env.example`
- [x] WhiteNoise static files (157 files collected, 453 compressed)
- [x] Redis cache + stateless session backend via `REDIS_URL`
- [x] `python manage.py check` → **0 issues** ✅

---

## ✅ PHASE B — Tenant / Domain Architecture

### Plan Phase 1–3 (Domain Resolution)
- [x] `TenantResolutionMiddleware` in `apps/core/middleware.py`
  - [x] HTTP `Host` → subdomain slug → `Tenant` lookup
  - [x] `admin.shebafi.com` → `request.is_control_plane = True`
  - [x] Unknown domain → `404 TENANT_NOT_FOUND`
  - [x] Inactive/suspended ISP → `403 TENANT_INACTIVE`
  - [x] `localhost`/`127.0.0.1`/`testserver` dev/test fallback (no silent cross-tenant)
  - [x] `/api/v1/auth/`, `/healthz/`, `/api/schema/`, `/api/docs/` in `PUBLIC_PATHS`
- [x] `/healthz/` readiness probe with `connection.ensure_connection()` DB ping
- [ ] **Plan Phase 4 — `TenantDomain` model** (separate domain management)
  - [ ] Create `TenantDomain(tenant, hostname, is_primary, is_active, verified, domain_type)`
  - [ ] Migrate domain resolution to query `TenantDomain` table
  - [ ] Keep `Tenant.domain` as legacy fallback only

### Plan Phase 5 — Reusable Tenant Base Layer
- [ ] Create `apps/core/tenancy/` package:
  - [ ] `context.py` — `get_current_tenant()` helper
  - [ ] `middleware.py` — move `TenantResolutionMiddleware` here
  - [ ] `managers.py` — `TenantScopedManager` base queryset manager
  - [ ] `permissions.py` — `TenantScopedPermission`, `IsCentralAdmin`
  - [ ] `mixins.py` — `TenantScopedViewSetMixin`, `TenantScopedSerializerMixin`
  - [ ] `exceptions.py` — `TenantNotFound`, `TenantInactive`
- [ ] Replace scattered `getattr(request, 'tenant', None)` with the mixin pattern
- [ ] Remove every `if tenant: filter(...) else: Model.objects.all()` anti-pattern

---

## ✅ PHASE C — Authentication + RBAC (Partial)

### Completed
- [x] `IsTenantMember` — `user.profile.tenant_id == request.tenant.id` enforcement
- [x] `IsCentralAdmin` — blocks ISP staff from control plane
- [x] `IsAdminOrManager`, `IsBillingStaff`, `IsTechnicalStaff`, `IsAdminUserOrReadOnly`
- [x] All 14 domain ViewSets protected with `IsTenantMember` + role permission

### Plan Phase 6 — Server-Controlled Tenant Assignment ✅
- [x] `read_only_fields = ('tenant',)` on all business serializers
- [x] `perform_create` forces `serializer.save(tenant=request.tenant)`
- [x] Frontend-submitted `tenant_id` discarded everywhere

### Plan Phase 8 — Proper Identity Model (TODO)
- [ ] Design `StaffMembership(user, tenant, role, is_active)` replacing `StaffProfile.role` char field
- [ ] Decompose `StaffProfile` — separate staff identity from customer identity and reseller identity
- [ ] Create `Role`, `Permission`, `RolePermission` models

### Plan Phase 9 — Full RBAC + Scope (TODO)
- [ ] Permission definitions: `customer.view`, `customer.create`, `customer.recharge`, `invoice.view`, `router.manage`, `ticket.assign`, etc.
- [ ] Scope support: `GLOBAL`, `TENANT`, `POP`, `AREA`, `SELF`, `ASSIGNED`
- [ ] Replace hard-coded role strings with database-driven permission checks

### Plan Phase 10 — Staff vs Reseller Redesign (TODO)
- [ ] Create `Reseller`, `ResellerStaff`, `ResellerCustomer`, `ResellerWallet`, `ResellerLedger`, `ResellerRate`
- [ ] Remove `RESELLER` from `StaffProfile.role` choices
- [ ] `Customer.reseller` → points to `Reseller` not `StaffProfile`

### Plan Phase 31 — Tenant-Aware Auth (TODO)
- [ ] Login must verify `user.profile.tenant_id == request.tenant.id`
- [ ] User on `fardin.shebafi.com` but only member of `isp2` → `403`

### Plan Phase 32 — Admin Plane Auth (TODO)
- [ ] `admin.shebafi.com` requires `platform_admin` or `platform_operator` flag
- [ ] Ordinary ISP admin cannot create/delete tenants or manage platform credentials

---

## ✅ PHASE D — Tenant Isolation Audit

- [x] 22-scenario tenant isolation test suite `apps/core/test_shared_db_tenancy.py`
- [x] Cross-tenant IDOR blocked on customers, invoices, payments, routers, tickets, recharge
- [x] Bulk `id__in=ids` scoped to `request.tenant` enforced and tested
- [x] Reports/dashboard scoped to `request.tenant`
- [x] Background tasks carry `(tenant_id, ...)` explicitly
- [x] **35/35 tests passing** ✅

### Plan Phase 30 — Remaining Cross-Tenant Audit (TODO)
- [ ] Full ViewSet audit for `getattr(request, 'tenant', None) → Model.objects.all()` pattern
- [ ] Replace every such pattern with hard rejection if `request.tenant is None`
- [ ] Audit nested resources: `customer.router.tenant`, `invoice.customer.tenant` ownership chain

### Plan Phase 7 — Relationship Ownership Validation (TODO)
- [ ] Serializer validation: `customer.router.tenant == customer.tenant`
- [ ] Serializer validation: `customer.package.tenant == customer.tenant`
- [ ] Serializer validation: `invoice.customer.tenant == invoice.tenant`
- [ ] Serializer validation: `recharge.package.tenant == recharge.tenant`
- [ ] Serializer validation: `OLT.tenant == ONU.tenant`
- [ ] DB-level composite constraints where PostgreSQL allows

---

## 🔲 PHASE E — Billing + Ledger

### Plan Phase 9 — Billing Engine (TODO)
- [ ] Create `BillingAccount` model (customer-level billing record)
- [ ] Create `InvoiceLine` model (itemised invoice lines)
- [ ] Create `PaymentAllocation` (payment → invoice linkage)
- [ ] Create `Credit`, `Debit`, `Adjustment` models
- [ ] Create `Subscription`, `SubscriptionHistory` models
- [ ] Keep `Customer.monthly_bill`, `due_amount`, `advance_amount` as useful denorm fields

### Plan Phase 10 — Financial Ledger (TODO)
- [ ] Create `finance/` app:
  - [ ] `Account`, `Journal`, `JournalEntry`, `LedgerEntry`
  - [ ] `CashAccount`, `BankAccount`
  - [ ] `Expense`, `Income`, `Transfer`, `Reconciliation`
- [ ] All financial changes append-only
- [ ] No `DELETE` on payment/financial records; use `reversal`, `refund`, `void`
- [ ] Add migrations for `finance/` app
- [ ] Register `finance/` in `INSTALLED_APPS`

---

## 🔲 PHASE F — Payments + Reconciliation

### Plan Phase 11 — Payment Architecture (TODO)
- [ ] Create `PaymentProvider` abstraction (bKash, Nagad, Rocket, SSLCommerz)
- [ ] Create `PaymentAttempt` model
- [ ] Create `PaymentWebhook`, `PaymentSettlement`, `PaymentReconciliation` models
- [ ] Implement state machine: `INITIATED → PENDING → SUCCESS/FAILED/CANCELLED/REFUNDED/RECONCILED`

### Plan Phase 12 — Payment Sync / SMS Automation (TODO)
- [ ] Replace `SmsWebhookView` direct-mutation with `InboundPaymentEvent` pipeline:
  - [ ] `PaymentSource`, `PaymentSyncConfig`
  - [ ] `PaymentInboundEvent`, `PaymentMatch`
  - [ ] `PaymentReconciliation`, `PaymentSyncLog`
- [ ] Unmatched transactions remain reviewable in admin
- [ ] Async match engine via Celery task

### Plan Phase 34 — API Idempotency (TODO)
- [ ] Create `IdempotencyKey(tenant, key, request_hash, response, status, expires_at)` model
- [ ] Apply `Idempotency-Key` header checking to: `recharge`, `payment`, `webhook`, `refund`, `invoice settlement`
- [ ] Return cached response for duplicate keys

---

## 🔲 PHASE G — MikroTik + OLT Service Layer

### Plan Phase 13 — MikroTik Abstraction (TODO)
- [ ] Create `apps/network/services/mikrotik/` package:
  - [ ] `client.py` — `RouterClient` class
  - [ ] `service.py` — business operations
  - [ ] `sync.py` — full router sync
  - [ ] `sessions.py` — active PPPoE session management
  - [ ] `profiles.py` — bandwidth profile sync
  - [ ] `users.py` — create/update/disable/enable PPPoE users
- [ ] Implement: `test_connection()`, `get_system_health()`, `get_active_sessions()`, `create_pppoe_user()`, `update_pppoe_user()`, `disable_user()`, `enable_user()`, `disconnect_session()`, `sync_profiles()`
- [ ] Views call services → services call MikroTik (never views → MikroTik directly)

### Plan Phase 14 — Credential Security (TODO)
- [ ] Implement `EncryptedSecretField` (using `django-cryptography` or `cryptography` lib)
- [ ] Migrate `Router.password` → `EncryptedSecretField`
- [ ] Migrate `OLT.telnet_password`, `OLT.snmp_community` → `EncryptedSecretField`
- [ ] Migrate `PaymentGateway` secrets → `EncryptedSecretField`
- [ ] Migrate SMS API keys, Tenant HMAC secrets → `EncryptedSecretField`
- [ ] Ensure all encrypted fields are `write_only=True` in serializers

### Plan Phase 15 — OLT / ONU Architecture (TODO)
- [ ] Create `OnuAssignment(onu, customer, assigned_at, unassigned_at)` model
- [ ] Create `OnuStatusHistory`, `OpticalReading`, `OnuActionLog` models
- [ ] `Customer ↔ ONU` becomes explicit assignment (not duplicated fields on ONU)

### Plan Phase 16 — Customer Equipment / Link History (TODO)
- [ ] Create `CustomerNetworkAssignment` model with history
- [ ] Create `RouterAssignment`, `IPAssignment`, `ONUAssignment`, `PackageAssignment` with timestamps
- [ ] Stop overwriting `customer.router`, `customer.package`, `customer.onu` without history

---

## 🔲 PHASE H — Customer Portal API

### Plan Phase 20 — Customer Portal (TODO)
- [ ] Create `apps/portal/` app with self-service routes:
  - [ ] `POST /api/v1/portal/auth/` — customer login
  - [ ] `GET /api/v1/portal/profile/`
  - [ ] `GET /api/v1/portal/service/`
  - [ ] `GET /api/v1/portal/billing/`
  - [ ] `GET /api/v1/portal/invoices/`
  - [ ] `POST /api/v1/portal/payments/`
  - [ ] `POST /api/v1/portal/recharge/`
  - [ ] `GET /api/v1/portal/sessions/`
  - [ ] `GET /api/v1/portal/usage/`
  - [ ] `GET /api/v1/portal/tickets/`
- [ ] Portal serializers are NEVER shared with admin serializers
- [ ] Portal auth token separate from staff token

---

## 🔲 PHASE I — CRM + Field Tasks + SMS

### Plan Phase 17 — CRM / Support (TODO)
- [ ] Create `TicketCategory`, `TicketAttachment`, `TicketAssignment`, `TicketStatusHistory` models
- [ ] Create `SLA` model
- [ ] Support actors: `customer`, `staff`, `reseller`, `corporate`

### Plan Phase 18 — Field Operations (TODO)
- [ ] Refactor `tasks/` → `FieldTask`, `TaskAssignment`, `TaskComment`, `TaskStatusHistory`, `TechnicianSchedule`
- [ ] Link `FieldTask` to `Customer`, `Ticket`, `POP`, `Area`, `Technician`

### Plan Phase 19 — SMS Platform (TODO)
- [ ] Create `SmsProvider`, `SmsTemplate`, `SmsMessage`, `SmsBatch`, `SmsDelivery`, `SmsBalance`, `SmsUsage` models
- [ ] Template types: `welcome`, `payment`, `recharge`, `due`, `expiry`, `suspension`, `reconnection`, `ticket`, `network_outage`
- [ ] Celery tasks: bulk SMS, retry, delivery polling, automated notifications

---

## 🔲 PHASE J — Corporate / Bandwidth Customers

### Plan Phase 21 — Corporate Domain (TODO)
- [ ] Create `apps/corporate/` app
- [ ] Models: `CorporateCustomer`, `CorporateService`, `BandwidthAllocation`, `IpService`, `DataConnectivity`, `CacheService`, `ServerRent`, `CorporateLink`, `CorporateInvoice`

---

## 🔲 PHASE K — Reports Architecture

### Plan Phase 22 — Reports (TODO)
- [ ] Create `apps/reports/services/` + `apps/reports/queries/` service layer
- [ ] Report groups: `dashboard`, `customers`, `billing`, `collection`, `revenue`, `due`, `resellers`, `payments`, `network`, `equipment`, `tickets`, `staff`, `SMS`, `cashflow`, `ledger`, `corporate`
- [ ] Use PostgreSQL aggregation (no model per report)
- [ ] Plan for materialized views/summary tables for large historical data

---

## 🔲 PHASE L — Control Plane Completion

### Plan Phase 23 — Control Plane APIs (TODO)
- [ ] Control plane APIs for: `tenant`, `tenant domains`, `branding`, `billing settings`, `SMS settings`, `payment methods`, `gateway config`, `network defaults`, `roles`, `permissions`, `API credentials`, `feature flags`
- [ ] Control plane can create `Tenant`, `TenantDomain`, `CompanySetting`, `Admin membership`
- [ ] Control plane must NOT proxy business API traffic

### Plan Phase 25 — Action-Specific Serializers (TODO)
- [ ] Create `RechargeRequestSerializer` (amount, payment_method, package_id, notes)
- [ ] Create `LockCustomerSerializer`
- [ ] Create `ToggleInternetSerializer`
- [ ] Create `PaymentRequestSerializer`
- [ ] Replace all action endpoints that reuse full detail serializers as request body

---

## 🔲 PHASE M — Performance + Observability + Hardening

### Plan Phase 26 — Sensitive Data Rules (TODO)
- [x] `Router.password` → `write_only=True` ✅
- [x] `OLT.telnet_password` → `write_only=True` ✅
- [x] `PaymentGateway` secrets → `write_only=True` ✅
- [ ] `Customer.pppoe_password` → encrypt + write-only + never in normal responses
- [ ] All encrypted fields migrated (depends on Phase G credential security)

### Plan Phase 27 — Celery + Redis (TODO)
- [x] Tasks carry `tenant_id` explicitly: `process_customer_expiry`, `generate_monthly_invoices_for_tenant`, `send_payment_sms`, `sync_router_task` ✅
- [ ] Add remaining tasks: `expire_customers`, `sync_olt`, `process_payment_event`, `retry_sms`, `calculate_reports`, `reconcile_payments`
- [ ] `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` in `.env.example`
- [ ] `celery.py` worker entrypoint configured

### Plan Phase 28 — Distributed Locking (TODO)
- [x] `transaction.atomic()` + `select_for_update()` on recharge, toggle, stock ✅
- [ ] Redis-based distributed locks for: `customer recharge`, `payment webhook`, `invoice generation`, `router sync`, `bulk expiry`
- [ ] Idempotency key deduplication layer

### Plan Phase 29 — Database Indexing (TODO)
- [x] Composite indexes on `Customer(tenant, status)`, `Customer(tenant, expiry_date)` ✅
- [x] Composite indexes on `Invoice(tenant, due_date)`, `PaymentTransaction(tenant, created_at)`, `Recharge(customer, created_at)` ✅
- [ ] Review and add missing indexes: `(tenant, mobile)`, `(tenant, customer_code)`, `(tenant, pppoe_username)` on Customer
- [ ] Review indexes for `SmsLog`, `TicketReply`, `Attendance`, `Payroll`

### Plan Phase 33 — Audit System (TODO)
- [ ] Expand `AuditLog` with: `resource_type`, `resource_id`, `request_id`, `user_agent`, `before`, `after`, `metadata`
- [ ] Audit triggers on: `login`, `logout`, `customer modification`, `recharge`, `payment`, `refund`, `permission changes`, `credential changes`, `network actions`, `tenant configuration`

### Plan Phase 35 — Test Coverage Expansion (TODO)
- [x] Tenant isolation tests (22 scenarios, 35 total) ✅
- [ ] Concurrent recharge test (two calls cannot corrupt expiry)
- [ ] Tenant A user cannot authenticate into Tenant B via host manipulation
- [ ] Two identical payment webhooks produce one transaction
- [ ] Wrong-tenant router cannot be accessed

### Plan Phase 36 — Migration Strategy (TODO)
- [x] Existing migrations preserved (no throwaway) ✅
- [ ] Data export script from SQLite → PostgreSQL
- [ ] Schema mapping and cleanup documentation
- [ ] PostgreSQL import validation script
- [ ] Production migration runbook

---

## 📊 Progress Summary

| Phase | Name | Status |
|-------|------|--------|
| **A** | PostgreSQL + Production Config | ✅ Complete |
| **B** | Tenant / Domain Architecture | 🟡 90% — `TenantDomain` model pending |
| **C** | Authentication + RBAC | 🟡 60% — identity model redesign pending |
| **D** | Tenant Isolation Audit | ✅ Complete (35/35 tests) |
| **E** | Billing + Ledger | 🔲 Not started |
| **F** | Payments + Reconciliation | 🔲 Not started |
| **G** | MikroTik + OLT Service Layer | 🔲 Not started |
| **H** | Customer Portal API | 🔲 Not started |
| **I** | CRM + Field Tasks + SMS | 🔲 Not started |
| **J** | Corporate / Bandwidth | 🔲 Not started |
| **K** | Reports Architecture | 🔲 Not started |
| **L** | Control Plane Completion | 🔲 Not started |
| **M** | Performance + Observability | 🟡 30% — indexes/locking partially done |

### Baseline verification (run before every phase)
```bash
python manage.py check                  # 0 issues
python manage.py test --verbosity=1     # 35/35 OK
python manage.py spectacular --validate # 0 errors
```

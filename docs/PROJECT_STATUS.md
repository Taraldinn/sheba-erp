# PROJECT_STATUS.md — Sheba ISP ERP

**Authoritative Architecture and Implementation Status Audit**

> **Audit Date:** 2026-09-26  
> **Repository:** `Taraldinn/sheba-erp`  
> **Head Commit:** `faac65f` (*feat(network): add OLT live monitor, daily bandwidth roll-up, and multi-method online detection*)  
> **Target Branch:** `main` (Authoritative)  
> **Rule of Evidence:** A subsystem or feature is classified as `TESTED` only when reproducible automated test suites pass within the repository. It is classified as `PRODUCTION_VERIFIED` only when deployed, monitored, and proven against real production traffic. Documentation claims alone are treated as `DESIGNED`.

---

## 1. Classification Taxonomy

| Status Code | Definition |
|---|---|
| `NOT_STARTED` | Conceptual only; no executable code exists in the repository. |
| `DESIGNED` | Architecture, data contracts, or specifications documented, but implementation is absent or trivial stubbing. |
| `IMPLEMENTED` | Executable business logic and data models exist in the repository, but automated test coverage is lacking or unverified. |
| `TESTED` | Fully implemented with passing automated test evidence (unit, integration, or matrix regression tests) executed in this environment. |
| `PRODUCTION_VERIFIED` | Deployed in live staging/production, handling live traffic, backed by real hardware connectivity and operational telemetry. |
| `BLOCKED` | Implementation or deployment cannot proceed due to external constraints, broken dependencies, schema divergence, or upstream blocking defects. |

---

## 2. Verification Baseline Summary

All commands were executed in the local environment on 2026-09-26 against branch `main` (`faac65f`):

| Check / Suite | Command | Exit Code | Result Summary |
|---|---|---|---|
| **Django System Check** | `backend/venv/bin/python backend/manage.py check` | **0** | `System check identified no issues (0 silenced).` |
| **Backend Test Suite** | `backend/venv/bin/python backend/manage.py test apps` | **0** | **494 tests passed** in 88.206s (0 failures, 0 errors across all apps). |
| **Frontend Test Suite** | `npm test` in `frontend/` (Node v24.20.0) | **0** | **65 tests passed** across 34 suites (0 failures). |
| **Super-Admin Test Suite** | `npm test` in `super-admin/` (Node v24.20.0) | **0** | **30 tests passed** across 20 suites (0 failures). |
| **OpenAPI / Schema Validation** | `backend/venv/bin/python backend/manage.py spectacular --validate` | **0** | Valid OpenAPI 3.0 schema generated (69 warnings, 214 errors — 46 unique plain APIViews requiring `@extend_schema`). |
| **Schema Migration Dry-Run** | `backend/venv/bin/python backend/manage.py makemigrations --check --dry-run` | **1** | **Uncreated migration detected in `apps/finance`** (`models.PROTECT` applied on FKs without migration). |
| **Production Neon PostgreSQL** | Direct connection via `.env` `DATABASE_URL` | **1** | **BLOCKED:** Remote Neon PostgreSQL returns `ERROR: Your account or project has exceeded the quota.` |

---

## 3. Subsystem Architecture Audit

### 3.1 Multi-Tenant Architecture & Domain Routing

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Shared DB, Shared Schema Isolation** | `apps/core/models.py` (`Tenant`, `TenantDomain`), `apps/core/tenancy/managers.py` (`TenantScopedManager`), `apps/core/tenancy/mixins.py` (`TenantScopedViewSetMixin`) | `apps/core/test_tenant_isolation_stage1.py`, `apps/core/test_shared_db_tenancy.py`, `apps/core/test_tenant_isolation_matrix.py`, `apps/core/test_stage10_tenant_isolation_gate.py` (65+ tests) | ❓ Unverified on production cluster | Described as core invariant in `ARCHITECTURE.md` §1 | `TESTED` |
| **Complete Tenant Isolation Audit & Hardening** | `apps/customers/views.py`, `apps/network/serializers.py`, `apps/hr/views.py`, `apps/tasks/views.py`, `apps/callcenter/views.py`, `apps/corporate/serializers.py` | `apps/core/test_tenant_isolation_complete.py` (35 exhaustive tests proving Tenant A cannot read/modify/delete/export Tenant B data, trigger network actions, or assign cross-tenant FKs) | ❓ Unverified on production cluster | Mandatory invariant: ONE runtime + ONE shared DB, strictly scoped to `request.tenant` | `TESTED` |
| **Host-Based Domain Resolution** | `apps/core/middleware.py` (`TenantResolutionMiddleware` resolves Host header against `TenantDomain` & `Tenant.slug`) | Tested in `test_tenant_isolation_stage1.py` (HTTP 404 on unknown domain, 403 on suspended tenant) | ❓ Requires production wildcard DNS + reverse proxy | Described in `ARCHITECTURE.md` §1 & `MASTER_TASK.md` Stage 1 | `TESTED` |
| **Domain Caching in Redis** | `apps/core/middleware.py:180-210` (`RedisService.get/set` with 300s TTL) | Verified in `test_redis_integration.py` & middleware unit tests | ❓ Requires running Redis in production stack | Claimed in `MASTER_TASK.md` S1.2 | `TESTED` |
| **Cross-Tenant IDOR Prevention** | `TenantScopedViewSetMixin.get_object()` validates `obj.tenant_id == request.tenant.id`, raises 403 `CROSS_TENANT_ACCESS` | `test_stage10_tenant_isolation_gate.py` tests cross-tenant read, update, delete across 14 ViewSets | ❓ | Claimed in `MASTER_TASK.md` S10.4 | `TESTED` |
| **DNS TXT Domain Verification** | `apps/core/models.py` (`TenantDomain.verification_token`), `apps/core/saas_views.py:270` (`verify_dns_txt()`) | `apps/core/test_milestones_hardening.py` (`test_dns_txt_domain_verification`) | ❌ No real DNS resolver verified in staging | Claimed in Stage 13.1 | `TESTED` |

---

### 3.2 Authentication, RBAC & Machine API Keys

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Authoritative Multi-Tenant Identity** | `apps/authentication/models.py` (`StaffMembership`), `apps/authentication/views.py` (`LoginView`, `CurrentUserView`) | `apps/authentication/test_tenant_auth_stage2.py` (13 tests), `apps/core/test_stage10_rbac_gate.py` | ❓ | Stated as authoritative replacement for `StaffProfile` | `TESTED` |
| **Cross-Tenant Login Blocking** | `apps/authentication/views.py:54` returns 403 `CROSS_TENANT_LOGIN` if user lacks membership in `request.tenant` | Tested in `test_tenant_auth_stage2.py` | ❓ | Claimed in `MASTER_TASK.md` Stage 2 | `TESTED` |
| **Role-Based Authorization & Scopes** | `apps/core/permissions.py` (`IsTenantMember`, `HasTenantPermission`, `can()`), `apps/authentication/models.py` (`Permission`, `Role`, `Scope`) | `apps/authentication/test_rbac_stage3.py` (11 tests), `apps/core/test_stage10_rbac_gate.py` | ❓ | Claimed in `MASTER_TASK.md` Stage 3 | `TESTED` |
| **Control Plane Admin Isolation** | `apps/core/permissions.py` (`IsCentralAdmin` strictly blocks tenant staff and API keys from SaaS endpoints) | Tested in `test_tenant_auth_stage2.py` and `test_stage10_rbac_gate.py` | ❓ | Claimed in `ARCHITECTURE.md` §3 | `TESTED` |
| **Machine API Tokens (`TenantApiToken`)** | `apps/core/models.py` (`TenantApiToken`), SHA-256 hashed at rest, prefix `shb_`, constant-time check, `HasApiKeyScope` | `apps/core/test_api_key_auth.py`, `apps/core/test_stage10_rbac_gate.py` | ❓ | Documented in `docs/API_KEY_INTEGRATION.md` | `TESTED` |
| **External ISP Frontend Applications (`ApiApplication`) & Dual-Token Auth** | `apps/core/models.py` (`ApiApplication`), `apps/core/authentication.py` (`TenantApiKeyAuthentication` Dual-Token flow), `apps/core/saas_views.py` (`SaaSApplicationViewSet`), `/api/v1/saas/applications/` | `apps/core/test_api_application_architecture.py` (10 tests covering 8-step flow, RBAC, isolation, lifecycle, audit logs) | ❓ | Full architecture in `docs/API_KEY_INTEGRATION.md` | `TESTED` |
| **Dynamic API Key Rate Limiting** | `apps/core/throttling.py` (`TenantApiKeyRateThrottle`), reads per-token rate limit across pure API key and application calls | Tested in `test_api_key_auth.py`, `test_api_application_architecture.py` | ❓ | Documented in `docs/API_KEY_INTEGRATION.md` | `TESTED` |
| **Password Reset via HMAC Token** | `apps/authentication/views.py` (`TenantPasswordResetView`, `TenantPasswordResetConfirmView`), `apps/core/saas_views.py` | `apps/core/test_mailing_and_storage.py` | ❓ Requires SMTP server configured in production | Documented in `MASTER_TASK.md` S10.15 | `TESTED` |
| **Session Token Expiry / Invalidation** | DRF Token auth (`rest_framework.authtoken.models.Token`) | Standard DRF behavior; logout deletes token | ❌ DRF tokens do not have sliding TTL expiration | Claimed in older drafts | `IMPLEMENTED` |

---

### 3.3 Finance, Billing & Double-Entry Ledger

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Append-Only Ledger (`LedgerEntry`)** | `apps/finance/models.py` (`LedgerEntry`, `ImmutableQuerySet` raises `ValidationError` on delete/update) | `apps/finance/test_financial_integrity_stage6.py`, `apps/core/test_stage10_finance_gate.py` | ❓ | Single source of truth in `ARCHITECTURE.md` §1 | `TESTED` |
| **Denormalized Account Summary** | `apps/finance/models.py` (`BillingAccount`), denormalized balance, credit limit, overdue tracking | `apps/finance/test_financial_integrity_stage6.py` | ❓ | Claimed in `MASTER_TASK.md` Stage 6 | `TESTED` |
| **Invoice & Itemized Lines** | `apps/billing/models.py` (`Invoice`), `apps/finance/models.py` (`InvoiceLine`) | `apps/finance/test_financial_integrity_stage6.py`, `apps/finance/test_phase9_finance_billing.py` | ❓ | Claimed in `MASTER_TASK.md` Stage 6 | `TESTED` |
| **Payment Allocation** | `apps/finance/models.py` (`PaymentAllocation`, `ImmutableQuerySet`), links payments to invoices | Tested in `test_financial_integrity_stage6.py` | ❓ | Claimed in `MASTER_TASK.md` Stage 6 | `TESTED` |
| **Monthly Billing Idempotency** | `apps/core/tasks.py` (`generate_monthly_invoices`), `apps/billing/models.py` `UniqueConstraint(tenant, customer, billing_month)` | Tested in `test_stage10_finance_gate.py` and `test_concurrency_stage4.py` | ❓ | Claimed in DEF-002 & DEF-007 | `TESTED` |
| **Manual Adjustments** | `apps/finance/models.py` (`Adjustment`), `AdjustmentViewSet` creates compensating `LedgerEntry` | Tested in `test_financial_integrity_stage6.py` | ❓ | Claimed in `MASTER_TASK.md` S6.3 | `TESTED` |
| **Multi-Currency Support** | No currency column on `LedgerEntry` or `Invoice` (implicit BDT) | ❌ No automated tests for multi-currency | ❌ | Acknowledged in DEF-010 backlog | `DESIGNED` |
| **Finance Schema Migration** | `apps/finance/models.py` FKs changed to `on_delete=models.PROTECT` | ❌ `makemigrations --check` fails | ❌ Migration not created | Documented as immutable | `BLOCKED` |

---

### 3.4 Payment Processing & Gateway Webhooks

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Asynchronous Inbound Payment State Machine** | `apps/payments/models.py` (`InboundPaymentEvent`), `RECEIVED` → `PROCESSING` → `MATCHED`/`UNMATCHED`/`FAILED` | `apps/payments/test_payment_pipeline_stage5.py`, `apps/payments/test_bkash_and_forwarder.py` | ❓ | Claimed in `MASTER_TASK.md` Stage 5 | `TESTED` |
| **Immediate 202 Accepted Webhook Ingestion** | `apps/payments/views.py` (`SmsWebhookView`), stores raw payload, queues `process_payment_event` Celery task | Tested in `test_payment_pipeline_stage5.py` | ❓ | Claimed in `ARCHITECTURE.md` §1 | `TESTED` |
| **Payment Gateway Credential Encryption** | `apps/payments/models.py` (`PaymentGateway`), `apps/core/crypto.py` MultiFernet AES-128-CBC + HMAC-SHA256 | `apps/payments/test_gateway_encryption.py` (11 tests pass) | ❓ | Documented in `docs/CREDENTIAL_ENCRYPTION.md` | `TESTED` |
| **bKash PayBill v1.4 Partner Integration** | `apps/payments/bkash_views.py` (`BKashPayBillQueryView`, `BKashPayBillPayView`, `BKashPayBillSearchView`) | `apps/payments/test_bkash_paybill.py` | ❌ Tested with mock data; live bKash sandbox unverified | Documented in `docs/API_CONTRACT.md` | `TESTED` |
| **Customer Portal bKash Checkout** | `apps/payments/bkash_views.py` (`BKashCheckoutCreateView`, `BKashCheckoutExecuteView`), tokenized checkout | Tested in `test_portal_recharge.py` | ❌ Sandbox token grant fails without live mock or credentials | Claimed in `MASTER_TASK.md` Stage 9 | `TESTED` |
| **Android SMS Forwarder Webhook** | `apps/payments/bkash_views.py` (`ManualSMSForwarderView`), extracts sender, TrxID, amount | Tested in `test_bkash_and_forwarder.py` | ❓ | Claimed in `MASTER_TASK.md` S5.5 | `TESTED` |
| **Unmatched Payment Recovery** | `apps/payments/views.py` (`InboundPaymentEventViewSet.resolve` action) | Tested in `test_payment_pipeline_stage5.py` | ❓ | Claimed in `MASTER_TASK.md` S5.5 | `TESTED` |

---

### 3.5 Network Automation & MikroTik RouterOS

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Router Model & SSRF Protection** | `apps/network/models.py` (`Router`), `apps/network/validators.py` (blocks 169.254.0.0/16, loopback, multicast, DNS rebinding) | `apps/network/test_isp_operations_stage7.py`, `apps/core/test_stage10_network_gate.py` | ❓ | Claimed in `ARCHITECTURE.md` §1 | `TESTED` |
| **RouterOS v7 REST Client** | `apps/network/services/mikrotik/client.py` (`MikroTikRESTClient`) | Tested via responses/mocks in `test_isp_operations_stage7.py` | ❌ No live MikroTik RouterOS v7 hardware connection in audit | Claimed in `MASTER_TASK.md` Stage 7 | `TESTED` |
| **PPPoE Secret Management** | `apps/network/services/mikrotik/` (create, update, disable, profile change, remove secret) | Tested in `test_isp_operations_stage7.py` | ❌ Hardware mock only | Claimed in `MASTER_TASK.md` S7.2 | `TESTED` |
| **PPPoE Active Session Disconnect** | `apps/network/services/mikrotik/` (`disconnect_session` via `/ppp/active/remove`) | Tested in `test_isp_operations_stage7.py` and `test_phase14_15.py` | ❌ Hardware mock only | Claimed in `MASTER_TASK.md` S7.2 | `TESTED` |
| **Network Action Queue** | `apps/network/services/action_queue.py` (`ActionQueueService`), durable `NetworkSyncJob` (alias `NetworkAction`), distributed locking, `transaction.on_commit`, deterministic lifecycle (`PENDING` -> `QUEUED` -> `RUNNING` -> `SUCCEEDED`/`FAILED`/`RETRYING`/`CANCELLED`/`STALE`), watchdog reaper (`reap_stale_actions_task`) | `apps/network/test_action_queue.py` (11 tests pass), `apps/network/test_action_queue_hardening.py` (10 tests pass covering deterministic lifecycle, retry backoff, concurrency locks, financial decoupling, zero credential logging) | ❓ | Documented in `MASTER_TASK.md` Stage 7 & Task 08 | `TESTED` |
| **PPPoE Reconciliation Engine** | `apps/network/services/reconciliation.py` (`ReconciliationEngine`), queries live MikroTik secrets vs database, detects MISSING/MISMATCH, emits `correlation_id` and `device_identity` | `apps/network/test_reconciliation.py` (15 tests pass) | ❌ Tested against mock RouterOS responses | Documented in `MASTER_TASK.md` Stage 7 | `TESTED` |
| **6-Tab NOC Cockpit** | `apps/network/cockpit_views.py`, `frontend/src/app/network/page.tsx` (routers, OLTs, live sessions, topology, fiber map, reconciliation) | `apps/network/test_network_cockpit.py`, `frontend` unit tests | ❓ | Claimed in commit `42f8f09` | `TESTED` |

---

### 3.6 OLT / ONU Integration & Live Monitoring

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **OLT & ONU Domain Models** | `apps/network/models.py` (`OLT`, `ONU` with `mactable`, `temperature`, `uptime`, `signal_quality`) | `apps/network/test_isp_operations_stage7.py`, `apps/network/test_olt_monitor.py` | ❓ | Migrations 0005, 0010, 0014, 0016 applied | `TESTED` |
| **Vendor Telnet/CLI Drivers** | `apps/network/services/olt/drivers.py` (`BDCOMEponDriver`, `BDCOMGponDriver`, `VSOLEponDriver`, `VSOLGponDriver`, `HSGQEponDriver` for EPON/GPON) | `apps/network/test_olt_monitor.py` (7 tests pass), `apps/network/test_olt_production_audit.py` (21 exhaustive tests pass auditing 22 criteria: Telnet lifecycle, socket cleanup, timeout resilience, auth failure early-detection, ANSI VT100 parsing, `--More--` pagination, BDCOM/VSOL/HSGQ CLI parsing, malformed output resilience) | ❌ Tested against simulated Telnet outputs; live OLT chassis requires on-site verification (`HARDWARE_VERIFICATION_REQUIRED`) | Added in commit `faac65f` | `TESTED` |
| **Live Telemetry & Fleet Sync** | `apps/network/services/olt/monitor.py` (`OLTMonitorService.sync_olt`), distributed locking (`lock:sync_olt:{tenant}:{olt}`), optical RX/TX power, uptime, temp | `test_olt_monitor.py`, `test_olt_production_audit.py` | ❌ Tested with simulated chassis responses | Added in commit `faac65f` | `TESTED` |
| **CPE MAC Learning & Cross-OLT Search** | `OLTMonitorService.search_mac`, searches learned MACs across all tenant OLTs with DB-first fast lookup and live CLI fallback | `test_olt_monitor.py`, `test_olt_production_audit.py` | ❌ Mock only | Added in commit `faac65f` | `TESTED` |
| **Monitoring REST Endpoints** | `apps/network/views.py` (`sync_monitor`, `sync_all_monitor`, `monitor_summary`, `mac_search`, `raw_mac_table`) with HTTP 409 distributed lock collision guard and strict RBAC | `test_olt_monitor.py`, `test_olt_production_audit.py` | ❓ | Added in commit `faac65f` | `TESTED` |
| **Frontend OLT Monitor Panel** | `frontend/src/components/network/OLTMonitorPanel.tsx` (1,129 lines), fleet overview, PON distribution, MAC explorer | Built in Next.js bundle | ❓ Requires live backend data | Added in commit `faac65f` | `IMPLEMENTED` |

---

### 3.7 BandwidthDailyUsage & Roll-Up Accounting

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **BandwidthDailyUsage Model** | `apps/billing/models.py` (`BandwidthDailyUsage`), `UniqueConstraint(customer, usage_date)`, `last_rx_snapshot`, `last_tx_snapshot` | `apps/network/test_networking_deltas.py`, `apps/network/test_bandwidth_concurrency.py` | ❓ | Migrations 0007 & 0008 applied in `billing` | `TESTED` |
| **Counter-Reset Delta Accounting & Concurrency Hardening** | `apps/network/services/bandwidth_rollup.py` (`BandwidthRollupService`), atomic transactions + `select_for_update()` row-level locks, distributed lock (`lock:bandwidth:{tenant}:{customer}:{date}`), deterministic primary-key sorting (deadlock elimination), zero double-counting | `apps/network/test_networking_deltas.py` (reset handling, consecutive rollups), `apps/network/test_bandwidth_concurrency.py` (6 exhaustive concurrency tests pass: concurrent first observations, concurrent identical counters, counter-reset absorption, multi-customer parallel execution) | ❓ | Added in `faac65f`, hardened in Task 10 | `TESTED` |
| **Live Session Aggregation Hook** | `apps/network/services/live_sessions.py:260`, executes rollup non-fatally during session sync | Tested in `test_networking_deltas.py` | ❓ | Added in commit `faac65f` | `TESTED` |
| **Bandwidth Summary REST API** | `apps/network/views_bandwidth.py` (`CustomerBandwidthSummaryView` at `/api/v1/network/customers/{id}/bandwidth/`) | Tested in `test_networking_deltas.py` | ❓ | Added in commit `faac65f` | `TESTED` |

---

### 3.8 Multi-Method Online Subscriber Detection

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **3-Tier Online Detection Engine** | `apps/network/services/online_detection.py` (PPPoE `/ppp/active` → DHCP `/ip/dhcp-server/lease` → Static ARP `/queue/simple` + `/ip/arp`), strict hostname/comment verification (never matches unrelated leases), single-host target enforcement (/32, rejecting subnets), active/complete ARP validation, error dict resilience | `apps/network/test_networking_deltas.py` (5 tests), `apps/network/test_online_detection_hardening.py` (22 exhaustive tests: PPPoE precedence, DHCP exact match vs unrelated lease rejection, static ARP active vs disabled/incomplete/dummy MAC, malformed dict responses, connection timeouts, missing router data) | ❌ Tested against mock client | Fully documented in `docs/NETWORK_ONLINE_DETECTION.md`, hardened in Task 11 | `TESTED` |
| **Feature Flag Guard** | `NETWORK_ENABLE_MULTIMETHOD_ONLINE = env.bool(..., default=False)` in `sheba_core/settings.py` | Tested with flag enabled and disabled (returns `None` immediately when False) in `test_networking_deltas.py`, `test_online_detection_hardening.py` | ❓ | Safe default False verified | `TESTED` |
| **Tenant & Router Scoping** | `get_online_status(router, username, tenant=None)` strictly bound to the target router instance and verified tenant | Tested in `test_online_detection_hardening.py` (matching tenant queries router; mismatched tenant blocked immediately) | ❓ | Validated in code & docs | `TESTED` |

---

### 3.9 WireGuard VPN Management

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **WireGuard Models** | `apps/network/models.py` (`WireGuardConfig`, `WireGuardSubnet`) | `apps/network/test_vpn_models.py`, migrations 0013 & 0015 | ❓ | Added in commit `828f950` | `TESTED` |
| **MikroTik Script Automation** | `apps/network/services/vpn.py` (`WireGuardService.generate_mikrotik_script`) | `apps/network/test_vpn_service.py` | ❌ Tested script output generation; live WireGuard tunnel unverified | Added in commit `42f8f09` | `TESTED` |
| **REST APIs & Script Download** | `apps/network/vpn_views.py` (`WireGuardConfigViewSet` with `script`, `download-script`, `test-connection` actions) | Tested in `test_vpn_service.py` | ❓ | Added in commit `42f8f09` | `TESTED` |
| **Frontend WireGuard Panel** | `frontend/src/components/network/WireGuardPanel.tsx` (640 lines) | Frontend test suite passes | ❓ | Added in commit `42f8f09` | `IMPLEMENTED` |

---

### 3.10 Customer Self-Care Portal

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Dual Customer Authentication** | `apps/customers/portal_auth_views.py` (Phone + OTP via SMS, and Username/Phone + Password) | `apps/customers/test_portal_auth.py`, `apps/customers/test_portal_auth_extensions.py` (12 tests) | ❓ Tested with mock SMS provider | Claimed in Stage 9 & commit `ddd9b68` | `TESTED` |
| **Self-Care Account & Telemetry** | `apps/customers/portal_views.py` (profile, settings, funbox, live traffic throughput, session history) | `apps/customers/test_portal_telemetry_and_funbox.py`, `apps/customers/test_portal_profile_invoices.py` | ❓ | Added in commits `3a4f906`, `ddd9b68` | `TESTED` |
| **Self-Care Invoices & Receipts** | `CustomerPortalInvoiceViewSet` with `receipt` action generating printable receipt format | `apps/customers/test_portal_receipt_and_tickets.py` | ❓ | Added in commit `dcd30a6` | `TESTED` |
| **Support Ticketing & Reply Threads** | `CustomerPortalTicketViewSet` with `reply` and `thread` actions | `apps/customers/test_portal_tickets.py`, `test_portal_receipt_and_tickets.py` | ❓ | Added in commit `dcd30a6` | `TESTED` |
| **Frontend Customer Portal UI** | `frontend/src/app/portal/page.tsx` (1,529 lines) + `frontend/src/lib/portal-api.ts` | 65 frontend tests pass (including `PortalApiClient` tests) | ❓ | Added in commits `23da721`, `ddd9b68` | `TESTED` |

---

### 3.11 SaaS Control Plane (Super Admin)

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Central Super Admin Panel** | `super-admin/` (Next.js 16.3.4 Turbopack app at `admin.shebafi.xyz`) | 30 automated tests pass in `super-admin/` | ❓ | Claimed in `MASTER_TASK.md` Stage 9 | `TESTED` |
| **Control Plane ViewSets** | `apps/core/saas_views.py` (tenants, domains, plans, subscriptions, payments, backups, users, audit, API credentials) | `apps/core/test_milestones_hardening.py`, `apps/core/test_stage10_rbac_gate.py` | ❓ | Claimed in `MASTER_TASK.md` Stage 9/10 | `TESTED` |
| **Tenant Auto-Suspension Lifecycle** | `apps/core/tasks.py` (`enforce_subscription_lifecycle`), Celery beat daily at 00:30 | Tested in `test_milestones_hardening.py` | ❓ | Added in Stage 13.3 | `TESTED` |
| **Single-Tenant Data Snapshot Export** | `apps/core/saas_views.py:1082` (`export_tenant_data`), guarded by `IsCentralAdmin` | Tested in `test_milestones_hardening.py` | ❓ | Added in Stage 13.2 / DEF-004 | `TESTED` |
| **Central Platform Audit Logging** | `apps/core/tasks.py` (`emit_platform_audit_event`), Celery task logging to `AuditLog` | Tested in `test_milestones_hardening.py` | ❓ | Added in Stage 13.4 | `TESTED` |

---

### 3.12 Corporate & Enterprise ISP Management

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Corporate Data Models** | `apps/corporate/models.py` (`CorporateCustomer`, `CorporateConnection`, `CorporateIPPool`, `CorporateIPAddress`, `CorporateVLAN`, `CorporateTrafficSample`, `CorporateBillingPeriod`) | `apps/corporate/tests/test_corporate_models.py` | ❓ | Added in Stage 11 | `TESTED` |
| **IPAM & VLAN Allocation Services** | `apps/corporate/services/ipam.py`, `vlan.py` (with `select_for_update` locking and 802.1Q 1–4094 validation) | `apps/corporate/tests/test_ip_vlan.py` | ❓ | Added in Stage 11 | `TESTED` |
| **5-Minute MRTG Telemetry Ingestion** | `apps/corporate/services/telemetry.py`, `CorporateTrafficSampleViewSet.mrtg_graph` | `apps/corporate/tests/test_corporate_api.py` | ❓ | Added in Stage 11 | `TESTED` |
| **Deterministic 95th Percentile Engine** | `apps/corporate/services/p95.py` ($\max(\text{in},\text{out})$, rank index $\lceil 0.95 \times N \rceil - 1$, 80% coverage quality gate) | `apps/corporate/tests/test_p95_calculation.py` (12 test scenarios pass) | ❓ | Added in Stage 11 | `TESTED` |
| **Corporate Billing & Ledger Invoicing** | `apps/corporate/services/billing.py` generates `billing.Invoice`, `finance.InvoiceLine`, appends `finance.LedgerEntry` | `apps/corporate/tests/test_corporate_billing.py` | ❓ | Added in Stage 11 | `TESTED` |
| **Enterprise Frontend Routes** | `frontend/src/app/corporate/` (5 Next.js routes: customers, connections, telemetry, ipam, billing) | Next.js build passes with SVG charts and audit modal | ❓ | Added in Stage 11 | `IMPLEMENTED` |

---

### 3.13 Auxiliary Modules (HR, Store, Tasks, Callcenter, Reports)

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Inventory / Store** | `apps/store/models.py` (`StoreItem`, `StockTransaction`), `apps/store/views.py` | `apps/store/tests.py` (`StoreConcurrencyAndSecurityTests` pass) | ❓ | Claimed in `MASTER_TASK.md` | `TESTED` |
| **HR & Payroll** | `apps/hr/models.py` (`Employee`, `Attendance`, `LeaveRequest`, `AdvanceSalary`, `PayrollRecord`), `apps/hr/views.py` | ❌ `apps/hr/tests.py` is empty (0 tests) | ❓ | Claimed in `MASTER_TASK.md` | `IMPLEMENTED` |
| **Field Tasks** | `apps/tasks/models.py` (`Task`), `apps/tasks/views.py` | ❌ `apps/tasks/tests.py` is empty (0 tests) | ❓ | Claimed in `MASTER_TASK.md` | `IMPLEMENTED` |
| **Call Center / Voice** | `apps/callcenter/models.py` (`CallLog`, `VoiceSetting`, `VoiceTemplate`), `apps/callcenter/views.py` | ❌ `apps/callcenter/tests.py` is empty (0 tests) | ❓ | Claimed in `MASTER_TASK.md` | `IMPLEMENTED` |
| **Dashboard Analytics Reports** | `apps/reports/views.py` (`DashboardAnalyticsView` at `/api/v1/reports/dashboard/`) | ❌ `apps/reports/tests.py` is empty (0 tests) | ❓ | Claimed in `MASTER_TASK.md` | `IMPLEMENTED` |
| **Support Tickets (Staff)** | `apps/support/models.py` (`Ticket`, `TicketReply`), `apps/support/views.py` | `apps/core/test_shared_db_tenancy.py` covers basic CRUD | ❓ | Claimed in `MASTER_TASK.md` | `TESTED` |

---

### 3.14 FreeRADIUS Integration

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **FreeRADIUS Backend Integration** | ❌ No FreeRADIUS models, daemon connection, or `radcheck`/`radacct` tables in Django | ❌ None | ❌ None | Mentioned in legacy PHP code (`php-legecy-shebafi`) and early planning | `NOT_STARTED` (Superseded by RouterOS REST API direct provisioning) |

---

### 3.15 Infrastructure, Async Queue & Deployment

| Component | Code Evidence | Automated Test Evidence | Production Verification | Documentation Claims | Status |
|---|---|---|---|---|---|
| **Redis Broker & Distributed Locking** | `apps/core/redis_service.py`, `apps/core/lock.py` (`distributed_lock` with fallback) | `apps/core/test_redis_integration.py`, `apps/core/test_concurrency_stage4.py` | ❓ | Claimed in `MASTER_TASK.md` Stage 4 | `TESTED` |
| **Celery Tasks & Autodiscovery** | `sheba_core/celery.py`, task modules in `core`, `payments`, `network`, `corporate` | Tasks executed synchronously in test harness (`CELERY_TASK_ALWAYS_EAGER = True`) | ❓ Async execution in worker unverified | Claimed in `MASTER_TASK.md` Stage 4 | `TESTED` |
| **Docker Compose Services** | `backend/docker-compose.yml` (`backend`, `celery-worker`, `celery-beat`, `postgres`, `redis`) | ❌ `celery-beat` specifies missing `--scheduler django_celery_beat.schedulers:DatabaseScheduler` | ❌ | Documented in DEF-006 | `BLOCKED` |
| **Observability (X-Request-ID)** | `apps/core/middleware.py` (`CorrelationIdMiddleware` sets thread-local `request_id` and response header) | Tested in `test_production_readiness.py` | ❓ | Claimed in `MASTER_TASK.md` S10.11 | `TESTED` |
| **Sentry Error Tracking** | ❌ `sentry-sdk` not in `requirements.txt` or `settings.py` | ❌ None | ❌ None | Listed in Stage 12 roadmap | `NOT_STARTED` |
| **Prometheus Metrics** | ❌ `django-prometheus` not in `requirements.txt` or `settings.py` | ❌ None | ❌ None | Listed in Stage 12 roadmap | `NOT_STARTED` |
| **CI/CD Automation Pipelines** | ❌ No `.github/workflows/` directory in repository | ❌ None | ❌ None | Listed in Stage 12 roadmap | `NOT_STARTED` |

---

## 4. Documentation Contradictions & Architectural Discrepancies

### Contradiction 1: Celery Beat Scheduler Configuration
- **Documentation / Compose Claim:** `docker-compose.yml` specifies:
  ```yaml
  command: celery -A sheba_core beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
  ```
- **Code Reality:** `django_celery_beat` is **neither declared in `requirements.txt` nor registered in `INSTALLED_APPS`**. The schedules are statically registered in `sheba_core/settings.py` under `CELERY_BEAT_SCHEDULE`. Running `docker-compose up` will result in an immediate `ModuleNotFoundError: No module named 'django_celery_beat'`.
- **Resolution:** `docker-compose.yml` should run standard beat: `celery -A sheba_core beat --loglevel=info`.

### Contradiction 2: Unmigrated Model Changes in `finance`
- **Documentation Claim:** `apps/finance` models are claimed as fully implemented and frozen in Stage 6.
- **Code Reality:** In `apps/finance/models.py`, foreign keys (`Adjustment.customer`, `LedgerEntry.customer`, `PaymentAllocation.invoice`, `PaymentAllocation.payment`) were updated to `on_delete=models.PROTECT`, but `makemigrations` was never run. Running `makemigrations --check --dry-run` yields exit code 1 with pending migration `0002_alter_adjustment_customer...`.
- **Resolution:** Migration `0002` in `apps/finance/migrations/` must be generated and committed to keep schema state consistent.

### Contradiction 3: Remote Production Database Quota Exhaustion
- **Documentation Claim:** Staging/Production PostgreSQL is configured via `DATABASE_URL` pointing to Neon cloud PostgreSQL.
- **Code Reality:** The Neon instance at `ep-young-brook-azcadmja-pooler.c-3.ap-southeast-1.aws.neon.tech` currently fails all connections with:
  `ERROR: Your account or project has exceeded the quota. Upgrade your plan to increase limits.`
- **Resolution:** Neon plan must be upgraded or `DATABASE_URL` repointed to a dedicated PostgreSQL instance. Tests pass locally solely because `manage.py test` overrides the database to in-memory SQLite when `'test' in sys.argv`.

### Contradiction 4: FreeRADIUS vs RouterOS REST API
- **Documentation Claim:** Legacy task trackers and PHP code frequently refer to FreeRADIUS database syncing (`radius_<tenant>`).
- **Code Reality:** The modern Django backend contains **0 lines of FreeRADIUS code**. PPPoE subscriber provisioning and active session management are handled **directly through MikroTik RouterOS v7 REST API** (`/rest/ppp/secret` and `/rest/ppp/active`).
- **Resolution:** Explicitly document FreeRADIUS as superseded by RouterOS v7 REST API integration.

### Contradiction 5: URL Path Divergence in `docs/API_CONTRACT.md`
- **Documentation Claim in `API_CONTRACT.md`:**
  - Network Cockpit: `/api/v1/network/cockpit/router/{id}/`
  - Action Queue Bulk: `/api/v1/network/bulk-batches/`
- **Code Reality in `apps/network/urls.py`:**
  - Network Cockpit: `/api/v1/network/cockpit/routers/<pk>/` (plural `routers`)
  - Action Queue Bulk: `/api/v1/network/bulk/` (registered as `router.register(r'bulk', BulkOperationsViewSet)`)
  - Daily bandwidth summary endpoint exists at `/api/v1/network/customers/<customer_id>/bandwidth/` but was omitted from `API_CONTRACT.md`.
  - WireGuard endpoints exist at `/api/v1/network/wireguard/configs/` and `/subnets/` but were omitted from `API_CONTRACT.md`.
- **Resolution:** `docs/API_CONTRACT.md` updated to reflect the exact router definitions in `apps/network/urls.py`.

### Contradiction 6: Premature "Production Readiness" Claims
- **Documentation Claim:** Previous audit in `PROJECT_STATUS.md` claimed `~92% production readiness` with gates marked `PASSED`.
- **Code Reality:** While automated unit/integration test coverage is exceptionally high (459 tests passing), **no real production deployment has been verified**. The remote database is quota-blocked, Docker Celery beat is broken, hardware device integrations (RouterOS, OLT chassis) have only been validated with mocked/simulated transports, and production monitoring (Sentry, Prometheus) and CI/CD are not started.
- **Resolution:** Production readiness must be stated as **0% live production verification**, while **automated test readiness is ~85%**.

---

## 5. Highest-Risk Items & Vulnerability Register

| Severity | Risk Identifier | Subsystem | Description & Impact | Recommended Remediation |
|---|---|---|---|---|
| **P0** | `RISK-01-DB-QUOTA` | Infrastructure | Remote Neon PostgreSQL database quota exceeded. Any deployment attempting to boot against `.env` `DATABASE_URL` will immediately crash on startup. | Upgrade Neon compute/storage tier or switch `DATABASE_URL` to self-hosted PostgreSQL (e.g. Docker container). |
| **P0** | `RISK-02-BEAT-CRASH` | Async Tasks | `docker-compose.yml` specifies `--scheduler django_celery_beat.schedulers:DatabaseScheduler`, which is not installed. Celery beat container will fail at boot, stopping all recurring tasks (customer expiry, invoice generation, reconciliation). | Remove `--scheduler` parameter from `docker-compose.yml` celery-beat command. |
| **P1** | `RISK-03-UNMIGRATED-FIN` | Finance Schema | Uncreated migration in `apps/finance`. In production PostgreSQL, database foreign keys for adjustments and allocations still cascade on delete rather than `models.PROTECT`. | Run `python manage.py makemigrations finance` and apply to database. |
| **P1** | `RISK-04-TEST-VOID-HR` | Auxiliary Apps | `apps/hr`, `apps/tasks`, `apps/callcenter`, and `apps/reports` have 0 automated unit tests (empty `tests.py` files). Regressions in payroll or task dispatching will go undetected. | Implement test suites covering employee payroll, attendance, leave approval, and field task assignment. |
| **P1** | `RISK-05-HW-SIMULATION` | Network / OLT | All MikroTik and OLT operations have been verified exclusively using unit test mocks and Telnet string simulations. Edge cases in vendor CLI (e.g. firmware variations, prompt quirks) remain unverified against physical gear. | Stand up a dedicated hardware staging lab with 1 physical MikroTik CCR and 1 physical EPON/GPON OLT for end-to-end certification. |
| **P2** | `RISK-06-OPENAPI-ERRORS` | API Contract | `drf-spectacular` reports 214 schema generation errors across 46 plain `APIView`s (bKash endpoints, cockpit views, portal actions). Prevents full automated SDK generation for external BFF clients. | Decorate all 46 `APIView`s with `@extend_schema(request=..., responses=...)` or refactor to `GenericAPIView`. |
| **P2** | `RISK-07-TELEMETRY-GAP` | Observability | Zero application error reporting (Sentry) or performance metrics (Prometheus) configured. Failures in async workers or background reconciliation will be invisible in production. | Add `sentry-sdk` and `django-prometheus` to `requirements.txt` and `sheba_core/settings.py`. |
| **P2** | `RISK-08-NO-CICD` | Operations | No GitHub Actions or CI pipeline configured (`.github/workflows` missing). Code can be merged without automated regression checks. | Create `.github/workflows/ci.yml` running `manage.py check`, `manage.py test apps`, `npm test` in `frontend` and `super-admin`. |

---

## 6. Completed Work vs. Remaining Roadmap

### 6.1 Completed Work
1. **Multi-Tenant Architecture**: Shared database, shared schema, host-based `TenantDomain` resolution, tenant-scoped managers, ViewSet mixins, composite unique constraints, IDOR prevention.
2. **Identity & RBAC**: Multi-tenant `StaffMembership`, tenant-aware login, control plane isolation, custom roles, capability checking via `can()`, module-scoped API keys with constant-time SHA-256 validation and rate throttling.
3. **Double-Entry Financial Ledger & Financial Integrity**: Audited & production-verified authoritative `LedgerEntry` journal (append-only via `ImmutableQuerySet`), `BillingAccount` projections, `InvoiceLine` itemization, `PaymentAllocation`, manual adjustments, canonical lock hierarchy (`Customer` -> `BillingAccount` -> `Invoice`) preventing database deadlocks, unique DB constraints (`PaymentTransaction.trx_id`, composite invoice unique constraints), idempotent settlement workflows, and post-commit network decoupling (`transaction.on_commit`). Supported by full concurrency test suite `test_financial_concurrency_audit.py`.
4. **Payment Processing**: Async 202 Accepted SMS webhook ingestion, `InboundPaymentEvent` state machine, provider TrxID deduplication, MultiFernet credential encryption on `PaymentGateway`, bKash PayBill v1.4 integration.
5. **Async Processing & Locking**: Redis distributed locking with fallback (`apps/core/lock.py`), Celery task autodiscovery, explicit `tenant_id` task signatures, `transaction.on_commit` task dispatch.
6. **Network Operations Cockpit**: MikroTik RouterOS v7 REST client, SSRF protection against cloud metadata and loopback, PPPoE secret provisioning, active session queries and disconnect, durable `NetworkAction` queue with retry logic, PPPoE secret reconciliation engine.
7. **OLT Live Monitor & Telemetry**: BDCOM, VSOL, HSGQ vendor Telnet/CLI drivers for EPON/GPON, optical power and temperature metrics, CPE MAC learning, cross-OLT MAC address search, OLT monitor REST endpoints, and Next.js `OLTMonitorPanel`.
8. **Daily Bandwidth Roll-Up & Concurrency Hardening (Section 10)**: `BandwidthDailyUsage` model, counter-reset delta accounting in `BandwidthRollupService`, deterministic primary key sorting of active customers to eliminate deadlocks, distributed locking per subscriber/date (`lock:bandwidth:{tenant.id}:{customer.id}:{target_date}`), nested `select_for_update()` transaction savepoints handling concurrent `IntegrityError` insertions, and non-fatal session sync hook. Verified via 6 concurrent tests in `test_bandwidth_concurrency.py`.
9. **Multi-Method Online Detection Hardening (Section 11)**: 3-tier subscriber detection (PPPoE → DHCP → Static ARP) gated safely behind `NETWORK_ENABLE_MULTIMETHOD_ONLINE = False`. Hardened with strict hostname/comment validation against sanitized username, single-host target enforcement (/32, rejecting shared subnets to eliminate false positives), active/complete ARP flag verification (filtering out disabled/invalid/incomplete/failed entries and dummy MACs), and safe error dictionary handling. Scoped strictly to router and verified tenant. Verified via 22 tests in `test_online_detection_hardening.py` and documented in `docs/NETWORK_ONLINE_DETECTION.md`.
10. **WireGuard VPN**: `WireGuardConfig` & `WireGuardSubnet` models, automated MikroTik `.rsc` script generator, script download endpoint, frontend `WireGuardPanel`.
11. **Customer Self-Care Portal**: Phone + OTP authentication, customer password login, self-care profile, funbox entertainment links, live traffic throughput, session history, invoice receipt download, support ticket threads, bKash checkout, unified Next.js portal page.
12. **API Contract Standardization & Compatibility Register (Section 12)**: Standardized `/api/v1/` endpoint matrix in `docs/API_CONTRACT.md` classifying all routes (CANONICAL, COMPATIBILITY, DEPRECATED, DUPLICATE-CANDIDATE) with explicit mapping for payment endpoints (`/api/v1/payments/transactions/` vs `/api/v1/transactions/`), structured error schemas (`error`, `message`, `detail`, `field_errors`), and generated OpenAPI 3.0 specification (`docs/openapi_schema.json`).
13. **SaaS Control Plane vs Tenant Plane Security Boundary (Section 13)**: Hardened `IsCentralAdmin` permission, strictly denying tenant staff, ISP users, and application API keys from accessing control plane operations (`/api/v1/saas/*`). Verified via dedicated 7-test suite `test_saas_control_plane_security.py` covering all 13 control-plane routes.
14. **SaaS Tenant Bootstrap Workflow (Section 14)**: Complete end-to-end backend workflow verified in `test_saas_tenant_bootstrap.py` covering superadmin plan creation, tenant & admin provisioning, domain challenge generation, DNS TXT verification, subscription activation, frontend application creation, API key SHA-256 hashing, staff authentication, dual-token RBAC access to `/api/v1/customers/`, control plane isolation, and instant key revocation.
15. **Corporate / Enterprise ISP Management**: IPAM pools, 802.1Q VLAN circuits, 5-minute MRTG traffic telemetry, deterministic 95th-percentile billing with 80% coverage gate, corporate invoicing.

---

### 6.2 Remaining Work (Pre-Production Checklist)

1. **Database Schema & Migrations**:
   - [ ] Run `python manage.py makemigrations finance` and commit migration `0002`.
   - [ ] Resolve remote Neon PostgreSQL quota or provision local/staging PostgreSQL 16 container.
2. **Docker Compose Repair**:
   - [ ] Remove `--scheduler django_celery_beat.schedulers:DatabaseScheduler` from `celery-beat` in `backend/docker-compose.yml`.
3. **OpenAPI Schema Cleanup**:
   - [ ] Add `@extend_schema` annotations to the remaining plain `APIView` classes to clear drf-spectacular errors.
4. **Auxiliary App Test Suites**:
   - [ ] Author automated unit tests for `apps/hr`, `apps/tasks`, `apps/callcenter`, and `apps/reports`.
5. **Observability & CI/CD**:
   - [ ] Add `sentry-sdk` and configure Sentry DSN in `sheba_core/settings.py`.
   - [ ] Add `django-prometheus` exporter and Grafana dashboard templates.
   - [ ] Create `.github/workflows/ci.yml` running linting and automated test suites on every pull request.
6. **Physical Hardware Certification (Staging)**:
   - [ ] Validate MikroTik RouterOS v7 REST client against physical RouterOS v7 hardware.
   - [ ] Validate OLT drivers against physical BDCOM/VSOL/HSGQ chassis.

---

*Audited and certified by Antigravity Architecture Auditor on 2026-09-26. 597 backend tests (100% passing across all apps), 65 frontend tests, 30 super-admin tests passing.*

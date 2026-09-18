# Stage 11: Corporate / Enterprise ISP Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full enterprise and corporate customer broadband management with multi-connection leased lines, dedicated IP address pools, VLAN assignment, 5-minute time-series telemetry, deterministic 95th-percentile burst billing, double-entry financial ledger integration, and an ISP Admin frontend.

**Architecture:** A dedicated Django app `apps/corporate/` integrated into the modular monolith and shared PostgreSQL schema. Corporate accounts anchor to `customers.Customer` for financial unification with `billing.Invoice` and `finance.LedgerEntry`. Telemetry and p95 calculations execute asynchronously via Celery with Redis distributed locks.

**Tech Stack:** Django 5/6, Django REST Framework, PostgreSQL, Redis, Celery, drf-spectacular, Next.js 16 (Turbopack), TypeScript, Lucide React.

**Spec:** [`docs/superpowers/specs/2026-09-18-corporate-enterprise-isp-management-design.md`](file:///home/taraldinn/Documents/Sheba%20codebase/docs/superpowers/specs/2026-09-18-corporate-enterprise-isp-management-design.md)

## Global Constraints
- ONE Django codebase, ONE shared PostgreSQL schema (no database-per-tenant).
- Tenant identity strictly derived from HTTP Host header (`request.tenant`).
- `finance.LedgerEntry` is the immutable single financial source of truth (no second ledger).
- Hardware access (MikroTik) service-mediated only; network calls strictly outside DB transactions.
- Telemetry sampling interval: 5 minutes (300 seconds); p95 calculated at `ceil(0.95 * N)` on aggregate circuit sum.
- Financial arithmetic strictly using `Decimal` with `.quantize(Decimal('0.01'))`.

---

### Task 1: Corporate App Scaffolding & Core Domain Models

**Files:**
- Create: `backend/apps/corporate/__init__.py`
- Create: `backend/apps/corporate/apps.py`
- Create: `backend/apps/corporate/models.py`
- Modify: `backend/sheba_core/settings.py` (add `'apps.corporate'` to `INSTALLED_APPS`)
- Test: `backend/apps/corporate/tests/test_corporate_models.py`

**Interfaces:**
- Consumes: `apps.core.models.Tenant`, `apps.customers.models.Customer`, `apps.network.models.Router`
- Produces: `CorporateCustomer`, `CorporateConnection` models with multi-tenant scoping and validation

- [ ] **Step 1: Write failing model unit tests**
  - Verify `CorporateCustomer` requires `tenant` and `company_name`.
  - Verify `CorporateCustomer` links 1:1 to `Customer`.
  - Verify `CorporateConnection` links to `CorporateCustomer` and enforces tenant match with router.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_models`
  - Expected: `ModuleNotFoundError: No module named 'apps.corporate'`
- [ ] **Step 3: Create app and implement models**
  - Create `apps/corporate/apps.py` with `name = 'apps.corporate'`.
  - Add `'apps.corporate'` to `INSTALLED_APPS` in `sheba_core/settings.py`.
  - Define `CorporateCustomer` and `CorporateConnection` in `apps/corporate/models.py`.
  - Generate migrations: `backend/venv/bin/python backend/manage.py makemigrations corporate`.
- [ ] **Step 4: Run test to verify it passes**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_models`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add backend/apps/corporate/ backend/sheba_core/settings.py`
  - `git commit -m "feat(corporate): scaffold corporate app and core domain models"`

---

### Task 2: Dedicated IP & VLAN Management

**Files:**
- Modify: `backend/apps/corporate/models.py`
- Create: `backend/apps/corporate/services/ipam.py`
- Create: `backend/apps/corporate/services/vlan.py`
- Test: `backend/apps/corporate/tests/test_ip_vlan.py`

**Interfaces:**
- Consumes: `CorporateConnection`, `Router`
- Produces: `CorporateIPPool`, `CorporateIPAddress`, `CorporateVLAN`, `IPAllocationService`, `VLANAssignmentService`

- [ ] **Step 1: Write failing IP and VLAN tests**
  - Test transactional allocation: IP address bound to `CorporateConnection` changes status to `ALLOCATED`.
  - Test cross-tenant IP allocation prevention.
  - Test duplicate VLAN ID on same router interface is rejected.
  - Test releasing IP address makes it available again.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_ip_vlan`
  - Expected: FAIL with missing classes
- [ ] **Step 3: Implement models and services**
  - Implement `CorporateIPPool`, `CorporateIPAddress`, and `CorporateVLAN` in `apps/corporate/models.py`.
  - Implement `IPAllocationService` with `allocate_ip(tenant, pool, connection)` and `release_ip(tenant, ip_address)` using `select_for_update()`.
  - Implement `VLANAssignmentService` with `assign_vlan(tenant, router, vlan_id, interface_name, connection)`.
  - Run `makemigrations corporate`.
- [ ] **Step 4: Run test to verify it passes**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_ip_vlan`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add backend/apps/corporate/`
  - `git commit -m "feat(corporate): implement dedicated IP pools and VLAN assignment services"`

---

### Task 3: Bandwidth Telemetry & 95th Percentile Engine

**Files:**
- Modify: `backend/apps/corporate/models.py`
- Create: `backend/apps/corporate/services/p95_calculator.py`
- Create: `backend/apps/corporate/services/telemetry.py`
- Test: `backend/apps/corporate/tests/test_p95_calculation.py`

**Interfaces:**
- Consumes: `CorporateConnection`, `CorporateTrafficSample`, `MikroTikTrafficService`
- Produces: `CorporateTrafficSample`, `CorporateBillingPeriod`, `calculate_p95_for_period()`

- [ ] **Step 1: Write deterministic 95th-percentile tests with fixtures**
  - Fixture 1: Simple 100-sample dataset where 95th percentile is verified mathematically.
  - Fixture 2: Multi-connection account with 2 links summing traffic at each 5-minute interval.
  - Fixture 3: Data coverage threshold test (< 80% coverage flags `INSUFFICIENT_DATA`).
  - Fixture 4: Burst calculation: $P_{95} > \text{CIR}$ produces exact expected Decimal burst charge.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_p95_calculation`
  - Expected: FAIL with missing models/service
- [ ] **Step 3: Implement telemetry models and p95 calculation engine**
  - Add `CorporateTrafficSample` and `CorporateBillingPeriod` to `apps/corporate/models.py`.
  - Implement `calculate_p95_for_period(tenant, corporate_customer, period_start, period_end)` in `p95_calculator.py`.
  - Implement `TelemetryIngestService.record_sample()` in `telemetry.py`.
  - Run `makemigrations corporate`.
- [ ] **Step 4: Run test to verify it passes**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_p95_calculation`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add backend/apps/corporate/`
  - `git commit -m "feat(corporate): implement telemetry model and deterministic 95th percentile engine"`

---

### Task 4: Corporate Invoicing & Financial Ledger Integration

**Files:**
- Create: `backend/apps/corporate/services/billing.py`
- Modify: `backend/apps/corporate/models.py`
- Test: `backend/apps/corporate/tests/test_corporate_billing.py`

**Interfaces:**
- Consumes: `CorporateBillingPeriod`, `billing.Invoice`, `finance.InvoiceLine`, `finance.LedgerEntry`, `finance.BillingAccount`
- Produces: `CorporateBillingService.finalize_period_and_invoice(tenant, period_id)`

- [ ] **Step 1: Write corporate billing and ledger tests**
  - Verify finalized billing period generates standard `billing.Invoice`.
  - Verify itemized `InvoiceLine`s for Base Committed CIR and 95th Percentile Burst overage.
  - Verify `finance.LedgerEntry` is created with type `INVOICE` and matching debit amount.
  - Verify customer `BillingAccount.balance` reflects the invoice due amount.
  - Verify invoice creation is idempotent (cannot invoice twice for same period).
- [ ] **Step 2: Run test to verify it fails**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_billing`
  - Expected: FAIL with missing billing service
- [ ] **Step 3: Implement CorporateBillingService**
  - In `apps/corporate/services/billing.py`, implement `finalize_period_and_invoice()` inside `transaction.atomic()`.
  - Validate period status is `CALCULATED`.
  - Create `billing.Invoice` and line items.
  - Create append-only `finance.LedgerEntry`.
  - Update `BillingAccount` summary fields.
  - Set period status to `INVOICED`.
- [ ] **Step 4: Run test to verify it passes**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_billing`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add backend/apps/corporate/`
  - `git commit -m "feat(corporate): integrate corporate billing with InvoiceLine and LedgerEntry"`

---

### Task 5: RBAC Permissions, Roles & API Scopes

**Files:**
- Create: `backend/apps/corporate/permissions.py`
- Modify: `backend/apps/authentication/management/commands/seed_permissions.py`
- Modify: `backend/apps/core/models.py` (update API scope choices if needed)
- Test: `backend/apps/corporate/tests/test_corporate_rbac.py`

**Interfaces:**
- Consumes: `apps.authentication.models.StaffMembership`, `TenantApiToken`
- Produces: Corporate permissions, `HasCorporatePermission` permission class

- [ ] **Step 1: Write RBAC and scope tests**
  - Verify staff with `corporate.view` can view corporate records.
  - Verify staff without `corporate.billing.manage` cannot trigger billing.
  - Verify API tokens with `corporate:read` can read but not modify.
  - Verify API tokens without corporate scopes are rejected.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_rbac`
  - Expected: FAIL with missing permissions
- [ ] **Step 3: Register permissions and permission classes**
  - Add `corporate.*` permissions in `seed_permissions.py`.
  - Implement `HasCorporatePermission` in `apps/corporate/permissions.py`.
  - Register API scopes in `TenantApiToken`.
- [ ] **Step 4: Run test to verify it passes**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_rbac`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add backend/apps/corporate/ backend/apps/authentication/ backend/apps/core/`
  - `git commit -m "feat(corporate): implement capability RBAC and external API scopes"`

---

### Task 6: REST API Layer (Serializers, ViewSets & URLs)

**Files:**
- Create: `backend/apps/corporate/serializers.py`
- Create: `backend/apps/corporate/views.py`
- Create: `backend/apps/corporate/urls.py`
- Modify: `backend/sheba_core/urls.py` (mount `/api/v1/corporate/`)
- Test: `backend/apps/corporate/tests/test_corporate_api.py`

**Interfaces:**
- Consumes: Corporate models, `TenantScopedViewSetMixin`, `HasCorporatePermission`
- Produces: REST endpoints under `/api/v1/corporate/`

- [ ] **Step 1: Write API endpoint tests**
  - Test CRUD on `/api/v1/corporate/customers/` (tenant-scoped).
  - Test cross-tenant IDOR rejection (HTTP 404).
  - Test `/api/v1/corporate/connections/{id}/status/` transitions.
  - Test IP allocation and release endpoints.
  - Test `/api/v1/corporate/billing-periods/{id}/calculate/` and `/generate-invoice/`.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_api`
  - Expected: FAIL with 404 on unmounted URLs
- [ ] **Step 3: Implement serializers, views, and wire URLs**
  - In `apps/corporate/serializers.py`: `CorporateCustomerSerializer`, `CorporateConnectionSerializer`, `CorporateIPPoolSerializer`, `CorporateIPAddressSerializer`, `CorporateVLANSerializer`, `CorporateBillingPeriodSerializer`, `CorporateTrafficSampleSerializer`.
  - In `apps/corporate/views.py`: `CorporateCustomerViewSet`, `CorporateConnectionViewSet`, `CorporateIPPoolViewSet`, `CorporateIPAddressViewSet`, `CorporateVLANViewSet`, `CorporateBillingPeriodViewSet`, `CorporateTelemetryViewSet`.
  - Mount in `apps/corporate/urls.py` and `sheba_core/urls.py`.
- [ ] **Step 4: Run test to verify it passes**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_api`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add backend/apps/corporate/ backend/sheba_core/urls.py`
  - `git commit -m "feat(corporate): implement REST API endpoints with tenant isolation"`

---

### Task 7: Celery Asynchronous Tasks & Distributed Locking

**Files:**
- Create: `backend/apps/corporate/tasks.py`
- Modify: `backend/sheba_core/settings.py` (add Celery Beat schedule for telemetry)
- Test: `backend/apps/corporate/tests/test_corporate_tasks.py`

**Interfaces:**
- Consumes: `apps.core.lock.distributed_lock`, `MikroTikTrafficService`, Celery worker
- Produces: `collect_corporate_telemetry`, `calculate_corporate_p95_task`, `generate_monthly_corporate_invoices`

- [ ] **Step 1: Write Celery task tests**
  - Test `collect_corporate_telemetry(tenant_id)` records traffic samples.
  - Test `calculate_corporate_p95_task(tenant_id, period_id)` acquires Redis lock and calculates p95.
  - Test task idempotency and tenant propagation.
- [ ] **Step 2: Run test to verify it fails**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_tasks`
  - Expected: FAIL with missing tasks
- [ ] **Step 3: Implement tasks with distributed locks**
  - Implement `collect_corporate_telemetry`, `calculate_corporate_p95_task`, and `generate_monthly_corporate_invoices` in `apps/corporate/tasks.py`.
  - Configure beat periodic schedule in `sheba_core/settings.py`.
- [ ] **Step 4: Run test to verify it passes**
  - Run: `backend/venv/bin/python backend/manage.py test apps.corporate.tests.test_corporate_tasks`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add backend/apps/corporate/tasks.py backend/sheba_core/settings.py`
  - `git commit -m "feat(corporate): implement Celery telemetry collection and billing tasks"`

---

### Task 8: ISP Admin Frontend — Corporate Dashboard & Customer Management

**Files:**
- Create: `frontend/src/app/corporate/page.tsx`
- Create: `frontend/src/app/corporate/customers/page.tsx`
- Modify: `frontend/src/components/layout/sidebar.tsx` (add Corporate navigation item)
- Modify: `frontend/src/lib/api.ts` (add corporate client methods)

- [ ] **Step 1: Add Corporate API client methods**
  - Add `getCorporateCustomers()`, `createCorporateCustomer()`, `getCorporateOverview()` in `frontend/src/lib/api.ts`.
- [ ] **Step 2: Add sidebar navigation**
  - In `frontend/src/components/layout/sidebar.tsx`, add `{ title: 'Corporate / Enterprise', href: '/corporate', icon: Building2 }`.
- [ ] **Step 3: Implement Corporate Dashboard page**
  - Summary cards: Total Corporate Accounts, Active Leased Lines, Committed Bandwidth (Gbps), Estimated Monthly Burst Revenue.
  - Recent enterprise alerts and activity feed.
- [ ] **Step 4: Implement Corporate Customers page**
  - Searchable, filterable table of enterprise accounts with committed CIR, status, and quick actions.
  - Create Corporate Customer modal with validation.
- [ ] **Step 5: Build frontend to verify**
  - Run: `export PATH="/home/taraldinn/.nvm/versions/node/v24.20.0/bin:$PATH" && cd frontend && npm run build`
  - Expected: Build succeeds in Turbopack with 0 errors.
- [ ] **Step 6: Commit**
  - `git add frontend/`
  - `git commit -m "feat(frontend): add corporate dashboard and customer management views"`

---

### Task 9: ISP Admin Frontend — Circuit Details, MRTG Telemetry & 95th Percentile Billing

**Files:**
- Create: `frontend/src/app/corporate/connections/page.tsx`
- Create: `frontend/src/app/corporate/telemetry/page.tsx`
- Create: `frontend/src/app/corporate/billing/page.tsx`

- [ ] **Step 1: Implement Circuit Management page**
  - Displays corporate circuits, connection types, router interfaces, dedicated IP assignments, and VLAN tags.
  - Dedicated IP allocation modal and VLAN assignment picker.
- [ ] **Step 2: Implement MRTG Telemetry page**
  - Interactive SVG/Canvas traffic chart showing 5-minute Inbound and Outbound Mbps for selected circuit or company aggregate.
  - Visual 95th percentile dashed reference threshold line.
- [ ] **Step 3: Implement Corporate Billing & p95 Period page**
  - Period calculation audit table with sample coverage percentage, p95 Mbps, committed CIR, and burst overage charge.
  - "Run p95 Calculation" and "Generate Invoice" action buttons.
- [ ] **Step 4: Build frontend to verify**
  - Run: `export PATH="/home/taraldinn/.nvm/versions/node/v24.20.0/bin:$PATH" && cd frontend && npm run build`
  - Expected: Build succeeds with 0 errors.
- [ ] **Step 5: Commit**
  - `git add frontend/`
  - `git commit -m "feat(frontend): add corporate circuits, MRTG telemetry, and p95 billing UI"`

---

### Task 10: Full Regression, Migration Verification & Documentation Freeze

**Files:**
- Modify: `MASTER_TASK.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/API_CONTRACT.md`

- [ ] **Step 1: Execute complete backend test suite**
  - Run: `backend/venv/bin/python backend/manage.py test apps`
  - Verify all 366+ original tests and new corporate tests pass (0 failures, 0 errors).
- [ ] **Step 2: Validate OpenAPI Schema**
  - Run: `backend/venv/bin/python backend/manage.py spectacular --validate`
  - Verify schema valid with all `/api/v1/corporate/` routes.
- [ ] **Step 3: Build all Next.js frontends**
  - `cd frontend && npm run build`
  - `cd super-admin && npm run build`
  - `cd docs && npm run build`
- [ ] **Step 4: Synchronize documentation**
  - Update `MASTER_TASK.md` marking Stage 11 completed.
  - Update `ARCHITECTURE.md` and `docs/API_CONTRACT.md` with corporate architecture and 95th percentile formula.
- [ ] **Step 5: Commit**
  - `git add MASTER_TASK.md ARCHITECTURE.md docs/`
  - `git commit -m "docs: finalize Stage 11 Corporate / Enterprise ISP documentation and roadmap freeze"`

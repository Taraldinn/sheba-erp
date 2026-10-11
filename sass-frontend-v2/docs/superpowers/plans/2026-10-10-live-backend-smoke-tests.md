# Live-Backend Integration Smoke Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a comprehensive, non-mocked Playwright integration smoke test suite running directly against the live Django backend (`VITE_API_BASE_URL` / `http://localhost:8000/api/v1`), covering real authentication, tenant resolution, role authorization, SaaS admin, ISP operations, and tenant customer/billing flows.

**Architecture:**
- Expand `tests/e2e-fixtures/live-env.ts` with accurate DRF Token authentication headers (`Token ${token}` rather than bare `Bearer`), correct tenant identification headers (`X-Tenant-ID`), and tenant host routing.
- Enhance `e2e/00-live.live.spec.ts` (and modular live specs if needed) to run end-to-end against live Django services for:
  1. SaaS Control Plane (Super-Admin login, `/saas/auth/me/`, `/saas/tenants/`, `/saas/domains/`, `/saas/backups/`)
  2. Tenant Portal Auth & Core Operations (Tenant admin login, `/auth/me/`, `/customers/`, `/packages/`, `/invoices/`, `/subscriptions/`)
  3. ISP Portal / Child-Tenant Visibility (`/auth/my-tenants/`, `/resellers/`, `/routers/`)
- Ensure npm/pnpm script `pnpm test:e2e:live` runs cleanly and self-documents environment overrides (`VITE_E2E_LIVE`, `VITE_E2E_API_BASE_URL`, `VITE_E2E_SUPER_USER`, `VITE_E2E_SUPER_PASS`, `VITE_E2E_TENANT_USER`, `VITE_E2E_TENANT_PASS`, `VITE_E2E_TENANT_SLUG`).

**Tech Stack:** Playwright, TanStack Start / React 19 frontend, Django DRF backend, PostgreSQL.

**Spec:** Integration Smoke Tests against Live Django Backend (`/home/taraldinn/Documents/Sheba codebase/sass-frontend-v2`).

## Global Constraints
- Do not break existing mock-mode test runs (`pnpm test:e2e`).
- Use standard DRF token header `Token <key>` as expected by the Django backend's `TokenAuthentication`.
- Tenant identification requires `X-Tenant-ID: <slug>` or hostname-based routing for non-superadmin API endpoints.
- Keep tests reliable and deterministic, avoiding destructive operations on real tenant data (read/list probes and non-destructive operations).

---

### Task 1: Fix Live Fixture Headers and Session Seeding in `live-env.ts`

**Files:**
- Modify: `tests/e2e-fixtures/live-env.ts:50-87`

**Interfaces:**
- Consumes: `LIVE_ENV`, `LiveSession`
- Produces: `liveAuthHeaders(token, tenantSlug)`, updated `liveMe()`, updated `liveSeedSession()` aligning with `client.ts` and `storage.ts`

- [ ] **Step 1: Write failing test / check live test failure**
Run: `export PATH="/home/taraldinn/.nvm/versions/node/v24.20.0/bin:$PATH"; PLAYWRIGHT_BROWSERS_PATH=0 VITE_E2E_LIVE=1 VITE_E2E_API_BASE_URL="http://localhost:8000/api/v1" VITE_E2E_SUPER_USER="admin" VITE_E2E_SUPER_PASS="admin123" VITE_E2E_TENANT_USER="fastnet-sylhet_admin" VITE_E2E_TENANT_PASS="tenant123" VITE_E2E_TENANT_SLUG="fastnet-sylhet" pnpm exec playwright test --project=live`
Expected: FAIL on `tenant login + customer list round-trip` due to 401 with `Bearer` header.

- [ ] **Step 2: Update `tests/e2e-fixtures/live-env.ts`**
Update `liveMe` and request helpers to use `Token ${token}` header and pass `X-Tenant-ID: ${LIVE_ENV.tenantSlug}`. Ensure `liveSeedSession` writes to the exact keys used by `storage.ts` and `auth-provider.tsx` (`saas_central_token`, `saas_tenant_token`, `saas_tenant_slug`, etc.).

- [ ] **Step 3: Run live test to verify fix**
Run: `pnpm exec playwright test --project=live`
Expected: PASS on all 4 initial tests.

- [ ] **Step 4: Commit**
`git add tests/e2e-fixtures/live-env.ts && git commit -m "test(e2e): fix token headers and session seeding in live-env fixture"`

---

### Task 2: Expand SaaS Control Plane Live Integration Smoke Tests

**Files:**
- Modify: `e2e/00-live.live.spec.ts`

**Interfaces:**
- Consumes: `liveLogin`, `liveSeedSession`, `liveApiUrl`
- Produces: Live smoke coverage for SaaS Super-Admin domains, tenants list, backups, audit logs, and employee lists

- [ ] **Step 1: Add live smoke tests for SaaS endpoints**
Add test cases in `e2e/00-live.live.spec.ts`:
- SaaS Tenants list renders real tenants returned from `/saas/tenants/`
- SaaS Domains list renders real domains from `/saas/domains/`
- SaaS Employees & audit endpoints check

- [ ] **Step 2: Run live spec**
Run: `pnpm exec playwright test --project=live -g "SaaS"`
Expected: PASS

- [ ] **Step 3: Commit**
`git add e2e/00-live.live.spec.ts && git commit -m "test(e2e): expand SaaS control plane live smoke tests"`

---

### Task 3: Expand Tenant Portal Live Integration Smoke Tests

**Files:**
- Modify: `e2e/00-live.live.spec.ts`

**Interfaces:**
- Consumes: `liveLogin`, `liveSeedSession`, `liveApiUrl`
- Produces: Live smoke coverage for Tenant ERP pages (`/tenant/customers`, `/tenant/packages`, `/tenant/invoices`, `/tenant/routers`, `/tenant/settings`)

- [ ] **Step 1: Add Tenant ERP live smoke tests**
Add test cases in `e2e/00-live.live.spec.ts`:
- Tenant customers list navigation and render without 401/403
- Tenant packages API response and UI render
- Tenant invoices and subscriptions list verify
- Tenant router/network list verify

- [ ] **Step 2: Run live spec**
Run: `pnpm exec playwright test --project=live -g "Tenant portal"`
Expected: PASS

- [ ] **Step 3: Commit**
`git add e2e/00-live.live.spec.ts && git commit -m "test(e2e): add tenant ERP live smoke tests against Django backend"`

---

### Task 4: Add ISP Portal Live Smoke Tests and Documentation

**Files:**
- Modify: `e2e/00-live.live.spec.ts`
- Modify: `README.md` or `docs/testing.md`

**Interfaces:**
- Consumes: Live ISP admin credentials / tenant owner setup
- Produces: ISP portal smoke tests + clear documentation on running live E2E test suite locally and in CI

- [ ] **Step 1: Add ISP Owner live smoke tests**
Test `/isp/tenants`, `/auth/my-tenants/`, and module overview with live ISP credentials.

- [ ] **Step 2: Run full live suite and verify mock suite regression**
Run:
1. `pnpm test:e2e` (Ensure mock suite passes without errors)
2. `VITE_E2E_LIVE=1 ... pnpm test:e2e:live` (Ensure full live smoke suite passes)

- [ ] **Step 3: Update documentation with execution examples**
Document environment flags and default dev credentials in `README.md`.

- [ ] **Step 4: Commit**
`git add e2e/00-live.live.spec.ts README.md && git commit -m "test(e2e): complete live backend smoke suite and documentation"`

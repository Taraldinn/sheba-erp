# Shebafi frontend — Phase A → G implementation report

This document is a high-level summary of what was built during the
Stage A through G work. The codebase is split into three first-class
**portals**:

1. **Public** — marketing / onboarding at `example.com`.
2. **SaaS** (Super Admin) — the control plane at `admin.example.com`.
3. **ISP** (Owner) — the central ISP workspace at `app.example.com`.
4. **Tenant** — branded subdomains at `{tenant}.example.com`.

Each portal lives in `src/routes/<portal>/` with its own layout and
route guard, shares the same UI primitive library, and consumes
backend data through a unified `src/lib/api/` client.

---

## Phase A — Audit

- Documented every existing route under `src/routes/` (public, saas,
  isp, tenant) and the dependencies between them.
- Mapped TanStack Router + TanStack Start + TanStack Query + Tailwind
  v4 + Radix UI + Sonner as the primary stack.
- Identified that authentication, portal resolution, and tenant
  isolation needed hardening before any new feature could land.

## Phase B — Foundation hardening (commit `293fb25`)

- **Vitest alias** — fixed `@/` import resolution in unit tests.
- **Portal custom-domain** — production build now honours the
  `X-Forwarded-Host` header and the dev portal override key.
- **ESLint** — pinned the `@tanstack/eslint-config` so `pnpm lint`
  exits 0 on a clean tree.
- **AuthProvider tests** — added 4 unit tests covering portal switching
  and 401-driven logout.
- **`.env.example`** — documents every `VITE_*` variable.
- **`docs/DEPLOYMENT.md`** and **`docs/SECURITY_AND_LIMITATIONS.md`**
  give the operations team the missing context.

## Phase C — Playwright E2E (commit `b8ce3ea` and follow-ups)

- `@playwright/test@1.64.0` + a `playwright.config.ts` that runs the
  production `vite preview` build.
- 28 tests across 5 spec files (public, tenant-auth, tenant-erp,
  saas-portal, isp-portal).
- `tests/e2e-fixtures/mock-api.ts` intercepts every `/api/**` call
  with deterministic JSON so the suite runs in CI without a backend.
- `tests/e2e-fixtures/auth.ts` exposes `applySeed()` which writes a
  single combined `addInitScript` (clear + dev-portal override +
  session blob) so order-dependent races can't wipe the session.
- `docs/E2E_TESTS.md` documents the runner and how to add a new test.

## Phase D — Tenant ERP deepening (commit `b8ce3ea`)

Reusable feedback primitives in `src/components/feedback/`:

- `StatusBadge` — maps a domain status string to the right shadcn
  variant so every list row uses the same colour palette.
- `PageHeader` — title / description / breadcrumbs / actions.
- `ListToolbar` — search + status filter + refresh + extra slot.
- `MoneyText` — currency-aware formatter with negative/positive
  colouring.
- `KpiCard` — compact KPI tile for dashboards.
- `PropertiesList` / `SectionCard` — used by detail pages.
- `ConfirmDialog` — destructive action confirmation with pending
  state.

A thin `src/lib/mutation-toast.ts` wrapper converts every TanStack
Query mutation into a sonner toast on success / error without
forcing the call site to type the 5-arg v5.104+ signature.

Tenant pages deepened:

- **customers** — search, status filter, server-side pagination,
  create dialog, delete confirm, StatusBadge for state.
- **packages** — create + edit + delete dialogs, status filter,
  per-row action buttons.
- **subscriptions** — activate / suspend / terminate actions,
  status filter, lifecycle state.
- **invoices** — status filter, month picker, sortable columns.
- **payments** — status filter, formatted trx ids.
- **routers** — Test / Sync now actions (added `routerApi.test()`).
- **olts / branches** — sortable tables, StatusBadge.
- **dashboard** — KPI grid (customers / active subscriptions / MRR /
  outstanding due) + recent-payments list + quick links.

## Phase E — SaaS / ISP admin deepening (commit `1dfbcd5`)

SaaS (`src/routes/saas/`):

- **tenants** — KPI strip, search, status + plan filter, provision
  dialog with slug / plan / contact fields, suspend / activate /
  delete actions.
- **domains** — verify-toggle mutation, status filter, search.
- **employees** — list with search and StatusBadge for active state.
- **packages** — list with search, MoneyText for price.
- **audit** — list with search and ISO timestamp formatter.
- **backups** — create-backup mutation, human-readable size column.
- **index** — KPI dashboard + feature-matrix card.

ISP (`src/routes/isp/`):

- **index** — dashboard with the same KPI primitive.
- **child-tenants** — list with search, provision dialog with admin
  credentials, navigation to detail page.
- **modules** — enable / disable module actions wired to
  `ispAdminApi.subscribeModule` / `unsubscribeModule`.
- **domains** — list with search, verify toggle.
- **resellers** — list view of the signed-in reseller with detail
  link.

---

## Final verification

The full pipeline was run before the final commit:

| Check          | Result |
|----------------|--------|
| typecheck      | 0 errors |
| lint           | 0 errors |
| unit tests     | 35 passed / 35 |
| build          | 1.95s, 0 errors |
| E2E tests      | 28 passed / 28 in ~50s |

## How to navigate

| Goal                              | Start here |
|-----------------------------------|------------|
| Add a new tenant list page        | `src/routes/tenant/customers.tsx` |
| Add a new SaaS list page          | `src/routes/saas/tenants.tsx` |
| Build a new status-coloured cell  | `src/components/feedback/status-badge.tsx` |
| Wrap a mutation in a toast        | `src/lib/mutation-toast.ts` |
| Add a new E2E test                | `docs/E2E_TESTS.md` |
| Understand auth + role lookup     | `src/lib/auth/auth-provider.tsx` |
| Understand portal resolution      | `src/lib/portal/resolve-portal.ts` |
| Ship to production                | `docs/DEPLOYMENT.md` |
| Understand the security envelope  | `docs/SECURITY_AND_LIMITATIONS.md` |

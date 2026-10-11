# Next.js + shadcn/ui Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `sass-frontend-v2` from TanStack Start/Router to Next.js 15 (App Router), retaining shadcn/ui and Radix UI components, without altering the underlying Django API integrations or data models.

**Architecture Changes:**
- **Routing:** Replace `src/routes/` with Next.js `app/` directory conventions.
- **Data Fetching:** Replace TanStack Loaders with React Server Components (RSC) and `fetch()`. Interactive mutations will use Next.js Server Actions or standard client-side `fetch`.
- **Authentication:** Shift from `localStorage` to `cookies` for authentication tokens. RSCs cannot access `localStorage`, so cookies are required for the Next.js server to fetch data on behalf of the user during SSR.
- **Build Tooling:** Swap Vite/Vitest for Next.js build pipeline (`next build`).

---

## Phase 1: Next.js Bootstrap and Infrastructure
**Goal:** Install Next.js and establish the foundational `app` structure alongside the existing code.

- [x] **Step 1: Install Dependencies**
  Install `next`, and Next.js compatible plugins (e.g. `eslint-config-next`). Remove conflicting TanStack dependencies temporarily from active imports or uninstall them later.
- [x] **Step 2: Configuration Setup**
  Create `next.config.js`. Update `tsconfig.json` for Next.js compatibility (plugins, paths). Update `package.json` scripts (`dev`, `build`, `start`).
- [x] **Step 3: Root Layout & Styling**
  Create `app/layout.tsx` and `app/globals.css`. Ensure `next-themes` and `shadcn/ui` theme providers are correctly wrapping the Next.js root layout.
- [x] **Step 4: Verify Bootstrap**
  Run `pnpm run dev` and ensure a basic Next.js `app/page.tsx` renders without CSS or hydration errors.

---

## Phase 2: Authentication & API Client Adaptations
**Goal:** Rearchitect session management to support Server-Side Rendering (SSR).

- [x] **Step 1: Cookie-Based Auth Provider**
  Create utilities to store and read `saas_central_token`, `saas_tenant_token`, and tenant slugs from browser cookies using `js-cookie` (client) and `next/headers` (server).
- [x] **Step 2: Update `client.ts` for RSCs**
  Modify the `fetchApi` wrappers to support passing tokens manually when called from Server Components, or automatically resolving them from `next/headers()` when on the server.
- [x] **Step 3: Auth Context/Middleware**
  Set up Next.js Middleware (`middleware.ts`) to handle route protection (e.g., redirecting unauthenticated users from `/saas/*` to `/saas/login`).

---

## Phase 3: Public & Auth Routes Migration
**Goal:** Migrate unauthenticated and login screens.

- [x] **Step 1: Public Landing Pages**
  Migrate `src/routes/_public/index.tsx` to `app/page.tsx`.
- [x] **Step 2: SaaS Login**
  Migrate `src/routes/saas/login.tsx` to `app/saas/login/page.tsx`. Implement cookie setting upon successful login.
- [x] **Step 3: Tenant & ISP Logins**
  Migrate `/tenant/login` and `/isp/login` to their respective `app/.../login/page.tsx` directories.

---

## Phase 4: SaaS Control Plane Migration
**Goal:** Migrate the SaaS Super-Admin portal.

- [x] **Step 1: SaaS Layout**
  Migrate the SaaS portal shell (sidebar, topbar) to `app/saas/(dashboard)/layout.tsx`. Ensure interactive components (like a profile dropdown) are marked with `"use client"`.
- [x] **Step 2: SaaS Pages**
  Migrate `domains.tsx`, `tenants.tsx`, `employees.tsx`, `backups.tsx`, and `audit.tsx`.
  Convert TanStack loaders to Server Components fetching data server-side.
- [x] **Step 3: Refactor UI Components**
  Add `"use client"` directives to shadcn/ui components in `src/components/ui/` where necessary (e.g., Dialogs, Dropdowns, Forms).

---

## Phase 5: Tenant ERP Portal Migration
**Goal:** Migrate the Tenant user portal.

- [x] **Step 1: Tenant Layout**
  Migrate the Tenant portal shell to `app/tenant/(dashboard)/layout.tsx`.
- [x] **Step 2: Core Tenant Pages**
  Migrate `/customers`, `/packages`, `/invoices`, `/subscriptions`, `/routers`, and `/settings`.
- [x] **Step 3: Data Fetching**
  Ensure the Next.js server correctly forwards the `X-Tenant-ID` header derived from the user's cookies to the Django API.

---

## Phase 6: ISP Portal Migration
**Goal:** Migrate the ISP owner portal.

- [x] **Step 1: ISP Layout**
  Migrate the ISP shell to `app/isp/(dashboard)/layout.tsx`.
- [x] **Step 2: ISP Pages**
  Migrate `/child-tenants`, `/modules`, `/resellers`, and `/domains`.

---

## Phase 7: E2E Tests & Cleanup
**Goal:** Restore the Playwright test suite and remove old TanStack artifacts.

- [x] **Step 1: E2E Session Seeding**
  Update `tests/e2e-fixtures/live-env.ts` to inject authentication into Cookies instead of `localStorage`.
- [x] **Step 2: Run Smoke Tests**
  Execute the Playwright mock and live suites against the new Next.js dev server. Fix any layout-shift or routing anomalies.
- [x] **Step 3: Prune Legacy Code**
  Uninstall `@tanstack/react-start`, `@tanstack/react-router`, `vite`, and `vitest` (if switching to Jest/Next). Delete the old `src/routes` directory and Vite config files.

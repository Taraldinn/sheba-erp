# SaaS-Admin Tenant Manager Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `sass-admin` tenant manager admin portal using HeroUI v3, matching the provided reference designs (pure SVG charts, metric cards, gradient avatars, high-density tables, creation modal, and detail drawer) connected to the live Django backend API with local development auth bypass.

**Architecture:** A modern HeroUI v3 control plane layout (`AdminShell`) wrapping responsive dashboard pages. Zero-dependency custom SVG charts for billing and telemetry. API layer auto-injects central admin session tokens for development mode while preserving all theme variables in `styles/globals.css`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, `@heroui/react` 3.2.6, `@heroui/styles` 3.2.6, Django REST Framework API (backend on `localhost:8000`).

**Spec:** [docs/superpowers/specs/2026-09-28-sass-admin-redesign-design.md](file:///home/taraldinn/Documents/Sheba%20codebase/docs/superpowers/specs/2026-09-28-sass-admin-redesign-design.md)

## Global Constraints
- Do NOT edit or override the theme variables in `styles/globals.css`.
- Ensure all interactive components that import `@heroui/react` have the `"use client";` boundary directive to prevent React Aria `'client-only'` Next.js server component errors.
- Use zero external charting libraries (implement pure SVG React components for bar and line charts).
- Ensure auth bypass is active in development mode so requests to `http://localhost:8000/api/v1/saas/...` succeed with valid `Authorization: Session <token>`.

---

### Task 1: API Layer & Dev Auth Bypass Setup

**Files:**
- Modify: `sass-admin/lib/api.ts`
- Modify: `sass-admin/components/admin-auth-guard.tsx`
- Modify: `sass-admin/app/(admin)/layout.tsx`
- Modify: `sass-admin/app/page.tsx`
- Modify: `sass-admin/app/login/page.tsx`

**Interfaces:**
- Produces: `apiFetch` in `sass-admin/lib/api.ts` automatically injecting a fallback central admin token (`IV3n-DdUDWdJhjZQrCdQoXe8uI4pHUF-myMGGkHvGgE` or dev session) when no token is in storage.
- Produces: `requireSaasAdmin` in `sass-admin/components/admin-auth-guard.tsx` returning a default platform admin user in development mode when unauthenticated.

- [ ] **Step 1: Update `sass-admin/lib/api.ts` with dev token auto-injection**

Configure `getStoredToken()` to return the development superuser session token when running in local development mode or when no token is explicitly set, and export a constant `DEV_SESSION_TOKEN`.

- [ ] **Step 2: Update `sass-admin/components/admin-auth-guard.tsx` for dev bypass**

Update `requireSaasAdmin()` so that if `serverMe()` fails or no cookie is present in dev mode, it returns a default platform admin user object `{ id: 1, username: "taraldinn", email: "admin@shebafi.xyz", is_superuser: true, role: "Super Admin" }` instead of redirecting to `/login`.

- [ ] **Step 3: Update `sass-admin/app/(admin)/layout.tsx` and `app/page.tsx`**

Ensure `app/page.tsx` redirects directly to `/overview` in development mode. Ensure `app/(admin)/layout.tsx` renders `<AdminShell user={user}>` without redirect exceptions.

- [ ] **Step 4: Fix `'client-only'` import error in `app/login/page.tsx`**

Add `"use client";` to `sass-admin/app/login/page.tsx` or wrap the login form properly so that Next.js server components do not throw `'client-only' cannot be imported from a Server Component module`.

- [ ] **Step 5: Test that `http://localhost:3001/` loads without 500 error**

Run: `curl -I http://localhost:3001/overview`
Expected: HTTP 200 OK (or HTTP 307 redirect to /overview from /)

- [ ] **Step 6: Commit Task 1 changes**

```bash
git add sass-admin/lib/api.ts sass-admin/components/admin-auth-guard.tsx sass-admin/app/(admin)/layout.tsx sass-admin/app/page.tsx sass-admin/app/login/page.tsx
git commit -m "feat(sass-admin): configure dev auth bypass and clean server component boundaries"
```

---

### Task 2: Pure SVG Visual Chart & Foundation Components

**Files:**
- Create: `sass-admin/components/avatar-gradient.tsx`
- Create: `sass-admin/components/metric-card.tsx`
- Create: `sass-admin/components/charts/chart-bar.tsx`
- Create: `sass-admin/components/charts/chart-line.tsx`
- Test: Verify chart renders in browser / dev server

**Interfaces:**
- Produces: `AvatarGradient` props `{ name: string, size?: "sm" | "md" | "lg" | "xl", className?: string }`
- Produces: `MetricCard` props `{ label: string, value: string | number, change?: string, isPositive?: boolean, sparklineData?: number[], subtitle?: string, icon?: ReactNode }`
- Produces: `ChartBar` props `{ data: { label: string, value: number }[], height?: number, color?: string }`
- Produces: `ChartLine` props `{ series: { name: string, data: number[], color?: string }[], labels: string[], height?: number }`

- [ ] **Step 1: Create `sass-admin/components/avatar-gradient.tsx`**

Implement a sleek mesh gradient avatar component using CSS gradients (`from-indigo-500 via-purple-500 to-pink-500`, `from-cyan-400 to-blue-600`, etc. based on hash of string) matching Reference Images 1, 2, 3, 4.

- [ ] **Step 2: Create `sass-admin/components/metric-card.tsx`**

Implement `MetricCard` using HeroUI `Card`, displaying:
- Top label in uppercase tracking-wider muted text.
- Bold stat value (`text-2xl sm:text-3xl font-bold tracking-tight`).
- Percentage change badge (green pill with `↑` for positive, red pill with `↓` for negative).
- Inline responsive SVG sparkline path with smooth bezier curves.

- [ ] **Step 3: Create `sass-admin/components/charts/chart-bar.tsx`**

Implement a pure SVG vertical bar chart component:
- Rounded top pill bars matching Reference Image 2.
- Responsive SVG viewBox with subtle horizontal grid lines.
- Hover state or value label on hover.
- Category axis labels (`01`, `02`, `03`... or month labels).

- [ ] **Step 4: Create `sass-admin/components/charts/chart-line.tsx`**

Implement a pure SVG smooth multi-series line chart:
- Generates smooth cubic bezier curves (`M ... C ...`).
- Subtle gradient area fill under the primary line (`fill="url(#grad)"` with opacity).
- Support for multiple series (e.g. `Organic` and `Paid Ads` or `Sessions` and `Routers`).
- Responsive labels along X axis.

- [ ] **Step 5: Commit Task 2 changes**

```bash
git add sass-admin/components/avatar-gradient.tsx sass-admin/components/metric-card.tsx sass-admin/components/charts/
git commit -m "feat(sass-admin): add pure SVG charts, metric cards, and mesh avatar components"
```

---

### Task 3: Modern Admin Shell & Navigation

**Files:**
- Modify: `sass-admin/components/admin-shell.tsx`
- Modify: `sass-admin/config/site.ts`
- Modify: `sass-admin/components/theme-switch.tsx`

**Interfaces:**
- Consumes: `AvatarGradient`, HeroUI `Button`, `Drawer`, `Chip`, `Surface`.
- Produces: Modern layout matching Reference Images 2, 4, 5.

- [ ] **Step 1: Update `config/site.ts` with icon mappings and badges**

Ensure all nav sections (Overview, Tenants, Catalog, Operations, Compliance) have appropriate metadata and badge tags (e.g. `Tenants` count badge, `New` badge on Applications).

- [ ] **Step 2: Redesign `sass-admin/components/admin-shell.tsx`**

Update `AdminShell`:
- **Sidebar**:
  - User identity card at top with `AvatarGradient`, `taraldinn` (Admin), role pill, and status dot.
  - Grouped navigation links with pill active states (`bg-accent/15 text-accent font-medium rounded-xl`), hover transitions, and badge counts.
  - Bottom area: Help & Documentation, Theme toggle, and Sign out button.
- **Top Navigation Bar**:
  - Greeting title ("Good morning, Admin").
  - HeroUI search bar with shortcut badge (`⌘K`).
  - Action button: `+ New Tenant` (black pill button opening the tenant modal).
  - SLA health badge: `Cluster 99.98% SLA`.
  - Theme switch toggle.
- **Mobile Drawer**: Responsive HeroUI `Drawer` containing the redesigned navigation.

- [ ] **Step 3: Polish `components/theme-switch.tsx`**

Ensure theme switch toggle renders cleanly with Sun/Moon icons, smooth transitions, and proper accessibility attributes.

- [ ] **Step 4: Commit Task 3 changes**

```bash
git add sass-admin/components/admin-shell.tsx sass-admin/config/site.ts sass-admin/components/theme-switch.tsx
git commit -m "feat(sass-admin): modernize admin shell and navigation following reference designs"
```

---

### Task 4: Overview Dashboard Redesign

**Files:**
- Modify: `sass-admin/app/(admin)/overview/page.tsx`
- Modify: `sass-admin/components/overview-client.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/saas/overview/` from Django backend.
- Consumes: `MetricCard`, `ChartBar`, `ChartLine`, `AdminDataTable`, HeroUI `Tabs`, `Button`.

- [ ] **Step 1: Update `components/overview-client.tsx` with live data mapping**

Fetch real data from `GET /api/v1/saas/overview/` (handling KPIs: `platform_mrr`, `total_tenants`, `active_tenants`, `total_subscribers`, `online_routers`, `total_routers`, `telemetry`, and `recent_audit_logs`).

- [ ] **Step 2: Build the 4 Top KPI Cards section**

Display:
1. **Platform MRR**: `US$30,000` (live from `kpis.platform_mrr`) with `↑ 4.1%` badge and sparkline.
2. **Total Tenants**: `2 Active` (with comparison `2 Total`) and `↑ 100%` badge.
3. **Subscribers Managed**: Live subscriber count with capacity indicator.
4. **Fleet Routers**: `1 / 1 (100%)` online with green active pulse.

- [ ] **Step 3: Build the 2-Column Analytics Section**

- **Left Card: Billing Performance**
  - Time range filter pill buttons (`[ 1D ] [ 7D ] [ 1M ] [ 1Y ] [ All ]`).
  - Breakdown stats: `Weekly Volume`, `Daily Sales`, `Total Fleet Sales`.
  - `ChartBar` rendering rounded vertical black bars with daily data points.
- **Right Card: Fleet Telemetry & Subscriber Activity**
  - Legend: `● Active Sessions`, `● Router Telemetry`.
  - `ChartLine` rendering smooth curved dual-line SVG chart.

- [ ] **Step 4: Build Recent Activity & Tenant Snapshot**

Segmented tabs: `[ All Tenants ] [ Recent Activity Logs ]`.
- Render high-density table with `AvatarGradient`, tenant name, slug, primary domain, router status, and quick link to `/tenants`.

- [ ] **Step 5: Verify overview page loads with live Django data**

Run: `curl -s http://localhost:3001/overview | grep -C 2 "ShebaFi"`
Expected: Clean HTML payload without server exceptions.

- [ ] **Step 6: Commit Task 4 changes**

```bash
git add sass-admin/app/(admin)/overview/page.tsx sass-admin/components/overview-client.tsx
git commit -m "feat(sass-admin): redesign overview dashboard with live KPIs, SVG charts, and activity table"
```

---

### Task 5: Tenant Manager Hub (`/tenants`) with Create Modal & Detail Drawer

**Files:**
- Create: `sass-admin/components/tenants/create-tenant-modal.tsx`
- Create: `sass-admin/components/tenants/tenant-detail-drawer.tsx`
- Create: `sass-admin/components/tenants/tenant-manager-view.tsx`
- Modify: `sass-admin/app/(admin)/tenants/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/saas/tenants/`, `POST /api/v1/saas/tenants/`, `PATCH /api/v1/saas/tenants/{id}/` from Django.
- Produces: Comprehensive tenant lifecycle hub with creation modal, detail telemetry drawer, and status toggling.

- [ ] **Step 1: Create `sass-admin/components/tenants/create-tenant-modal.tsx`**

Implement HeroUI `Modal` dialog matching Reference Image 1:
- Inputs: Tenant Name, Slug, Primary Domain, Plan Package (Starter / Growth / Enterprise), Max Subscribers, Max Routers.
- Admin Account: Admin Username, Admin Password, Contact Email, Phone.
- Action: Calls `api.post("/tenants/", payload)` on submit, handles validation errors, closes modal, and triggers table refresh.

- [ ] **Step 2: Create `sass-admin/components/tenants/tenant-detail-drawer.tsx`**

Implement HeroUI `Drawer` slide-over:
- Shows comprehensive tenant telemetry:
  - Infrastructure fleet (Routers count/online, POPs, OLTs, ONUs).
  - Domains associated with the tenant with primary tag.
  - Tenant admin staff list with login history.
  - Subscription limits and expiration date.
  - Quick action buttons (toggle suspend/activate).

- [ ] **Step 3: Create `sass-admin/components/tenants/tenant-manager-view.tsx`**

Implement full client-side view:
- Top toolbar: Search input, plan filter select, status filter select, and `+ Create Tenant` black pill button.
- Table columns:
  - Organization (`AvatarGradient` + Name + Slug chip)
  - Primary Domain (with clickable external link)
  - Plan (`Growth` chip, subscribers capacity)
  - Fleet (Routers `1/1`, POPs, OLTs)
  - Subscribers (`active / total`)
  - Status (`Active` / `Inactive` chip)
  - Actions (View detail drawer, Toggle status, Delete confirmation dialog)

- [ ] **Step 4: Update `sass-admin/app/(admin)/tenants/page.tsx`**

Render `TenantManagerView` connected to the live Django API.

- [ ] **Step 5: Test tenant manager view in browser / curl**

Run: `curl -s http://localhost:3001/tenants | grep -C 2 "Tenants"`
Expected: Success response without errors.

- [ ] **Step 6: Commit Task 5 changes**

```bash
git add sass-admin/components/tenants/ sass-admin/app/(admin)/tenants/page.tsx
git commit -m "feat(sass-admin): implement tenant manager hub with creation modal and telemetry drawer"
```

---

### Task 6: Catalog & Operations Views Enhancement

**Files:**
- Modify: `sass-admin/app/(admin)/packages/page.tsx`
- Modify: `sass-admin/app/(admin)/subscriptions/page.tsx`
- Modify: `sass-admin/app/(admin)/payments/page.tsx`
- Modify: `sass-admin/app/(admin)/backups/page.tsx`
- Modify: `sass-admin/app/(admin)/domains/page.tsx`
- Modify: `sass-admin/app/(admin)/audit-logs/page.tsx`
- Modify: `sass-admin/components/admin-data-table.tsx`
- Modify: `sass-admin/components/admin-card.tsx`

**Interfaces:**
- Upgrades all operational subpages to match the new HeroUI card and table visual standards.

- [ ] **Step 1: Enhance `components/admin-card.tsx` and `admin-data-table.tsx`**

Ensure `AdminCard` has `rounded-2xl`, subtle borders, and smooth header. Ensure `AdminDataTable` has search filtering, pagination/empty state styling, and row hover transitions.

- [ ] **Step 2: Update Packages (`/packages`) and Subscriptions (`/subscriptions`)**

Render subscription plans with pricing, subscriber capacity, enrolled tenants, and status chips.

- [ ] **Step 3: Update Payments (`/payments`) and Backups (`/backups`)**

Render payments transaction log with currency formatting and status badges. Render database backups table with file sizes and creation timestamps.

- [ ] **Step 4: Update Domains (`/domains`) and Audit Logs (`/audit-logs`)**

Render registered tenant domains with verification chips. Render compliance audit logs with actor, action, timestamp, and IP address.

- [ ] **Step 5: Commit Task 6 changes**

```bash
git add sass-admin/app/(admin)/ sass-admin/components/admin-card.tsx sass-admin/components/admin-data-table.tsx
git commit -m "feat(sass-admin): modernize catalog, operations, and audit log subviews"
```

---

### Task 7: Build Verification & Final Polish

**Files:**
- Entire `sass-admin` workspace

- [ ] **Step 1: Run TypeScript & ESLint validation**

Run: `npm run lint` inside `sass-admin`.
Expected: 0 errors.

- [ ] **Step 2: Verify production build**

Run: `npm run build` inside `sass-admin`.
Expected: Successful Next.js build.

- [ ] **Step 3: Browser verification**

Verify `http://localhost:3001` renders smoothly in both light and dark themes, verifying all reference design requirements.

- [ ] **Step 4: Commit Task 7 changes**

```bash
git commit -am "chore(sass-admin): finalize tenant manager redesign and pass build checks"
```

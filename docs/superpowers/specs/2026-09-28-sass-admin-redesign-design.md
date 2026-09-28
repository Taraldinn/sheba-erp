# Design Specification: SaaS-Admin Tenant Manager Portal Redesign

## 1. Overview & Objective
Redesign the **`sass-admin`** multi-tenant management portal using **HeroUI v3**, reflecting the modern dashboard aesthetic from the user's reference designs (sleek dark/light contrast, mesh gradient avatars, pill active states, bold metric KPI cards, pure SVG data charts, and interactive drawers/modals).

The redesign connects directly to the live Django backend API (`http://localhost:8000/api/v1/saas/...`) while bypassing authentication in local development mode, and keeps the user's defined theme variables in `styles/globals.css` completely intact.

---

## 2. Constraints & Design Guidelines
1. **Preserve `styles/globals.css`**: Do not edit or override the color variables in `styles/globals.css`. All components and layouts must consume `--background`, `--surface`, `--accent`, `--border`, `--separator`, and related CSS variables.
2. **HeroUI v3 Standards**:
   - Compound components API (`Card.Header`, `Card.Content`, `Modal`, `Drawer`, `Chip`, `Button`, etc.).
   - `"use client";` boundary for all client-facing interactive components to avoid React Aria `'client-only'` Next.js server-component conflicts.
   - Use `onPress` where appropriate for accessible HeroUI buttons.
3. **Pure SVG Custom Charts**: Zero external charting libraries (no Recharts/Chart.js). Lightweight, performant, SVG-based bar and line charts that reactively adapt to light and dark theme colors.
4. **Auth Bypass in Local Development**:
   - Automatically configure an active central admin session in `lib/api.ts` so calls to Django endpoints succeed seamlessly with `Authorization: Session <token>`.
   - Prevent redirect loops in `app/(admin)/layout.tsx` and `app/page.tsx` during development.

---

## 3. Architecture & File Layout

### 3.1 Layout & Shell (`components/admin-shell.tsx`, `components/theme-switch.tsx`)
- **Sidebar**:
  - Top profile section with mesh gradient avatar (`from-purple-500 via-indigo-500 to-cyan-400`), user handle (`taraldinn`), role chip (`Platform Admin`), and SLA health indicator.
  - Grouped navigation links with pill active states, hover effects, and counter chips.
  - Bottom controls: Quick documentation links, theme toggle, and sign out button.
  - Mobile responsive drawer powered by HeroUI `Drawer`.
- **Top Bar**:
  - Mobile hamburger trigger.
  - Greeting text ("Good morning, Admin").
  - HeroUI SearchField / input with keyboard shortcut hint (`⌘K`).
  - Primary quick action pill button (`+ New Tenant`).
  - Quick cluster health pill (`● Operational 99.98% SLA`).
  - Dark/light mode switch.

### 3.2 Overview Dashboard (`app/(admin)/overview/page.tsx`, `components/overview-client.tsx`)
- **4 Hero KPI Cards** (`components/metric-card.tsx`):
  - **Platform MRR / Monthly Volume**: Formatted currency with percentage change pill (`↑ 4.1%`) and SVG mini sparkline.
  - **Active Tenants**: Live count with total comparison and status badge.
  - **Subscribers Fleet**: Total subscribers across tenants.
  - **Fleet Routers Online**: Active vs total routers with online indicator.
- **Analytics Visualizations** (`components/charts/chart-bar.tsx`, `components/charts/chart-line.tsx`):
  - **Platform Billing Performance**: Rounded vertical SVG bar chart with time-range pill selectors (`1D`, `7D`, `1M`, `1Y`, `All`), weekly/daily breakdown metrics, and tooltips.
  - **Fleet Telemetry & Sessions**: Smooth curved dual-line SVG chart with active session and telemetry tracking over months/days.
- **Recent Activity & Tenant Snapshot Table**:
  - Tabs switching between `All Tenants` and `Recent Audit Logs`.
  - Filter and search bar.
  - Rows with avatar gradients, copyable IDs, router status, and action links.

### 3.3 Tenant Manager Hub (`app/(admin)/tenants/page.tsx`, `components/tenants/`)
- **Tenant Data Table & Toolbar**:
  - Search input with live client-side filtering.
  - Plan filter dropdown (`All`, `Starter`, `Growth`, `Enterprise`).
  - Status filter dropdown (`All`, `Active`, `Inactive`).
  - Action trigger: `+ Create Tenant`.
  - Table Columns:
    - Organization (Gradient Avatar + Name + Slug badge)
    - Primary Domain (domain link with external icon)
    - Plan & Quotas (plan chip, subscriber limit, router limit)
    - Fleet Telemetry (router count, online routers, POPs, OLTs)
    - Subscriber Count (active / total)
    - Admin (username badge + email)
    - Status (HeroUI soft Chip)
    - Actions (View Telemetry Drawer, Suspend/Activate, Delete)
- **Tenant Creation Modal** (`components/tenants/create-tenant-modal.tsx`):
  - Organization fields: Name, Slug, Primary Domain, Plan, Max Subscribers, Max Routers.
  - Admin credentials: Username, Password, Email, Contact Phone.
  - Submits to `POST /api/v1/saas/tenants/` and refreshes table.
- **Tenant Telemetry Detail Drawer** (`components/tenants/tenant-detail-drawer.tsx`):
  - Slide-over drawer with full telemetry (infrastructure fleet breakdown, domains list, admins list, billing status).

### 3.4 Catalog & Operations Views
- **Packages (`/packages`)**: View subscription tiers with pricing and limits.
- **Subscriptions (`/subscriptions`)**: View active subscriptions, renewal dates, and status.
- **Payments (`/payments`)**: Financial transactions log with amount, currency, method, and status.
- **Backups (`/backups`)**: Database backups table with file sizes and creation timestamps.
- **Domains (`/domains`)**: Registered domains with SSL and primary status.
- **Audit Logs (`/audit-logs`)**: Activity logs with actor, action, timestamp, and IP address.

### 3.5 API & Auth Bypass (`lib/api.ts`, `components/admin-auth-guard.tsx`)
- Detect local development or auth bypass flag.
- Default to superuser credentials and inject active `Authorization: Session <token>` header for all API requests.
- Prevent redirection to `/login` when auth bypass is active.

---

## 4. Verification & Testing
1. **Compilation & Build**:
   - Ensure `npm run dev` and `npm run build` succeed with zero TypeScript or ESLint errors.
   - Verify all client components have `"use client";` so no `'client-only'` errors occur.
2. **Visual & Interactive Verification**:
   - Verify layout matches the reference images in both Light and Dark modes.
   - Verify pure SVG charts render cleanly with responsive scaling.
   - Verify modals and drawers open, submit data, and dismiss properly.
   - Verify real Django backend data populates the tables and metrics.

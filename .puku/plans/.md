# Multi-Portal & Public Homepage Architecture: Audit & Implementation Plan

## 1. Portal Model Overview

```
                                  SHEBAFI ERP & PLATFORM
                                            │
        ┌───────────────────┬───────────────┴───────────────┬──────────────────────┐
        │                   │                               │                      │
        ▼                   ▼                               ▼                      ▼
   example.com      admin.example.xyz               app.example.xyz       {tenant}.example.com
 (or www.example.com)
  PUBLIC HOMEPAGE      SUPER ADMIN                     ISP PORTAL              TENANT PORTAL
  Marketing & Web    Global Platform Control      ISP ERP Operations & NOC   Branded ISP / Customer
```

| Portal | Hostname Pattern | Target Experience & Content |
|---|---|---|
| **PUBLIC_HOME** | `example.com`, `www.example.com`, `localhost:5174` (default dev) | Public ShebaFi Marketing Homepage (`src/pages/home/index.tsx`), Pricing, Features, Onboarding request (`/request`, `/onboarding/:slug`), Documentation, and Portal Switcher / Direct Login links. |
| **SUPER_ADMIN** | `admin.example.xyz`, `admin.localhost` | SaaS Global Control Plane (`src/pages/saas/*`): Tenant provisioning, subscription packages, audit logs, backup management, global feature matrix. |
| **ISP_ADMIN** | `app.example.xyz`, `app.localhost` | Central ISP Management Workspace: Multi-ISP account switcher / direct ISP workspace, ISP ERP modules (Billing, Network/MikroTik, Customers, Tickets, Staff). |
| **TENANT** | `{tenant}.example.com`, `{tenant}.localhost` | Isolated, white-labelled tenant portal for specific ISP staff & customers, with dynamic tenant branding (logo, colors, favicon, tenant-scoped login). |

---

## 2. Audit Findings (Current Baseline)

| Area | Current state | Impact on plan |
|---|---|---|
| **Frontend Codebase** | `sass-frontend` (Vite + React 19 + React Router 7 + React Aria + Tailwind v4.3) | One unified codebase handling all 4 domain experiences. |
| **Homepage Assets** | `src/pages/home/index.tsx` already contains a comprehensive, production-grade marketing landing page with `SiteHeader`, `SiteFooter`, hero stats, interactive preview, pricing tiers, and testimonials. | Directly wire `src/pages/home/index.tsx` to serve `PUBLIC_HOME` (apex domain / `example.com`). |
| **Styling & Tokens** | Design tokens are defined via CSS variables in [theme.css](file:///home/taraldinn/Documents/Sheba%20codebase/sass-frontend/src/styles/theme.css) (`--color-brand-*`). | Dynamic tenant branding applies overrides via CSS variables on the root document element. |
| **Portal Detection** | [plane.ts](file:///home/taraldinn/Documents/Sheba%20codebase/sass-frontend/src/lib/plane.ts) only knows dual planes: `central` / `tenant` / `dual`. | Replaced with pure `resolvePortal(hostname)` supporting `PUBLIC_HOME`, `SUPER_ADMIN`, `ISP_ADMIN`, `TENANT`. |
| **API Client** | [client.ts](file:///home/taraldinn/Documents/Sheba%20codebase/sass-frontend/src/api/client.ts) currently splits on `effectivePlane()`. | Refactored to read portal context from `PortalProvider` (proper base URLs, tenant headers, and storage isolation). |
| **Pre-existing TS Errors** | 32 baseline TS errors in `onboarding/wizard`, `request`, `home`, `tenant-bootstrap`, `app-layout`. | Fix errors in files touched during integration so `tsc` remains clean. |

---

## 3. Target Architecture

```mermaid
flowchart TD
  H["window.location.hostname"] --> R["resolvePortal(hostname)  src/portal/resolve-portal.ts"]
  R --> PC["PortalProvider (portal, tenantSlug)"]
  
  PC -->|PUBLIC_HOME| HP["Public Marketing Shell + Homepage (src/pages/home/index.tsx)"]
  PC -->|SUPER_ADMIN| SA["Super Admin Layout + SaaS Modules (src/pages/saas/*)"]
  PC -->|ISP_ADMIN| ISP["ISP ERP Layout + Operations Modules"]
  PC -->|TENANT| TN["Tenant Layout + Tenant Branding Provider + Tenant Modules"]

  PC --> API["api client: base URL, auth endpoints, scoped token key, X-Tenant-ID"]
  TN --> TB["TenantBrandingProvider (CSS variable injection)"]
```

### Resolver Logic (`src/portal/resolve-portal.ts`)
- **Apex / Main Domain** (`example.com`, `www.example.com`, `shebafi.xyz`, `shebafi.com`): `PUBLIC_HOME`
- **Super Admin** (`admin.example.xyz`, `admin.localhost`): `SUPER_ADMIN`
- **ISP Central App** (`app.example.xyz`, `app.localhost`): `ISP_ADMIN`
- **Tenant Subdomain** (`{slug}.example.com`, `{slug}.localhost`): `TENANT` (with extracted `tenantSlug`)
- **Dev Mode Support**: On `localhost` / `127.0.0.1`, defaults to `PUBLIC_HOME`, or switchable via `?portal=public|super_admin|isp_admin|tenant&tenant=<slug>` and dev environment selector.
- **Reserved Subdomains**: `['www', 'api', 'admin', 'app', 'mail', 'static', 'assets', 'cdn']` never get treated as tenant slugs.

### Portal Directory Layout
```
src/portal/
  types.ts                 PortalType ('PUBLIC_HOME' | 'SUPER_ADMIN' | 'ISP_ADMIN' | 'TENANT'), PortalContext
  config.ts                Host configurations, reserved subdomains, default dev mappings
  resolve-portal.ts        Pure resolution engine: resolvePortal(hostname, searchParams)
  resolve-portal.test.ts   Comprehensive Vitest test suite for all host scenarios
  portal-provider.tsx      Context provider & usePortal() hook
  portal-router.tsx        Root routing switch dispatching to the active portal experience
  module-registry.ts       Central registry of modules, route metadata, and portal permissions
  tenant-branding.tsx      Tenant styling engine (CSS vars, favicon, document title)
  access.ts                Permission & role gating helpers (UI rendering guards)
src/layouts/
  public-layout.tsx        Header + Footer layout for example.com marketing pages
  super-admin-layout.tsx   Layout for global control plane
  isp-layout.tsx           Layout for ISP ERP operations
  tenant-layout.tsx        Layout for isolated tenant portal
```

---

## 4. Implementation Phases

| # | Phase | Deliverables & Verification |
|---|---|---|
| **1** | **Resolver & Test Suite** | Implement `src/portal/resolve-portal.ts` + `resolve-portal.test.ts` supporting `PUBLIC_HOME` (`example.com`), `SUPER_ADMIN`, `ISP_ADMIN`, and `TENANT`. Run `npm test` / `vitest` to verify 100% green. |
| **2** | **Portal Context & API Client** | Implement `PortalProvider` and update `src/api/client.ts` to respect portal context and scoped token storage. Replace references to legacy `src/lib/plane.ts`. |
| **3** | **Homepage & Public Routing** | Wire `example.com` / `PUBLIC_HOME` to render the existing `SiteHeader`, `src/pages/home/index.tsx`, `SiteFooter`, and public onboarding routes (`/onboarding/*`, `/request`). |
| **4** | **Module Registry & 3 Admin Portals** | Create `module-registry.ts` and portal layouts (`super-admin-layout.tsx`, `isp-layout.tsx`, `tenant-layout.tsx`). Move `pages/saas/*` under `SUPER_ADMIN` and create ISP/Tenant shells. |
| **5** | **Portal-Aware Authentication** | Adapt login screen: Super Admin logs into `/saas/auth/login/`, ISP Portal supports tenant selection, Tenant Portal locks login to `{tenantSlug}`. |
| **6** | **Tenant Branding Engine** | Inject CSS variables for `--color-brand-*`, tenant logo, and document title when in `TENANT` portal mode. |
| **7** | **Verification & Dev Portal Switcher** | Add a lightweight dev floating switcher (on localhost only) to preview `example.com`, `admin.*`, `app.*`, and `{tenant}.*` instantly in the browser. |

---

## 5. Ready to Execute

With the homepage requirement integrated into the plan, we are ready to proceed with Phase 1.

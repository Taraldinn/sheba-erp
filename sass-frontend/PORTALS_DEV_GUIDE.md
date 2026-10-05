# ShebaFi Multi-Portal Frontend Architecture & Developer Guide

## 1. Overview & Architecture Philosophy

The ShebaFi ERP frontend is built as **ONE unified React + Vite + TypeScript codebase** exposing distinct, portal-tailored experiences based on the incoming domain / hostname, modeled conceptually after Odoo:

```
                    SHEBAFI ERP FRONTEND (React + Vite)
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
admin.example.xyz          app.example.xyz        {tenant}.example.com
  SUPER ADMIN                ISP ADMIN                TENANT APP
(Global Platform)         (Operations Cockpit)     (Branded Self-Care)
```

Additionally, apex/marketing domains (e.g. `example.com`, `shebafi.xyz`, `shebafi.com`) serve the **Public Homepage & Onboarding Portal**.

---

## 2. Portal Definitions & Hostname Mapping

| Portal | Production Hostname | Localhost Dev Host | Purpose & Modules |
| :--- | :--- | :--- | :--- |
| **`SUPER_ADMIN`** | `admin.example.xyz` | `admin.localhost:5174` | Global platform administration: tenant provisioning, subscriptions, plans, system health, audit logs, disaster recovery. |
| **`ISP_ADMIN`** | `app.example.xyz` | `app.localhost:5174` | Central ISP operations: subscriber directory, invoicing, MikroTik routers, PPPoE sessions, OLT/ONU hardware, NOC tickets, reports. |
| **`TENANT`** | `{tenant}.example.com` | `{tenant}.localhost:5174` | Branded customer self-care: invoice payment (bKash/Nagad/Cards), recharge, bandwidth telemetry, NOC complaints. |
| **`PUBLIC_HOME`** | `example.com` | `localhost:5174` | Public landing page, platform pricing, tenant registration, and onboarding setup wizard. |

---

## 3. Application Context Hierarchy

State and authorization boundaries flow unidirectionally through clean context providers:

```
App
└── ThemeProvider            (OKLCH dark/light tokens & palette customizer)
    └── BrowserRouter        (React Router 8 client navigation)
        └── RouteProvider
            └── PortalProvider       (Authoritative hostname/subdomain resolution)
                └── AuthProvider     (Portal-scoped sessions & credentials guard)
                    └── TenantProvider (Active tenant resolution & semantic CSS branding)
                        └── PermissionProvider (Fine-grained capability checks: can / hasPermission)
                            ├── TenantBrandingInjector (Document title, favicon & color injection)
                            └── PortalRouter (Portal route dispatchers & layout boundaries)
```

### Context Hooks Reference:
- `usePortal()`: Accesses active portal type (`SUPER_ADMIN` | `ISP_ADMIN` | `TENANT` | `PUBLIC_HOME`), `tenantSlug`, and dev switcher overrides.
- `useAuth()`: Accesses current authenticated user, scoped session token, portal authorization status, `login`, and `logout`.
- `useTenant()`: Accesses current tenant organization details, branding metadata, subscription status, and `refetch()`.
- `usePermissions()`: Fine-grained capability checks (`can('billing.read')`, `canAccessModule(module)`).
- `useTheme()`: Theme mode (`dark` / `light` / `system`) and palette variables.

---

## 4. Fine-Grained Permission & Capability System

Rather than relying purely on brittle role strings, ShebaFi utilizes granular capability permissions (`src/portal/permissions.ts`):

```tsx
import { usePermissions, PERMISSIONS } from '@/portal';

function InvoiceCreateButton() {
    const { can } = usePermissions();

    if (!can(PERMISSIONS.BILLING_INVOICE_CREATE)) {
        return null; // UX presentation gating
    }

    return <button onClick={handleCreate}>New Invoice</button>;
}
```

### Key Permission Identifiers:
- `customer.read`, `customer.create`, `customer.update`, `customer.delete`
- `billing.read`, `billing.invoice.create`, `billing.payment.create`, `billing.refund`
- `subscription.read`, `subscription.manage`
- `mikrotik.read`, `mikrotik.manage`, `pppoe.read`, `pppoe.manage`
- `olt.read`, `olt.manage`, `onu.read`, `onu.manage`
- `ticket.read`, `ticket.create`, `ticket.assign`, `ticket.close`
- `platform.manage`, `tenant.provision`, `tenant.suspend`

---

## 5. Portal Route Boundaries & Aliases

The router (`src/portal/portal-router.tsx`) dispatches portal-specific routes:

### Super Admin (`admin.example.xyz`)
- `/` or `/dashboard` — Platform overview & health KPIs
- `/isps` or `/tenants` — Tenant manager & quota controls
- `/plans` or `/packages` — SaaS pricing packages
- `/billing` or `/payments` — Inbound subscription payments
- `/users` or `/employees` — Platform team
- `/domains` or `/settings` — Custom domain verification
- `/subscriptions`, `/feature-matrix`, `/onboarding`, `/backups`, `/audit-logs`

### ISP Admin (`app.example.xyz`)
- `/` or `/dashboard` — Operations cockpit
- `/customers` — Subscribers
- `/billing` — Monthly invoicing & ledger
- `/subscriptions` — Subscriber packages
- `/mikrotik` — RouterOS sync & telemetry
- `/pppoe` — Active PPPoE sessions
- `/olt` & `/onu` — FTTH hardware management
- `/tickets` — NOC incident tracking
- `/reports` — Financial & usage reports
- `/settings` — ISP settings & SMS gateways

### Tenant Application (`{tenant}.example.com`)
- `/` or `/dashboard` — Self-care overview
- `/customers` — Profile & KYC details
- `/billing` or `/invoices` — Online invoice checkout
- `/subscriptions` or `/recharge` — Speed pack renewals
- `/tickets` or `/support` — Helpdesk complaints
- `/reports` or `/usage` — Bandwidth graphs
- `/settings` — Account preferences

---

## 6. Dynamic Tenant Branding & Semantic CSS Variables

When a tenant domain loads (e.g. `optimax.example.com`), `TenantProvider` and `TenantBrandingInjector` inject semantic CSS custom properties:

```css
:root {
  --tenant-primary: #6366f1;    /* Primary brand accent */
  --tenant-secondary: #4f46e5;  /* Hover / border shade */
  --tenant-accent: #4338ca;     /* Dark accent shade */
}
```

Components use these variables alongside UntitledUI design tokens without hardcoded colors.

---

## 7. Local Development & Testing Strategy

### A. Subdomain Localhost Testing (No /etc/hosts modification needed)
Chromium-based browsers (Chrome, Edge, Brave) and Firefox resolve `*.localhost` natively to `127.0.0.1`:
- **Super Admin:** `http://admin.localhost:5174/`
- **ISP Admin:** `http://app.localhost:5174/`
- **Tenant Portal:** `http://optimax.localhost:5174/` (or `fardin.localhost:5174`)
- **Public Homepage:** `http://localhost:5174/`

### B. Query Parameter Fallback
Append `?portal=` and optional `&tenant=` to test any portal from `http://localhost:5174/`:
- Super Admin: `http://localhost:5174/?portal=super_admin`
- ISP Admin: `http://localhost:5174/?portal=isp_admin`
- Tenant Portal: `http://localhost:5174/?portal=tenant&tenant=optimax`
- Public Home: `http://localhost:5174/?portal=public`

### C. Floating Development Portal Switcher
When running on `localhost`, a floating dock appears in the bottom-left corner with 1-click switcher buttons (`Admin`, `App`, `Tenant`, `Home`) and active tenant selector.

---

## 8. Security & Authorization Guarantees

1. **Hostnames are NEVER security boundaries:** Hostname and frontend routing are strictly presentation mechanisms.
2. **Authoritative Backend Scoping:**
   - Every API request sends `X-Tenant-ID` or scoped bearer token.
   - Django backend `TenantResolutionMiddleware` enforces database isolation, checking active tenant records, suspended status, and domain ownership.
3. **Cross-Tenant Session Isolation:**
   - Session storage is portal- and tenant-scoped (`sheba_session_super_admin`, `sheba_session_isp_admin`, `sheba_session_tenant_{slug}`).
   - An administrator or tenant user authenticated on one tenant cannot inadvertently execute actions against another tenant without explicit re-authentication.

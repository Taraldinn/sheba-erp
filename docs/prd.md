# Sheba ISP ERP & SaaS Control Plane — Product Requirements Document (PRD)

> **Document Version:** 1.0.0-GA  
> **Status:** APPROVED  
> **Target Release:** v1.0.0 Stable Release  
> **Target Date:** 2026-10-01  
> **Author:** Antigravity Engineering & QA  
> **Infrastructure Target:** FuncHole Platform (`app.funchole.dev`), Gateway (`fur2a7.funchole.dev`), Managed PostgreSQL (`defaultdb`)

---

## 1. Executive Summary & Vision

Sheba ISP ERP is an enterprise-grade, multi-tenant Internet Service Provider (ISP) billing, network operations, customer management, and SaaS orchestration platform.

The v1.0.0 stable release formalizes:
1. **The Core Backend Engine (`backend/`)**: A hardened Django 6.1 / Django REST Framework application providing multi-tenant isolation, append-only financial ledger, network telemetry roll-ups, and payment gateway orchestration.
2. **The SaaS Control Plane (`sass-admin/`)**: A modern, responsive multi-tenant management portal built with Next.js 16, React 19, and HeroUI v3, designed for platform operators to manage tenants, subscriptions, domains, billing packages, and audit trails.
3. **FuncHole Cloud Infrastructure Integration**: Deploying the control plane UI as a high-performance `STATIC` edge site and an Edge BFF (`NODE` runtime) routing through FuncHole Gateway (`fur2a7.funchole.dev`), backed by FuncHole's managed PostgreSQL database (`defaultdb`).

---

## 2. Architecture & Deployment Topology

```
                               ┌──────────────────────────────────────────────────────────┐
                               │             FuncHole Gateway: fur2a7.funchole.dev        │
                               └──────────────┬────────────────────────────┬──────────────┘
                                              │                            │
                                              │ GET /* (HTML, JS, CSS)     │ /api/v1/*
                                              ▼                            ▼
                      ┌─────────────────────────────────┐        ┌─────────────────────────────┐
                      │ Flow: flow_sass_admin           │        │ Flow: flow_api_bff          │
                      │ Function: fn_sass_admin_static  │        │ Function: fn_edge_bff       │
                      │ Runtime: STATIC                 │        │ Runtime: NODE (ESM)         │
                      │ Pre-built Next.js 16 + HeroUI   │        │ Session auth, X-Request-ID, │
                      │ Static Export Bundle            │        │ X-Tenant-ID, Upstream Proxy │
                      └─────────────────────────────────┘        └──────────────┬──────────────┘
                                                                                │ Upstream HTTP
                                                                                ▼
                                                                 ┌─────────────────────────────┐
                                                                 │ Django 6.1 Core API Engine  │
                                                                 │ Gunicorn / REST Framework   │
                                                                 └──────────────┬──────────────┘
                                                                                │
                                                                                ▼
                                                                 ┌─────────────────────────────┐
                                                                 │ FuncHole Managed Database   │
                                                                 │ Name: defaultdb (PostgreSQL)│
                                                                 │ Database: fh_9l4767r84w0k   │
                                                                 │ Host: tenant-db:5432        │
                                                                 └─────────────────────────────┘
```

### 2.1 Component Specifications

| Component | Repository Path | Runtime / Framework | Deployment Model | Function / Responsibility |
|---|---|---|---|---|
| **SaaS Admin UI** | `sass-admin/` | Next.js 16.3.6, React 19.3, HeroUI 3.2.6 | FuncHole `STATIC` Function (`fn_sass_admin_static`) | Operator UI for managing tenants, packages, subscriptions, payments, and system health. |
| **Edge BFF / Proxy** | `backend/edge-bff/` | Node 20+ ESM, Fetch API | FuncHole `NODE` Function (`fn_edge_bff`) | Validates requests, manages session tokens, injects `X-Request-ID`, and proxies traffic to upstream Django API. |
| **Core API Backend** | `backend/` | Django 6.1, DRF, Celery | Container / Managed Runtime | Authoritative data models, multi-tenant middleware, financial ledger, and network logic. |
| **Database** | Managed Cloud | PostgreSQL 16 (FuncHole `defaultdb`) | FuncHole Managed Database | Multi-tenant shared DB (`fh_9l4767r84w0k`) with strict tenant foreign-key scoping. |
| **Gateway & DNS** | Cloud Edge | FuncHole Gateway (`fur2a7.funchole.dev`) | L7 HTTP Gateway + SSL | TLS termination, path-based routing, and custom domain ingress. |

---

## 3. Product & Functional Requirements

### 3.1 Multi-Tenant Isolation & Authentication
* **Data Scoping**: Every resource model must enforce strict `tenant_id` scoping via `TenantScopedManager` and `TenantScopedViewSetMixin`. Cross-tenant IDOR access must return HTTP 403 `CROSS_TENANT_ACCESS`.
* **Central SaaS Authentication**: Platform operators authenticate via `/api/v1/saas/auth/login/` with credentials verified against `IsCentralAdmin` permission gates.
* **Token & Session Format**: Support standard session token exchange (`Authorization: Session <token>`) and dual-token machine API tokens (`TenantApiToken` prefixed with `shb_`).

### 3.2 SaaS Control Plane Functional Modules (`sass-admin`)
The SaaS admin panel must provide complete, production-grade workflows for all 10 core administrative functions:
1. **Overview & Analytics Dashboard (`/overview`)**: Live KPI cards (MRR, Active Tenants, Total Subscribers, Routers Online), time-series billing performance charts, and fleet telemetry.
2. **Tenants Management (`/tenants`)**: Organization listing, tenant creation modal with auto-provisioning credentials, status toggle (Active/Suspended), and telemetry slide-over drawer.
3. **Custom Domains (`/domains`)**: Domain configuration, DNS TXT verification status, and SSL certificate health tracking.
4. **Subscription Packages (`/packages`)**: Tier definitions (Starter, Growth, Enterprise), subscriber limits, bandwidth quotas, and recurring prices.
5. **Subscriptions Lifecycle (`/subscriptions`)**: Active tenant plans, start/renewal dates, auto-billing toggles, and status tracking.
6. **Payments & Ledger Log (`/payments`)**: Inbound payment transactions, gateway methods (bKash, Bank, Manual), reconciliation status, and export.
7. **Applications & Integrations (`/applications`)**: Registered external client applications with dual-token authentication.
8. **Staff & Operator Directory (`/users`)**: Platform superusers and tenant administrative memberships with role-based access control (RBAC).
9. **Security & Audit Logs (`/audit-logs`)**: Filterable, tamper-evident audit logs with actor, IP address, timestamp, and action diffs.
10. **System Backups (`/backups`)**: PostgreSQL snapshots, automated backup schedules, and point-in-time restore status.

---

## 4. UI/UX Quality & Design System Standards

### 4.1 Visual Excellence & HeroUI v3 Architecture
* **Design Philosophy**: Sleek dark/light contrast, curated OKLCH semantic palette, rounded pill badges, smooth SVG data charts, and accessible focus outlines.
* **Theme Stability**: Complete theme synchronization via `next-themes` and `@heroui/styles`. Dark mode must maintain high readability with zero unstyled flashes.
* **Layout Isolation**: Client components must maintain strict `"use client";` declarations to prevent SSR hydration collisions with React Aria primitives.

### 4.2 Error Handling & Resilience
* **Route Error Boundary (`app/error.tsx`)**: Global catch-all boundary rendering a styled HeroUI card with error details, recovery actions ("Try Again", "Return to Dashboard"), and incident correlation IDs.
* **Not Found Experience (`app/not-found.tsx`)**: Intuitive 404 page preventing orphaned navigation.
* **Loading & Skeleton States**: Every table, chart, and KPI metric must display smooth `Skeleton` placeholders during data retrieval.
* **Zero Dev Fallback**: Production builds must never include hardcoded superuser fallbacks; unauthenticated requests must gracefully redirect to `/login`.

---

## 5. Quality Assurance (QA) & Acceptance Gates

To certify the v1.0.0 release as stable, all of the following gates must be met:

| Gate ID | Domain | Requirement | Acceptance Metric |
|---|---|---|---|
| **GATE-01** | Database | Zero pending or unapplied migrations | `makemigrations --check --dry-run` exits with code 0 |
| **GATE-02** | Backend | Full automated unit & integration test suite | 100% pass rate (494+ tests pass, 0 failures, 0 errors) |
| **GATE-03** | Backend | System deployment security check | `python manage.py check --deploy` passes with zero fatal issues |
| **GATE-04** | API Contract | OpenAPI 3.0 schema generation | `drf-spectacular` validates with all SaaS endpoints documented |
| **GATE-05** | Frontend | TypeScript type safety | `tsc --noEmit` exits with code 0 |
| **GATE-06** | Frontend | Automated unit & component tests | Vitest suite passes for auth guard, API client, and key UI components |
| **GATE-07** | Frontend | Static export verification | `next build` emits clean, self-contained `out/` bundle |
| **GATE-08** | FuncHole | Functions & Versions provisioned | `fn_sass_admin_static` and `fn_edge_bff` deployed and ACTIVE |
| **GATE-09** | FuncHole | Gateway routes live | Gateway `fur2a7.funchole.dev` responds with 200 OK on UI and API |

---

## 6. Security, Compliance & Operational Safeguards

1. **Database Credentials**: Managed securely via FuncHole environment configuration; never committed to version control.
2. **Encrypted Storage**: Payment gateway credentials and third-party secrets stored using MultiFernet AES-128-CBC + HMAC-SHA256 authenticated encryption.
3. **Idempotent Mutations**: All mutating state endpoints (payment allocations, billing runs, tenant provisioning) enforce idempotency keys.
4. **Audit Immutability**: Critical security and financial ledger tables enforce append-only policies where `DELETE` and `UPDATE` operations raise validation exceptions.

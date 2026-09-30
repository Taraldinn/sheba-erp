# Design Specification: Sheba ISP ERP & SaaS-Admin v1 Stable Release on FuncHole

## 1. Overview & Objective
Architect and execute the v1.0.0 General Availability (GA) stable release of the Sheba ISP ERP Backend (`backend/`) and SaaS Control Plane (`sass-admin/`) on the **FuncHole** cloud platform (`app.funchole.dev`), utilizing:
- FuncHole Managed PostgreSQL (`defaultdb`)
- FuncHole Gateway (`fur2a7.funchole.dev`)
- FuncHole Edge BFF Function (`fn_edge_bff`, runtime: `NODE`)
- FuncHole Static Hosting Function (`fn_sass_admin_static`, runtime: `STATIC`)
- Comprehensive Quality Assurance (100% passing backend tests, frontend Vitest component tests, migration zero-debt, and UI/UX hardening).

---

## 2. Infrastructure & Topology

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
                      │ Static export of sass-admin     │        │ Session auth, X-Request-ID, │
                      │ (Next.js 16 + HeroUI v3)        │        │ X-Tenant-ID, Upstream Proxy │
                      └─────────────────────────────────┘        └──────────────┬──────────────┘
                                                                                │ Upstream HTTP
                                                                                ▼
                                                                 ┌─────────────────────────────┐
                                                                 │ Django 6.1 Core API         │
                                                                 │ Gunicorn / Django REST      │
                                                                 └──────────────┬──────────────┘
                                                                                │
                                                                                ▼
                                                                 ┌─────────────────────────────┐
                                                                 │ FuncHole Managed Database   │
                                                                 │ Name: defaultdb (PostgreSQL)│
                                                                 │ DB: fh_9l4767r84w0k         │
                                                                 └─────────────────────────────┘
```

---

## 3. Detailed Component Architecture

### 3.1 Backend & Database Hardening
- **Migration Zero-Debt**: Generate missing migration in `apps/finance` to resolve `makemigrations --check --dry-run` failures caused by `models.PROTECT`.
- **FuncHole Database Connectivity**: Wire Django to FuncHole managed PostgreSQL (`defaultdb`). Run migrations and ensure connection pooling.
- **Automated Test Suite**: Execute all 19 Django apps (`backend/venv/bin/python manage.py test apps`), enforcing 100% pass rate with zero failures.
- **Production Deployment Check**: Run `python manage.py check --deploy`.
- **OpenAPI Schema Validation**: Validate schema via `python manage.py spectacular --validate`.

### 3.2 SaaS-Admin Frontend & UI/UX Resilience
- **Dev Fallback Removal**: In `sass-admin/lib/api.ts`, remove the hardcoded dev superuser fallback in `serverMe()`. Unauthorized requests must trigger standard 401/403 handling and redirect to `/login`.
- **Route Error Boundary**: Implement `sass-admin/app/error.tsx` using HeroUI `Card` with retry controls and error tracking.
- **Not Found Page**: Implement `sass-admin/app/not-found.tsx` to handle 404 routes cleanly.
- **Static Export**: Configure `next.config.mjs` with `output: 'export'` and `images: { unoptimized: true }` for pure static HTML/CSS/JS generation.
- **Automated Frontend Testing**: Introduce `vitest` + `@testing-library/react` + `happy-dom`, writing tests for `apiFetch`, `<AdminAuthGuard />`, `<LoginForm />`, and metric components.

### 3.3 FuncHole Deployment Pipeline
- **Provision Functions**:
  - `fn_sass_admin_static` (runtime `STATIC`)
  - `fn_edge_bff` (runtime `NODE`)
- **Deploy Source Bundles**:
  - Upload `sass-admin/out` static bundle to `fn_sass_admin_static` version.
  - Upload Node proxy handler to `fn_edge_bff` version with `DJANGO_UPSTREAM_URL`.
- **Create Flows**:
  - `flow_sass_admin`
  - `flow_api_bff`
- **Route on Gateway (`fur2a7.funchole.dev`)**:
  - Map `/*` to `flow_sass_admin`
  - Map `/api/v1/*` to `flow_api_bff`

---

## 4. Documentation
- [`./docs/prd.md`](file:///home/taraldinn/Documents/Sheba%20codebase/docs/prd.md): Authoritative PRD for the release.
- [`./docs/task.md`](file:///home/taraldinn/Documents/Sheba%20codebase/docs/task.md): Master implementation and QA task ledger.

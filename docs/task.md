# Sheba ISP ERP & SaaS Control Plane — Master Implementation & QA Task Ledger

> **Target Release:** v1.0.0 Stable Release  
> **Repository:** `Taraldinn/sheba-erp` (`backend/` & `sass-admin/`)  
> **Infrastructure Target:** FuncHole Platform (`fur2a7.funchole.dev`), Gateway, Managed PostgreSQL (`defaultdb`)  
> **Status:** READY FOR IMPLEMENTATION

---

## Task Progress Legend
- `[ ]` Not Started
- `[~]` In Progress
- `[x]` Completed & Verified
- `[!]` Blocked

---

## Phase 0: Pre-Flight Environment & Database Alignment
- [ ] **TASK-001**: Inspect and extract FuncHole managed PostgreSQL (`defaultdb`) connection parameters via `@mcp:funchole`.
- [ ] **TASK-002**: Configure `backend/.env` with production-ready `DATABASE_URL` pointing to FuncHole managed PostgreSQL.
- [ ] **TASK-003**: Verify PostgreSQL connectivity from Django runtime (`python manage.py check --database default`).

---

## Phase 1: Backend Zero-Debt & Migration Hardening
- [ ] **TASK-101**: Resolve schema divergence in `apps/finance` (generate missing migration for `models.PROTECT` foreign keys).
- [ ] **TASK-102**: Execute `python manage.py makemigrations --check --dry-run` to confirm zero unapplied or missing migrations.
- [ ] **TASK-103**: Apply all migrations cleanly (`python manage.py migrate`).
- [ ] **TASK-104**: Verify database schema consistency and table creation.

---

## Phase 2: Backend Test Suite Verification & API Contract Validation
- [ ] **TASK-201**: Run complete automated test suite (`backend/venv/bin/python manage.py test apps`).
- [ ] **TASK-202**: Verify 100% pass rate (target: 494+ tests passing, 0 failures, 0 errors).
- [ ] **TASK-203**: Run Django production readiness check (`python manage.py check --deploy`).
- [ ] **TASK-204**: Generate and validate OpenAPI 3.0 schema (`manage.py spectacular --validate`) ensuring all SaaS control plane endpoints are represented.

---

## Phase 3: SaaS-Admin Security, UI/UX Hardening & Resilience
- [ ] **TASK-301**: Audit `sass-admin/lib/api.ts` and remove dev-only mock superuser fallback in `serverMe()` (throw 401/403 and redirect to `/login`).
- [ ] **TASK-302**: Create global route error boundary `sass-admin/app/error.tsx` styled with HeroUI `Card` and recovery actions.
- [ ] **TASK-303**: Create route not found page `sass-admin/app/not-found.tsx` with navigation back to overview.
- [ ] **TASK-304**: Audit and verify HeroUI v3 OKLCH color token consistency and light/dark theme transitions in `components/theme-switch.tsx`.
- [ ] **TASK-305**: Audit table loading states and empty state placeholders across all 10 resource management screens.

---

## Phase 4: Frontend Automated Testing Suite (Vitest + RTL)
- [ ] **TASK-401**: Install and configure `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, and `happy-dom` in `sass-admin/package.json`.
- [ ] **TASK-402**: Add `"test": "vitest run"` script to `sass-admin/package.json`.
- [ ] **TASK-403**: Write unit tests for `sass-admin/lib/api.ts` (URL construction, session header injection, error handling).
- [ ] **TASK-404**: Write component tests for `<AdminAuthGuard />` (unauthenticated redirection vs authenticated child rendering).
- [ ] **TASK-405**: Write component tests for `<LoginForm />` (validation, submission, error handling).
- [ ] **TASK-406**: Write component tests for dashboard metrics (`<MetricCard />`).
- [ ] **TASK-407**: Execute `npm test` in `sass-admin/` and verify all tests pass with zero errors.

---

## Phase 5: Static Export & Packaging for FuncHole
- [ ] **TASK-501**: Update `sass-admin/next.config.mjs` to enable static export (`output: 'export'` and `images: { unoptimized: true }`).
- [ ] **TASK-502**: Run `pnpm run build` or `npm run build` in `sass-admin/` to verify clean static export to `out/`.
- [ ] **TASK-503**: Verify TypeScript type checking (`tsc --noEmit`) passes with zero compiler errors.
- [ ] **TASK-504**: Verify static assets (HTML, CSS, JS bundles) are generated without SSR runtime dependencies.

---

## Phase 6: FuncHole Infrastructure Provisioning & Deployment
- [ ] **TASK-601**: Create Edge BFF Node Function `fn_edge_bff` using `create_function` on FuncHole (`runtime: NODE`).
- [ ] **TASK-602**: Package and submit Node BFF handler source using `submit_function_version_source` and `deploy_function_version`.
- [ ] **TASK-603**: Create Static Function `fn_sass_admin_static` using `create_function` on FuncHole (`runtime: STATIC`).
- [ ] **TASK-604**: Package and submit `sass-admin` static bundle using `submit_function_version_source` and `deploy_function_version`.
- [ ] **TASK-605**: Create FuncHole Flow for SaaS Admin UI (`flow_sass_admin`) and attach `fn_sass_admin_static`.
- [ ] **TASK-606**: Create FuncHole Flow for API Edge BFF (`flow_api_bff`) and attach `fn_edge_bff`.
- [ ] **TASK-607**: Configure routing on FuncHole Gateway (`fur2a7.funchole.dev`) mapping `/` and `/*` to `flow_sass_admin`, and `/api/v1/*` to `flow_api_bff`.

---

## Phase 7: End-to-End Quality Assurance & Release Sign-Off
- [ ] **TASK-701**: Test Gateway ingress on `fur2a7.funchole.dev` for root dashboard route (HTTP 200 OK).
- [ ] **TASK-702**: Test Gateway ingress on `/api/v1/saas/auth/me/` through Edge BFF to verify auth flow.
- [ ] **TASK-703**: Verify responsive design and navigation across mobile and desktop viewports.
- [ ] **TASK-704**: Confirm zero console errors and security header presence (`CSP`, `X-Frame-Options`, `X-Content-Type-Options`).
- [ ] **TASK-705**: Update `docs/PROJECT_STATUS.md` and declare v1.0.0 Stable Release.

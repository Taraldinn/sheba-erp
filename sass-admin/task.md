# ShebaFi SaaS Control Plane — Task Tracker (`sass-admin`)

> **Repo:** `sass-admin/` · Next.js 16.3.6 · HeroUI v3 · React 19.3 · TypeScript
> **Backend:** `backend/` (Django v1 stable — 838 tests passing, 447 OpenAPI paths)
> **Live URL:** `https://admin.shebafi.xyz` (staging on port 3001)
> **Spec:** BFF plan lives at `.puku/plans/frontend_bff_plan_889072d9.plan.md`

This document is the **single source of truth** for the `sass-admin` Next.js app — every outstanding task, every done task, every known debt. Anything not listed here doesn't exist.

---

## 0. Current state (snapshot)

| Item | Status | Notes |
|---|---|---|
| All 10 admin pages exist | ✅ | `tenants`, `domains`, `packages`, `subscriptions`, `payments`, `users`, `applications`, `api-credentials`, `audit-logs`, `backups` |
| Admin shell + sidebar + topbar | ✅ | `components/admin-shell.tsx` (388 lines) |
| Login flow + form + guard | ✅ | `app/login/`, `components/login-form.tsx`, `components/admin-auth-guard.tsx` |
| Overview / KPIs page | ✅ | `components/overview-client.tsx` (1,052 lines, biggest file) |
| Resource list/table + drawers | ✅ | `admin-data-table.tsx`, `admin-resource-page.tsx`, `tenants/create-tenant-modal.tsx`, `tenants/tenant-detail-drawer.tsx` |
| Auth API route | ✅ | `app/api/auth/session/` |
| Reads live data from Django | ✅ | `lib/api.ts` already wired to `Session <token>` |
| HeroUI v3 migration | ✅ | Components use `@heroui/react` 3.2.6 + `@heroui/styles` |
| Dark / light theme switch | ✅ | `components/theme-switch.tsx` + `next-themes` |

### Known gaps (in priority order)

1. **Data fetches are not type-safe end-to-end** — `lib/api.ts` uses `apiFetch<T = unknown>` with hand-rolled `lib/types.ts`. A backend field rename silently returns `undefined`.
2. **No SSR data caching** — every page render hits Django.
3. **No `Idempotency-Key` on mutations** — risk of double-fire on slow networks.
4. **No tests** — `package.json` has no `test` script.
5. **No CI lint gate** — `pnpm lint` is not wired to backend CI.
6. **Dev-only fallback superuser** in `serverMe()` (lines 222-244) — should never ship to production.
7. **No error boundary** at the route level — a 500 from the API tears down the whole shell.

---

## 1. Task ledger

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

### 1.1 — Hardening before v1 ship (do first)

- [ ] **T-01** Remove dev-only fallback user in `lib/api.ts` `serverMe()` (lines 222-244). Throw on 401/403 in production.
- [ ] **T-02** Add `eslint-disable` audit — strip stale `// eslint-disable-next-line` comments from the codebase; fix the underlying rule.
- [ ] **T-03** Replace `console.warn`/`console.error` left in production code with the existing logger (or remove).
- [ ] **T-04** Verify `next.config.mjs` sets `output: 'standalone'` for the production container build.
- [ ] **T-05** Confirm CSP, `X-Frame-Options`, `Referrer-Policy` are set at the `layout.tsx` level (not only in Django).

### 1.2 — Type safety end-to-end

- [ ] **T-10** Add `openapi-typescript` to `devDependencies`.
- [ ] **T-11** Write `scripts/generate-types.sh` that pulls `backend/schema.yml` from the BFF or directly from Django (`/api/schema/`) and regenerates `lib/types-generated.d.ts`.
- [ ] **T-12** Rewrite `lib/api.ts` `apiFetch<T>` to default `T` to a path-derived type from the generated OpenAPI (use the `openapi-fetch` client).
- [ ] **T-13** Replace the hand-rolled `Tenant`, `SaasPackage`, `SaasSubscription`, `SaasPayment`, `DatabaseBackup` shapes in `lib/types.ts` with re-exports from `lib/types-generated.d.ts`.
- [ ] **T-14** Add a CI step: `pnpm exec tsc --noEmit` must exit 0 — gate PRs on it.

### 1.3 — Wiring to the new BFF

(Depends on the BFF plan being approved & Phases 1-2 shipped.)

- [ ] **T-20** Add `NEXT_PUBLIC_BFF_URL` to `.env.local.example` with the staging BFF URL.
- [ ] **T-21** Refactor `lib/api.ts` `getApiBase()` to read `NEXT_PUBLIC_BFF_URL` first, then `NEXT_PUBLIC_API_URL` (legacy), then `http://localhost:8000/api/v1` (dev fallback).
- [ ] **T-22** Update `app/api/auth/session/route.ts` to forward login to `/api/bff/auth/login` and store the returned cookie.
- [ ] **T-23** Update `admin-auth-guard.tsx` to call `/api/bff/auth/me` instead of hitting Django directly.
- [ ] **T-24** Update every page in `app/(admin)/*/page.tsx` to use the typed `api` client (no string URLs).
- [ ] **T-25** Verify the cookie name change: backend uses `sheba_session`, BFF uses `sheba_bff_session`. Both should still work in the dev fallback.

### 1.4 — Mutation safety

- [ ] **T-30** Add `Idempotency-Key` header to every POST/PATCH/DELETE in `lib/api.ts` (use `crypto.randomUUID()` server-side, `crypto.randomUUID()` in browser via `globalThis.crypto`).
- [ ] **T-31** Surface `Idempotency-Replay: true` in a small `<Toast>` so operators see when a double-tap was deduped.
- [ ] **T-32** Audit the 12 mutating endpoints the BFF plan targets (in `frontend_bff_plan_*.plan.md` §6.2) and confirm each is reachable from `sass-admin`.

### 1.5 — Edge cache integration

- [ ] **T-40** Add `s-maxage` awareness in `apiFetch` so cached GETs skip the network entirely.
- [ ] **T-41** Tag cache entries by tenant in the request header (`X-Tenant-ID`) — needed once the BFF is in front.
- [ ] **T-42** On mutation success, call `caches.delete` for the matching tenant key (when running in browser).

### 1.6 — Observability

- [ ] **T-50** Add a top-level `app/error.tsx` boundary that renders the HeroUI `Card` "Something went wrong" UI and ships the request id to Sentry.
- [ ] **T-51** Add `app/not-found.tsx` for unknown admin routes.
- [ ] **T-52** Add a `<RequestIdBadge>` in the topbar showing the current request id (helps debug with support).
- [ ] **T-53** Pipe all `fetch` errors into a thin `lib/report-error.ts` helper that posts to `/api/v1/audit-logs/` (or the BFF equivalent) with `requestId`.

### 1.7 — Tests (currently zero — highest gap)

- [ ] **T-60** Add `vitest` + `@testing-library/react` + `happy-dom` to `devDependencies`.
- [ ] **T-61** Add `test` script to `package.json`: `vitest run --coverage`.
- [ ] **T-62** Unit tests for `lib/api.ts` — `apiFetch` success/401/403/500/network, `buildUrl` query encoding, `getApiBase` precedence.
- [ ] **T-63** Component test: `<AdminShell>` renders children when `user` is provided, redirects when null.
- [ ] **T-64** Component test: `<LoginForm>` calls `api.post('/auth/login/', …)` on submit, shows error toast on 401.
- [ ] **T-65** Component test: `<OverviewClient>` renders KPI cards with mock data, handles empty state.
- [ ] **T-66** Component test: `<Tenants>` page lists tenants from the API and opens the create-tenant modal on click.
- [ ] **T-67** E2E happy-path test with Playwright: login → overview → tenants list → click row → see detail drawer.
- [ ] **T-68** CI gate: `pnpm test` and `pnpm lint` must exit 0 — block PRs on failure.

### 1.8 — Performance & a11y

- [ ] **T-70** Audit the 1,052-line `overview-client.tsx` and split into per-widget files (`<RevenueChart>`, `<TenantsByPlan>`, etc.).
- [ ] **T-71** Wrap every HeroUI `<Table>` with `virtualization` for > 200 rows (currently renders them all).
- [ ] **T-72** Run `axe-core` in Playwright; fix any `serious` or `critical` a11y violations on the admin pages.
- [ ] **T-73** Add `<Suspense>` boundaries around each page's data fetch so the shell renders immediately.
- [ ] **T-74** Move chart data fetching to a Server Component to drop time-to-first-paint on the overview page.

### 1.9 — Production-readiness

- [ ] **T-80** Confirm production env vars: `NEXT_PUBLIC_API_URL`, `SESSION_COOKIE_DOMAIN`, `NEXT_PUBLIC_BFF_URL`.
- [ ] **T-81** Add Sentry (or equivalent) and wire `app/error.tsx` to it.
- [ ] **T-82** Add a CI build job that runs `pnpm build` and posts the bundle-size delta as a PR comment.
- [ ] **T-83** Confirm `Dockerfile` (if present in this dir, else `dev.sh`) produces a runnable image.
- [ ] **T-84** Add a basic health check page at `app/healthz/route.ts` returning `{status:"ok"}` (for the platform's LB probe).

### 1.10 — Documentation

- [ ] **T-90** Replace `README.md` (currently the HeroUI template README) with project-specific docs: how to run, env vars, BFF toggle, deploy procedure.
- [ ] **T-91** Add `ARCHITECTURE.md` with one diagram (mermaid) showing `browser → BFF → Django` and the auth/tenant/SSE flows.
- [ ] **T-92** Add `CONTRIBUTING.md` with the type-generation step, the test gate, the lint rule list.

---

## 2. Backlog (nice-to-have, post-v1)

- [ ] **B-01** Add a Storybook 9 instance for `components/`. Seed stories for `<AdminShell>`, `<AdminCard>`, `<AdminDataTable>`, `<MetricCard>`, charts.
- [ ] **B-02** Add i18n via `next-intl` (currently English-only; SaaS admin will need Bangla for onboarding).
- [ ] **B-03** Add a "Tenant impersonation" banner that appears when a SaaS admin is viewing a tenant in disguise (the BFF will surface this via a custom header).
- [ ] **B-04** Add a "Saved views" feature on `/audit-logs` and `/payments` (per-user localStorage).
- [ ] **B-05** Add keyboard-shortcut help modal (`?` opens it) — discoverability for power users.
- [ ] **B-06** Add CSV export buttons on every table (re-uses the same Django export endpoints used by `isp-admin`).
- [ ] **B-07** Add dark-mode screenshots in the README so reviewers can see the theme.
- [ ] **B-08** Migrate to React 19 `use()` hook for cleaner async Server Components once Next 16.4 lands.

---

## 3. Done log (archive)

> Move tasks here with a one-line note + commit hash when shipped.

### 2025-Q4 hardening pass

- [x] **T-01** Removed dev-only fallback superuser in `lib/api.ts` `serverMe()` — now returns `null` on 401/403 and propagates non-auth errors. Also removed the hardcoded `DEV_SESSION_TOKEN` export; dev fallback now only activates when `NEXT_PUBLIC_DEV_SESSION_TOKEN` (or `NEXT_PUBLIC_SAAS_DEV_TOKEN`) is set in `.env.local`. `_session.ts` does not return a dev token on the server. _pre-commit, no SHA yet_
- [x] **T-02** Audited `eslint-disable` usages; only the two intentional `console.warn` calls in `lib/report-error.ts` remain (dev-only, gated on `NODE_ENV !== "production"`). The pre-existing `// eslint-disable-next-line no-console` in `app/error.tsx` was removed.
- [x] **T-04** Set `output: "standalone"` in `next.config.mjs` for the Dokploy/Docker runtime.
- [x] **T-05** Security headers in `next.config.mjs`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo denied), `Strict-Transport-Security`. _Next 16 removed the `eslint` config key; lint runs in CI separately (T-68)._
- [x] **T-30** `lib/api.ts` `api.post/patch/put/delete` now auto-mint an `Idempotency-Key` header via `crypto.randomUUID()`.
- [x] **T-31** `lib/api.ts` `apiFetch` dispatches a `sheba:idempotency-replay` window event when the upstream returns `Idempotency-Replay: true`. UI hookup in `<Toast>` is a one-liner in the page component (left for first page that wants to wire it).
- [x] **T-50** `app/error.tsx` rewritten to HeroUI v3 compound API; ships error digest + message to `/api/v1/saas/audit-logs/` via `lib/report-error.ts`.
- [x] **T-51** `app/not-found.tsx` added — clean 404 with "Sign in" / "Go to overview" actions. Marked `"use client"` because `@heroui/react` transitively imports `client-only`, which Next 16 rejects in RSC.
- [x] **T-53** `lib/report-error.ts` added — swallows all errors, posts to `/audit-logs/` only when a session token is present, keeps the body small (5 KB stack cap), and supports `keepalive: true` for navigation-away resilience.
- [x] **T-84** `app/healthz/route.ts` added — returns `{status, app, version, time}` for LB probes (no Django round-trip).
- [x] **T-90** `README.md` rewritten — project-specific docs (run, env vars, layout, deploy, API client conventions). Replaces the HeroUI template README.
- [x] **T-70 (partial)** `components/overview-client.tsx` rewritten as the real **SaaS Control Plane overview** — 7 parallel backend calls (`/saas/overview/`, `/saas/health/`, `/saas/tenants/`, `/saas/subscriptions/`, `/saas/audit-logs/`, `/saas/requests/`, `/saas/backups/`) with per-tenant telemetry hydration for the top 5. 30 s auto-refresh. Full CRUD for: tenant suspend/activate, onboarding request approve/reject, subscription cancel, backup snapshot. Files: `lib/api.ts` (added `saasApi` namespace with 22 methods), `lib/types.ts` (added 14 SaaS types), `components/overview-client.tsx` (replaced employee-list mock with the real dashboard). Pre-debt logged separately.
- [x] **T-91 (partial)** `ARCHITECTURE.md` content lives inline in `README.md` §"Production build & deploy" — the architecture is documented as a 1-paragraph flow.

### Known pre-debt (not introduced by this pass)

> **Updated 2025-Q4:** T-70 (rewriting overview-client) **shipped**. The pre-existing
> 6 TS errors and 12 lint errors in the OLD `overview-client.tsx` were
> eliminated when the file was rewritten as the real SaaS Control Plane
> dashboard. **Current state:** `tsc --noEmit` → 0 errors, `next build`
> → green, `next lint` → no new errors.

- The `tsc` gate in `next.config.mjs` (`typescript.ignoreBuildErrors: false`)
  is now effective.
- Remaining debt: per-widget split of `overview-client.tsx` (the new
  one is still 971 lines; ideal is ≤ 250 lines per widget file).
  Tracked as the **B-09** follow-up.

---

## 4. Run commands (cheat sheet)

```bash
# dev
cd sass-admin
pnpm install
pnpm dev                   # http://localhost:3001

# build
pnpm build
pnpm start                 # http://localhost:3001

# lint
pnpm lint

# tests (once T-60 lands)
pnpm test
pnpm test --coverage

# type regen (once T-11 lands)
./scripts/generate-types.sh
```

---

## 5. Definition of "sass-admin v1 stable"

- [ ] Every task in §1.1, §1.2, §1.3, §1.6, §1.9 is `[x]`
- [ ] ≥ 80 % test coverage (T-60..T-68)
- [ ] `pnpm test`, `pnpm lint`, `pnpm build` all exit 0 in CI
- [ ] Zero `console.*` left in production code
- [ ] `README.md` is project-specific, not the template
- [ ] Production deploy is reproducible from the repo with one command
- [ ] Bundle size delta from current main is reported on every PR

---

## 6. Owners

| Area | Owner |
|---|---|
| Repo | `sass-admin/` |
| Backend | `backend/` (Django v1 stable) |
| BFF | `backend/bff/` (Cloudflare Worker, see `.puku/plans/frontend_bff_plan_*.plan.md`) |
| Tenant app | `isp-admin/` (separate task ledger) |

> **Note:** `isp-admin` (the per-tenant admin app) is **out of scope** for this file. Its task ledger lives alongside that codebase.

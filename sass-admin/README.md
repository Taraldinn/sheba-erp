# ShebaFi SaaS Control Plane — `sass-admin`

The platform-level admin app for [ShebaFi](https://shebafi.xyz). Operators
on `admin.shebafi.xyz` use it to onboard new ISP tenants, manage
subscriptions, audit cross-tenant activity, and run database backups.

- **Framework:** Next.js 16 (app dir) + React 19 + HeroUI v3
- **Backend:** Django v1 stable at `../backend/` (838 tests, 447 OpenAPI paths)
- **Spec / task ledger:** [`task.md`](./task.md) (single source of truth)
- **BFF plan (not yet built):** `../.puku/plans/frontend_bff_plan_*.plan.md`

---

## Local development

```bash
cd sass-admin
pnpm install
pnpm dev                     # http://localhost:3001
```

The dev server proxies calls to whatever `NEXT_PUBLIC_API_URL` points at
(by default `http://localhost:8000/api/v1`). The SaaS namespace is
auto-prepended: `apiFetch('/tenants/')` hits
`http://localhost:8000/api/v1/saas/tenants/`.

### Required environment variables

| Var | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the Django backend (with `/api/v1`) | `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_BFF_URL` | Cloudflare Worker BFF (Phase 2+). Leave empty to hit Django directly. | _empty_ |
| `NEXT_PUBLIC_DEV_SESSION_TOKEN` | Optional: a valid SaaS admin token used as a dev fallback. **Ignored in production builds.** | _empty_ |

A working `.env.local` looks like:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

## Project layout

```
sass-admin/
  app/                       # Next.js app router
    (admin)/                 # Auth-protected group: every page here is gated
      layout.tsx             # Calls requireSaasAdmin(), renders AdminShell
      overview/              # KPI dashboard
      tenants/               # CRUD: tenants, domains, packages, ...
      ...
    api/auth/session/        # Server-side cookie sync route
    error.tsx                # T-50 top-level error boundary
    not-found.tsx            # T-51 404 page
    healthz/route.ts         # T-84 LB probe
  components/                # HeroUI v3 components
    admin-shell.tsx          # Sidebar + topbar
    admin-resource-page.tsx  # Reusable list/edit page
    admin-data-table.tsx     # Reusable table with filters
    tenants/                 # Tenant-specific dialogs
  lib/
    api.ts                   # Typed fetch wrapper — `api.get/post/patch/...`
    auth.ts                  # Server-side session helpers
    types.ts                 # Hand-rolled shapes (replace with openapi-typescript T-13)
    report-error.ts          # T-53 — sends uncaught errors to /audit-logs/
    utils.ts
  config/                    # site metadata, fonts
  styles/                    # Tailwind v4 + HeroUI styles
  scripts/                   # Type-generation scripts (T-11 lands here)
  task.md                    # Single source of truth for outstanding work
```

---

## Production build & deploy

```bash
pnpm build                   # outputs a `standalone/` server bundle
pnpm start                   # serves the standalone build on port 3001
```

`next.config.mjs` is configured with `output: "standalone"` (T-04) so the
container image is small (~150 MB). The Dokploy runtime invokes
`pnpm start` against the built artifact.

### Pre-deploy checklist

- [ ] `pnpm lint` exits 0
- [ ] `pnpm build` exits 0 (this also runs `tsc --noEmit` — T-14)
- [ ] `NEXT_PUBLIC_API_URL` points at the production Django
- [ ] No `NEXT_PUBLIC_DEV_SESSION_TOKEN` is set
- [ ] `HSTS` and security headers come from `next.config.mjs` (T-05)

---

## API client conventions

- **`apiFetch<T>(path, options)`** is the only place we call `fetch`.
  Every other module routes through this. Adding new behaviour (retries,
  caching, Sentry breadcrumb) means editing this one file.
- **`api.{get,post,patch,put,delete}`** are thin wrappers that auto-mint
  an `Idempotency-Key` on every mutating request (T-30). When the BFF
  ships, duplicate keys are deduped server-side and the response carries
  `Idempotency-Replay: true`, which we surface via a `sheba:idempotency-replay`
  custom event (T-31).
- **Authentication** uses `Authorization: Session <token>`. The token
  is read from `localStorage` (browser) or passed in explicitly
  (server components, route handlers).
- **Errors** throw `ApiError(status, message, body)`. The `app/error.tsx`
  boundary catches unhandled throws and forwards them to
  `/api/v1/saas/audit-logs/` via `lib/report-error.ts` (T-53).

---

## Testing

We are pre-`vitest` (see task.md T-60..T-68). Until the test harness
lands, the build itself is the only safety net:

```bash
pnpm lint
pnpm build
```

---

## Contributing

See [`task.md`](./task.md) for the current backlog. Pick a `[ ]` task,
move it to `[~]` in your PR description, and link the commit hash in
§3 of `task.md` when shipped.

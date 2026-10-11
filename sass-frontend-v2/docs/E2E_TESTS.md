# End-to-end tests (Playwright)

This directory holds the Playwright suite that covers critical
multi-portal flows in the Shebafi TanStack frontend.

## Running

```bash
# Install the chromium binary once.
pnpm test:e2e:install

# Run the full suite. Playwright will start a `pnpm preview` server on
# http://localhost:3000 (against a production build) automatically.
pnpm test:e2e

# Run an individual spec.
pnpm exec playwright test e2e/01-public.spec.ts
```

The default suite runs **28 tests across 5 spec files** in roughly 50
seconds on a developer laptop:

- `e2e/01-public.spec.ts` — landing, 404, forgot-password.
- `e2e/02-tenant-auth.spec.ts` — login, seeded sessions, sign-out API.
- `e2e/03-tenant-erp.spec.ts` — every tenant list page renders with mock data.
- `e2e/04-saas-portal.spec.ts` — SaaS login + 5 admin pages.
- `e2e/05-isp-portal.spec.ts` — ISP login + 5 owner pages.

## Live-backend mode

A second Playwright project, `live`, points the same suite at a real
Django backend. The mock fixture becomes a no-op when
`VITE_E2E_LIVE=1` is set, so the spec files don't have to change.

```bash
# Smoke against staging.
VITE_E2E_LIVE=1 \
VITE_E2E_API_BASE_URL=https://staging.shebafi.example/api/v1 \
VITE_E2E_SUPER_USER=admin VITE_E2E_SUPER_PASS='***' \
VITE_E2E_TENANT_USER=owner VITE_E2E_TENANT_PASS='***' \
VITE_E2E_TENANT_SLUG=acme \
pnpm test:e2e:live
```

| Env var                  | Purpose |
|--------------------------|---------|
| `VITE_E2E_LIVE`          | Set to `1` to skip the mock and hit a real backend. |
| `VITE_E2E_API_BASE_URL`  | Full API root, e.g. `http://localhost:8000/api/v1`. |
| `VITE_E2E_SUPER_USER` / `VITE_E2E_SUPER_PASS` | SaaS super-admin credentials. |
| `VITE_E2E_TENANT_USER` / `VITE_E2E_TENANT_PASS` | Tenant admin credentials. |
| `VITE_E2E_TENANT_SLUG`  | Slug used when seeding the tenant session. |

The live spec (`e2e/00-live.live.spec.ts`) covers four scenarios:

1. `backend root is reachable` — probes the API root and accepts any
   2xx/3xx/4xx response, so it works against the local dev server
   (405 Method Not Allowed is fine) and against staging (200 OK is fine).
2. `super-admin login + /auth/me round-trip` — full SaaS login then
   renders `/saas/tenants`.
3. `tenant login + customer list round-trip` — full tenant login
   then renders `/tenant/customers`.
4. `tenant /packages/ endpoint is reachable and returns 200` — pure
   API smoke for the tenant plane.

When credentials are missing, tests log a warning and skip rather
than fail, so the run still exits 0 — useful for CI pipelines that
intentionally run only the network probe.

## How it works

The fixture `tests/e2e-fixtures/mock-api.ts` installs a `page.route('**/api/**', ...)`
interceptor that returns deterministic JSON for every endpoint the
tests touch. The function short-circuits when `VITE_E2E_LIVE=1` so the
same spec files can be reused in both modes.

`tests/e2e-fixtures/auth.ts` exposes `applySeed({ clear, user })` which
registers a single `addInitScript` that:

1. Optionally clears `localStorage`.
2. Writes the dev-portal override (`sheba_dev_portal_override`).
3. Writes the per-portal session blob under the right key.

The single-script model avoids the race where a later `addInitScript`
order overwrites an earlier one. The dev-portal override is honoured by
`src/lib/portal/resolve-portal.ts` whenever the host is `localhost`,
even in production builds.

## CI configuration

Set `CI=1` to enable retries (2) and the html reporter. The browser
binary lives at `node_modules/.../playwright-core/.local-browsers` in
this workspace; export `PLAYWRIGHT_BROWSERS_PATH=0` so the test runner
finds it.

The recommended CI pipeline:

1. **PR checks** — run `pnpm test:e2e` (mock-backed, no backend needed).
2. **Nightly** — run `pnpm test:e2e:live` against a staging Django
   instance to catch backend regressions before they hit users.

## Adding a test

1. Use `installMockApi` in `beforeEach` to register the network mock.
2. Use `applySeed({ clear: true, user: E2E_USERS.<role> })` to plant
   a session.
3. Navigate and assert with `getByRole` / `getByText` locators.
4. If you need a new endpoint mocked, add a case in
   `tests/e2e-fixtures/mock-api.ts` `sampleItems(path)`.
5. For live-only tests, name the file `*.live.spec.ts` so it matches
   the `live` project. Always call `test.skip(!LIVE_ENABLED, '...')`
   in case the file is invoked without the env.

## Known gaps

- The mock fixture returns empty paginated lists for endpoints that
  aren't in `sampleItems`. New list screens should be added to that
  function as they grow.
- The live spec is intentionally narrow — auth + two list pages.
  Wider coverage (e.g. creating / editing a customer) belongs in
  per-feature spec files that gate on the same `LIVE_ENABLED` flag.
- The dev override is ignored when the host isn't `localhost` /
  `127.0.0.1` / `*.localhost`. E2E tests that need a portal context
  pick up the override through the seed.

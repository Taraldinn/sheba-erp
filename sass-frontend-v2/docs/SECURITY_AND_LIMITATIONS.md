# Security posture and known limitations

This document tracks the engineering rules we enforce, the gaps the
frontend cannot fix on its own, and the next tasks that require backend
coordination.

## Engineering rules we follow

- Hostname resolution **selects the portal context**; it is never the
  authorization mechanism. The backend authorizes every protected action
  through its session, role, scope, and resource-permission layers.
- Tokens are short-lived and stored under a per-portal session key in
  `localStorage`. Long-lived credentials (refresh tokens, device secrets)
  must never be persisted in the browser.
- We never expose router credentials, RADIUS shared secrets, or database
  passwords to the frontend. All provisioning operations are brokered by
  the backend.
- The wallet balance is rendered **as returned by the backend**. We do not
  recompute balances on the client; mutations always invalidate the wallet
  query and refetch.
- Mutations that touch money include an `Idempotency-Key` header generated
  by the client (see `src/lib/api/idempotency.ts`). Duplicate submissions
  resolve to the same backend transaction.
- The TanStack Query cache is scoped by `queryKeys.tenant()` /
  `queryKeys.saasTenants()` / `queryKeys.ispAdmin()` so context switches
  never leak cached data from one tenant to another.

## What the frontend cannot fix

- **Authoritative tenant membership.** A user can claim `tenant=acme` in
  the URL. The backend must verify the session includes that membership
  before returning tenant data. The frontend clears the local session
  cache on 401/403 but does not retroactively revoke access — the backend
  must reject the request.
- **Custom-domain verification.** A tenant can present a custom domain.
  The backend must verify the `Host:` header against the registered domain
  for the resolved tenant. The frontend accepts the host as a tenant
  selector and lets the backend decide.
- **Financial reversals.** Wallet debit/credit is the backend's source of
  truth. A `409` with `idempotency_conflict` indicates a duplicate
  request; we surface that error to the user without retrying.
- **Provisioning job progress.** Long-running MikroTik / RADIUS / OLT
  operations are tracked by backend jobs. The current frontend polls the
  job status endpoint at a configurable interval. The backend should
  provide a server-sent-events or WebSocket channel for true real-time
  updates; that is a pending coordination item.

## Known limitations / next tasks

1. **Server-Sent Events for long-running operations.** Replace the polling
   loop in the resellers / network pages with an SSE subscription.
2. **Background sync of cached-but-stale lists.** Use TanStack Query
   `staleTime` and a background `refetchInterval` only for read-mostly
   tables (subscribers list, packages list). Avoid background refetch on
   financial balances.
3. **End-to-end tests.** Wire Playwright tests for the workflows listed in
   `docs/frontend-backend-integration-matrix.md` once a staging backend is
   available.
4. **Type generation from OpenAPI.** The current `src/lib/api/types.ts`
   reflects the audited contract. Re-run `openapi-typescript` (or the
   project's chosen generator) against a fresh `docs/openapi_schema.json`
   drop to keep types in sync; wire it into a `pnpm generate:api` script.
5. **Permission reconciliation.** The `permissions` map in
   `src/lib/permissions/permissions.ts` mirrors the audit. When the
   backend adds new permission codes, they need to be added here AND in
   the role-to-permission map.
6. **Multi-tenant impersonation audit trail.** The `impersonateChildTenant`
   endpoint exists; an admin UI in the ISP portal to start/stop
   impersonation is pending.

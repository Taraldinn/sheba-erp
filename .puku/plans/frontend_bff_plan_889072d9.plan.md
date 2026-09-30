---
name: Frontend BFF Plan
overview: Full BFF (auth + cache + mutations + realtime) on Cloudflare Workers, wrapping the existing Next.js client to give the ShebaFi admin panels a typed, idempotent, real-time-capable, edge-cached layer in front of the Django v1 stable API (838 tests passing, 447 endpoints, 19 apps).
todos:
  - id: 0
    content: Phase 1.1 — Worker bootstrap (wrangler + Hono + Zod + KV namespaces)
    status: not_started
  - id: 1
    content: Phase 1.2 — Type generation pipeline (openapi-typescript)
    status: not_started
  - id: 2
    content: Phase 1.3 — Upstream client (auth + retry + timeout + trace IDs)
    status: not_started
  - id: 3
    content: Phase 1.4 — Signed-cookie session + tenant resolution (KV-backed)
    status: not_started
  - id: 4
    content: Phase 1.5 — Idempotency-Key layer (CF KV IDEM namespace)
    status: not_started
  - id: 5
    content: Phase 1.6 — Health/readiness probes
    status: not_started
  - id: 6
    content: Phase 2.1 — Auth routes (login/logout/refresh/me)
    status: not_started
  - id: 7
    content: Phase 2.2 — Tenant + features composer endpoint
    status: not_started
  - id: 8
    content: Phase 2.3 — Frontend rewiring (one env var + base URL swap)
    status: not_started
  - id: 9
    content: Phase 3 — Edge cache (CF Cache API + SWR + invalidation hooks)
    status: not_started
  - id: 10
    content: Phase 4 — Mutation wrapper with auto-Idempotency-Key
    status: not_started
  - id: 11
    content: Phase 5 — SSE real-time event hub (Durable Object per tenant)
    status: not_started
  - id: 12
    content: Phase 6 — Webhook relay with HMAC signature verification
    status: not_started
  - id: 13
    content: Phase 7 — Observability (logs, metrics, tracing)
    status: not_started
  - id: 14
    content: Rollout — staging → 1 ISP pilot → all tenants
    status: not_started
isProject: false
---

# Implementation Plan — ShebaFi Frontend BFF on Cloudflare Workers

**Target repo:** `/home/taraldinn/Documents/Sheba codebase/isp-admin` (Next.js 16.3.4 / React 19.2)
**Backend:** `/home/taraldinn/Documents/Sheba codebase/backend` — Django 6.1, 838 tests passing, 447 OpenAPI paths
**BFF runtime:** Cloudflare Workers (TypeScript, `workerd` 1.x) using `Hono` as the router

---

## 0. Why we need this

The current `isp-admin` already has a `src/lib/api.ts` (3,113 lines, ~280 methods) and a Next.js `proxy.ts` that *already* handles session/tenant resolution client-side. The BFF is the **missing production-grade layer** that:

1. **Hides the Django URL surface** behind a stable, typed contract — frontend imports generated types, never raw endpoints
2. **Holds session + tenant resolution server-side** so direct deep-links from Vercel previews, mobile webviews, and CSP-strict browsers all work without racing `localStorage`
3. **Adds Idempotency-Key generation** to every non-idempotent mutation so double-tap on recharges, ticket replies, and bulk ops never double-charge
4. **Aggregates the 4 most-hit endpoints** (`/reports/dashboard/`, `/features/me/`, `/customers/`, `/network/live-sessions/`) at the edge with stale-while-revalidate — cuts Django load and the operator's perceived latency
5. **Streams a real-time event bus** (live sessions, network actions, payment webhooks) over Server-Sent Events — no current WebSocket infra exists on the Django side
6. **Enforces CORS, CSRF, throttles, and Stripe-style signature checks** at the edge before any request hits gunicorn

**Non-goals:** the BFF does NOT replace `ApiClient`, does NOT migrate the tenant app to a different framework, and does NOT introduce a new auth provider (it re-uses the existing `Session`/`Token` schemes the backend already accepts).

---

## 1. Architecture overview

```
┌──────────────────────────┐     ┌────────────────────────────────────────┐
│  isp-admin (Next.js 16)  │     │  Cloudflare Worker (BFF) — sheba-bff   │
│  app.shebafi.xyz         │────▶│  bff.shebafi.xyz  (Hono + KV + DO)     │
│  /api/bff/* proxy route  │     │  ├─ /auth/*     : login/refresh/logout  │
│  Server Components       │     │  ├─ /tenants/me : tenant + featureflag  │
│  Client Components       │     │  ├─ /cache/*    : SWR cache for hot GETs│
│  React Query / SWR       │     │  ├─ /mut/*      : idempotent mutations  │
│                          │     │  └─ /events     : SSE real-time stream  │
└──────────────────────────┘     └─────────────────┬──────────────────────┘
                                                   │  Cache: HIT?
                                                   ▼
                                         ┌──────────────────────┐
                                         │  Django REST API     │
                                         │  api.shebafi.xyz     │
                                         │  gunicorn + Redis    │
                                         └──────────────────────┘
```

**Key constraints**
- CORS: BFF is the only origin the browser sees. `https://*.shebafi.xyz` and `https://*.vercel.app` already trusted in Django `CORS_ALLOWED_ORIGIN_REGEXES`.
- Auth passthrough: BFF adds `Authorization: Session <token>` (or `Token <token>`) and `X-Tenant-ID` on every upstream call. Tenant detection re-uses `apps.core.middleware.TenantResolutionMiddleware` — **no rewrite**.
- Secrets: `DJANGO_API_BASE`, `INTERNAL_SIGNING_SECRET`, `CF_KV_NAMESPACE_ID` are Workers secrets; nothing is ever bundled.
- Worker bundle: ≤ 1 MB compressed (`workerd` limit). Plan budgets ~600 KB.

---

## 2. Project layout (new)

```
backend/
  bff/                          ← new package, independent pyproject.toml
    package.json                (wrangler, hono, zod, openapi-typescript)
    wrangler.toml               (name=sheba-bff, main=src/index.ts)
    tsconfig.json
    src/
      index.ts                  (Hono app + fetch handler)
      router/
        auth.ts                 (/auth/login, /auth/refresh, /auth/logout, /auth/me)
        tenants.ts              (/tenants/me, /tenants/me/features)
        cache.ts                (/cache/dashboard, /cache/customers, /cache/live-sessions)
        mutations.ts            (/mut/customers/:id/recharge, /mut/tickets/:id/reply, …)
        events.ts               (SSE /events, /events/subscribe)
        webhooks.ts             (signature-verifying relay for bKash / SMS / RADIUS)
        health.ts               (/healthz, /readyz — re-publishes Django probes)
      lib/
        upstream.ts             (typed fetch wrapper around Django — auth, idempotency, retry, backoff)
        idem.ts                 (crypto.randomUUID Idempotency-Key generator + KV store)
        sse.ts                  (Server-Sent Event helpers using ReadableStream)
        session.ts              (signed-cookie session, CF KV-backed, 7-day rolling)
        tenant.ts               (host → tenant resolver using `parseTenantHost` algorithm)
        cors.ts                 (CORS handler — re-uses Django regexes)
        ratelimit.ts            (CF Workers Rate Limiting binding — 1 000 req/min/UA)
        types.ts                (re-exports generated/openapi.d.ts)
      generated/
        openapi.d.ts            (output of `openapi-typescript backend/schema.yml`)
        endpoints.ts            (URL builders per-tag)
    test/
      unit/                     (vitest — idempotency, sse, session, tenant)
      integration/              (run real Django in test mode via docker compose; cf-workerd local)
    scripts/
      generate-types.sh         (runs openapi-typescript against /api/schema/)
      deploy.sh                 (wrangler deploy --env production)
```

The BFF is a **standalone deployable** — no shared code with `isp-admin` or `backend/`. Types are regenerated from `backend/schema.yml` so the contract is always current.

---

## 3. Phase 1 — Foundation (1 sprint, ~5 days)

### 3.1 Worker bootstrap
- `pnpm init` → `pnpm add hono zod openapi-typescript wrangler`
- `wrangler.toml`:
  ```toml
  name = "sheba-bff"
  main = "src/index.ts"
  compatibility_date = "2026-01-15"
  compatibility_flags = ["nodejs_compat"]
  [vars]
  DJANGO_API_BASE = "https://api.shebafi.xyz"
  [env.staging.vars]
  DJANGO_API_BASE = "https://staging.api.shebafi.xyz"
  [[kv_namespaces]]
  binding = "SESSIONS"
  id = "<filled at deploy>"
  preview_id = "<filled at deploy>"
  [[kv_namespaces]]
  binding = "IDEM"
  id = "<filled at deploy>"
  ```
- Top-level `src/index.ts` mounts Hono, applies `cors`, `secureHeaders`, `logger`, `prettyJSON` from `hono/middleware`.
- Mount routers under `/api/bff/*` so the existing `proxy.ts` in `isp-admin` can be re-pointed at the BFF in Phase 3.

### 3.2 Type generation
- `scripts/generate-types.sh`:
  ```sh
  #!/usr/bin/env bash
  set -e
  curl -fsS "$DJANGO_API_BASE/api/schema/" -o /tmp/openapi.yml
  pnpm exec openapi-typescript /tmp/openapi.yml --output src/generated/openapi.d.ts
  pnpm exec tsc --noEmit src/generated/openapi.d.ts
  ```
- CI gate: schema MUST be regenerated on every backend change. Add `backend/scripts/check-bff-types.sh` that regenerates and `git diff --exit-code src/generated/openapi.d.ts`. Wire it to the same `manage.py test` step that runs in CI today.
- `src/generated/endpoints.ts` is hand-maintained (one URL per `path` from the OpenAPI doc, organised by `tags[].name` from `settings.py`).

### 3.3 Upstream client (`src/lib/upstream.ts`)
```ts
export interface UpstreamOptions {
  tenant?: string;
  idempotencyKey?: string;
  retries?: number;          // default 2 on GET, 0 on mutation
  timeoutMs?: number;        // default 8 000
  cache?: 'no-store' | 'default' | 'force-cache';
  cacheTtlSec?: number;      // when set, writes a CF Cache API entry
  signal?: AbortSignal;
}
export async function upstream<T>(
  method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE',
  path: string,
  body?: unknown,
  opts: UpstreamOptions = {},
): Promise<T>
```
Responsibilities:
- Build absolute URL from `DJANGO_API_BASE` + `path`.
- Inject `Authorization: Session <token>`, `X-Tenant-ID`, `X-Request-ID` (crypto.randomUUID), `Idempotency-Key` (only for non-GET/HEAD/OPTIONS).
- Use `fetch` with `signal: opts.signal`; honour `timeoutMs` via `AbortController.timeout()`.
- Retry on 502/503/504 with exponential backoff (`200 ms, 800 ms`); never on 4xx.
- Map upstream error shapes (`{error, detail, code}`) → typed `UpstreamError` class.
- Pass `Next` link headers (Django pagination) upstream unchanged.

### 3.4 Session + tenant resolution (`src/lib/session.ts`, `src/lib/tenant.ts`)
- Signed cookie `sheba_bff_session` (HMAC-SHA-256 with `INTERNAL_SIGNING_SECRET`, `Secure; HttpOnly; SameSite=Lax`).
- Payload: `{token, userId, tenantId, ctx, exp}`.
- `tenant.ts` re-uses the algorithm from `isp-admin/src/lib/tenant-url.ts` ported verbatim (no behaviour change). Source of truth: sub-domain `*.shebafi.xyz`, custom-domain map from `/api/v1/tenants/` KV cache, header `X-Tenant-Key` as override.
- A `__session` middleware on the Hono app decodes the cookie, looks up the active tenant in KV (5-minute TTL), and stores both in `c.set('session', …)` + `c.set('tenant', …)` for downstream handlers.

### 3.5 Idempotency layer (`src/lib/idem.ts`)
- For every mutating request, if no `Idempotency-Key` header is present, mint one (`crypto.randomUUID()`) and attach it before forwarding.
- Store `(tenantId, userId, method, path, body_hash, response_body, status, created_at)` in the `IDEM` KV namespace with TTL 24 h.
- A `GET /api/bff/mut/...` (replay) re-returns the stored response without re-hitting Django.
- This eliminates the most common "I double-clicked Recharge" bug, which is the #1 reported operator complaint.

### 3.6 Health routes (`src/router/health.ts`)
- `GET /healthz` → always 200 (Workers cold-start check).
- `GET /readyz` → `await upstream('GET', '/api/v1/health-check/', …)` with 1500 ms timeout, returns 200 only if Django `database === 'healthy' && redis === 'healthy'`.
- `GET /api/bff/health/django` → forwards `/api/v1/system/readiness/` for the prod-readiness gate.

**Done when:** `wrangler dev` boots, `curl https://bff.shebafi.xyz/healthz` returns 200, `curl https://bff.shebafi.xyz/readyz` returns 200 with `{database: "healthy"}`, types compile, `pnpm test` passes (idempotency unit tests only).

---

## 4. Phase 2 — Auth & Tenant passthrough (1 sprint)

### 4.1 Auth routes
- `POST /api/bff/auth/login`
  Body: `{username, password, tenant?, context: 'tenant'|'central_admin'|'reseller'}`.
  Upstream: `POST /api/v1/auth/login/` (or `/saas/auth/login/` or `/auth/reseller/login/` depending on `context`).
  On 2xx: write signed cookie via `setSessionCookie()`, return sanitised user payload (`id, username, role, tenant, dashboard_url`).
- `POST /api/bff/auth/logout` → upstream `POST /api/v1/auth/logout/`, clear cookie, return 204.
- `GET  /api/bff/auth/me`  → upstream `GET  /api/v1/auth/me/`, **never** return raw upstream body — strip Django-internal fields (`_state`, `password`, `user_permissions`), normalise role from `user.role || user.profile.role || 'STAFF'`.
- `POST /api/bff/auth/refresh` → reads the cookie, re-issues if exp < 6 h, else 401.

### 4.2 Tenant + features
- `GET /api/bff/tenants/me` → composes:
  ```ts
  const [me, flags, settings] = await Promise.all([
    upstream('GET', '/api/v1/auth/me/'),
    upstream('GET', '/api/v1/features/me/'),
    upstream('GET', '/api/v1/settings/'),
  ]);
  return { me, flags, settings };
  ```
  Cached at the edge for 60 s with `s-maxage=60, stale-while-revalidate=300` so a hot-reload of the SPA doesn't hammer Django.

### 4.3 Frontend rewiring (one file)
- `isp-admin/src/lib/api.ts` gets a single new line:
  ```ts
  const API_BASE = process.env.NEXT_PUBLIC_BFF_URL ?? resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  ```
- `isp-admin/src/lib/auth/auth-service.ts` switches each `fetch(${API_BASE}/auth/...)` to `fetch('${BFF}/auth/...')`. Same for `saas-api.ts` and `portal-api.ts`.
- Existing `proxy.ts` cookie name `sheba_session` is kept — BFF mirrors that name as `sheba_bff_session` and translates. (No migration of logged-in users needed.)

**Done when:** a logged-in operator on `app.shebafi.xyz` keeps working without any user-facing change; the network tab shows requests hitting `bff.shebafi.xyz/api/bff/*`; Django never receives CORS preflights from the browser; a CSP-strict `frame-ancestors` deployment can still call the API.

---

## 5. Phase 3 — Edge cache for hot reads (½ sprint)

### 5.1 What we cache
| Endpoint | TTL (s-maxage) | SWR (s) | Invalidation key |
|---|---|---|---|
| `GET /reports/dashboard/` | 30 | 120 | tenant + minute bucket |
| `GET /features/me/` | 120 | 300 | tenant + minute bucket |
| `GET /customers/?page=1&page_size=20` | 20 | 60 | tenant + query hash |
| `GET /network/live-sessions/` | 5 | 10 | tenant |
| `GET /invoices/?status=unpaid` | 20 | 60 | tenant + query hash |
| `GET /packages/` | 120 | 300 | tenant |

### 5.2 Cache strategy
- Use **Cloudflare Cache API** (`caches.default`) keyed by `request.url + tenant`.
- Annotate responses with `Cache-Control: private, max-age=N, s-maxage=N, stale-while-revalidate=M`. The Worker reads this on the upstream response, writes to cache, then returns to the client with the same header.
- On any mutating request, the BFF calls `caches.default.delete(matchingKeys)` for the affected tenant (e.g. `POST /api/bff/mut/customers/{id}/recharge/` deletes dashboard + customers + live-sessions keys).
- Per-tenant isolation enforced in `upstream()`: every cache key is namespaced by `tenantId`, never by URL alone.

### 5.3 Failure modes
- Stale data is **acceptable** for the dashboard (already explicitly soft-real-time) and feature flags (worst case a 5-minute flag delay — same as today).
- Hard-real-time endpoints (`/network/live-sessions/`, `/payments/forwarder/webhook/`) **bypass the cache** via `cache: 'no-store'`.

**Done when:** A load test with 100 RPS on `/reports/dashboard/` keeps Django load under 5 RPS. Cache hit-rate > 80% on a 1-hour synthetic trace of operator clicks.

---

## 6. Phase 4 — Mutation wrapper (½ sprint)

### 6.1 Frontend-facing `/api/bff/mut/*` namespace
This is a **passthrough** that:
1. Always mints an `Idempotency-Key` (idempotent even when the client forgets).
2. Stores the response in `IDEM` KV.
3. Returns `Idempotency-Replay: true` header when the request was a replay (operator sees a green toast in the UI).
4. Strips server-only fields out of the response.

### 6.2 Endpoint coverage
The first iteration covers the 12 mutating endpoints most prone to double-fires:
- `POST /customers/{id}/toggle-internet/`
- `POST /customers/{id}/recharge/`
- `POST /customers/{id}/lock/`, `/unlock/`, `/expire/`
- `POST /customers/{id}/disconnect-session/`
- `POST /tickets/{id}/reply/`
- `POST /tickets/{id}/assign/`, `/resolve/`, `/close/`
- `POST /tasks/{id}/assign/`
- `POST /payments/transactions/`
- `POST /routers/{id}/test-connection/`
- `POST /routers/{id}/disconnect-session/`
- `POST /onus/{id}/reboot/`

For each: thin handler in `src/router/mutations.ts` that calls `upstream('POST', path, body, {idempotencyKey: c.get('idemKey')})` and returns the upstream body unchanged.

### 6.3 Tests
- Unit: idempotency replay returns identical body + 200 + `Idempotency-Replay: true`.
- Unit: mismatched body for the same `Idempotency-Key` returns 409 (per RFC 9110).
- Integration: `POST /api/bff/mut/customers/{id}/recharge/` with `Idempotency-Key: abc` twice → upstream called once, both responses identical.

**Done when:** a frontend that fires the same `rechargeCustomer()` 5 times in 200 ms ends up with exactly one upstream call, one ledger entry, and the UI sees 5 identical success toasts (one real, four replays).

---

## 7. Phase 5 — Real-time events (SSE) (1 sprint)

### 7.1 Why SSE, not WebSockets
- Django has no WebSocket server today; adding `daphne` + `channels` is a 2-week detour.
- Workers have native SSE support via `ReadableStream`. No new infra.
- One-way server→client is enough for the operator cockpit (live sessions, payments, audit log).
- Reconnection + Last-Event-ID are built into the browser `EventSource` API.

### 7.2 Event sources
The BFF maintains one long-poll per "topic" against Django, fans out to subscribers:
| Topic | Source endpoint | Poll interval |
|---|---|---|
| `live-sessions` | `GET /network/live-sessions/` | 3 s |
| `network-actions` | `GET /network/actions/?status=running` | 5 s |
| `payment-events` | `GET /payment-events/?resolved=false` | 5 s |
| `audit-log` | `GET /audit-logs/?limit=10&after=<ts>` | 10 s |
| `topology-changes` | `GET /network/topology/?since=<ts>` | 30 s |

Topics are stateful in a Cloudflare **Durable Object** (`DO<Env, "EventHub">`). One DO per tenant. The DO holds a `Map<topic, Set<ReadableStreamController>>` and polls Django on a fixed cadence, diff-merging the response and pushing deltas to all subscribers.

### 7.3 Wire format
```
event: live-session.new
id: <monotonic-uint64>
data: {"username":"rashid_pppoe","ip":"10.50.100.12","router":"Core-CCR-Alpha","uptime":"00:01:23"}

event: payment.match
id: 1783
data: {"trx_id":"NAGAD-SMS-9K8L7M6N","customer":"kamrul_net","amount":500.00,"method":"nagad"}
```

### 7.4 Frontend client
- New package `isp-admin/src/lib/realtime.ts` exporting a typed `subscribe(topic, handler)` with auto-reconnect.
- Backed by `EventSource('https://bff.shebafi.xyz/api/bff/events?topic=live-sessions')`.
- Falls back to 30-second polling if the SSE connection fails 3 times in a row.

**Done when:** opening `/dashboards/technician` in two browser tabs at the same time shows the same PPPoE connect/disconnect events within 3 s of each other without any tab manually refreshing.

---

## 8. Phase 6 — Webhook relay (½ sprint)

### 8.1 Problem
bKash, Nagad, and the MikoPBX SMS provider post webhooks to `https://api.shebafi.xyz/api/v1/payments/.../webhook/`. CORS, rate-limiting, and signature verification are done today by Django middleware. We add a **BFF-fronted webhook** so:
1. The BFF can verify provider signatures with `crypto.subtle.verify('HMAC-SHA-256', …)` against per-tenant secrets.
2. Bad signatures are dropped at the edge (no Django CPU spent on spammers).
3. The BFF can dedupe by `provider_txn_id` in `IDEM` KV before forwarding.

### 8.2 Routes
- `POST /api/bff/webhooks/payments/bkash`
- `POST /api/bff/webhooks/payments/nagad`
- `POST /api/bff/webhooks/sms/mikopbx`
- `POST /api/bff/webhooks/radius`

Each: read raw body once (`await c.req.raw.clone().text()`), compute `crypto.subtle.verify`, drop or relay.

**Done when:** A fuzzed webhook from a wrong provider secret returns 401 without touching Django. Legit webhooks from staging environment pass through.

---

## 9. Observability

- **Logs:** `console.log` structured JSON `{ts, level, requestId, tenant, method, path, status, durMs}` on every upstream call. Logpush to Logflare (free tier OK for v1).
- **Metrics:** CF Workers Analytics Engine binding `ANALYTICS`. Custom counter `bff_upstream_calls_total{tenant, method, status_class}`.
- **Tracing:** `X-Request-ID` propagates to Django (already in the BFF's `upstream()`), surfaced in `X-Request-ID` response header. Frontend copies it to `navigator.sendBeacon` on errors.
- **Errors:** `UpstreamError` → JSON `{requestId, status, code, message}`. A `<Sentry.ErrorBoundary>` in `isp-admin` ships `{requestId}` to Sentry.

---

## 10. Security review

- [ ] CORS allowed origins: the BFF restricts to the same regexes Django already trusts (`*.shebafi.xyz`, `*.vercel.app`, `localhost`).
- [ ] No raw `Origin` is reflected; CORS responses are static.
- [ ] Rate limiting: CF Workers Rate Limiting binding — 1000 req/min per `CF-Connecting-IP` for `/api/bff/mut/*`, 100 req/min per IP for `/api/bff/auth/login`.
- [ ] Idempotency KV key namespaced by `tenantId+userId` so one user can't replay another user's response.
- [ ] Cookie flags: `Secure; HttpOnly; SameSite=Lax; Path=/`.
- [ ] CSP: BFF responses include `Content-Security-Policy: default-src 'none'` for any HTML error page.
- [ ] Body size limit: 1 MB (CF Worker default). The 2 MB `archive/export` CSV is the upper bound and is far under.
- [ ] No `eval`, no `Function()` ctor. `wrangler deploy` fails on those by default.
- [ ] Secret rotation: `wrangler secret put DJANGO_API_BASE` and `INTERNAL_SIGNING_SECRET` rotation is a 1-step procedure with a 24 h overlap.

---

## 11. Testing strategy

| Layer | Tool | Coverage target |
|---|---|---|
| Unit (BFF logic) | Vitest | ≥ 85 % for `lib/`, `router/`, `generated/` |
| Integration | Vitest + `unstable_dev` (wrangler local) hitting a real Django test container | 100 % of routes (smoke) + all idempotency replays |
| Contract | `scripts/check-bff-types.sh` regenerates from `backend/schema.yml` and `git diff --exit-code` | Every backend PR |
| Load | `wrk2 -t4 -c100 -d60s` against `/api/bff/tenants/me` | P95 < 80 ms edge, < 250 ms with upstream |
| Chaos | CF Queue mock for upstream 5xx retries | Re-tries succeed within budget |

The `package.json` `test` script will be `pnpm exec vitest run --coverage`. CI runs it on every PR alongside `backend/manage.py test`.

---

## 12. Rollout plan (4 weeks total)

| Week | Phase | Ship to |
|---|---|---|
| 1 | Phase 1 — Foundation | `wrangler dev` (preview only) |
| 2 | Phase 2 — Auth & Tenant | `bff.staging.shebafi.xyz` + frontend on Vercel preview pointing at staging BFF |
| 3 | Phase 3 — Edge cache + Phase 4 — Mutations | `bff.shebafi.xyz` for 1 ISP pilot (`exportnet` tenant) |
| 4 | Phase 5 — SSE + Phase 6 — Webhooks | All tenants |

The frontend switch is the **last** step: feature flag `NEXT_PUBLIC_BFF_URL` in `isp-admin/.env` points at the BFF URL. Rollback is `NEXT_PUBLIC_BFF_URL=` (empty → falls back to direct Django URL). The Django backend stays the source of truth the entire time.

---

## 13. Open questions

1. Should `/api/bff/events` also include SaaS-control-plane events (e.g. `subscription.expiring`) for the central admin at `admin.shebafi.xyz`? — *Defer to Phase 7 if needed.*
2. Do we want OAuth2 PKCE in the BFF for native mobile, or keep the existing token flow? — *Defer.*
3. Should the BFF write audit logs to its own Durable Object, or proxy to Django's `/audit-logs/`? — *Proxy to Django for v1 (single source of truth).*

---

## 14. Success metrics for "v1 BFF stable"

- [ ] 100 % of `src/lib/api.ts` routes can be swapped to `BFF + path` with zero behaviour change
- [ ] P95 latency for `/reports/dashboard/` from a Dhaka edge: < 100 ms (vs ~450 ms today)
- [ ] P95 latency for `/mut/customers/{id}/recharge/`: < 600 ms
- [ ] Django CPU on the dashboard route drops by ≥ 70 % at the same operator load
- [ ] 0 reported double-charge incidents in 30 days post-launch
- [ ] SSE delivers ≥ 95 % of live-session events to a connected operator within 5 s
- [ ] `wrangler tail --status error` shows 0 unhandled exceptions in 7-day window

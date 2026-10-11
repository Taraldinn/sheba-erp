# Deployment

This document describes how to ship the Shebafi TanStack Start frontend to a
multi-portal production environment.

## Build

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The build output is in `dist/` (server + client bundles). TanStack Start
emits a Node-compatible server entry plus a static client bundle.

## Environment variables

All variables are prefixed `VITE_` so they are exposed to the client bundle.
Configure them at deploy time via your platform's secret store. **Never
commit real values.**

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API origin. | `https://api.example.com` |
| `VITE_SAAS_API_BASE_URL` | Optional dedicated SaaS origin. | falls back to `VITE_API_BASE_URL` |
| `VITE_SUPER_ADMIN_HOST` | Hostname for the SaaS portal. | `admin.example.com` |
| `VITE_ISP_HOST` | Hostname for the ISP owner portal. | `app.example.com` |
| `VITE_PUBLIC_HOME_HOST` | Apex / public home hostname. | `example.com` |
| `VITE_TENANT_ROOT_DOMAIN` | Root for `{tenant}.<root>` resolution. | `example.com` |
| `VITE_PUBLIC_SIGNUP_ENABLED` | Toggle public onboarding link. | `true` |
| `VITE_SHOW_DEV_PORTAL_SWITCHER` | **Must be `false` in production.** | `false` |

## Hosting

The frontend is a TanStack Start application (Node server + static assets).
Two deployment options are documented:

1. **CloudFront + S3 + Node origin (recommended for multi-portal)**

   - Put the static `dist/client/` bundle on S3 and front it with CloudFront.
   - Run the `dist/server/` Node entry as the origin for the
     `/api/server-function/*` paths (or use the `output: 'server'` server
     target in front of CloudFront).
   - Configure CloudFront behaviours to forward `Host:` and `Origin` headers
     to the origin for SPA routing.
   - Add SPA fallback: 403/404 from S3 must serve `/index.html` with HTTP 200
     so deep links survive a refresh.

2. **Single Node host behind a load balancer**

   - `pnpm preview` (or your platform's Node launcher) runs the full app.
   - Terminate TLS at the load balancer; route by `Host:` header to the same
     app, since the tenant resolver inspects the request hostname.

## Wildcard and custom domains

To serve tenants on `{tenant}.example.com` you need:

- A wildcard TLS certificate for `*.example.com` (and apex).
- DNS: `*.example.com` → your CloudFront distribution / load balancer.
- A registered and verified custom-domain mechanism in the backend (see
  the SaaS Domains admin pages) for non-wildcard tenant domains like
  `portal.acme-isp.net`.

The frontend treats any host that is NOT one of the configured apex
infrastructure hostnames as a custom TENANT host. The backend is the
authority on which tenants are allowed on which custom domains — never
trust the hostname for authorization decisions.

## CORS / cookies / CSRF

The backend must:

- Allow the portal origins in `Access-Control-Allow-Origin`.
- Echo `Access-Control-Allow-Credentials: true` for cookie-based auth.
- Reject non-`Content-Type` / `Authorization` headers that don't match
  expected names.
- Validate the `Origin` header against the expected portal origins on
  state-changing requests (CSRF defense).

The frontend:

- Sends `credentials: 'include'` when `VITE_API_AUTH_MODE=cookie` (default
  in this template).
- Sends `Authorization: Bearer <token>` when `VITE_API_AUTH_MODE=bearer`.
- Never puts long-lived credentials in `localStorage`; only the per-portal
  short-lived session blob is stored.

## Cache invalidation on release

When shipping a new build:

1. Upload the new `dist/client/` assets to S3 with cache-busted filenames
   (TanStack Start already hashes assets).
2. Invalidate CloudFront for `/index.html` and any other un-hashed entry
   points so users pick up the new bundles on the next navigation.
3. Roll the `dist/server/` Node entry behind the load balancer (rolling
   restart is fine; sessions are read from per-portal storage and will
   persist if Redis is wired in).

## CI checks

The recommended CI pipeline runs:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All four must pass before merge. The integration matrix in
`docs/frontend-backend-integration-matrix.md` should be updated whenever a
new endpoint is wired or a new module is delivered.

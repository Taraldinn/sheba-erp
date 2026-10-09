# Shebafi ISP ERP — Frontend Multi-Host Deployment Guide

**Companion to:** `docs/DEPLOYMENT.md`, `docs/DEPLOYMENT_MULTI_PORTAL.md`,
`docs/AUDIT_AND_IMPLEMENTATION_PLAN.md`

This document covers the production topology for the **single
multi-portal frontend** (Cloudflare Pages) and the multi-host DNS +
TLS + reverse-proxy configuration it must serve.

```
                    Internet
                        |
                Cloudflare Edge (DNS + TLS + WAF)
                        |
              +---------+----------+----------------+
              |                    |                |
        admin.example.com   app.example.com   {tenant}.example.com
              |                    |                |
              +--------+-----------+--------+-------+
                       |                    |
                  Cloudflare Pages       api.example.com
                  (single SPA build,     (Django backend)
                   multi-host via
                   Custom Domain)
```

The backend is **NOT** served from the same host as the SPA. The SPA
is statically rendered; every API call goes cross-origin to
`api.example.com`. The backend is the only authority for
authentication, tenant context, and any tenant-specific data.

---

## 1. Required hostnames

| Hostname | Purpose | Backend authority |
|---|---|---|
| `admin.example.com` | SaaS Super Admin portal | Backend `/api/v1/saas/*` |
| `app.example.com` | ISP Owner SaaS Portal (multi-tenant) | Backend `/api/v1/admin/*` + `/api/v1/*` |
| `{tenant}.example.com` | Tenant ERP (admin / client / reseller) | Backend `/api/v1/*` (Host-based) |
| `api.example.com` | Backend API only — must NOT serve the SPA | Django |

> Treat `example.com` as a placeholder. In production, replace with
> the real apex domain (e.g. `shebafi.com`, `myisp.io`, etc.).
> The portal resolver in `src/portal/config.ts` reads
> `VITE_TENANT_ROOT_DOMAIN`, `VITE_SUPER_ADMIN_HOST`,
> `VITE_ISP_HOST` to set the apex and the dedicated hostnames.

---

## 2. Cloudflare Pages setup

The frontend builds a single bundle (`npm run build` → `dist/`) and
serves it on **multiple hostnames** through Cloudflare Pages' Custom
Domain feature. Wildcard tenant subdomains require a Cloudflare
**Custom Domain with wildcard DNS** (paid plan) or per-tenant DNS
records if the count is small.

### 2.1 Project bootstrap

```bash
cd sass-frontend
npm install
npm run build
npx wrangler pages deploy dist --project-name shebafi-erp
```

### 2.2 Custom domains

In the Cloudflare dashboard, add the following Custom Domains to
the `shebafi-erp` Pages project:

1. `admin.example.com`
2. `app.example.com`
3. `*.example.com` (wildcard) — only if the Cloudflare plan permits

Cloudflare will issue a free universal TLS certificate that covers
all three hostnames plus the apex, satisfying the multi-portal
requirement.

### 2.3 SPA direct navigation

`wrangler.jsonc` sets `assets.not_found_handling: "single-page-application"`.
This means any unmatched path (e.g. `/admin/child-tenants/123`) is
served as the SPA's `index.html`, so React Router takes over and
renders the right page. Direct navigation and page refresh on
nested routes therefore work without a server-side rewrite rule.

### 2.4 No public caching of authenticated content

The SPA shell is small and cacheable (Vite hashes the assets in
`/assets/*`). The HTML entry is intentionally short-lived (default
Cloudflare Pages behaviour: no-store for HTML, immutable for
hashed JS/CSS). Authenticated API responses are never served by
the SPA — only the backend can set `Cache-Control` on those.

---

## 3. Backend origin

The backend must be reachable at `api.example.com`. A typical
deployment:

```nginx
# /etc/nginx/sites-available/api.example.com
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # Force HTTPS
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Tenant resolution middleware reads the Host header.
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Cap upload size for CSV / bulk imports
    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
    }
}
```

### 3.1 CORS

The backend's `CORS_ALLOWED_ORIGINS` (Django settings) must include
every portal host that may call the API cross-origin:

```python
CORS_ALLOWED_ORIGINS = [
    "https://admin.example.com",
    "https://app.example.com",
    # Tenant subdomains — pattern-based, enforced at runtime
    # by `CORS_ALLOWED_ORIGIN_REGEXES`.
]

CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://[a-z0-9-]+\.example\.com$",  # wildcard tenant hostnames
    r"^https://[a-z0-9.-]+\.localhost(?::\d+)?$",  # dev
    r"^https://[a-z0-9-]+\.shebafi\.xyz$",   # optional apex aliases
]
```

> **Important.** CORS is enforced per request. The wildcard tenant
> subdomain pattern above must be reviewed whenever a new apex
> domain is added.

### 3.2 Auth cookies

The backend uses `Authorization: Token <key>` (DRF TokenAuth).
This is **not** a browser cookie, so the cross-origin SPA → API
flow does not require a `SameSite=None` cookie configuration.

If a future iteration switches to session cookies, the cookie must
be:

- `Secure`
- `SameSite=None` (because the SPA and the API live on different
  hosts)
- `HttpOnly` (always)

The backend's `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`
and `CSRF_COOKIE_SECURE`, `CSRF_COOKIE_SAMESITE` settings must
match.

---

## 4. DNS records

| Type | Name | Value | Notes |
|---|---|---|---|
| `A` | `api` | `<backend-ipv4>` | Or `CNAME` if behind a proxy |
| `A` | `admin` | Cloudflare Pages proxied | |
| `A` | `app` | Cloudflare Pages proxied | |
| `A` | `*` | Cloudflare Pages proxied (wildcard) | optional |

> Do not commit real IPs or production DNS values into the
> repository. The table above shows the *shape* of the records,
> not the values.

---

## 5. Environment variables

The frontend reads (Vite):

- `VITE_API_BASE_URL` — e.g. `https://api.example.com/api/v1/`
- `VITE_API_URL` — alias for `VITE_API_BASE_URL`
- `VITE_SUPER_ADMIN_HOST` — `admin.example.com`
- `VITE_ISP_HOST` — `app.example.com`
- `VITE_TENANT_ROOT_DOMAIN` — `example.com`
- `VITE_PUBLIC_HOME_HOST` — `example.com` (apex)

For local development these are optional; the Vite dev server
proxies `/api/*` to `http://127.0.0.1:8000` and the portal
resolver falls back to `*.localhost`.

In Cloudflare Pages, set them in **Settings → Environment
variables** for the *Production* environment. **Do NOT** commit
sensitive env values (none of the above are sensitive — the API
URL is a public origin).

---

## 6. Caddy configuration (alternative reverse proxy)

If you prefer Caddy over Nginx, the equivalent is:

```caddy
api.example.com {
    reverse_proxy 127.0.0.1:8000 {
        header_host {host}
        transport http {
            dial_timeout 10s
            response_header_timeout 60s
        }
    }
    encode zstd gzip
}
```

Caddy issues a Let's Encrypt certificate automatically.

---

## 7. Custom-domain tenant verification

The portal resolver at `src/portal/resolve-portal.ts` accepts any
`*.example.com` (or non-reserved multi-label) hostname as a
*tentative* tenant. **Authorization is enforced by the backend** —
not by the hostname alone. A request to `https://unknown.example.com/api/v1/auth/me/`
returns `401 Unauthorized` or `404 Tenant not found` if the
custom domain has not been verified.

The custom-domain verification flow (DNS TXT challenge, served by
`/api/v1/admin/domains/{id}/verify/`) is the **only** way to
associate a custom hostname with a tenant row. The frontend must
not attempt to bypass this.

---

## 8. Direct-navigation and refresh — verified

Because `wrangler.jsonc` declares
`"not_found_handling": "single-page-application"`, every unknown
path on the Pages project is rewritten to `/index.html`. The
`PortalRouter` then matches the URL against the registered
`Routes` and renders the right screen. Refresh on `/admin/child-tenants/123`
works without a 404.

This is covered by the existing test suite (`src/__tests__/routes.test.tsx`,
`resolve-portal.test.ts`).

---

## 9. Outstanding / non-goals

- The current build does **not** include a Service Worker for
  offline support. The portal must be online.
- Cloudflare Access / Zero Trust is **not** configured by this
  document. The backend `IsAuthenticated` / RBAC checks remain
  authoritative.
- The CSP header is **not** set by the SPA. If you need CSP, add
  it on the Cloudflare Pages side via custom headers or a Worker
  in front of the Pages project.
- Backend `docs/PRODUCTION_READINESS.md` and
  `docs/DEPLOYMENT_MULTI_PORTAL.md` cover the backend side; cross-
  reference them when troubleshooting.

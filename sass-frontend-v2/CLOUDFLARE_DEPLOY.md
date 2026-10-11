# Sheba Frontend — Cloudflare Workers deployment (OpenNext)

This document describes how to ship the **Next.js 16 App Router** portal
(`sass-frontend-v2/`) to Cloudflare using the
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) adapter.

It assumes the Django backend is already running somewhere reachable over HTTPS
and that the multi-host DNS records (`admin.shebafi.xyz`, `app.shebafi.xyz`,
`*.shebafi.xyz`, `shebafi.xyz`) are pointed at Cloudflare.

> The existing `DEPLOYMENT_DOKPLOY_VERCEL.md` and `docs/DEPLOYMENT.md` describe
> the Dokploy + Vercel split. This file is the **Cloudflare-only** variant.

---

## 1. One-time prerequisites

| Tool | Tested | Notes |
| --- | --- | --- |
| Node | 22.x or 24.x | Workers / OpenNext require `>=22`. |
| pnpm | 9+ | The repo uses `pnpm` workspaces. |
| Cloudflare account | — | Free tier works for dev; paid for production. |
| Wrangler | `^4.148` | Already in `devDependencies` of this package. |
| R2 bucket `sheba-frontend-cache` | optional | Only required for ISR / `revalidateTag` durability. |

```bash
cd sass-frontend-v2
pnpm install
pnpm cf:build                 # sanity-check the OpenNext build first
```

---

## 2. Required Cloudflare resources

1. **R2 bucket for incremental cache** (skip if you are not using ISR):
   ```bash
   wrangler r2 bucket create sheba-frontend-cache
   ```
   Then uncomment the `r2_buckets` block in `wrangler.jsonc`.

2. **Cloudflare Images** (optional, for `<Image>` optimization):
   - Enable Images in the dashboard.
   - Uncomment the `images` block in `wrangler.jsonc`.

3. **KV / Durable Objects**: not required by the current build. OpenNext will
   create its own DO namespace the first time you enable `DOQueueHandler` /
   `DOShardedTagCache` for tag revalidation.

---

## 3. Local preview

```bash
cp dev.vars.example dev.vars   # fill in real values
pnpm preview                   # = opennextjs-cloudflare build && preview
```

This runs the production build inside `workerd` (Miniflare) on
`http://localhost:8787` and serves the multi-tenant rewrites exactly as
Workers will in production. Use `--remote` to attach to your live account.

---

## 4. Production deploys

```bash
# first time only — register the worker
pnpm exec wrangler login
pnpm deploy
```

`pnpm deploy` is an alias for `opennextjs-cloudflare build && deploy`; it
produces `.open-next/worker.js` + `.open-next/assets/` and uploads them to
Workers.

For automated CI deploys (GitHub Actions etc.) you can run:

```bash
CLOUDFLARE_API_TOKEN=<token> pnpm exec wrangler deploy
```

The token needs `Workers Scripts:Edit`, `Workers KV Storage:Edit`, and
`R2 Storage:Edit` scopes.

---

## 5. Custom domain + wildcard

In **Workers & Pages → sheba-frontend → Settings → Triggers → Custom Domains**:

| Hostname | Purpose |
| --- | --- |
| `shebafi.xyz` | Apex / public landing (`/`) |
| `admin.shebafi.xyz` | SaaS super admin (`/saas/*`) |
| `app.shebafi.xyz` | ISP owner portal (`/isp/*`) |
| `*.shebafi.xyz` | Tenant subdomains (`/tenant/*`) |

The Next.js middleware in `src/middleware.ts` reads the `Host` header to
decide which portal to serve. Cloudflare's wildcard custom-domain support
handles the per-tenant DNS automatically — you do not need a Route53 / CF API
loop to spin up a new tenant.

> **Tenant verification still happens on the backend.** The custom domain
> attaches to the worker, but `TenantResolutionMiddleware` (Django) is the
> authority for who can use which host.

---

## 6. Environment variables

`wrangler.jsonc` only carries `vars` that are safe to commit. Real secrets and
environment-specific values go through:

```bash
pnpm exec wrangler secret put FIELD_ENCRYPTION_KEY     # backend, not worker
pnpm exec wrangler secret put NEXT_PUBLIC_API_URL     # if you prefer secrets
```

For **build-time** env vars (those consumed by `next build` and inlined into
the client bundle), set them in the Cloudflare dashboard under
**Workers → sheba-frontend → Settings → Variables and Secrets → Build time
variables and secrets**. The same names that worked on Vercel apply here:

| Name | Example value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api.shebafi.xyz/api/v1` |
| `NEXT_PUBLIC_SUPER_ADMIN_HOST` | `admin.shebafi.xyz` |
| `NEXT_PUBLIC_ISP_HOST` | `app.shebafi.xyz` |
| `NEXT_PUBLIC_PUBLIC_HOME_HOST` | `shebafi.xyz` |
| `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` | `shebafi.xyz` |
| `NEXT_PUBLIC_KNOWN_APEX_DOMAINS` | `shebafi.xyz` |
| `NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED` | `true` |
| `NEXT_PUBLIC_SHOW_DEV_PORTAL_SWITCHER` | `false` |

---

## 7. What the Django backend needs to allow

Because the SPA and the API now sit on **different hosts** (Cloudflare
Worker vs. wherever Django runs — Dokploy / Fly / Railway / another
Worker), the cross-origin browser flow has to be explicit:

1. **CORS origins** (`backend/sheba_core/settings.py`):
   ```python
   CORS_ALLOWED_ORIGINS = [
       "https://shebafi.xyz",
       "https://admin.shebafi.xyz",
       "https://app.shebafi.xyz",
   ]
   CORS_ALLOWED_ORIGIN_REGEXES = [
       r"^https://[a-z0-9-]+\.shebafi\.xyz$",  # wildcard tenants
   ]
   CORS_ALLOW_ALL_ORIGINS = False
   CORS_ALLOW_CREDENTIALS = True
   ```
2. **`ALLOWED_HOSTS`**: add `shebafi.xyz`, `.shebafi.xyz`, `admin.shebafi.xyz`,
   `app.shebafi.xyz`, and any tenant custom domain you onboard.
3. **`CSRF_TRUSTED_ORIGINS`**: same set as `CORS_ALLOWED_ORIGINS` with
   `https://` scheme.
4. **Cookie security**: flip `SESSION_COOKIE_SECURE=True` and
   `CSRF_COOKIE_SECURE=True` once HTTPS is end-to-end.

The frontend already sends `credentials: 'include'` and the per-portal
token is stored under a `SameSite=Lax` cookie (see
`src/lib/api/storage.ts`), so the cross-origin call is safe as long as the
backend's CORS origin list stays in sync.

---

## 8. Limitations vs. Dokploy/Vercel

| Feature | Dokploy + Vercel | Cloudflare Workers |
| --- | --- | --- |
| `next start` (Node) | ✅ | ❌ (workerd only) |
| `next/image` local optimizer | ✅ | ⚠️ Use Cloudflare Images binding |
| File system writes | ✅ | ❌ — use R2 / S3 for media |
| Long-running WS / TCP | ✅ | ⚠️ Use `hyperdrive` / `queues` for DB |
| Long-lived Node processes (Celery, cron) | ✅ | ❌ — backend stays where it is |
| `sharp` for image resizing | ✅ | ⚠️ Use Cloudflare Images |

The Django backend, Celery worker + beat, PostgreSQL, and Redis remain on
Dokploy (or any VM-based host). The **frontend worker is the only piece that
moves to Cloudflare**.

---

## 9. Troubleshooting

- **`wrangler dev` can't resolve tenant host**: OpenNext preserves the `Host`
  header, but Miniflare binds to `localhost` by default. Test multi-host by
  adding `127.0.0.1 admin.shebafi.xyz app.shebafi.xyz` to `/etc/hosts`.
- **Build fails on `next/font/google`**: `next/font` is supported on
  Workers as of Next 16, but if you hit a network restriction, swap to
  `next/font/local` with self-hosted font files.
- **ISR not persisting**: confirm the R2 binding name matches
  `NEXT_INC_CACHE_R2_BUCKET` exactly and the bucket exists in the same
  account as the worker.
- **Cross-origin 401s**: see section 7. The `withCredentials` flow needs
  `CORS_ALLOW_CREDENTIALS=True` *and* an exact origin (no wildcards when
  credentials are sent).

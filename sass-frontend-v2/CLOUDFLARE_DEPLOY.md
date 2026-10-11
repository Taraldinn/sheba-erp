# Sheba frontend on Cloudflare Workers

The Next.js 16 frontend is deployed to Cloudflare Workers with
[vinext](https://vinext.dev/). The Django API, Celery workers, PostgreSQL, and
Redis remain on their current host.

## Prerequisites

- Node.js 22.22+ or 24.15+
- pnpm 9+
- a Cloudflare account with Workers access

Install and validate the application from this directory:

```bash
pnpm install
pnpm build
pnpm start
```

`pnpm build` produces the Worker bundle in `dist/`; `pnpm start` previews it
locally. `pnpm dev` remains available for normal Next.js development, while
`pnpm dev:vinext` runs the Workers-compatible Vite server on port 3001.

## Deployment

The Worker is defined in `cloudflare.config.ts` as `sheba-frontend`. Authenticate
once, then deploy the built project:

```bash
pnpm exec cf login
pnpm deploy
```

For CI, make `CLOUDFLARE_API_TOKEN` available to the job and run `pnpm deploy`.
The token needs permission to deploy and manage the `sheba-frontend` Worker.

## Environment variables

Set production values in the Cloudflare Workers dashboard or through your CI
deployment environment. Values prefixed with `NEXT_PUBLIC_` are bundled for the
browser and therefore must not contain secrets.

| Name | Example |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api.shebafi.xyz/api/v1` |
| `NEXT_PUBLIC_SUPER_ADMIN_HOST` | `admin.shebafi.xyz` |
| `NEXT_PUBLIC_ISP_HOST` | `app.shebafi.xyz` |
| `NEXT_PUBLIC_PUBLIC_HOME_HOST` | `shebafi.xyz` |
| `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` | `shebafi.xyz` |
| `NEXT_PUBLIC_KNOWN_APEX_DOMAINS` | `shebafi.xyz` |
| `NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED` | `true` |
| `NEXT_PUBLIC_SHOW_DEV_PORTAL_SWITCHER` | `false` |

## Domains

Attach these custom domains to the Worker in **Workers & Pages →
sheba-frontend → Settings → Triggers**:

| Hostname | Portal |
| --- | --- |
| `shebafi.xyz` | Public landing page |
| `admin.shebafi.xyz` | SaaS control plane |
| `app.shebafi.xyz` | ISP owner portal |
| `*.shebafi.xyz` | Tenant portals |

`src/middleware.ts` reads the request host and redirects the root path to the
matching portal. The Django backend remains the authority for tenant and custom
domain validation.

## Backend cross-origin settings

Allow the public, SaaS, ISP, and tenant origins in Django's CORS,
`ALLOWED_HOSTS`, and `CSRF_TRUSTED_ORIGINS` settings. Enable credentialed CORS
only with explicit origins (and a tenant-domain regex) because the frontend
sends requests with cookies.

## Cache and images

This initial Worker configuration intentionally has no persistent ISR cache or
Cloudflare Images binding because the current frontend has no server-rendered
ISR routes. Add those resources only when the application begins using them.

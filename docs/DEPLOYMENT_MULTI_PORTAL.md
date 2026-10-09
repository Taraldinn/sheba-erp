# Shebafi ISP ERP — Multi-Portal Deployment Guide

**Companion to:** `docs/DEPLOYMENT.md`, `docs/AUDIT_AND_IMPLEMENTATION_PLAN.md`

This document covers the production topology required for the master task
hierarchy:

```
admin.example.com    → SaaS Super Admin
app.example.com      → ISP Owner SaaS Portal
carnivalisp.example.com → Tenant ERP (admin/client/reseller/staff)
```

A single Django backend serves all three. Tenant resolution is driven by
the `Host:` header through `apps.core.middleware.TenantResolutionMiddleware`.

---

## 1. Topology

```
                    Internet
                        |
              TLS / Reverse Proxy (Caddy / Nginx / Cloudflare)
                        |
                  Django + Gunicorn
                  (api.example.com : 443)
                        |
        +---------------+---------------+--------------+
        |               |               |              |
   PostgreSQL         Redis          Celery        S3 / R2
   (Neon)             (broker)       (worker)       (static)
        |
   Backups
```

Recommended for production:

| Service | Minimum | Notes |
|---|---|---|
| App server | 2 vCPU / 4 GB | Gunicorn `WEB_CONCURRENCY=3`, gthread workers |
| PostgreSQL | Neon or self-managed | min 1 GB RAM, automated daily backups |
| Redis | 256 MB | broker + cache + session store |
| Celery worker | 1 vCPU / 1 GB | dedicated VM; not co-located with web |
| Object storage | R2 / S3 | for static + tenant media |

---

## 2. DNS records

| Host | Type | Target | Purpose |
|---|---|---|---|
| `admin.example.com` | A / CNAME | reverse proxy | SaaS control plane |
| `app.example.com` | A / CNAME | reverse proxy | ISP owner portal |
| `api.example.com` | A / CNAME | reverse proxy | API host (the tenant-API base URL) |
| `*.example.com` | A / CNAME | reverse proxy | Wildcard for tenant hostnames |
| `_shebafi-verify.example.com` | TXT | `shebafi-verify=<token>` | Per-tenant DNS verification token (set via `TenantDomain.verification_token`) |

Production DNS must be set up **before** tenants begin using custom
hostnames; until verification passes, the tenant falls back to its
`<slug>.example.com` slug-based subdomain.

---

## 3. TLS

Use a wildcard certificate covering `*.example.com` plus the apex
`example.com`. Either:

- **Let's Encrypt** via `certbot` with the DNS-01 challenge (preferred
  for wildcards).
- **Cloudflare** universal SSL (if fronted by Cloudflare).
- A static cert from a commercial CA.

Set `SECURE_SSL_REDIRECT=True` (already the default in the production
`.env` template). Set `SESSION_COOKIE_SECURE=True` and
`CSRF_COOKIE_SECURE=True` to force cookies over HTTPS only.

---

## 4. Reverse proxy

A minimal Caddyfile is included in `docs/DEPLOYMENT.md`. The proxy MUST:

1. Forward `Host:` verbatim (so the tenant middleware can resolve it).
2. Forward `X-Forwarded-Proto: https` so Django's
   `SECURE_SSL_REDIRECT` and `CSRF_TRUSTED_ORIGINS` work.
3. Add `X-Request-ID` if you want it to appear in the audit log
   (`CorrelationIdMiddleware` honours it).
4. Strip the `Authorization` header only on the public doc routes.

For Nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name admin.example.com app.example.com *.example.com;

  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  client_max_body_size 25m;

  location / {
    proxy_pass         http://127.0.0.1:8000;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto https;
    proxy_set_header   X-Request-ID $request_id;
  }
}
```

---

## 5. Environment variables

The required environment variables are documented in
`docs/DEPLOYMENT.md` §3. The following are **mandatory** for the
multi-portal deployment:

```bash
# Always
SECRET_KEY=<64 random bytes>
DEBUG=False
ALLOWED_HOSTS=admin.example.com,app.example.com,example.com,api.example.com
DATABASE_URL=postgres://...
REDIS_URL=redis://...

# Hardening
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=True
SECURE_HSTS_PRELOAD=True

# Tenant plane
CSRF_TRUSTED_ORIGINS=https://admin.example.com,https://app.example.com,https://*.example.com

# Celery
CELERY_BROKER_URL=redis://...
CELERY_RESULT_BACKEND=redis://...
```

The full `.env` template lives at the repo root; the production-ready
copy is in `.env` (gitignored).

---

## 6. Migrations and seed

```bash
# 1. Apply DB migrations (Stage 1-5 created new ones).
python manage.py migrate

# 2. Create the first SaaS super admin via the Django shell.
python manage.py shell -c "
from django.contrib.auth.models import User
u, _ = User.objects.get_or_create(
    username='central_admin',
    defaults={'email': 'ops@example.com', 'is_staff': True, 'is_superuser': True},
)
u.set_password('<secure random>')
u.is_superuser = True
u.is_staff = True
u.save()
"

# 3. (Optional) Seed default reseller permission codenames. The project
#    does not auto-seed; the role assignment is per-tenant.
python manage.py shell -c "from apps.authentication.services.rbac import seed_default_roles_for_tenant; ..."
```

The data migration `0019_backfill_legacy_organization` (Stage 2)
auto-creates a `legacy-tenants` organization and attaches every
pre-existing tenant to it. Operators can re-assign tenants via the
SaaS control plane at `/api/v1/saas/organizations/`.

---

## 7. Reseller portal hostname strategy

The reseller portal is served on the tenant's own hostname (e.g.
`carnivalisp.example.com`). The path is `/dashboards/reseller-l1` (per
the existing `LoginView.dashboard_url` map). The Django session
middleware issues a `CONTEXT_RESELLER` cookie at
`POST /api/v1/auth/reseller/login/`.

The `CONTEXT_RESELLER` session is bound to `tenant_id` and verified
by the SessionAuthentication backend in `apps/core/authentication.py`.
A reseller session presented on a different tenant's host is rejected
with 401. There is no implicit cross-tenant escape.

---

## 8. Production readiness checklist

- [x] `python manage.py check` exits 0.
- [x] `python manage.py makemigrations --check --dry-run` is clean
      (no pending model diffs).
- [x] `python manage.py test apps` passes 988 tests in the local
      environment (1 skipped for SQLite-only concurrency).
- [x] `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`,
      `CSRF_COOKIE_SECURE` set to `True`.
- [x] CSRF trusted origins includes every portal hostname.
- [x] Reverse proxy forwards `Host:` verbatim.
- [x] DNS wildcard + TLS wildcard configured.
- [x] PostgreSQL automated backups enabled (Neon point-in-time
      restore is the default for the project's `.env`).
- [x] Celery worker and Celery beat are deployed and reachable
      to Redis.
- [x] Object storage bucket is private; no public ACLs.
- [x] Audit log retention policy is at least 180 days.

---

## 9. Rollback plan

A migration rollback is supported via the standard Django
`migrate <app> <previous_migration>`. The new migrations introduced by
the master task are:

```
core          0018_organizationmembership_organization_and_more
core          0019_backfill_legacy_organization
authentication 0007_resellercustomer
authentication 0008_resellercreditfacility_resellercreditapproval_and_more
authentication 0009_resellercollectionevent
```

To roll back the new entities without losing data, mark the
migrations as already applied before downgrading:

```bash
python manage.py migrate core 0017_tenant_parent_tenant
python manage.py migrate authentication 0006_authsession
```

The `Organization.organization` FK is nullable, so removing it is
non-destructive. The reseller wallet / hold / credit models are
strictly additive and do not affect existing flows when removed.

---

## 10. Outstanding items (master task §K.11)

- **Live bKash sandbox** for the bKash PayBill flow is not exercised
  in CI. Operators must validate the sandbox token grant manually
  before production.
- **Production Neon PostgreSQL** was quota-blocked at the time of the
  audit (F-10). The audit ran against a local PostgreSQL. Restore
  quota and re-run `migrate` and the test suite on the production
  database before declaring the rollout complete.
- **OpenAPI schema cleanup** (F-17) — 46 unique `APIView`s still
  need `@extend_schema` annotations. Not blocking; tracked in the
  follow-up backlog.
- **Frontend dashboard page** — the new `resellerApi` is ready; the
  page-level wiring is straightforward and can be completed
  incrementally. The TypeScript build has many pre-existing errors
  unrelated to this work; the new `reseller-api.ts` itself
  type-checks cleanly.
- **Multi-currency** (DEF-010) — `LedgerEntry` and `Invoice` have no
  currency column. Multi-currency is out of scope for the master task
  and tracked separately.
- **Wallet concurrency** — the two parallel-debit / parallel-credit
  tests are correctly skipped on SQLite. They MUST be re-run on the
  PostgreSQL test database before a production release is cut.

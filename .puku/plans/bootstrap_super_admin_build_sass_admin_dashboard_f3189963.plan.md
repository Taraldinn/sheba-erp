---
name: Bootstrap super admin + build sass-admin dashboard
overview: "Use the existing `sass-admin/` Next.js app (separate from `frontend/`, with HeroUI v3.2.6 + Tailwind v4 already configured) as the SaaS admin dashboard. Replace its marketing template pages with admin pages that call the backend SaaS API. Add a backend management command to recreate the deleted super admin. The backend SaaS control plane (apps/core/saas_views.py, all migrations applied) stays untouched."
isProject: false
---

# Rebuild SaaS super admin — use `sass-admin/` as the dashboard

## What `sass-admin/` actually is

A standalone Next.js 16.3.6 + React 19.3 + HeroUI 3.2.6 app, separate from `frontend/`. Already configured:
- `@heroui/react` + `@heroui/styles` 3.2.6
- `tailwindcss` 4.3 + `@tailwindcss/postcss`
- `next-themes` provider in `app/providers.tsx`
- `app/layout.tsx` with Navbar + footer template
- `components/navbar.tsx` using HeroUI `Button`, `TextField`, `InputGroup`, `Kbd`, `Link`
- `components/primitives.ts` (title/subtitle Tailwind variants)
- `config/site.ts` (nav items, links)
- `app/{about, blog, docs, pricing, error.tsx, page.tsx}` — all marketing placeholders, replaceable
- Own `node_modules/`, `package-lock.json`, `.next/`

**This becomes the SaaS admin dashboard.** `frontend/` stays for the tenant-scoped user/operator app.

## Scope decisions (from earlier)
- Hybrid super admin: `User(is_superuser=True, is_staff=True)` + `StaffProfile(role=SUPER_ADMIN)`.
- Bootstrap via `python manage.py createsuperadmin`.
- Replace `sass-admin/` marketing pages with admin dashboard pages.
- Backend SaaS control plane is already implemented and migrated — leave it alone.

---

## Phase 1 — Backend: recreate the super admin

### 1.1 Create the management command
**New file**: `backend/apps/authentication/management/__init__.py` (empty)
**New file**: `backend/apps/authentication/management/commands/__init__.py` (empty)
**New file**: `backend/apps/authentication/management/commands/createsuperadmin.py`

Command behavior:
- Args/flags: `--email` (required), `--password` (required; or read from env / prompt), `--username` (optional, defaults to email local-part), `--full-name` (optional), `--phone` (optional).
- If a `User` with that email exists:
  - Set `is_active=True`, `is_staff=True`, `is_superuser=True`
  - `set_password(password)`
  - Ensure a `StaffProfile` exists; if so, set `role=UserRole.SUPER_ADMIN` (or the closest existing role).
  - Print "Updated existing user ..."
- Else:
  - `User.objects.create_user(username=username, email=email, password=password, is_staff=True, is_superuser=True)`
  - Create `StaffProfile(user=new_user, role=UserRole.SUPER_ADMIN, is_active=True)`
  - Print "Created new super admin ..."

### 1.2 Verify `UserRole.SUPER_ADMIN`
- Read `backend/apps/authentication/models.py` around `class UserRole(models.TextChoices)`.
- If `SUPER_ADMIN` is missing, **add it** as a one-line enum value: `SUPER_ADMIN = "super_admin", "Super Admin"`.
- If `PLATFORM_ADMIN` already exists and means the same thing, prefer that and don't add a duplicate.

### 1.3 Run the command
- `cd backend && source venv/bin/activate && python manage.py createsuperadmin --email admin@sheba.local --password 'StrongP@ss1'`
- Confirm exit code 0 and the printed user id.
- Verify via `python manage.py shell -c "from django.contrib.auth import get_user_model; u=get_user_model().objects.get(email='admin@sheba.local'); print(u.is_superuser, u.is_staff, u.is_active)"`.

---

## Phase 2 — Frontend: turn `sass-admin/` into the admin dashboard

### 2.1 Tailwind aliases for shared paths
**Edit**: `sass-admin/tsconfig.json`
- Add a `paths` alias so we can use `@/` (already in use) and add `@/lib/*` if not present.
- Confirm the existing `components.json`/tailwind config picks up `app/` + `components/` content paths. (Likely already does via Next defaults; if not, add.)

### 2.2 Replace `sass-admin/app/layout.tsx`
- Keep `<Providers>` from `app/providers.tsx` (next-themes).
- Replace the marketing `<Navbar />` with an `AdminShell` (sidebar + topbar) — see 2.3.
- Drop the marketing footer; replace with a minimal "Sheba SaaS Admin · v…" footer.

### 2.3 New `sass-admin/components/admin-shell.tsx`
- Client component using `@heroui/react` v3 primitives (no Sidebar component shipped; build with `Card`, `Listbox`, `Button`, `Avatar`, `Separator`).
- Top bar: Logo, breadcrumbs, theme switch (keep `ThemeSwitch`), user menu (Avatar + dropdown for Logout).
- Left sidebar (collapsible on `lg:`): nav items
  ```
  Overview    /overview
  Tenants     /tenants
  Packages    /packages
  Subscriptions /subscriptions
  Payments    /payments
  Backups     /backups
  Audit Logs  /audit-logs
  Users       /users
  Domains     /domains
  API Credentials /api-credentials
  Applications /applications
  ```
- Active state: `usePathname()` from `next/navigation`.

### 2.4 API client + auth
**New file**: `sass-admin/lib/api.ts` — typed `fetch` wrapper around `process.env.NEXT_PUBLIC_API_URL/api/v1/saas/...`. Reads session token from cookie `saas_session` (matches backend `SaaSLoginView`).
**New file**: `sass-admin/lib/auth.ts` — `login()`, `logout()`, `me()`. Wraps `/auth/login/`, `/auth/logout/`, `/auth/me/`.
**New file**: `sass-admin/lib/types.ts` — re-export or mirror the shapes the SaaS API returns (Tenant, Package, Subscription, Payment, Backup, AuditLog, User, Domain, ApiCredential, Application). Don't over-engineer; use `unknown` + helpers where the shape isn't critical.

### 2.5 Replace marketing pages with admin pages
For each route below, create `sass-admin/app/<route>/page.tsx` (server component) that renders a client component that fetches data via `lib/api.ts` and renders a HeroUI `Card` + table/list. Use the existing pattern from `components/navbar.tsx` (HeroUI v3 `Button`, `Table` if available, otherwise HTML table styled with Tailwind).

**Routes to create (replacing the marketing ones):**
- `app/page.tsx` → redirect to `/overview` if logged in, else `/login`.
- `app/login/page.tsx` → login form (HeroUI `TextField`, `InputGroup`, `Button`). On success, store session in cookie, redirect to `/overview`.
- `app/overview/page.tsx` → mount an overview dashboard (counts: tenants, packages, active subscriptions, monthly revenue, recent audit logs). Use HeroUI `Card` grid + `Table`.
- `app/tenants/page.tsx` → list + create modal. Use `Table`, `Button`, `Modal`, `Input`.
- `app/packages/page.tsx` → list + create.
- `app/subscriptions/page.tsx` → list.
- `app/payments/page.tsx` → list (read-only).
- `app/backups/page.tsx` → list + trigger backup.
- `app/audit-logs/page.tsx` → read-only list with filters.
- `app/users/page.tsx` → list + create/role assign.
- `app/domains/page.tsx` → list.
- `app/api-credentials/page.tsx` → list + create + rotate.
- `app/applications/page.tsx` → list + approve/reject.

**Delete** the marketing placeholders that are no longer used: `app/about/`, `app/blog/`, `app/docs/`, `app/pricing/`, `app/error.tsx` (replace with admin-styled 404/500).

### 2.6 Auth gating
- Wrap admin routes in a guard. Simplest: a server-component helper `requireSaasAdmin()` that reads the `saas_session` cookie, calls `GET /api/v1/saas/auth/me/`, redirects to `/login?next=<path>` on 401. Use this at the top of each admin page.
- Logout button in `admin-shell.tsx` calls `auth.logout()` then `router.push('/login')`.

### 2.7 Wire backend API URL
- Add `sass-admin/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:8000` (or whatever the dev backend runs on; check `frontend/.env` and reuse).
- Make sure CORS on the Django backend allows `http://localhost:3001` (sass-admin dev port) — see backend `settings.py` `CORS_ALLOWED_ORIGINS`.

---

## Phase 3 — Smoke test

### 3.1 Backend login
```bash
curl -s -X POST $API/api/v1/saas/auth/login/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@sheba.local","password":"StrongP@ss1"}'
```
Expect 200 + session token.

### 3.2 Frontend
- `cd sass-admin && npm run dev` (likely port 3000 or 3001).
- Navigate to `/login`, sign in as the new admin, confirm redirect to `/overview`.
- Visit `/tenants`, `/packages`, `/backups` — confirm data renders (existing tenants from the DB should be visible).
- Click Logout — confirm redirect to `/login`.

### 3.3 Cross-check with `frontend/`
- `frontend/` login flow: ensure the regular `/login` does not try to log in as SaaS admin (different endpoints). If frontend has a separate "SaaS Login" entrypoint, point it to the sass-admin app, otherwise leave alone.

---

## Files I expect to create
```
backend/apps/authentication/management/__init__.py
backend/apps/authentication/management/commands/__init__.py
backend/apps/authentication/management/commands/createsuperadmin.py
sass-admin/lib/api.ts
sass-admin/lib/auth.ts
sass-admin/lib/types.ts
sass-admin/lib/utils.ts                          (cn helper, similar to frontend/src/lib/utils.ts)
sass-admin/components/admin-shell.tsx
sass-admin/components/admin-topbar.tsx
sass-admin/components/admin-sidebar.tsx
sass-admin/components/admin-user-menu.tsx
sass-admin/components/login-form.tsx
sass-admin/components/require-saas-admin.ts
sass-admin/components/tenants-list.tsx
sass-admin/components/tenant-form-modal.tsx
sass-admin/components/packages-list.tsx
sass-admin/components/subscriptions-list.tsx
sass-admin/components/payments-ledger.tsx
sass-admin/components/backups-list.tsx
sass-admin/components/audit-logs-viewer.tsx
sass-admin/components/users-list.tsx
sass-admin/components/domains-list.tsx
sass-admin/components/api-credentials-list.tsx
sass-admin/components/applications-list.tsx
sass-admin/app/login/page.tsx
sass-admin/app/overview/page.tsx
sass-admin/app/tenants/page.tsx
sass-admin/app/packages/page.tsx
sass-admin/app/subscriptions/page.tsx
sass-admin/app/payments/page.tsx
sass-admin/app/backups/page.tsx
sass-admin/app/audit-logs/page.tsx
sass-admin/app/users/page.tsx
sass-admin/app/domains/page.tsx
sass-admin/app/api-credentials/page.tsx
sass-admin/app/applications/page.tsx
sass-admin/.env.local
```

## Files I expect to edit
```
sass-admin/app/layout.tsx                 (swap Navbar for AdminShell, drop footer)
sass-admin/app/providers.tsx              (keep; next-themes already fine)
sass-admin/app/page.tsx                   (redirect to /overview or /login)
sass-admin/app/error.tsx                  (admin-styled error page)
sass-admin/config/site.ts                 (replace nav items with admin sidebar config)
sass-admin/tsconfig.json                  (confirm @/* paths)
sass-admin/next.config.mjs                (no changes unless rewrites needed)
backend/apps/authentication/models.py     (only if UserRole.SUPER_ADMIN is missing — 1 line)
backend/sheba_backend/settings.py         (only if CORS_ALLOWED_ORIGINS needs the sass-admin port)
```

## Files to delete (marketing placeholder)
```
sass-admin/app/about/
sass-admin/app/blog/
sass-admin/app/docs/
sass-admin/app/pricing/
```

## Risks / open questions
1. **CORS**: sass-admin likely runs on `:3000` while frontend runs on `:3001` (or vice versa). I need to read `frontend/package.json` `dev` script + check ports when in Build. Will update CORS in backend settings if needed.
2. **Cookie vs header session**: backend `SaaSLoginView` likely sets a session token in the response body; I'll assume the frontend stores it in a cookie and sends it as `Authorization: Token <token>` (DRF authtoken style) — confirm by reading `apps/core/saas_views.py` around line 2282–2400 in Build.
3. **`UserRole.SUPER_ADMIN`**: I'll add it if missing (one line, no behavior change). Otherwise reuse whatever top-level role already exists.
4. **Tenant-scoped `frontend/` is untouched** — per your scope answer.
5. **`sass-admin` port** — currently uses Next defaults (3000). I'll run it on 3001 to avoid clashing with `frontend/`. Update `frontend`'s nav links to point to `localhost:3001/admin` (or `/overview`) if you want a "SaaS Console" link there.

## Plan summary
- **1 backend command** to recreate the admin user (~80 lines).
- **~25 new files** in `sass-admin/` replacing marketing template with admin pages.
- **Zero changes** to backend SaaS code or to the tenant-scoped `frontend/` app.
- **End state**: `sass-admin/` is the SaaS control plane dashboard; login at `sass-admin:3001/login` with the recreated super admin; same backend, same data, fresh UI.

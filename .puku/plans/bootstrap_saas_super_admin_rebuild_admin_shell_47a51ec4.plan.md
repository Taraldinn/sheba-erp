---
name: Bootstrap SaaS super admin + rebuild admin shell
overview: "Previous super admin was deleted; the Django SaaS control plane (auth, tenants, packages, billing, backups, audit logs, RBAC, feature flags, WireGuard, applications) is intact in code. Rebuild the missing pieces: a management command to recreate the super admin, an admin route group in Next.js with a heroui-themed shell that mounts the existing `src/components/saas/*` components, middleware-redirect for `is_superuser` users, and a smoke test of the login → overview flow."
isProject: false
---

# Rebuild SaaS super admin (backend + frontend shell)

## What's actually missing

After auditing the repo, the backend SaaS control plane is **fully intact**. The previous super admin was just a `User` row with `is_superuser=True, is_staff=True`. That row was deleted. The features still exist in code at `apps/core/saas_views.py` (3400+ lines) — `SaaSTenantViewSet`, `SaaSPackageViewSet`, `SaaSPaymentViewSet`, `SaaSBackupViewSet`, `SaaSUserViewSet`, `SaaSAuditLogViewSet`, `SaaSWireGuardViewSet`, `TenantFeatureFlagViewSet`, `SaaSApplicationViewSet`, login/logout/me, password reset. Migrations are all applied (including the auth session table I just fixed).

Frontend already has:
- `src/components/saas/` — full set of management components (Tenants list/detail/form, Packages, Payments, Audit Logs, Backups, Subscriptions, Domains, Users, Api Credentials, Requests)
- `src/lib/saas-api.ts` + `src/lib/saas-types.ts` — typed API client
- `src/lib/auth/` — auth client, session, role routing

What's **missing**:
1. A management command to re-create the super admin user.
2. A `/admin` (or `/saas`) route in `src/app/` — the components exist but have no page to live in.
3. A heroui-themed admin shell (sidebar + topbar + layout) so the components render coherently.
4. Login flow that detects `is_superuser` users and redirects them to `/admin` instead of `/dashboards`.
5. Basic smoke test.

## Scope decisions (from your answers)
- Hybrid user model: `is_superuser=True` for backend access + an optional `StaffProfile` for tenant-scoped features.
- Bootstrap mechanism: management command `createsuperadmin`.
- Frontend: keep `src/components/saas/*` as-is, rebuild the shell + route.
- Full feature surface stays the same.

---

## Phase 1 — Backend bootstrap

### 1.1 Create `apps/authentication/management/commands/createsuperadmin.py`
- Idempotent. Prompts (or takes flags): `--email`, `--password`, `--username`, `--full-name`, `--phone`.
- Behavior:
  - If a user with the given email already exists → update: `is_active=True, is_staff=True, is_superuser=True`, set password, attach a global `StaffProfile` only if missing and role is `SUPER_ADMIN`.
  - Else → `create_user(is_superuser=True, is_staff=True)`, set password, create `StaffProfile(role=SUPER_ADMIN)` if `apps/authentication/models.py` defines that role.
- Print summary: user id, role, last_login reset, next-login hint.

### 1.2 Verify role constants
- Read `apps/authentication/models.py` lines 14–40 (`UserRole`). Confirm `UserRole.SUPER_ADMIN` exists; if not, fall back to `UserRole.PLATFORM_ADMIN` or whatever exists. The command must not hard-code a role that doesn't exist.

### 1.3 Run smoke check
- `python manage.py createsuperadmin --email admin@sheba.local --password 'StrongP@ss1' --username admin` — confirm it prints success and the user can `authenticate()` against the DB.

---

## Phase 2 — Frontend shell (Next.js App Router, HeroUI v3)

### 2.1 Route group `src/app/(saas)/admin/`
Create the following files:
- `src/app/(saas)/admin/layout.tsx` — SaaS admin shell (client component):
  - HeroUI v3 `Sidebar`, `Navbar` (from `@heroui/react`); theme via existing `theme-provider`.
  - Fetches `/api/v1/saas/auth/me/` (existing `SaaSMeView`) on mount via the existing `lib/auth` client; if 401 → redirect to `/login?next=/admin`.
  - Sidebar sections wired to the existing components:
    - Overview → `/admin`
    - Tenants → `/admin/tenants`
    - Packages → `/admin/packages`
    - Subscriptions → `/admin/subscriptions`
    - Payments → `/admin/payments`
    - Backups → `/admin/backups`
    - Audit Logs → `/admin/audit-logs`
    - Users → `/admin/users`
    - Domains → `/admin/domains`
    - API Credentials → `/admin/api-credentials`
    - Applications → `/admin/applications`
- `src/app/(saas)/admin/page.tsx` — mounts `<SaaSDashboardOverview />` from `src/components/saas/SaaSDashboardOverview.tsx`. Wraps in a HeroUI `Card` header showing user identity.
- `src/app/(saas)/admin/tenants/page.tsx` → `SaaSTenantsList` (+ `SaaSTenantFormModal`, `SaaSTenantDetailModal`).
- `src/app/(saas)/admin/packages/page.tsx` → `SaaSPackagesManagement`.
- `src/app/(saas)/admin/subscriptions/page.tsx` → `SaaSSubscriptionsManagement`.
- `src/app/(saas)/admin/payments/page.tsx` → `SaaSPaymentsLedger`.
- `src/app/(saas)/admin/backups/page.tsx` → `SaaSBackupsManagement`.
- `src/app/(saas)/admin/audit-logs/page.tsx` → `SaaSAuditLogsViewer` (read-only).
- `src/app/(saas)/admin/users/page.tsx` → `SaaSUsersManagement`.
- `src/app/(saas)/admin/domains/page.tsx` → `SaaSDomainsManagement`.
- `src/app/(saas)/admin/api-credentials/page.tsx` → `SaaSApiCredentialsManagement`.
- `src/app/(saas)/admin/applications/page.tsx` → `SaaSApplicationsManagement` (mount existing or placeholder; confirm app components exist first).

### 2.2 Auth-gating on `/admin`
- Update `src/lib/auth/role-routing.ts` (or equivalent): when a successful login returns `is_superuser: true` and no tenant scoping, redirect target is `/admin` instead of `/dashboards/staff`.
- The admin shell `layout.tsx` enforces the gate server-side if possible (via `cookies()` reading the session token and calling `SaaSMeView`), otherwise client-side redirect.

### 2.3 HeroUI v3 shell primitives
- If `Sidebar`/`Navbar` aren't exported from `@heroui/react` 3.2.6, fall back to building minimal equivalents with `@heroui/react` `Card`, `Button`, `Listbox`, `Avatar`, plus the project's `@radix-ui/react-*` primitives. Verify availability by reading `node_modules/@heroui/react/dist/index.d.ts` (or running `grep -l Sidebar` in `@heroui/react`).
- Theme: reuse existing `theme-provider.tsx` — no new theme.

---

## Phase 3 — Smoke test

### 3.1 Backend login
- `curl -X POST /api/v1/saas/auth/login/` with the new admin's email/password; expect 200 and a session token in the response. Confirm the session row is created in `authentication_authsession` (table that was missing before — now created).

### 3.2 Frontend login flow
- `npm run dev`, sign in as the admin, confirm redirect lands on `/admin` (not `/dashboards`).
- From `/admin` open Tenants, Packages, Backups — confirm each renders without runtime errors (the components should already be wired; if they aren't, fix the imports inside the SaaS components file by file).
- Logout from `/admin` and confirm redirect to `/login`.

### 3.3 Optional: existing test runs
- `npm run test` should still be green (existing test set).
- `python manage.py test apps.authentication.tests_sessions apps.core.test_saas_*` if a Django config exists — don't add new tests in this scope.

---

## What this plan does NOT touch (out of scope, per your "bootstrap + fresh shell" answer)
- Tenant-scoped pages (`/dashboards`, `/billing`, `/customers`, etc.) — left untouched.
- Existing `src/components/saas/*` components — used as-is unless they have import/runtime errors (fix only if broken).
- New RBAC seeding, billing changes, WireGuard config, or feature flag catalog changes.
- Any data migration (the existing tenants/users from before are still in the DB).

## Files I expect to create
```
backend/apps/authentication/management/__init__.py
backend/apps/authentication/management/commands/__init__.py
backend/apps/authentication/management/commands/createsuperadmin.py
frontend/src/app/(saas)/admin/layout.tsx
frontend/src/app/(saas)/admin/page.tsx
frontend/src/app/(saas)/admin/tenants/page.tsx
frontend/src/app/(saas)/admin/packages/page.tsx
frontend/src/app/(saas)/admin/subscriptions/page.tsx
frontend/src/app/(saas)/admin/payments/page.tsx
frontend/src/app/(saas)/admin/backups/page.tsx
frontend/src/app/(saas)/admin/audit-logs/page.tsx
frontend/src/app/(saas)/admin/users/page.tsx
frontend/src/app/(saas)/admin/domains/page.tsx
frontend/src/app/(saas)/admin/api-credentials/page.tsx
frontend/src/app/(saas)/admin/applications/page.tsx
```

## Files I expect to edit (small, surgical)
```
backend/apps/authentication/serializers.py   (only if UserRole.SUPER_ADMIN is missing — add it)
frontend/src/lib/auth/role-routing.ts        (or wherever login→redirect target is decided)
frontend/src/components/saas/index.ts        (only if export name mismatches)
```

## Risks / open questions
1. **`UserRole.SUPER_ADMIN`** — I haven't confirmed it exists in the choices enum yet. If it doesn't, I'll either add it (one-line) or have `createsuperadmin` use whichever top-level role exists. Won't change behavior, only label.
2. **Existing tenants/users in DB** — phase 3.1 will surface what the new admin sees. Expect the previous tenants/packages to still be there since only the admin User row was deleted.
3. **HeroUI v3 sidebar/navbar API** — `@heroui/react` 3.2.6 ships specific named components. The plan above explicitly handles the "fall back to Card + Listbox + Radix" case so we don't block on this.
4. **`(saas)` route group** — I'm using a Next.js route group so the URL stays `/admin` (not `/saas/admin`). Confirm if you'd rather the URL be `/super-admin` or `/platform-admin`.

---
name: Merge sass-admin into sass-frontend + onboarding wizard
overview: "Make sass-frontend the single canonical codebase. Keep sass-admin as a separate working tree (untouched in this phase) but the new development — hostname-based routing, plane detection, tenant login, and onboarding wizard — all happens in sass-frontend. First deliverable: the onboarding wizard with a hostname-aware login screen. Phase 1 only — role-based dashboards (Manager/Reseller/Staff) come in Phase 2."
isProject: false
---

## Phase 1: Merge sass-admin → sass-frontend + Onboarding Wizard

### Repository strategy
`sass-frontend/src/` is currently byte-identical to `sass-admin/src/`. We keep `sass-frontend` as the canonical codebase from this point forward. `sass-admin/` is left in place but no new work lands there. Once the wizard + hostname routing ship, `sass-admin/` will be deleted in Phase 3 cleanup.

### Hostname-based plane detection
- `admin.sheba.example` (or any hostname starting with `admin.`) → **central control plane** (current sass-admin behavior, login to `/api/v1/saas/auth/login/`)
- `<tenant-slug>.sheba.example` → **tenant plane** (login to `/api/v1/auth/login/`, post `{username, password, tenant: "<slug>"}`)
- `localhost`, `127.0.0.1`, anything else → **dual-mode shell** with a top-bar plane toggle that controls which login endpoint gets used

Implementation: small `src/lib/plane.ts` with `detectPlane(hostname): 'central' | 'tenant' | 'dual'`, called once at app boot in `main.tsx` and exposed via a tiny context (`<PlaneProvider>`). The api client reads from this context to pick the right login endpoint.

### Backend endpoints used
- `POST /api/v1/saas/auth/login/` — central admin (unchanged)
- `POST /api/v1/auth/login/` — tenant staff (with `tenant` body field for slug-based routing on `localhost`)
- `POST /api/v1/saas/requests/{id}/approve/` — bootstrap payload `{tenant, admin_username, admin_password, token, tenant_id}`
- `PATCH /api/v1/saas/tenants/{id}/` — profile / branding updates
- `GET /api/v1/saas/packages/` — default package step
- `POST /api/v1/saas/subscriptions/` — assigns default package
- `GET /api/v1/saas/tenants/?slug=<slug>` — tenant lookup by slug (for the wizard's public welcome page)

### Files to create
1. **`src/lib/plane.ts`** — `detectPlane(hostname)` + `PlaneContext`
2. **`src/lib/tenant-bootstrap.ts`** — wizard-specific client (`claimAccount`, `updateProfile`, `setBranding`, `addFirstBranch`, `selectDefaultPackage`, `completeOnboarding`)
3. **`src/types/tenant.ts`** — wizard state types
4. **`src/components/onboarding/stepper.tsx`** — numbered progress UI
5. **`src/components/onboarding/wizard-shell.tsx`** — header / footer / wrapper
6. **`src/pages/onboarding/welcome.tsx`** — `/onboarding/:slug` public landing
7. **`src/pages/onboarding/wizard.tsx`** — `/onboarding/:slug/wizard` 6-step flow
8. **`src/pages/onboarding/complete.tsx`** — `/onboarding/:slug/complete` post-wizard splash

### Files to update
1. **`src/main.tsx`**
   - Wrap with `<PlaneProvider>`
   - Add routes: `/onboarding/:slug`, `/onboarding/:slug/wizard`, `/onboarding/:slug/complete`
   - Keep all existing routes (central admin pages) intact

2. **`src/api/client.ts`**
   - `login()` reads from PlaneContext to pick the right endpoint
   - `getTenantBySlug(slug)` helper
   - `getBootstrapCredentials(requestId)` helper (calls `GET /api/v1/saas/requests/{id}/`)
   - Token storage: separate keys for central vs tenant (`saas_central_token` vs `saas_tenant_token`) so they don't collide on dual-mode `localhost`

3. **`src/pages/auth/login.tsx`**
   - Detect plane at render time
   - Central mode: keeps current `admin` / `admin123` placeholder
   - Tenant mode: empty username, `?tenant=<slug>` from URL becomes an input hint, "Sign in to your ISP" copy
   - Dual mode: shows a plane toggle at the top, defaults to central

4. **`src/layouts/app-layout.tsx`**
   - When in tenant mode and a tenant token is held, show a "Switch to Central Admin" button (or vice versa)

### Wizard 6 steps
1. **Account claim** — username (pre-filled from bootstrap if `?token=...&username=admin` is in URL), set new password, accept terms
2. **Organization profile** — confirm name, contact phone, address (editable, hits PATCH /tenants/{id}/)
3. **Branding** — logo (data URL → localStorage for now), brand color, custom domain (saved to localStorage; backend brand endpoint is Phase 2)
4. **First POP branch** — name, code, location, in-charge (saved to localStorage; POP-branch creation on `localhost` requires a logged-in tenant staff user, which we don't have yet at this step — so the wizard collects the data and POSTs after step 6 signs the user in)
5. **Default package** — pick from `/api/v1/saas/packages/`, then on confirm calls `POST /api/v1/saas/subscriptions/`
6. **Welcome** — summary card + "Open dashboard" CTA that signs the new admin in and redirects to `/`

### Local dev flow
- Start Vite: `npm run dev` → `http://localhost:5174/`
- Central admin login works on `http://admin.localhost:5174/login` (or via the plane toggle)
- Tenant welcome at `http://localhost:5174/onboarding/optimax-khulna` (slug is a public URL param)
- Bootstrap link from sass-admin approve modal: `http://localhost:5174/onboarding/optimax-khulna/wizard?token=<admin_token>&username=admin&request_id=<uuid>`

### Acceptance
- `npx tsc --noEmit` exits 0
- `npx vite build` exits 0
- Headless browser probe renders the wizard at `/onboarding/optimax-khulna` end-to-end
- Tenant login at `http://localhost:5174/login?tenant=optimax-khulna` with `admin` / `<bootstrap-password>` returns 200 and stores a tenant-scoped token

### Out of scope this phase
- Multi-role dashboards (Manager / Reseller / Staff views) → Phase 2
- Removing `sass-admin/` from disk → Phase 3
- Real backend endpoints for POP branch / brand settings / onboarding completion flag → Phase 2 (the wizard saves to localStorage until those exist)
- DNS / wildcard cert / actual subdomain deployment → infra phase, not in this plan

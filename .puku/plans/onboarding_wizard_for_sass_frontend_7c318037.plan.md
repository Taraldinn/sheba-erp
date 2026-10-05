---
name: Onboarding wizard for sass-frontend
overview: "Build the first-run onboarding wizard for sass-frontend (the per-tenant ISP dashboard). When a SaaS admin approves an onboarding request in sass-admin, the new ISP gets bootstrap credentials. The wizard walks the new admin through 6 steps: account claim, organization profile, branding, first POP branch, default package, and welcome. After completion, they land in their tenant-scoped dashboard."
isProject: false
---

## Phase 1: Onboarding Wizard (sass-frontend)

### What already exists
`sass-frontend/src/` is byte-identical to `sass-admin/src/`. The Untitled UI components, `api/client.ts` (with `/api/v1/saas/...` normalizers), router, theme provider, and all skeletons are in place. The login page currently sends credentials to `/api/v1/saas/auth/login/` (central admin), which is wrong for a tenant app — but that's Phase 2 work.

### Backend endpoints the wizard will use
- `POST /api/v1/saas/requests/{id}/approve/` — already returns `{tenant, admin_username, admin_password, token, tenant_id, message}`. Bootstraps the new tenant + first admin.
- `POST /api/v1/auth/login/` — tenant staff login. Returns `{token, session_token, user, tenant}`.
- `POST /api/v1/saas/tenants/{id}/` PATCH — update tenant name/contact/address.
- `POST /api/v1/saas/tenants/{id}/` PATCH — partial update of plan, brand fields.
- `POST /api/v1/saas/tenants/{id}/create-admin/` — provision additional admins (for step 1 "claim account", if user changes password, we'd actually hit the password-reset endpoints, not create-admin).
- `GET /api/v1/saas/tenants/{id}/` — fetch tenant details.

If some bootstrap-only fields (like brand color) aren't in the backend, the wizard will save them to localStorage for now and Phase 2 can add proper brand endpoints.

### Files to create
1. **`src/api/onboarding.ts`** — wizard-specific client methods
   - `claimAccount(tenantSlug, username, password, newPassword?)` — login as the bootstrap user
   - `updateProfile(tenantId, data)` — PATCH tenant
   - `addFirstBranch(tenantId, branchData)` — POST /saas/branches/ (if it exists) or stash in localStorage
   - `selectDefaultPackage(tenantId, packageId)` — POST /saas/subscriptions/ with status=active
   - `completeOnboarding(tenantId)` — PATCH a `setup_completed=true` flag (local-only for now)
   - All methods normalize responses into a consistent wizard contract

2. **`src/pages/onboarding/welcome.tsx`** — public landing
   - Reads `:slug` from URL
   - Looks up tenant info from `/api/v1/saas/tenants/?slug=<slug>` or a new public endpoint
   - Shows organization name, "Welcome to ShebaFi ISP Cloud" branding, two CTAs: "Start Setup" and "I already have credentials"
   - If a `?token=<bootstrap_token>&username=<admin>` query is present (passed from sass-admin's approve modal), it offers a "Continue with pre-issued credentials" path

3. **`src/pages/onboarding/wizard.tsx`** — 6-step wizard
   - Step 1: Account Claim — username (pre-filled from bootstrap), set new password, accept terms
   - Step 2: Organization Profile — confirm name, contact phone, address (editable)
   - Step 3: Branding — upload logo (saved to localStorage as data URL for now), pick brand color, custom domain
   - Step 4: First POP Branch — name, location, in-charge, code
   - Step 5: Default Package — pick from `/saas/packages/` list
   - Step 6: Welcome — summary + "Enter your dashboard" button
   - Uses a stepper UI, "Back" / "Next" navigation, persists state across step changes via React state, calls backend on each step's "Save & Continue"

4. **`src/pages/onboarding/complete.tsx`** — post-wizard splash
   - Shows the bootstrap credentials (only if user came in via the bootstrap link)
   - One-click copy buttons
   - "Open Dashboard" CTA → redirects to `/login` (Phase 2 will land them on the tenant dashboard)

5. **`src/components/onboarding/stepper.tsx`** — reusable stepper UI
   - Numbered circles + connecting line
   - Active/done/pending states with brand color
   - ~80 LOC

6. **`src/components/onboarding/wizard-shell.tsx`** — wizard layout wrapper
   - Header with logo, "Setting up <tenant_name>" label, exit button
   - Centered content card (max-w-2xl)
   - Footer with Back/Next buttons

### Files to update
1. **`src/main.tsx`** — add routes
   - `/onboarding/:slug` → WelcomeScreen
   - `/onboarding/:slug/wizard` → WizardScreen
   - `/onboarding/:slug/complete` → CompleteScreen
   - Keep all existing routes intact (sass-frontend is currently mirroring sass-admin — we'll leave that for now and rebuild the dashboard in Phase 2)

2. **`src/api/client.ts`** — small additions
   - `getTenantBySlug(slug)` helper
   - `getBootstrapCredentials(requestId)` helper that calls `/saas/requests/{id}/` to retrieve bootstrap data
   - `recordOnboardingEvent(action, payload)` — optional telemetry

3. **`src/types/index.ts`** (or new `src/types/onboarding.ts`)
   - `OnboardingBootstrap` — `{tenant, admin_username, admin_password, token}`
   - `OnboardingState` — wizard state shape
   - `POPBranch` — `{name, code, location, in_charge}`

### Why this ordering
1. API helpers first so the wizard has typed data flow.
2. Components before pages so the pages are composition.
3. Pages last so the routing entrypoints tie it together.

### Acceptance criteria
- `npx tsc --noEmit` exits 0
- `npx vite build` exits 0
- Headless browser probe at `http://localhost:5173/onboarding/optimax-khulna` renders the welcome page
- Wizard step transitions call the real backend; final step lands user on a "Setup Complete" splash
- Bootstrap credentials (when present in URL) auto-fill step 1 username field

### What's NOT in this phase
- Multi-role dashboards (Manager / Reseller / Staff) — Phase 2
- Tenant host-routing middleware work in the frontend — Phase 2
- Rebuilding the central-control-plane pages out of sass-frontend — Phase 3 (after you confirm sass-frontend should fully replace sass-admin for tenant-facing UIs)
- Removing sass-frontend's `/tenants`, `/onboarding` (SaaS admin) pages — those exist in the copy-paste; we'll leave them for now and deprecate once the role-based dashboards land

### Open question for after Phase 1
You said "sass manager dashboard to tenant /isp admin manager to , reseller to staff for all". For Phase 2, I need to know which role's UI to build next and whether the new dashboard should fully replace the central admin ones in sass-frontend, or live alongside them behind a role switcher.

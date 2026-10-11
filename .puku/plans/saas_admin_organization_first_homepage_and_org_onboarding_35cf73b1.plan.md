---
name: "Saas admin: organization-first, homepage and org onboarding"
overview: "Audit findings + 4-phase build to (1) expose org-aware endpoints in the saas control plane, (2) make `/saas/organizations` the sass-owner landing page that lists and creates organizations, (3) replace the stub `src/app/page.tsx` with a real marketing homepage, and (4) add `/saas/onboarding/organization` multi-step org creation form with first-tenant + first-package step."
todos:
  - id: 1
    content: "Phase 1 — Backend polish: OrganizationSummarySerializer, create-with-first-tenant endpoint, tenant serializer extension, OpenAPI tags, tests"
    status: not_started
  - id: 2
    content: "Phase 2 — /saas/organizations route group: list, detail (Tenants/Members/Settings tabs), new saasApi methods, create-org dialog, sass landing KPIs"
    status: not_started
  - id: 3
    content: "Phase 3 — Org-aware /saas/tenants: organization column, organization filter, 'Move to org' action, create-tenant dialog org picker"
    status: not_started
  - id: 4
    content: "Phase 4 — Real marketing homepage at / (hero, features, pricing, FAQ, footer) + public /onboarding 4-step wizard + POST /api/v1/public/onboarding/ endpoint + 'Create org' CTA in /saas/organizations"
    status: not_started
isProject: false
---

---
name: Saas admin: organization-first + homepage + org onboarding
---

## TL;DR

`Organization` is already a first-class model with its own ViewSet, dashboard, and `MyOrganizationsView` (`backend/apps/core/organization_views.py`). What is missing is the **sass-owner-facing surface**: a `/saas/organizations` page (list + create) so the saas owner can see and create the organizations that own tenants, an org-aware tenants page, a real marketing homepage, and a multi-step org onboarding form. The work is **frontend-first** (most of the backend already exists); the only backend changes are tenant↔org lookups, an org-context header for the central plane, and a "create organization with first tenant" combined endpoint.

**Build order:** Phase 1 (backend polish, small) → Phase 2 (`/saas/organizations` list & detail) → Phase 3 (org-aware `/saas/tenants` + first org-tenant CTA) → Phase 4 (real homepage + multi-step org onboarding form).

---

## Audit findings

### Backend (`backend/apps/`)

| Area | Status | Where |
|--|--|--|
| `Organization` model + `OrganizationMembership` | ✅ exists, migration `0018` | `apps/core/models.py:9-95` |
| `Tenant.organization` FK + backfill | ✅ exists, migration `0019` puts pre-existing rows under synthetic `legacy-tenants` org | `apps/core/models.py:98+`, `apps/core/migrations/0019_backfill_legacy_organization.py` |
| `OrganizationSerializer` (with `members` nested) | ✅ exists | `apps/core/organization_views.py:56` |
| `SaaSOrganizationViewSet` (central CRUD) | ✅ exists, gated by `IsCentralAdmin` | `apps/core/organization_views.py:204` |
| `MyOrganizationsView` (org-admin sees own orgs) | ✅ exists, tag `20. Organization Admin Portal` | `apps/core/organization_views.py:359` |
| `OrganizationDashboardView` (org-admin sees own KPIs) | ✅ exists | `apps/core/organization_views.py:807` |
| `OrganizationMembersView` + write actions | ✅ exists | `apps/core/organization_views.py:270+` |
| OpenAPI tag `20. Organization Admin Portal` | ✅ exists | drf-spectacular |
| Sass-owner listing endpoint that *joins tenant count* | ⚠️ partial — list view exists, but does not include `tenant_count` or `member_count` summary fields used by the UI | needs small serializer change |
| Sass-owner endpoint to create org + first tenant in one call | ❌ missing | new endpoint |
| `Tenant` list view exposing `organization` info | ⚠️ partial — uses `organization` FK but not denormalized in the serializer | small serializer change |
| Sass-owner permission on org endpoints | ✅ `IsCentralAdmin` (superuser) | works |

**Conclusion:** backend is **~85% ready**. We need 2 small additions: a `OrganizationSummarySerializer` that exposes `tenant_count`/`member_count`, and a `CreateOrganizationWithFirstTenantView` action that wraps `SaaSOrganizationViewSet.create` to also provision a first tenant + owner membership in one call.

### Frontend (`sass-frontend-v2/src/`)

| Area | Status | Where |
|--|--|--|
| Stack | Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui + TanStack Query + Hugeicons | `package.json` |
| Sass-admin route group | ✅ exists at `app/saas/(dashboard)/` with sidebar shell, `tenants`, `onboarding`, `platform-admins`, `packages`, etc. | `src/app/saas/(dashboard)/layout.tsx` |
| `app/saas/tenants/page.tsx` | ✅ exists, but **lists tenants without surfacing the owning organization** in the row + has no "create org" entry point | needs small extension |
| `app/saas/organizations/...` | ❌ does not exist | new route group |
| `app/page.tsx` (public home) | ⚠️ tiny stub — three cards, no marketing structure, no `/onboarding` link | full rewrite |
| `app/onboarding/...` (public) | ❌ does not exist (only `app/saas/onboarding/page.tsx` for approval queue) | new route group |
| `lib/api` (`saasApi.*`) | ✅ exists with `getTenants`, `createTenant`, `getDashboardOverview` | needs `getOrganizations`, `createOrganization`, `createOrganizationWithFirstTenant` |
| `lib/portal/resolve-portal.ts` | ✅ hostname → portal resolver; `PUBLIC_HOME` is one of the modes | works |
| Auth gating for `/saas/*` | ✅ done by middleware + `lib/auth` | works |

**Conclusion:** frontend is **~50% ready**. We need a new `saas/organizations` route group, a real marketing homepage, an onboarding route group, and ~3 new `saasApi.*` methods. No new libraries required.

---

## Phases

### Phase 1 — Backend polish (slice, ~half a day)

Goal: every UI screen in the saas dashboard has a stable, well-documented API.

1. **`OrganizationSummarySerializer`** in `apps/core/organization_views.py`:
   - Inherits `OrganizationSerializer`, adds read-only `tenant_count` (from model `@property`), `member_count` (annotate), `active_subscription_count` (count of active `TenantSubscription` across this org's tenants), `owner_email` (first OWNER membership's user email).
   - Used by both `SaaSOrganizationViewSet.list/retrieve` and the new org+first-tenant endpoint.

2. **New endpoint** `POST /api/v1/saas/organizations/create-with-first-tenant/`:
   - File: `apps/core/organization_views.py` — `@action(detail=False, methods=['post'])` on `SaaSOrganizationViewSet`.
   - Request body: `organization: { name, slug?, contact_email, contact_phone?, address?, max_tenants? }` + `tenant: { name, slug, domain?, plan: package_slug }` + `owner: { username, email, password, full_name? }`.
   - Response 201: `{ organization, tenant, owner, owner_membership, subscription, default_admin_url }`.
   - Atomic transaction. Creates the org, the first tenant under it (with `organization` FK set), the owner user, the `OrganizationMembership(role=OWNER)`, and a `TenantSubscription` for the chosen package (or trial if no package given).
   - Permission: `IsCentralAdmin` only. Tag: `19. SaaS Owner Dashboard` (new).

3. **Extend `Tenant` central serializer** in `apps/core/serializers.py`:
   - Add read-only `organization` (UUID + name + slug) and `organization_id` to the central-plane tenant list/retrieve serializer (only on the saas view, not the org-admin tenant serializer).
   - Update `apps/core/saas_views.py::TenantViewSet` accordingly.

4. **OpenAPI**: add `@extend_schema(tags=['19. SaaS Owner Dashboard'])` to:
   - `SaaSOrganizationViewSet` (move from existing tag to the new saas-owner tag for consistency)
   - the new create-with-first-tenant action
   - the saas tenant viewset (already tagged `1. SaaS Tenants`, leave alone).

5. **Tests** — one file: `apps/core/test_organization_owner_dashboard.py`:
   - Org summary serializer returns correct counts.
   - `create-with-first-tenant` succeeds for an empty body → returns org, tenant, owner, OWNER membership.
   - `create-with-first-tenant` is rejected for non-`IsCentralAdmin` (a regular org-member).
   - Tenant serializer exposes `organization` in central list.

**Verify:** `cd backend && python manage.py test apps.core.test_organization_owner_dashboard -v 2` → green.

### Phase 2 — Sass-admin `/saas/organizations` page (list, create, detail)

Goal: the sass-owner can land on `/saas` and see organizations, not raw tenants. The tenants page is still one click away.

1. **New sidebar item** — open `src/app/saas/(dashboard)/layout.tsx`, add `Organizations` to the nav, before `Tenants` (it becomes the parent).
2. **New routes** under `src/app/saas/(dashboard)/organizations/`:
   - `page.tsx` — list view: `DataTable` of `OrganizationSummary`, columns = `name`, `slug`, `tenant_count`, `member_count`, `active_subscriptions`, `owner_email`, `is_active`, `created_at`, row click → `/saas/organizations/{id}`.
     - Toolbar: `+ New organization` button → opens `CreateOrganizationDialog` (modal).
     - Filter chips: `Active / Inactive / All`.
   - `[id]/page.tsx` — detail view: org header card (name, contact, max_tenants, is_active) + three tabs:
     - **Tenants** — list of `Tenant` rows under this org, with status badges, "View tenant" link, "Suspend" action.
     - **Members** — list of `OrganizationMembership`, with role, `invite` + `remove` actions (calls existing `OrganizationMembersView` endpoints).
     - **Settings** — edit org form (name, contact_phone, contact_email, address, max_tenants, is_active, notes); PATCH via `saasApi.updateOrganization(id, ...)`.
3. **New API methods** in `src/lib/api.ts` (add to `saasApi`):
   - `getOrganizations(params)` → `GET /saas/organizations/`
   - `getOrganization(id)` → `GET /saas/organizations/{id}/`
   - `createOrganization(body)` → `POST /saas/organizations/`
   - `updateOrganization(id, body)` → `PATCH /saas/organizations/{id}/`
   - `getOrganizationMembers(id)` → `GET /saas/organizations/{id}/members/`
   - `upsertOrganizationMember(id, body)` → `POST /saas/organizations/{id}/members/`
   - `removeOrganizationMember(id, userId)` → `DELETE`
4. **New types** in `src/lib/api.ts`:
   - `OrganizationSummary`, `OrganizationMember`, `CreateOrganizationInput`.
5. **Replace the saas landing page** — `src/app/saas/(dashboard)/page.tsx`:
   - Keep the platform KPIs row.
   - Add a "Top organizations" widget (top 5 by tenant count) with "See all" → `/saas/organizations`.
   - Add a "Organizations: 0 / active" KPI tile linking to `/saas/organizations`.
6. **Update `CreateOrganizationDialog`** component: a 3-section modal — Org details (name, slug auto-fill, contact, max_tenants), Owner details (username, email, optional first/last), Optional first tenant (name + slug + plan dropdown, fetched from `saasApi.getPackages()`). Submit posts to `saasApi.createOrganizationWithFirstTenant()`.
7. **Tests** — `e2e/saas-organizations.spec.ts` (Playwright): create org with first tenant → assert row appears → click row → see tenants tab.

**Verify:** `pnpm typecheck && pnpm lint && pnpm test:e2e e2e/saas-organizations.spec.ts` → green. Manual: start dev, log in as superuser, click around.

### Phase 3 — Org-aware `/saas/tenants`

Goal: when a saas admin looks at the tenants list, every row shows its parent organization. A new "Move to org" action is available.

1. **`src/app/saas/(dashboard)/tenants/page.tsx`**:
   - Add `Organization` column to the `DataTable` (rendered as a `Badge` linking to `/saas/organizations/{org_id}`).
   - Add a top-of-page filter "Organization" (`Select` populated from `getOrganizations`).
   - In the create-tenant dialog, require the user to pick an `organization_id` (defaulted to the first active org if any).
   - Add row action "Move to org…" — opens a `Select` modal, calls `PATCH /saas/tenants/{id}/` with the new `organization` id.
2. **Update `saasApi.createTenant` body type** to include `organization_id?: string`; the backend will accept it after the serializer change in Phase 1.
3. **Tests** — extend `e2e/saas-organizations.spec.ts` with: create a second org → move one tenant from org A to org B → assert the column updates.

**Verify:** same as Phase 2.

### Phase 4 — Real homepage + org onboarding form

Goal: a logged-out visitor lands on a real marketing homepage and can sign up to start a new organization. The saas admin can also launch the same flow from `/saas/organizations`.

1. **Marketing homepage** — replace `src/app/page.tsx`:
   - Hero (left = pitch + 3 CTAs: "Super Admin Login", "ISP Admin Login", "Request access"; right = abstract product visual using a gradient).
   - `Features` section: 3–6 cards reusing the existing `Card` shadcn primitive.
   - `How it works`: 3 steps (Sign up → Set up your organization → Invite your team).
   - `Pricing` strip: pull live packages from `GET /api/v1/saas/packages/public/`, render a 3-tier card grid.
   - `FAQ` (4–6 questions, accordion).
   - `Footer` with links.
   - Keep the existing portal-resolution redirect for the case where the visitor is already authed as a saas/isp/tenant user.
2. **Public org onboarding** — new route group `src/app/onboarding/`:
   - `layout.tsx` — minimal layout (logo + "Already have an account? Sign in" link).
   - `page.tsx` — 4-step wizard using `useReducer` + `useState`:
     1. **Organization** — name, slug (auto), contact_email, contact_phone, address, country. (Step 1 also accepts an optional `?ref=super-admin` flag for a saas-admin-launched session; if present, the wizard's "Plan" step is the platform admin's pre-selected plan.)
     2. **First tenant** — name, slug, hostname, POP/region dropdown.
     3. **Plan** — package cards from `GET /api/v1/saas/packages/public/`. Optional skip for trial.
     4. **Account** — first name, last name, email (pre-filled from step 1 contact_email), password (12+ chars with strength meter), terms checkbox.
   - Review screen → submit.
3. **New endpoint** `POST /api/v1/public/onboarding/`:
   - File: `apps/core/public_onboarding_views.py` (new), registered in `apps/core/urls.py` under `/api/v1/public/`.
   - Public (no auth). Accepts the same body shape as `create-with-first-tenant` but also creates a `TenantOnboardingRequest` if the chosen plan requires approval (decided by `SaaSPackage.requires_approval`), so the saas admin can still approve.
   - On auto-approve (most plans): creates the org + tenant + owner + OWNER membership + active subscription, returns `{ organization_id, tenant_id, owner_id, claim_url }` where `claim_url` is a one-time URL the owner can use to set their password.
   - On manual-approve: returns `{ onboarding_request_id, status: 'pending_review' }` and the UI shows a "We'll be in touch" screen.
   - Throttling: `AnonRateThrottle` at `5/hour`.
4. **Frontend API** — `src/lib/api.ts`: `publicApi.startOnboarding(payload)`, `publicApi.checkOnboardingStatus(id)`.
5. **"Create org" CTA in `/saas/organizations`** — the "+ New organization" button now offers two modes: (a) "Quick create" (modal, org-only) and (b) "Full onboarding flow" (opens a new tab to `/onboarding?ref=super-admin`). Mode (a) is for saas admins who want to bulk-provision; mode (b) is the guided wizard.
6. **Tests**:
   - `e2e/homepage.spec.ts` — public visitor lands on `/`, sees hero + pricing cards.
   - `e2e/onboarding.spec.ts` — full wizard submission (mocked API), success screen shown.
   - Backend `apps/core/test_public_onboarding.py` — happy path, manual-approval path, throttle enforcement.

**Verify:** `pnpm test:e2e` + `python manage.py test apps.core.test_public_onboarding` → green.

---

## Open questions to lock before Phase 1

1. **Onboarding approval default.** Should the new `POST /public/onboarding/` endpoint auto-provision the org (current proposal), or always require saas-admin approval? My default: **auto for paid plans, manual for trial/no plan**, mirroring the existing `SaaSOnboardingView`.
2. **Existing `legacy-tenants` org.** The data migration `0019` puts every pre-existing tenant under a synthetic `legacy-tenants` org. The saas admin UI must let an operator **reassign** a tenant to a real org (Phase 3 "Move to org" action covers this). Confirm? My default: yes.
3. **Permission model for "create org with first tenant".** Should only Django superusers be able to do it, or should we also let `PlatformAdmin` roles (if introduced later) do it? My default: **superuser only for now** (consistent with the current `IsCentralAdmin`); we widen later.
4. **OpenAPI tag rename.** Moving `SaaSOrganizationViewSet` from its current tag to a new `19. SaaS Owner Dashboard` is a breaking change for any consumer reading the OpenAPI doc by tag. My default: **keep the existing tag and just add the new endpoint under a new tag** — no rename.

## Files this plan touches

**Backend** (new + edits):
- `backend/apps/core/organization_views.py` — add summary serializer, add `create-with-first-tenant` action.
- `backend/apps/core/public_onboarding_views.py` (new) — public onboarding endpoint.
- `backend/apps/core/urls.py` — register public onboarding router.
- `backend/apps/core/serializers.py` — extend central tenant serializer.
- `backend/apps/core/test_organization_owner_dashboard.py` (new).
- `backend/apps/core/test_public_onboarding.py` (new).

**Frontend** (new + edits):
- `sass-frontend-v2/src/app/saas/(dashboard)/page.tsx` — add org KPIs.
- `sass-frontend-v2/src/app/saas/(dashboard)/layout.tsx` — add Organizations nav item.
- `sass-frontend-v2/src/app/saas/(dashboard)/organizations/page.tsx` (new).
- `sass-frontend-v2/src/app/saas/(dashboard)/organizations/[id]/page.tsx` (new).
- `sass-frontend-v2/src/app/saas/(dashboard)/tenants/page.tsx` — org column + filter.
- `sass-frontend-v2/src/app/page.tsx` — full marketing rewrite.
- `sass-frontend-v2/src/app/onboarding/layout.tsx` (new).
- `sass-frontend-v2/src/app/onboarding/page.tsx` (new) — 4-step wizard.
- `sass-frontend-v2/src/components/marketing/...` (new) — Hero, Features, Pricing, FAQ, Footer.
- `sass-frontend-v2/src/components/onboarding/...` (new) — wizard step components.
- `sass-frontend-v2/src/lib/api.ts` — add `getOrganizations`, `createOrganizationWithFirstTenant`, `publicApi.*`.
- `sass-frontend-v2/e2e/saas-organizations.spec.ts` (new).
- `sass-frontend-v2/e2e/homepage.spec.ts` (new).
- `sass-frontend-v2/e2e/onboarding.spec.ts` (new).

No new dependencies, no new libraries. All UI uses the existing shadcn primitives + Hugeicons.

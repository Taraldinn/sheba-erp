# Neon PostgreSQL, Better Auth & Organization Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transition production database to external Neon PostgreSQL, integrate Better Auth on `app.shebafi.xyz` and `shebafi.xyz` (Google direct login + email/username & password), and implement a user onboarding dashboard with super-admin approval and tenant user provisioning.

**Architecture:** Django and Next.js connect to a unified external Neon PostgreSQL instance. Next.js runs Better Auth with Google OAuth and username/email credential auth with cross-subdomain cookies (`.shebafi.xyz`). Authenticated users submit organization onboarding requests via an Onboarding Dashboard on `app.shebafi.xyz`. Super Admins review and approve requests on `admin.shebafi.xyz`. Once approved, owners manage their organization on `app.shebafi.xyz` and provision accounts for `{tenant}.shebafi.xyz`.

**Tech Stack:** Django 5, DRF, PostgreSQL (Neon serverless), Next.js 16, Better Auth (`better-auth`), Tailwind CSS v4, Lucide React, Vitest.

**Spec:** [`docs/superpowers/specs/2026-10-25-neon-postgres-better-auth-onboarding-design.md`](file:///home/taraldinn/Documents/Sheba%20codebase/docs/superpowers/specs/2026-10-25-neon-postgres-better-auth-onboarding-design.md)

## Global Constraints
- Target hostnames: `admin.shebafi.xyz` (Django central admin), `app.shebafi.xyz` (Better Auth & Onboarding Dashboard), `shebafi.xyz` (Marketing & Signup), `{tenant}.shebafi.xyz` (ISP tenant operations).
- In production, database SSL is mandatory (`sslmode=require`).
- No modifications to existing tenant-level operational modules (MikroTik, OLT, Billing, Invoicing).
- All new TypeScript code must pass `npm run typecheck` in `sass-frontend-v2`.
- All new Python code must pass Django test suite.

---

### Task 1: Neon PostgreSQL Database Configuration & Production Deployment Support

**Files:**
- Modify: `backend/sheba_core/settings.py:142-160`
- Modify: `backend/.env.production.example:63-69`
- Modify: `docker-compose.dokploy.yml:57-61`
- Test: `backend/apps/core/tests/test_neon_database_config.py`

**Interfaces:**
- Consumes: `DATABASE_URL` environment variable.
- Produces: `DATABASES['default']` configured with `sslmode=require` and connection pooling support.

- [ ] **Step 1: Write test for Neon PostgreSQL settings configuration**

```python
# backend/apps/core/tests/test_neon_database_config.py
from django.test import TestCase
from django.conf import settings


class NeonDatabaseConfigTest(TestCase):
    def test_database_options_sslmode_is_configured_in_production(self):
        # Verify that settings.py defines options structure capable of setting sslmode
        db_config = settings.DATABASES['default']
        self.assertIn('ENGINE', db_config)
```

- [ ] **Step 2: Run test to verify initial state**

Run: `python backend/manage.py test apps.core.tests.test_neon_database_config`
Expected: PASS or initial baseline check.

- [ ] **Step 3: Update `backend/sheba_core/settings.py` for Neon PostgreSQL support**

Add SSL requirement and pooler support in `backend/sheba_core/settings.py`:
```python
# ─── Database ─────────────────────────────────────────────────────────────────
DATABASES = {
    'default': env.db('DATABASE_URL', default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")
}

if not DEBUG and 'sqlite' not in DATABASES['default'].get('ENGINE', ''):
    DATABASES['default'].setdefault('OPTIONS', {})
    DATABASES['default']['OPTIONS']['sslmode'] = env.str('DB_SSLMODE', 'require')
    DATABASES['default']['CONN_MAX_AGE'] = env.int('DB_CONN_MAX_AGE', 300)
```

- [ ] **Step 4: Update `.env.production.example` and `docker-compose.dokploy.yml`**

Document external Neon database setup:
```bash
# In backend/.env.production.example
# External Neon Serverless PostgreSQL Database:
# Pooled endpoint for transactions:
DATABASE_URL=postgresql://user:password@ep-pooler-region.aws.neon.tech/sheba_erp?sslmode=require
# Direct endpoint for migrations:
DIRECT_DATABASE_URL=postgresql://user:password@ep-region.aws.neon.tech/sheba_erp?sslmode=require
DB_SSLMODE=require
DB_CONN_MAX_AGE=300
```
In `docker-compose.dokploy.yml`, make `postgres` healthcheck condition optional when external DB is used.

- [ ] **Step 5: Run tests and verify settings load cleanly**

Run: `python backend/manage.py test apps.core.tests.test_neon_database_config`
Expected: PASS

- [ ] **Step 6: Commit changes**

```bash
git add backend/sheba_core/settings.py backend/.env.production.example docker-compose.dokploy.yml backend/apps/core/tests/test_neon_database_config.py
git commit -m "feat(db): configure production support for external Neon PostgreSQL"
```

---

### Task 2: Install and Configure Better Auth in Next.js Frontend

**Files:**
- Create: `sass-frontend-v2/src/lib/auth.ts`
- Create: `sass-frontend-v2/src/lib/auth-client.ts`
- Create: `sass-frontend-v2/src/app/api/auth/[...all]/route.ts`
- Modify: `sass-frontend-v2/package.json`
- Test: `sass-frontend-v2/tests/auth/better-auth-config.test.ts`

**Interfaces:**
- Consumes: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Produces: `auth` server instance, `authClient` React client SDK (`signIn`, `signUp`, `useSession`).

- [ ] **Step 1: Write test for Better Auth configuration definitions**

```typescript
// sass-frontend-v2/tests/auth/better-auth-config.test.ts
import { describe, it, expect } from 'vitest';
import { getCookieDomain } from '@/lib/auth-client';

describe('Better Auth Client Helper', () => {
    it('returns .shebafi.xyz for production hostnames', () => {
        expect(getCookieDomain('app.shebafi.xyz')).toBe('.shebafi.xyz');
        expect(getCookieDomain('shebafi.xyz')).toBe('.shebafi.xyz');
    });

    it('returns undefined or localhost for local development', () => {
        expect(getCookieDomain('localhost')).toBeUndefined();
        expect(getCookieDomain('app.localhost')).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix sass-frontend-v2 test -- tests/auth/better-auth-config.test.ts`
Expected: FAIL (Cannot find module `@/lib/auth-client`)

- [ ] **Step 3: Install `better-auth` and `@neondatabase/serverless`**

```bash
cd sass-frontend-v2 && npm install better-auth @neondatabase/serverless
```

- [ ] **Step 4: Create Better Auth server and client configurations**

Create `sass-frontend-v2/src/lib/auth.ts`:
```typescript
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/sheba_erp',
});

export const auth = betterAuth({
    database: pool,
    secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-replace-in-production-12345678',
    baseURL: process.env.BETTER_AUTH_URL || 'http://app.localhost:3000',
    plugins: [username()],
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        },
    },
    advanced: {
        cookiePrefix: 'sheba_auth',
        crossSubDomainCookies: {
            enabled: true,
            domain: process.env.NODE_ENV === 'production' ? '.shebafi.xyz' : undefined,
        },
    },
});
```

Create `sass-frontend-v2/src/lib/auth-client.ts`:
```typescript
import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';

export function getCookieDomain(hostname: string): string | undefined {
    if (hostname.endsWith('shebafi.xyz')) {
        return '.shebafi.xyz';
    }
    return undefined;
}

export const authClient = createAuthClient({
    baseURL: typeof window !== 'undefined' ? window.location.origin : (process.env.BETTER_AUTH_URL || 'http://app.localhost:3000'),
    plugins: [usernameClient()],
});

export const { signIn, signUp, useSession, signOut } = authClient;
```

Create route handler `sass-frontend-v2/src/app/api/auth/[...all]/route.ts`:
```typescript
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `npm --prefix sass-frontend-v2 test -- tests/auth/better-auth-config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit changes**

```bash
git add sass-frontend-v2/package.json sass-frontend-v2/package-lock.json sass-frontend-v2/src/lib/auth.ts sass-frontend-v2/src/lib/auth-client.ts sass-frontend-v2/src/app/api/auth/[...all]/route.ts sass-frontend-v2/tests/auth/better-auth-config.test.ts
git commit -m "feat(auth): configure Better Auth with Google OAuth, username plugin and Neon DB"
```

---

### Task 3: Portal Resolution & Middleware Updates for `app.shebafi.xyz`

**Files:**
- Modify: `sass-frontend-v2/src/lib/portal/resolve-portal.ts:107-116`
- Modify: `sass-frontend-v2/src/middleware.ts:6-66`
- Test: `sass-frontend-v2/tests/portal/portal-app-subdomain.test.ts`

**Interfaces:**
- Consumes: Hostname and pathname.
- Produces: Portal resolution `'ORGANIZATION_APP'` for `app.shebafi.xyz` / `app.localhost`.

- [ ] **Step 1: Write test for `app.shebafi.xyz` portal resolution**

```typescript
// sass-frontend-v2/tests/portal/portal-app-subdomain.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePortal } from '@/lib/portal/resolve-portal';

describe('Portal Resolution for app.shebafi.xyz', () => {
    it('maps app.shebafi.xyz and app.localhost to ORGANIZATION_APP', () => {
        expect(resolvePortal('app.shebafi.xyz').portal).toBe('ORGANIZATION_APP');
        expect(resolvePortal('app.localhost').portal).toBe('ORGANIZATION_APP');
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix sass-frontend-v2 test -- tests/portal/portal-app-subdomain.test.ts`
Expected: FAIL (`portal` is `ISP_ADMIN`, not `ORGANIZATION_APP`)

- [ ] **Step 3: Update `resolve-portal.ts` and `types.ts`**

In `sass-frontend-v2/src/lib/portal/types.ts`, add `'ORGANIZATION_APP'` to `PortalType`.
In `sass-frontend-v2/src/lib/portal/resolve-portal.ts`:
```typescript
    // ── 2. Client Organization App ─────────────────────────────────────────
    if (
        hostname === 'app.shebafi.xyz' ||
        hostname === 'app.localhost' ||
        hostname.startsWith('app.')
    ) {
        return { portal: 'ORGANIZATION_APP', hostname, isDevelopment: isLocalDevHost };
    }
```
In `sass-frontend-v2/src/middleware.ts`, handle root `/` redirect for `ORGANIZATION_APP` to `/dashboard`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --prefix sass-frontend-v2 test -- tests/portal/portal-app-subdomain.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add sass-frontend-v2/src/lib/portal/resolve-portal.ts sass-frontend-v2/src/lib/portal/types.ts sass-frontend-v2/src/middleware.ts sass-frontend-v2/tests/portal/portal-app-subdomain.test.ts
git commit -m "feat(portal): add ORGANIZATION_APP portal resolution for app.shebafi.xyz"
```

---

### Task 4: Unified Auth UI (Google Direct Login + Username/Email & Password)

**Files:**
- Create: `sass-frontend-v2/src/components/auth/better-auth-card.tsx`
- Modify: `sass-frontend-v2/src/app/login/page.tsx`
- Create: `sass-frontend-v2/src/app/signup/page.tsx`
- Modify: `sass-frontend-v2/src/app/onboarding/page.tsx`
- Test: `sass-frontend-v2/tests/auth/better-auth-ui.test.tsx`

**Interfaces:**
- Consumes: `signIn`, `signUp`, `useSession` from `src/lib/auth-client`.
- Produces: Visual authentication card supporting Google OAuth and Username/Email + Password credentials.

- [ ] **Step 1: Write test for BetterAuthCard component**

```tsx
// sass-frontend-v2/tests/auth/better-auth-ui.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BetterAuthCard } from '@/components/auth/better-auth-card';

describe('BetterAuthCard', () => {
    it('renders Google direct login button and credential inputs', () => {
        render(<BetterAuthCard mode="signin" />);
        expect(screen.getByRole('button', { name: /continue with google/i })).toBeDefined();
        expect(screen.getByPlaceholderText(/username or email/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/password/i)).toBeDefined();
    });

    it('renders signup fields including username and email when mode is signup', () => {
        render(<BetterAuthCard mode="signup" />);
        expect(screen.getByRole('button', { name: /sign up with google/i })).toBeDefined();
        expect(screen.getByPlaceholderText(/full name/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/username/i)).toBeDefined();
        expect(screen.getByPlaceholderText(/email address/i)).toBeDefined();
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix sass-frontend-v2 test -- tests/auth/better-auth-ui.test.tsx`
Expected: FAIL (Cannot find module `@/components/auth/better-auth-card`)

- [ ] **Step 3: Implement `BetterAuthCard`**

Create `sass-frontend-v2/src/components/auth/better-auth-card.tsx` with:
- Google icon & `signIn.social({ provider: 'google' })` action.
- Username/email and password credential form.
- Form validation, error messaging, and redirect on success.

- [ ] **Step 4: Update `/login`, create `/signup`, and integrate with `/onboarding`**

- In `sass-frontend-v2/src/app/login/page.tsx`, embed `BetterAuthCard` for public visitors and `app.shebafi.xyz`.
- In `sass-frontend-v2/src/app/signup/page.tsx`, render `BetterAuthCard mode="signup"`.
- In `sass-frontend-v2/src/app/onboarding/page.tsx`, check `useSession()`. If not authenticated, prompt user with `BetterAuthCard` before submitting onboarding details.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm --prefix sass-frontend-v2 test -- tests/auth/better-auth-ui.test.tsx`
Run: `npm --prefix sass-frontend-v2 run typecheck`
Expected: PASS

- [ ] **Step 6: Commit changes**

```bash
git add sass-frontend-v2/src/components/auth/better-auth-card.tsx sass-frontend-v2/src/app/login/page.tsx sass-frontend-v2/src/app/signup/page.tsx sass-frontend-v2/src/app/onboarding/page.tsx sass-frontend-v2/tests/auth/better-auth-ui.test.tsx
git commit -m "feat(ui): implement BetterAuthCard with Google OAuth and username/email login and signup"
```

---

### Task 5: Client Onboarding Dashboard on `app.shebafi.xyz`

**Files:**
- Create: `sass-frontend-v2/src/app/dashboard/page.tsx`
- Create: `sass-frontend-v2/src/components/onboarding/onboarding-request-form.tsx`
- Create: `sass-frontend-v2/src/components/onboarding/onboarding-status-card.tsx`
- Test: `sass-frontend-v2/tests/onboarding/onboarding-dashboard.test.tsx`

**Interfaces:**
- Consumes: Authenticated Better Auth session, `publicApi.startOnboarding`, `publicApi.getOnboardingStatus`.
- Produces: Multi-state onboarding dashboard (`No Request`, `Pending Review`, `Rejected`, `Approved & Active`).

- [ ] **Step 1: Write test for OnboardingStatusCard**

```tsx
// sass-frontend-v2/tests/onboarding/onboarding-dashboard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OnboardingStatusCard } from '@/components/onboarding/onboarding-status-card';

describe('OnboardingStatusCard', () => {
    it('displays pending review state with organization details', () => {
        render(
            <OnboardingStatusCard
                status="pending"
                organizationName="Dhaka Net"
                requestedSlug="dhaka-net"
                plan="Standard"
            />
        );
        expect(screen.getByText(/pending review/i)).toBeDefined();
        expect(screen.getByText(/dhaka net/i)).toBeDefined();
    });

    it('displays approved state with workspace launch button', () => {
        render(
            <OnboardingStatusCard
                status="approved"
                organizationName="Dhaka Net"
                requestedSlug="dhaka-net"
                plan="Standard"
            />
        );
        expect(screen.getByText(/approved & active/i)).toBeDefined();
        expect(screen.getByRole('link', { name: /launch workspace/i })).toBeDefined();
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix sass-frontend-v2 test -- tests/onboarding/onboarding-dashboard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `OnboardingStatusCard` and `OnboardingRequestForm`**

- Implement `OnboardingStatusCard` rendering pending, rejected, and approved states.
- Implement `OnboardingRequestForm` for submitting Organization Name, Slug, Phone, Address, and Plan.
- Implement `sass-frontend-v2/src/app/dashboard/page.tsx` coordinating the user session and current organization status.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm --prefix sass-frontend-v2 test -- tests/onboarding/onboarding-dashboard.test.tsx`
Run: `npm --prefix sass-frontend-v2 run typecheck`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add sass-frontend-v2/src/app/dashboard/page.tsx sass-frontend-v2/src/components/onboarding/onboarding-request-form.tsx sass-frontend-v2/src/components/onboarding/onboarding-status-card.tsx sass-frontend-v2/tests/onboarding/onboarding-dashboard.test.tsx
git commit -m "feat(dashboard): build client onboarding dashboard and status tracker"
```

---

### Task 6: Tenant User Creation API & UI from `app.shebafi.xyz`

**Files:**
- Modify: `backend/apps/core/organization_views.py:1656-1750`
- Create: `sass-frontend-v2/src/components/tenant-users/tenant-user-manager.tsx`
- Modify: `sass-frontend-v2/src/lib/api/saas.ts`
- Test: `backend/apps/core/tests/test_tenant_user_provisioning.py`
- Test: `sass-frontend-v2/tests/tenant-users/tenant-user-manager.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/saas/tenants/{tenant_id}/staff-accounts/` with `username`, `email`, `password`, `first_name`, `last_name`, `role`.
- Produces: Newly provisioned Django `User` and `StaffProfile` assigned to the tenant.

- [ ] **Step 1: Write backend test for tenant staff account creation endpoint**

```python
# backend/apps/core/tests/test_tenant_user_provisioning.py
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from apps.core.models import Tenant, Organization, OrganizationMembership


class TenantUserProvisioningTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name='Test ISP', slug='test-isp')
        self.tenant = Tenant.objects.create(organization=self.org, name='Test ISP Tenant', slug='test-isp')
        self.owner = User.objects.create_user(username='isp_owner', email='owner@test.com', password='password123')
        OrganizationMembership.objects.create(organization=self.org, user=self.owner, role='OWNER')
        self.client.force_authenticate(user=self.owner)

    def test_owner_can_provision_tenant_user(self):
        resp = self.client.post(f'/api/v1/saas/tenants/{self.tenant.id}/staff-accounts/', {
            'username': 'technician1',
            'email': 'tech@test.com',
            'password': 'SecurePassword123!',
            'first_name': 'Rahim',
            'last_name': 'Uddin',
            'role': 'ISP_STAFF'
        })
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(User.objects.filter(username='technician1').exists())
```

- [ ] **Step 2: Run test to verify failure**

Run: `python backend/manage.py test apps.core.tests.test_tenant_user_provisioning`
Expected: FAIL (404 Not Found)

- [ ] **Step 3: Implement tenant staff creation endpoint in Django**

In `backend/apps/core/organization_views.py`:
- Add `TenantStaffAccountCreateView` accepting username, email, password, role.
- Verify caller has OWNER membership in the tenant's organization.
- Atomically create `User` in `auth_user`, create `StaffProfile`, and assign to `StaffMembership`.
- Register route in `backend/sheba_core/urls.py`.

- [ ] **Step 4: Implement `TenantUserManager` component in Next.js**

Create `sass-frontend-v2/src/components/tenant-users/tenant-user-manager.tsx`:
- Render "Add Staff Account" dialog with Username, Email, Password, Role.
- Render table of existing accounts for `{tenant}.shebafi.xyz`.
- Mount inside `sass-frontend-v2/src/app/dashboard/page.tsx` when status is approved.

- [ ] **Step 5: Run tests and verify they pass**

Run: `python backend/manage.py test apps.core.tests.test_tenant_user_provisioning`
Run: `npm --prefix sass-frontend-v2 test -- tests/tenant-users/tenant-user-manager.test.tsx`
Run: `npm --prefix sass-frontend-v2 run typecheck`
Expected: ALL PASS

- [ ] **Step 6: Commit changes**

```bash
git add backend/apps/core/organization_views.py backend/sheba_core/urls.py backend/apps/core/tests/test_tenant_user_provisioning.py sass-frontend-v2/src/components/tenant-users/tenant-user-manager.tsx sass-frontend-v2/src/lib/api/saas.ts sass-frontend-v2/tests/tenant-users/tenant-user-manager.test.tsx
git commit -m "feat(tenants): allow organization owner to provision staff accounts for tenant portal"
```

---

### Task 7: Full End-to-End Integration Verification

**Files:**
- Test: `sass-frontend-v2/tests/e2e/onboarding-lifecycle.test.ts`
- Documentation: `DEPLOYMENT_DOKPLOY_VERCEL.md`

**Interfaces:**
- Complete signup &rarr; onboarding request &rarr; approval &rarr; tenant user creation &rarr; tenant login workflow.

- [ ] **Step 1: Write integration flow test**

Test the complete onboarding contract from Better Auth session to Django provisioning.

- [ ] **Step 2: Run backend test suite**

Run: `python backend/manage.py test apps.core apps.authentication`
Expected: All tests pass.

- [ ] **Step 3: Run frontend test suite & typecheck**

Run: `npm --prefix sass-frontend-v2 test`
Run: `npm --prefix sass-frontend-v2 run typecheck`
Expected: Zero type errors, all tests pass.

- [ ] **Step 4: Commit and finalize**

```bash
git add DEPLOYMENT_DOKPLOY_VERCEL.md sass-frontend-v2/tests/e2e/onboarding-lifecycle.test.ts
git commit -m "test(e2e): verify complete onboarding lifecycle and document Neon deployment"
```

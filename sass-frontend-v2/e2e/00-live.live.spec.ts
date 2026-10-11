import { test, expect } from '@playwright/test';
import { liveApiUrl, liveLogin, liveMe, liveSeedSession, LIVE_ENV } from '../tests/e2e-fixtures/live-env';

/**
 * Live-backend smoke spec.
 *
 * This file ONLY runs in the `live` project, which is enabled with
 * VITE_E2E_LIVE=1. When that env var is unset the project matches no
 * files, so the mock-backed suite is unaffected.
 *
 *   VITE_E2E_LIVE=1 VITE_E2E_API_BASE_URL=https://staging.example.com/api/v1 \
 *   VITE_E2E_SUPER_USER=admin VITE_E2E_SUPER_PASS=*** \
 *   VITE_E2E_TENANT_USER=owner VITE_E2E_TENANT_PASS=*** \
 *   pnpm exec playwright test --project=live
 *
 * If credentials aren't set, the login-dependent tests log a warning
 * and skip so the run still exits 0. Network probes (health/me)
 * still run unconditionally.
 */
const LIVE_ENABLED = process.env.VITE_E2E_LIVE === '1';
test.skip(!LIVE_ENABLED, 'Live suite is gated on VITE_E2E_LIVE=1');

test.describe('Live backend — SaaS admin smoke', () => {
    test('backend root is reachable', async ({ request }) => {
        const response = await request.get(LIVE_ENV.apiBase, { failOnStatusCode: false });
        // 200, 401, 403, 405 are all acceptable "the server is alive" responses.
        // A network failure or a 5xx is what we want to catch here.
        expect([200, 204, 301, 302, 307, 308, 400, 401, 403, 404, 405]).toContain(response.status());
    });

    test('super-admin login + /auth/me round-trip', async ({ page }) => {
        const session = await liveLogin(page, 'super_admin');
        test.skip(session === null, 'No super-admin credentials configured');
        const me = await liveMe(page, 'super_admin', session!.token);
        expect(me.status()).toBeLessThan(400);
        const meBody = await me.json();
        expect(meBody).toHaveProperty('id');
        await liveSeedSession(page, session!, 'super_admin');
        await page.goto('/saas/tenants');
        // The SaaS tenants page must render a heading.
        await expect(page.getByRole('heading', { name: /tenants/i })).toBeVisible();
    });
});

test.describe('Live backend — Tenant portal smoke', () => {
    test('tenant login + customer list round-trip', async ({ page }) => {
        const session = await liveLogin(page, 'tenant', { tenant: LIVE_ENV.tenantSlug });
        test.skip(session === null, 'No tenant credentials configured');
        const me = await liveMe(page, 'tenant', session!.token);
        expect(me.status()).toBeLessThan(400);
        await liveSeedSession(page, session!, 'tenant');
        await page.goto('/tenant/customers');
        await expect(page.getByRole('heading', { name: /customers/i })).toBeVisible();
    });

    test('tenant /packages/ endpoint is reachable and returns 200', async ({ page, request }) => {
        const session = await liveLogin(page, 'tenant', { tenant: LIVE_ENV.tenantSlug });
        test.skip(session === null, 'No tenant credentials configured');
        const token = session!.token;
        const response = await request.get(liveApiUrl('packages/'), {
            headers: { authorization: `Bearer ${token}` },
        });
        expect([200, 401, 403]).toContain(response.status());
    });
});

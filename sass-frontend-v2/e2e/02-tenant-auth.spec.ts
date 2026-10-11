import { test, expect } from '@playwright/test';
import { installMockApi } from '../tests/e2e-fixtures/mock-api';
import { applySeed, E2E_USERS } from '../tests/e2e-fixtures/auth';

test.describe('Tenant portal — authentication', () => {
    test.beforeEach(async ({ page }) => {
        await installMockApi(page, { portal: 'tenant' });
    });

    test('login form posts credentials and stores a session', async ({ page }) => {
        await applySeed(page, { clear: true });
        await page.goto('/tenant/login');
        await page.getByLabel(/username/i).fill(E2E_USERS.tenantAdmin.username);
        await page.getByLabel(/password/i).fill(E2E_USERS.tenantAdmin.password);
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForURL(/\/tenant\b/);
        // The dashboard heading is "Operations" (KPIs page).
        await expect(page.getByRole('heading', { name: /operations|welcome|tenant|acme/i }).first()).toBeVisible();
    });

    test('seeded session grants access to the customer list', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.tenantAdmin });
        await page.goto('/tenant/customers');
        await expect(page.getByRole('heading', { name: /customers/i })).toBeVisible();
    });

    test('tenant login page renders a form', async ({ page }) => {
        await applySeed(page, { clear: true });
        await page.goto('/tenant/login');
        await expect(page.getByLabel(/username/i)).toBeVisible();
        await expect(page.getByLabel(/password/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('sign out button is available and triggers logout API', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.tenantAdmin });
        let logoutCalled = false;
        await page.route('**/api/v1/auth/logout/', async route => {
            logoutCalled = true;
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        });
        await page.goto('/tenant/customers', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: /sign out/i }).first().click();
        await page.waitForTimeout(500);
        expect(logoutCalled).toBe(true);
    });
});

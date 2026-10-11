import { test, expect } from '@playwright/test';
import { installMockApi } from '../tests/e2e-fixtures/mock-api';
import { applySeed, E2E_USERS } from '../tests/e2e-fixtures/auth';

test.describe('SaaS organizations (Phase 2)', () => {
    test.beforeEach(async ({ page }) => {
        await installMockApi(page, { portal: 'super_admin' });
    });

    test('organizations page renders the table heading', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.superAdmin });
        await page.goto('/saas/organizations');
        await expect(page.getByRole('heading', { name: /organizations/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /new organization/i })).toBeVisible();
    });

    test('tenants list shows the new organizations column', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.superAdmin });
        await page.goto('/saas/tenants');
        await expect(page.getByRole('heading', { name: /tenants/i })).toBeVisible();
    });

    test('sass landing shows the top organizations widget', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.superAdmin });
        await page.goto('/saas');
        await expect(page.getByRole('heading', { name: /platform overview/i })).toBeVisible();
        await expect(page.getByText(/top organizations/i)).toBeVisible();
    });
});

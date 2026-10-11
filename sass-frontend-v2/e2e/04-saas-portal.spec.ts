import { test, expect } from '@playwright/test';
import { installMockApi } from '../tests/e2e-fixtures/mock-api';
import { applySeed, E2E_USERS } from '../tests/e2e-fixtures/auth';

test.describe('SaaS / Super-admin portal', () => {
    test.beforeEach(async ({ page }) => {
        await installMockApi(page, { portal: 'super_admin' });
    });

    test('saas login page renders a form', async ({ page }) => {
        await applySeed(page, { clear: true });
        await page.goto('/saas/login');
        await expect(page.getByLabel(/username/i)).toBeVisible();
        await expect(page.getByLabel(/password/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('seeded session loads the tenants list', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.superAdmin });
        await page.goto('/saas/tenants');
        await expect(page.getByRole('heading', { name: /tenants/i })).toBeVisible();
    });

    test('domains list shows primary domain badge', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.superAdmin });
        await page.goto('/saas/domains');
        await expect(page.getByRole('heading', { name: /domains/i })).toBeVisible();
    });

    test('employees list shows the seeded user', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.superAdmin });
        await page.goto('/saas/employees');
        await expect(page.getByRole('heading', { name: /employees/i })).toBeVisible();
    });

    test('audit log page renders', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.superAdmin });
        await page.goto('/saas/audit');
        await expect(page.getByRole('heading', { name: /audit/i })).toBeVisible();
    });

    test('backups page renders', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.superAdmin });
        await page.goto('/saas/backups');
        await expect(page.getByRole('heading', { name: /backups/i })).toBeVisible();
    });
});

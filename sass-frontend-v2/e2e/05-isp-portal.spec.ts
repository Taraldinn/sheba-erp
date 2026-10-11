import { test, expect } from '@playwright/test';
import { installMockApi } from '../tests/e2e-fixtures/mock-api';
import { applySeed, E2E_USERS } from '../tests/e2e-fixtures/auth';

test.describe('ISP owner portal', () => {
    test.beforeEach(async ({ page }) => {
        await installMockApi(page, { portal: 'isp' });
    });

    test('isp login page renders a form', async ({ page }) => {
        await applySeed(page, { clear: true });
        await page.goto('/isp/login');
        await expect(page.getByLabel(/username/i)).toBeVisible();
        await expect(page.getByLabel(/password/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('seeded session loads the ISP tenants list', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.ispAdmin });
        await page.goto('/isp/tenants');
        await expect(page.getByRole('heading', { name: /tenants|my tenants/i })).toBeVisible();
    });

    test('child tenants page renders', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.ispAdmin });
        await page.goto('/isp/child-tenants');
        await expect(page.getByRole('heading', { name: /tenants|child/i }).first()).toBeVisible();
    });

    test('modules page renders', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.ispAdmin });
        await page.goto('/isp/modules');
        await expect(page.getByRole('heading', { name: /modules/i })).toBeVisible();
    });

    test('resellers page renders', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.ispAdmin });
        await page.goto('/isp/resellers');
        await expect(page.getByRole('heading', { name: /resellers/i })).toBeVisible();
    });

    test('ISP domains page renders', async ({ page }) => {
        await applySeed(page, { clear: true, user: E2E_USERS.ispAdmin });
        await page.goto('/isp/domains');
        await expect(page.getByRole('heading', { name: /domains/i })).toBeVisible();
    });
});

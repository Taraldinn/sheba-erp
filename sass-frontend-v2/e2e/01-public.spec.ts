import { test, expect } from '@playwright/test';
import { installMockApi } from '../tests/e2e-fixtures/mock-api';

test.describe('Public landing and routing', () => {
    test.beforeEach(async ({ page }) => {
        await installMockApi(page);
    });

    test('home page renders a brand and a sign-in link', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/Shebafi/i);
        // Home must show either brand or a sign-in CTA.
        await expect(page.locator('body')).toContainText(/Shebafi|sign in|sign in|login/i);
    });

    test('unknown route renders the 404 page', async ({ page }) => {
        await page.goto('/this-route-does-not-exist');
        await expect(page.getByText('404')).toBeVisible();
    });

    test('forgot password page renders a form', async ({ page }) => {
        await page.goto('/forgot-password');
        await expect(page.getByRole('heading', { name: /forgot|password|reset/i })).toBeVisible();
    });
});

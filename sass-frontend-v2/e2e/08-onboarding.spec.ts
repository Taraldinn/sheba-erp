import { test, expect } from '@playwright/test';
import { installMockApi } from '../tests/e2e-fixtures/mock-api';

test.describe('Public onboarding wizard (Phase 4)', () => {
    test.beforeEach(async ({ page }) => {
        await installMockApi(page, { portal: 'public' });
    });

    test('wizard renders the 4-step stepper', async ({ page }) => {
        await page.goto('/onboarding');
        await expect(page.getByRole('heading', { name: /start your shebafi organization/i })).toBeVisible();
        await expect(page.getByText(/^Organization$/i).first()).toBeVisible();
        await expect(page.getByText(/^First tenant$/i)).toBeVisible();
        await expect(page.getByText(/^Plan$/i)).toBeVisible();
        await expect(page.getByText(/^Account$/i)).toBeVisible();
    });

    test('organization step has required fields', async ({ page }) => {
        await page.goto('/onboarding');
        await expect(page.getByLabel(/organization name/i)).toBeVisible();
        await expect(page.getByLabel(/contact email/i)).toBeVisible();
    });
});

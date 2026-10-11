import { test, expect } from '@playwright/test';
import { installMockApi } from '../tests/e2e-fixtures/mock-api';

test.describe('Public marketing homepage (Phase 4)', () => {
    test.beforeEach(async ({ page }) => {
        await installMockApi(page, { portal: 'public' });
    });

    test('hero + features + pricing + FAQ are visible', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /run your broadband business/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /organization-first control plane/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /simple, transparent pricing/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /frequently asked questions/i })).toBeVisible();
    });

    test('start free CTA links to /onboarding', async ({ page }) => {
        await page.goto('/');
        const link = page.getByRole('link', { name: /start your organization/i }).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', '/onboarding');
    });
});

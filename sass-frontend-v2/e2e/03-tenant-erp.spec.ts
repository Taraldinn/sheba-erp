import { test, expect } from '@playwright/test';
import { installMockApi } from '../tests/e2e-fixtures/mock-api';
import { applySeed, E2E_USERS } from '../tests/e2e-fixtures/auth';

test.describe('Tenant ERP — list and detail pages', () => {
    test.beforeEach(async ({ page }) => {
        await installMockApi(page, { portal: 'tenant' });
        await applySeed(page, { clear: true, user: E2E_USERS.tenantAdmin });
    });

    test('customers list renders rows from the API', async ({ page }) => {
        await page.goto('/tenant/customers');
        await expect(page.getByRole('heading', { name: /customers/i })).toBeVisible();
        await expect(page.getByText('Alice').first()).toBeVisible();
        await expect(page.getByText('Bob').first()).toBeVisible();
    });

    test('packages list renders plan rows', async ({ page }) => {
        await page.goto('/tenant/packages');
        await expect(page.getByRole('heading', { name: /packages/i })).toBeVisible();
        await expect(page.getByText('Basic 5Mbps').first()).toBeVisible();
    });

    test('invoices list shows status badges', async ({ page }) => {
        await page.goto('/tenant/invoices');
        await expect(page.getByRole('heading', { name: /invoices/i })).toBeVisible();
        await expect(page.getByText('INV-001').first()).toBeVisible();
    });

    test('subscriptions list shows package names', async ({ page }) => {
        await page.goto('/tenant/subscriptions');
        await expect(page.getByRole('heading', { name: /subscriptions/i })).toBeVisible();
        await expect(page.getByText('Basic').first()).toBeVisible();
    });

    test('payments list renders amounts', async ({ page }) => {
        await page.goto('/tenant/payments');
        await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible();
    });

    test('routers list shows the seeded device', async ({ page }) => {
        await page.goto('/tenant/routers');
        await expect(page.getByRole('heading', { name: /routers/i })).toBeVisible();
    });

    test('olts list shows the seeded device', async ({ page }) => {
        await page.goto('/tenant/olts');
        await expect(page.getByRole('heading', { name: /olts/i })).toBeVisible();
    });

    test('branches list shows the seeded branch', async ({ page }) => {
        await page.goto('/tenant/branches');
        await expect(page.getByRole('heading', { name: /branches/i })).toBeVisible();
    });

    test('settings page renders', async ({ page }) => {
        await page.goto('/tenant/settings');
        await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
    });
});

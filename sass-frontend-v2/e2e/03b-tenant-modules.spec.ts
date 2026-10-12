import { test, expect } from '@playwright/test';
import { installMockApi } from '../tests/e2e-fixtures/mock-api';
import { applySeed, E2E_USERS } from '../tests/e2e-fixtures/auth';

/**
 * Smoke-test every newly added tenant module page. We only assert that
 * each route renders its PageHeader title without throwing — a regression
 * guard against imports, missing components, or wrong file paths.
 *
 * Live data is already covered by 03-tenant-erp.spec.ts.
 */
test.describe('Tenant ERP — new modules smoke', () => {
    test.beforeEach(async ({ page }) => {
        await installMockApi(page, { portal: 'tenant' });
        await applySeed(page, { clear: true, user: E2E_USERS.tenantAdmin });
    });

    const cases: Array<[path: string, header: RegExp]> = [
        ['/tenant/network', /network/i],
        ['/tenant/topology', /live topology/i],
        ['/tenant/onus', /onus/i],
        ['/tenant/pppoe', /pppoe/i],
        ['/tenant/hr', /employees/i],
        ['/tenant/hr/attendance', /attendance/i],
        ['/tenant/hr/leaves', /leave requests/i],
        ['/tenant/hr/payroll', /payroll/i],
        ['/tenant/store', /store & devices/i],
        ['/tenant/store/transactions', /stock movements/i],
        ['/tenant/agents', /callcenter agents/i],
        ['/tenant/callcenter', /call logs/i],
        ['/tenant/callcenter/templates', /voice templates/i],
        ['/tenant/callcenter/pbx', /mikopbx/i],
        ['/tenant/corporate', /corporate clients/i],
        ['/tenant/corporate/connections', /corporate connections/i],
        ['/tenant/corporate/ip-pools', /ip pools/i],
        ['/tenant/corporate/vlans', /vlans/i],
        ['/tenant/staff', /office staff/i],
        ['/tenant/tickets', /support tickets/i],
        ['/tenant/audit', /audit log/i],
        ['/tenant/settings', /configuration/i],
    ];

    for (const [path, header] of cases) {
        test(`renders ${path}`, async ({ page }) => {
            const response = await page.goto(path);
            // The page should be reachable. Allow 200 (rendered) or 307
            // (auth-gated) — anything else indicates a real failure.
            expect([200, 307]).toContain(response?.status() ?? 0);
            if (response?.status() === 200) {
                await expect(page.getByRole('heading', { name: header })).toBeVisible();
            }
        });
    }
});

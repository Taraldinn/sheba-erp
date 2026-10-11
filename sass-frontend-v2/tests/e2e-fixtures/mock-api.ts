import type { Page, Route } from '@playwright/test';

/**
 * Set `VITE_E2E_LIVE=1` to skip the network mock and exercise the
 * real backend (Django) at VITE_E2E_API_BASE_URL. Otherwise the mock
 * fixture below intercepts every /api/** call and returns
 * deterministic JSON.
 */
export const E2E_LIVE = process.env.VITE_E2E_LIVE === '1';

/**
 * Mocks a small but representative slice of the backend API so the E2E
 * suite can run without a live backend. Only used in tests; production
 * code never imports this module.
 *
 * Returns a no-op when E2E_LIVE is set so a single test file can be
 * pointed at a real backend without conditional imports.
 */
export async function installMockApi(page: Page, opts: { portal?: 'super_admin' | 'isp' | 'tenant' | 'public' } = {}): Promise<void> {
    if (E2E_LIVE) return;
    // A single matcher covers both /api/v1/* and any other API path. The
    // handler is permissive so future endpoints don't need fixture changes.
    await page.route('**/api/**', (route: Route) => handleApi(route, opts.portal));
}

function handleApi(route: Route, _portal?: 'super_admin' | 'isp' | 'tenant' | 'public'): Promise<void> {
    const url = route.request().url();
    const method = route.request().method();
    const path = new URL(url).pathname;

    // Auth
    if (path.endsWith('/auth/me/') || path.endsWith('/saas/auth/me/')) {
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'e2e-1', username: 'e2e', role: 'ADMIN', permissions: ['*'] }),
        });
    }
    if (path.endsWith('/auth/login/') || path.endsWith('/saas/auth/login/')) {
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                token: 'mock-token',
                user: { id: 'e2e-1', username: 'e2e', email: 'e2e@x.test' },
                tenant: { id: 't-1', name: 'Acme', slug: 'acme' },
            }),
        });
    }
    if (path.endsWith('/auth/logout/') || path.endsWith('/saas/auth/logout/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (path.endsWith('/auth/password-reset/') || path.endsWith('/saas/auth/password-reset/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ detail: 'ok' }) });
    }
    if (path.endsWith('/tenants/resolve/acme/')) {
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 't-1', slug: 'acme', name: 'Acme', is_active: true }),
        });
    }

    // Generic paginated list — used for every read endpoint the test
    // navigates to. Returns 3 items so the table renders without
    // empty/loading flicker.
    if (method === 'GET') {
        const items = sampleItems(path);
        // sampleItems can return either an array (for paginated lists) or
        // a single object (for /me/, /overview/, /my-tenants/, etc.). When
        // it returns an object, send it as-is.
        const body = Array.isArray(items)
            ? { count: items.length, results: items, items }
            : items;
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(body),
        });
    }
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true }),
        });
    }
    return route.continue();
}

function sampleItems(path: string): unknown {
    // Order matters: more specific paths first.
    if (path.includes('customer-subscriptions')) {
        return [
            { id: 's1', package_name: 'Basic', customer_name: 'Alice', service_identifier: 'ppp-1', status: 'active' },
            { id: 's2', package_name: 'Standard', customer_name: 'Bob', service_identifier: 'ppp-2', status: 'expired' },
        ];
    }
    if (path.endsWith('/customers/') || /\/customers\/?$/.test(path) || path.includes('/customers?')) {
        return [
            { id: 'c1', customer_code: 'C0001', full_name: 'Alice', mobile: '01710000001', status: 'active' },
            { id: 'c2', customer_code: 'C0002', full_name: 'Bob', mobile: '01710000002', status: 'active' },
            { id: 'c3', customer_code: 'C0003', full_name: 'Carol', mobile: '01710000003', status: 'inactive' },
        ];
    }
    if (path.includes('/invoices')) {
        return [
            { id: 'i1', invoice_no: 'INV-001', total_payable: 1200, status: 'PAID' },
            { id: 'i2', invoice_no: 'INV-002', total_payable: 950, status: 'UNPAID' },
            { id: 'i3', invoice_no: 'INV-003', total_payable: 1500, status: 'OVERDUE' },
        ];
    }
    if (path.includes('/payments')) {
        return [
            { id: 'p1', amount: 1200, status: 'succeeded' },
            { id: 'p2', amount: 950, status: 'pending' },
        ];
    }
    if (path.includes('/packages')) {
        return [
            { id: 'pk1', name: 'Basic 5Mbps', regular_price: 500, is_active: true },
            { id: 'pk2', name: 'Standard 10Mbps', regular_price: 800, is_active: true },
        ];
    }
    if (path.includes('/subscriptions') || path.includes('/subscription')) {
        return [
            { id: 's1', package_name: 'Basic', status: 'active' },
            { id: 's2', package_name: 'Standard', status: 'expired' },
        ];
    }
    if (path.includes('/routers')) {
        return [{ id: 'r1', name: 'MikroTik-1', host: '10.0.0.1', status: 'online' }];
    }
    if (path.includes('/olts')) {
        return [{ id: 'o1', name: 'OLT-1', model: 'V1600G', status: 'online' }];
    }
    if (path.includes('/branches')) {
        return [{ id: 'b1', name: 'Main Branch' }];
    }
    if (path.includes('/audit-logs')) {
        return [{ id: 'a1', action: 'login', user: 'admin', created_at: '2025-01-01T00:00:00Z' }];
    }
    if (path.includes('/backups')) {
        return [{ id: 'bk1', backup_type: 'full', status: 'completed', size_bytes: 1048576 }];
    }
    if (path.includes('/employees')) {
        return [{ id: 'e1', full_name: 'Eve', email: 'eve@x.test', role: 'ADMIN', is_active: true }];
    }
    if (path.includes('/domains')) {
        return [
            { id: 'd1', domain: 'acme.example.com', is_active: true, is_primary: true, ssl_active: true },
            { id: 'd2', domain: 'acme-isp.net', is_active: false, is_primary: false, ssl_active: false },
        ];
    }
    if (path.includes('/requests')) {
        return [
            { id: 'r1', company_name: 'New ISP', email: 'new@isp.test', status: 'pending' },
        ];
    }
    if (path.includes('/child-tenants')) {
        return [
            { id: 'ct1', name: 'Acme ISP', slug: 'acme', plan: 'pro', is_active: true },
            { id: 'ct2', name: 'Fastnet', slug: 'fastnet', plan: 'basic', is_active: true },
        ];
    }
    if (path.includes('/tenants')) {
        return [
            { id: 't1', name: 'Acme ISP', slug: 'acme', plan: 'pro', is_active: true },
            { id: 't2', name: 'Fastnet', slug: 'fastnet', plan: 'basic', is_active: true },
        ];
    }
    if (path.includes('/resellers')) {
        return [{ id: 'r1', username: 'r1', full_name: 'Reseller One', wallet_balance: 5000 }];
    }
    if (path.includes('/modules')) {
        return [{ id: 'm1', key: 'billing', name: 'Billing', is_active: true }];
    }
    if (path.includes('/notifications')) {
        return [{ id: 'n1', title: 'New payment received', read: false }];
    }
    if (path.includes('/my-tenants') || path.includes('/auth/my-tenants')) {
        return {
            count: 1,
            items: [
                { id: 't1', name: 'Acme', slug: 'acme', role: 'ADMIN', plan: 'pro', is_active: true, tenant_url: 'http://acme.example.com' },
            ],
            is_isp_admin: true,
        };
    }
    if (path.includes('/features/me') || path.includes('/feature-matrix')) {
        return { features: {}, modules: {} };
    }
    if (path.includes('/overview') || path.includes('/dashboard')) {
        return {
            total_customers: 0,
            active_subscriptions: 0,
            mrr: 0,
            total_due: 0,
            recent_payments: [],
        };
    }
    return [];
}

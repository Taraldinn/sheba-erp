/**
 * Smoke test that the reseller portal screens mount and render
 * without crashing.
 *
 * The full data-binding paths are covered by the backend
 * integration tests in `apps/authentication/test_*stage*.py`.
 * This test only pins the screen entry points so a future
 * refactor that breaks a screen is caught here.
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

beforeAll(() => {
    // jsdom does not provide matchMedia by default.
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
});

vi.mock('@/api/client', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        saasApi: {
            ...actual.saasApi,
            me: vi.fn().mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' }),
            getTenants: vi.fn().mockResolvedValue([]),
        },
        tenantApi: {
            ...actual.tenantApi,
            me: vi.fn().mockResolvedValue(null),
        },
        ispPackageApi: {
            list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        },
    };
});

vi.mock('@/api/reseller-api', () => ({
    resellerApi: {
        profile: vi.fn().mockResolvedValue({
            id: 'r1', business_name: 'Acme Reseller', is_active: true,
            wallet_balance: '0', credit_limit: '0', commission_rate: '0',
            tenant: 't1', user: 1, contact_phone: '', contact_email: '',
            address: '', created_at: '', updated_at: '',
        }),
        wallet: vi.fn().mockResolvedValue({
            reseller_id: 'r1', business_name: 'Acme Reseller', is_active: true,
            cached_balance: '0', computed_balance: '0', balances_match: true,
            credit_limit: '0', totals: { credit: '0', debit: '0', commission: '0', refund: '0' },
            as_of: '',
        }),
        credit: vi.fn().mockResolvedValue({
            reseller_id: 'r1', has_facility: false, credit_limit: '0',
        }),
        customers: vi.fn().mockResolvedValue({ count: 0, results: [] }),
        holds: vi.fn().mockResolvedValue({ count: 0, results: [] }),
        collections: vi.fn().mockResolvedValue({ count: 0, results: [] }),
        ledger: vi.fn().mockResolvedValue({ count: 0, results: [] }),
    },
}));

import { ThemeProvider } from '@/providers/theme-provider';
import { PortalProvider } from '@/portal/portal-provider';
import { AuthProvider } from '@/portal/auth-provider';
import { ResellerOverviewScreen } from '@/pages/isp/reseller';
import { ResellerWalletScreen } from '@/pages/isp/reseller/wallet';
import { ResellerHoldsScreen } from '@/pages/isp/reseller/holds';
import { ResellerCustomersScreen } from '@/pages/isp/reseller/customers';
import { ResellerCollectionsScreen } from '@/pages/isp/reseller/collections';
import { ResellerPurchaseScreen } from '@/pages/isp/reseller/purchase';

const renderAt = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
            <PortalProvider>
                <AuthProvider>
                    <Routes>
                        <Route path="/resellers" element={<ResellerOverviewScreen />} />
                        <Route path="/resellers/wallet" element={<ResellerWalletScreen />} />
                        <Route path="/resellers/holds" element={<ResellerHoldsScreen />} />
                        <Route path="/resellers/customers" element={<ResellerCustomersScreen />} />
                        <Route path="/resellers/collections" element={<ResellerCollectionsScreen />} />
                        <Route path="/resellers/customers/:id/purchase" element={<ResellerPurchaseScreen mode="purchase" />} />
                        <Route path="/resellers/customers/:id/renew" element={<ResellerPurchaseScreen mode="renew" />} />
                    </Routes>
                </AuthProvider>
            </PortalProvider>
        </ThemeProvider>
    </MemoryRouter>,
);

describe('Reseller portal screens', () => {
    it('overview screen renders and shows the reseller business name', async () => {
        renderAt('/resellers');
        await waitFor(() => {
            expect(screen.getByText(/Acme Reseller/)).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('wallet screen renders', async () => {
        renderAt('/resellers/wallet');
        await waitFor(() => {
            expect(screen.getByText(/Wallet & Credit/)).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('holds screen renders', async () => {
        renderAt('/resellers/holds');
        await waitFor(() => {
            expect(screen.getByText(/Wallet holds/)).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('customers screen renders', async () => {
        renderAt('/resellers/customers');
        await waitFor(() => {
            expect(screen.getByText(/Assigned customers/)).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('collections screen renders', async () => {
        renderAt('/resellers/collections');
        await waitFor(() => {
            expect(screen.getByText(/^Collections/)).toBeTruthy();
        }, { timeout: 3000 });
    });
});

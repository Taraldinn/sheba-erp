/**
 * Smoke test that the reseller portal routes mount and render
 * inside the ISP_ADMIN portal tree.
 *
 * The full data-binding paths are covered by the backend
 * integration tests in `apps/authentication/test_*stage*.py`.
 * This test only pins the frontend route table so a future
 * refactor that drops a route is caught here.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

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
    };
});

vi.mock('@/api/reseller-api', () => ({
    resellerApi: {
        profile: vi.fn().mockResolvedValue({
            id: 'r1', business_name: 'Acme', is_active: true,
            wallet_balance: '0', credit_limit: '0', commission_rate: '0',
            tenant: 't1', user: 1, contact_phone: '', contact_email: '',
            address: '', created_at: '', updated_at: '',
        }),
        wallet: vi.fn().mockResolvedValue({
            reseller_id: 'r1', business_name: 'Acme', is_active: true,
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

vi.mock('@/api/customer-portal-api', () => ({
    customerPortalApi: {
        profile: vi.fn(), packages: vi.fn(), invoices: vi.fn(),
    },
}));

import { ThemeProvider } from '@/providers/theme-provider';
import { PortalProvider } from '@/portal/portal-provider';
import { PlaneProvider } from '@/providers/plane-provider';
import { AuthProvider } from '@/portal/auth-provider';
import { RouteProvider } from '@/providers/router-provider';

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
                <PlaneProvider>
                    <AuthProvider>
                        <RouteProvider>
                            <Routes>
                                <Route path="/resellers" element={<ResellerOverviewScreen />} />
                                <Route path="/resellers/wallet" element={<ResellerWalletScreen />} />
                                <Route path="/resellers/holds" element={<ResellerHoldsScreen />} />
                                <Route path="/resellers/customers" element={<ResellerCustomersScreen />} />
                                <Route path="/resellers/collections" element={<ResellerCollectionsScreen />} />
                                <Route path="/resellers/customers/:id/purchase" element={<ResellerPurchaseScreen mode="purchase" />} />
                                <Route path="/resellers/customers/:id/renew" element={<ResellerPurchaseScreen mode="renew" />} />
                            </Routes>
                        </RouteProvider>
                    </AuthProvider>
                </PlaneProvider>
            </PortalProvider>
        </PortalProvider>
    </MemoryRouter>,
);

describe('Reseller portal routes', () => {
    it('renders the overview screen at /resellers', async () => {
        renderAt('/resellers');
        // Loading spinner shows briefly, then the resolved content.
        // The mock above returns a valid profile, so we expect the
        // "Acme" business name to appear.
        expect(await screen.findByText(/Acme/)).toBeTruthy();
    });

    it('renders the wallet screen at /resellers/wallet', async () => {
        renderAt('/resellers/wallet');
        expect(await screen.findByText(/Wallet & Credit/)).toBeTruthy();
    });

    it('renders the holds screen at /resellers/holds', async () => {
        renderAt('/resellers/holds');
        expect(await screen.findByText(/Wallet holds/)).toBeTruthy();
    });

    it('renders the customers screen at /resellers/customers', async () => {
        renderAt('/resellers/customers');
        expect(await screen.findByText(/Assigned customers/)).toBeTruthy();
    });

    it('renders the collections screen at /resellers/collections', async () => {
        renderAt('/resellers/collections');
        expect(await screen.findByText(/Collections/)).toBeTruthy();
    });
});

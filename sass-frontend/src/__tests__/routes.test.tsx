import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { RouteProvider } from '@/providers/router-provider';
import { PortalProvider } from '@/portal/portal-provider';
import { PlaneProvider } from '@/providers/plane-provider';
import { AppLayout } from '@/layouts/app-layout';
import { LoginScreen } from '@/pages/auth/login';
import { DashboardScreen } from '@/pages/saas/dashboard';
import { TenantsScreen } from '@/pages/saas/tenants';
import { DomainsScreen } from '@/pages/saas/domains';
import { OnboardingScreen } from '@/pages/saas/onboarding';
import { PackagesScreen } from '@/pages/saas/packages';
import { SubscriptionsScreen } from '@/pages/saas/subscriptions';
import { PaymentsScreen } from '@/pages/saas/payments';
import { BackupsScreen } from '@/pages/saas/backups';
import { AuditLogsScreen } from '@/pages/saas/audit-logs';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    saasApi: {
      ...actual.saasApi,
      login: vi.fn(),
      me: vi.fn().mockResolvedValue({ name: 'Admin User', email: 'admin@sheba.app' }),
      getDashboardOverview: vi.fn().mockResolvedValue({}),
      getTenants: vi.fn().mockResolvedValue([]),
      getDomains: vi.fn().mockResolvedValue([]),
      getOnboardingRequests: vi.fn().mockResolvedValue([]),
      getPackages: vi.fn().mockResolvedValue([]),
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getPayments: vi.fn().mockResolvedValue([]),
      getBackups: vi.fn().mockResolvedValue([]),
      getAuditLogs: vi.fn().mockResolvedValue([]),
    },
    tenantApi: {
      ...actual.tenantApi,
      login: vi.fn(),
      logout: vi.fn(),
    },
  };
});

import { ThemeProvider } from '@/providers/theme-provider';
import { AuthProvider } from '@/portal/auth-provider';

const renderWithRouter = (initialRoute: string) => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <ThemeProvider>
        <PortalProvider>
          <PlaneProvider>
            <AuthProvider>
              <RouteProvider>
                <Routes>
                  <Route path="/login" element={<LoginScreen />} />
                  <Route path="/" element={<AppLayout />}>
                      <Route index element={<DashboardScreen />} />
                      <Route path="tenants" element={<TenantsScreen />} />
                      <Route path="domains" element={<DomainsScreen />} />
                      <Route path="onboarding" element={<OnboardingScreen />} />
                      <Route path="packages" element={<PackagesScreen />} />
                      <Route path="subscriptions" element={<SubscriptionsScreen />} />
                      <Route path="payments" element={<PaymentsScreen />} />
                      <Route path="backups" element={<BackupsScreen />} />
                      <Route path="audit-logs" element={<AuditLogsScreen />} />
                  </Route>
                </Routes>
              </RouteProvider>
            </AuthProvider>
          </PlaneProvider>
        </PortalProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
};

describe('SaaS Admin Routes', () => {
  beforeAll(() => {
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

  beforeEach(() => {
    localStorage.setItem('sheba_dev_portal_override', 'SUPER_ADMIN');
    localStorage.setItem('saas_central_token', 'mock_token_for_tests');
    localStorage.setItem('saas_central_user', JSON.stringify({
        id: 'admin',
        username: 'admin',
        email: 'admin@sheba.app',
        name: 'Admin User',
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN'],
        permissions: ['*'],
    }));
  });

  it('renders login screen', () => {
    localStorage.removeItem('saas_central_token');
    renderWithRouter('/login');
    expect(screen.getByText(/Sign in/i)).toBeDefined();
  });

  it('renders dashboard overview screen', () => {
    renderWithRouter('/');
    expect(screen.getAllByText(/Platform Overview|Dashboard/i).length).toBeGreaterThan(0);
  });

  it('renders tenants screen', () => {
    renderWithRouter('/tenants');
    expect(screen.getAllByText(/Tenants|ISP/i).length).toBeGreaterThan(0);
  });

  it('renders domains screen', () => {
    renderWithRouter('/domains');
    expect(screen.getAllByText(/Domains/i).length).toBeGreaterThan(0);
  });

  it('renders onboarding requests screen', () => {
    renderWithRouter('/onboarding');
    expect(screen.getAllByText(/Onboarding/i).length).toBeGreaterThan(0);
  });

  it('renders packages screen', () => {
    renderWithRouter('/packages');
    expect(screen.getAllByText(/Packages|Plans/i).length).toBeGreaterThan(0);
  });

  it('renders subscriptions screen', () => {
    renderWithRouter('/subscriptions');
    expect(screen.getAllByText(/Subscriptions/i).length).toBeGreaterThan(0);
  });

  it('renders payments screen', () => {
    renderWithRouter('/payments');
    expect(screen.getAllByText(/Payments|Revenue/i).length).toBeGreaterThan(0);
  });

  it('renders backups screen', () => {
    renderWithRouter('/backups');
    expect(screen.getAllByText(/Backups|Disaster Recovery/i).length).toBeGreaterThan(0);
  });

  it('renders audit logs screen', () => {
    renderWithRouter('/audit-logs');
    expect(screen.getAllByText(/Audit Logs/i).length).toBeGreaterThan(0);
  });
});

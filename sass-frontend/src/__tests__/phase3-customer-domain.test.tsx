import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { ThemeProvider } from '@/providers/theme-provider';
import { PortalProvider } from '@/portal/portal-provider';
import { CustomersScreen } from '@/pages/isp/customers';
import { CustomerDetailScreen } from '@/pages/isp/customers/detail';
import { PackagesScreen } from '@/pages/isp/packages';
import { SubscriptionsScreen } from '@/pages/isp/subscriptions';
import { InvoicesScreen } from '@/pages/isp/invoices';
import {
  customerApi,
  serviceApi,
  subscriptionApi,
  invoiceApi,
  paymentApi,
  ispPackageApi,
} from '@/api/client';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    customerApi: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      archive: vi.fn(),
    },
    serviceApi: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      activate: vi.fn(),
      suspend: vi.fn(),
      resume: vi.fn(),
      terminate: vi.fn(),
    },
    subscriptionApi: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      activate: vi.fn(),
      suspend: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      renew: vi.fn(),
    },
    ispPackageApi: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      syncToRouters: vi.fn(),
    },
    invoiceApi: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      issue: vi.fn(),
      void: vi.fn(),
      pay: vi.fn(),
    },
    paymentApi: {
      list: vi.fn(),
    },
  };
});

describe('Phase 3 - Customer → Service → Subscription ISP Admin Screens', () => {
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
    vi.clearAllMocks();
    (customerApi.list as any).mockResolvedValue({
      items: [
        {
          id: 'cust-101',
          customer_code: 'CUS-2026-0001',
          full_name: 'Rahim Telecom',
          email: 'rahim@example.com',
          mobile: '+8801700000001',
          pppoe_username: 'rahim_telecom',
          status: 'Active',
          monthly_bill: 1200,
          due_amount: 0,
          created_at: '2026-10-01T10:00:00Z',
        },
      ],
      total: 1,
    });
    (ispPackageApi.list as any).mockResolvedValue({
      items: [
        {
          id: 'pkg-1',
          name: 'Home 20M Starter',
          speed_mbps: 20,
          upload_speed_mbps: 20,
          regular_price: 600,
          validity_days: 30,
          is_active: true,
          mikrotik_profile: '20M_PROFILE',
        },
      ],
      total: 1,
    });
    (subscriptionApi.list as any).mockResolvedValue({
      items: [
        {
          id: 'sub-99',
          customer: 'cust-101',
          customer_name: 'Anika Enterprise',
          customer_code: 'CUS-0099',
          service_identifier: 'static_ip_anika',
          package_name: 'Corporate 100M',
          billing_cycle: 'MONTHLY',
          price: 5000,
          status: 'ACTIVE',
          next_billing_date: '2026-11-01',
          created_at: '2026-10-01T10:00:00Z',
        },
      ],
      total: 1,
    });
    (invoiceApi.list as any).mockResolvedValue({
      items: [
        {
          id: 'inv-888',
          invoice_no: 'INV-2026-0888',
          customer: 'cust-101',
          customer_name: 'Delta Corp',
          customer_username: 'deltacorp',
          total_payable: 2500,
          paid_amount: 0,
          status: 'ISSUED',
          billing_month: 'October 2026',
          created_at: '2026-10-01T10:00:00Z',
        },
      ],
      total: 1,
    });
    (customerApi.get as any).mockResolvedValue({
      id: 'cust-101',
      customer_code: 'CUS-2026-0001',
      full_name: 'Rahim Telecom',
      email: 'rahim@example.com',
      mobile: '+8801700000001',
      pppoe_username: 'rahim_telecom',
      address: 'House 12, Road 4, Banani, Dhaka',
      status: 'Active',
      services_count: 1,
      created_at: '2026-10-01T10:00:00Z',
    });
    (serviceApi.list as any).mockResolvedValue({
      items: [
        {
          id: 'svc-1',
          customer: 'cust-101',
          service_identifier: 'dhaka_line_01',
          service_type: 'BROADBAND',
          status: 'ACTIVE',
          monthly_price: 1200,
          package_name: 'Home Ultra 50M',
          created_at: '2026-10-01T10:00:00Z',
        },
      ],
      total: 1,
    });
    (paymentApi.list as any).mockResolvedValue({ items: [], total: 0 });
  });

  it('renders Customers list and opens customer creation modal', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <PortalProvider>
            <CustomersScreen />
          </PortalProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Customers & Subscribers')).toBeDefined();

    // Verify Create Customer modal trigger
    const addBtn = screen.getByRole('button', { name: /Add Customer/i });
    expect(addBtn).toBeDefined();
    fireEvent.pointerDown(addBtn);
    fireEvent.pointerUp(addBtn);
    fireEvent.click(addBtn);
  });

  it('renders Customer Details with header and tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/customers/cust-101']}>
        <ThemeProvider>
          <PortalProvider>
            <Routes>
              <Route path="/customers/:id" element={<CustomerDetailScreen />} />
            </Routes>
          </PortalProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Rahim Telecom')).toBeDefined();
    });

    // Check tabs are available
    expect(screen.getByRole('button', { name: /Profile & Overview/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Services/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Subscriptions/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Invoices/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Payments/i })).toBeDefined();

    // Switch to Services tab
    const servicesTab = screen.getByRole('button', { name: /Services/i });
    fireEvent.click(servicesTab);
    expect(screen.getByText('Customer Services')).toBeDefined();
    expect(screen.getByRole('button', { name: /Add Service/i })).toBeDefined();
  });

  it('renders Packages page with action buttons and modal trigger', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <PortalProvider>
            <PackagesScreen />
          </PortalProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Service Packages & Tariffs')).toBeDefined();
    const createPkgBtn = screen.getByRole('button', { name: /Create Package/i });
    expect(createPkgBtn).toBeDefined();
  });

  it('renders Subscriptions screen with filters and table', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <PortalProvider>
            <SubscriptionsScreen />
          </PortalProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Customer Subscriptions')).toBeDefined();
    expect(screen.getByText('All Statuses')).toBeDefined();
  });

  it('renders Invoices screen with status filters and headers', async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <PortalProvider>
            <InvoicesScreen />
          </PortalProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Invoices & Billing')).toBeDefined();
    expect(screen.getByText('All Statuses')).toBeDefined();
    expect(screen.getByText('Unpaid / Due')).toBeDefined();
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock browser globals for Node test environment
class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] || null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const localStorageMock = new LocalStorageMock();
let documentCookieMock = '';
const eventListeners: Record<string, Array<(e: any) => void>> = {};

(global as any).localStorage = localStorageMock;
(global as any).window = {
  localStorage: localStorageMock,
  location: { hostname: 'fardin.shebafi.com', href: 'http://fardin.shebafi.com:3000' },
  addEventListener: (event: string, cb: any) => {
    eventListeners[event] = eventListeners[event] || [];
    eventListeners[event].push(cb);
  },
  removeEventListener: (event: string, cb: any) => {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event].filter((f) => f !== cb);
    }
  },
  dispatchEvent: (e: any) => {
    const listeners = eventListeners[e.type] || [];
    listeners.forEach((fn) => fn(e));
    return true;
  },
};
(global as any).document = {
  get cookie() {
    return documentCookieMock;
  },
  set cookie(val: string) {
    const [pair] = val.split(';');
    const [k, v] = pair.split('=');
    const existing = documentCookieMock ? documentCookieMock.split('; ') : [];
    const filtered = existing.filter((item) => !item.startsWith(`${k.trim()}=`));
    if (val.includes('max-age=0')) {
      documentCookieMock = filtered.join('; ');
    } else {
      filtered.push(`${k.trim()}=${v.trim()}`);
      documentCookieMock = filtered.join('; ');
    }
  },
};

import { TokenStorage } from '../auth/token-storage';
import { ApiClient } from '../api';

describe('STAGE 11A — ACTIVE ISP CORE API SUITE', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorageMock.clear();
    documentCookieMock = '';
    TokenStorage.clearStoredAuth();
    TokenStorage.setStoredToken('test-isp-token-123', 'tenant', 'shebafi');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    TokenStorage.clearStoredAuth();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Session Persistence & Token Attachment
  // ─────────────────────────────────────────────────────────────
  describe('1. Session Persistence & Authentication Headers', () => {
    it('attaches Bearer/Token and X-Tenant-ID headers to outbound requests', () => {
      const headers = ApiClient.getHeaders();
      assert.equal(headers['Authorization'], 'Token test-isp-token-123');
      assert.equal(headers['X-Tenant-ID'], 'shebafi');
      assert.equal(headers['Content-Type'], 'application/json');
    });

    it('clears stored authentication and tenant session on sign out', () => {
      TokenStorage.clearStoredAuth();
      assert.equal(TokenStorage.getStoredToken(), null);
      assert.equal(TokenStorage.getStoredTenantId(), null);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Customers API & Security (PPPoE Password Redaction)
  // ─────────────────────────────────────────────────────────────
  describe('2. Customers Management & Security', () => {
    it('retrieves customer list with search and status query parameters', async () => {
      global.fetch = (async (url: string | URL, init?: RequestInit) => {
        const urlStr = url.toString();
        assert.ok(urlStr.includes('/api/v1/customers/'));
        assert.ok(urlStr.includes('search=Rahim'));
        assert.ok(urlStr.includes('status=Active'));
        assert.equal((init?.headers as Record<string, string>)['Authorization'], 'Token test-isp-token-123');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            count: 1,
            results: [
              {
                id: 'cust-uuid-1',
                customer_code: 'CUST-001',
                full_name: 'Rahim Ahmed',
                mobile: '01711223344',
                pppoe_username: 'rahim_home',
                package_name: 'Fiber 20M',
                monthly_bill: '800.00',
                due_amount: '0.00',
                status: 'Active',
              },
            ],
          }),
        } as Response;
      }) as any;

      const customers = await ApiClient.getCustomers({ search: 'Rahim', status: 'Active' });
      assert.equal(customers.length, 1);
      assert.equal(customers[0].full_name, 'Rahim Ahmed');
      assert.equal((customers[0] as any).pppoe_password, undefined); // Password NEVER exposed
    });

    it('creates customer with validated payload and without returning pppoe_password', async () => {
      let sentBody: any = null;

      global.fetch = (async (url: string | URL, init?: RequestInit) => {
        sentBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'new-cust-uuid',
            customer_code: 'CUST-002',
            full_name: sentBody.full_name,
            mobile: sentBody.mobile,
            pppoe_username: sentBody.pppoe_username,
            status: 'Active',
            monthly_bill: sentBody.monthly_bill,
          }),
        } as Response;
      }) as any;

      const newCustomer = await ApiClient.createCustomer({
        full_name: 'Karim Ullah',
        mobile: '01811223344',
        pppoe_username: 'karim_net',
        monthly_bill: 600 as any,
      });

      assert.equal(sentBody.full_name, 'Karim Ullah');
      assert.equal(sentBody.pppoe_username, 'karim_net');
      assert.equal(newCustomer.id, 'new-cust-uuid');
      assert.equal((newCustomer as any).pppoe_password, undefined);
    });

    it('toggles internet service on/off for subscriber', async () => {
      let calledUrl = '';
      let calledBody: any = null;

      global.fetch = (async (url: string | URL, init?: RequestInit) => {
        calledUrl = url.toString();
        calledBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'success', internet: calledBody.state }),
        } as Response;
      }) as any;

      const res = await ApiClient.toggleInternet('cust-123', 'off');
      assert.ok(calledUrl.includes('/api/v1/customers/cust-123/toggle-internet/'));
      assert.equal(calledBody.state, 'off');
      assert.equal(res.status, 'success');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Billing & Invoices & Recharges
  // ─────────────────────────────────────────────────────────────
  describe('3. Billing, Invoices & Recharges Operations', () => {
    it('retrieves invoices mapping authoritative serializer fields', async () => {
      global.fetch = (async (url: string | URL) => {
        assert.ok(url.toString().includes('/api/v1/invoices/'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            count: 1,
            results: [
              {
                id: 'inv-uuid-1',
                invoice_no: 'INV-2026-0001',
                customer_name: 'Rahim Ahmed',
                customer_username: 'rahim_home',
                package_name: 'Fiber 20M',
                total_payable: '800.00',
                paid_amount: '800.00',
                due_amount: '0.00',
                status: 'Paid',
                due_date: '2026-09-30',
              },
            ],
          }),
        } as Response;
      }) as any;

      const invoices = await ApiClient.getInvoices();
      assert.equal(invoices.length, 1);
      const inv = invoices[0];
      assert.equal(inv.invoice_no, 'INV-2026-0001');
      assert.equal(inv.customer_name, 'Rahim Ahmed');
      assert.equal(inv.total_payable, '800.00');
      assert.equal(inv.status, 'Paid');
    });

    it('retrieves recharge history from /api/v1/recharges/', async () => {
      global.fetch = (async (url: string | URL) => {
        assert.ok(url.toString().includes('/api/v1/recharges/'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            count: 1,
            results: [
              {
                id: 'rec-1',
                customer_name: 'Rahim Ahmed',
                amount: '800.00',
                validity_days: 30,
                payment_method: 'Cash',
                transaction_id: 'TRX-9988',
              },
            ],
          }),
        } as Response;
      }) as any;

      const recharges = await ApiClient.getRecharges();
      assert.equal(recharges.length, 1);
      assert.equal(recharges[0].amount, '800.00');
      assert.equal(recharges[0].payment_method, 'Cash');
    });

    it('executes subscriber recharge via POST /api/v1/customers/{id}/recharge/', async () => {
      let rechargeUrl = '';
      let rechargeBody: any = null;

      global.fetch = (async (url: string | URL, init?: RequestInit) => {
        rechargeUrl = url.toString();
        rechargeBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            customer_id: 'cust-123',
            amount: rechargeBody.amount,
            new_expiry: '2026-10-30',
          }),
        } as Response;
      }) as any;

      const result = await ApiClient.createRecharge({
        customer_id: 'cust-123',
        amount: 800,
        validity_days: 30,
        payment_method: 'bKash',
      });

      assert.ok(rechargeUrl.includes('/api/v1/customers/cust-123/recharge/'));
      assert.equal(rechargeBody.amount, 800);
      assert.equal(rechargeBody.payment_method, 'bKash');
      assert.equal(result.success, true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Packages Management
  // ─────────────────────────────────────────────────────────────
  describe('4. Broadband Packages Management', () => {
    it('fetches packages from live API endpoint /api/v1/packages/', async () => {
      global.fetch = (async (url: string | URL) => {
        assert.ok(url.toString().includes('/api/v1/packages/'));
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'pkg-1',
              name: 'Giga Home 25M',
              speed_mbps: 25,
              regular_price: 800,
              is_active: true,
              subscribers_count: 42,
            },
          ],
        } as Response;
      }) as any;

      const pkgs = await ApiClient.getPackages();
      assert.equal(pkgs.length, 1);
      assert.equal(pkgs[0].name, 'Giga Home 25M');
      assert.equal(pkgs[0].speed_mbps, 25);
    });

    it('creates package via POST /api/v1/packages/', async () => {
      global.fetch = (async (url: string | URL, init?: RequestInit) => {
        assert.ok(url.toString().includes('/api/v1/packages/'));
        const body = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'new-pkg', ...body }),
        } as Response;
      }) as any;

      const created = await ApiClient.createPackage({
        name: 'Turbo 50M',
        speed_mbps: 50,
        regular_price: 1200,
      });

      assert.equal(created.name, 'Turbo 50M');
      assert.equal(created.speed_mbps, 50);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Network Routers & User Sessions
  // ─────────────────────────────────────────────────────────────
  describe('5. Network Routers & Live Sessions', () => {
    it('retrieves network router devices from /api/v1/routers/', async () => {
      global.fetch = (async (url: string | URL) => {
        assert.ok(url.toString().includes('/api/v1/routers/'));
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'rtr-1',
              name: 'Core-CCR1036',
              ip_address: '10.0.0.1',
              status: 'Online',
              is_active: true,
            },
          ],
        } as Response;
      }) as any;

      const routers = await ApiClient.getRouters();
      assert.equal(routers.length, 1);
      assert.equal(routers[0].name, 'Core-CCR1036');
      assert.equal(routers[0].status, 'Online');
    });

    it('executes router connectivity test via test-connection endpoint', async () => {
      global.fetch = (async (url: string | URL) => {
        assert.ok(url.toString().includes('/api/v1/routers/rtr-1/test-connection/'));
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'success', latency_ms: 2.4, message: 'Connected' }),
        } as Response;
      }) as any;

      const testResult = await ApiClient.testRouterConnection('rtr-1');
      assert.equal(testResult.status, 'success');
      assert.equal(testResult.latency_ms, 2.4);
    });

    it('fetches live PPPoE sessions from /api/v1/user-sessions/', async () => {
      global.fetch = (async (url: string | URL) => {
        assert.ok(url.toString().includes('/api/v1/user-sessions/'));
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 'sess-1',
              username: 'tanvir_home',
              ip_address: '100.64.0.12',
              uptime: '2d 4h 12m',
              mac_address: 'AA:BB:CC:DD:EE:FF',
            },
          ],
        } as Response;
      }) as any;

      const sessions = await ApiClient.getUserSessions();
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].username, 'tanvir_home');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Support Tickets
  // ─────────────────────────────────────────────────────────────
  describe('6. Support Tickets & Replies', () => {
    it('retrieves ticket queue from /api/v1/tickets/', async () => {
      global.fetch = (async (url: string | URL) => {
        assert.ok(url.toString().includes('/api/v1/tickets/'));
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 't-101',
              ticket_number: 'TCK-1001',
              subject: 'Optical loss high',
              status: 'Open',
              priority: 'High',
            },
          ],
        } as Response;
      }) as any;

      const tickets = await ApiClient.getTickets();
      assert.equal(tickets.length, 1);
      assert.equal(tickets[0].subject, 'Optical loss high');
      assert.equal(tickets[0].status, 'Open');
    });

    it('posts reply to support ticket', async () => {
      let replyBody: any = null;
      global.fetch = (async (url: string | URL, init?: RequestInit) => {
        assert.ok(url.toString().includes('/api/v1/tickets/t-101/reply/'));
        replyBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: replyBody.message }),
        } as Response;
      }) as any;

      const res = await ApiClient.replyTicket('t-101', 'Lineman dispatched to site');
      assert.equal(replyBody.message, 'Lineman dispatched to site');
      assert.equal(res.success, true);
    });
  });
});

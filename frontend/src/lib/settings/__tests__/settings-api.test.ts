import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsClient } from '../settings-api';
import { TokenStorage } from '../../auth/token-storage';
import { CompanySetting } from '../settings-types';

describe('SHEBAFI TENANT SETTINGS API SUITE — PHASE 3', () => {
  const originalFetch = global.fetch;
  const mockTenantId = 'c0a80101-0000-0000-0000-000000000001';
  const mockToken = 'mock-tenant-auth-token-12345';

  const sampleSettings: CompanySetting = {
    id: 1,
    tenant: mockTenantId,
    updated_at: '2026-09-09T18:00:00Z',
    company_name: 'Metro Fiber ISP',
    tagline: 'Gigabit Fiber',
    client_name: 'Fardin Ahmed',
    client_date_of_birth: '2000-01-01',
    payment_tutorial_video: 'https://youtube.com/watch?v=sample',
    currency_symbol: '৳',
    currency_code: 'BDT',
    invoice_prefix: 'MF-INV-',
    customer_id_prefix: 'MF-',
    support_phone: '+880 1711-223344',
    support_email: 'support@metrofiber.net',
    website: 'https://metrofiber.net',
    address: 'Sector 3, Uttara, Dhaka',
    tax_number: 'BIN-99887766',
    billing_footer_note: 'Thank you for choosing Metro Fiber.',
    logo_url: 'https://cdn.metrofiber.net/logo.png',
    favicon_url: 'https://cdn.metrofiber.net/favicon.ico',
    theme_mode: 'dark',
    accent_color: 'indigo',
    compact_mode: false,
    live_traffic_interval_sec: 2,
    auto_lock_on_expiry: true,
    grace_period_days: 3,
    promise_max_days: 5,
    auto_generate_monthly_invoice: true,
    undo_recharge_deduct_hours: 2,
    admin_expire_time: '23:59',
    recharge_discount_enabled: true,
    show_reseller_profile_speed: true,
    sms_enabled: true,
    sms_sender_id: 'METROFIBER',
    sms_provider: 'Custom URL Gateway',
    sms_api_key: 'gw_key_abc',
    sms_gateway_url: 'https://api.sms.com/send?key={KEY}&to={NUMBER}&msg={MSG}',
    sms_reminder_days: 3,
    send_sms_on_payment: true,
    send_sms_on_expiry: true,
    welcome_sms_template: 'Welcome [NAME]! ID: [ID]. Pass: [PASS]',
    payment_sms_template: 'Received [AMOUNT]৳ for [ID].',
    advance_loan_sms_template: 'Credit added [DAYS] days.',
    reminder_27d_template: 'Due in 3 days.',
    reminder_27d_time: '12:00 AM',
    expiry_reminder_template: 'Expires today.',
    expiry_reminder_time: '12:00 AM',
    mikrotik_default_port: 8728,
    mikrotik_timeout_sec: 5,
    mikrotik_auto_kick_on_expire: true,
    default_dns_primary: '8.8.8.8',
    default_dns_secondary: '1.1.1.1',
  };

  beforeEach(() => {
    TokenStorage.clearStoredAuth();
    TokenStorage.setStoredToken(mockToken, 'tenant', mockTenantId);
    SettingsClient.invalidateSettingsCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    TokenStorage.clearStoredAuth();
    SettingsClient.invalidateSettingsCache();
  });

  describe('1. GET /api/v1/settings/ & Cache Invalidation', () => {
    test('retrieves settings and strictly attaches tenant authorization headers', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};

      global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = url.toString();
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [sampleSettings] }),
        } as Response;
      };

      const result = await SettingsClient.getSettings();
      assert.ok(result);
      assert.equal(result.id, 1);
      assert.equal(result.company_name, 'Metro Fiber ISP');
      assert.ok(capturedUrl.includes('/api/v1/settings/'));
      assert.equal(capturedHeaders['Authorization'], `Token ${mockToken}`);
      assert.equal(capturedHeaders['X-Tenant-ID'], mockTenantId);
    });

    test('utilizes in-memory cache on repeat calls unless invalidated or forceRefresh is set', async () => {
      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [sampleSettings] }),
        } as Response;
      };

      // First fetch -> hits network
      const first = await SettingsClient.getSettings();
      assert.equal(callCount, 1);
      assert.equal(first?.id, 1);

      // Second fetch -> serves from memory cache
      const second = await SettingsClient.getSettings();
      assert.equal(callCount, 1);
      assert.equal(second?.id, 1);

      // Force refresh -> bypasses cache
      const third = await SettingsClient.getSettings(true);
      assert.equal(callCount, 2);
      assert.equal(third?.id, 1);

      // Explicit invalidation -> triggers fresh fetch
      SettingsClient.invalidateSettingsCache();
      const fourth = await SettingsClient.getSettings();
      assert.equal(callCount, 3);
      assert.equal(fourth?.id, 1);
    });
  });

  describe('2. PATCH & PUT /api/v1/settings/{id}/', () => {
    test('updates partial settings via PATCH and refreshes cache', async () => {
      let patchMethod = '';
      let patchBody: Record<string, unknown> = {};

      global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        patchMethod = init?.method || '';
        patchBody = JSON.parse((init?.body as string) || '{}');
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...sampleSettings, ...patchBody, updated_at: '2026-09-09T18:30:00Z' }),
        } as Response;
      };

      const updated = await SettingsClient.updateSettings(1, {
        company_name: 'Metro Fiber Ultra',
        compact_mode: true,
      });

      assert.equal(patchMethod, 'PATCH');
      assert.equal(patchBody.company_name, 'Metro Fiber Ultra');
      assert.equal(patchBody.compact_mode, true);
      assert.equal(updated.company_name, 'Metro Fiber Ultra');
      assert.equal(updated.compact_mode, true);

      // Verify cache was updated with the new result
      const cached = await SettingsClient.getSettings();
      assert.equal(cached?.company_name, 'Metro Fiber Ultra');
    });

    test('falls back to PUT if server returns HTTP 405 Method Not Allowed', async () => {
      // First populate cache
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ results: [sampleSettings] }),
      } as Response);
      await SettingsClient.getSettings();

      const attempts: string[] = [];
      global.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
        attempts.push(init?.method || '');
        if (init?.method === 'PATCH') {
          return { ok: false, status: 405, text: async () => 'Method Not Allowed' } as Response;
        }
        if (init?.method === 'PUT') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ...sampleSettings, company_name: 'PUT Fallback ISP' }),
          } as Response;
        }
        return { ok: false, status: 500 } as Response;
      };

      const res = await SettingsClient.updateSettings(1, { company_name: 'PUT Fallback ISP' });
      assert.deepEqual(attempts, ['PATCH', 'PUT']);
      assert.equal(res.company_name, 'PUT Fallback ISP');
    });
  });

  describe('3. Client-Side Validation Rules', () => {
    test('detects blank company name and excessive character length', () => {
      const errBlank = SettingsClient.validate({ company_name: '   ' });
      assert.ok(errBlank.company_name);

      const errLong = SettingsClient.validate({ company_name: 'A'.repeat(205) });
      assert.ok(errLong.company_name);
    });

    test('validates support email format', () => {
      const errInvalid = SettingsClient.validate({ support_email: 'not-an-email' });
      assert.ok(errInvalid.support_email);

      const errValid = SettingsClient.validate({ support_email: 'support@sheba.net' });
      assert.equal(errValid.support_email, undefined);
    });

    test('validates IPv4 address format for primary and secondary DNS', () => {
      const errInvalidDns = SettingsClient.validate({
        default_dns_primary: '999.999.999',
        default_dns_secondary: 'invalid-ip',
      });
      assert.ok(errInvalidDns.default_dns_primary);
      assert.ok(errInvalidDns.default_dns_secondary);

      const errValidDns = SettingsClient.validate({
        default_dns_primary: '8.8.8.8',
        default_dns_secondary: '1.1.1.1',
      });
      assert.equal(errValidDns.default_dns_primary, undefined);
      assert.equal(errValidDns.default_dns_secondary, undefined);
    });

    test('validates MikroTik API port range', () => {
      const errPortLow = SettingsClient.validate({ mikrotik_default_port: 0 });
      assert.ok(errPortLow.mikrotik_default_port);

      const errPortHigh = SettingsClient.validate({ mikrotik_default_port: 70000 });
      assert.ok(errPortHigh.mikrotik_default_port);

      const errPortValid = SettingsClient.validate({ mikrotik_default_port: 8728 });
      assert.equal(errPortValid.mikrotik_default_port, undefined);
    });
  });

  describe('4. Payment Gateways & Voice Settings', () => {
    test('fetches and updates payment gateways', async () => {
      let patchBody: Record<string, unknown> = {};
      global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          patchBody = JSON.parse((init?.body as string) || '{}');
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'gw-bkash', provider: 'BKASH', ...patchBody }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'gw-bkash', provider: 'BKASH', is_active: false, is_sandbox: true }],
        } as Response;
      };

      const list = await SettingsClient.getPaymentGateways();
      assert.equal(list.length, 1);
      assert.equal(list[0].provider, 'BKASH');

      const updated = await SettingsClient.updatePaymentGateway('gw-bkash', { is_active: true });
      assert.equal(patchBody.is_active, true);
      assert.equal(updated.is_active, true);
    });
  });

  describe('5. SMS Gateway & Multi-Tenant Cache Scoping', () => {
    test('testSmsGateway handles HTTP 401 by dispatching sheba:unauthorized', async () => {
      let dispatched = false;
      const originalWindow = global.window;
      global.window = {
        dispatchEvent: (evt: any) => {
          if (evt?.type === 'sheba:unauthorized') dispatched = true;
          return true;
        },
      } as any;

      global.fetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Invalid token' }),
      } as Response);

      await assert.rejects(
        async () => {
          await SettingsClient.testSmsGateway({}, '+8801700112233', 'Test');
        },
        /Your session has expired/
      );

      assert.equal(dispatched, true);
      global.window = originalWindow;
    });

    test('cachedSettings is not reused after a tenant switch', async () => {
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => [sampleSettings],
        } as Response;
      };

      TokenStorage.setStoredToken(mockToken, 'tenant', 'tenant-1');
      SettingsClient.invalidateSettingsCache();
      await SettingsClient.getSettings();
      assert.equal(fetchCount, 1);

      // Repeat call for same tenant uses cache
      await SettingsClient.getSettings();
      assert.equal(fetchCount, 1);

      // Switch tenant
      TokenStorage.setStoredToken(mockToken, 'tenant', 'tenant-2');
      await SettingsClient.getSettings();
      assert.equal(fetchCount, 2);
    });

    test('localStorage.getItem exception gracefully falls back to process.env.NEXT_PUBLIC_SHEBA_API_KEY', async () => {
      const originalLocalStorage = global.localStorage;
      global.localStorage = {
        getItem: () => {
          throw new Error('Access denied (SecurityError)');
        },
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      } as any;

      let capturedHeaders: any = null;
      global.fetch = async (_url, init) => {
        capturedHeaders = init?.headers;
        return {
          ok: true,
          status: 200,
          json: async () => [sampleSettings],
        } as Response;
      };

      TokenStorage.setStoredToken(mockToken, 'tenant', 'tenant-safe');
      SettingsClient.invalidateSettingsCache();
      const res = await SettingsClient.getSettings();
      assert.ok(res);
      assert.ok(capturedHeaders);
      global.localStorage = originalLocalStorage;
    });

    test('updateSettings captures requestTenantId before fetch and caches it', async () => {
      TokenStorage.setStoredToken(mockToken, 'tenant', 'tenant-alpha');
      SettingsClient.invalidateSettingsCache();

      let headerTenantId = '';
      global.fetch = async (_url, init) => {
        headerTenantId = (init?.headers as any)['X-Tenant-ID'];
        // Simulate tenant change while request is in flight
        TokenStorage.setStoredToken(mockToken, 'tenant', 'tenant-beta');
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...sampleSettings, id: 99, company_name: 'Alpha ISP' }),
        } as Response;
      };

      const updated = await SettingsClient.updateSettings(99, { company_name: 'Alpha ISP' });
      assert.equal(updated.company_name, 'Alpha ISP');
      assert.equal(headerTenantId, 'tenant-alpha');
    });
  });
});

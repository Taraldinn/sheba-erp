/**
 * Coverage for the customer welcome-credential flow on the frontend
 * ApiClient + the new resend endpoint.
 *
 *   - createCustomer returns the customer object (including the new
 *     ``welcome`` block the backend now produces).
 *   - resendCustomerWelcome posts to the right path and parses
 *     the response.
 *   - 403 from the backend surfaces as a clear error.
 */
import { test, describe, after, mock, before } from 'node:test';
import assert from 'node:assert';

// Polyfill window.localStorage for TokenStorage (which reads it at
// module-import time in some code paths).
const store: Record<string, string> = {};
const fakeLocalStorage = {
  store,
  getItem(k: string) { return k in store ? store[k] : null; },
  setItem(k: string, v: string) { store[k] = String(v); },
  removeItem(k: string) { delete store[k]; },
  clear() { for (const k of Object.keys(store)) delete store[k]; },
  key(i: number) { return Object.keys(store)[i] ?? null; },
  length: 0,
};
(globalThis as any).window = (globalThis as any).window ?? {};
(globalThis as any).window.localStorage = fakeLocalStorage;
(globalThis as any).localStorage = fakeLocalStorage;
(globalThis as any).window.location = {
  hostname: 'exportnet.shebafi.xyz',
  href: 'https://exportnet.shebafi.xyz/',
  origin: 'https://exportnet.shebafi.xyz',
  pathname: '/',
  search: '',
  hash: '',
};

// Force the dev API base so the existing customer-welcome tests
// continue to assert against ``http://localhost:8000/api/v1``. The
// tenant-url-resolver tests cover the subdomain-derived path.
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000/api/v1';

import { ApiClient } from '../api';

const ORIGINAL_FETCH = global.fetch;
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

after(() => { global.fetch = ORIGINAL_FETCH; });

describe('ApiClient — customer welcome credentials', () => {
  before(() => {
    // Seed a token so getHeaders() returns the auth header.
    ApiClient.setToken('test-token');
  });

  test('createCustomer returns the parsed customer object (incl. welcome block)', async () => {
    const fakeCustomer = {
      id: 'cust-1',
      customer_code: 'CUST-001',
      full_name: 'Acme ISP Test',
      mobile: '+8801711000000',
      email: 'a@b.com',
      pppoe_username: 'pppoe-1',
      pppoe_password: 'x',
      portal_password: 'pbkdf2_y',
      welcome: {
        enabled: true,
        issued: { username: 'pppoe-1', password: 'ABCD-12xyz', regenerated: false },
        dispatch: {
          sent_via: ['sms', 'email'],
          skipped: [],
          sms_log_id: 'log-1',
          email_to: 'a@b.com',
        },
      },
    };
    let capturedUrl = '';
    let capturedInit: any;
    global.fetch = mock.fn(async (url: string, init?: any) => {
      capturedUrl = url;
      capturedInit = init;
      return { ok: true, status: 201, json: async () => fakeCustomer };
    }) as any;

    const created = await ApiClient.createCustomer({
      full_name: 'Acme ISP Test',
      mobile: '+8801711000000',
      email: 'a@b.com',
      pppoe_username: 'pppoe-1',
    });

    assert.strictEqual(capturedUrl, `${BASE}/customers/`);
    assert.strictEqual(capturedInit.method, 'POST');
    assert.strictEqual(JSON.parse(capturedInit.body).full_name, 'Acme ISP Test');
    assert.strictEqual(created.id, 'cust-1');
    assert.strictEqual(created.welcome?.issued?.username, 'pppoe-1');
    assert.strictEqual(created.welcome?.issued?.password, 'ABCD-12xyz');
    assert.deepStrictEqual(created.welcome?.dispatch?.sent_via, ['sms', 'email']);
  });

  test('resendCustomerWelcome posts to the new resend endpoint', async () => {
    let capturedUrl = '';
    let capturedInit: any;
    global.fetch = mock.fn(async (url: string, init?: any) => {
      capturedUrl = url;
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          issued: { username: 'pppoe-1', password: 'NEW1-23abc', regenerated: true },
          dispatch: {
            sent_via: ['sms'],
            skipped: [],
            sms_log_id: 'log-2',
            email_to: '',
          },
        }),
      };
    }) as any;

    const result = await ApiClient.resendCustomerWelcome('cust-1', true);

    assert.strictEqual(capturedUrl, `${BASE}/customers/cust-1/resend-welcome/`);
    assert.strictEqual(capturedInit.method, 'POST');
    const body = JSON.parse(capturedInit.body);
    assert.strictEqual(body.rotate, true);
    assert.strictEqual(result.issued?.regenerated, true);
    assert.strictEqual(result.dispatch?.sent_via[0], 'sms');
  });

  test('resendCustomerWelcome defaults to rotate=false when omitted', async () => {
    let capturedInit: any;
    global.fetch = mock.fn(async (_url: string, init?: any) => {
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          issued: null,
          dispatch: { sent_via: ['sms', 'email'], sms_log_id: 'log-3', email_to: 'x@y' },
        }),
      };
    }) as any;

    await ApiClient.resendCustomerWelcome('cust-2');
    const body = JSON.parse(capturedInit.body);
    assert.strictEqual(body.rotate, false);
  });

  test('resendCustomerWelcome surfaces backend error messages cleanly', async () => {
    global.fetch = mock.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Permission denied: customer.update required.' }),
    }) as any) as any;

    await assert.rejects(
      () => ApiClient.resendCustomerWelcome('cust-3', false),
      (err: Error) => /Permission denied/.test(err.message),
    );
  });
});

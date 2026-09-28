/**
 * Coverage for the AuthError diagnostic payload — making sure the
 * request URL, raw response body, status code and backend error code
 * ride through the network call so the operator-facing error panel
 * has something useful to show.
 *
 * These used to be dropped on the floor (the AuthError constructor
 * only took message / code / status), so a user looking at "Invalid
 * username or password" had no idea whether the request even reached
 * the backend. The diagnostic panel added in this PR changes that.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert';

// Polyfill window/localStorage so TokenStorage can boot.
const lsStore: Record<string, string> = {};
const fakeLS = {
  store: lsStore,
  getItem(k: string) { return k in lsStore ? lsStore[k] : null; },
  setItem(k: string, v: string) { lsStore[k] = String(v); },
  removeItem(k: string) { delete lsStore[k]; },
  clear() { for (const k of Object.keys(lsStore)) delete lsStore[k]; },
  key(i: number) { return Object.keys(lsStore)[i] ?? null; },
  length: 0,
};
(globalThis as any).window = (globalThis as any).window ?? {};
(globalThis as any).window.localStorage = fakeLS;
(globalThis as any).localStorage = fakeLS;
(globalThis as any).window.location = {
  hostname: 'exportnet.shebafi.xyz',
  href: 'https://exportnet.shebafi.xyz/',
  origin: 'https://exportnet.shebafi.xyz',
  pathname: '/',
  search: '',
  hash: '',
};

// Use the same dev API override as the rest of the suite so we
// don't accidentally exercise the hostname-derived URL branch.
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000/api/v1';

import { AuthService } from '../auth-service';
import { AuthError } from '../auth-types';

const ORIGINAL_FETCH = global.fetch;
after(() => { global.fetch = ORIGINAL_FETCH; });

function makeErrorResponse(body: string | object, status = 401): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: false,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'Error',
    json: async () => (typeof body === 'string' ? JSON.parse(body || '{}') : body),
    text: async () => text,
    clone() { return this; },
  } as any;
}

describe('AuthService — diagnostic payload on login errors', () => {
  test('captures request URL + status + raw body on 401', async () => {
    global.fetch = (async () =>
      makeErrorResponse({ error: 'Invalid username or password', code: 'INVALID_CREDENTIALS' }, 401)) as any;

    await assert.rejects(
      () =>
        AuthService.login(
          { username: 'exportnet_admin', password: 'wrong' },
          'tenant',
          'exportnet',
        ),
      (err: AuthError) => {
        assert.strictEqual(err.code, 'INVALID_CREDENTIALS');
        assert.strictEqual(err.status, 401);
        assert.ok(err.requestUrl && err.requestUrl.endsWith('/api/v1/auth/login/'),
          `requestUrl should end with /auth/login/, got ${err.requestUrl}`);
        assert.ok(
          err.rawBody && err.rawBody.includes('Invalid username or password'),
          `rawBody should include server message, got ${err.rawBody}`,
        );
        return true;
      },
    );
  });

  test('maps backend code + status into a typed AuthError', async () => {
    global.fetch = (async () =>
      makeErrorResponse({ error: 'Cross-tenant login blocked', code: 'CROSS_TENANT_LOGIN' }, 403)) as any;

    await assert.rejects(
      () =>
        AuthService.login(
          { username: 'someone', password: 'pw' },
          'tenant',
          'wrongslug',
        ),
      (err: AuthError) => {
        assert.strictEqual(err.code, 'CROSS_TENANT_LOGIN');
        assert.strictEqual(err.status, 403);
        return true;
      },
    );
  });

  test('returns NETWORK_ERROR when fetch itself rejects', async () => {
    global.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as any;

    await assert.rejects(
      () =>
        AuthService.login(
          { username: 'x', password: 'y' },
          'tenant',
          'exportnet',
        ),
      (err: AuthError) => {
        assert.strictEqual(err.code, 'NETWORK_ERROR');
        assert.ok(err.requestUrl && err.requestUrl.includes('/auth/login/'));
        return true;
      },
    );
  });

  test('preserves availableTenants from the TENANT_SELECTION_REQUIRED shape', async () => {
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        requires_tenant_selection: true,
        message: 'Pick a tenant',
        available_tenants: [
          { id: 't1', name: 'ExportNet', slug: 'exportnet' },
          { id: 't2', name: 'Mula ISP', slug: 'mula' },
        ],
      }),
      clone() { return this; },
      text: async () => '',
    })) as any;

    await assert.rejects(
      () =>
        AuthService.login(
          { username: 'superadmin', password: 'pw' },
          'tenant',
          undefined,
        ),
      (err: AuthError) => {
        assert.strictEqual(err.code, 'TENANT_SELECTION_REQUIRED');
        assert.ok(Array.isArray(err.availableTenants));
        assert.strictEqual(err.availableTenants?.length, 2);
        return true;
      },
    );
  });

  test('falls back to status-based code when backend omits it', async () => {
    // The legacy auth path used to return 401 + plain text body
    // ("Unauthorized"). We should still classify it correctly so the
    // diagnostic panel can show INVALID_CREDENTIALS, not UNKNOWN.
    global.fetch = (async () => makeErrorResponse('Unauthorized', 401)) as any;
    await assert.rejects(
      () =>
        AuthService.login(
          { username: 'x', password: 'y' },
          'tenant',
          'exportnet',
        ),
      (err: AuthError) => {
        assert.strictEqual(err.code, 'INVALID_CREDENTIALS');
        return true;
      },
    );
  });

  test('truncates very long raw response bodies so the UI stays sane', async () => {
    const hugeHtml = '<html>' + 'X'.repeat(4000) + '</html>';
    global.fetch = (async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => { throw new SyntaxError('not JSON'); },
      text: async () => hugeHtml,
      clone() { return this; },
    })) as any;

    await assert.rejects(
      () =>
        AuthService.login(
          { username: 'x', password: 'y' },
          'tenant',
          'exportnet',
        ),
      (err: AuthError) => {
        assert.strictEqual(err.status, 502);
        assert.ok(err.rawBody && err.rawBody.length <= 650,
          `rawBody should be truncated, got ${err.rawBody?.length}`);
        assert.ok(err.rawBody?.endsWith('…'),
          `truncated body should end with ellipsis, got ${err.rawBody?.slice(-5)}`);
        return true;
      },
    );
  });
});

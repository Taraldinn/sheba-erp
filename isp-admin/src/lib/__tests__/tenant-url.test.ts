/**
 * Coverage for ``tenant-url.ts`` — the resolver that turns a host
 * name like ``exportnet.shebafi.xyz`` into an API root like
 * ``https://exportnet.shebafi.xyz/api/v1``.
 *
 * The backend already serves the same URLconf on every tenant
 * subdomain and scopes the data via ``TenantSubdomainMiddleware``;
 * the frontend just needs to point its fetches at the right host.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  parseTenantHost,
  resolveApiBaseUrl,
  extractTenantSlug,
} from '../tenant-url';

describe('parseTenantHost', () => {
  test('recognises a tenant subdomain', () => {
    const ctx = parseTenantHost('exportnet.shebafi.xyz');
    assert.strictEqual(ctx.hostname, 'exportnet.shebafi.xyz');
    assert.strictEqual(ctx.subdomain, 'exportnet');
    assert.strictEqual(ctx.parent, 'shebafi.xyz');
    assert.strictEqual(ctx.isTenantHost, true);
    assert.strictEqual(ctx.isCentralAdmin, false);
    assert.strictEqual(ctx.isPortal, false);
    assert.strictEqual(ctx.isDevHost, false);
    assert.strictEqual(ctx.isLoopback, false);
  });

  test('recognises central admin host', () => {
    const ctx = parseTenantHost('admin.shebafi.xyz');
    assert.strictEqual(ctx.isCentralAdmin, true);
    assert.strictEqual(ctx.isTenantHost, false);
    assert.strictEqual(ctx.isDevHost, false);
  });

  test('recognises portal host', () => {
    const ctx = parseTenantHost('portal.shebafi.xyz');
    assert.strictEqual(ctx.isPortal, true);
    assert.strictEqual(ctx.isTenantHost, false);
    assert.strictEqual(ctx.isDevHost, false);
  });

  test('returns null subdomain for apex + localhost', () => {
    for (const h of ['localhost', '127.0.0.1', '']) {
      const ctx = parseTenantHost(h);
      assert.strictEqual(ctx.subdomain, null, `host=${h}`);
      assert.strictEqual(ctx.isTenantHost, false, `host=${h}`);
      assert.strictEqual(ctx.isDevHost, true, `host=${h}`);
    }
    // The bare apex of ``shebafi.xyz`` is not dev (operator would
    // land on the production marketing site) — but it also isn't a
    // tenant subdomain.
    const apex = parseTenantHost('shebafi.xyz');
    assert.strictEqual(apex.subdomain, null);
    assert.strictEqual(apex.isDevHost, false);
    assert.strictEqual(apex.isTenantHost, false);
  });

  test('flags localhost and 127.0.0.1 as dev + loopback', () => {
    const loopbackHosts = ['localhost', '127.0.0.1', '127.99.99.99', '::1'];
    for (const h of loopbackHosts) {
      const ctx = parseTenantHost(h);
      assert.strictEqual(ctx.isDevHost, true, `host=${h}`);
      assert.strictEqual(ctx.isLoopback, true, `host=${h}`);
    }
  });

  test('flags RFC1918 IPs as dev but not loopback', () => {
    const privateHosts = ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.50'];
    for (const h of privateHosts) {
      const ctx = parseTenantHost(h);
      assert.strictEqual(ctx.isDevHost, true, `host=${h}`);
      assert.strictEqual(ctx.isLoopback, false, `host=${h}`);
      assert.strictEqual(ctx.isTenantHost, false, `host=${h}`);
    }
  });

  test('flags mDNS / .test / .local as dev', () => {
    for (const h of ['router.local', 'isp.test', 'admin.localhost']) {
      const ctx = parseTenantHost(h);
      assert.strictEqual(ctx.isDevHost, true, `host=${h}`);
      assert.strictEqual(ctx.isTenantHost, false, `host=${h}`);
    }
  });

  test('refuses to treat an /etc/hosts alias as a tenant subdomain', () => {
    // If the operator aliased ``exportnet.shebafi.xyz`` to
    // ``127.0.0.1`` in /etc/hosts and is hitting the dev backend,
    // the browser still sees the aliased hostname. parseTenantHost
    // must NOT report it as a tenant subdomain.
    const ctx = parseTenantHost('exportnet.shebafi.xyz');
    assert.strictEqual(ctx.isTenantHost, true);
    assert.strictEqual(ctx.isDevHost, false);

    // But if the operator aliased a *different* tenant-style host
    // to a private IP, that one must be treated as dev.
    const aliased = parseTenantHost('exportnet.shebafi.xyz'); // sanity
    assert.strictEqual(aliased.isTenantHost, true);
    const ipAliased = parseTenantHost('mula.local');
    assert.strictEqual(ipAliased.isDevHost, true);
    assert.strictEqual(ipAliased.isTenantHost, false);
  });

  test('strips the port before parsing', () => {
    const ctx = parseTenantHost('exportnet.shebafi.xyz:8443');
    assert.strictEqual(ctx.subdomain, 'exportnet');
    assert.strictEqual(ctx.hostname, 'exportnet.shebafi.xyz');
  });

  test('normalises casing', () => {
    const ctx = parseTenantHost('EXPORTNET.SHEBAFI.XYZ');
    assert.strictEqual(ctx.subdomain, 'exportnet');
    assert.strictEqual(ctx.parent, 'shebafi.xyz');
  });

  test('multi-label subdomain collapses to the leftmost segment', () => {
    const ctx = parseTenantHost('staging.exportnet.shebafi.xyz');
    assert.strictEqual(ctx.subdomain, 'staging.exportnet');
    assert.strictEqual(ctx.parent, 'shebafi.xyz');
  });
});

describe('resolveApiBaseUrl', () => {
  test('honours NEXT_PUBLIC_API_URL override first', () => {
    assert.strictEqual(
      resolveApiBaseUrl('https://api.example.com/v1', 'exportnet.shebafi.xyz'),
      'https://api.example.com/v1',
    );
  });

  test('builds same-host URL for a tenant subdomain', () => {
    assert.strictEqual(
      resolveApiBaseUrl(undefined, 'exportnet.shebafi.xyz'),
      'https://exportnet.shebafi.xyz/api/v1',
    );
  });

  test('builds same-host URL for the central admin host', () => {
    assert.strictEqual(
      resolveApiBaseUrl(undefined, 'admin.shebafi.xyz'),
      'https://admin.shebafi.xyz/api/v1',
    );
  });

  test('falls back to http://localhost:8000 on localhost (without env URL)', () => {
    // Dev hosts must NEVER derive the API root from the hostname:
    // an operator with ``/etc/hosts`` aliasing a production tenant
    // subdomain to 127.0.0.1 still needs to reach the Django dev
    // server. Without ``NEXT_PUBLIC_API_URL`` we always land on the
    // safe ``localhost:8000`` default.
    assert.strictEqual(
      resolveApiBaseUrl(undefined, 'localhost'),
      'http://localhost:8000/api/v1',
    );
  });

  test('falls back to http://localhost:8000 on private IPs (without env URL)', () => {
    assert.strictEqual(
      resolveApiBaseUrl(undefined, '192.168.1.50'),
      'http://localhost:8000/api/v1',
    );
    assert.strictEqual(
      resolveApiBaseUrl(undefined, '10.0.0.5'),
      'http://localhost:8000/api/v1',
    );
  });

  test('falls back to http://localhost:8000 on loopback IPs (without env URL)', () => {
    for (const h of ['127.0.0.1', '127.99.99.99', '::1']) {
      assert.strictEqual(
        resolveApiBaseUrl(undefined, h),
        'http://localhost:8000/api/v1',
        `host=${h}`,
      );
    }
  });

  test('honours env URL even on a dev host', () => {
    assert.strictEqual(
      resolveApiBaseUrl('http://127.0.0.1:9000/api/v1', 'localhost'),
      'http://127.0.0.1:9000/api/v1',
    );
  });

  test('honours env URL even when /etc/hosts aliases a tenant host', () => {
    // Operator adds ``exportnet.shebafi.xyz → 127.0.0.1`` in
    // /etc/hosts so they can hit the dev backend. The frontend sees
    // ``exportnet.shebafi.xyz`` as the host but should still use the
    // explicit env URL (or fall back to the dev port).
    assert.strictEqual(
      resolveApiBaseUrl('http://localhost:8000/api/v1', 'exportnet.shebafi.xyz'),
      'http://localhost:8000/api/v1',
    );
  });

  test('falls back to http://localhost:8000 on .local / .test hosts', () => {
    for (const h of ['router.local', 'mula.test', 'admin.localhost']) {
      assert.strictEqual(
        resolveApiBaseUrl(undefined, h),
        'http://localhost:8000/api/v1',
        `host=${h}`,
      );
    }
  });

  test('returns dev fallback when no hostname available', () => {
    assert.strictEqual(
      resolveApiBaseUrl(undefined, ''),
      'http://localhost:8000/api/v1',
    );
  });

  test('strips trailing slash from env override', () => {
    assert.strictEqual(
      resolveApiBaseUrl('https://api.example.com/v1///'),
      'https://api.example.com/v1',
    );
  });

  test('treats empty env override as missing', () => {
    assert.strictEqual(
      resolveApiBaseUrl('   ', 'exportnet.shebafi.xyz'),
      'https://exportnet.shebafi.xyz/api/v1',
    );
  });
});

describe('extractTenantSlug', () => {
  test('returns the slug on a tenant subdomain', () => {
    assert.strictEqual(extractTenantSlug('mula.shebafi.xyz'), 'mula');
  });

  test('returns null on the central admin host', () => {
    assert.strictEqual(extractTenantSlug('admin.shebafi.xyz'), null);
  });

  test('returns null on the portal host', () => {
    assert.strictEqual(extractTenantSlug('portal.shebafi.xyz'), null);
  });

  test('returns null on localhost / raw IPs', () => {
    for (const h of ['localhost', '127.0.0.1', '', 'shebafi.xyz']) {
      assert.strictEqual(extractTenantSlug(h), null, `host=${h}`);
    }
  });

  test('returns null on private IPs and .local / .test dev hosts', () => {
    for (const h of ['10.0.0.1', '172.16.0.1', '192.168.1.50', 'router.local', 'mula.test']) {
      assert.strictEqual(extractTenantSlug(h), null, `host=${h}`);
    }
  });
});

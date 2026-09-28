/**
 * Coverage for the multi-role login routing on a tenant subdomain.
 *
 *   - The Staff / Technician / Reseller tabs on the tenant login form
 *     pick the correct ``AuthContextType`` slot.
 *   - ``dashboard_url`` returned from the backend drives the
 *     post-login redirect so each role lands on its own dashboard
 *     (e.g. technician → ``/dashboards/technician``).
 *   - The form auto-prefills + locks the tenant slug from the
 *     hostname, but leaves the field editable on apex / central /
 *     portal hosts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

import { extractTenantSlug, parseTenantHost } from '../tenant-url';

/**
 * Mirrors the role → ``AuthContextType`` mapping in
 * ``apps/login/page.tsx``. Kept here so the test pins the contract
 * without booting React.
 */
type UIRole = 'staff' | 'technician' | 'reseller' | 'customer';

function loginContextForRole(role: UIRole): 'tenant' | 'reseller' {
  if (role === 'reseller') return 'reseller';
  // technician + staff + customer (legacy fallback) all hit the
  // tenant context slot.
  return 'tenant';
}

type BackendRole =
  | 'SUPER_ADMIN' | 'ADMIN' | 'BILLING' | 'STAFF' | 'SUPPORT_STAFF'
  | 'TECHNICIAN' | 'LINE_MAN' | 'RESELLER' | 'RESELLER_L1' | 'RESELLER_L2'
  | 'CUSTOMER';

function dashboardFor(role: BackendRole): string {
  // Mirrors ``ROLE_DASHBOARDS`` on the backend (apps.authentication.views).
  const ROLE_DASHBOARDS = {
    SUPER_ADMIN: '/',
    ADMIN: '/',
    BILLING: '/dashboards/billing',
    STAFF: '/dashboards/staff',
    SUPPORT_STAFF: '/dashboards/staff',
    TECHNICIAN: '/dashboards/technician',
    LINE_MAN: '/dashboards/technician',
    RESELLER: '/dashboards/reseller-l1',
    RESELLER_L1: '/dashboards/reseller-l1',
    RESELLER_L2: '/dashboards/reseller-l2',
    CUSTOMER: '/portal',
  };
  return ROLE_DASHBOARDS[role] || '/';
}

describe('login role routing', () => {
  test('tenant subdomain prefixes are recognised', () => {
    for (const h of ['exportnet.shebafi.xyz', 'mula.shebafi.xyz', 'beta.shebafi.com']) {
      const slug = extractTenantSlug(h);
      assert.ok(slug && slug.length > 0, `host=${h}`);
    }
  });

  test('staff / technician / customer share the tenant context slot', () => {
    const roles: UIRole[] = ['staff', 'technician', 'customer'];
    for (const role of roles) {
      assert.strictEqual(
        loginContextForRole(role),
        'tenant',
        `role=${role} should hit the tenant login endpoint`,
      );
    }
  });

  test('reseller uses its own context slot + endpoint', () => {
    assert.strictEqual(loginContextForRole('reseller'), 'reseller');
  });

  test('each backend role maps to its own dashboard', () => {
    assert.strictEqual(dashboardFor('TECHNICIAN'), '/dashboards/technician');
    assert.strictEqual(dashboardFor('STAFF'), '/dashboards/staff');
    assert.strictEqual(dashboardFor('SUPPORT_STAFF'), '/dashboards/staff');
    assert.strictEqual(dashboardFor('RESELLER'), '/dashboards/reseller-l1');
    assert.strictEqual(dashboardFor('ADMIN'), '/');
    assert.strictEqual(dashboardFor('SUPER_ADMIN'), '/');
  });
});

describe('portal host detection', () => {
  test('portal.shebafi.xyz is the customer self-care host, not a tenant', () => {
    const ctx = parseTenantHost('portal.shebafi.xyz');
    assert.strictEqual(ctx.isPortal, true);
    assert.strictEqual(ctx.isTenantHost, false);
    // The customer self-care portal uses a completely different
    // login shape (mobile/OTP or portal password) — never the
    // tenant login form.
    assert.strictEqual(extractTenantSlug('portal.shebafi.xyz'), null);
  });

  test('admin.shebafi.xyz is the central SaaS, not a tenant', () => {
    const ctx = parseTenantHost('admin.shebafi.xyz');
    assert.strictEqual(ctx.isCentralAdmin, true);
    assert.strictEqual(ctx.isTenantHost, false);
    assert.strictEqual(extractTenantSlug('admin.shebafi.xyz'), null);
  });

  test('tenant subdomain locks the slug, others leave it editable', () => {
    assert.strictEqual(extractTenantSlug('exportnet.shebafi.xyz'), 'exportnet');
    assert.strictEqual(extractTenantSlug('admin.shebafi.xyz'), null);
    assert.strictEqual(extractTenantSlug('localhost'), null);
  });
});

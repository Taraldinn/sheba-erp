/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage and window for testing
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
(global as any).localStorage = localStorageMock;
(global as any).window = {
  localStorage: localStorageMock,
  location: { hostname: 'admin.shebafi.xyz' },
  dispatchEvent: () => true,
};

import { SaaSClient } from '../saas-api';
import { TokenStorage } from '../auth/token-storage';

describe('SHEBAFI CENTRAL CONTROL PLANE API SUITE — PHASE 2', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorageMock.clear();
    TokenStorage.setStoredToken('test-control-plane-token-123', 'central_admin');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. SaaS Dashboard Overview & Telemetry', () => {
    it('fetches global cluster overview metrics', async () => {
      const mockOverview = {
        cluster_name: 'Production Primary Cluster',
        cluster_status: 'Active & Healthy',
        sla_target: '99.98%',
        telemetry: {
          tenants_total: 12,
          tenants_active: 11,
          subscribers_managed: 45000,
          routers_online: 54,
          routers_total: 56,
          olts_total: 28,
          onus_total: 1420,
          monthly_billing_volume: 38000000,
        },
        financial: {
          monthly_recurring_revenue: 450000,
          annual_run_rate: 5400000,
          total_revenue_collected: 1800000,
          pending_invoices_count: 2,
        },
        fleet: {
          total_pops: 42,
          active_pops: 40,
          total_packages: 5,
        },
        backups: {
          total_backups: 8,
          latest_backup_time: '2026-09-09T18:00:00Z',
          total_storage_mb: 2450,
        },
      };

      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/overview/'));
        assert.equal(opts.headers['Authorization'], 'Token test-control-plane-token-123');
        return new Response(JSON.stringify(mockOverview), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      const result = await SaaSClient.getOverview();
      assert.equal(result.cluster_name, 'Production Primary Cluster');
      assert.equal(result.telemetry.tenants_active, 11);
      assert.equal(result.financial.monthly_recurring_revenue, 450000);
    });
  });

  describe('2. ISP Tenant Partitions & Status Management', () => {
    it('lists tenants with query filters and pagination', async () => {
      const mockTenants = [
        {
          id: 'tenant-uuid-1',
          name: 'Apex Fiber',
          slug: 'apex-fiber',
          is_active: true,
          plan: 'Growth',
          max_subscribers: 2500,
          max_routers: 10,
          subscription_status: 'active',
          subscriber_count: 1200,
          active_subscribers_count: 1150,
        },
      ];

      global.fetch = mock.fn(async (url: any) => {
        assert.ok(String(url).includes('/api/v1/saas/tenants/?search=apex'));
        return new Response(JSON.stringify(mockTenants), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      const res = await SaaSClient.getTenants({ search: 'apex' });
      assert.equal(res.length, 1);
      assert.equal(res[0].name, 'Apex Fiber');
    });

    it('creates a new tenant with initial credentials', async () => {
      const payload = {
        name: 'Metro Link ISP',
        slug: 'metro-link',
        domain: 'metrolink.shebafi.xyz',
        plan: 'Enterprise',
        admin_username: 'metro_admin',
        admin_password: 'Password123!',
      };

      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/tenants/'));
        assert.equal(opts.method, 'POST');
        const body = JSON.parse(opts.body);
        assert.equal(body.slug, 'metro-link');

        return new Response(
          JSON.stringify({
            id: 'new-tenant-uuid',
            ...body,
            is_active: true,
            subscription_status: 'active',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const created = await SaaSClient.createTenant(payload);
      assert.equal(created.id, 'new-tenant-uuid');
      assert.equal(created.slug, 'metro-link');
    });

    it('creates a new tenant unwrapping nested backend response payload', async () => {
      const payload: SaaSTenantCreatePayload = {
        name: 'Delta Fiber',
        slug: 'delta-fiber',
        domain: 'delta.shebafi.xyz',
        plan: 'Starter',
      };

      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/tenants/'));
        assert.equal(opts.method, 'POST');
        return new Response(
          JSON.stringify({
            message: 'Tenant "Delta Fiber" successfully provisioned and onboarded.',
            tenant: {
              id: 'delta-tenant-uuid',
              name: 'Delta Fiber',
              slug: 'delta-fiber',
              is_active: true,
              subscription_status: 'active',
              plan: 'Starter',
            },
            admin_credentials: {
              username: 'delta_admin',
              token: 'tok-xyz',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const created = await SaaSClient.createTenant(payload);
      assert.equal(created.id, 'delta-tenant-uuid');
      assert.equal(created.slug, 'delta-fiber');
      assert.equal(created.is_active, true);
    });

    it('toggles tenant active status', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/tenants/tenant-123/toggle-status/'));
        assert.equal(opts.method, 'POST');
        return new Response(
          JSON.stringify({ status: 'Tenant suspended successfully.', is_active: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const res = await SaaSClient.toggleTenantStatus('tenant-123');
      assert.equal(res.is_active, false);
    });

    it('deletes tenant partition', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/tenants/tenant-123/'));
        assert.equal(opts.method, 'DELETE');
        return new Response(null, { status: 204 });
      }) as any;

      const success = await SaaSClient.deleteTenant('tenant-123');
      assert.equal(success, true);
    });
  });

  describe('3. Domain Routing & DNS Verification', () => {
    it('creates custom domain and toggles verification', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        if (opts.method === 'POST' && String(url).endsWith('/saas/domains/')) {
          return new Response(
            JSON.stringify({
              id: 55,
              tenant: 'tenant-123',
              hostname: 'portal.apex.net',
              is_primary: true,
              verified: false,
              domain_type: 'primary',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        } else if (String(url).includes('/toggle-verify/')) {
          return new Response(
            JSON.stringify({ verified: true, message: 'Domain verified successfully.' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error('Unexpected call');
      }) as any;

      const created = await SaaSClient.createDomain({
        tenant: 'tenant-123',
        hostname: 'portal.apex.net',
        is_primary: true,
      });
      assert.equal(created.hostname, 'portal.apex.net');

      const verified = await SaaSClient.toggleDomainVerify(created.id);
      assert.equal(verified.verified, true);
    });
  });

  describe('4. Tenant Onboarding Requests Queue', () => {
    it('approves an onboarding request and auto-provisions tenant', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/requests/req-999/approve/'));
        assert.equal(opts.method, 'POST');
        return new Response(
          JSON.stringify({
            message: 'Onboarding request approved and tenant partition created.',
            tenant: {
              id: 'new-prov-tenant',
              name: 'Speed Net ISP',
              slug: 'speed-net',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const res = await SaaSClient.approveRequest('req-999');
      assert.equal(res.tenant.slug, 'speed-net');
    });

    it('rejects an onboarding request with reason', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/requests/req-999/reject/'));
        const body = JSON.parse(opts.body);
        assert.equal(body.reason, 'Duplicate registration');
        return new Response(
          JSON.stringify({ status: 'Request rejected.' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const res = await SaaSClient.rejectRequest('req-999', 'Duplicate registration');
      assert.equal(res.status, 'Request rejected.');
    });
  });

  describe('5. SaaS Packages & Tiers', () => {
    it('creates and manages SaaS software tiers', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        if (opts.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: 'pkg-1',
              name: 'Growth ISP',
              code: 'growth',
              monthly_price: 25000,
              max_subscribers: 5000,
              is_active: true,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error('Unexpected');
      }) as any;

      const pkg = await SaaSClient.createPackage({
        name: 'Growth ISP',
        code: 'growth',
        monthly_price: 25000,
        max_subscribers: 5000,
      });
      assert.equal(pkg.name, 'Growth ISP');
      assert.equal(pkg.monthly_price, 25000);
    });
  });

  describe('6. Tenant Subscriptions & Renewals', () => {
    it('renews active subscription', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/subscriptions/sub-1/renew/'));
        assert.equal(opts.method, 'POST');
        return new Response(
          JSON.stringify({
            id: 'sub-1',
            status: 'active',
            next_billing_date: '2026-10-09',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const renewed = await SaaSClient.renewSubscription('sub-1');
      assert.equal(renewed.status, 'active');
      assert.equal(renewed.next_billing_date, '2026-10-09');
    });

    it('cancels tenant subscription', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/subscriptions/sub-1/cancel/'));
        assert.equal(opts.method, 'POST');
        return new Response(
          JSON.stringify({
            id: 'sub-1',
            status: 'cancelled',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const cancelled = await SaaSClient.cancelSubscription('sub-1');
      assert.equal(cancelled.status, 'cancelled');
    });
  });

  describe('7. SaaS Revenue Payments Ledger', () => {
    it('records software licensing payment transaction', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/payments/'));
        assert.equal(opts.method, 'POST');
        const body = JSON.parse(opts.body);
        return new Response(
          JSON.stringify({
            id: 'pay-1',
            ...body,
            status: 'Completed',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const payment = await SaaSClient.createPayment({
        tenant: 'tenant-123',
        amount: 15000,
        payment_method: 'bKash',
        trx_id: 'BK-998877',
      });
      assert.equal(payment.amount, 15000);
      assert.equal(payment.trx_id, 'BK-998877');
    });
  });

  describe('8. Disaster Recovery Snapshots & Restorations', () => {
    it('triggers manual backup and executes restoration', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        if (String(url).includes('/create-backup/')) {
          return new Response(
            JSON.stringify({
              id: 'bk-123',
              backup_name: 'Snapshot 1',
              status: 'completed',
              file_size_bytes: 52428800,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        } else if (String(url).includes('/bk-123/restore/')) {
          return new Response(
            JSON.stringify({ message: 'Database restored successfully.', status: 'completed' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error('Unexpected');
      }) as any;

      const backup = await SaaSClient.createBackup('Snapshot 1');
      assert.equal(backup.backup_name, 'Snapshot 1');

      const restored = await SaaSClient.restoreBackup(backup.id);
      assert.equal(restored.status, 'completed');
    });
  });

  describe('9. SaaS User Directory & Password Reset', () => {
    it('manages software users and resets credentials', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        if (String(url).includes('/reset-password/')) {
          return new Response(
            JSON.stringify({
              message: 'Password reset successful.',
              temporary_password: 'TempPassword456!',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else if (String(url).includes('/toggle-status/')) {
          return new Response(
            JSON.stringify({ is_active: false }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error('Unexpected');
      }) as any;

      const reset = await SaaSClient.resetUserPassword(101);
      assert.equal(reset.temporary_password, 'TempPassword456!');

      const statusToggle = await SaaSClient.toggleUserStatus(101);
      assert.equal(statusToggle.is_active, false);
    });
  });

  describe('10. Central Audit Log Stream', () => {
    it('retrieves and filters central security audit logs', async () => {
      const mockLogs = [
        {
          id: 1,
          actor_username: 'superadmin',
          action: 'TENANT_CREATED',
          module: 'TENANT_MANAGEMENT',
          resource_type: 'Tenant',
          resource_id: 'tenant-123',
          ip_address: '127.0.0.1',
          timestamp: '2026-09-09T20:00:00Z',
        },
      ];

      global.fetch = mock.fn(async (url: any) => {
        assert.ok(String(url).includes('/api/v1/saas/audit-logs/?actor_username=superadmin'));
        return new Response(JSON.stringify(mockLogs), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      const logs = await SaaSClient.getAuditLogs({ actor: 'superadmin' });
      assert.equal(logs.length, 1);
      assert.equal(logs[0].action, 'TENANT_CREATED');
    });
  });
});

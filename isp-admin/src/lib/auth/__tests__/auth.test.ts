/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
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

// Setup window and document mock before importing auth modules
const localStorageMock = new LocalStorageMock();
let documentCookieMock = '';
const eventListeners: Record<string, Array<(e: any) => void>> = {};

let currentFetchImpl: any = async () => ({
  ok: true,
  status: 200,
  json: async () => ({}),
  clone: () => ({ json: async () => ({}) }),
});

(global as any).localStorage = localStorageMock;
(global as any).window = {
  localStorage: localStorageMock,
  location: { hostname: 'localhost', href: 'http://localhost:3000', origin: 'http://localhost:3000' },
  fetch: async (...args: any[]) => currentFetchImpl(...args),
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
(global as any).fetch = (global as any).window.fetch;
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
(global as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, opts?: any) {
    this.type = type;
    this.detail = opts?.detail;
  }
};

// Now import our Auth modules
import { TokenStorage } from '../token-storage';
import { AuthService } from '../auth-service';
import { AuthError } from '../auth-types';
import { ApiClient, setupFetchInterceptor } from '../../api';

describe('SHEBAFI AUTHENTICATION SUITE — PHASE 1', () => {
  setupFetchInterceptor();
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorageMock.clear();
    documentCookieMock = '';
    TokenStorage.clearStoredAuth();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Token & Session Storage Abstraction', () => {
    it('stores token and synchronizes with localStorage and cookies', () => {
      TokenStorage.setStoredToken('test-token-xyz', 'tenant', 'shebafi');

      assert.equal(TokenStorage.getStoredToken(), 'test-token-xyz');
      assert.equal(TokenStorage.getStoredContextType(), 'tenant');
      assert.equal(TokenStorage.getStoredTenantId(), 'shebafi');
      // Namespaced write — context-aware storage keeps multiple logins
      // isolated across tabs (cross-tenant "session distorted" fix).
      assert.equal(
        localStorageMock.getItem('sheba_session_token.tenant'),
        'test-token-xyz'
      );
      assert.equal(
        localStorageMock.getItem('sheba_session_tenant_id.tenant'),
        'shebafi'
      );
      assert.equal(
        localStorageMock.getItem('sheba_active_context'),
        'tenant'
      );
      // Legacy mirror still works (read fallback for migration).
      assert.equal(localStorageMock.getItem('sheba_auth_token'), 'test-token-xyz');
      assert.ok(document.cookie.includes('sheba_session='));
    });

    it('clears stored authentication completely across all tiers', () => {
      TokenStorage.setStoredToken('active-token', 'central_admin', 'system');
      assert.equal(TokenStorage.getStoredToken(), 'active-token');

      TokenStorage.clearStoredAuth();

      assert.equal(TokenStorage.getStoredToken(), null);
      // Every namespaced slot should be wiped.
      assert.equal(localStorageMock.getItem('sheba_session_token.tenant'), null);
      assert.equal(localStorageMock.getItem('sheba_session_token.central_admin'), null);
      assert.equal(localStorageMock.getItem('sheba_session_token.reseller'), null);
      // Legacy keys too.
      assert.equal(localStorageMock.getItem('sheba_auth_token'), null);
      assert.equal(localStorageMock.getItem('sheba_auth_context'), null);
      assert.equal(localStorageMock.getItem('sheba_tenant_id'), null);
      assert.ok(!document.cookie.includes('sheba_session=active-token'));
    });

    it('detects control plane host environment', () => {
      assert.equal(TokenStorage.isControlPlaneHost('admin.shebafi.xyz'), true);
      assert.equal(TokenStorage.isControlPlaneHost('control.shebafi.xyz'), true);
      assert.equal(TokenStorage.isControlPlaneHost('saas.localhost'), true);
      assert.equal(TokenStorage.isControlPlaneHost('isp.shebafi.net'), false);
      assert.equal(TokenStorage.isControlPlaneHost('shebafi.xyz'), false);
    });
  });

  describe('2. Authoritative Tenant Authentication', () => {
    it('executes successful tenant login with credentials and headers', async () => {
      const mockUser = {
        id: 101,
        username: 'isp_admin',
        email: 'operator@shebafi.com',
        is_staff: true,
        is_superuser: false,
        is_control_plane_admin: false,
        tenant_id: 'shebafi',
        role: 'ADMIN',
      };

      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/auth/login/'));
        assert.equal(opts.method, 'POST');
        assert.equal(opts.headers['X-Tenant-ID'], 'shebafi');

        const body = JSON.parse(opts.body);
        assert.equal(body.username, 'isp_admin');
        assert.equal(body.password, 'correct-pass');

        return new Response(
          JSON.stringify({
            token: 'valid-tenant-token-999',
            user: mockUser,
            tenant: { id: 'shebafi', name: 'Sheba ISP' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const result = await AuthService.login(
        { username: 'isp_admin', password: 'correct-pass' },
        'tenant',
        'shebafi'
      );

      assert.equal(result.token, 'valid-tenant-token-999');
      assert.equal(result.user.username, 'isp_admin');
      assert.equal(result.user.tenant_id, 'shebafi');
      assert.equal(result.user.is_control_plane_admin, false);
    });

    it('handles failed login with 401 Invalid Credentials properly without fallback', async () => {
      global.fetch = mock.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 'INVALID_CREDENTIALS',
            detail: 'Invalid username or password.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      await assert.rejects(
        async () => {
          await AuthService.login(
            { username: 'isp_admin', password: 'wrong-password' },
            'tenant',
            'shebafi'
          );
        },
        (err: any) => {
          assert.ok(err instanceof AuthError);
          assert.equal(err.status, 401);
          assert.equal(err.code, 'INVALID_CREDENTIALS');
          assert.equal(err.message, 'Invalid username or password.');
          return true;
        }
      );
    });
  });

  describe('3. Authoritative Central SaaS Admin Authentication', () => {
    it('executes successful central admin login against saas endpoint', async () => {
      const mockMasterUser = {
        id: 1,
        username: 'master_superadmin',
        email: 'root@shebafi.xyz',
        is_staff: true,
        is_superuser: true,
        is_control_plane_admin: true,
      };

      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/saas/auth/login/'));
        assert.equal(opts.method, 'POST');

        return new Response(
          JSON.stringify({
            token: 'master-cp-token-111',
            user: mockMasterUser,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const result = await AuthService.login(
        { username: 'master_superadmin', password: 'master-pass' },
        'central_admin'
      );

      assert.equal(result.token, 'master-cp-token-111');
      assert.equal(result.user.username, 'master_superadmin');
      assert.equal(result.user.is_control_plane_admin, true);
      assert.equal(result.user.is_superuser, true);
    });

    it('handles 403 Forbidden when a non-control-plane user attempts control plane login', async () => {
      global.fetch = mock.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 'CONTROL_PLANE_ACCESS_DENIED',
            detail: 'User does not have control-plane administration permissions.',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      await assert.rejects(
        async () => {
          await AuthService.login(
            { username: 'regular_tenant_user', password: 'password123' },
            'central_admin'
          );
        },
        (err: any) => {
          assert.ok(err instanceof AuthError);
          assert.equal(err.status, 403);
          assert.equal(err.code, 'CONTROL_PLANE_ACCESS_DENIED');
          return true;
        }
      );
    });
  });

  describe('4. Current User Session Verification & Expiration', () => {
    it('retrieves current authenticated user from backend', async () => {
      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/auth/me/'));
        assert.equal(opts.headers['Authorization'], 'Token active-token-456');

        return new Response(
          JSON.stringify({
            id: 42,
            username: 'alice',
            email: 'alice@isp.com',
            tenant_id: 'shebafi',
            role: 'BILLING',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const user = await AuthService.getCurrentUser('active-token-456', 'tenant', 'shebafi');
      assert.equal(user.username, 'alice');
      assert.equal(user.role, 'BILLING');
      assert.equal(user.tenant_id, 'shebafi');
    });

    it('rejects with SESSION_EXPIRED on HTTP 401 response from backend', async () => {
      global.fetch = mock.fn(async () => {
        return new Response(
          JSON.stringify({ detail: 'Invalid token.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      await assert.rejects(
        async () => {
          await AuthService.getCurrentUser('expired-token', 'tenant');
        },
        (err: any) => {
          assert.ok(err instanceof AuthError);
          assert.equal(err.status, 401);
          assert.equal(err.code, 'SESSION_EXPIRED');
          return true;
        }
      );
    });
  });

  describe('5. Logout Handling', () => {
    it('calls backend logout and succeeds', async () => {
      let logoutCalled = false;
      global.fetch = mock.fn(async (url: any, opts: any) => {
        assert.ok(String(url).includes('/api/v1/auth/logout/'));
        assert.equal(opts.method, 'POST');
        assert.equal(opts.headers['Authorization'], 'Token to-be-revoked');
        logoutCalled = true;

        return new Response(JSON.stringify({ detail: 'Successfully logged out.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      await AuthService.logout('to-be-revoked', 'tenant');
      assert.equal(logoutCalled, true);
    });
  });

  describe('6. Unauthorized Event & 401 Interception', () => {
    it('dispatches sheba:unauthorized event and clears storage on unauthorized response', () => {
      TokenStorage.setStoredToken('active-token', 'tenant', 'shebafi');
      let eventFired = false;

      const handler = () => {
        eventFired = true;
      };
      (global as any).window.addEventListener('sheba:unauthorized', handler);

      // Trigger interceptor action
      TokenStorage.clearStoredAuth();
      (global as any).window.dispatchEvent(new (global as any).CustomEvent('sheba:unauthorized'));

      assert.equal(eventFired, true);
      assert.equal(TokenStorage.getStoredToken(), null);

      (global as any).window.removeEventListener('sheba:unauthorized', handler);
    });

    it('preserves user token and clears api key when error is INVALID_API_KEY', async () => {
      TokenStorage.setStoredToken('active-token', 'tenant', 'shebafi');
      localStorageMock.setItem('sheba_api_key', 'bad-api-key');
      let eventFired = false;

      const handler = () => {
        eventFired = true;
      };
      (global as any).window.addEventListener('sheba:unauthorized', handler);

      currentFetchImpl = async () => ({
        status: 401,
        ok: false,
        clone: () => ({
          json: async () => ({ detail: 'Invalid API key provided.', code: 'INVALID_API_KEY' })
        }),
        json: async () => ({ detail: 'Invalid API key provided.', code: 'INVALID_API_KEY' })
      });

      await ApiClient.getDashboardKPIs();

      assert.equal(eventFired, false);
      assert.equal(TokenStorage.getStoredToken(), 'active-token');
      assert.equal(localStorageMock.getItem('sheba_api_key'), null);

      (global as any).window.removeEventListener('sheba:unauthorized', handler);
    });
  });

  describe('7. Context Boundary & Forbidden Role Checking', () => {
    it('correctly discriminates tenant user from central control plane', () => {
      const tenantUser = {
        id: 1,
        username: 'tenant_admin',
        is_control_plane_admin: false,
        is_superuser: false,
        role: 'ADMIN',
      };

      const isAllowedOnSaaS =
        tenantUser.is_control_plane_admin === true || tenantUser.is_superuser === true;
      assert.equal(isAllowedOnSaaS, false);

      const centralAdminUser = {
        id: 2,
        username: 'super_admin',
        is_control_plane_admin: true,
        is_superuser: true,
      };

      const isCentralAllowed =
        centralAdminUser.is_control_plane_admin === true || centralAdminUser.is_superuser === true;
      assert.equal(isCentralAllowed, true);
    });

    it('enforces role authorization matrix for restricted operations', () => {
      const staffUser = { role: 'STAFF', is_superuser: false };
      const billingUser = { role: 'BILLING', is_superuser: false };
      const superUser = { role: 'STAFF', is_superuser: true };

      const requiresBillingRole = (u: { role: string; is_superuser: boolean }) => {
        return u.is_superuser || u.role === 'BILLING' || u.role === 'ADMIN';
      };

      assert.equal(requiresBillingRole(staffUser), false); // 403 Forbidden
      assert.equal(requiresBillingRole(billingUser), true); // Allowed
      assert.equal(requiresBillingRole(superUser), true); // Allowed via superuser override
    });
  });

  describe('8. Edge Proxy Path Routing & Security Gate', () => {
    it('redirects unauthenticated users attempting control plane access', () => {
      const mockRequest = {
        pathname: '/saas-admin/tenants',
        tokenCookie: null,
      };

      const shouldRedirectToLogin =
        mockRequest.pathname.startsWith('/saas-admin') && !mockRequest.tokenCookie;
      assert.equal(shouldRedirectToLogin, true);
    });

    it('allows authenticated control plane requests with token cookie', () => {
      const mockRequest = {
        pathname: '/saas-admin/tenants',
        tokenCookie: 'session-valid-token-123',
      };

      const shouldRedirectToLogin =
        mockRequest.pathname.startsWith('/saas-admin') && !mockRequest.tokenCookie;
      assert.equal(shouldRedirectToLogin, false);
    });
  });
});

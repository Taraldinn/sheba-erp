/**
 * ShebaFi Persistent Token & Session Storage.
 * Synchronizes localStorage with HTTP cookies for edge proxy/middleware validation.
 */

import { AuthContextType, AuthUser, TenantSummary } from './auth-types';

export const STORAGE_KEYS = {
  TOKEN: 'sheba_auth_token',
  USER: 'sheba_auth_user',
  TENANT: 'sheba_auth_tenant',
  TENANT_ID: 'sheba_tenant_id',
  ROLE: 'sheba_user_role',
  CONTEXT: 'sheba_auth_context',
  LEGACY_TOKEN: 'sheba_token',
};

export const CONTROL_PLANE_HOSTNAMES = [
  'admin.shebafi.xyz',
  'control.shebafi.xyz',
  'saas.shebafi.xyz',
  'admin.shebaerp.com',
  'admin.localhost',
  'saas.localhost',
  'control.localhost',
  'admin.localhost.com',
];

export class TokenStorage {
  private static memoryToken: string | null = null;
  private static memoryContext: AuthContextType | null = null;
  private static memoryTenantId: string | null = null;

  /**
   * Determine if the hostname is a central control-plane domain.
   */
  static isControlPlaneHost(customHost?: string): boolean {
    const host = (
      customHost ||
      (typeof window !== 'undefined' ? window.location.hostname : '')
    ).toLowerCase().split(':')[0];

    if (!host) return false;

    return (
      CONTROL_PLANE_HOSTNAMES.includes(host) ||
      host.startsWith('admin.') ||
      host.startsWith('control.') ||
      host.startsWith('saas.')
    );
  }

  static getInitialContextType(): AuthContextType {
    if (typeof window !== 'undefined') {
      const stored = this.getStoredContextType();
      if (stored) return stored;
      if (this.isControlPlaneHost()) return 'central_admin';
    }
    return 'tenant';
  }

  static getStoredToken(): string | null {
    if (this.memoryToken) return this.memoryToken;
    if (typeof window === 'undefined') return null;

    try {
      const token =
        localStorage.getItem(STORAGE_KEYS.TOKEN) ||
        localStorage.getItem(STORAGE_KEYS.LEGACY_TOKEN);
      this.memoryToken = token;
      return token;
    } catch {
      return null;
    }
  }

  static setStoredToken(
    token: string,
    context: AuthContextType = 'tenant',
    tenantId?: string
  ): void {
    this.memoryToken = token;
    this.memoryContext = context;
    if (tenantId) this.memoryTenantId = tenantId;

    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.LEGACY_TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.CONTEXT, context);
      if (tenantId) {
        localStorage.setItem(STORAGE_KEYS.TENANT_ID, tenantId);
      }

      // Sync cookies for edge middleware (30 days)
      const maxAge = 60 * 60 * 24 * 30;
      if (typeof document !== 'undefined') {
        document.cookie = `${STORAGE_KEYS.TOKEN}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
        document.cookie = `${STORAGE_KEYS.CONTEXT}=${context}; path=/; max-age=${maxAge}; SameSite=Lax`;
        if (tenantId) {
          document.cookie = `${STORAGE_KEYS.TENANT_ID}=${encodeURIComponent(tenantId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
        }
      }
    } catch (e) {
      console.error('Failed to set stored token', e);
    }
  }

  static getStoredContext(): AuthContextType {
    return this.getStoredContextType();
  }

  static getStoredContextType(): AuthContextType {
    if (this.memoryContext) return this.memoryContext;
    if (typeof window === 'undefined') return 'tenant';

    try {
      const ctx = localStorage.getItem(STORAGE_KEYS.CONTEXT) as AuthContextType;
      if (ctx === 'central_admin' || ctx === 'tenant') {
        this.memoryContext = ctx;
        return ctx;
      }
    } catch {}

    const fallback = this.isControlPlaneHost() ? 'central_admin' : 'tenant';
    this.memoryContext = fallback;
    return fallback;
  }

  static setStoredContextType(context: AuthContextType): void {
    this.memoryContext = context;
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.CONTEXT, context);
      if (typeof document !== 'undefined') {
        const maxAge = 60 * 60 * 24 * 30;
        document.cookie = `${STORAGE_KEYS.CONTEXT}=${context}; path=/; max-age=${maxAge}; SameSite=Lax`;
      }
    } catch (e) {
      console.error('Failed to set stored context type', e);
    }
  }

  static getStoredTenantId(): string | null {
    if (this.memoryTenantId) return this.memoryTenantId;
    if (typeof window === 'undefined') return null;
    try {
      const id = localStorage.getItem(STORAGE_KEYS.TENANT_ID);
      this.memoryTenantId = id;
      return id;
    } catch {
      return null;
    }
  }

  static getStoredUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static getStoredTenant(): TenantSummary | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TENANT);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static setStoredAuth(
    token: string,
    user: AuthUser,
    tenant?: TenantSummary | null,
    context: AuthContextType = 'tenant'
  ): void {
    const tenantId = tenant?.id || user.tenant_id || user.tenant?.id || undefined;
    this.setStoredToken(token, context, tenantId);

    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      if (user.role) {
        localStorage.setItem(STORAGE_KEYS.ROLE, user.role.toLowerCase());
      }
      if (tenant) {
        localStorage.setItem(STORAGE_KEYS.TENANT, JSON.stringify(tenant));
      } else {
        localStorage.removeItem(STORAGE_KEYS.TENANT);
      }
    } catch (e) {
      console.error('Failed to persist authentication to storage', e);
    }
  }

  static clearStoredAuth(): void {
    this.memoryToken = null;
    this.memoryContext = null;
    this.memoryTenantId = null;

    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.TENANT);
      localStorage.removeItem(STORAGE_KEYS.TENANT_ID);
      localStorage.removeItem(STORAGE_KEYS.ROLE);
      localStorage.removeItem(STORAGE_KEYS.CONTEXT);

      if (typeof document !== 'undefined') {
        document.cookie = `${STORAGE_KEYS.TOKEN}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        document.cookie = `${STORAGE_KEYS.CONTEXT}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        document.cookie = `${STORAGE_KEYS.TENANT_ID}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
    } catch (e) {
      console.error('Failed to clear storage credentials', e);
    }
  }

  static onStorageSync(callback: () => void): () => void {
    return this.onStorageChange(() => callback());
  }

  static onStorageChange(
    callback: (token: string | null, context?: AuthContextType, tenantId?: string | null) => void
  ): () => void {
    if (typeof window === 'undefined') return () => {};

    const handler = (event: StorageEvent) => {
      if (
        event.key === STORAGE_KEYS.TOKEN ||
        event.key === STORAGE_KEYS.CONTEXT ||
        event.key === STORAGE_KEYS.TENANT_ID
      ) {
        this.memoryToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
        this.memoryContext = localStorage.getItem(STORAGE_KEYS.CONTEXT) as AuthContextType;
        this.memoryTenantId = localStorage.getItem(STORAGE_KEYS.TENANT_ID);
        callback(this.memoryToken, this.memoryContext, this.memoryTenantId);
      }
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
}

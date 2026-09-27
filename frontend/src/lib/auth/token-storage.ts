/**
 * ShebaFi Persistent Token & Session Storage.
 *
 * Why we namespaced keys (Sept 2026 rewrite)
 * ------------------------------------------
 * The previous implementation stored every login — staff, central
 * admin, reseller — into the SAME three localStorage keys
 * (``sheba_auth_token``, ``sheba_auth_user``, ``sheba_tenant_id``).
 * Two browser tabs logging in to different tenants (or the same
 * user using the SaaS control plane in a second tab) would silently
 * overwrite each other; whichever tab was rendered last "won", and
 * the other tab would suddenly see the wrong user's data on the
 * next API call. Combined with Django REST Framework's global-per-
 * user ``Token`` (one shared token, no per-session isolation), it
 * produced the support complaints the tenant-conflict work is
 * trying to fix: "session distorted", "tenet conflict", "I see
 * another tenant's data after refreshing".
 *
 * The new model
 * -------------
 * Each login writes into context-scoped keys:
 *
 *   sheba_session_token.<context>          # the opaque session id
 *   sheba_session_user.<context>           # JSON AuthUser snapshot
 *   sheba_session_tenant_id.<context>      # tenant id (null for central)
 *   sheba_session_meta.<context>           # { session_id, expires_at }
 *   sheba_active_context                   # which context is "current"
 *
 * Three contexts are recognised:
 *
 *   tenant        — ISP staff login
 *   central_admin — SaaS control plane (admin.shebafi.xyz)
 *   reseller      — ISP reseller sub-account (separate from staff)
 *
 * Reads remain backward-compatible: if a namespaced key is absent,
 * the legacy ``sheba_auth_token`` keys are read once and migrated
 * on the next write.
 */

import { AuthContextType, AuthUser, TenantSummary } from './auth-types';

const LEGACY_KEYS = {
  TOKEN: 'sheba_auth_token',
  LEGACY_TOKEN: 'sheba_token',
  USER: 'sheba_auth_user',
  TENANT: 'sheba_auth_tenant',
  TENANT_ID: 'sheba_tenant_id',
  ROLE: 'sheba_user_role',
  CONTEXT: 'sheba_auth_context',
  ACTIVE_CONTEXT: 'sheba_active_context',
} as const;

export const STORAGE_KEYS = {
  sessionToken: (ctx: AuthContextType) => `sheba_session_token.${ctx}`,
  sessionUser: (ctx: AuthContextType) => `sheba_session_user.${ctx}`,
  sessionTenantId: (ctx: AuthContextType) => `sheba_session_tenant_id.${ctx}`,
  sessionMeta: (ctx: AuthContextType) => `sheba_session_meta.${ctx}`,
  sessionCookie: 'sheba_session',
  activeContext: LEGACY_KEYS.ACTIVE_CONTEXT,
  legacyToken: LEGACY_KEYS.TOKEN,
  legacyUser: LEGACY_KEYS.USER,
  legacyTenantId: LEGACY_KEYS.TENANT_ID,
  legacyContext: LEGACY_KEYS.CONTEXT,
} as const;

export interface StoredSessionMeta {
  session_id: string;
  expires_at: string | null;
  context_type: AuthContextType;
}

export const CONTROL_PLANE_HOSTNAMES = [
  'admin.shebafi.xyz',
  'control.shebafi.xyz',
  'saas.shebafi.xyz',
  'admin.shebaerp.com',
  'admin.localhost',
  'saas.localhost',
  'control.localhost',
];

function getStorage(): Storage | null {
  // Tests sometimes stub ``localStorage`` as a global but leave
  // ``window`` undefined; production code in the browser has both.
  // Pick whichever is real.
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage as Storage;
  }
  return null;
}

function safeGet(key: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    /* quota / private mode — silently drop. The httpOnly cookie is
       still the source of truth for the edge proxy. */
  }
}

function safeRemove(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export class TokenStorage {
  private static memoryToken: string | null = null;
  private static memoryUser: AuthUser | null = null;
  private static memoryContext: AuthContextType | null = null;
  private static memoryTenantId: string | null = null;

  static isControlPlaneHost(customHost?: string): boolean {
    const host = (
      customHost ||
      (typeof window !== 'undefined' ? window.location.hostname : '')
    )
      .toLowerCase()
      .split(':')[0];
    if (!host) return false;
    return (
      CONTROL_PLANE_HOSTNAMES.includes(host) ||
      host.startsWith('admin.') ||
      host.startsWith('control.') ||
      host.startsWith('saas.')
    );
  }

  static getInitialContextType(): AuthContextType {
    if (typeof window === 'undefined') return 'tenant';
    const stored = this.getActiveContext();
    if (stored) return stored;
    return this.isControlPlaneHost() ? 'central_admin' : 'tenant';
  }

  static getActiveContext(): AuthContextType | null {
    if (typeof window === 'undefined') return null;
    const v = safeGet(LEGACY_KEYS.ACTIVE_CONTEXT);
    if (v === 'tenant' || v === 'central_admin' || v === 'reseller') return v;
    return null;
  }

  static setActiveContext(ctx: AuthContextType): void {
    safeSet(LEGACY_KEYS.ACTIVE_CONTEXT, ctx);
    this.memoryContext = ctx;
  }

  static getStoredTokenFor(context: AuthContextType): string | null {
    const namespaced = safeGet(STORAGE_KEYS.sessionToken(context));
    if (namespaced) return namespaced;
    if (this.getActiveContext() === context) {
      const legacy =
        safeGet(LEGACY_KEYS.TOKEN) || safeGet(LEGACY_KEYS.LEGACY_TOKEN);
      if (legacy) return legacy;
    }
    return null;
  }

  static getStoredToken(): string | null {
    const active = this.getActiveContext();
    if (active) return this.getStoredTokenFor(active);
    return null;
  }

  static getStoredContext(): AuthContextType {
    return this.getStoredContextType();
  }

  static getExplicitStoredContextType(): AuthContextType | null {
    return this.getActiveContext();
  }

  static getStoredContextType(): AuthContextType {
    const explicit = this.getActiveContext();
    if (explicit) return explicit;
    return this.isControlPlaneHost() ? 'central_admin' : 'tenant';
  }

  static setStoredContextType(context: AuthContextType): void {
    this.setActiveContext(context);
  }

  static getStoredTenantId(): string | null {
    const active = this.getActiveContext();
    if (active) {
      const namespaced = safeGet(STORAGE_KEYS.sessionTenantId(active));
      if (namespaced) return namespaced;
    }
    return safeGet(LEGACY_KEYS.TENANT_ID);
  }

  static getStoredUser(): AuthUser | null {
    const active = this.getActiveContext();
    if (active) {
      const raw = safeGet(STORAGE_KEYS.sessionUser(active));
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
    }
    const legacy = safeGet(LEGACY_KEYS.USER);
    if (legacy) {
      try {
        return JSON.parse(legacy);
      } catch {
        return null;
      }
    }
    return null;
  }

  static getStoredTenant(): TenantSummary | null {
    const active = this.getActiveContext();
    if (!active) return null;
    const raw = safeGet(`sheba_session_tenant.${active}`);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return null;
  }

  static setStoredAuth(
    token: string,
    user: AuthUser,
    tenant?: TenantSummary | null,
    context: AuthContextType = 'tenant',
    meta?: Partial<StoredSessionMeta>,
  ): void {
    const tenantId =
      tenant?.id || user.tenant_id || user.tenant?.id || null;
    this.memoryToken = token;
    this.memoryUser = user;
    this.memoryTenantId = tenantId || null;
    this.setActiveContext(context);

    safeSet(STORAGE_KEYS.sessionToken(context), token);
    safeSet(STORAGE_KEYS.sessionUser(context), JSON.stringify(user));
    if (tenantId) {
      safeSet(STORAGE_KEYS.sessionTenantId(context), tenantId);
    } else {
      safeRemove(STORAGE_KEYS.sessionTenantId(context));
    }
    if (tenant) {
      safeSet(`sheba_session_tenant.${context}`, JSON.stringify(tenant));
    }
    if (meta) {
      const fullMeta: StoredSessionMeta = {
        session_id: meta.session_id || '',
        expires_at: meta.expires_at || null,
        context_type: context,
      };
      safeSet(STORAGE_KEYS.sessionMeta(context), JSON.stringify(fullMeta));
    }

    const isHttps =
      typeof window !== 'undefined' &&
      window.location?.protocol === 'https:';
    const secureAttr = isHttps ? '; Secure' : '';
    if (typeof document !== 'undefined') {
      document.cookie = `${STORAGE_KEYS.sessionCookie}=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=Lax${secureAttr}`;
    }

    safeSet(LEGACY_KEYS.TOKEN, token);
    safeSet(LEGACY_KEYS.LEGACY_TOKEN, token);
    safeSet(LEGACY_KEYS.CONTEXT, context);
    if (tenantId) safeSet(LEGACY_KEYS.TENANT_ID, tenantId);
  }

  static setStoredToken(
    token: string,
    context: AuthContextType = 'tenant',
    tenantId?: string,
  ): void {
    const user = this.getStoredUser() || this._fallbackUser(context);
    this.setStoredAuth(token, user, undefined, context);
    if (tenantId) {
      safeSet(STORAGE_KEYS.sessionTenantId(context), tenantId);
    }
  }

  private static _fallbackUser(context: AuthContextType): AuthUser {
    return {
      id: 0,
      username: '',
      email: '',
      role: context === 'central_admin' ? 'PLATFORM_SUPER_ADMIN' : 'STAFF',
      is_control_plane_admin: context === 'central_admin',
      tenant_id: null,
      tenant: null,
    };
  }

  /**
   * Wipe EVERYTHING auth-related — every context slot, every legacy
   * key, every cookie variant.
   */
  static clearStoredAuth(): void {
    this.memoryToken = null;
    this.memoryUser = null;
    this.memoryContext = null;
    this.memoryTenantId = null;
    if (typeof window === 'undefined') return;

    const contexts: AuthContextType[] = ['tenant', 'central_admin', 'reseller'];
    for (const ctx of contexts) {
      safeRemove(STORAGE_KEYS.sessionToken(ctx));
      safeRemove(STORAGE_KEYS.sessionUser(ctx));
      safeRemove(STORAGE_KEYS.sessionTenantId(ctx));
      safeRemove(STORAGE_KEYS.sessionMeta(ctx));
      safeRemove(`sheba_session_tenant.${ctx}`);
    }

    const legacyKeys = [
      LEGACY_KEYS.TOKEN,
      LEGACY_KEYS.LEGACY_TOKEN,
      LEGACY_KEYS.USER,
      LEGACY_KEYS.TENANT,
      LEGACY_KEYS.TENANT_ID,
      LEGACY_KEYS.ROLE,
      LEGACY_KEYS.CONTEXT,
      LEGACY_KEYS.ACTIVE_CONTEXT,
      'sheba_access_token',
      'sheba_refresh_token',
      'sheba_user_role',
      'sheba_user_name',
      'sheba_role',
      'token',
      'authToken',
      'sheba_api_key',
    ];
    for (const k of legacyKeys) safeRemove(k);

    try {
      const ss =
        (typeof window !== 'undefined' && window.sessionStorage) ||
        ((globalThis as any).sessionStorage as Storage | undefined);
      ss?.clear();
    } catch {
      /* ignore */
    }

    if (typeof document !== 'undefined') {
      const cookieNames = [
        LEGACY_KEYS.TOKEN,
        LEGACY_KEYS.LEGACY_TOKEN,
        LEGACY_KEYS.CONTEXT,
        LEGACY_KEYS.TENANT_ID,
        'sheba_access_token',
        'sheba_refresh_token',
        STORAGE_KEYS.sessionCookie,
      ];
      const hostname = window.location.hostname;
      const domainsToClear = [''];
      if (hostname.includes('.')) {
        const parts = hostname.split('.');
        if (parts.length >= 2) {
          domainsToClear.push(`; domain=.${parts.slice(-2).join('.')}`);
        }
        domainsToClear.push(`; domain=${hostname}`);
      }
      for (const name of cookieNames) {
        for (const d of domainsToClear) {
          document.cookie = `${name}=; path=/${d}; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
      }
    }
  }

  static onStorageSync(callback: () => void): () => void {
    return this.onStorageChange(() => callback());
  }

  static onStorageChange(
    callback: (
      token: string | null,
      context?: AuthContextType,
      tenantId?: string | null,
    ) => void,
  ): () => void {
    if (typeof window === 'undefined') return () => {};
    const handler = () => {
      const active = this.getActiveContext();
      callback(
        active ? this.getStoredTokenFor(active) : null,
        active || undefined,
        this.getStoredTenantId(),
      );
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  static peekActiveToken(): string | null {
    const ctx = this.getActiveContext();
    return ctx ? this.getStoredTokenFor(ctx) : null;
  }
}

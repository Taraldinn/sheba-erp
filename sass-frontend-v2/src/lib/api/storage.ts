/**
 * Storage keys for session, tokens, and per-portal user caches.
 *
 * IMPORTANT: tokens are short-lived and never stored alongside sensitive
 * PII. Long-lived credentials must never be persisted in localStorage.
 */
export const STORAGE_KEYS = {
    centralToken: 'saas_central_token',
    centralUser: 'saas_central_user',
    tenantToken: 'saas_tenant_token',
    tenantUser: 'saas_tenant_user',
    tenantSlug: 'saas_tenant_slug',
    tenantId: 'saas_tenant_id',
    resellerToken: 'saas_reseller_token',
    resellerUser: 'saas_reseller_user',
    portalToken: 'saas_portal_token',
    portalUser: 'saas_portal_user',
    bootstrapPending: 'saas_bootstrap_pending',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

function safeGet(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSet(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        /* quota / private mode */
    }
}

function safeRemove(key: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}

function safeGetJSON<T>(key: string): T | null {
    const raw = safeGet(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function safeSetJSON<T>(key: string, value: T): void {
    safeSet(key, JSON.stringify(value));
}

export const storage = {
    get: safeGet,
    set: safeSet,
    remove: safeRemove,
    getJSON: safeGetJSON,
    setJSON: safeSetJSON,
};

export const UNAUTHORIZED_EVENT = 'sheba:unauthorized';
export const TENANT_SWITCH_EVENT = 'sheba:tenant-switch';
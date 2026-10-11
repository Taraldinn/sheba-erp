import type { Page } from '@playwright/test';

export interface LoginFixture {
    username: string;
    password: string;
    tenant?: string;
    portal: 'super_admin' | 'isp' | 'tenant';
}

export const E2E_USERS = {
    superAdmin: { username: 'e2e-admin', password: 'e2e-admin-pw', portal: 'super_admin' as const },
    ispAdmin: { username: 'e2e-isp', password: 'e2e-isp-pw', portal: 'isp' as const },
    tenantAdmin: { username: 'e2e-tenant', password: 'e2e-tenant-pw', tenant: 'acme', portal: 'tenant' as const },
};

export function sessionKeyFor(portal: 'super_admin' | 'isp' | 'tenant', tenantSlug?: string): string {
    if (portal === 'super_admin') return 'sheba_session_super_admin';
    if (portal === 'isp') return 'sheba_session_isp_admin';
    return `sheba_session_tenant_${tenantSlug || 'default'}`;
}

interface SeedOptions {
    /** When true (default), wipe existing storage before applying the seed. */
    clear?: boolean;
    user?: LoginFixture;
}

interface SeedPayload {
    clear: boolean;
    overrides: Record<string, string>;
    session?: string;
    sessionKey?: string;
}

/**
 * Apply a single init script that performs (in order): clear, then write
 * the dev-portal overrides, then write the session. Combining everything
 * in one call avoids the race where a `clear` script wipes a later
 * `seed`, since Playwright runs init scripts in registration order.
 */
export async function applySeed(page: Page, opts: SeedOptions = { clear: true }): Promise<void> {
    const payload: SeedPayload = { clear: opts.clear !== false, overrides: {} };
    if (opts.user) {
        const token = `e2e-token-${opts.user.portal}-${Date.now()}`;
        const session = {
            token,
            user: {
                id: `e2e-${opts.user.portal}`,
                username: opts.user.username,
                email: `${opts.user.username}@sheba.test`,
                name: opts.user.username,
                role: opts.user.portal === 'super_admin' ? 'SUPER_ADMIN' : 'ADMIN',
                tenant: opts.user.tenant ? { slug: opts.user.tenant, name: opts.user.tenant } : null,
            },
        };
        const portalOverride =
            opts.user.portal === 'super_admin'
                ? 'SUPER_ADMIN'
                : opts.user.portal === 'isp'
                ? 'ISP_ADMIN'
                : 'TENANT';
        payload.overrides.sheba_dev_portal_override = portalOverride;
        if (opts.user.tenant) payload.overrides.sheba_dev_tenant_override = opts.user.tenant;
        payload.sessionKey = sessionKeyFor(opts.user.portal, opts.user.tenant);
        payload.session = JSON.stringify(session);
    }
    await page.addInitScript((p: SeedPayload) => {
        if (p.clear) window.localStorage.clear();
        for (const [k, v] of Object.entries(p.overrides)) {
            window.localStorage.setItem(k, v);
        }
        if (p.sessionKey && p.session) {
            window.localStorage.setItem(p.sessionKey, p.session);
        }
    }, payload);
}

/** Convenience wrapper kept for back-compat with the previous test API. */
export async function seedSession(page: Page, user: LoginFixture): Promise<void> {
    return applySeed(page, { clear: true, user });
}

/** Convenience wrapper kept for back-compat with the previous test API. */
export async function clearSession(page: Page): Promise<void> {
    return applySeed(page, { clear: true });
}

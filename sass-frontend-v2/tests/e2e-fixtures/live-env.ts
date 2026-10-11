import type { Page, APIResponse } from '@playwright/test';

/**
 * Live-backend fixture helpers.
 *
 * The live project is gated on `VITE_E2E_LIVE=1`; these helpers pull
 * the rest of the configuration from environment variables so the same
 * suite can be pointed at staging, production, or a local Django dev
 * server without editing the spec.
 *
 *   VITE_E2E_API_BASE_URL — full backend root (default
 *                            http://localhost:8000/api/v1)
 *   VITE_E2E_TENANT_SLUG  — tenant slug for tenant portal flows
 *   VITE_E2E_SUPER_USER   — saas super-admin username
 *   VITE_E2E_SUPER_PASS   — saas super-admin password
 *   VITE_E2E_TENANT_USER  — tenant admin username
 *   VITE_E2E_TENANT_PASS  — tenant admin password
 */
export const LIVE_ENV = {
    apiBase: process.env.VITE_E2E_API_BASE_URL ?? 'http://localhost:8000/api/v1',
    tenantSlug: process.env.VITE_E2E_TENANT_SLUG ?? 'acme',
    superUser: process.env.VITE_E2E_SUPER_USER ?? '',
    superPass: process.env.VITE_E2E_SUPER_PASS ?? '',
    tenantUser: process.env.VITE_E2E_TENANT_USER ?? '',
    tenantPass: process.env.VITE_E2E_TENANT_PASS ?? '',
};

export function liveApiUrl(path: string): string {
    const base = LIVE_ENV.apiBase.replace(/\/+$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
}

export interface LiveSession {
    token: string;
    user: { id: string | number; username: string; email?: string };
    tenant?: { slug: string; name?: string };
}

export async function liveLogin(
    page: Page,
    portal: 'super_admin' | 'tenant',
    opts: { username?: string; password?: string; tenant?: string } = {},
): Promise<LiveSession | null> {
    const username = opts.username ?? (portal === 'super_admin' ? LIVE_ENV.superUser : LIVE_ENV.tenantUser);
    const password = opts.password ?? (portal === 'super_admin' ? LIVE_ENV.superPass : LIVE_ENV.tenantPass);
    if (!username || !password) {
        // Surface a clear skip reason rather than failing the whole project.
        console.warn(
            `[e2e:live] skipping login for portal=${portal} — no credentials in env. ` +
                `Set VITE_E2E_SUPER_USER/VITE_E2E_SUPER_PASS or VITE_E2E_TENANT_USER/VITE_E2E_TENANT_PASS.`,
        );
        return null;
    }
    const endpoint = portal === 'super_admin' ? `${LIVE_ENV.apiBase}/saas/auth/login/` : `${LIVE_ENV.apiBase}/auth/login/`;
    const body: Record<string, string> = { username, password };
    if (portal === 'tenant' && opts.tenant) body.tenant = opts.tenant;
    const response = await page.request.post(endpoint, { data: body, headers: { 'content-type': 'application/json' } });
    if (!response.ok()) {
        const snippet = (await response.text()).slice(0, 200);
        throw new Error(`login failed: ${response.status()} ${response.statusText()} — ${snippet}`);
    }
    return (await response.json()) as LiveSession;
}

export async function liveMe(page: Page, portal: 'super_admin' | 'tenant', token: string): Promise<APIResponse> {
    const endpoint = portal === 'super_admin' ? `${LIVE_ENV.apiBase}/saas/auth/me/` : `${LIVE_ENV.apiBase}/auth/me/`;
    return page.request.get(endpoint, { headers: { authorization: `Bearer ${token}` } });
}

export async function liveSeedSession(page: Page, session: LiveSession, portal: 'super_admin' | 'tenant'): Promise<void> {
    const key = portal === 'super_admin' ? 'sheba_session_super_admin' : `sheba_session_tenant_${session.tenant?.slug ?? LIVE_ENV.tenantSlug}`;
    await page.addInitScript(
        ({ key, value }) => {
            window.localStorage.setItem(key, value);
        },
        { key, value: JSON.stringify(session) },
    );
    await page.addInitScript(
        ({ portal, slug }) => {
            window.localStorage.setItem('sheba_dev_portal_override', portal);
            if (slug) window.localStorage.setItem('sheba_dev_tenant_override', slug);
        },
        { portal: portal === 'super_admin' ? 'SUPER_ADMIN' : 'TENANT', slug: session.tenant?.slug ?? LIVE_ENV.tenantSlug },
    );
}

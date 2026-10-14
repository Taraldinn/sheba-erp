import { PORTAL_CONFIG, RESERVED_SLUGS } from './config';
import type { PortalResolution, PortalType } from './types';

export interface ResolvePortalOptions {
    pathname?: string;
    searchParams?: URLSearchParams | string;
    devOverridePortal?: string | null;
    devOverrideTenant?: string | null;
    isDev?: boolean;
}

function detectIsDev(): boolean {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
        return process.env.NODE_ENV !== 'production';
    }
    try {
        const mode = (import.meta as unknown as { env?: { MODE?: string; DEV?: boolean } }).env?.MODE;
        if (typeof mode === 'string') return mode !== 'production';
        if (typeof (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === 'boolean') {
            return (import.meta as unknown as { env: { DEV: boolean } }).env.DEV;
        }
    } catch {
        /* not in Vite */
    }
    return false;
}

/**
 * Pure resolver: maps a hostname (and optional dev overrides) to one of:
 *   PUBLIC_HOME | SUPER_ADMIN | ISP_ADMIN | TENANT | UNKNOWN
 *
 * The hostname is a UI/portal selector ONLY. The backend's
 * TenantResolutionMiddleware is the authoritative authorization boundary.
 */
export function resolvePortal(rawHostname: string, options: ResolvePortalOptions = {}): PortalResolution {
    const isDevelopment = options.isDev ?? detectIsDev();

    // Normalize: strip port if included, lowercase, trim.
    const hostname = (rawHostname.split(':')[0] || '').toLowerCase().trim();

    const isLocalDevHost =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.localhost');

    // ── Dev overrides (local dev or explicit flag) ─────────────────────────
    if (isDevelopment || isLocalDevHost) {
        let overridePortal: string | null | undefined = undefined;
        let overrideTenant = options.devOverrideTenant;

        // On plain localhost or 127.0.0.1 without subdomain, route based on path if explicit
        if (options.pathname && (hostname === 'localhost' || hostname === '127.0.0.1')) {
            if (options.pathname.startsWith('/saas')) {
                overridePortal = 'saas';
            } else if (options.pathname.startsWith('/isp')) {
                overridePortal = 'isp';
            } else if (options.pathname.startsWith('/tenant')) {
                overridePortal = 'tenant';
            }
        }

        if (!overridePortal) {
            overridePortal = options.devOverridePortal;
        }

        if (options.searchParams) {
            const params = typeof options.searchParams === 'string' ? new URLSearchParams(options.searchParams) : options.searchParams;
            if (!overridePortal) overridePortal = params.get('portal');
            if (params.get('tenant')) overrideTenant = params.get('tenant');
        }

        if (overridePortal) {
            const normalized = overridePortal.toLowerCase().trim();
            if (normalized === 'super_admin' || normalized === 'admin' || normalized === 'saas') {
                return { portal: 'SUPER_ADMIN', hostname, isDevelopment: true };
            }
            if (normalized === 'isp_admin' || normalized === 'isp' || normalized === 'app') {
                return { portal: 'ISP_ADMIN', hostname, isDevelopment: true };
            }
            if (normalized === 'tenant') {
                return {
                    portal: 'TENANT',
                    tenantSlug: overrideTenant || 'demo-isp',
                    hostname,
                    isDevelopment: true,
                };
            }
            if (normalized === 'public' || normalized === 'home' || normalized === 'marketing') {
                return { portal: 'PUBLIC_HOME', hostname, isDevelopment: true };
            }
        }
    }

    // ── 1. Super Admin ─────────────────────────────────────────────────────
    if (
        hostname === PORTAL_CONFIG.superAdminHost ||
        hostname === 'admin.localhost' ||
        hostname === 'saas.localhost' ||
        hostname.startsWith('admin.') ||
        hostname.startsWith('saas.') ||
        hostname.startsWith('control.')
    ) {
        return { portal: 'SUPER_ADMIN', hostname, isDevelopment: isLocalDevHost };
    }

    // ── 2. ISP central app ─────────────────────────────────────────────────
    if (
        hostname === PORTAL_CONFIG.ispAdminHost ||
        hostname === 'app.localhost' ||
        hostname === 'isp.localhost' ||
        hostname.startsWith('app.') ||
        hostname.startsWith('isp.')
    ) {
        return { portal: 'ISP_ADMIN', hostname, isDevelopment: isLocalDevHost };
    }

    // ── 3. Public homepage (apex or www.*) ─────────────────────────────────
    const strippedWww = hostname.replace(/^www\./, '');
    const isPublicApex =
        hostname === PORTAL_CONFIG.publicHomeHost ||
        strippedWww === PORTAL_CONFIG.publicHomeHost ||
        PORTAL_CONFIG.knownApexDomains.includes(hostname) ||
        PORTAL_CONFIG.knownApexDomains.includes(strippedWww) ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1';

    if (isPublicApex) {
        return { portal: 'PUBLIC_HOME', hostname, isDevelopment: isLocalDevHost };
    }

    // ── 4. Tenant subdomains ───────────────────────────────────────────────
    if (hostname.endsWith('.localhost')) {
        const subdomain = hostname.replace(/\.localhost$/, '');
        if (!RESERVED_SLUGS.has(subdomain)) {
            return { portal: 'TENANT', tenantSlug: subdomain, hostname, isDevelopment: true };
        }
    }

    const tenantRoots = [PORTAL_CONFIG.tenantRootDomain, ...PORTAL_CONFIG.knownApexDomains];
    for (const root of tenantRoots) {
        if (hostname.endsWith(`.${root}`)) {
            const subdomain = hostname.slice(0, -(root.length + 1));
            if (!subdomain.includes('.') && !RESERVED_SLUGS.has(subdomain)) {
                return { portal: 'TENANT', tenantSlug: subdomain, hostname, isDevelopment: isLocalDevHost };
            }
        }
    }

    // ── 5. Custom domains ──────────────────────────────────────────────────
    if (hostname.includes('.')) {
        const firstLabel = hostname.split('.')[0];
        if (!RESERVED_SLUGS.has(firstLabel)) {
            return { portal: 'TENANT', hostname, isCustomDomain: true, isDevelopment: isLocalDevHost };
        }
    }

    return { portal: 'UNKNOWN', hostname, isDevelopment: isLocalDevHost };
}

/** Returns the plane tag used by the API client. */
export type Plane = 'central' | 'tenant' | 'public';

export function planeForPortal(portal: PortalType): Plane | null {
    if (portal === 'SUPER_ADMIN') return 'central';
    if (portal === 'ISP_ADMIN' || portal === 'TENANT') return 'tenant';
    if (portal === 'PUBLIC_HOME' || portal === 'UNKNOWN') return 'public';
    return null;
}
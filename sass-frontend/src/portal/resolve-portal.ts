import { PORTAL_CONFIG, RESERVED_SLUGS } from './config';
import type { PortalResolution } from './types';

export interface ResolvePortalOptions {
    searchParams?: URLSearchParams | string;
    devOverridePortal?: string | null;
    devOverrideTenant?: string | null;
    isDev?: boolean;
}

/**
 * Pure resolver: Maps a hostname and optional dev overrides to one of the 4 portal models:
 * 1. PUBLIC_HOME: example.com, www.example.com, plain localhost
 * 2. SUPER_ADMIN: admin.example.xyz, admin.localhost
 * 3. ISP_ADMIN: app.example.xyz, app.localhost
 * 4. TENANT: {tenant}.example.com, {tenant}.localhost, custom domains
 */
export function resolvePortal(
    rawHostname: string,
    options: ResolvePortalOptions = {}
): PortalResolution {
    const isDevelopment = options.isDev ?? (
        typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.MODE !== 'production' : true
    );

    // Normalize: strip port if included, lowercase, trim
    const hostname = (rawHostname.split(':')[0] || '').toLowerCase().trim();

    // Check if this is a local development host
    const isLocalDevHost = (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.localhost')
    );

    // ── DEV OVERRIDES (Available on local dev or explicit dev flag) ──
    if (isDevelopment || isLocalDevHost) {
        let overridePortal = options.devOverridePortal;
        let overrideTenant = options.devOverrideTenant;

        if (!overridePortal && options.searchParams) {
            const params = typeof options.searchParams === 'string'
                ? new URLSearchParams(options.searchParams)
                : options.searchParams;
            overridePortal = params.get('portal');
            if (params.get('tenant')) {
                overrideTenant = params.get('tenant');
            }
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

    // ── 1. SUPER ADMIN PORTAL ──
    // e.g. admin.example.xyz, admin.shebafi.xyz, admin.localhost, saas.localhost
    if (
        hostname === PORTAL_CONFIG.superAdminHost ||
        hostname === 'admin.localhost' ||
        hostname === 'saas.localhost' ||
        hostname.startsWith('admin.') ||
        hostname.startsWith('saas.') ||
        hostname.startsWith('control.')
    ) {
        return {
            portal: 'SUPER_ADMIN',
            hostname,
            isDevelopment: isLocalDevHost,
        };
    }

    // ── 2. ISP CENTRAL APP PORTAL ──
    // e.g. app.example.xyz, app.shebafi.xyz, app.localhost, isp.localhost
    if (
        hostname === PORTAL_CONFIG.ispAdminHost ||
        hostname === 'app.localhost' ||
        hostname === 'isp.localhost' ||
        hostname.startsWith('app.') ||
        hostname.startsWith('isp.')
    ) {
        return {
            portal: 'ISP_ADMIN',
            hostname,
            isDevelopment: isLocalDevHost,
        };
    }

    // ── 3. PUBLIC HOMEPAGE (Apex domain or www.*) ──
    // e.g. example.com, www.example.com, shebafi.xyz, plain localhost
    const strippedWww = hostname.replace(/^www\./, '');
    const isPublicApex = (
        hostname === PORTAL_CONFIG.publicHomeHost ||
        strippedWww === PORTAL_CONFIG.publicHomeHost ||
        PORTAL_CONFIG.knownApexDomains.includes(hostname) ||
        PORTAL_CONFIG.knownApexDomains.includes(strippedWww) ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1'
    );

    if (isPublicApex) {
        return {
            portal: 'PUBLIC_HOME',
            hostname,
            isDevelopment: isLocalDevHost,
        };
    }

    // ── 4. TENANT SUBDOMAINS ──
    // e.g. {tenant}.example.com or {tenant}.localhost
    if (hostname.endsWith('.localhost')) {
        const subdomain = hostname.replace(/\.localhost$/, '');
        if (!RESERVED_SLUGS.has(subdomain)) {
            return {
                portal: 'TENANT',
                tenantSlug: subdomain,
                hostname,
                isDevelopment: true,
            };
        }
    }

    // Check against configured tenantRootDomain (e.g. example.com) or known apex domains
    const tenantRoots = [PORTAL_CONFIG.tenantRootDomain, ...PORTAL_CONFIG.knownApexDomains];
    for (const root of tenantRoots) {
        if (hostname.endsWith(`.${root}`)) {
            const subdomain = hostname.slice(0, -(root.length + 1));
            // Ensure single-level subdomain and not a reserved slug
            if (!subdomain.includes('.') && !RESERVED_SLUGS.has(subdomain)) {
                return {
                    portal: 'TENANT',
                    tenantSlug: subdomain,
                    hostname,
                    isDevelopment: isLocalDevHost,
                };
            }
        }
    }

    // ── 5. CUSTOM DOMAINS (e.g. portal.myisp.net) ──
    // Any other domain that is not a reserved or known root domain is treated as a custom tenant domain
    if (hostname.includes('.')) {
        return {
            portal: 'TENANT',
            hostname,
            isCustomDomain: true,
            isDevelopment: isLocalDevHost,
        };
    }

    return {
        portal: 'UNKNOWN',
        hostname,
        isDevelopment: isLocalDevHost,
    };
}

/**
 * Plane detection for the merged sass-admin / sass-frontend codebase.
 *
 * - `admin.<root>`           → central control plane (SaaS operators)
 * - `<tenant-slug>.<root>`   → tenant plane (ISP staff / resellers)
 * - localhost / 127.0.0.1    → dual mode (toggle in UI)
 */

export type Plane = 'central' | 'tenant' | 'dual';

export interface PlaneInfo {
    /** The detected plane based on hostname alone. */
    plane: Plane;
    /** Tenant slug extracted from a tenant hostname, or null. */
    tenantSlug: string | null;
}

const ROOT_DOMAINS = ['sheba.example', 'shebafi.xyz', 'shebafi.com', 'sheba.app'];

/**
 * Detect the plane from a hostname string.
 *
 *  - `admin.shebafi.xyz`      → { plane: 'central', tenantSlug: null }
 *  - `optimax.shebafi.xyz`    → { plane: 'tenant', tenantSlug: 'optimax' }
 *  - `localhost`              → { plane: 'dual',    tenantSlug: null }
 *  - `admin.localhost`        → { plane: 'central', tenantSlug: null } (dev convenience)
 */
export function detectPlane(hostname: string): PlaneInfo {
    const host = (hostname || '').toLowerCase().trim();
    if (!host) return { plane: 'dual', tenantSlug: null };

    // localhost variants
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('127.')) {
        return { plane: 'dual', tenantSlug: null };
    }

    const parts = host.split('.');

    // IP literals → dual
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        return { plane: 'dual', tenantSlug: null };
    }

    // admin.<anything> → central
    if (parts[0] === 'admin') {
        return { plane: 'central', tenantSlug: null };
    }

    // www.<root> or just <root> → dual (root domain itself, ambiguous)
    if (parts.length <= 2) {
        return { plane: 'dual', tenantSlug: null };
    }

    // Known root domains: <slug>.sheba.example / shebafi.xyz / etc.
    const isRoot = ROOT_DOMAINS.some(
        (root) => host.endsWith('.' + root) && parts.length >= root.split('.').length + 1
    );

    if (isRoot) {
        const slug = parts[0];
        // reserved slugs that should never be treated as tenant names
        if (slug === 'www' || slug === 'api' || slug === 'app' || slug === 'cdn') {
            return { plane: 'dual', tenantSlug: null };
        }
        return { plane: 'tenant', tenantSlug: slug };
    }

    // Unknown parent domain → dual so the user can pick
    return { plane: 'dual', tenantSlug: null };
}

/**
 * Local override: the user may manually toggle between central and tenant
 * mode on dual-mode hostnames (localhost during development). Persisted in
 * localStorage as `saas_plane_override`.
 */
export const PLANE_OVERRIDE_KEY = 'saas_plane_override';
export type PlaneOverride = 'central' | 'tenant';

export function readPlaneOverride(): PlaneOverride | null {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(PLANE_OVERRIDE_KEY);
    if (v === 'central' || v === 'tenant') return v;
    return null;
}

export function writePlaneOverride(value: PlaneOverride | null): void {
    if (typeof window === 'undefined') return;
    if (value === null) {
        window.localStorage.removeItem(PLANE_OVERRIDE_KEY);
    } else {
        window.localStorage.setItem(PLANE_OVERRIDE_KEY, value);
    }
}

/**
 * Resolve the *effective* plane: hostname-driven detection, optionally
 * replaced by a user-chosen override on dual hostnames.
 */
export function effectivePlane(): { plane: 'central' | 'tenant'; tenantSlug: string | null } {
    const info = detectPlane(typeof window !== 'undefined' ? window.location.hostname : '');
    if (info.plane === 'dual') {
        const override = readPlaneOverride();
        if (override === 'central') return { plane: 'central', tenantSlug: null };
        if (override === 'tenant') {
            // try ?tenant= query param first, then nothing
            let slug: string | null = null;
            if (typeof window !== 'undefined') {
                const params = new URLSearchParams(window.location.search);
                slug = params.get('tenant') || params.get('slug');
            }
            return { plane: 'tenant', tenantSlug: slug };
        }
        // No override → default to central on dual hostnames
        return { plane: 'central', tenantSlug: info.tenantSlug };
    }
    return { plane: info.plane, tenantSlug: info.tenantSlug };
}
/**
 * Plane detection bridge for backwards compatibility.
 * Delegates to the unified src/portal resolver.
 */

import { resolvePortal } from '@/portal/resolve-portal';

export type Plane = 'central' | 'tenant' | 'dual';

export interface PlaneInfo {
    plane: Plane;
    tenantSlug: string | null;
}

export const PLANE_OVERRIDE_KEY = 'sheba_dev_portal_override';
export type PlaneOverride = 'central' | 'tenant';

export function detectPlane(hostname: string): PlaneInfo {
    const res = resolvePortal(hostname);
    if (res.portal === 'SUPER_ADMIN') {
        return { plane: 'central', tenantSlug: null };
    }
    if (res.portal === 'TENANT' || res.portal === 'ISP_ADMIN') {
        return { plane: 'tenant', tenantSlug: res.tenantSlug || null };
    }
    return { plane: 'dual', tenantSlug: null };
}

export function readPlaneOverride(): PlaneOverride | null {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(PLANE_OVERRIDE_KEY);
    if (v === 'SUPER_ADMIN' || v === 'central') return 'central';
    if (v === 'ISP_ADMIN' || v === 'TENANT' || v === 'tenant') return 'tenant';
    return null;
}

export function writePlaneOverride(value: PlaneOverride | null): void {
    if (typeof window === 'undefined') return;
    if (value === null) {
        window.localStorage.removeItem(PLANE_OVERRIDE_KEY);
    } else {
        window.localStorage.setItem(PLANE_OVERRIDE_KEY, value === 'central' ? 'SUPER_ADMIN' : 'ISP_ADMIN');
    }
}

export function effectivePlane(): { plane: 'central' | 'tenant'; tenantSlug: string | null } {
    if (typeof window === 'undefined') {
        return { plane: 'central', tenantSlug: null };
    }
    const override = readPlaneOverride();
    if (override) {
        return { plane: override, tenantSlug: null };
    }
    const detected = detectPlane(window.location.hostname);
    if (detected.plane === 'dual') {
        return { plane: 'central', tenantSlug: null };
    }
    return { plane: detected.plane, tenantSlug: detected.tenantSlug };
}
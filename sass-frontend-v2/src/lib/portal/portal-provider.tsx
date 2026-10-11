'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { resolvePortal } from './resolve-portal';
import type { PortalContextValue, PortalType, TenantBranding } from './types';

const PortalContext = createContext<PortalContextValue | null>(null);

const DEV_OVERRIDE_KEY = 'sheba_dev_portal_override';
const DEV_TENANT_KEY = 'sheba_dev_tenant_override';

function getHostname(): string {
    if (typeof window === 'undefined') return 'localhost';
    return window.location.hostname;
}

function getSearch(): string {
    if (typeof window === 'undefined') return '';
    return window.location.search;
}

function readDevOverride(): { portal: PortalType | null; tenant: string | null } {
    if (typeof window === 'undefined') return { portal: null, tenant: null };
    const portal = window.localStorage.getItem(DEV_OVERRIDE_KEY) as PortalType | null;
    const tenant = window.localStorage.getItem(DEV_TENANT_KEY);
    return { portal, tenant };
}

export interface PortalProviderProps {
    children: React.ReactNode;
    /** Force a specific portal resolution (overrides hostname + dev override). */
    forced?: PortalContextValue;
}

export function PortalProvider({ children, forced }: PortalProviderProps) {
    const [override, setOverride] = useState<{ portal: PortalType | null; tenant: string | null }>(() => readDevOverride());
    const [branding, setBranding] = useState<TenantBranding | null>(null);
    const [isLoadingBranding, setIsLoadingBranding] = useState(false);

    const resolution = useMemo<PortalContextValue>(() => {
        if (forced) return forced;
        const r = resolvePortal(getHostname(), {
            searchParams: getSearch(),
            devOverridePortal: override.portal,
            devOverrideTenant: override.tenant,
        });
        return { ...r, branding: null, isLoadingBranding: false };
    }, [forced, override.portal, override.tenant]);

    const switchPortalDev = useCallback((portal: PortalType, tenantSlug?: string) => {
        if (typeof window === 'undefined') return;
        setOverride({ portal, tenant: tenantSlug ?? null });
        window.localStorage.setItem(DEV_OVERRIDE_KEY, portal);
        if (tenantSlug) {
            window.localStorage.setItem(DEV_TENANT_KEY, tenantSlug);
        } else {
            window.localStorage.removeItem(DEV_TENANT_KEY);
        }
    }, []);

    // Hydrate branding for TENANT portal
    useEffect(() => {
        if (resolution.portal !== 'TENANT') {
            setBranding(null);
            return;
        }
        const slug = resolution.tenantSlug;
        if (!slug) return;
        // Provide an immediate placeholder so the UI doesn't flash unbranded.
        const fallbackName = slug.charAt(0).toUpperCase() + slug.slice(1) + ' ISP';
        setBranding({
            name: fallbackName,
            slug,
            isActive: true,
            themeMode: 'dark',
        });
        setIsLoadingBranding(true);
        return () => setIsLoadingBranding(false);
    }, [resolution.portal, resolution.tenantSlug]);

    const value = useMemo<PortalContextValue>(
        () => ({
            ...resolution,
            branding,
            isLoadingBranding,
            switchPortalDev,
        }),
        [resolution, branding, isLoadingBranding, switchPortalDev],
    );

    return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalContextValue {
    const ctx = useContext(PortalContext);
    if (ctx) return ctx;
    // Safe fallback for components rendered before provider mounts.
    return {
        portal: 'SUPER_ADMIN',
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'admin.example.com',
        isCustomDomain: false,
        branding: null,
        isLoadingBranding: false,
        switchPortalDev: () => undefined,
    };
}
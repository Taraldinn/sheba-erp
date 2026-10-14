'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { resolvePortal } from './resolve-portal';
import type { PortalContextValue, PortalType, TenantBranding } from './types';

const PortalContext = createContext<PortalContextValue | null>(null);

const DEV_OVERRIDE_KEY = 'sheba_dev_portal_override';
const DEV_TENANT_KEY = 'sheba_dev_tenant_override';

import Cookies from 'js-cookie';

function getHostname(initialHost?: string): string {
    if (typeof window !== 'undefined') return window.location.hostname;
    if (initialHost) return initialHost.split(':')[0].toLowerCase().trim();
    return 'localhost';
}

function getSearch(): string {
    if (typeof window === 'undefined') return '';
    return window.location.search;
}

function readDevOverride(): { portal: PortalType | null; tenant: string | null } {
    if (typeof window === 'undefined') return { portal: null, tenant: null };
    const portal = window.localStorage.getItem(DEV_OVERRIDE_KEY) as PortalType | null;
    const tenant = window.localStorage.getItem(DEV_TENANT_KEY) || Cookies.get('saas_tenant_slug') || null;
    return { portal, tenant };
}

export interface PortalProviderProps {
    children: React.ReactNode;
    /** Server-rendered host header to prevent SSR hydration mismatch. */
    initialHost?: string;
    /** Server-rendered tenant cookie to prevent SSR hydration mismatch. */
    initialTenant?: string | null;
    /** Force a specific portal resolution (overrides hostname + dev override). */
    forced?: PortalContextValue;
}

export function PortalProvider({ children, forced, initialHost, initialTenant }: PortalProviderProps) {
    const pathname = usePathname();

    // Start with no dev override so the first render matches the server render
    // (server has no localStorage / window). Hydrate the override in an effect.
    const [override, setOverride] = useState<{ portal: PortalType | null; tenant: string | null }>({
        portal: null,
        tenant: null,
    });
    const [customBranding, setCustomBranding] = useState<TenantBranding | null>(null);
    const [isLoadingBranding, setIsLoadingBranding] = useState(false);

    // Pick up any previously stored dev override after mount.
    useEffect(() => {
        setOverride(readDevOverride());
    }, []);

    const resolution = useMemo<PortalContextValue>(() => {
        if (forced) return forced;
        const currentHostname = getHostname(initialHost);
        const currentPathname = pathname || (typeof window !== 'undefined' ? window.location.pathname : undefined);
        const r = resolvePortal(currentHostname, {
            pathname: currentPathname,
            searchParams: getSearch(),
            devOverridePortal: override.portal,
            devOverrideTenant: override.tenant || initialTenant || null,
        });
        return { ...r, branding: null, isLoadingBranding: false };
    }, [forced, initialHost, initialTenant, override.portal, override.tenant, pathname]);

    // Compute immediate fallback branding synchronously on both SSR and client
    const initialBranding = useMemo<TenantBranding | null>(() => {
        if (resolution.portal !== 'TENANT' || !resolution.tenantSlug) return null;
        const slug = resolution.tenantSlug;
        return {
            name: slug.charAt(0).toUpperCase() + slug.slice(1) + ' ISP',
            slug,
            isActive: true,
            themeMode: 'dark',
        };
    }, [resolution.portal, resolution.tenantSlug]);

    const branding = customBranding ?? initialBranding;

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
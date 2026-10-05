import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolvePortal } from './resolve-portal';
import type { PortalContextValue, PortalType, TenantBranding } from './types';

const PortalContext = createContext<PortalContextValue | null>(null);

const DEV_OVERRIDE_KEY = 'sheba_dev_portal_override';
const DEV_TENANT_KEY = 'sheba_dev_tenant_override';

export function PortalProvider({ children }: { children: React.ReactNode }) {
    const [overridePortal, setOverridePortal] = useState<PortalType | null>(() => {
        if (typeof window === 'undefined') return null;
        return (window.localStorage.getItem(DEV_OVERRIDE_KEY) as PortalType) || null;
    });

    const [overrideTenant, setOverrideTenant] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return window.localStorage.getItem(DEV_TENANT_KEY) || null;
    });

    const [branding, setBranding] = useState<TenantBranding | null>(null);
    const [isLoadingBranding] = useState(false);

    // Initial resolution based on window location and dev overrides
    const resolution = useMemo(() => {
        const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        const search = typeof window !== 'undefined' ? window.location.search : '';

        return resolvePortal(hostname, {
            searchParams: search,
            devOverridePortal: overridePortal,
            devOverrideTenant: overrideTenant,
        });
    }, [overridePortal, overrideTenant]);

    // Development switch helper
    const switchPortalDev = (portal: PortalType, tenantSlug?: string) => {
        if (typeof window === 'undefined') return;
        setOverridePortal(portal);
        window.localStorage.setItem(DEV_OVERRIDE_KEY, portal);

        if (tenantSlug) {
            setOverrideTenant(tenantSlug);
            window.localStorage.setItem(DEV_TENANT_KEY, tenantSlug);
        } else {
            setOverrideTenant(null);
            window.localStorage.removeItem(DEV_TENANT_KEY);
        }
    };

    // Synchronize branding for TENANT portal mode
    useEffect(() => {
        if (resolution.portal !== 'TENANT') {
            setBranding(null);
            return;
        }

        const slug = resolution.tenantSlug;
        if (!slug) return;

        // Apply fallback immediate branding based on slug
        const fallbackName = slug.charAt(0).toUpperCase() + slug.slice(1) + ' ISP';
        setBranding({
            name: fallbackName,
            slug,
            isActive: true,
            themeMode: 'dark',
            accentColor: 'indigo',
        });
    }, [resolution.portal, resolution.tenantSlug]);

    const value: PortalContextValue = {
        ...resolution,
        branding,
        isLoadingBranding,
        switchPortalDev,
    };

    return (
        <PortalContext.Provider value={value}>
            {children}
        </PortalContext.Provider>
    );
}

export function usePortal(): PortalContextValue {
    const ctx = useContext(PortalContext);
    if (!ctx) {
        throw new Error('usePortal must be used within a <PortalProvider>');
    }
    return ctx;
}

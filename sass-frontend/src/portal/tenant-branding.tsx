import { useEffect } from 'react';
import { usePortal } from './portal-provider';

// Curated Oklch / HSL hex shades for tenant dynamic brand styling
const ACCENT_PALETTES: Record<string, { brand50: string; brand500: string; brand600: string; brand700: string }> = {
    indigo: {
        brand50: '#eef2ff',
        brand500: '#6366f1',
        brand600: '#4f46e5',
        brand700: '#4338ca',
    },
    emerald: {
        brand50: '#ecfdf5',
        brand500: '#10b981',
        brand600: '#059669',
        brand700: '#047857',
    },
    violet: {
        brand50: '#f5f3ff',
        brand500: '#8b5cf6',
        brand600: '#7c3aed',
        brand700: '#6d28d9',
    },
    cyan: {
        brand50: '#ecfeff',
        brand500: '#06b6d4',
        brand600: '#0891b2',
        brand700: '#0e7490',
    },
    amber: {
        brand50: '#fffbeb',
        brand500: '#f59e0b',
        brand600: '#d97706',
        brand700: '#b45309',
    },
    rose: {
        brand50: '#fff1f2',
        brand500: '#f43f5e',
        brand600: '#e11d48',
        brand700: '#be123c',
    },
};

export function TenantBrandingInjector() {
    const portal = usePortal();

    useEffect(() => {
        if (portal.portal !== 'TENANT' || !portal.branding) {
            // Revert to default branding
            document.title = 'ShebaFi ERP | Multi-Tenant ISP Cloud';
            return;
        }

        const branding = portal.branding;
        const tenantName = branding.name || `${portal.tenantSlug} ISP`;

        // 1. Dynamic document title
        document.title = `${tenantName} — Subscriber Self-Care`;

        // 2. Favicon injection
        if (branding.faviconUrl) {
            let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = branding.faviconUrl;
        }

        // 3. Dynamic CSS custom property injection
        const accentKey = branding.accentColor || 'indigo';
        const palette = ACCENT_PALETTES[accentKey] || ACCENT_PALETTES.indigo;

        const root = document.documentElement;
        root.style.setProperty('--color-brand-50', palette.brand50);
        root.style.setProperty('--color-brand-500', palette.brand500);
        root.style.setProperty('--color-brand-600', palette.brand600);
        root.style.setProperty('--color-brand-700', palette.brand700);

        return () => {
            root.style.removeProperty('--color-brand-50');
            root.style.removeProperty('--color-brand-500');
            root.style.removeProperty('--color-brand-600');
            root.style.removeProperty('--color-brand-700');
        };
    }, [portal.portal, portal.branding, portal.tenantSlug]);

    return null;
}

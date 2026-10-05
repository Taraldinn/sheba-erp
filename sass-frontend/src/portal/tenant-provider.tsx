import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { usePortal } from './portal-provider';
import type { TenantBranding } from './types';
import { saasApi, tenantApi } from '@/api/client';

export interface TenantInfo {
    slug: string;
    id?: string;
    name: string;
    status: 'active' | 'suspended' | 'trial' | 'past_due' | 'not_found' | 'unknown';
    branding: TenantBranding | null;
    logo?: string;
    favicon?: string;
    theme?: 'light' | 'dark' | 'system' | 'midnight' | 'cyberpunk';
    accentColor?: string;
    currency?: string;
    enabledModules: string[];
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

const TenantContext = createContext<TenantInfo | null>(null);

// Curated palette hex colors matching backend accent_color choices
const ACCENT_COLOR_MAP: Record<string, { primary: string; secondary: string; accent: string }> = {
    indigo: { primary: '#6366f1', secondary: '#4f46e5', accent: '#4338ca' },
    emerald: { primary: '#10b981', secondary: '#059669', accent: '#047857' },
    violet: { primary: '#8b5cf6', secondary: '#7c3aed', accent: '#6d28d9' },
    cyan: { primary: '#06b6d4', secondary: '#0891b2', accent: '#0e7490' },
    amber: { primary: '#f59e0b', secondary: '#d97706', accent: '#b45309' },
    rose: { primary: '#f43f5e', secondary: '#e11d48', accent: '#be123c' },
};

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const portal = usePortal();
    const slug = portal.tenantSlug || '';

    const [tenantData, setTenantData] = useState<{
        id?: string;
        name: string;
        status: 'active' | 'suspended' | 'trial' | 'past_due' | 'not_found' | 'unknown';
        logo?: string;
        favicon?: string;
        theme?: 'light' | 'dark' | 'system' | 'midnight' | 'cyberpunk';
        accentColor?: string;
        currency?: string;
        enabledModules: string[];
    } | null>(() => {
        if (!slug || (portal.portal !== 'TENANT' && portal.portal !== 'ISP_ADMIN')) return null;
        const initialName = slug.charAt(0).toUpperCase() + slug.slice(1) + ' Broadband';
        return {
            name: initialName,
            status: 'active',
            currency: 'BDT',
            theme: 'dark',
            accentColor: 'indigo',
            enabledModules: ['customers', 'billing', 'network', 'tickets'],
        };
    });

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTenant = useCallback(async () => {
        // If not a tenant portal or no slug, clear tenant info
        if (portal.portal !== 'TENANT' && portal.portal !== 'ISP_ADMIN') {
            setTenantData(null);
            setError(null);
            return;
        }

        const effectiveSlug = slug || 'default';
        setIsLoading(true);
        setError(null);

        try {
            // 1. Primary path: Call authoritative public tenant resolve endpoint
            const res = await tenantApi.resolve(effectiveSlug);
            if (res && res.id) {
                setTenantData({
                    id: res.id,
                    name: res.name || `${effectiveSlug.toUpperCase()} Broadband`,
                    status: res.status || (res.is_active ? 'active' : 'suspended'),
                    logo: res.logo,
                    favicon: res.favicon,
                    currency: res.branding?.currency_code || 'BDT',
                    theme: res.branding?.theme_mode || 'dark',
                    accentColor: res.branding?.accent_color || 'indigo',
                    enabledModules: res.enabled_modules || ['customers', 'billing', 'network', 'tickets'],
                });
                return;
            }
        } catch (resolveErr: any) {
            // 2. Secondary fallback (e.g. dev/control plane)
            try {
                const backendTenant = await saasApi.getTenantBySlug(effectiveSlug);
                if (backendTenant) {
                    setTenantData({
                        id: backendTenant.id,
                        name: backendTenant.name || `${effectiveSlug.toUpperCase()} Network`,
                        status: backendTenant.is_active !== false ? 'active' : 'suspended',
                        currency: 'BDT',
                        theme: 'dark',
                        accentColor: 'indigo',
                        enabledModules: ['customers', 'billing', 'network', 'tickets'],
                    });
                    return;
                }
            } catch {
                // Ignore fallback error
            }

            if (resolveErr?.status === 404) {
                setError(`Tenant "${effectiveSlug}" not found`);
                setTenantData({
                    id: undefined,
                    name: `${effectiveSlug.toUpperCase()} (Not Found)`,
                    status: 'not_found',
                    currency: 'BDT',
                    theme: 'dark',
                    accentColor: 'indigo',
                    enabledModules: [],
                });
                return;
            }

            // Default fallback for offline dev/storybook
            const fallbackName = effectiveSlug.charAt(0).toUpperCase() + effectiveSlug.slice(1) + ' Broadband';
            setTenantData({
                id: undefined,
                name: fallbackName,
                status: 'active',
                currency: 'BDT',
                theme: 'dark',
                accentColor: 'indigo',
                enabledModules: ['customers', 'billing', 'network', 'tickets'],
            });
        } finally {
            setIsLoading(false);
        }
    }, [portal.portal, slug]);

    useEffect(() => {
        fetchTenant();
    }, [fetchTenant]);

    // ── Semantic CSS Custom Property and Document Branding Injection ──────────
    useEffect(() => {
        if (!tenantData || portal.portal !== 'TENANT') {
            return;
        }

        const root = document.documentElement;
        const accentKey = tenantData.accentColor || 'indigo';
        const colors = ACCENT_COLOR_MAP[accentKey] || ACCENT_COLOR_MAP.indigo;

        // Semantic CSS variables for dynamic tenant branding
        root.style.setProperty('--tenant-primary', colors.primary);
        root.style.setProperty('--tenant-secondary', colors.secondary);
        root.style.setProperty('--tenant-accent', colors.accent);

        // Update document title and favicon
        document.title = `${tenantData.name} — Self-Care Portal`;

        if (tenantData.favicon) {
            let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = tenantData.favicon;
        }

        return () => {
            root.style.removeProperty('--tenant-primary');
            root.style.removeProperty('--tenant-secondary');
            root.style.removeProperty('--tenant-accent');
        };
    }, [tenantData, portal.portal]);

    const branding: TenantBranding | null = useMemo(() => {
        if (!tenantData) return null;
        return {
            name: tenantData.name,
            slug,
            logoUrl: tenantData.logo,
            faviconUrl: tenantData.favicon,
            accentColor: tenantData.accentColor,
            themeMode: tenantData.theme,
            currencySymbol: '৳',
            currencyCode: tenantData.currency || 'BDT',
            isActive: tenantData.status === 'active',
        };
    }, [tenantData, slug]);

    const formattedSlug = slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : '';

    const value: TenantInfo = {
        slug,
        id: tenantData?.id,
        name: tenantData?.name || (formattedSlug ? `${formattedSlug} Network` : 'ISP Portal'),
        status: tenantData?.status || 'unknown',
        branding,
        logo: tenantData?.logo,
        favicon: tenantData?.favicon,
        theme: tenantData?.theme || 'dark',
        accentColor: tenantData?.accentColor || 'indigo',
        currency: tenantData?.currency || 'BDT',
        enabledModules: tenantData?.enabledModules || [],
        isLoading,
        error,
        refetch: fetchTenant,
    };

    return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantInfo {
    const ctx = useContext(TenantContext);
    if (!ctx) {
        return {
            slug: '',
            name: 'ShebaFi Platform',
            status: 'active',
            branding: null,
            enabledModules: [],
            isLoading: false,
            error: null,
            refetch: async () => {},
        };
    }
    return ctx;
}

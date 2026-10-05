export type PortalType = 'PUBLIC_HOME' | 'SUPER_ADMIN' | 'ISP_ADMIN' | 'TENANT' | 'UNKNOWN';

export interface PortalResolution {
    portal: PortalType;
    tenantSlug?: string;
    hostname: string;
    isCustomDomain?: boolean;
    isDevelopment?: boolean;
}

export interface TenantBranding {
    name: string;
    slug: string;
    logoUrl?: string;
    faviconUrl?: string;
    accentColor?: 'indigo' | 'emerald' | 'violet' | 'cyan' | 'amber' | 'rose' | string;
    themeMode?: 'light' | 'dark' | 'system' | 'midnight' | 'cyberpunk';
    currencySymbol?: string;
    currencyCode?: string;
    supportPhone?: string;
    supportEmail?: string;
    isActive: boolean;
}

export interface PortalContextValue extends PortalResolution {
    branding: TenantBranding | null;
    isLoadingBranding: boolean;
    switchPortalDev?: (portal: PortalType, tenantSlug?: string) => void;
}

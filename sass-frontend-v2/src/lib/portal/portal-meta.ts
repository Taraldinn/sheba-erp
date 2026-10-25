import type { PortalType } from './types';

/**
 * Title / description / OG image per portal. Used by `usePortalMeta`
 * which routes update via the TanStack `head()` callback.
 *
 * Keep descriptions < 160 characters so they don't get truncated in
 * search results.
 */
export const PORTAL_META: Record<
    PortalType,
    { title: string; description: string; themeColor: string; ogType: 'website' | 'profile' }
> = {
    PUBLIC_HOME: {
        title: 'Shebafi — ISP ERP, SaaS, and Tenant Hosting',
        description: 'A multi-tenant ISP ERP and SaaS control plane. Provision tenants, manage domains, and run your ISP from one place.',
        themeColor: '#0f172a',
        ogType: 'website',
    },
    SUPER_ADMIN: {
        title: 'Shebafi — Super Admin',
        description: 'Platform control plane: provision tenants, manage domains, audit log, backups, and platform employees.',
        themeColor: '#1e293b',
        ogType: 'website',
    },
    ORGANIZATION_APP: {
        title: 'Shebafi — Organization Dashboard',
        description: 'Client organization dashboard: manage your organization, onboarding status, and tenant users.',
        themeColor: '#1e1b4b',
        ogType: 'website',
    },
    ISP_ADMIN: {
        title: 'Shebafi — ISP Workspace',
        description: 'Central ISP workspace: domains, modules, child tenants, resellers, and the ISP admin user.',
        themeColor: '#0c4a6e',
        ogType: 'website',
    },
    TENANT: {
        title: 'Shebafi — Tenant ERP',
        description: 'Tenant operations: customers, packages, subscriptions, invoices, payments, routers, and OLTs.',
        themeColor: '#0f766e',
        ogType: 'website',
    },
    UNKNOWN: {
        title: 'Shebafi',
        description: 'Shebafi ISP ERP & SaaS Control Plane',
        themeColor: '#0f172a',
        ogType: 'website',
    },
};

export function portalMeta(portal: PortalType): (typeof PORTAL_META)[PortalType] {
    return PORTAL_META[portal] ?? PORTAL_META.UNKNOWN;
}

/**
 * Default OG image. Each portal can override the image via a tenant
 * branding API. For now we ship a single 1200x630 PNG; in production
 * the public/landing page should have a custom one.
 */
export const DEFAULT_OG_IMAGE = '/og-default.png';

import type { ComponentType } from 'react';
import type { PortalType } from './types';
import {
    Activity,
    BarChart01,
    BookOpen01,
    Building07,
    CreditCard01,
    Database01,
    File06,
    Globe01,
    LayersThree01,
    Package,
    Receipt,
    Server01,
    Settings01,
    Signal01,
    Ticket01,
    Users01,
    Zap,
} from '@untitledui/icons';

export interface ModuleItem {
    id: string;
    label: string;
    path: string;
    icon: ComponentType<{ className?: string }>;
    portals: PortalType[];
    badge?: string;
    roles?: string[];
    description?: string;
}

export const MODULE_REGISTRY: ModuleItem[] = [
    // ── SUPER ADMIN MODULES (Global Platform Control) ──
    {
        id: 'saas-dashboard',
        label: 'Platform Overview',
        path: '/',
        icon: Activity,
        portals: ['SUPER_ADMIN'],
        description: 'Global SaaS metrics, active tenants, MRR and health',
    },
    {
        id: 'saas-tenants',
        label: 'ISP Tenants',
        path: '/tenants',
        icon: Building07,
        portals: ['SUPER_ADMIN'],
        description: 'Provision, suspend, and manage all ISP organizations',
    },
    {
        id: 'saas-onboarding',
        label: 'Onboarding Queue',
        path: '/onboarding',
        icon: BookOpen01,
        portals: ['SUPER_ADMIN'],
        description: 'Triage incoming ISP sign-up applications',
    },
    {
        id: 'saas-packages',
        label: 'Platform Plans',
        path: '/packages',
        icon: Package,
        portals: ['SUPER_ADMIN'],
        description: 'SaaS subscription packages and tier definitions',
    },
    {
        id: 'saas-subscriptions',
        label: 'Subscriptions',
        path: '/subscriptions',
        icon: CreditCard01,
        portals: ['SUPER_ADMIN'],
        description: 'Active ISP licenses and billing cycles',
    },
    {
        id: 'saas-payments',
        label: 'Platform Billing',
        path: '/payments',
        icon: Receipt,
        portals: ['SUPER_ADMIN'],
        description: 'Inbound SaaS subscription revenues',
    },
    {
        id: 'saas-domains',
        label: 'Custom Domains',
        path: '/domains',
        icon: Globe01,
        portals: ['SUPER_ADMIN'],
        description: 'SSL certificates and domain verification',
    },
    {
        id: 'saas-feature-matrix',
        label: 'Feature Catalog',
        path: '/feature-matrix',
        icon: LayersThree01,
        portals: ['SUPER_ADMIN'],
        description: 'Global and per-tenant feature-flag matrix',
    },
    {
        id: 'saas-employees',
        label: 'Platform Staff',
        path: '/employees',
        icon: Users01,
        portals: ['SUPER_ADMIN'],
        description: 'Global control plane operators and administrators',
    },
    {
        id: 'saas-backups',
        label: 'Disaster Recovery',
        path: '/backups',
        icon: Database01,
        portals: ['SUPER_ADMIN'],
        description: 'Automated database snapshots and storage usage',
    },
    {
        id: 'saas-audit-logs',
        label: 'Audit Trail',
        path: '/audit-logs',
        icon: File06,
        portals: ['SUPER_ADMIN'],
        description: 'Immutable security log of platform-level events',
    },

    // ── ISP ADMIN MODULES (ISP ERP Workspace) ──
    {
        id: 'isp-dashboard',
        label: 'Operations Cockpit',
        path: '/',
        icon: BarChart01,
        portals: ['ISP_ADMIN'],
        description: 'Daily bandwidth, active PPPoE sessions, revenue summary',
    },
    {
        id: 'isp-customers',
        label: 'Subscribers',
        path: '/customers',
        icon: Users01,
        portals: ['ISP_ADMIN'],
        description: 'Active, expired, and lead customer accounts',
    },
    {
        id: 'isp-billing',
        label: 'Billing & Invoices',
        path: '/billing',
        icon: Receipt,
        portals: ['ISP_ADMIN'],
        description: 'Monthly invoicing, bKash/Nagad collections, ledger',
    },
    {
        id: 'isp-network',
        label: 'Network & MikroTik',
        path: '/network',
        icon: Server01,
        portals: ['ISP_ADMIN'],
        description: 'Routers, POPs, OLTs, ONUs, and live traffic telemetry',
    },
    {
        id: 'isp-resellers',
        label: 'Reseller Hierarchy',
        path: '/resellers',
        icon: LayersThree01,
        portals: ['ISP_ADMIN'],
        description: 'L1/L2 reseller rates, credit allocations, and commissions',
    },
    {
        id: 'isp-tickets',
        label: 'Support Tickets',
        path: '/tickets',
        icon: Ticket01,
        portals: ['ISP_ADMIN'],
        description: 'NOC incidents, line issues, and customer care queue',
    },
    {
        id: 'isp-settings',
        label: 'ISP Settings',
        path: '/settings',
        icon: Settings01,
        portals: ['ISP_ADMIN'],
        description: 'Company profile, MFS gateways, SMS templates, themes',
    },

    // ── TENANT PORTAL MODULES (White-labelled Customer / Tenant Staff) ──
    {
        id: 'tenant-home',
        label: 'My Account',
        path: '/',
        icon: Globe01,
        portals: ['TENANT'],
        description: 'Current connection status, active package, and due balance',
    },
    {
        id: 'tenant-invoices',
        label: 'Bills & Payments',
        path: '/invoices',
        icon: Receipt,
        portals: ['TENANT'],
        description: 'Online bill payment via bKash / Nagad / cards',
    },
    {
        id: 'tenant-recharge',
        label: 'Instant Recharge',
        path: '/recharge',
        icon: Zap,
        portals: ['TENANT'],
        description: 'Renew internet pack or purchase speed boost',
    },
    {
        id: 'tenant-usage',
        label: 'Usage Analytics',
        path: '/usage',
        icon: Signal01,
        portals: ['TENANT'],
        description: 'Live daily bandwidth consumption and session history',
    },
    {
        id: 'tenant-support',
        label: 'Helpdesk & Complaints',
        path: '/support',
        icon: Ticket01,
        portals: ['TENANT'],
        description: 'Raise speed or line disruption tickets directly to NOC',
    },
];

export function getModulesForPortal(portal: PortalType): ModuleItem[] {
    return MODULE_REGISTRY.filter((m) => m.portals.includes(portal));
}

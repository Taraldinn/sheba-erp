import React, { useMemo } from 'react';
import { Outlet } from 'react-router';
import {
    BarChart01,
    CreditCard01,
    Globe01,
    Signal01,
    Ticket01,
    Users01,
    Settings01,
    Zap,
} from '@untitledui/icons';
import type { NavItemDividerType, NavItemType } from '@/components/application/app-navigation/config';
import { AppShell } from '@/components/application/app-shell/app-shell';
import { TenantBrandingInjector } from '@/portal/tenant-branding';
import { usePortal } from '@/portal/portal-provider';
import { useAuth, useHasPermission } from '@/portal/auth-provider';
import { AuthGuard } from '@/portal/auth-guard';

/**
 * Tenant portal layout — used for `{tenant}.example.com` hostnames.
 *
 *  - AuthGuard ensures only users with TENANT portal access enter.
 *  - Nav items are role-gated (CUSTOMER sees a small portal; ADMIN sees the
 *    full ISP operations workspace scoped to this tenant).
 *  - TenantBrandingInjector writes the tenant's accent palette + favicon.
 */
export function TenantLayout() {
    return (
        <AuthGuard portal="TENANT">
            <TenantLayoutInner />
        </AuthGuard>
    );
}

function TenantLayoutInner() {
    const portal = usePortal();
    const auth = useAuth();

    // ── Role / permission flags (rules of hooks: always called in same order) ──
    const isCustomer = auth.role === 'CUSTOMER';
    const canCustomers = useHasPermission('*', 'customer.view', 'customer.read');
    const canBilling = useHasPermission('*', 'invoice.view', 'billing.read');
    const canTickets = useHasPermission('*', 'ticket.view', 'ticket.read');
    const canReports = useHasPermission('*', 'report.view', 'analytics.view');
    const canNetwork = useHasPermission('*', 'router.view', 'olt.view', 'mikrotik.read');
    const canStaff = useHasPermission('*', 'staff.view', 'staff.manage');
    const canSettings = useHasPermission('*', 'setting.view', 'settings.read');

    // CUSTOMER portal visitors get a minimal nav even without permissions.
    const showCustomers = isCustomer || canCustomers;
    const showBilling = isCustomer || canBilling;
    const showTickets = isCustomer || canTickets;
    const showNetwork = !isCustomer && canNetwork;
    const showStaff = !isCustomer && canStaff;
    const showSettings = !isCustomer && canSettings;

    const tenantName = portal.branding?.name || `${portal.tenantSlug || 'Subscriber'} Portal`;
    const portalBadge = isCustomer ? 'Subscriber Portal' : 'ISP Workspace';
    const status = portal.branding?.isActive ? 'active' : 'suspended';

    const navItems: (NavItemType | NavItemDividerType)[] = useMemo(() => {
        const items: (NavItemType | NavItemDividerType)[] = [
            { label: isCustomer ? 'My Account' : 'Operations Cockpit', href: '/', icon: isCustomer ? Globe01 : BarChart01 },
        ];
        if (showCustomers) {
            items.push({
                label: isCustomer ? 'Profile & KYC' : 'Subscribers',
                href: '/customers',
                icon: Users01,
            });
        }
        if (showBilling) {
            items.push({
                label: isCustomer ? 'My Bills' : 'Billing & Invoices',
                href: '/billing',
                icon: CreditCard01,
            });
            items.push({
                label: isCustomer ? 'My Subscription' : 'Subscriptions',
                href: '/subscriptions',
                icon: Zap,
            });
        }
        if (!isCustomer && (canReports || showNetwork)) {
            items.push({
                label: 'Network Telemetry',
                href: '/reports',
                icon: Signal01,
            });
        }
        if (isCustomer && canReports) {
            items.push({ label: 'My Usage', href: '/usage', icon: Signal01 });
        }
        if (showTickets || showStaff || showSettings) items.push({ divider: true });
        if (showTickets) items.push({ label: 'Helpdesk', href: '/tickets', icon: Ticket01 });
        if (showStaff) items.push({ label: 'Staff', href: '/staff', icon: Users01 });
        if (showSettings) items.push({ label: 'Settings', href: '/settings', icon: Settings01 });
        return items;
    }, [isCustomer, showCustomers, showBilling, canReports, showNetwork, showTickets, showStaff, showSettings]);

    return (
        <>
            <TenantBrandingInjector />
            <AppShell
                navItems={navItems}
                portalName={tenantName}
                portalBadge={`${portalBadge} · ${status}`}
            >
                <Outlet />
            </AppShell>
        </>
    );
}

// Re-export under the canonical name used by portal-router.tsx
export const TenantPortalLayout = TenantLayout;
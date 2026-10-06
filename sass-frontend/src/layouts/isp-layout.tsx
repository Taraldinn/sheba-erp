import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import {
    BarChart01,
    Receipt,
    Server01,
    Settings01,
    Ticket01,
    Users01,
    CreditCard01,
    CpuChip01,
    Signal01,
    File06,
    Building07,
} from '@untitledui/icons';
import type { NavItemDividerType, NavItemType } from '@/components/application/app-navigation/config';
import { AppShell } from '@/components/application/app-shell/app-shell';
import { AuthGuard } from '@/portal/auth-guard';
import { useAuth, useHasPermission } from '@/portal/auth-provider';
import { usePortal } from '@/portal/portal-provider';
import { saasApi } from '@/api/client';
import { Button } from '@/components/base/buttons/button';
import { TenantBrandingInjector } from '@/portal/tenant-branding';

/**
 * ISP Admin layout — used for `app.example.xyz` hostnames.
 *
 *  - AuthGuard ensures only ISP_ADMIN / SUPER_ADMIN reach this tree.
 *  - Nav items are gated by the user's permissions.
 *  - A "Tenant workspace" switcher lets multi-tenant ISP operators
 *    (e.g. RESELLER, SUPER_ADMIN) jump to a specific tenant.
 */
export function IspLayout() {
    return (
        <AuthGuard portal={['ISP_ADMIN', 'SUPER_ADMIN']}>
            <IspLayoutInner />
        </AuthGuard>
    );
}

function IspLayoutInner() {
    const auth = useAuth();
    const portal = usePortal();
    const navigate = useNavigate();

    // ── Permission flags (rules of hooks) ────────────────────────────────
    const canCustomers = useHasPermission('*', 'customer.view', 'customer.read');
    const canBilling = useHasPermission('*', 'invoice.view', 'invoice.create', 'billing.read');
    const canSubscriptions = useHasPermission('*', 'subscription.manage', 'subscription.view');
    const canMikrotik = useHasPermission('*', 'router.manage', 'router.view', 'mikrotik.read');
    const canOlt = useHasPermission('*', 'olt.manage', 'olt.view');
    const canTickets = useHasPermission('*', 'ticket.view', 'ticket.manage');
    const canReports = useHasPermission('*', 'report.view', 'analytics.view');
    const canSettings = useHasPermission('*', 'setting.view', 'settings.read');
    const canStaff = useHasPermission('*', 'staff.view', 'staff.manage');
    const isMultiTenant = auth.portalAccess.isPlatformAdmin || auth.role === 'RESELLER' || auth.role === 'BANDWIDTH_RESELLER' || auth.role === 'DISTRIBUTOR';

    // ── Tenants (for multi-tenant switcher) ──────────────────────────────
    const [tenants, setTenants] = useState<Array<{ id: string; name: string; schema_name: string; is_active: boolean }>>([]);
    useEffect(() => {
        if (!isMultiTenant) return;
        saasApi.getTenants()
            .then((list) => setTenants(list.map((t) => ({
                id: t.id, name: t.name, schema_name: t.schema_name, is_active: t.is_active,
            }))))
            .catch(() => undefined);
    }, [isMultiTenant]);

    const switchToTenant = (slug: string) => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem('saas_tenant_slug', slug);
        // Navigate to that tenant's portal — hostname-agnostic for localhost.
        navigate(`/onboarding/${slug}/wizard`);
    };

    // ── Nav items ────────────────────────────────────────────────────────
    const navItems: (NavItemType | NavItemDividerType)[] = useMemo(() => {
        const items: (NavItemType | NavItemDividerType)[] = [
            { label: 'Operations Cockpit', href: '/', icon: BarChart01 },
        ];
        if (canCustomers) items.push({ label: 'Subscribers', href: '/customers', icon: Users01 });
        if (canBilling) items.push({ label: 'Billing & Invoices', href: '/billing', icon: Receipt });
        if (canSubscriptions) items.push({ label: 'Subscriptions', href: '/subscriptions', icon: CreditCard01 });
        if (canMikrotik || canOlt) items.push({ divider: true });
        if (canMikrotik) items.push({ label: 'MikroTik Routers', href: '/mikrotik', icon: Server01 });
        if (canMikrotik) items.push({ label: 'PPPoE Sessions', href: '/pppoe', icon: CpuChip01 });
        if (canOlt) items.push({ label: 'OLT Management', href: '/olt', icon: Signal01 });
        if (canOlt) items.push({ label: 'ONU Inventory', href: '/onu', icon: Server01 });
        if (canTickets || canStaff || canReports || canSettings) items.push({ divider: true });
        if (canTickets) items.push({ label: 'Helpdesk & Tickets', href: '/tickets', icon: Ticket01 });
        if (canStaff) items.push({ label: 'Staff', href: '/staff', icon: Users01 });
        if (canReports) items.push({ label: 'Financial Reports', href: '/reports', icon: File06 });
        if (canSettings) items.push({ label: 'Settings', href: '/settings', icon: Settings01 });
        return items;
    }, [canCustomers, canBilling, canSubscriptions, canMikrotik, canOlt, canTickets, canStaff, canReports, canSettings]);

    return (
        <>
            {portal.portal === 'TENANT' && <TenantBrandingInjector />}
            <AppShell
                navItems={navItems}
                portalName={portal.branding?.name || 'ISP Operations'}
                portalBadge={`ISP Admin${isMultiTenant ? ' · Multi-tenant' : ''}`}
                headerExtra={
                    isMultiTenant && tenants.length > 0 ? (
                        <TenantSwitcher tenants={tenants} onSwitch={switchToTenant} />
                    ) : null
                }
            >
                <Outlet />
            </AppShell>
        </>
    );
}

/** Small dropdown that lets a multi-tenant admin jump to a specific tenant. */
const TenantSwitcher = ({
    tenants, onSwitch,
}: { tenants: Array<{ id: string; name: string; schema_name: string; is_active: boolean }>; onSwitch: (slug: string) => void }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <Button
                size="sm"
                color="tertiary"
                iconLeading={Building07}
                onClick={() => setOpen((s) => !s)}
            >
                Switch tenant
            </Button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-border-secondary bg-bg-primary p-1 shadow-xl">
                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-tertiary">
                            Tenants
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                            {tenants.slice(0, 12).map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => { onSwitch(t.schema_name); setOpen(false); }}
                                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary_alt"
                                >
                                    <span className="truncate">{t.name}</span>
                                    <span className={`text-[10px] ${t.is_active ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {t.is_active ? 'active' : 'paused'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export const IspAdminLayout = IspLayout;
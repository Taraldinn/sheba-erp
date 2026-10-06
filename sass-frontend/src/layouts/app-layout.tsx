import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import {
    HomeLine,
    Rows01,
    Sliders01,
    LayoutAlt01,
    MessageChatCircle,
    PieChart03,
    Settings01,
    CreditCard01,
    Folder,
    ShieldTick,
    Users01,
} from '@untitledui/icons';
import type { NavItemDividerType, NavItemType } from '@/components/application/app-navigation/config';
import { saasApi } from '@/api/client';
import { AppShell } from '@/components/application/app-shell/app-shell';
import { AuthGuard } from '@/portal/auth-guard';
import { useAuth, useHasPermission } from '@/portal/auth-provider';

/**
 * Super Admin / SaaS Control Plane layout.
 *
 *  - AuthGuard ensures only SUPER_ADMIN (or delegates) reach this tree.
 *  - Nav items are gated by the user's permissions.
 *  - Pending onboarding requests drive a badge on the Onboarding nav.
 */
export function AppLayout() {
    const location = useLocation();
    const auth = useAuth();
    const [pendingOnboardingCount, setPendingOnboardingCount] = useState<number>(0);

    // ── Permission flags (rules of hooks: always called in same order) ──────
    const canTenants = useHasPermission('*', 'tenant.view', 'tenant.provision');
    const canDomains = useHasPermission('*', 'setting.manage', 'domain.view');
    const canPackages = useHasPermission('*', 'package.manage', 'package.view');
    const canSubscriptions = useHasPermission('*', 'subscription.manage', 'subscription.view');
    const canPayments = useHasPermission('*', 'payment.view', 'payment.reconcile');
    const canBackups = useHasPermission('*', 'setting.manage', 'backup.view');
    const canAudit = useHasPermission('*', 'audit.view');
    const canEmployees = useHasPermission('*', 'staff.view', 'staff.manage');
    const canOnboarding = useHasPermission('*', 'tenant.provision', 'onboarding.view');
    const canFeatureMatrix = useHasPermission('*', 'setting.manage', 'feature.view');

    // ── Pending onboarding badge ────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        saasApi.getOnboardingRequests()
            .then((requests) => {
                if (cancelled) return;
                setPendingOnboardingCount(
                    requests.filter((r: { status?: string }) => r.status === 'pending').length
                );
            })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [location.pathname]);

    // ── Nav items (visible only if the user has permission) ─────────────────
    const navItems: (NavItemType | NavItemDividerType)[] = useMemo(() => {
        const items: (NavItemType | NavItemDividerType)[] = [
            { label: 'Dashboard', href: '/', icon: HomeLine },
        ];
        if (canTenants) {
            items.push({ label: 'Tenants', href: '/tenants', icon: Rows01 });
            items.push({ label: 'Feature Matrix', href: '/feature-matrix', icon: Sliders01 });
        }
        if (canDomains) items.push({ label: 'Domains', href: '/domains', icon: LayoutAlt01 });
        if (canOnboarding) {
            items.push({
                label: 'Onboarding',
                href: '/onboarding',
                icon: MessageChatCircle,
                badge: pendingOnboardingCount > 0 ? pendingOnboardingCount : undefined,
            });
        }
        if (canPackages || canSubscriptions || canPayments) items.push({ divider: true });
        if (canPackages) items.push({ label: 'Packages', href: '/packages', icon: PieChart03 });
        if (canSubscriptions) items.push({ label: 'Subscriptions', href: '/subscriptions', icon: Settings01 });
        if (canPayments) items.push({ label: 'Payments', href: '/payments', icon: CreditCard01 });
        if (canBackups || canAudit || canEmployees) items.push({ divider: true });
        if (canBackups) items.push({ label: 'Backups', href: '/backups', icon: Folder });
        if (canAudit) items.push({ label: 'Audit Logs', href: '/audit-logs', icon: ShieldTick });
        if (canEmployees) items.push({ label: 'Team & Staff', href: '/employees', icon: Users01 });
        return items;
    }, [canTenants, canDomains, canOnboarding, canPackages, canSubscriptions, canPayments, canBackups, canAudit, canEmployees, pendingOnboardingCount]);

    return (
        <AuthGuard portal="SUPER_ADMIN">
            <AppShell navItems={navItems} portalName="ShebaFi Platform" portalBadge="Super Admin">
                <Outlet />
            </AppShell>
        </AuthGuard>
    );
}

// Re-export under the canonical name used by portal-router.tsx
export const SuperAdminLayout = AppLayout;
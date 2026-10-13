'use client';

import { DashboardShell } from '@/components/shell/dashboard-shell';
import { usePortal } from '@/lib/portal/portal-provider';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
    const portal = usePortal();
    const name = portal.branding?.name ?? portal.tenantSlug ?? 'Workspace';

    return (
        <DashboardShell rootHref="/tenant" rootLabel={name} environment="Live" errorLabel="tenant-route">
            {children}
        </DashboardShell>
    );
}
export const dynamic = 'force-dynamic';

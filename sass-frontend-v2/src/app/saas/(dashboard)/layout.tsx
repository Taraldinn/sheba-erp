'use client';

import { DashboardShell } from '@/components/shell/dashboard-shell';
import { ImpersonationBanner } from '@/components/impersonation-banner';

export default function SaasLayout({ children }: { children: React.ReactNode }) {
    return (
        <DashboardShell rootHref="/saas" rootLabel="Platform" environment="Control plane" errorLabel="saas-route" banner={<ImpersonationBanner />}>
            {children}
        </DashboardShell>
    );
}
export const dynamic = 'force-dynamic';

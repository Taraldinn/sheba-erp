'use client';

import { DashboardShell } from '@/components/shell/dashboard-shell';

export default function IspLayout({ children }: { children: React.ReactNode }) {
    return (
        <DashboardShell rootHref="/isp" rootLabel="ISP" environment="Operator" errorLabel="isp-route">
            {children}
        </DashboardShell>
    );
}
export const dynamic = 'force-dynamic';

'use client';

import { useQuery } from '@tanstack/react-query';
import { ispAdminApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { ErrorAlert, KpiCard, PageHeader, StatusBadge } from '@/components/feedback';


export default function IspOverview() {
    const overview = useQuery({ queryKey: queryKeys.ispAdminOverview(), queryFn: () => ispAdminApi.getOverview() });
    const o = overview.data;
    return (
        <div className="space-y-6">
            <PageHeader
                title={o?.tenant_name ?? 'ISP Workspace'}
                description={`Plan: ${o?.plan ?? '—'} · Subscription: ${o?.subscription_status ?? '—'}`}
            />
            {overview.error && <ErrorAlert title="Failed to load ISP overview" error={overview.error} />}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    label="Domains"
                    value={`${o?.verified_domain_count ?? 0} / ${o?.domain_count ?? 0}`}
                    hint={`${o?.verified_domain_count ?? 0} verified`}
                />
                <KpiCard
                    label="Modules"
                    value={`${o?.enabled_modules_count ?? 0} / ${o?.total_modules_count ?? 0}`}
                    hint="Enabled / available"
                />
                <KpiCard label="Staff" value={o?.staff_count ?? '—'} />
                <KpiCard
                    label="Child tenants"
                    value={`${o?.child_tenant_active_count ?? 0} / ${o?.child_tenant_count ?? 0}`}
                    hint="Active / total"
                />
                <KpiCard label="Aggregate subscribers" value={o?.aggregate_subscriber_count ?? '—'} />
                <KpiCard
                    label="Subscription"
                    value={o?.subscription_status ? <StatusBadge status={o.subscription_status} /> : '—'}
                />
            </div>
        </div>
    );
}

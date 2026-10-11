'use client';

import { useQuery } from '@tanstack/react-query';
import { saasApi } from '@/lib/api';
import { ErrorAlert, KpiCard, MoneyText, PageHeader, StatusBadge } from '@/components/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/lib/query/keys';

export default function SaasOverview() {
    const { data: overview, error: overviewError } = useQuery({
        queryKey: queryKeys.saasOverview(),
        queryFn: () => saasApi.getDashboardOverview(),
    });

    const { data: featureMatrix, error: matrixError } = useQuery({
        queryKey: ['saas', 'featureMatrix'],
        queryFn: () => saasApi.getFeatureMatrix(),
    });

    const error = overviewError || matrixError;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Platform overview"
                description="Top-level metrics for the Shebafi control plane."
            />
            {error && <ErrorAlert title="Failed to load platform overview" error={error as Error} />}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Tenants" value={overview?.total_tenants ?? '—'} />
                <KpiCard label="Active subscriptions" value={overview?.active_subscriptions ?? '—'} />
                <KpiCard label="MRR" value={<MoneyText value={overview?.mrr} />} />
                <KpiCard label="Pending onboarding" value={overview?.pending_onboarding ?? '—'} />
                <KpiCard label="Total revenue" value={<MoneyText value={overview?.total_revenue} />} />
                <KpiCard label="Storage used" value={formatBytes(overview?.storage_used_bytes)} />
                <KpiCard label="System health" value={overview?.system_health ? <StatusBadge status={overview.system_health} /> : '—'} />
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Feature matrix</CardTitle>
                </CardHeader>
                <CardContent>
                    {!featureMatrix && !error ? (
                        <p className="text-sm text-muted-foreground">Loading feature matrix…</p>
                    ) : error ? (
                        <p className="text-sm text-destructive">Failed to load feature matrix.</p>
                    ) : (
                        <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">
                            {JSON.stringify(featureMatrix, null, 2)}
                        </pre>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function formatBytes(bytes: number | undefined): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

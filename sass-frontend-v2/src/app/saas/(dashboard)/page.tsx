'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink } from 'lucide-react';

import { saasApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { ErrorAlert, KpiCard, MoneyText, PageHeader, StatusBadge } from '@/components/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function SaasOverview() {
    const { data: overview, error: overviewError } = useQuery({
        queryKey: queryKeys.saasOverview(),
        queryFn: () => saasApi.getDashboardOverview(),
    });

    const { data: featureMatrix, error: matrixError } = useQuery({
        queryKey: ['saas', 'featureMatrix'],
        queryFn: () => saasApi.getFeatureMatrix(),
    });

    const { data: orgs, isLoading: orgsLoading } = useQuery({
        queryKey: queryKeys.saasOrganizations.list({ page_size: '5' }),
        queryFn: () => saasApi.getOrganizations({ page_size: '5' }),
    });

    const error = overviewError || matrixError;
    const topOrgs = (orgs ?? [])
        .slice()
        .sort((a, b) => b.tenant_count - a.tenant_count)
        .slice(0, 5);

    const totalOrgs = orgs?.length ?? 0;
    const activeOrgs = (orgs ?? []).filter(o => o.is_active).length;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Platform overview"
                description="Top-level metrics for the Shebafi control plane."
            />
            {error && <ErrorAlert title="Failed to load platform overview" error={error as Error} />}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Organizations" value={orgsLoading ? '…' : totalOrgs} />
                <KpiCard label="Active organizations" value={orgsLoading ? '…' : activeOrgs} />
                <KpiCard label="Tenants" value={overview?.total_tenants ?? '—'} />
                <KpiCard label="Active subscriptions" value={overview?.active_subscriptions ?? '—'} />
                <KpiCard label="MRR" value={<MoneyText value={overview?.mrr} />} />
                <KpiCard label="Pending onboarding" value={overview?.pending_onboarding ?? '—'} />
                <KpiCard label="Total revenue" value={<MoneyText value={overview?.total_revenue} />} />
                <KpiCard label="Storage used" value={formatBytes(overview?.storage_used_bytes)} />
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Top organizations</CardTitle>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/saas/organizations">
                            <ExternalLink className="mr-1 h-3.5 w-3.5" /> See all
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent>
                    {orgsLoading ? (
                        <p className="text-sm text-muted-foreground">Loading organizations…</p>
                    ) : topOrgs.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border p-6 text-center">
                            <Building2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">No organizations yet.</p>
                            <Button asChild className="mt-3">
                                <Link href="/saas/organizations">Create the first organization</Link>
                            </Button>
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {topOrgs.map(o => (
                                <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{o.name}</p>
                                        <p className="text-xs text-muted-foreground">/{o.slug} · {o.contact_email || '—'}</p>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <Badge variant="secondary">{o.tenant_count} tenants</Badge>
                                        <Badge variant="outline">{o.active_subscription_count} subs</Badge>
                                        <StatusBadge status={o.is_active ? 'active' : 'suspended'} label={o.is_active ? 'Active' : 'Suspended'} />
                                        <Button asChild size="sm" variant="ghost">
                                            <Link href={`/saas/organizations/${o.id}`}>
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </Link>
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

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
'use client';

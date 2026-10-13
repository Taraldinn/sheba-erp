'use client';

import Link from 'next/link';
import { useQuery } from '@/lib/query/native';
import {
    Activity,
    Building2,
    CircleDollarSign,
    ClipboardList,
    DatabaseBackup,
    HardDrive,
    Inbox,
    Layers,
    Plus,
    ScrollText,
    Users,
} from 'lucide-react';

import { saasApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { ErrorAlert, MoneyText, StatusBadge } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHero, EmptyState, Meter, Panel, PanelLink, QuickAction, StatTile, StatusDot } from '@/components/dashboard/primitives';

export default function SaasOverview() {
    const { data: overview, error: overviewError, isLoading } = useQuery({
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
    const healthy = overview?.system_health === 'healthy';
    const sk = <Skeleton className="h-8 w-20" />;

    return (
        <div className="flex flex-col gap-6">
            <DashboardHero
                eyebrow="Control plane"
                title="Platform overview"
                description="Top-level metrics for the Shebafi control plane."
                actions={
                    <>
                        <Button asChild variant="outline">
                            <Link href="/saas/onboarding">
                                <Inbox className="size-4" aria-hidden="true" />
                                Review onboarding
                                {(overview?.pending_onboarding ?? 0) > 0 && (
                                    <Badge className="ml-1 h-5 px-1.5">{overview?.pending_onboarding}</Badge>
                                )}
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/saas/organizations">
                                <Plus className="size-4" aria-hidden="true" />
                                New organization
                            </Link>
                        </Button>
                    </>
                }
            >
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-muted/40 px-4 py-3">
                    <StatusDot ok={healthy} label={overview?.cluster_status ?? (healthy ? 'Operational' : 'Checking status…')} />
                    <span className="text-sm text-muted-foreground">
                        SLA target <span className="font-medium text-foreground">{overview?.sla_target ?? '—'}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                        Redis latency{' '}
                        <span className="font-medium tabular-nums text-foreground">
                            {overview?.redis_latency_ms != null ? `${overview.redis_latency_ms} ms` : '—'}
                        </span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                        Storage <span className="font-medium text-foreground">{formatBytes(overview?.storage_used_bytes)}</span>
                    </span>
                </div>
            </DashboardHero>

            {error && <ErrorAlert title="Failed to load platform overview" error={error as Error} />}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                    label="Monthly recurring revenue"
                    icon={CircleDollarSign}
                    value={isLoading ? sk : <MoneyText value={overview?.mrr} />}
                    hint={
                        <>
                            ARR <MoneyText value={overview?.annual_run_rate ?? (overview?.mrr ?? 0) * 12} />
                        </>
                    }
                    href="/saas/invoices"
                />
                <StatTile
                    label="Tenants"
                    icon={Layers}
                    tone="info"
                    value={isLoading ? sk : (overview?.total_tenants ?? 0).toLocaleString()}
                    hint={`${overview?.active_subscriptions ?? 0} active · ${overview?.suspended_tenants ?? 0} suspended`}
                    href="/saas/tenants"
                />
                <StatTile
                    label="Organizations"
                    icon={Building2}
                    tone="success"
                    value={orgsLoading ? sk : totalOrgs.toLocaleString()}
                    hint={`${activeOrgs} active`}
                    href="/saas/organizations"
                />
                <StatTile
                    label="Subscribers managed"
                    icon={Users}
                    tone="warning"
                    value={isLoading ? sk : (overview?.total_subscribers ?? 0).toLocaleString()}
                    hint={`${(overview?.active_subscribers ?? 0).toLocaleString()} active end-users`}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-5">
                <Panel
                    title="Top organizations"
                    description="Ranked by tenant count"
                    action={<PanelLink href="/saas/organizations">See all</PanelLink>}
                    className="xl:col-span-3"
                >
                    {orgsLoading ? (
                        <div className="flex flex-col gap-3">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : topOrgs.length === 0 ? (
                        <EmptyState icon={Building2} title="No organizations yet.">
                            <Button asChild size="sm">
                                <Link href="/saas/organizations">Create the first organization</Link>
                            </Button>
                        </EmptyState>
                    ) : (
                        <ul className="divide-y divide-border">
                            {topOrgs.map(o => (
                                <li key={o.id}>
                                    <Link
                                        href={`/saas/organizations/${o.id}`}
                                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
                                    >
                                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold uppercase text-primary">
                                            {o.name.slice(0, 2)}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{o.name}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                /{o.slug} · {o.contact_email || '—'}
                                            </p>
                                        </div>
                                        <div className="hidden items-center gap-2 text-xs sm:flex">
                                            <Badge variant="secondary">{o.tenant_count} tenants</Badge>
                                            <Badge variant="outline">{o.active_subscription_count} subs</Badge>
                                        </div>
                                        <StatusBadge status={o.is_active ? 'active' : 'suspended'} label={o.is_active ? 'Active' : 'Suspended'} />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel title="Fleet across tenants" description="Network infrastructure under management" className="xl:col-span-2">
                    <div className="flex flex-col gap-5">
                        <Meter label="Routers online" value={overview?.online_routers ?? 0} total={overview?.total_routers ?? 0} tone="success" />
                        <Meter label="ONUs online" value={overview?.online_onus ?? 0} total={overview?.total_onus ?? 0} />
                        <Meter label="Active POPs" value={overview?.active_pops ?? 0} total={overview?.total_pops ?? 0} tone="primary" />
                        <dl className="grid grid-cols-3 gap-3 pt-1">
                            {[
                                ['OLTs', overview?.total_olts],
                                ['Packages', overview?.total_packages],
                                ['Staff', overview?.total_staff],
                            ].map(([label, value]) => (
                                <div key={label as string} className="rounded-xl border border-border p-3">
                                    <dt className="text-xs text-muted-foreground">{label}</dt>
                                    <dd className="mt-1 text-lg font-semibold tabular-nums">{(value as number | undefined) ?? 0}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </Panel>
            </div>

            <Panel title="Platform shortcuts">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <QuickAction href="/saas/tenants" label="Tenants" hint="Provision & suspend" icon={Layers} />
                    <QuickAction href="/saas/billing-reconcile" label="Reconcile" hint="Match payments" icon={ClipboardList} />
                    <QuickAction href="/saas/backups" label="Backups" hint="Snapshots & restore" icon={DatabaseBackup} />
                    <QuickAction href="/saas/health" label="Health" hint="Services & latency" icon={Activity} />
                    <QuickAction href="/saas/audit" label="Audit log" hint="Every admin action" icon={ScrollText} />
                    <QuickAction href="/saas/jobs" label="Jobs" hint="Background workers" icon={HardDrive} />
                </div>
            </Panel>

            <details className="group rounded-xl border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-sm font-medium">
                    Feature matrix
                    <span className="text-xs text-muted-foreground group-open:hidden">Show raw data</span>
                    <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
                </summary>
                <div className="border-t border-border px-6 py-4">
                    {!featureMatrix && !error ? (
                        <p className="text-sm text-muted-foreground">Loading feature matrix…</p>
                    ) : error ? (
                        <p className="text-sm text-destructive">Failed to load feature matrix.</p>
                    ) : (
                        <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(featureMatrix, null, 2)}</pre>
                    )}
                </div>
            </details>
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

'use client';

import Link from 'next/link';
import { Blocks, CalendarClock, Globe, Network, Package, Plus, Router, Store, UserCog, Users } from 'lucide-react';
import { useQuery } from '@/lib/query/native';
import { ispAdminApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { ErrorAlert, StatusBadge } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHero, Meter, Panel, PanelLink, QuickAction, StatTile } from '@/components/dashboard/primitives';

export default function IspOverview() {
    const overview = useQuery({ queryKey: queryKeys.ispAdminOverview(), queryFn: () => ispAdminApi.getOverview() });
    const o = overview.data;
    const loading = overview.isLoading;
    const sk = <Skeleton className="h-8 w-16" />;

    const expires = o?.subscription_expires_at ? new Date(o.subscription_expires_at) : null;
    const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86_400_000) : null;

    return (
        <div className="flex flex-col gap-6">
            <DashboardHero
                eyebrow="ISP workspace"
                title={o?.tenant_name ?? 'Your ISP workspace'}
                description={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                            Plan <strong className="font-medium text-foreground">{o?.plan ?? '—'}</strong>
                        </span>
                        {o?.subscription_status && <StatusBadge status={o.subscription_status} />}
                        {o?.tenant_slug && <span className="font-mono text-xs">/{o.tenant_slug}</span>}
                    </span>
                }
                actions={
                    <>
                        <Button asChild variant="outline">
                            <Link href="/isp/domains">
                                <Globe className="size-4" aria-hidden="true" />
                                Domains
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/isp/child-tenants">
                                <Plus className="size-4" aria-hidden="true" />
                                New child tenant
                            </Link>
                        </Button>
                    </>
                }
            />

            {overview.error && <ErrorAlert title="Failed to load ISP overview" error={overview.error} />}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                    label="Aggregate subscribers"
                    icon={Users}
                    value={loading ? sk : (o?.aggregate_subscriber_count ?? 0).toLocaleString()}
                    hint="Across all child tenants"
                    href="/isp/customers"
                />
                <StatTile
                    label="Child tenants"
                    icon={Network}
                    tone="info"
                    value={loading ? sk : `${o?.child_tenant_active_count ?? 0} / ${o?.child_tenant_count ?? 0}`}
                    hint="Active / total"
                    href="/isp/child-tenants"
                />
                <StatTile
                    label="Staff"
                    icon={UserCog}
                    tone="success"
                    value={loading ? sk : (o?.staff_count ?? 0).toLocaleString()}
                    hint="Workspace members"
                />
                <StatTile
                    label="Renewal"
                    icon={CalendarClock}
                    tone={daysLeft !== null && daysLeft < 14 ? 'warning' : 'primary'}
                    value={loading ? sk : daysLeft === null ? '—' : `${Math.max(daysLeft, 0)} days`}
                    hint={expires ? `Expires ${expires.toLocaleDateString()}` : 'No expiry set'}
                    href="/isp/subscriptions"
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Workspace setup" description="Domains and modules configured for your brand">
                    <div className="flex flex-col gap-5">
                        <Meter
                            label="Verified domains"
                            value={o?.verified_domain_count ?? 0}
                            total={o?.domain_count ?? 0}
                            tone="success"
                        />
                        <Meter
                            label="Enabled modules"
                            value={o?.enabled_modules_count ?? 0}
                            total={o?.total_modules_count ?? 0}
                        />
                        <Meter
                            label="Active child tenants"
                            value={o?.child_tenant_active_count ?? 0}
                            total={o?.child_tenant_count ?? 0}
                            tone="primary"
                        />
                    </div>
                </Panel>

                <Panel title="Manage" action={<PanelLink href="/isp/modules">All settings</PanelLink>}>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <QuickAction href="/isp/domains" label="Domains" hint="Connect branded hostnames" icon={Globe} />
                        <QuickAction href="/isp/modules" label="Modules" hint="Toggle product features" icon={Blocks} />
                        <QuickAction href="/isp/packages" label="Packages" hint="Bandwidth plans & pricing" icon={Package} />
                        <QuickAction href="/isp/resellers" label="Resellers" hint="Wallets & collections" icon={Store} />
                        <QuickAction href="/isp/routers" label="Routers" hint="MikroTik fleet" icon={Router} />
                        <QuickAction href="/isp/customers" label="Customers" hint="Search all subscribers" icon={Users} />
                    </div>
                </Panel>
            </div>
        </div>
    );
}

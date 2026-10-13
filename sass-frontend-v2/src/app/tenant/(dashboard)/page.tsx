'use client';

import Link from 'next/link';
import {
    CircleDollarSign,
    FileText,
    Headset,
    Package,
    Receipt,
    Router,
    UserCheck,
    UserPlus,
    Users,
    Wallet,
} from 'lucide-react';
import { useQuery } from '@/lib/query/native';
import { reportsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { ErrorAlert, MoneyText, StatusBadge } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHero, EmptyState, Meter, Panel, PanelLink, QuickAction, StatTile } from '@/components/dashboard/primitives';
import { CollectionChart, TrafficChart, type TrafficPoint, type TrendPoint } from '@/components/dashboard/tenant-charts';

interface TenantKpis {
    total_customers?: number;
    active_customers?: number;
    expired_customers?: number;
    suspended_customers?: number;
    today_collection?: number;
    month_collection?: number;
    total_due?: number;
    total_advance?: number;
    online_routers?: number;
    total_routers?: number;
    total_onus?: number;
    online_onus?: number;
    warning_onus?: number;
    critical_onus?: number;
    open_tickets?: number;
}

type RecentPayment = { id: string; customer_name?: string; amount?: number | string; status?: string; created_at?: string };

export default function TenantDashboard() {
    const dashboard = useQuery({
        queryKey: queryKeys.tenantDashboard(),
        queryFn: () => reportsApi.dashboard(),
    });
    const o = dashboard.data;
    const k = (o?.kpis ?? {}) as TenantKpis;
    const trend = (o?.monthly_trend ?? []) as TrendPoint[];
    const traffic = (o?.traffic_distribution ?? []) as TrafficPoint[];
    const payments = (o?.recent_payments ?? []) as RecentPayment[];
    const loading = dashboard.isLoading;

    const totalCustomers = Number(o?.total_customers ?? 0);
    const activeCustomers = Number(o?.active_subscriptions ?? 0);
    const activeRate = totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 0;

    return (
        <div className="flex flex-col gap-6">
            <DashboardHero
                eyebrow="Operations"
                title="Good to see you. Here's today at a glance."
                description={
                    <>
                        Collected <MoneyText value={k.today_collection ?? 0} className="font-medium text-foreground" /> today ·{' '}
                        {k.open_tickets ?? 0} open tickets
                    </>
                }
                actions={
                    <>
                        <Button asChild variant="outline">
                            <Link href="/tenant/invoices">
                                <FileText className="size-4" aria-hidden="true" />
                                Run billing
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/tenant/customers">
                                <UserPlus className="size-4" aria-hidden="true" />
                                Add subscriber
                            </Link>
                        </Button>
                    </>
                }
            />

            {dashboard.error && <ErrorAlert title="Failed to load dashboard" error={dashboard.error} />}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                    label="Total subscribers"
                    icon={Users}
                    value={loading ? <Skeleton className="h-8 w-20" /> : totalCustomers.toLocaleString()}
                    hint={`${k.expired_customers ?? 0} expired · ${k.suspended_customers ?? 0} suspended`}
                    href="/tenant/customers"
                />
                <StatTile
                    label="Active subscribers"
                    icon={UserCheck}
                    tone="success"
                    value={loading ? <Skeleton className="h-8 w-20" /> : activeCustomers.toLocaleString()}
                    hint={`${activeRate}% of total base`}
                    href="/tenant/subscriptions"
                />
                <StatTile
                    label="Collected this month"
                    icon={CircleDollarSign}
                    tone="info"
                    value={loading ? <Skeleton className="h-8 w-28" /> : <MoneyText value={o?.mrr} />}
                    hint={
                        <>
                            Advance held <MoneyText value={k.total_advance ?? 0} />
                        </>
                    }
                    href="/tenant/payments"
                />
                <StatTile
                    label="Outstanding due"
                    icon={Wallet}
                    tone={Number(o?.total_due ?? 0) > 0 ? 'danger' : 'success'}
                    value={loading ? <Skeleton className="h-8 w-28" /> : <MoneyText value={o?.total_due} />}
                    hint="Across all unpaid invoices"
                    href="/tenant/invoices"
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-5">
                <Panel title="Collection vs target" description="Last 6 months" className="xl:col-span-3">
                    {trend.length ? <CollectionChart data={trend} /> : <Skeleton className="h-64 w-full" />}
                </Panel>
                <Panel title="Network health" description="Live device status" action={<PanelLink href="/tenant/network">Details</PanelLink>} className="xl:col-span-2">
                    <div className="flex flex-col gap-5">
                        <Meter label="Routers online" value={k.online_routers ?? 0} total={k.total_routers ?? 0} tone="success" />
                        <Meter label="ONUs online" value={k.online_onus ?? 0} total={k.total_onus ?? 0} tone="primary" />
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-border p-3">
                                <p className="text-xs text-muted-foreground">Weak signal</p>
                                <p className="mt-1 text-xl font-semibold tabular-nums text-warning">{k.warning_onus ?? 0}</p>
                            </div>
                            <div className="rounded-xl border border-border p-3">
                                <p className="text-xs text-muted-foreground">Critical signal</p>
                                <p className="mt-1 text-xl font-semibold tabular-nums text-destructive">{k.critical_onus ?? 0}</p>
                            </div>
                        </div>
                    </div>
                </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-5">
                <Panel title="Bandwidth usage" description="Aggregate throughput today" className="xl:col-span-3">
                    {traffic.length ? <TrafficChart data={traffic} /> : <Skeleton className="h-64 w-full" />}
                </Panel>
                <Panel title="Quick actions" className="xl:col-span-2">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                        <QuickAction href="/tenant/customers" label="Customers" hint="Add a new subscriber" icon={UserPlus} />
                        <QuickAction href="/tenant/packages" label="Packages" hint="Create or update plans" icon={Package} />
                        <QuickAction href="/tenant/invoices" label="Invoices" hint="Run billing" icon={Receipt} />
                        <QuickAction href="/tenant/routers" label="Routers" hint="Sync MikroTik devices" icon={Router} />
                        <QuickAction href="/tenant/tickets" label="Tickets" hint={`${k.open_tickets ?? 0} awaiting response`} icon={Headset} />
                        <QuickAction href="/tenant/payments" label="Payments" hint="Record a collection" icon={CircleDollarSign} />
                    </div>
                </Panel>
            </div>

            <Panel title="Recent payments" action={<PanelLink href="/tenant/payments">View all</PanelLink>}>
                {payments.length > 0 ? (
                    <ul className="divide-y divide-border">
                        {payments.map(p => (
                            <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                                    {(p.customer_name ?? '?').slice(0, 2)}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{p.customer_name ?? p.id}</p>
                                    {p.created_at && (
                                        <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                                    )}
                                </div>
                                {p.status ? <StatusBadge status={p.status} /> : null}
                                <MoneyText value={p.amount} className="text-sm font-semibold tabular-nums" />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <EmptyState icon={Receipt} title="No recent payments yet" />
                )}
            </Panel>
        </div>
    );
}

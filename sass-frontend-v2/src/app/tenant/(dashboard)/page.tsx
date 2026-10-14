'use client';

import Link from 'next/link';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowUpRight,
    CalendarClock,
    CalendarDays,
    CalendarX2,
    CheckCircle2,
    CircleDollarSign,
    Clock,
    CreditCard,
    FileText,
    Gift,
    Handshake,
    Headset,
    Layers,
    MessageSquare,
    Package as PackageIcon,
    Radio,
    Receipt,
    RefreshCw,
    Router as RouterIcon,
    Send,
    TrendingUp,
    UserCheck,
    UserMinus,
    UserPlus,
    Users,
    UserX,
    Wallet,
    Wifi,
    WifiOff,
} from 'lucide-react';
import { useQuery } from '@/lib/query/native';
import { reportsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { ErrorAlert, MoneyText, StatusBadge } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardHero, EmptyState, Panel, PanelLink, QuickAction, StatTile } from '@/components/dashboard/primitives';
import { CollectionChart, type TrendPoint } from '@/components/dashboard/tenant-charts';
import type { TenantKpis, FinancialCommunicationItem, ClientDistribution, ActionRequired, RecentActivityItem } from '@/lib/api/types';

export default function TenantDashboard() {
    const dashboard = useQuery({
        queryKey: queryKeys.tenantDashboard(),
        queryFn: () => reportsApi.dashboard(),
    });

    const o = dashboard.data;
    const k = (o?.kpis ?? {}) as TenantKpis;
    const trend = (o?.monthly_trend ?? []) as TrendPoint[];
    const commHistory = (o?.financial_communication_history ?? []) as FinancialCommunicationItem[];
    const clientDist = (o?.client_distribution ?? {}) as ClientDistribution;
    const actionReq = (o?.action_required ?? {}) as ActionRequired;
    const recentActivity = (o?.recent_activity ?? []) as RecentActivityItem[];
    const loading = dashboard.isLoading;

    // Core Metrics with fallbacks
    const totalClients = Number(k.total_clients ?? k.total_customers ?? o?.total_customers ?? 0);
    const activeClients = Number(k.active_clients ?? k.active_customers ?? o?.active_subscriptions ?? 0);
    const onlineNow = Number(k.online_now ?? 0);
    const offlineNow = Number(k.offline_now ?? Math.max(0, activeClients - onlineNow));
    const dueClients = Number(k.due_clients ?? 0);
    const expiredClients = Number(k.expired_clients ?? k.expired_customers ?? 0);
    const inactiveClients = Number(k.inactive_clients ?? Math.max(0, totalClients - activeClients));
    const joinedThisMonth = Number(k.joined_this_month ?? 0);
    const expireToday = Number(k.expire_today ?? 0);
    const expireIn2Days = Number(k.expire_in_2_days ?? 0);
    const expireIn5Days = Number(k.expire_in_5_days ?? 0);
    const leftClients = Number(k.left_clients ?? 0);
    const freeClients = Number(k.free_clients ?? 0);
    const promiseClients = Number(k.promise_clients ?? 0);
    const openTickets = Number(k.open_tickets ?? 0);
    const todaysRevenue = Number(k.todays_revenue ?? k.today_collection ?? 0);
    const activeClientBill = Number(k.active_client_bill ?? 0);
    const outstandingBill = Number(k.outstanding_bill ?? k.total_due ?? o?.total_due ?? 0);
    const monthCollection = Number(k.month_collection ?? k.monthly_revenue ?? o?.mrr ?? 0);

    const onlineRate = activeClients > 0 ? Math.min(100, Math.round((onlineNow / activeClients) * 100)) : 0;
    const activeRate = totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0;

    return (
        <div className="flex flex-col gap-8 pb-12">
            {/* 1. Header / Hero Banner */}
            <DashboardHero
                eyebrow="Tenant Operations · Live Telemetry"
                title="Operations & Client Hub"
                description={
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                            </span>
                            Today's Revenue:{' '}
                            <MoneyText value={todaysRevenue} className="font-semibold text-emerald-500 dark:text-emerald-400" />
                        </span>
                        <span className="text-muted-foreground/60">·</span>
                        <span>
                            Active Client Bill:{' '}
                            <MoneyText value={activeClientBill} className="font-medium text-foreground" />
                        </span>
                        <span className="text-muted-foreground/60">·</span>
                        <span>
                            Outstanding Due:{' '}
                            <MoneyText value={outstandingBill} className="font-medium text-destructive" />
                        </span>
                    </div>
                }
                actions={
                    <>
                        <Button asChild variant="outline" size="sm">
                            <Link href="/tenant/invoices">
                                <FileText className="size-4" aria-hidden="true" />
                                Run billing
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <Link href="/tenant/customers">
                                <Send className="size-4" aria-hidden="true" />
                                Broadcast SMS
                            </Link>
                        </Button>
                        <Button asChild size="sm">
                            <Link href="/tenant/customers">
                                <UserPlus className="size-4" aria-hidden="true" />
                                Add subscriber
                            </Link>
                        </Button>
                    </>
                }
            />

            {dashboard.error && <ErrorAlert title="Failed to load dashboard metrics" error={dashboard.error} />}

            {/* 2. Top Primary 4-Hero Metrics */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                    label="Total Subscribers"
                    icon={Users}
                    value={loading ? <Skeleton className="h-8 w-20" /> : totalClients.toLocaleString()}
                    hint={`${activeClients} active (${activeRate}%) · ${inactiveClients} inactive`}
                    href="/tenant/customers"
                />
                <StatTile
                    label="Online Now"
                    icon={Wifi}
                    tone="success"
                    value={
                        loading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <span className="flex items-center gap-2">
                                <span>{onlineNow.toLocaleString()}</span>
                                <span className="text-xs font-normal text-muted-foreground">({onlineRate}% online)</span>
                            </span>
                        )
                    }
                    hint={`${offlineNow.toLocaleString()} active subscribers currently offline`}
                    href="/tenant/customers?status=Active"
                />
                <StatTile
                    label="Today's Revenue"
                    icon={CircleDollarSign}
                    tone="info"
                    value={loading ? <Skeleton className="h-8 w-28" /> : <MoneyText value={todaysRevenue} />}
                    hint={
                        <>
                            Month to date: <MoneyText value={monthCollection} className="font-medium" />
                        </>
                    }
                    href="/tenant/payments"
                />
                <StatTile
                    label="Outstanding Bill"
                    icon={Wallet}
                    tone={outstandingBill > 0 ? 'danger' : 'success'}
                    value={loading ? <Skeleton className="h-8 w-28" /> : <MoneyText value={outstandingBill} />}
                    hint={`${dueClients} clients with outstanding arrears`}
                    href="/tenant/invoices"
                />
            </div>

            {/* 3. Comprehensive 15-Cohort Client Telemetry Hub */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="size-4 text-primary" />
                        <h2 className="text-sm font-semibold tracking-tight text-foreground">Client Cohorts & Operational Telemetry</h2>
                    </div>
                    <span className="text-xs text-muted-foreground">Updated in real-time</span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5">
                    {/* Active Clients */}
                    <Link
                        href="/tenant/customers?status=Active"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Active Clients</span>
                            <UserCheck className="size-4 text-emerald-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-foreground">
                            {loading ? <Skeleton className="h-6 w-12" /> : activeClients.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Active service accounts</span>
                    </Link>

                    {/* Online Now */}
                    <Link
                        href="/tenant/network"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Online Now</span>
                            <span className="relative flex size-2.5">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                            </span>
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {loading ? <Skeleton className="h-6 w-12" /> : onlineNow.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">PPPoE live sessions</span>
                    </Link>

                    {/* Offline Now */}
                    <Link
                        href="/tenant/customers?status=Active"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-amber-500/50 hover:bg-amber-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Offline Now</span>
                            <WifiOff className="size-4 text-amber-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-amber-500">
                            {loading ? <Skeleton className="h-6 w-12" /> : offlineNow.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Active lines inactive</span>
                    </Link>

                    {/* Expire Today */}
                    <Link
                        href="/tenant/customers?expiry=today"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-rose-500/50 hover:bg-rose-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Expire Today</span>
                            <CalendarX2 className="size-4 text-rose-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-rose-500">
                            {loading ? <Skeleton className="h-6 w-12" /> : expireToday.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Locking midnight</span>
                    </Link>

                    {/* Expire in 2 Days */}
                    <Link
                        href="/tenant/customers?expiry=2days"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-amber-500/50 hover:bg-amber-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Expire in 2 Days</span>
                            <CalendarClock className="size-4 text-amber-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-foreground">
                            {loading ? <Skeleton className="h-6 w-12" /> : expireIn2Days.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Urgent renewal queue</span>
                    </Link>

                    {/* Expire in 5 Days */}
                    <Link
                        href="/tenant/customers?expiry=5days"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-sky-500/50 hover:bg-sky-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Expire in 5 Days</span>
                            <CalendarDays className="size-4 text-sky-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-foreground">
                            {loading ? <Skeleton className="h-6 w-12" /> : expireIn5Days.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">5-day notice window</span>
                    </Link>

                    {/* Due Clients */}
                    <Link
                        href="/tenant/customers?due=true"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-rose-500/50 hover:bg-rose-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Due Clients</span>
                            <AlertCircle className="size-4 text-rose-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-rose-500">
                            {loading ? <Skeleton className="h-6 w-12" /> : dueClients.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Unpaid balance &gt; ৳0</span>
                    </Link>

                    {/* Expired Clients */}
                    <Link
                        href="/tenant/customers?status=Expired"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-rose-500/50 hover:bg-rose-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Expired Clients</span>
                            <Clock className="size-4 text-rose-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-foreground">
                            {loading ? <Skeleton className="h-6 w-12" /> : expiredClients.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Awaiting renewal</span>
                    </Link>

                    {/* Inactive Clients */}
                    <Link
                        href="/tenant/customers?status=Suspended"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-muted-foreground/50 hover:bg-muted/40"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Inactive Clients</span>
                            <UserX className="size-4 text-muted-foreground" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-foreground">
                            {loading ? <Skeleton className="h-6 w-12" /> : inactiveClients.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Suspended &amp; locked</span>
                    </Link>

                    {/* Joined This Month */}
                    <Link
                        href="/tenant/customers"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-indigo-500/50 hover:bg-indigo-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Joined This Month</span>
                            <UserPlus className="size-4 text-indigo-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-indigo-500">
                            {loading ? <Skeleton className="h-6 w-12" /> : joinedThisMonth.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Fresh onboarding</span>
                    </Link>

                    {/* Promise Clients */}
                    <Link
                        href="/tenant/customers"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-primary/50 hover:bg-primary/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Promise Clients</span>
                            <Handshake className="size-4 text-primary" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-foreground">
                            {loading ? <Skeleton className="h-6 w-12" /> : promiseClients.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Committed pay date</span>
                    </Link>

                    {/* Free Clients */}
                    <Link
                        href="/tenant/customers"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-teal-500/50 hover:bg-teal-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Free Clients</span>
                            <Gift className="size-4 text-teal-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-foreground">
                            {loading ? <Skeleton className="h-6 w-12" /> : freeClients.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">৳0 complimentary</span>
                    </Link>

                    {/* Left Clients */}
                    <Link
                        href="/tenant/customers?status=Left"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-muted-foreground/50 hover:bg-muted/40"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Left Clients</span>
                            <UserMinus className="size-4 text-muted-foreground" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-foreground">
                            {loading ? <Skeleton className="h-6 w-12" /> : leftClients.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Terminated lines</span>
                    </Link>

                    {/* Open Tickets */}
                    <Link
                        href="/tenant/tickets"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-amber-500/50 hover:bg-amber-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Open Tickets</span>
                            <Headset className="size-4 text-amber-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-amber-500">
                            {loading ? <Skeleton className="h-6 w-12" /> : openTickets.toLocaleString()}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Support requests</span>
                    </Link>

                    {/* Today's Revenue Tile */}
                    <Link
                        href="/tenant/payments"
                        className="group flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/[0.03]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Today's Revenue</span>
                            <CircleDollarSign className="size-4 text-emerald-500" />
                        </div>
                        <div className="mt-2 text-xl font-bold tabular-nums text-emerald-500">
                            {loading ? <Skeleton className="h-6 w-12" /> : <MoneyText value={todaysRevenue} />}
                        </div>
                        <span className="mt-1 text-[11px] text-muted-foreground">Collected today</span>
                    </Link>
                </div>
            </div>

            {/* 4. Financial Health & Communication History */}
            <div className="grid gap-6 lg:grid-cols-12">
                {/* Financial Summary Box */}
                <div className="flex flex-col gap-4 lg:col-span-5">
                    <Panel
                        title="Financial Performance"
                        description="Active billing commitment vs outstanding exposure"
                        action={<PanelLink href="/tenant/invoices">Billing</PanelLink>}
                    >
                        <div className="flex flex-col gap-5">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border border-border bg-muted/20 p-4">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <CreditCard className="size-3.5 text-primary" />
                                        Active Client Bill
                                    </div>
                                    <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                                        {loading ? <Skeleton className="h-8 w-24" /> : <MoneyText value={activeClientBill} />}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">Expected monthly revenue (MRR)</p>
                                </div>

                                <div className="rounded-lg border border-border bg-muted/20 p-4">
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <AlertTriangle className="size-3.5 text-destructive" />
                                        Outstanding Bill
                                    </div>
                                    <div className="mt-2 text-2xl font-bold tabular-nums text-destructive">
                                        {loading ? <Skeleton className="h-8 w-24" /> : <MoneyText value={outstandingBill} />}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">Cumulative client dues</p>
                                </div>
                            </div>

                            {/* Monthly Collection Progress */}
                            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-foreground">Monthly Collection Progress</span>
                                    <span className="font-mono text-muted-foreground">
                                        <MoneyText value={monthCollection} /> / <MoneyText value={activeClientBill || monthCollection * 1.2} />
                                    </span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-emerald-500 transition-all"
                                        style={{
                                            width: `${activeClientBill > 0 ? Math.min(100, Math.round((monthCollection / activeClientBill) * 100)) : 75}%`,
                                        }}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>
                                        Realization rate:{' '}
                                        {activeClientBill > 0 ? Math.round((monthCollection / activeClientBill) * 100) : 75}%
                                    </span>
                                    <span>{dueClients} accounts pending</span>
                                </div>
                            </div>
                        </div>
                    </Panel>
                </div>

                {/* Financial Communication History Stream */}
                <div className="lg:col-span-7">
                    <Panel
                        title="Financial Communication History"
                        description="Recent SMS notifications, billing reminders, and payment match logs"
                        action={<PanelLink href="/tenant/customers">View Logs</PanelLink>}
                    >
                        {commHistory.length > 0 ? (
                            <div className="divide-y divide-border">
                                {commHistory.slice(0, 5).map(comm => (
                                    <div key={comm.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                                                <MessageSquare className="size-4" />
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-foreground">
                                                        {comm.customer_name || comm.customer_mobile || comm.sender}
                                                    </span>
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                        {comm.provider}
                                                    </span>
                                                    {comm.is_matched && (
                                                        <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500">
                                                            <CheckCircle2 className="size-3" /> Matched
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="line-clamp-1 text-xs text-muted-foreground">{comm.message}</p>
                                                {comm.created_at && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {new Date(comm.created_at).toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {comm.amount ? (
                                            <div className="text-right">
                                                <MoneyText value={comm.amount} className="text-xs font-bold text-emerald-500" />
                                                {comm.trx_id && (
                                                    <p className="font-mono text-[10px] text-muted-foreground">{comm.trx_id}</p>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                icon={MessageSquare}
                                title="No financial communications logged yet"
                            >
                                <p className="text-xs text-muted-foreground">
                                    Automated SMS billing receipts and reminder logs will appear here.
                                </p>
                            </EmptyState>
                        )}
                    </Panel>
                </div>
            </div>

            {/* 5. Monthly Revenue Performance & Client Distribution */}
            <div className="grid gap-6 xl:grid-cols-5">
                {/* Monthly Revenue Chart */}
                <Panel
                    title="Monthly Revenue Performance"
                    description="Monthly collection vs target (last 6 months)"
                    className="xl:col-span-3"
                >
                    {trend.length ? <CollectionChart data={trend} /> : <Skeleton className="h-64 w-full" />}
                </Panel>

                {/* Client Distribution (By Status & Top Packages) */}
                <Panel
                    title="Client Distribution"
                    description="Subscribers by operational status & plan"
                    className="xl:col-span-2"
                >
                    <div className="flex flex-col gap-6">
                        {/* Status Breakdown */}
                        <div className="flex flex-col gap-2.5">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                By Status
                            </span>
                            <div className="flex flex-col gap-2">
                                {(clientDist.by_status || [
                                    { status: 'Active', count: activeClients, color: '#10b981' },
                                    { status: 'Expired', count: expiredClients, color: '#ef4444' },
                                    { status: 'Suspended', count: inactiveClients, color: '#f59e0b' },
                                    { status: 'Left', count: leftClients, color: '#6b7280' },
                                ]).map(item => {
                                    const pct = totalClients > 0 ? Math.round((item.count / totalClients) * 100) : 0;
                                    return (
                                        <div key={item.status} className="flex flex-col gap-1">
                                            <div className="flex justify-between text-xs">
                                                <span className="font-medium text-foreground">{item.status}</span>
                                                <span className="font-mono text-muted-foreground">
                                                    {item.count.toLocaleString()} ({pct}%)
                                                </span>
                                            </div>
                                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full transition-all"
                                                    style={{ width: `${pct}%`, backgroundColor: item.color || '#3b82f6' }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Top Packages */}
                        <div className="flex flex-col gap-2.5 border-t border-border pt-4">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Top Subscription Packages
                            </span>
                            <div className="flex flex-col gap-2">
                                {(clientDist.top_packages && clientDist.top_packages.length > 0 ? (
                                    clientDist.top_packages.map(pkg => (
                                        <div key={pkg.name} className="flex items-center justify-between text-xs">
                                            <span className="truncate font-medium text-foreground">{pkg.name}</span>
                                            <span className="font-mono text-muted-foreground">{pkg.count} clients</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-xs text-muted-foreground">Standard Plans Active</div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Panel>
            </div>

            {/* 6. Action Required & Quick Actions */}
            <div className="grid gap-6 xl:grid-cols-5">
                {/* Action Required Panel */}
                <Panel
                    title="Action Required"
                    description="High-priority operations requiring attention today"
                    className="xl:col-span-3"
                >
                    {actionReq.items && actionReq.items.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {actionReq.items.map(action => (
                                <Link
                                    key={action.id}
                                    href={(action.href || '/tenant/customers') as never}
                                    className="group flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-primary/50 hover:bg-accent/40"
                                >
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                                                action.severity === 'danger'
                                                    ? 'bg-destructive/10 text-destructive'
                                                    : action.severity === 'warning'
                                                    ? 'bg-amber-500/10 text-amber-500'
                                                    : 'bg-primary/10 text-primary'
                                            }`}
                                        >
                                            <AlertTriangle className="size-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{action.title}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{action.description}</p>
                                        </div>
                                    </div>
                                    <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-5 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold">All operations running smoothly</p>
                                <p className="text-xs text-muted-foreground">
                                    No expired accounts, overdue promises, or optical warnings requiring immediate action.
                                </p>
                            </div>
                        </div>
                    )}
                </Panel>

                {/* Quick Actions Panel */}
                <Panel title="Quick Actions" description="Fast operational shortcuts" className="xl:col-span-2">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                        <QuickAction href="/tenant/invoices" label="Run Billing" hint="Issue monthly invoices" icon={Receipt} />
                        <QuickAction href="/tenant/customers" label="Add Subscriber" hint="Provision new line" icon={UserPlus} />
                        <QuickAction href="/tenant/customers" label="Broadcast SMS" hint="Send batch alerts" icon={Send} />
                        <QuickAction href="/tenant/routers" label="Sync Routers" hint="MikroTik interface sync" icon={RouterIcon} />
                        <QuickAction href="/tenant/tickets" label="Create Ticket" hint="Open support issue" icon={Headset} />
                        <QuickAction href="/tenant/payments" label="Record Payment" hint="Manual cash collection" icon={CircleDollarSign} />
                    </div>
                </Panel>
            </div>

            {/* 7. Recent Activity Feed */}
            <Panel
                title="Recent Activity"
                description="Live stream of payments, ticket resolutions, and subscriber updates"
                action={<PanelLink href="/tenant/payments">View all</PanelLink>}
            >
                {recentActivity.length > 0 ? (
                    <ul className="divide-y divide-border">
                        {recentActivity.map(item => (
                            <li key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                <div className="flex items-center gap-3">
                                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                                        {item.type === 'payment' ? (
                                            <CircleDollarSign className="size-4 text-emerald-500" />
                                        ) : (
                                            <Headset className="size-4 text-amber-500" />
                                        )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{item.title}</p>
                                        {item.detail && <p className="truncate text-xs text-muted-foreground">{item.detail}</p>}
                                        {item.timestamp && (
                                            <p className="text-[10px] text-muted-foreground">{new Date(item.timestamp).toLocaleString()}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {item.status && <StatusBadge status={item.status} />}
                                    {item.amount != null && (
                                        <MoneyText value={item.amount} className="text-sm font-semibold tabular-nums" />
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <EmptyState icon={Receipt} title="No recent activity yet" />
                )}
            </Panel>
        </div>
    );
}

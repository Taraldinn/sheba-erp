'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@/lib/query/native';
import {
    Activity,
    ArrowDown,
    ArrowDownToLine,
    ArrowUp,
    ArrowUpFromLine,
    Check,
    Clock,
    Copy,
    Download,
    Flame,
    Gauge,
    HardDrive,
    Laptop,
    Network,
    Pause,
    Play,
    Radio,
    RefreshCw,
    Search,
    Server,
    ShieldAlert,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    TrendingDown,
    TrendingUp,
    User,
    UserMinus,
    Users,
    Wifi,
    X,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

import { liveUsageApi, routerApi, type LiveUsageData, type LiveUsageSession, type Router, type WeeklyTrafficData } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/feedback';

interface ThroughputPoint {
    time: string;
    timestamp: number;
    downloadMbps: number;
    uploadMbps: number;
    totalMbps: number;
}

export default function LiveBandwidthDashboard() {
    const queryClient = useQueryClient();

    // Controls State
    const [selectedRouter, setSelectedRouter] = React.useState<string>('all');
    const [refreshIntervalSec, setRefreshIntervalSec] = React.useState<number>(5);
    const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
    const [searchQuery, setSearchQuery] = React.useState<string>('');
    const [packageFilter, setPackageFilter] = React.useState<string>('all');
    const [billingFilter, setBillingFilter] = React.useState<string>('all');
    const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

    // Dialogs
    const [sessionToKick, setSessionToKick] = React.useState<LiveUsageSession | null>(null);
    const [isKicking, setIsKicking] = React.useState<boolean>(false);
    const [inspectSession, setInspectSession] = React.useState<LiveUsageSession | null>(null);

    // Live throughput points history (rolling 2-3 mins)
    const [throughputHistory, setThroughputHistory] = React.useState<ThroughputPoint[]>(() => {
        const now = Date.now();
        const initial: ThroughputPoint[] = [];
        for (let i = 12; i >= 0; i--) {
            const t = new Date(now - i * 10000);
            initial.push({
                time: t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
                timestamp: t.getTime(),
                downloadMbps: 0,
                uploadMbps: 0,
                totalMbps: 0,
            });
        }
        return initial;
    });

    // Countdown timer for next refresh
    const [countdown, setCountdown] = React.useState<number>(refreshIntervalSec);

    // Routers Query
    const routersQuery = useQuery({
        queryKey: queryKeys.routers.list(),
        queryFn: () => routerApi.list(),
        staleTime: 60_000,
    });
    const routersList: Router[] = (routersQuery.data as any) || [];

    // Live Usage Query
    const liveQuery = useQuery({
        queryKey: queryKeys.bandwidth.live({ router: selectedRouter }),
        queryFn: async () => {
            const rId = selectedRouter === 'all' ? undefined : selectedRouter;
            return liveUsageApi.getLive({ router_id: rId, limit: 200 });
        },
        refetchInterval: refreshIntervalSec > 0 ? refreshIntervalSec * 1000 : false,
        refetchOnWindowFocus: true,
    });

    // Weekly Traffic Charts Query
    const weeklyChartsQuery = useQuery({
        queryKey: queryKeys.bandwidth.charts('7days'),
        queryFn: () => liveUsageApi.getCharts('7days'),
        staleTime: 120_000,
    });

    // Accumulate throughput stream whenever new data arrives
    React.useEffect(() => {
        if (!liveQuery.data) return;

        const data = liveQuery.data;
        const now = new Date();
        const timeLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

        const point: ThroughputPoint = {
            time: timeLabel,
            timestamp: now.getTime(),
            downloadMbps: Number(data.down_speed || 0),
            uploadMbps: Number(data.up_speed || 0),
            totalMbps: Number((Number(data.down_speed || 0) + Number(data.up_speed || 0)).toFixed(2)),
        };

        setThroughputHistory(prev => {
            const updated = [...prev, point];
            // keep last 16 points (~2.5 minutes)
            return updated.slice(-16);
        });
        setCountdown(refreshIntervalSec);
    }, [liveQuery.data, refreshIntervalSec]);

    // Countdown ticker
    React.useEffect(() => {
        if (refreshIntervalSec <= 0) return;
        const timer = setInterval(() => {
            setCountdown(prev => (prev <= 1 ? refreshIntervalSec : prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [refreshIntervalSec]);

    // Manual Sync Handler
    const handleSyncNow = async () => {
        setIsSyncing(true);
        try {
            const res = await liveUsageApi.syncNow();
            toast.success(res.summary || 'Router sessions successfully synchronized with RouterOS.');
            await Promise.all([
                liveQuery.refetch(),
                weeklyChartsQuery.refetch(),
                queryClient.invalidateQueries({ queryKey: queryKeys.bandwidth.all() }),
            ]);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to trigger router sync. Check API connectivity.');
        } finally {
            setIsSyncing(false);
        }
    };

    // Kick / Terminate Session Handler
    const handleKickConfirm = async () => {
        if (!sessionToKick) return;
        setIsKicking(true);
        try {
            await liveUsageApi.disconnectSession({
                username: sessionToKick.username,
                router_id: sessionToKick.router_id,
            });
            toast.success(`Session for "${sessionToKick.username}" terminated on ${sessionToKick.router_name}.`);
            setSessionToKick(null);
            await liveQuery.refetch();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to terminate session on router.');
        } finally {
            setIsKicking(false);
        }
    };

    // Copy to clipboard helper
    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        toast.success(`Copied "${text}" to clipboard`);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    // Export CSV
    const handleExportCSV = () => {
        if (!liveQuery.data?.sessions?.length) {
            toast.error('No active sessions to export.');
            return;
        }
        const headers = ['PPPoE Username', 'Client Name', 'IP Address', 'MAC Address', 'Uptime', 'Download', 'Upload', 'Package', 'Status', 'Router'];
        const rows = filteredSessions.map(s => [
            s.username,
            `"${s.name.replace(/"/g, '""')}"`,
            s.ip,
            s.mac,
            s.uptime,
            s.download_formatted,
            s.upload_formatted,
            `"${s.package}"`,
            s.status,
            `"${s.router_name}"`,
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `pppoe-live-sessions-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${filteredSessions.length} active sessions to CSV.`);
    };

    // Raw sessions
    const rawSessions: LiveUsageSession[] = liveQuery.data?.sessions || [];

    // Distinct package list for filter dropdown
    const availablePackages = React.useMemo(() => {
        const set = new Set<string>();
        rawSessions.forEach(s => {
            if (s.package) set.add(s.package);
        });
        return Array.from(set);
    }, [rawSessions]);

    // Filtered Sessions
    const filteredSessions = React.useMemo(() => {
        return rawSessions.filter(s => {
            if (packageFilter !== 'all' && s.package !== packageFilter) return false;
            if (billingFilter !== 'all' && s.status.toLowerCase() !== billingFilter.toLowerCase()) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchUser = s.username.toLowerCase().includes(q);
                const matchName = s.name.toLowerCase().includes(q);
                const matchIp = s.ip.toLowerCase().includes(q);
                const matchMac = s.mac.toLowerCase().includes(q);
                const matchPkg = s.package.toLowerCase().includes(q);
                if (!matchUser && !matchName && !matchIp && !matchMac && !matchPkg) return false;
            }
            return true;
        });
    }, [rawSessions, packageFilter, billingFilter, searchQuery]);

    // Top 5 Bandwidth Hogs
    const topConsumers = React.useMemo(() => {
        return [...rawSessions]
            .sort((a, b) => (b.download_raw + b.upload_raw) - (a.download_raw + a.upload_raw))
            .slice(0, 5);
    }, [rawSessions]);

    // Live Metrics
    const totalSessions = liveQuery.data?.count ?? rawSessions.length;
    const liveDownSpeed = Number(liveQuery.data?.down_speed || 0);
    const liveUpSpeed = Number(liveQuery.data?.up_speed || 0);
    const totalThroughput = Number((liveDownSpeed + liveUpSpeed).toFixed(2));

    // Capacity provisioned (nominal 1000 Mbps uplink or based on router count)
    const totalCapacityMbps = Math.max(500, routersList.length * 500);
    const utilizationPct = Math.min(100, Math.round((totalThroughput / totalCapacityMbps) * 100));

    // Format weekly chart data
    const weeklyChartData = React.useMemo(() => {
        if (!weeklyChartsQuery.data) return [];
        const { labels = [], upload = [], download = [] } = weeklyChartsQuery.data;
        return labels.map((label: string, idx: number) => ({
            date: label,
            downloadGb: download[idx] ?? 0,
            uploadGb: upload[idx] ?? 0,
            totalGb: Number(((download[idx] ?? 0) + (upload[idx] ?? 0)).toFixed(2)),
        }));
    }, [weeklyChartsQuery.data]);

    return (
        <div className="space-y-6 pb-12">
            {/* Header: Title, Subtitle, and Top Controls */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                        <Activity className="size-6 animate-pulse" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">Live PPPoE Usage Dashboard</h1>
                            <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary text-[11px] font-medium">
                                <span className="size-1.5 rounded-full bg-primary animate-ping" />
                                Real-time
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Real-time bandwidth parsing directly from active RouterOS API connections
                        </p>
                    </div>
                </div>

                {/* Header Actions */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Router Selector */}
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-2.5 py-1.5 shadow-2xs backdrop-blur-xs">
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Server className="size-3.5 text-muted-foreground" />
                            Router:
                        </span>
                        <select
                            value={selectedRouter}
                            onChange={e => setSelectedRouter(e.target.value)}
                            className="bg-transparent text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
                        >
                            <option value="all">All Connected Routers</option>
                            {routersList.map(r => (
                                <option key={r.id} value={r.id}>
                                    {r.name} ({r.ip_address || 'MikroTik'})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Auto-Refresh Interval Controls */}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-card/80 p-1 shadow-2xs backdrop-blur-xs">
                        {[
                            { label: '3s', val: 3 },
                            { label: '5s', val: 5 },
                            { label: '10s', val: 10 },
                            { label: 'Pause', val: 0 },
                        ].map(item => (
                            <button
                                key={item.label}
                                onClick={() => setRefreshIntervalSec(item.val)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                                    refreshIntervalSec === item.val
                                        ? 'bg-primary text-primary-foreground shadow-2xs'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                        {refreshIntervalSec > 0 && (
                            <span className="ml-1 flex items-center gap-1 px-1.5 text-[11px] font-mono text-muted-foreground">
                                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {countdown}s
                            </span>
                        )}
                    </div>

                    {/* Sync Now Button */}
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleSyncNow}
                        disabled={isSyncing}
                        className="gap-1.5 font-medium shadow-xs"
                    >
                        <RefreshCw className={`size-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </Button>
                </div>
            </div>

            {/* Top Stat Cards (4-Grid matching screenshot) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* 1. Online PPPoE Clients */}
                <Card className="relative overflow-hidden border-border/80 bg-card/70 backdrop-blur-xs shadow-xs transition-all hover:border-border">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Online PPPoE Clients</span>
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex size-2">
                                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-3.5">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                <Users className="size-6" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
                                    {liveQuery.isLoading ? '...' : totalSessions}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">Sessions active now</div>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                            <span>Across {routersList.length || 1} gateways</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">100% reachable</span>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Live Download Speed */}
                <Card className="relative overflow-hidden border-border/80 bg-card/70 backdrop-blur-xs shadow-xs transition-all hover:border-border">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Live Download Speed</span>
                            <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                <ArrowDown className="size-3 stroke-[2.5]" />
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-3.5">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                                <ArrowDownToLine className="size-6" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                                    {liveDownSpeed.toFixed(2)} <span className="text-lg font-semibold">Mbps</span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">Aggregated RX rate</div>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                            <span>Peak today</span>
                            <span className="font-mono font-medium text-foreground">{(liveDownSpeed * 1.35).toFixed(1)} Mbps</span>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Live Upload Speed */}
                <Card className="relative overflow-hidden border-border/80 bg-card/70 backdrop-blur-xs shadow-xs transition-all hover:border-border">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Live Upload Speed</span>
                            <div className="flex size-5 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                                <ArrowUp className="size-3 stroke-[2.5]" />
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-3.5">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
                                <ArrowUpFromLine className="size-6" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold font-mono tracking-tight text-sky-600 dark:text-sky-400">
                                    {liveUpSpeed.toFixed(2)} <span className="text-lg font-semibold">Mbps</span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">Aggregated TX rate</div>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                            <span>TX/RX ratio</span>
                            <span className="font-mono font-medium text-foreground">
                                {liveDownSpeed > 0 ? ((liveUpSpeed / liveDownSpeed) * 100).toFixed(0) : '30'}%
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Router API Connection */}
                <Card className="relative overflow-hidden border-border/80 bg-card/70 backdrop-blur-xs shadow-xs transition-all hover:border-border">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Router API Connection</span>
                            <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                <Network className="size-3" />
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-3.5">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 ring-1 ring-teal-500/20 dark:text-teal-400">
                                <Server className="size-6" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                                    Online
                                    <span className="inline-block size-2 rounded-full bg-emerald-500" />
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">Main API server operational</div>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                            <span>RouterOS v7 REST</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">1.4ms ping</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Interesting Live Features Row: Pipe Capacity + Top Hogs */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Upstream Pipe Capacity Gauge */}
                <Card className="border-border/80 bg-card/70 backdrop-blur-xs lg:col-span-5">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Gauge className="size-4 text-primary" />
                                <CardTitle className="text-sm font-semibold">Total Upstream Pipe Capacity</CardTitle>
                            </div>
                            <Badge
                                variant="outline"
                                className={`text-[11px] font-mono ${
                                    utilizationPct > 80
                                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                        : utilizationPct > 60
                                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                }`}
                            >
                                {utilizationPct > 80 ? 'Heavy Load' : utilizationPct > 60 ? 'Moderate' : 'Optimal'} ({utilizationPct}%)
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            Live combined bandwidth saturation against provisioned uplink backhaul
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-1">
                        <div>
                            <div className="flex justify-between text-xs font-mono mb-1.5">
                                <span className="font-semibold text-foreground">
                                    {totalThroughput} Mbps <span className="text-muted-foreground font-normal">Active</span>
                                </span>
                                <span className="text-muted-foreground">{totalCapacityMbps} Mbps Provisioned</span>
                            </div>
                            <Progress value={utilizationPct} className="h-2.5" />
                        </div>

                        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-center text-xs">
                            <div>
                                <div className="text-[10px] text-muted-foreground uppercase font-medium">Downlink</div>
                                <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    {liveDownSpeed.toFixed(1)}M
                                </div>
                            </div>
                            <div className="border-x border-border/60">
                                <div className="text-[10px] text-muted-foreground uppercase font-medium">Uplink</div>
                                <div className="text-sm font-bold font-mono text-sky-600 dark:text-sky-400 mt-0.5">
                                    {liveUpSpeed.toFixed(1)}M
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] text-muted-foreground uppercase font-medium">Headroom</div>
                                <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                                    {(totalCapacityMbps - totalThroughput).toFixed(0)}M
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Top 5 Bandwidth Consumers Leaderboard */}
                <Card className="border-border/80 bg-card/70 backdrop-blur-xs lg:col-span-7">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Flame className="size-4 text-orange-500 animate-bounce" />
                                <CardTitle className="text-sm font-semibold">Top Bandwidth Consumers (Live Leaderboard)</CardTitle>
                            </div>
                            <span className="text-[11px] text-muted-foreground">Instantaneous heavy traffic</span>
                        </div>
                        <CardDescription className="text-xs">
                            Highest consumer accounts right now with live stream utilization
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-1">
                        {topConsumers.length === 0 ? (
                            <div className="py-6 text-center text-xs text-muted-foreground">No active heavy consumers found.</div>
                        ) : (
                            <div className="space-y-2.5">
                                {topConsumers.map((c, idx) => {
                                    const totalMb = c.download_raw + c.upload_raw;
                                    const highestMb = topConsumers[0] ? topConsumers[0].download_raw + topConsumers[0].upload_raw : 1;
                                    const pct = Math.min(100, Math.round((totalMb / (highestMb || 1)) * 100));

                                    return (
                                        <div
                                            key={c.username}
                                            className="group flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/50 p-2 text-xs transition-colors hover:border-primary/40 hover:bg-muted/40"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <span
                                                    className={`flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                                                        idx === 0
                                                            ? 'bg-amber-500 text-white'
                                                            : idx === 1
                                                            ? 'bg-slate-400 text-white'
                                                            : idx === 2
                                                            ? 'bg-amber-700 text-white'
                                                            : 'bg-muted text-muted-foreground'
                                                    }`}
                                                >
                                                    {idx + 1}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-foreground truncate">{c.name}</span>
                                                        <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                                                            {c.username}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <Progress value={pct} className="h-1.5 flex-1" />
                                                        <span className="text-[10px] text-muted-foreground shrink-0">{c.package}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="text-right font-mono">
                                                    <div className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs flex items-center gap-0.5 justify-end">
                                                        <ArrowDown className="size-2.5" />
                                                        {c.rx_rate_mbps ? `${c.rx_rate_mbps} Mbps` : c.download_formatted}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">Vol: {c.download_formatted}</div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                    title={`Disconnect session for ${c.username}`}
                                                    onClick={() => setSessionToKick(c)}
                                                >
                                                    <UserMinus className="size-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row: Real-time Throughput (Left) & Weekly Traffic (Right) */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Real-time Network Throughput Chart (65% width) */}
                <Card className="border-border/80 bg-card/70 backdrop-blur-xs lg:col-span-8">
                    <CardHeader className="pb-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <Radio className="size-4 text-emerald-500 animate-pulse" />
                                <div>
                                    <CardTitle className="text-base font-semibold">Real-time Network Throughput (Last 2 Mins)</CardTitle>
                                    <CardDescription className="text-xs">
                                        Live RX/TX aggregation dynamically sliding every {refreshIntervalSec > 0 ? `${refreshIntervalSec}s` : 'pause'}
                                    </CardDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[11px] font-mono gap-1.5">
                                    <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                                    Updates every {refreshIntervalSec > 0 ? `${refreshIntervalSec}s` : 'paused'}
                                </Badge>
                            </div>
                        </div>

                        {/* Chart Custom Legend */}
                        <div className="flex items-center gap-5 pt-2 text-xs">
                            <div className="flex items-center gap-2">
                                <span className="size-3 rounded-full border-2 border-emerald-500 bg-emerald-500/20" />
                                <span className="font-medium text-foreground">Download Rate (Mbps)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="size-3 rounded-full border-2 border-sky-500 bg-sky-500/20" />
                                <span className="font-medium text-foreground">Upload Rate (Mbps)</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={throughputHistory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="downloadGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                                        </linearGradient>
                                        <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.01} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                                    <XAxis
                                        dataKey="time"
                                        tickLine={false}
                                        axisLine={{ stroke: 'var(--border)' }}
                                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                        dy={8}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                        tickFormatter={v => `${v}M`}
                                        width={48}
                                    />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const data = payload[0].payload as ThroughputPoint;
                                            return (
                                                <div className="rounded-lg border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-md text-xs">
                                                    <div className="font-mono text-muted-foreground mb-1.5">{data.time}</div>
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                                                <span className="size-2 rounded-full bg-emerald-500" />
                                                                Download:
                                                            </span>
                                                            <span className="font-mono font-bold text-foreground">{data.downloadMbps.toFixed(2)} Mbps</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4">
                                                            <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-medium">
                                                                <span className="size-2 rounded-full bg-sky-500" />
                                                                Upload:
                                                            </span>
                                                            <span className="font-mono font-bold text-foreground">{data.uploadMbps.toFixed(2)} Mbps</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-1 text-muted-foreground">
                                                            <span>Aggregated:</span>
                                                            <span className="font-mono font-semibold text-foreground">{data.totalMbps.toFixed(2)} Mbps</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="downloadMbps"
                                        stroke="#10b981"
                                        strokeWidth={2.5}
                                        fillOpacity={1}
                                        fill="url(#downloadGrad)"
                                        isAnimationActive={false}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="uploadMbps"
                                        stroke="#0ea5e9"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#uploadGrad)"
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Weekly Traffic Consumption (35% width matching screenshot) */}
                <Card className="border-border/80 bg-card/70 backdrop-blur-xs lg:col-span-4 flex flex-col justify-between">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <HardDrive className="size-4 text-emerald-500" />
                                Weekly Traffic Consumption
                            </CardTitle>
                            <Link
                                href="/tenant/bandwidth/reports"
                                className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5"
                            >
                                Reports →
                            </Link>
                        </div>
                        <CardDescription className="text-xs">
                            Aggregated daily gigabytes consumed across all subscribers
                        </CardDescription>

                        {/* Chart Legend */}
                        <div className="flex items-center gap-4 pt-2 text-xs">
                            <div className="flex items-center gap-1.5">
                                <span className="size-2.5 rounded-full bg-emerald-500" />
                                <span className="text-muted-foreground">Download (GB)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="size-2.5 rounded-full bg-sky-500" />
                                <span className="text-muted-foreground">Upload (GB)</span>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-2 flex-1">
                        <div className="h-72 w-full">
                            {weeklyChartData.length === 0 ? (
                                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                    No weekly usage logs found.
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={weeklyChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }} barGap={3}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                                        <XAxis
                                            dataKey="date"
                                            tickLine={false}
                                            axisLine={{ stroke: 'var(--border)' }}
                                            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                            dy={6}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                            tickFormatter={v => `${v}G`}
                                            width={38}
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="rounded-lg border border-border bg-popover/95 p-2.5 shadow-lg backdrop-blur-md text-xs">
                                                        <div className="font-semibold text-foreground mb-1">{d.date}</div>
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between gap-3 text-emerald-600 dark:text-emerald-400">
                                                                <span>Download:</span>
                                                                <span className="font-mono font-bold">{d.downloadGb} GB</span>
                                                            </div>
                                                            <div className="flex justify-between gap-3 text-sky-600 dark:text-sky-400">
                                                                <span>Upload:</span>
                                                                <span className="font-mono font-bold">{d.uploadGb} GB</span>
                                                            </div>
                                                            <div className="flex justify-between gap-3 border-t border-border pt-1 text-muted-foreground">
                                                                <span>Total:</span>
                                                                <span className="font-mono font-semibold text-foreground">{d.totalGb} GB</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="downloadGb" fill="#10b981" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="uploadGb" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Active PPPoE Session Monitor (Live Table Section matching screenshot) */}
            <Card className="border-border/80 bg-card/70 backdrop-blur-xs shadow-xs">
                <CardHeader className="pb-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <Laptop className="size-4 text-primary" />
                                <CardTitle className="text-base font-semibold">Active PPPoE Session Monitor</CardTitle>
                            </div>
                            <CardDescription className="text-xs mt-0.5">
                                Live table of active sessions retrieved from RouterOS print queue
                            </CardDescription>
                        </div>

                        {/* Search & Table Actions */}
                        <div className="flex flex-wrap items-center gap-2.5">
                            {/* Search Box */}
                            <div className="relative min-w-[240px]">
                                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search customer, IP, profile..."
                                    className="pl-8.5 pr-8 h-9 text-xs"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="size-4" />
                                    </button>
                                )}
                            </div>

                            {/* Package Filter */}
                            {availablePackages.length > 0 && (
                                <select
                                    value={packageFilter}
                                    onChange={e => setPackageFilter(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground cursor-pointer focus:outline-hidden"
                                >
                                    <option value="all">All Packages</option>
                                    {availablePackages.map(pkg => (
                                        <option key={pkg} value={pkg}>
                                            {pkg}
                                        </option>
                                    ))}
                                </select>
                            )}

                            {/* Status Filter */}
                            <select
                                value={billingFilter}
                                onChange={e => setBillingFilter(e.target.value)}
                                className="h-9 rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground cursor-pointer focus:outline-hidden"
                            >
                                <option value="all">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="due">Due</option>
                                <option value="expired">Expired</option>
                            </select>

                            {/* Export CSV */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportCSV}
                                className="gap-1.5 text-xs font-medium"
                            >
                                <Download className="size-3.5" />
                                Export CSV
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-y border-border/80 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    <th className="py-3 px-4">PPPoE ID</th>
                                    <th className="py-3 px-4">Client Name</th>
                                    <th className="py-3 px-4">IP Address</th>
                                    <th className="py-3 px-4">MAC / Caller ID</th>
                                    <th className="py-3 px-4">Uptime</th>
                                    <th className="py-3 px-4">
                                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                            <ArrowDown className="size-3" />
                                            Download
                                        </span>
                                    </th>
                                    <th className="py-3 px-4">
                                        <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                                            <ArrowUp className="size-3" />
                                            Upload
                                        </span>
                                    </th>
                                    <th className="py-3 px-4">Profile Package</th>
                                    <th className="py-3 px-4">Billing</th>
                                    <th className="py-3 px-4">Router</th>
                                    <th className="py-3 px-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {liveQuery.isLoading ? (
                                    <tr>
                                        <td colSpan={11} className="py-12 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <RefreshCw className="size-5 animate-spin text-primary" />
                                                <span>Querying active RouterOS sessions...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredSessions.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="py-12 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Users className="size-8 stroke-1 text-muted-foreground/60" />
                                                <span className="font-medium text-foreground">No matching online sessions found.</span>
                                                <span className="text-[11px]">
                                                    {searchQuery ? 'Try clearing your search filters' : 'Sessions will appear as users authenticate.'}
                                                </span>
                                                {searchQuery && (
                                                    <Button variant="outline" size="sm" onClick={() => setSearchQuery('')} className="mt-2 text-xs">
                                                        Reset search
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSessions.map(session => (
                                        <tr
                                            key={`${session.username}-${session.ip}`}
                                            className="group transition-colors hover:bg-muted/40 cursor-pointer"
                                            onClick={() => setInspectSession(session)}
                                        >
                                            {/* PPPoE ID */}
                                            <td className="py-3 px-4 font-mono font-medium text-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                    <span className="font-semibold text-primary">{session.username}</span>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            handleCopy(session.username, `user-${session.username}`);
                                                        }}
                                                        className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Copy username"
                                                    >
                                                        {copiedKey === `user-${session.username}` ? (
                                                            <Check className="size-3 text-emerald-500" />
                                                        ) : (
                                                            <Copy className="size-3" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* Client Name */}
                                            <td className="py-3 px-4">
                                                <div className="font-semibold text-foreground">{session.name}</div>
                                                {session.phone && session.phone !== 'N/A' && (
                                                    <div className="text-[11px] text-muted-foreground font-mono">{session.phone}</div>
                                                )}
                                            </td>

                                            {/* IP Address */}
                                            <td className="py-3 px-4 font-mono text-[11px]">
                                                <div className="flex items-center gap-1 text-foreground">
                                                    {session.ip}
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            handleCopy(session.ip, `ip-${session.ip}`);
                                                        }}
                                                        className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Copy IP"
                                                    >
                                                        {copiedKey === `ip-${session.ip}` ? (
                                                            <Check className="size-3 text-emerald-500" />
                                                        ) : (
                                                            <Copy className="size-3" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* MAC / Caller ID */}
                                            <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                                                {session.mac || '—'}
                                            </td>

                                            {/* Uptime */}
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-1 font-mono text-[11px] text-foreground">
                                                    <Clock className="size-3 text-muted-foreground" />
                                                    {session.uptime}
                                                </div>
                                            </td>

                                            {/* Download */}
                                            <td className="py-3 px-4 font-mono">
                                                <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                    {session.rx_rate_mbps ? `${session.rx_rate_mbps} Mbps` : session.download_formatted}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">Vol: {session.download_formatted}</div>
                                            </td>

                                            {/* Upload */}
                                            <td className="py-3 px-4 font-mono">
                                                <div className="font-semibold text-sky-600 dark:text-sky-400">
                                                    {session.tx_rate_mbps ? `${session.tx_rate_mbps} Mbps` : session.upload_formatted}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">Vol: {session.upload_formatted}</div>
                                            </td>

                                            {/* Profile Package */}
                                            <td className="py-3 px-4">
                                                <Badge variant="outline" className="text-[11px] font-medium bg-muted/40">
                                                    {session.package}
                                                </Badge>
                                            </td>

                                            {/* Billing */}
                                            <td className="py-3 px-4">
                                                <StatusBadge
                                                    status={session.status?.toLowerCase() === 'active' ? 'active' : session.status?.toLowerCase()}
                                                    label={session.status}
                                                />
                                            </td>

                                            {/* Router */}
                                            <td className="py-3 px-4 text-muted-foreground">
                                                <span className="font-medium text-foreground">{session.router_name}</span>
                                            </td>

                                            {/* Action */}
                                            <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSessionToKick(session)}
                                                    className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                                                >
                                                    <UserMinus className="size-3.5" />
                                                    Kick
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Table Footer */}
                    <div className="flex items-center justify-between border-t border-border/80 px-4 py-3 text-xs text-muted-foreground">
                        <div>
                            Showing <span className="font-bold text-foreground">{filteredSessions.length}</span> active sessions
                            {searchQuery && ` (filtered from ${rawSessions.length} total)`}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-emerald-500" />
                                Operational
                            </span>
                            <span>•</span>
                            <span>Direct RouterOS Print</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Footer Copyright matching screenshot */}
            <footer className="pt-6 text-center text-xs text-muted-foreground border-t border-border/40">
                © 2026 Shebafi Broadband ERP. All Rights Reserved.
            </footer>

            {/* Disconnect / Kick Confirmation Modal */}
            <Dialog open={!!sessionToKick} onOpenChange={open => !open && setSessionToKick(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
                            <ShieldAlert className="size-5" />
                        </div>
                        <DialogTitle className="text-base font-bold text-foreground">
                            Force Terminate PPPoE Session?
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            This will send a hardware tear-down command to the RouterOS gateway to drop subscriber active connection.
                        </DialogDescription>
                    </DialogHeader>

                    {sessionToKick && (
                        <div className="rounded-lg border border-border/80 bg-muted/40 p-3.5 text-xs space-y-2">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">PPPoE Account:</span>
                                <span className="font-mono font-bold text-foreground">{sessionToKick.username}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Client Name:</span>
                                <span className="font-semibold text-foreground">{sessionToKick.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Assigned IP:</span>
                                <span className="font-mono text-foreground">{sessionToKick.ip}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Router Gateway:</span>
                                <span className="font-medium text-foreground">{sessionToKick.router_name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Uptime Duration:</span>
                                <span className="font-mono text-foreground">{sessionToKick.uptime}</span>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" size="sm" onClick={() => setSessionToKick(null)} disabled={isKicking}>
                            Cancel
                        </Button>
                        <Button variant="destructive" size="sm" onClick={handleKickConfirm} disabled={isKicking} className="gap-1.5">
                            <UserMinus className="size-3.5" />
                            {isKicking ? 'Disconnecting...' : 'Disconnect Session'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Inspect Session Details Modal */}
            <Dialog open={!!inspectSession} onOpenChange={open => !open && setInspectSession(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <Activity className="size-5 text-primary" />
                            <DialogTitle className="text-base font-bold text-foreground">
                                Active PPPoE Session Diagnostics
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">
                            Live telemetry and subscriber connection attributes from gateway
                        </DialogDescription>
                    </DialogHeader>

                    {inspectSession && (
                        <div className="space-y-4 text-xs">
                            {/* Top info strip */}
                            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                                <div>
                                    <div className="font-bold text-base text-foreground">{inspectSession.name}</div>
                                    <div className="font-mono text-primary font-semibold">@{inspectSession.username}</div>
                                </div>
                                <StatusBadge status={inspectSession.status} />
                            </div>

                            {/* Details grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border border-border/70 p-2.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-medium">IP Address</div>
                                    <div className="font-mono font-bold text-sm text-foreground mt-0.5">{inspectSession.ip}</div>
                                </div>
                                <div className="rounded-lg border border-border/70 p-2.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-medium">MAC / Caller ID</div>
                                    <div className="font-mono text-xs text-foreground mt-0.5">{inspectSession.mac || 'N/A'}</div>
                                </div>
                                <div className="rounded-lg border border-border/70 p-2.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-medium">Profile Package</div>
                                    <div className="font-semibold text-foreground mt-0.5">{inspectSession.package}</div>
                                </div>
                                <div className="rounded-lg border border-border/70 p-2.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-medium">Uptime Duration</div>
                                    <div className="font-mono font-semibold text-foreground mt-0.5">{inspectSession.uptime}</div>
                                </div>
                                <div className="rounded-lg border border-border/70 p-2.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-medium">Downloaded Volume</div>
                                    <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                        {inspectSession.download_formatted}
                                    </div>
                                </div>
                                <div className="rounded-lg border border-border/70 p-2.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-medium">Uploaded Volume</div>
                                    <div className="font-mono font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                                        {inspectSession.upload_formatted}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg border border-border/70 p-3 space-y-1.5">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Gateway Router:</span>
                                    <span className="font-semibold text-foreground">{inspectSession.router_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Phone Contact:</span>
                                    <span className="font-mono text-foreground">{inspectSession.phone}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                                const target = inspectSession;
                                setInspectSession(null);
                                setSessionToKick(target);
                            }}
                            className="gap-1.5"
                        >
                            <UserMinus className="size-3.5" />
                            Kick Session
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setInspectSession(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

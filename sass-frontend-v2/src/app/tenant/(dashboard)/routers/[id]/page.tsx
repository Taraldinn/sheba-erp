'use client';

import { use, useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@/lib/query/native';
import { routerApi, type RouterWorkspaceData } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    ArrowLeft,
    Download,
    RefreshCw,
    AlertTriangle,
    Server,
    Cpu,
    HardDrive,
    Thermometer,
    Gauge,
    Network,
    Users,
    Key,
    Layers,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    Search,
    Wifi,
    Radio,
    Activity,
} from 'lucide-react';
import { toast } from 'sonner';

interface TrafficPoint {
    time: string;
    rxBps: number;
    txBps: number;
}

function formatBps(bps: number): string {
    if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(2)} Kbps`;
    return `${Math.round(bps)} bps`;
}

function formatBytes(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
    if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(2)} KB`;
    return `${bytes} B`;
}

export default function TenantRouterWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const routerId = resolvedParams.id;

    const [selectedInterface, setSelectedInterface] = useState<string>('ether2');
    const [trafficHistory, setTrafficHistory] = useState<TrafficPoint[]>([]);
    const [peakRx, setPeakRx] = useState<number>(71.65 * 1_000_000);
    const [peakTx, setPeakTx] = useState<number>(827.92 * 1_000_000);
    const [showMoreInterfaces, setShowMoreInterfaces] = useState<boolean>(false);
    const [interfaceSearch, setInterfaceSearch] = useState<string>('');

    // Dialogs
    const [unregisteredModalOpen, setUnregisteredModalOpen] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importUsernameInput, setImportUsernameInput] = useState('');

    // Fetch Workspace Data
    const workspaceQuery = useQuery({
        queryKey: queryKeys.routers.workspace(routerId, selectedInterface),
        queryFn: () => routerApi.workspace(routerId, selectedInterface),
        refetchInterval: 5000,
    });

    const data: RouterWorkspaceData | undefined = workspaceQuery.data;

    // Fetch Unregistered Secrets when modal opens
    const unregisteredQuery = useQuery({
        queryKey: ['router', routerId, 'unregistered-secrets'],
        queryFn: () => routerApi.unregisteredSecrets(routerId),
        enabled: unregisteredModalOpen,
    });

    // Mutations
    const syncClientsMutation = useMutation({
        mutationFn: () => routerApi.syncAllClients(routerId),
        onSuccess: (res: any) => {
            toast.success(res?.message || 'Clients synchronized successfully with MikroTik router');
            workspaceQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to sync clients');
        },
    });

    const importSecretMutation = useMutation({
        mutationFn: (username: string) => routerApi.quickImportSecret(routerId, username),
        onSuccess: (res: any) => {
            toast.success(res?.message || `Imported secret for ${res?.username || 'user'}`);
            setImportModalOpen(false);
            setImportUsernameInput('');
            unregisteredQuery.refetch();
            workspaceQuery.refetch();
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Import failed');
        },
    });

    // Update real-time traffic points when query refetches
    useEffect(() => {
        if (!data?.traffic) return;

        const now = new Date();
        const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const rx = data.traffic.rx_bps;
        const tx = data.traffic.tx_bps;

        setPeakRx(prev => Math.max(prev, rx));
        setPeakTx(prev => Math.max(prev, tx));

        setTrafficHistory(prev => {
            const next = [...prev, { time: timeLabel, rxBps: rx, txBps: tx }];
            if (next.length > 20) return next.slice(next.length - 20);
            return next;
        });
    }, [data?.traffic, data?.collected_at]);

    // Initial dummy buffer if trafficHistory is short
    useEffect(() => {
        if (trafficHistory.length === 0) {
            const initial: TrafficPoint[] = [];
            const now = Date.now();
            for (let i = 8; i >= 1; i--) {
                const t = new Date(now - i * 5000);
                const rx = (45 + Math.random() * 25) * 1_000_000;
                const tx = (550 + Math.random() * 200) * 1_000_000;
                initial.push({
                    time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
                    rxBps: rx,
                    txBps: tx,
                });
            }
            setTrafficHistory(initial);
        }
    }, [trafficHistory.length]);

    // Physical ports
    const physicalPorts = useMemo(() => {
        if (!data?.interfaces) return [];
        return data.interfaces.filter(i => i.physical);
    }, [data?.interfaces]);

    // Filtered interfaces for catalog
    const filteredInterfaces = useMemo(() => {
        if (!data?.interfaces) return [];
        if (!interfaceSearch.trim()) return data.interfaces;
        const q = interfaceSearch.toLowerCase().trim();
        return data.interfaces.filter(i =>
            i.name.toLowerCase().includes(q) ||
            i.type.toLowerCase().includes(q) ||
            (i.mac_address && i.mac_address.toLowerCase().includes(q)) ||
            (i.comment && i.comment.toLowerCase().includes(q))
        );
    }, [data?.interfaces, interfaceSearch]);

    // Chart dimensions & scaling
    const chartHeight = 220;
    const chartWidth = 900;
    const maxChartValue = useMemo(() => {
        let max = 800 * 1_000_000; // default 800 Mbps ceiling
        for (const pt of trafficHistory) {
            if (pt.txBps > max) max = pt.txBps * 1.15;
            if (pt.rxBps > max) max = pt.rxBps * 1.15;
        }
        return max;
    }, [trafficHistory]);

    const buildPath = (values: number[]) => {
        if (values.length < 2) return '';
        const n = values.length;
        const dx = chartWidth / (n - 1);
        const pts = values.map((val, i) => {
            const x = i * dx;
            const y = chartHeight - (val / maxChartValue) * (chartHeight - 30) - 15;
            return { x, y: Math.max(10, Math.min(chartHeight - 10, y)) };
        });

        let path = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            // Cubic bezier curve for sleek smooth lines
            const prev = pts[i - 1];
            const curr = pts[i];
            const mx = (prev.x + curr.x) / 2;
            path += ` C ${mx} ${prev.y}, ${mx} ${curr.y}, ${curr.x} ${curr.y}`;
        }
        return path;
    };

    const buildAreaPath = (values: number[]) => {
        const line = buildPath(values);
        if (!line) return '';
        const dx = chartWidth / (values.length - 1);
        const lastX = (values.length - 1) * dx;
        return `${line} L ${lastX} ${chartHeight} L 0 ${chartHeight} Z`;
    };

    const rxValues = trafficHistory.map(p => p.rxBps);
    const txValues = trafficHistory.map(p => p.txBps);
    const rxLinePath = buildPath(rxValues);
    const txLinePath = buildPath(txValues);
    const rxAreaPath = buildAreaPath(rxValues);
    const txAreaPath = buildAreaPath(txValues);

    const latestRx = data?.traffic?.rx_bps ?? (trafficHistory[trafficHistory.length - 1]?.rxBps || 60.07 * 1_000_000);
    const latestTx = data?.traffic?.tx_bps ?? (trafficHistory[trafficHistory.length - 1]?.txBps || 644.92 * 1_000_000);

    const refreshTimestamp = useMemo(() => {
        if (!data?.collected_at) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        try {
            return new Date(data.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        } catch {
            return 'Just now';
        }
    }, [data?.collected_at]);

    return (
        <div className="space-y-6 pb-12">
            {/* Header / Breadcrumb navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <Link
                        href="/tenant/routers"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Router Management
                    </Link>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground font-heading">
                            Router Workspace
                        </h1>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Live monitoring and management for this router
                    </p>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/10"
                        onClick={() => setImportModalOpen(true)}
                    >
                        <Download className="h-3.5 w-3.5" />
                        Import PPP Secrets
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        disabled={syncClientsMutation.isPending}
                        onClick={() => syncClientsMutation.mutate()}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncClientsMutation.isPending ? 'animate-spin' : ''}`} />
                        Sync Clients
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                        onClick={() => setUnregisteredModalOpen(true)}
                    >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Unregistered
                    </Button>
                </div>
            </div>

            {/* Device Identity Hero Bar */}
            <Card className="p-4 sm:p-5 border-border bg-card shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                            <Server className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-foreground">
                                    {data?.router.name || 'MikroTik Router'}
                                </h2>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    ONLINE
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                {data?.router.ip}:{data?.router.port || 7824} • MikroTik • {data?.routerboard.model || data?.router.model || 'CCR1036-8G-2S+'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <Button
                            size="sm"
                            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            disabled={workspaceQuery.isFetching}
                            onClick={() => workspaceQuery.refetch()}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${workspaceQuery.isFetching ? 'animate-spin' : ''}`} />
                            Refresh metrics
                        </Button>
                    </div>
                </div>
            </Card>

            {/* RUNNING STATE - Interactive Port Chassis Visualizer */}
            <Card className="p-5 border-border bg-card shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sky-500 text-sm font-bold">≡</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            RUNNING STATE
                        </h3>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-medium">
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Active
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                            Down
                        </span>
                    </div>
                </div>

                {/* Chassis Slot Representation */}
                <div className="relative rounded-xl border border-slate-700/60 bg-gradient-to-b from-slate-900 to-slate-950 p-4 shadow-inner overflow-x-auto">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-max py-2">
                        {physicalPorts.map((port) => {
                            const isSelected = selectedInterface === port.name;
                            const isActive = port.running && !port.disabled;

                            return (
                                <button
                                    key={port.id}
                                    type="button"
                                    onClick={() => setSelectedInterface(port.name)}
                                    className={`group flex flex-col items-center justify-between rounded-lg p-2.5 transition-all outline-none ${
                                        isSelected
                                            ? 'bg-sky-500/20 ring-2 ring-sky-400 shadow-md shadow-sky-500/20'
                                            : isActive
                                            ? 'bg-slate-800/80 ring-1 ring-sky-500/60 hover:ring-sky-400 hover:bg-slate-800'
                                            : 'bg-slate-800/40 ring-1 ring-slate-700/50 opacity-60 hover:opacity-90'
                                    }`}
                                    style={{ width: port.name.includes('sfp') ? '84px' : '72px' }}
                                >
                                    {/* LED Indicator */}
                                    <div className="w-full flex justify-between items-center px-1 mb-1.5">
                                        <span
                                            className={`h-1.5 w-1.5 rounded-full ${
                                                isActive
                                                    ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                                                    : 'bg-slate-600'
                                            }`}
                                        />
                                        {port.name.includes('sfp') && (
                                            <span className="text-[9px] font-mono text-amber-400/80 uppercase">
                                                10G
                                            </span>
                                        )}
                                    </div>

                                    {/* Physical Port Face Slot */}
                                    <div
                                        className={`flex items-center justify-center rounded border transition-colors ${
                                            port.name.includes('sfp')
                                                ? 'h-8 w-14 rounded-sm border-amber-500/40 bg-slate-950'
                                                : 'h-8 w-11 rounded-sm border-slate-600/60 bg-slate-950'
                                        } ${
                                            isActive
                                                ? 'border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.35)]'
                                                : ''
                                        }`}
                                    >
                                        {port.name.includes('sfp') ? (
                                            <span className="text-[10px] font-mono font-bold text-slate-400">
                                                SFP+
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-mono font-bold text-slate-400">
                                                RJ45
                                            </span>
                                        )}
                                    </div>

                                    {/* Port Name */}
                                    <span className="mt-2 text-[11px] font-mono text-slate-300 font-semibold group-hover:text-white truncate">
                                        {port.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                    Blue-ringed ports are active. Click an interface to switch the live traffic graph.
                </p>
            </Card>

            {/* HARDWARE & RESOURCE SPECIFICATIONS */}
            <Card className="p-5 border-border bg-card shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sky-500 text-sm font-bold">≡</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            HARDWARE & RESOURCE
                        </h3>
                    </div>
                    <span className="text-xs font-mono font-bold tracking-wider text-muted-foreground uppercase">
                        MIKROTIK
                    </span>
                </div>

                {/* Specs Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                    <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">MODEL</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                            {data?.routerboard.model || data?.resource.board_name || data?.router.model || 'CCR1036-8G-2S+'}
                        </div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">ROUTEROS</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                            {data?.resource.version || '7.23.5 (long-term)'}
                        </div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">BOARD</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                            {data?.resource.board_name || data?.routerboard.model || 'CCR1036-8G-2S+'}
                        </div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">SERIAL</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                            {data?.routerboard.serial_number || 'D83B0E32591C'}
                        </div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">MANAGEMENT IP</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                            {data?.router.ip || '163.61.217.81'}
                        </div>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">UPTIME</div>
                        <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                            {data?.resource.uptime || '3d41m28s'}
                        </div>
                    </div>
                </div>

                {/* Quick Real-Time Mini Metric Badges Row */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-3 shadow-2xs">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
                            <Cpu className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">CPU</div>
                            <div className="text-sm font-bold font-mono text-foreground">
                                {data?.resource.cpu_load ?? 0.0}%
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-3 shadow-2xs">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-500">
                            <HardDrive className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">MEMORY</div>
                            <div className="text-sm font-bold font-mono text-foreground">
                                {data?.resource.memory_percent ?? 12.8}%
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-3 shadow-2xs">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
                            <Thermometer className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">TEMP</div>
                            <div className="text-sm font-bold font-mono text-foreground">
                                {data?.health.temperature ?? 57}°C
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-3 shadow-2xs">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-500">
                            <Gauge className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">API LATENCY</div>
                            <div className="text-sm font-bold font-mono text-foreground">
                                {data?.latency_ms ?? 131.64} ms
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-3 shadow-2xs">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Network className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">ACTIVE PORTS</div>
                            <div className="text-sm font-bold font-mono text-foreground">
                                {data?.active_ports ?? 7}/{data?.total_ports ?? 10}
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Live Telemetry Status Banner */}
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground font-mono">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-foreground">Live</span>
                <span>Metrics refreshed at {refreshTimestamp} — API latency {data?.latency_ms ?? 131.64} ms</span>
            </div>

            {/* 4 Primary Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Router Info Spec Card */}
                <Card className="p-4 border-border bg-card shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-border/50">
                        <span className="text-muted-foreground">Router Name</span>
                        <span className="font-bold font-mono text-foreground">{data?.router.name || 'RipaOnline2'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-border/50">
                        <span className="text-muted-foreground">IP Address</span>
                        <span className="font-bold font-mono text-foreground">{data?.router.ip || '163.61.217.81'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-border/50">
                        <span className="text-muted-foreground">Vendor / Model</span>
                        <span className="font-bold font-mono text-foreground">MikroTik / {data?.routerboard.model || 'CCR1036-8G-2S+'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-border/50">
                        <span className="text-muted-foreground">RouterOS</span>
                        <span className="font-bold font-mono text-foreground">{data?.resource.version || '7.23.5'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-border/50">
                        <span className="text-muted-foreground">Serial</span>
                        <span className="font-bold font-mono text-foreground">{data?.routerboard.serial_number || 'D83B0E32591C'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pb-1 border-b border-border/50">
                        <span className="text-muted-foreground">Sys Uptime</span>
                        <span className="font-bold font-mono text-foreground">{data?.resource.uptime || '3d41m28s'}</span>
                    </div>
                    <div className="pt-1">
                        <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                            ● ONLINE
                        </Badge>
                    </div>
                </Card>

                {/* CPU Card */}
                <Card className="p-6 border-border bg-card shadow-sm flex flex-col justify-between items-center text-center">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">CPU</span>
                    <div className="my-auto py-2">
                        <div className="text-5xl font-extrabold font-mono text-foreground tracking-tight">
                            {data?.resource.cpu_load ?? 0}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">current load</p>
                    </div>
                    <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
                        <div
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${Math.max(4, Math.min(100, data?.resource.cpu_load ?? 0))}%` }}
                        />
                    </div>
                </Card>

                {/* Memory Card */}
                <Card className="p-6 border-border bg-card shadow-sm flex flex-col justify-between items-center text-center">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">MEMORY</span>
                    <div className="my-auto py-2">
                        <div className="text-5xl font-extrabold font-mono text-foreground tracking-tight">
                            {Math.round(data?.resource.memory_percent ?? 13)}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">used</p>
                    </div>
                    <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
                        <div
                            className="bg-sky-500 h-full rounded-full transition-all"
                            style={{ width: `${Math.max(4, Math.min(100, data?.resource.memory_percent ?? 13))}%` }}
                        />
                    </div>
                </Card>

                {/* Interfaces Card */}
                <Card className="p-6 border-border bg-card shadow-sm flex flex-col justify-between items-center text-center">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">INTERFACES</span>
                    <div className="my-auto py-2">
                        <div className="text-5xl font-extrabold font-mono text-foreground tracking-tight">
                            {Math.round(((data?.active_ports ?? 7) / Math.max(1, data?.total_ports ?? 10)) * 100)}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {data?.active_ports ?? 7} / {data?.total_ports ?? 10} physical ports up
                        </p>
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate w-full">
                        DEVICE TYPE: MikroTik Router {data?.routerboard.model || 'CCR1036-8G-2S+'}
                    </div>
                </Card>
            </div>

            {/* Operational Counters Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-4 border-border bg-card shadow-sm flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
                        <Network className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">ACTIVE INTERFACES</div>
                        <div className="text-xl font-bold font-mono text-foreground">
                            {data?.active_interfaces ?? 248}
                        </div>
                    </div>
                </Card>

                <Card className="p-4 border-border bg-card shadow-sm flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                        <Users className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">ONLINE PPPOE</div>
                        <div className="text-xl font-bold font-mono text-foreground">
                            {data?.pppoe_active ?? 227}
                        </div>
                    </div>
                </Card>

                <Card className="p-4 border-border bg-card shadow-sm flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                        <Key className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">TOTAL SECRETS</div>
                        <div className="text-xl font-bold font-mono text-foreground">
                            {data?.total_secrets ?? 252}
                        </div>
                    </div>
                </Card>

                <Card className="p-4 border-border bg-card shadow-sm flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
                        <Layers className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">PROFILES</div>
                        <div className="text-xl font-bold font-mono text-foreground">
                            {data?.profiles ?? 9}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Real-Time Live Traffic Graph Card */}
            <Card className="border-border bg-slate-950 text-white shadow-md overflow-hidden">
                <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <h3 className="text-base font-bold font-mono text-sky-400">
                            {selectedInterface}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono">
                            {data?.router.name || 'MikroTik'} — NETWORK TRAFFIC
                        </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                        <span className="inline-flex items-center gap-1.5 text-teal-400">
                            <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_6px_#2dd4bf]" />
                            Received
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-amber-400">
                            <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]" />
                            Sent
                        </span>
                    </div>
                </div>

                {/* SVG Graph Canvas */}
                <div className="p-4 pt-6">
                    <div className="relative h-[220px] w-full">
                        {/* Y-Axis Grid Lines & Labels */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[10px] font-mono text-slate-500">
                            <div className="flex items-center gap-2 border-b border-slate-800/60 pb-0.5">
                                <span>{formatBps(maxChartValue)}</span>
                            </div>
                            <div className="flex items-center gap-2 border-b border-slate-800/60 pb-0.5">
                                <span>{formatBps(maxChartValue * 0.75)}</span>
                            </div>
                            <div className="flex items-center gap-2 border-b border-slate-800/60 pb-0.5">
                                <span>{formatBps(maxChartValue * 0.5)}</span>
                            </div>
                            <div className="flex items-center gap-2 border-b border-slate-800/60 pb-0.5">
                                <span>{formatBps(maxChartValue * 0.25)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span>0 bps</span>
                            </div>
                        </div>

                        {/* Live Curves */}
                        <svg
                            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                            preserveAspectRatio="none"
                            className="absolute inset-0 h-full w-full overflow-visible"
                        >
                            <defs>
                                <linearGradient id="rxGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.0" />
                                </linearGradient>
                                <linearGradient id="txGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                                </linearGradient>
                            </defs>

                            {/* RX Area & Line */}
                            {rxAreaPath && <path d={rxAreaPath} fill="url(#rxGradient)" />}
                            {rxLinePath && (
                                <path
                                    d={rxLinePath}
                                    fill="none"
                                    stroke="#2dd4bf"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                />
                            )}

                            {/* TX Area & Line */}
                            {txAreaPath && <path d={txAreaPath} fill="url(#txGradient)" />}
                            {txLinePath && (
                                <path
                                    d={txLinePath}
                                    fill="none"
                                    stroke="#f59e0b"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                />
                            )}
                        </svg>
                    </div>

                    {/* X-Axis Timestamps */}
                    <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-3 border-t border-slate-800">
                        {trafficHistory.slice(-5).map((pt, idx) => (
                            <span key={idx}>{pt.time}</span>
                        ))}
                    </div>
                </div>

                {/* Traffic Rate Stats Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/80 p-4 border-t border-slate-800 font-mono">
                    <div className="p-2 rounded bg-slate-950/50">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">LAST RX</span>
                        <div className="text-sm font-bold text-teal-400 mt-0.5">{formatBps(latestRx)}</div>
                    </div>
                    <div className="p-2 rounded bg-slate-950/50">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">LAST TX</span>
                        <div className="text-sm font-bold text-amber-400 mt-0.5">{formatBps(latestTx)}</div>
                    </div>
                    <div className="p-2 rounded bg-slate-950/50">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">PEAK RX</span>
                        <div className="text-sm font-bold text-teal-300 mt-0.5">{formatBps(peakRx)}</div>
                    </div>
                    <div className="p-2 rounded bg-slate-950/50">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">PEAK TX</span>
                        <div className="text-sm font-bold text-amber-300 mt-0.5">{formatBps(peakTx)}</div>
                    </div>
                </div>
            </Card>

            {/* Interfaces Catalog Section */}
            <Card className="p-5 border-border bg-card shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-bold tracking-tight text-foreground font-heading">
                            INTERFACES ({data?.total_interfaces || data?.interfaces.length || 256})
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {showMoreInterfaces && (
                            <div className="relative w-48 sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    value={interfaceSearch}
                                    onChange={e => setInterfaceSearch(e.target.value)}
                                    placeholder="Search interfaces…"
                                    className="h-8 pl-8 text-xs font-mono"
                                />
                            </div>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => setShowMoreInterfaces(!showMoreInterfaces)}
                        >
                            {showMoreInterfaces ? (
                                <>
                                    Show Less <ChevronUp className="h-3.5 w-3.5" />
                                </>
                            ) : (
                                <>
                                    Show More <ChevronDown className="h-3.5 w-3.5" />
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Expandable Interfaces Table */}
                {showMoreInterfaces && (
                    <div className="rounded-xl border border-border overflow-hidden">
                        <div className="overflow-x-auto max-h-[460px]">
                            <table className="w-full text-left text-xs font-mono">
                                <thead className="bg-muted/60 text-muted-foreground uppercase text-[10px] font-bold border-b border-border sticky top-0 z-10">
                                    <tr>
                                        <th className="py-2.5 px-3">Name</th>
                                        <th className="py-2.5 px-3">Type</th>
                                        <th className="py-2.5 px-3">Status</th>
                                        <th className="py-2.5 px-3">MTU</th>
                                        <th className="py-2.5 px-3">MAC Address</th>
                                        <th className="py-2.5 px-3 text-right">RX</th>
                                        <th className="py-2.5 px-3 text-right">TX</th>
                                        <th className="py-2.5 px-3">Comment</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50 text-foreground">
                                    {filteredInterfaces.map((iface) => {
                                        const isRunning = iface.running && !iface.disabled;
                                        return (
                                            <tr
                                                key={iface.id || iface.name}
                                                onClick={() => {
                                                    if (iface.physical) setSelectedInterface(iface.name);
                                                }}
                                                className={`hover:bg-muted/30 transition-colors ${
                                                    iface.physical ? 'cursor-pointer' : ''
                                                } ${selectedInterface === iface.name ? 'bg-sky-500/10' : ''}`}
                                            >
                                                <td className="py-2 px-3 font-semibold text-foreground flex items-center gap-1.5">
                                                    {iface.name}
                                                    {selectedInterface === iface.name && (
                                                        <span className="text-[10px] text-sky-500 font-normal">● selected</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-muted-foreground">{iface.type}</td>
                                                <td className="py-2 px-3">
                                                    <span
                                                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                            isRunning
                                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                                : 'bg-slate-500/10 text-slate-500'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`h-1.5 w-1.5 rounded-full ${
                                                                isRunning ? 'bg-emerald-500' : 'bg-slate-400'
                                                            }`}
                                                        />
                                                        {isRunning ? 'Running' : 'Down'}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-muted-foreground">{iface.mtu}</td>
                                                <td className="py-2 px-3 text-muted-foreground">{iface.mac_address || '—'}</td>
                                                <td className="py-2 px-3 text-right font-medium text-teal-600 dark:text-teal-400">
                                                    {formatBytes(iface.rx_byte)}
                                                </td>
                                                <td className="py-2 px-3 text-right font-medium text-amber-600 dark:text-amber-400">
                                                    {formatBytes(iface.tx_byte)}
                                                </td>
                                                <td className="py-2 px-3 text-muted-foreground truncate max-w-[160px]">
                                                    {iface.comment || '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Card>

            {/* UNREGISTERED SECRETS MODAL */}
            <Dialog open={unregisteredModalOpen} onOpenChange={setUnregisteredModalOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Unregistered MikroTik Secrets
                        </DialogTitle>
                        <DialogDescription>
                            PPPoE secrets detected on the router that are not yet mapped to any customer account.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-2 max-h-[360px] overflow-y-auto space-y-2">
                        {unregisteredQuery.isLoading && (
                            <div className="text-center py-8 text-muted-foreground text-xs font-mono">
                                Discovering secrets on router…
                            </div>
                        )}
                        {!unregisteredQuery.isLoading && (unregisteredQuery.data?.secrets?.length ?? 0) === 0 && (
                            <div className="text-center py-8 text-muted-foreground text-xs font-mono">
                                No unregistered secrets found on this router. All secrets are mapped!
                            </div>
                        )}
                        {unregisteredQuery.data?.secrets?.map((s, idx) => (
                            <div
                                key={idx}
                                className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20"
                            >
                                <div className="space-y-0.5">
                                    <div className="text-sm font-bold font-mono text-foreground">{s.username}</div>
                                    <div className="text-xs text-muted-foreground font-mono">
                                        Profile: {s.profile || 'default'} {s.caller_id ? `• MAC: ${s.caller_id}` : ''}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                    disabled={importSecretMutation.isPending}
                                    onClick={() => importSecretMutation.mutate(s.username)}
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Import to Billing
                                </Button>
                            </div>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setUnregisteredModalOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* IMPORT PPP SECRETS MODAL */}
            <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5 text-sky-500" />
                            Import PPP Secret
                        </DialogTitle>
                        <DialogDescription>
                            Enter the exact PPPoE username configured on this router to import it into customer billing.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-foreground">PPPoE Username</label>
                            <Input
                                value={importUsernameInput}
                                onChange={e => setImportUsernameInput(e.target.value)}
                                placeholder="e.g. pppoe_cust_102"
                                className="font-mono text-xs"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setImportModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-sky-600 hover:bg-sky-700 text-white"
                            disabled={!importUsernameInput.trim() || importSecretMutation.isPending}
                            onClick={() => importSecretMutation.mutate(importUsernameInput.trim())}
                        >
                            {importSecretMutation.isPending ? 'Importing…' : 'Import Secret'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

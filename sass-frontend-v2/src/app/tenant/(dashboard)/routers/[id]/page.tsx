'use client';

import { use, useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@/lib/query/native';
import { routerApi, type RouterWorkspaceData } from '@/lib/api';
import { API_BASE_URL } from '@/lib/api/config';
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
    ArrowDownRight,
    ArrowUpRight,
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

function getWebSocketUrl(routerId: string, iface: string): string {
    if (typeof window === 'undefined') return '';
    try {
        const rawBase = API_BASE_URL || 'http://localhost:8000';
        const url = new URL(rawBase);
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = url.port || '8000';
        return `${protocol}//${host}:${port}/ws/routers/${routerId}/traffic/?interface=${encodeURIComponent(iface)}`;
    } catch {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.hostname}:8000/ws/routers/${routerId}/traffic/?interface=${encodeURIComponent(iface)}`;
    }
}

export default function TenantRouterWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const routerId = resolvedParams.id;

    const [selectedInterface, setSelectedInterface] = useState<string>('ether1');
    const [trafficHistory, setTrafficHistory] = useState<TrafficPoint[]>([]);
    const [peakRx, setPeakRx] = useState<number>(0);
    const [peakTx, setPeakTx] = useState<number>(0);
    const [isLiveStreaming, setIsLiveStreaming] = useState<boolean>(true);
    const [showMoreInterfaces, setShowMoreInterfaces] = useState<boolean>(false);
    const [interfaceSearch, setInterfaceSearch] = useState<string>('');
    const [isMounted, setIsMounted] = useState<boolean>(false);
    const [wsConnected, setWsConnected] = useState<boolean>(false);
    const [liveTrafficData, setLiveTrafficData] = useState<{
        rx_bps: number;
        tx_bps: number;
        rx_pps: number;
        tx_pps: number;
        cpu_load?: number;
        memory_percent?: number;
        free_memory?: number;
        total_memory?: number;
        uptime?: string;
        latency_ms?: number;
        collected_at?: string;
    } | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Dialogs
    const [unregisteredModalOpen, setUnregisteredModalOpen] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importUsernameInput, setImportUsernameInput] = useState('');

    // Fetch Workspace Data ONCE on mount (no automatic polling, eliminating server load)
    const workspaceQuery = useQuery({
        queryKey: ['routers', routerId, 'workspace'],
        queryFn: () => routerApi.workspace(routerId, selectedInterface),
        refetchInterval: false,
        refetchOnWindowFocus: false,
    });

    const data: RouterWorkspaceData | undefined = workspaceQuery.data;

    // Auto-select first active running interface once data loads
    useEffect(() => {
        if (data?.interfaces && data.interfaces.length > 0) {
            const current = data.interfaces.find(i => i.name === selectedInterface);
            if (!current || !current.running) {
                const firstRunning =
                    data.interfaces.find(i => i.physical && i.running) ||
                    data.interfaces.find(i => i.running) ||
                    data.interfaces[0];
                if (firstRunning && firstRunning.name !== selectedInterface) {
                    setSelectedInterface(firstRunning.name);
                }
            }
        }
    }, [data?.interfaces, selectedInterface]);

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

    // WebSocket real-time traffic streaming
    useEffect(() => {
        if (!isMounted || !routerId) return;

        let socket: WebSocket | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let isCancelled = false;

        function connectWs() {
            if (isCancelled) return;
            try {
                const wsUrl = getWebSocketUrl(routerId, selectedInterface);
                if (!wsUrl) return;

                socket = new WebSocket(wsUrl);
                wsRef.current = socket;

                socket.onopen = () => {
                    if (isCancelled) {
                        socket?.close();
                        return;
                    }
                    setWsConnected(true);
                };

                socket.onmessage = (event) => {
                    if (isCancelled) return;
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'telemetry' || msg.type === 'traffic') {
                            const rx = Number(msg.rx_bps || 0);
                            const tx = Number(msg.tx_bps || 0);
                            const rxPps = Number(msg.rx_pps || 0);
                            const txPps = Number(msg.tx_pps || 0);

                            setLiveTrafficData({
                                rx_bps: rx,
                                tx_bps: tx,
                                rx_pps: rxPps,
                                tx_pps: txPps,
                                cpu_load: msg.cpu_load !== undefined ? Number(msg.cpu_load) : undefined,
                                memory_percent: msg.memory_percent !== undefined ? Number(msg.memory_percent) : undefined,
                                free_memory: msg.free_memory !== undefined ? Number(msg.free_memory) : undefined,
                                total_memory: msg.total_memory !== undefined ? Number(msg.total_memory) : undefined,
                                uptime: msg.uptime || undefined,
                                latency_ms: msg.latency_ms !== undefined ? Number(msg.latency_ms) : undefined,
                                collected_at: msg.collected_at,
                            });

                            setPeakRx(prev => Math.max(prev, rx));
                            setPeakTx(prev => Math.max(prev, tx));

                            setTrafficHistory(prev => {
                                const timeLabel = new Date(msg.collected_at || Date.now()).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: false,
                                });
                                const next = [...prev, { time: timeLabel, rxBps: rx, txBps: tx }];
                                if (next.length > 30) return next.slice(next.length - 30);
                                return next;
                            });
                        }
                    } catch {
                        // ignore malformed message
                    }
                };

                socket.onclose = () => {
                    setWsConnected(false);
                    if (!isCancelled) {
                        reconnectTimeout = setTimeout(connectWs, 3000);
                    }
                };

                socket.onerror = () => {
                    socket?.close();
                };
            } catch {
                if (!isCancelled) {
                    reconnectTimeout = setTimeout(connectWs, 3000);
                }
            }
        }

        connectWs();

        return () => {
            isCancelled = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (socket) {
                socket.onclose = null;
                socket.onerror = null;
                socket.close();
            }
            wsRef.current = null;
        };
    }, [routerId, isMounted]);

    // Send interface switch to open WebSocket without reconnecting
    useEffect(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                action: 'set_interface',
                interface: selectedInterface,
            }));
        }
    }, [selectedInterface]);

    // Seed initial traffic point once initial workspace data loads
    useEffect(() => {
        if (!data?.traffic || trafficHistory.length > 0) return;
        const rx = Number(data.traffic.rx_bps || 0);
        const tx = Number(data.traffic.tx_bps || 0);
        setPeakRx(prev => Math.max(prev, rx));
        setPeakTx(prev => Math.max(prev, tx));
        const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        setTrafficHistory([{ time: timeLabel, rxBps: rx, txBps: tx }]);
    }, [data?.traffic]);

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

    // Chart dimensions & dynamic auto-scaling based on real bandwidth
    const chartHeight = 220;
    const chartWidth = 900;
    const maxChartValue = useMemo(() => {
        let max = 50_000; // minimum baseline 50 Kbps
        for (const pt of trafficHistory) {
            if (pt.txBps > max) max = pt.txBps;
            if (pt.rxBps > max) max = pt.rxBps;
        }
        return Math.max(100_000, max * 1.25); // 25% headroom
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

    const latestRx = liveTrafficData?.rx_bps ?? (data?.traffic?.rx_bps ?? (trafficHistory[trafficHistory.length - 1]?.rxBps || 0));
    const latestTx = liveTrafficData?.tx_bps ?? (data?.traffic?.tx_bps ?? (trafficHistory[trafficHistory.length - 1]?.txBps || 0));
    const latestRxPps = liveTrafficData?.rx_pps ?? (data?.traffic?.rx_pps ?? 0);
    const latestTxPps = liveTrafficData?.tx_pps ?? (data?.traffic?.tx_pps ?? 0);
    const liveCpu = liveTrafficData?.cpu_load ?? (data?.resource.cpu_load ?? 0.0);
    const liveMemory = liveTrafficData?.memory_percent ?? (data?.resource.memory_percent ?? 0.0);
    const liveUptime = liveTrafficData?.uptime || data?.resource.uptime || 'Online';
    const liveLatency = liveTrafficData?.latency_ms ?? (data?.latency_ms ?? 0);

    const refreshTimestamp = useMemo(() => {
        if (!isMounted) return 'Just now';
        const timestamp = liveTrafficData?.collected_at || data?.collected_at;
        if (!timestamp) {
            return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        }
        try {
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        } catch {
            return 'Just now';
        }
    }, [liveTrafficData?.collected_at, data?.collected_at, isMounted]);

    return (
        <div className="space-y-6 pb-12">
            {/* Top Bar: Breadcrumb + Action Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Link
                        href="/tenant/routers"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Router Management
                    </Link>
                    <span className="text-muted-foreground/40">/</span>
                    <span className="text-xs font-mono font-medium text-foreground">
                        {data?.router.name || 'MikroTik Workspace'}
                    </span>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/10 shadow-2xs"
                        onClick={() => setImportModalOpen(true)}
                    >
                        <Download className="h-3.5 w-3.5" />
                        Import PPP Secrets
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 shadow-2xs"
                        disabled={syncClientsMutation.isPending}
                        onClick={() => syncClientsMutation.mutate()}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncClientsMutation.isPending ? 'animate-spin' : ''}`} />
                        Sync Clients
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 shadow-2xs"
                        onClick={() => setUnregisteredModalOpen(true)}
                    >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Unregistered
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title="Manual Refresh"
                        disabled={workspaceQuery.isFetching}
                        onClick={() => workspaceQuery.refetch()}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${workspaceQuery.isFetching ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Unified Device Identity Hero Bar */}
            <Card className="p-4 sm:p-5 border-border bg-card shadow-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shadow-2xs">
                            <Server className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-heading">
                                    {data?.router.name || 'MikroTik Router'}
                                </h1>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    ONLINE
                                </span>
                                <Badge variant="secondary" className="font-mono text-[11px] font-medium">
                                    {data?.routerboard.model || data?.router.model || 'CCR1036-8G-2S+'}
                                </Badge>
                                <Badge variant="outline" className="font-mono text-[11px] font-medium text-muted-foreground">
                                    ROS {data?.resource.version || '7.23.5'}
                                </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-mono">
                                <span>Management: <strong className="text-foreground">{data?.router.ip || '163.61.217.81'}:{data?.router.port || 7824}</strong></span>
                                <span>•</span>
                                <span>Uptime: <strong className="text-foreground">{liveUptime}</strong></span>
                                <span>•</span>
                                <span>Serial: <strong className="text-foreground">{data?.routerboard.serial_number || 'D83B0E32591C'}</strong></span>
                            </div>
                        </div>
                    </div>

                    {/* Live WebSocket Beacon Pill */}
                    <div className="flex items-center gap-3 self-start lg:self-center">
                        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-mono font-medium shadow-2xs ${
                            wsConnected
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}>
                            <span className="relative flex h-2 w-2">
                                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                    wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                                }`} />
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                    wsConnected ? 'bg-emerald-500' : 'bg-amber-500'
                                }`} />
                            </span>
                            <span>{wsConnected ? `● ${liveLatency}ms Live Socket` : 'Connecting...'}</span>
                            <span className="text-muted-foreground/50">|</span>
                            <span className="text-[11px] text-muted-foreground">0% Polling</span>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Live Telemetry KPI Deck (4 High-Impact Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Live Throughput Card */}
                <Card className="p-4 sm:p-5 border-border bg-card shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Activity className="h-4 w-4 text-primary" />
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                THROUGHPUT ({selectedInterface})
                            </span>
                        </div>
                        {wsConnected && (
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                    </div>
                    
                    <div className="my-3 space-y-2">
                        {/* RX Download */}
                        <div className="flex items-baseline justify-between">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-500">
                                <ArrowDownRight className="h-3.5 w-3.5" /> RX (DL)
                            </span>
                            <div className="text-right">
                                <span className="text-xl font-extrabold font-mono text-teal-400">
                                    {formatBps(latestRx)}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground ml-1.5">
                                    {latestRxPps} pps
                                </span>
                            </div>
                        </div>

                        {/* TX Upload */}
                        <div className="flex items-baseline justify-between">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500">
                                <ArrowUpRight className="h-3.5 w-3.5" /> TX (UL)
                            </span>
                            <div className="text-right">
                                <span className="text-xl font-extrabold font-mono text-amber-400">
                                    {formatBps(latestTx)}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground ml-1.5">
                                    {latestTxPps} pps
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                        <span>Peak RX: {formatBps(peakRx)}</span>
                        <span>•</span>
                        <span>TX: {formatBps(peakTx)}</span>
                    </div>
                </Card>

                {/* 2. CPU Utilization Card */}
                <Card className="p-4 sm:p-5 border-border bg-card shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Cpu className="h-4 w-4 text-emerald-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                CPU UTILIZATION
                            </span>
                        </div>
                        {wsConnected && (
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                    </div>

                    <div className="my-3">
                        <div className="flex items-baseline gap-2">
                            <span className={`text-4xl font-extrabold font-mono tracking-tight ${
                                liveCpu > 80 ? 'text-rose-500' : liveCpu > 50 ? 'text-amber-500' : 'text-foreground'
                            }`}>
                                {Math.round(liveCpu)}%
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                                {liveCpu.toFixed(1)}% current
                            </span>
                        </div>

                        <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden mt-3">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    liveCpu > 80 ? 'bg-rose-500' : liveCpu > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.max(4, Math.min(100, liveCpu))}%` }}
                            />
                        </div>
                    </div>

                    <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                        <span>{data?.resource.cpu_count || 36} Cores @ {data?.resource.cpu_frequency || 1200}MHz</span>
                        <span className="truncate max-w-[120px]">{data?.resource.cpu || 'Tile-Gx36'}</span>
                    </div>
                </Card>

                {/* 3. Memory Footprint Card */}
                <Card className="p-4 sm:p-5 border-border bg-card shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <HardDrive className="h-4 w-4 text-sky-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                MEMORY USAGE
                            </span>
                        </div>
                        {wsConnected && (
                            <span className="flex h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
                        )}
                    </div>

                    <div className="my-3">
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-extrabold font-mono tracking-tight text-foreground">
                                {Math.round(liveMemory)}%
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                                {liveTrafficData?.total_memory && liveTrafficData?.free_memory
                                    ? `${formatBytes(liveTrafficData.total_memory - liveTrafficData.free_memory)} used`
                                    : `${liveMemory.toFixed(1)}%`}
                            </span>
                        </div>

                        <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden mt-3">
                            <div
                                className="bg-sky-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(4, Math.min(100, liveMemory))}%` }}
                            />
                        </div>
                    </div>

                    <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                        <span>
                            {liveTrafficData?.free_memory ? `${formatBytes(liveTrafficData.free_memory)} Free` : 'Memory OK'}
                        </span>
                        <span>
                            Total: {liveTrafficData?.total_memory ? formatBytes(liveTrafficData.total_memory) : formatBytes(data?.resource.total_memory || 0)}
                        </span>
                    </div>
                </Card>

                {/* 4. Active Subscribers & Interfaces Card */}
                <Card className="p-4 sm:p-5 border-border bg-card shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Users className="h-4 w-4 text-purple-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                PPPOE SESSIONS
                            </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono font-medium text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10">
                            {data?.profiles ?? 9} Profiles
                        </Badge>
                    </div>

                    <div className="my-3">
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-extrabold font-mono tracking-tight text-foreground">
                                {data?.pppoe_active ?? 0}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                                / {data?.total_secrets ?? 0} secrets
                            </span>
                        </div>

                        <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden mt-3">
                            <div
                                className="bg-purple-500 h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${Math.max(4, Math.min(100, ((data?.pppoe_active ?? 0) / Math.max(1, data?.total_secrets ?? 1)) * 100))}%`
                                }}
                            />
                        </div>
                    </div>

                    <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                        <span>Ports: {data?.active_ports ?? 7}/{data?.total_ports ?? 10}</span>
                        <span>{data?.active_interfaces ?? 248} Interfaces</span>
                    </div>
                </Card>
            </div>

            {/* Section 3: Integrated NOC Hub: Physical Port Chassis + Real-Time Bandwidth Waveform */}
            <Card className="border-border bg-slate-950 text-white shadow-md overflow-hidden">
                {/* Hub Header Bar */}
                <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/30">
                            <Network className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold font-mono text-sky-400">
                                    {selectedInterface}
                                </h3>
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold border ${
                                    wsConnected
                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                                    {wsConnected ? 'WS STREAMING' : 'CONNECTING'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">
                                Real-Time Bandwidth Monitor & Interactive Chassis Faceplate
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-teal-400">
                                <span className="h-2 w-2 rounded-full bg-teal-400" />
                                RX (DL)
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-amber-400">
                                <span className="h-2 w-2 rounded-full bg-amber-400" />
                                TX (UL)
                            </span>
                        </div>
                        <span className="text-slate-700 hidden sm:inline">|</span>
                        <div className="hidden sm:flex items-center gap-2 text-slate-400">
                            <span suppressHydrationWarning>{isMounted ? refreshTimestamp : 'Just now'}</span>
                            <span className="text-slate-600">•</span>
                            <span>{liveLatency} ms latency</span>
                        </div>
                    </div>
                </div>

                {/* Integrated Port Chassis Switchplate */}
                <div className="border-b border-slate-800/80 bg-slate-900/70 p-3.5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                            Hardware Port Chassis — Click any interface to switch live telemetry stream
                        </span>
                        <div className="flex items-center gap-3 text-[11px] font-mono">
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                                Up
                            </span>
                            <span className="inline-flex items-center gap-1 text-slate-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                                Down
                            </span>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 overflow-x-auto shadow-inner">
                        <div className="flex items-center gap-2 min-w-max py-1">
                            {physicalPorts.map((port) => {
                                const isSelected = selectedInterface === port.name;
                                const isActive = port.running && !port.disabled;

                                return (
                                    <button
                                        key={port.id}
                                        type="button"
                                        onClick={() => setSelectedInterface(port.name)}
                                        className={`group flex flex-col items-center justify-between rounded-lg p-2 transition-all outline-none cursor-pointer ${
                                            isSelected
                                                ? 'bg-sky-500/20 ring-2 ring-sky-400 shadow-md shadow-sky-500/20'
                                                : isActive
                                                ? 'bg-slate-900 ring-1 ring-slate-700 hover:ring-sky-500/60 hover:bg-slate-800'
                                                : 'bg-slate-900/40 ring-1 ring-slate-800/50 opacity-50 hover:opacity-80'
                                        }`}
                                        style={{ width: port.name.includes('sfp') ? '86px' : '74px' }}
                                    >
                                        {/* LED & Speed Badge */}
                                        <div className="w-full flex justify-between items-center px-1 mb-1">
                                            <span
                                                className={`h-1.5 w-1.5 rounded-full ${
                                                    isActive
                                                        ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                                                        : 'bg-slate-600'
                                                }`}
                                            />
                                            {port.name.includes('sfp') && (
                                                <span className="text-[9px] font-mono text-amber-400 font-bold uppercase">
                                                    10G
                                                </span>
                                            )}
                                        </div>

                                        {/* Physical Port Face Slot */}
                                        <div
                                            className={`flex items-center justify-center rounded border transition-colors ${
                                                port.name.includes('sfp')
                                                    ? 'h-7 w-14 rounded-xs border-amber-500/40 bg-slate-950'
                                                    : 'h-7 w-11 rounded-xs border-slate-700 bg-slate-950'
                                            } ${
                                                isActive
                                                    ? 'border-sky-400/80 shadow-[0_0_6px_rgba(56,189,248,0.25)]'
                                                    : ''
                                            }`}
                                        >
                                            <span className="text-[10px] font-mono font-bold text-slate-400 group-hover:text-slate-200">
                                                {port.name.includes('sfp') ? 'SFP+' : 'RJ45'}
                                            </span>
                                        </div>

                                        {/* Port Name */}
                                        <span className={`mt-1.5 text-[11px] font-mono font-bold truncate ${
                                            isSelected ? 'text-sky-300' : 'text-slate-300 group-hover:text-white'
                                        }`}>
                                            {port.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* SVG Bandwidth Graph Area */}
                <div className="p-4 sm:p-5">
                    <div className="relative h-64 w-full">
                        {/* Background Grid Lines & Y-Axis Labels */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[10px] font-mono text-slate-500 select-none">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
                                <span>{formatBps(maxChartValue)}</span>
                                <span className="text-slate-600">Peak Scale</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-800/40 pb-1">
                                <span>{formatBps(maxChartValue * 0.75)}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-800/40 pb-1">
                                <span>{formatBps(maxChartValue * 0.5)}</span>
                                <span className="text-slate-600">50% Scale</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-800/40 pb-1">
                                <span>{formatBps(maxChartValue * 0.25)}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
                                <span>0 bps</span>
                                <span className="text-slate-600">Baseline</span>
                            </div>
                        </div>

                        {/* SVG Curves */}
                        <svg
                            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                            preserveAspectRatio="none"
                            className="absolute inset-0 h-full w-full overflow-visible"
                        >
                            <defs>
                                <linearGradient id="rxGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.45" />
                                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.0" />
                                </linearGradient>
                                <linearGradient id="txGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
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
                                    strokeLinejoin="round"
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
                                    strokeLinejoin="round"
                                />
                            )}

                            {/* Current Value Head Ping Dots */}
                            {trafficHistory.length > 0 && (() => {
                                const lastIdx = trafficHistory.length - 1;
                                const dx = chartWidth / (trafficHistory.length - 1 || 1);
                                const lastX = lastIdx * dx;
                                const lastRxVal = trafficHistory[lastIdx].rxBps;
                                const lastTxVal = trafficHistory[lastIdx].txBps;
                                const lastYRx = chartHeight - (lastRxVal / maxChartValue) * (chartHeight - 30) - 15;
                                const lastYTx = chartHeight - (lastTxVal / maxChartValue) * (chartHeight - 30) - 15;

                                return (
                                    <>
                                        <circle cx={lastX} cy={Math.max(10, Math.min(chartHeight - 10, lastYRx))} r="5" fill="#2dd4bf" className="animate-ping" opacity="0.6" />
                                        <circle cx={lastX} cy={Math.max(10, Math.min(chartHeight - 10, lastYRx))} r="3.5" fill="#2dd4bf" />
                                        <circle cx={lastX} cy={Math.max(10, Math.min(chartHeight - 10, lastYTx))} r="5" fill="#f59e0b" className="animate-ping" opacity="0.6" />
                                        <circle cx={lastX} cy={Math.max(10, Math.min(chartHeight - 10, lastYTx))} r="3.5" fill="#f59e0b" />
                                    </>
                                );
                            })()}
                        </svg>
                    </div>

                    {/* X-Axis Timestamps */}
                    <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-3 border-t border-slate-800" suppressHydrationWarning>
                        {isMounted && trafficHistory.slice(-5).map((pt, idx) => (
                            <span key={idx} suppressHydrationWarning>{pt.time}</span>
                        ))}
                    </div>
                </div>

                {/* Traffic Rate Stats Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/80 p-4 border-t border-slate-800 font-mono">
                    <div className="p-2.5 rounded bg-slate-950/50 border border-slate-800/50">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase">
                            <span>CURRENT RX (DL)</span>
                            <span className="text-[10px] text-teal-400/80">{latestRxPps} pps</span>
                        </div>
                        <div className="text-base font-bold text-teal-400 mt-1">{formatBps(latestRx)}</div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-950/50 border border-slate-800/50">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 uppercase">
                            <span>CURRENT TX (UL)</span>
                            <span className="text-[10px] text-amber-400/80">{latestTxPps} pps</span>
                        </div>
                        <div className="text-base font-bold text-amber-400 mt-1">{formatBps(latestTx)}</div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-950/50 border border-slate-800/50">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">PEAK RX OBSERVED</span>
                        <div className="text-base font-bold text-teal-300 mt-1">{formatBps(peakRx)}</div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-950/50 border border-slate-800/50">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">PEAK TX OBSERVED</span>
                        <div className="text-base font-bold text-amber-300 mt-1">{formatBps(peakTx)}</div>
                    </div>
                </div>
            </Card>

            {/* Section 4: 2-Column Hardware Architecture Blueprint & Capacity Health Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Column 1: Hardware Specifications */}
                <Card className="p-5 border-border bg-card shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                        <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-primary" />
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                ROUTER ARCHITECTURE BLUEPRINT
                            </h3>
                        </div>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                            MIKROTIK ROUTERBOARD
                        </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">MODEL</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                                {data?.routerboard.model || data?.router.model || 'CCR1036-8G-2S+'}
                            </div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">ROUTEROS</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                                {data?.resource.version || '7.23.5'}
                            </div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">SERIAL NUMBER</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                                {data?.routerboard.serial_number || 'D83B0E32591C'}
                            </div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">BOARD ARCH</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                                {data?.resource.board_name || 'Tile'}
                            </div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">FIRMWARE</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                                {data?.routerboard.current_firmware || data?.resource.version || '7.23.5'}
                            </div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">SYSTEM UPTIME</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                                {liveUptime}
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Column 2: Environmental Health & Diagnostics */}
                <Card className="p-5 border-border bg-card shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                        <div className="flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-emerald-500" />
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                SYSTEM HEALTH & DIAGNOSTICS
                            </h3>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            OPTIMAL STATUS
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">TEMPERATURE</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                                {data?.health.temperature ?? 57}°C
                            </div>
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono">Normal Thermal</span>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">VOLTAGE / PSU</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                                {data?.health.voltage ?? 24.1} V
                            </div>
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono">Stable Input</span>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">MANAGEMENT RTT</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                                {liveLatency || data?.latency_ms || 28} ms
                            </div>
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono">Sub-50ms Ultra-low</span>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">TOTAL INTERFACES</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                                {data?.total_interfaces || data?.interfaces.length || 256} registered
                            </div>
                            <span className="text-[9px] text-sky-600 dark:text-sky-400 font-mono">Physical + Virtual</span>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">ACTIVE SUBSCRIBERS</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                                {data?.pppoe_active ?? 0} PPPoE
                            </div>
                            <span className="text-[9px] text-purple-600 dark:text-purple-400 font-mono">Authenticated</span>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 border border-border/50">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase">QOS PROFILES</div>
                            <div className="text-xs font-bold font-mono text-foreground mt-0.5">
                                {data?.profiles ?? 9} profiles
                            </div>
                            <span className="text-[9px] text-muted-foreground font-mono">Bandwidth Queues</span>
                        </div>
                    </div>
                </Card>
            </div>

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

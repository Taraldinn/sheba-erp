"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  Clipboard,
  Globe,
  Loader2,
  Network as NetworkIcon,
  Play,
  RefreshCw,
  Router as RouterIcon,
  Search,
  Server,
  Send,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiClient } from "@/lib/api";
import { Router, RouterAdvancedHealth, AdvancedHealthPingResult } from "@/types";

type TabKey = "interfaces" | "arp" | "neighbors" | "routes" | "ping" | "log";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Activity }> = [
  { key: "interfaces", label: "Interfaces", icon: NetworkIcon },
  { key: "arp", label: "ARP Table", icon: ArrowDownUp },
  { key: "neighbors", label: "Neighbors", icon: Server },
  { key: "routes", label: "Routes", icon: Globe },
  { key: "ping", label: "Ping Tool", icon: Send },
  { key: "log", label: "Log Tail", icon: Clipboard },
];

const formatRate = (bps: number) => {
  if (!bps || bps <= 0) return "0 bps";
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  let val = bps;
  let i = 0;
  while (val >= 1000 && i < units.length - 1) {
    val /= 1000;
    i += 1;
  }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
};

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
};

export default function AdvancedHealthPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [routersLoading, setRoutersLoading] = useState(true);
  const [selectedRouterId, setSelectedRouterId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<RouterAdvancedHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("interfaces");
  const [pingTarget, setPingTarget] = useState("8.8.8.8");
  const [pingCount, setPingCount] = useState(4);
  const [pingRunning, setPingRunning] = useState(false);
  const [pingHistory, setPingHistory] = useState<AdvancedHealthPingResult[]>([]);

  // Load routers list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await ApiClient.getRouters();
        if (!cancelled) {
          setRouters(data || []);
          if ((data || []).length > 0) setSelectedRouterId(data[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setHealthError((err as Error).message || "Failed to load routers");
        }
      } finally {
        if (!cancelled) setRoutersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadHealth = useCallback(async (id: string) => {
    if (!id) return;
    setHealthLoading(true);
    setHealthError(null);
    try {
      const data = await ApiClient.getRouterAdvancedHealth(id);
      setHealth(data);
    } catch (err) {
      setHealth(null);
      setHealthError((err as Error).message || "Failed to load diagnostic data");
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRouterId) loadHealth(selectedRouterId);
  }, [selectedRouterId, loadHealth]);

  const filteredRouters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return routers;
    return routers.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.ip_address?.toLowerCase().includes(q) ||
        r.hostname?.toLowerCase().includes(q)
    );
  }, [routers, search]);

  const runPing = useCallback(async () => {
    if (!selectedRouterId || !pingTarget.trim()) return;
    setPingRunning(true);
    try {
      const result = await ApiClient.pingRouter(selectedRouterId, {
        target: pingTarget.trim(),
        count: pingCount,
      });
      setPingHistory((prev) => [result, ...prev].slice(0, 20));
    } catch (err) {
      setPingHistory((prev) => [
        {
          id: `local-${Date.now()}`,
          router: selectedRouterId,
          router_name: health?.router_name || "",
          target: pingTarget,
          packet_count: pingCount,
          received: 0,
          min_latency_ms: null,
          avg_latency_ms: null,
          max_latency_ms: null,
          status: "ERROR",
          raw_output: [],
          ran_by: "local",
          ran_at: new Date().toISOString(),
          error: (err as Error).message,
        } as unknown as AdvancedHealthPingResult,
        ...prev,
      ].slice(0, 20));
    } finally {
      setPingRunning(false);
    }
  }, [selectedRouterId, pingTarget, pingCount, health?.router_name]);

  const copyLogToClipboard = useCallback(() => {
    if (!health?.log_tail?.length) return;
    const text = health.log_tail
      .map((line) => `[${line.time}] ${line.topics}: ${line.message}`)
      .join("\n");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => undefined);
    }
  }, [health]);

  const selectedRouter = useMemo(
    () => routers.find((r) => r.id === selectedRouterId) || null,
    [routers, selectedRouterId]
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Activity className="h-7 w-7 text-emerald-500" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Advanced Health & Diagnostics
            </h1>
            <Badge variant="outline" className="ml-2 border-emerald-300 text-emerald-700">
              Admin
            </Badge>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Real-time troubleshooting for every MikroTik router in your fleet:
            interface counters, ARP table, IP neighbor discovery, routing table,
            on-demand ping, and the RouterOS log tail. Use this screen to
            pinpoint link flaps, rogue ARP entries, or routing anomalies before
            opening a customer ticket.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Router selector */}
          <Card className="md:col-span-4 lg:col-span-3 h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-500" /> Routers
              </CardTitle>
              <CardDescription className="text-xs">
                Select a router to inspect.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search routers…"
                  className="pl-8 h-9"
                />
              </div>
              <div className="max-h-[420px] overflow-y-auto space-y-1">
                {routersLoading && (
                  <div className="flex items-center justify-center py-6 text-slate-500 text-sm">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
                  </div>
                )}
                {!routersLoading && filteredRouters.length === 0 && (
                  <div className="py-6 text-center text-sm text-slate-500">
                    No routers found.
                  </div>
                )}
                {filteredRouters.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRouterId(r.id)}
                    className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
                      selectedRouterId === r.id
                        ? "bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent"
                    }`}
                  >
                    <RouterIcon className="h-4 w-4 text-slate-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-slate-500 truncate">{r.ip_address}</div>
                    </div>
                    <Badge
                      variant={r.status === "Online" ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {r.status}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tabs + content */}
          <Card className="md:col-span-8 lg:col-span-9">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">
                  {selectedRouter ? selectedRouter.name : "No router selected"}
                </CardTitle>
                <CardDescription className="text-xs">
                  {selectedRouter
                    ? `${selectedRouter.ip_address} • ${selectedRouter.hostname || "no hostname"} • captured ${formatDateTime(health?.captured_at)}`
                    : "Pick a router from the list."}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedRouterId && loadHealth(selectedRouterId)}
                disabled={!selectedRouterId || healthLoading}
              >
                {healthLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-1">Refresh</span>
              </Button>
            </CardHeader>
            <CardContent>
              {healthError && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-800 dark:text-rose-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{healthError}</span>
                </div>
              )}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
                <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
                  {TABS.map((t) => (
                    <TabsTrigger key={t.key} value={t.key} className="text-xs">
                      <t.icon className="h-3.5 w-3.5 mr-1" /> {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="interfaces" className="mt-4">
                  <InterfacesTable health={health} loading={healthLoading} />
                </TabsContent>

                <TabsContent value="arp" className="mt-4">
                  <ArpTable health={health} loading={healthLoading} />
                </TabsContent>

                <TabsContent value="neighbors" className="mt-4">
                  <NeighborsTable health={health} loading={healthLoading} />
                </TabsContent>

                <TabsContent value="routes" className="mt-4">
                  <RoutesTable health={health} loading={healthLoading} />
                </TabsContent>

                <TabsContent value="ping" className="mt-4">
                  <PingPanel
                    target={pingTarget}
                    setTarget={setPingTarget}
                    count={pingCount}
                    setCount={setPingCount}
                    history={pingHistory}
                    running={pingRunning}
                    onRun={runPing}
                  />
                </TabsContent>

                <TabsContent value="log" className="mt-4">
                  <LogPanel
                    health={health}
                    loading={healthLoading}
                    onCopy={copyLogToClipboard}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {label}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-10 text-center text-sm text-slate-500">{label}</div>
  );
}

function InterfacesTable({
  health,
  loading,
}: {
  health: RouterAdvancedHealth | null;
  loading: boolean;
}) {
  if (loading) return <LoadingState />;
  const rows = health?.interfaces || [];
  if (rows.length === 0) {
    return <EmptyState label="No interfaces reported (router may be unreachable)." />;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
          <tr>
            <th className="text-left px-3 py-2">Name</th>
            <th className="text-left px-3 py-2">Type</th>
            <th className="text-left px-3 py-2">State</th>
            <th className="text-left px-3 py-2">MAC</th>
            <th className="text-right px-3 py-2">RX</th>
            <th className="text-right px-3 py-2">TX</th>
            <th className="text-right px-3 py-2">RX Rate</th>
            <th className="text-right px-3 py-2">TX Rate</th>
            <th className="text-right px-3 py-2">Errors</th>
            <th className="text-right px-3 py-2">Link Downs</th>
            <th className="text-left px-3 py-2">Comment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((iface) => (
            <tr
              key={iface.name}
              className="border-t border-slate-100 dark:border-slate-800"
            >
              <td className="px-3 py-2 font-medium">{iface.name}</td>
              <td className="px-3 py-2 text-slate-600">{iface.type}</td>
              <td className="px-3 py-2">
                {iface.disabled ? (
                  <Badge variant="outline" className="border-slate-400 text-slate-600">
                    Disabled
                  </Badge>
                ) : iface.running ? (
                  <Badge className="bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Up
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" /> Down
                  </Badge>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{iface.mac_address || "—"}</td>
              <td className="px-3 py-2 text-right">{formatBytes(iface.rx_bytes)}</td>
              <td className="px-3 py-2 text-right">{formatBytes(iface.tx_bytes)}</td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatRate(iface.rx_rate_bps)}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatRate(iface.tx_rate_bps)}
              </td>
              <td className="px-3 py-2 text-right">
                <span
                  className={
                    iface.rx_errors + iface.tx_errors > 0
                      ? "text-rose-600"
                      : "text-slate-500"
                  }
                >
                  {iface.rx_errors + iface.tx_errors}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                {iface.link_downs > 0 ? (
                  <span className="text-amber-600">{iface.link_downs}</span>
                ) : (
                  <span className="text-slate-500">0</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">{iface.comment || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArpTable({
  health,
  loading,
}: {
  health: RouterAdvancedHealth | null;
  loading: boolean;
}) {
  if (loading) return <LoadingState />;
  const rows = health?.arp || [];
  if (rows.length === 0) {
    return <EmptyState label="ARP table is empty (or router unreachable)." />;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
          <tr>
            <th className="text-left px-3 py-2">Address</th>
            <th className="text-left px-3 py-2">MAC Address</th>
            <th className="text-left px-3 py-2">Interface</th>
            <th className="text-left px-3 py-2">Flags</th>
            <th className="text-left px-3 py-2">Comment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.address}-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 font-mono">{row.address}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.mac_address || "—"}</td>
              <td className="px-3 py-2">{row.interface || "—"}</td>
              <td className="px-3 py-2 space-x-1">
                {row.dynamic ? <Badge variant="outline" className="text-[10px]">dynamic</Badge> : null}
                {row.complete ? <Badge variant="outline" className="text-[10px]">complete</Badge> : null}
                {row.published ? <Badge variant="outline" className="text-[10px]">published</Badge> : null}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">{row.comment || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NeighborsTable({
  health,
  loading,
}: {
  health: RouterAdvancedHealth | null;
  loading: boolean;
}) {
  if (loading) return <LoadingState />;
  const rows = health?.neighbors || [];
  if (rows.length === 0) {
    return <EmptyState label="No neighbor discovery entries." />;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
          <tr>
            <th className="text-left px-3 py-2">Address</th>
            <th className="text-left px-3 py-2">Identity</th>
            <th className="text-left px-3 py-2">Platform</th>
            <th className="text-left px-3 py-2">Board</th>
            <th className="text-left px-3 py-2">Version</th>
            <th className="text-left px-3 py-2">Interface</th>
            <th className="text-left px-3 py-2">Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.address}-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 font-mono">{row.address}</td>
              <td className="px-3 py-2 font-medium">{row.identity || "—"}</td>
              <td className="px-3 py-2">{row.platform || "—"}</td>
              <td className="px-3 py-2">{row.board || "—"}</td>
              <td className="px-3 py-2">{row.version || "—"}</td>
              <td className="px-3 py-2">{row.interface || "—"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{row.last_seen || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoutesTable({
  health,
  loading,
}: {
  health: RouterAdvancedHealth | null;
  loading: boolean;
}) {
  if (loading) return <LoadingState />;
  const rows = health?.routes || [];
  if (rows.length === 0) {
    return <EmptyState label="No routes returned." />;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
          <tr>
            <th className="text-left px-3 py-2">Destination</th>
            <th className="text-left px-3 py-2">Gateway</th>
            <th className="text-left px-3 py-2">Interface</th>
            <th className="text-right px-3 py-2">Distance</th>
            <th className="text-left px-3 py-2">Flags</th>
            <th className="text-left px-3 py-2">Comment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.dst_address}-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 font-mono">{row.dst_address}</td>
              <td className="px-3 py-2 font-mono">{row.gateway || "—"}</td>
              <td className="px-3 py-2">{row.interface || "—"}</td>
              <td className="px-3 py-2 text-right">{row.distance}</td>
              <td className="px-3 py-2 space-x-1">
                {row.active ? <Badge variant="outline" className="text-[10px]">active</Badge> : null}
                {row.static ? <Badge variant="outline" className="text-[10px]">static</Badge> : null}
                {row.dynamic ? <Badge variant="outline" className="text-[10px]">dynamic</Badge> : null}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">{row.comment || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PingPanel({
  target,
  setTarget,
  count,
  setCount,
  history,
  running,
  onRun,
}: {
  target: string;
  setTarget: (v: string) => void;
  count: number;
  setCount: (v: number) => void;
  history: AdvancedHealthPingResult[];
  running: boolean;
  onRun: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end gap-3 p-3 rounded-md border bg-slate-50 dark:bg-slate-800/40">
        <div className="flex-1">
          <label className="text-xs uppercase tracking-wide text-slate-500">
            Target (IP / Hostname)
          </label>
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="8.8.8.8"
            className="mt-1 font-mono"
          />
        </div>
        <div className="w-32">
          <label className="text-xs uppercase tracking-wide text-slate-500">Count</label>
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="mt-1"
          />
        </div>
        <Button onClick={onRun} disabled={running || !target.trim()}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          <span className="ml-1">{running ? "Pinging…" : "Run Ping"}</span>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">Target</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Recv / Sent</th>
              <th className="text-right px-3 py-2">Avg (ms)</th>
              <th className="text-right px-3 py-2">Min (ms)</th>
              <th className="text-right px-3 py-2">Max (ms)</th>
              <th className="text-left px-3 py-2">By</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No pings run yet.
                </td>
              </tr>
            )}
            {history.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 text-xs">{formatDateTime(p.ran_at)}</td>
                <td className="px-3 py-2 font-mono">{p.target}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant={
                      p.status === "SUCCESS"
                        ? "default"
                        : p.status === "TIMEOUT"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {p.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  {p.received}/{p.packet_count}
                </td>
                <td className="px-3 py-2 text-right">
                  {p.avg_latency_ms?.toFixed(2) ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {p.min_latency_ms?.toFixed(2) ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {p.max_latency_ms?.toFixed(2) ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs">{p.ran_by || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogPanel({
  health,
  loading,
  onCopy,
}: {
  health: RouterAdvancedHealth | null;
  loading: boolean;
  onCopy: () => void;
}) {
  if (loading) return <LoadingState />;
  const rows = health?.log_tail || [];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {rows.length === 0
            ? "Log tail is empty."
            : `Last ${rows.length} RouterOS log entries`}
        </div>
        <Button variant="outline" size="sm" onClick={onCopy} disabled={!rows.length}>
          <Clipboard className="h-4 w-4" />
          <span className="ml-1">Copy</span>
        </Button>
      </div>
      {rows.length > 0 ? (
        <div className="rounded-md border bg-slate-950 text-slate-100 font-mono text-xs max-h-[420px] overflow-auto">
          <table className="w-full">
            <tbody>
              {rows.map((line, idx) => (
                <tr key={idx} className="align-top">
                  <td className="px-3 py-1.5 text-emerald-300 whitespace-nowrap w-[150px]">
                    {line.time || "—"}
                  </td>
                  <td className="px-3 py-1.5 text-amber-300 whitespace-nowrap w-[120px]">
                    {line.topics || "—"}
                  </td>
                  <td className="px-3 py-1.5">{line.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

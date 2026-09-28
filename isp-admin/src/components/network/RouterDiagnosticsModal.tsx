"use client";

import { useState } from "react";
import {
  Activity,
  Terminal,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  Play,
  RotateCcw,
  Zap,
  Server,
  Layers,
  Copy,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";
import { Router, RouterPingResult, RouterTracerouteResult } from "@/types";

interface RouterDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  router: Router | null;
  allRouters?: Router[];
  onSelectRouter?: (routerId: string) => void;
}

export function RouterDiagnosticsModal({
  isOpen,
  onClose,
  router,
  allRouters = [],
  onSelectRouter,
}: RouterDiagnosticsModalProps) {
  const [activeTab, setActiveTab] = useState<"ping" | "traceroute">("ping");

  // Ping State
  const [pingTarget, setPingTarget] = useState("8.8.8.8");
  const [pingCount, setPingCount] = useState<number>(4);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<RouterPingResult | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  // Traceroute State
  const [traceTarget, setTraceTarget] = useState("8.8.8.8");
  const [isTracing, setIsTracing] = useState(false);
  const [traceResult, setTraceResult] = useState<RouterTracerouteResult | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);

  // Copy Feedback
  const [copied, setCopied] = useState(false);

  if (!router) return null;

  async function handleRunPing() {
    if (!router || !pingTarget.trim()) return;
    setIsPinging(true);
    setPingError(null);
    setPingResult(null);

    try {
      const res = await ApiClient.routerPing(router.id, pingTarget.trim(), pingCount);
      setPingResult(res);
    } catch (err: any) {
      setPingError(err?.message || "Failed to execute ping on router");
    } finally {
      setIsPinging(false);
    }
  }

  async function handleRunTraceroute() {
    if (!router || !traceTarget.trim()) return;
    setIsTracing(true);
    setTraceError(null);
    setTraceResult(null);

    try {
      const res = await ApiClient.routerTraceroute(router.id, traceTarget.trim());
      setTraceResult(res);
    } catch (err: any) {
      setTraceError(err?.message || "Failed to execute traceroute on router");
    } finally {
      setIsTracing(false);
    }
  }

  function handleCopyOutput(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const presets = ["8.8.8.8", "1.1.1.1", router.ip_address];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  Router Diagnostic Tools
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Real-time ICMP ping and layer-3 traceroute directly through RouterOS
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant={router.status === "Online" ? "success" : "destructive"}
              className="text-xs font-mono"
            >
              {router.status}
            </Badge>
          </div>

          {/* Router Selection Info */}
          <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground border-t border-border/50">
            <Server className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-foreground">{router.name}</span>
            <span className="font-mono">({router.ip_address})</span>
            {allRouters.length > 1 && onSelectRouter && (
              <select
                value={router.id}
                onChange={(e) => onSelectRouter(e.target.value)}
                className="ml-auto text-xs bg-muted/50 border border-border rounded px-2 py-0.5 text-foreground cursor-pointer focus:outline-none"
              >
                {allRouters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.ip_address})
                  </option>
                ))}
              </select>
            )}
          </div>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 mt-2">
          <button
            type="button"
            onClick={() => setActiveTab("ping")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-md transition-all ${
              activeTab === "ping"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-500" />
            ICMP Ping Diagnostic
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("traceroute")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium rounded-md transition-all ${
              activeTab === "traceroute"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            Traceroute Hop Inspection
          </button>
        </div>

        {/* ════════════════════════ PING TAB ════════════════════════ */}
        {activeTab === "ping" && (
          <div className="space-y-4 pt-2">
            <div className="space-y-3 bg-card border border-border/70 rounded-xl p-4 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3 space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Target Host / IP</label>
                  <Input
                    placeholder="e.g. 8.8.8.8, 1.1.1.1, or customer IP"
                    value={pingTarget}
                    onChange={(e) => setPingTarget(e.target.value)}
                    className="font-mono text-xs h-9"
                    onKeyDown={(e) => e.key === "Enter" && handleRunPing()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Count</label>
                  <select
                    value={pingCount}
                    onChange={(e) => setPingCount(Number(e.target.value))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={4}>4 packets</option>
                    <option value={10}>10 packets</option>
                    <option value={20}>20 packets</option>
                  </select>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-muted-foreground">Presets:</span>
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPingTarget(preset)}
                    className={`px-2 py-0.5 rounded font-mono text-[11px] border transition-colors ${
                      pingTarget === preset
                        ? "bg-primary/10 border-primary/30 text-primary font-bold"
                        : "bg-muted/40 border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <Button
                onClick={handleRunPing}
                disabled={isPinging || !pingTarget.trim()}
                className="w-full text-xs font-semibold gap-1.5 h-9"
              >
                {isPinging ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    Executing ICMP Ping...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Run Ping Probe
                  </>
                )}
              </Button>
            </div>

            {/* Error Banner */}
            {pingError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{pingError}</span>
              </div>
            )}

            {/* Ping Results */}
            {pingResult && (
              <div className="space-y-3">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-center">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Loss Rate
                    </span>
                    <span
                      className={`text-lg font-mono font-bold ${
                        (pingResult.packet_loss_pct ?? pingResult.packet_loss_percent ?? 0) === 0
                          ? "text-emerald-500"
                          : (pingResult.packet_loss_pct ?? pingResult.packet_loss_percent ?? 0) < 30
                          ? "text-amber-500"
                          : "text-rose-500"
                      }`}
                    >
                      {pingResult.packet_loss_pct ?? pingResult.packet_loss_percent ?? 0}%
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {pingResult.packets_received ?? pingResult.received ?? 0}/
                      {pingResult.packets_sent ?? pingResult.sent ?? pingCount} rx
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-center">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Avg RTT
                    </span>
                    <span className="text-lg font-mono font-bold text-foreground">
                      {pingResult.avg_rtt_ms ?? pingResult.avg_ms ?? "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">milliseconds</span>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-center">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Min RTT
                    </span>
                    <span className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {pingResult.min_rtt_ms ?? pingResult.min_ms ?? "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">fastest</span>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-center">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Max RTT
                    </span>
                    <span className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400">
                      {pingResult.max_rtt_ms ?? pingResult.max_ms ?? "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">peak latency</span>
                  </div>
                </div>

                {/* Response Log / Breakdown */}
                {Array.isArray(pingResult.results || pingResult.raw) && (
                  <div className="bg-zinc-950 text-emerald-400 rounded-lg p-3 font-mono text-xs border border-zinc-800 space-y-1 overflow-x-auto">
                    <div className="flex items-center justify-between pb-1 border-b border-zinc-800 text-zinc-400 text-[11px]">
                      <span>PING {pingResult.target} (MikroTik RouterOS)</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyOutput(
                            JSON.stringify(pingResult.results || pingResult.raw, null, 2)
                          )
                        }
                        className="flex items-center gap-1 hover:text-white"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    {(pingResult.results || pingResult.raw)?.map((row: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-zinc-300">
                        <span>
                          seq={idx + 1} host={row.host || row.address || pingResult.target}
                        </span>
                        <span className="font-bold text-emerald-400">
                          {row.time || (row["avg-rtt"] ? `${row["avg-rtt"]}ms` : "reply")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════ TRACEROUTE TAB ════════════════════════ */}
        {activeTab === "traceroute" && (
          <div className="space-y-4 pt-2">
            <div className="space-y-3 bg-card border border-border/70 rounded-xl p-4 shadow-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Target Host / IP</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. 8.8.8.8, 1.1.1.1, google.com"
                    value={traceTarget}
                    onChange={(e) => setTraceTarget(e.target.value)}
                    className="font-mono text-xs h-9 flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleRunTraceroute()}
                  />
                  <Button
                    onClick={handleRunTraceroute}
                    disabled={isTracing || !traceTarget.trim()}
                    className="text-xs font-semibold gap-1.5 h-9 shrink-0"
                  >
                    {isTracing ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                        Tracing...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Trace Route
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-muted-foreground">Presets:</span>
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTraceTarget(preset)}
                    className={`px-2 py-0.5 rounded font-mono text-[11px] border transition-colors ${
                      traceTarget === preset
                        ? "bg-primary/10 border-primary/30 text-primary font-bold"
                        : "bg-muted/40 border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Banner */}
            {traceError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{traceError}</span>
              </div>
            )}

            {/* Traceroute Results Hop Table */}
            {traceResult && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                  <span>Traceroute to {traceResult.target}</span>
                  <span>{traceResult.hops?.length || 0} hops reported</span>
                </div>

                <div className="border border-border/70 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60 text-muted-foreground border-b border-border/70 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 w-16 text-center">Hop #</th>
                        <th className="py-2.5 px-3">Gateway / Node Address</th>
                        <th className="py-2.5 px-3 text-center w-24">Loss</th>
                        <th className="py-2.5 px-3 text-right w-28">RTT / Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-mono">
                      {traceResult.hops && traceResult.hops.length > 0 ? (
                        traceResult.hops.map((h, i) => (
                          <tr key={i} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 text-center text-muted-foreground font-bold">
                              {h.hop || i + 1}
                            </td>
                            <td className="py-2 px-3 text-foreground font-semibold flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              {h.address || "*"}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <Badge
                                variant={
                                  !h.loss || h.loss === "0%" || h.loss === "0"
                                    ? "outline"
                                    : "destructive"
                                }
                                className="text-[10px] px-1.5 py-0"
                              >
                                {h.loss || "0%"}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                              {h.rtt ? (h.rtt.toString().endsWith("ms") ? h.rtt : `${h.rtt}ms`) : "—"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-muted-foreground">
                            No hops returned by RouterOS.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Heart,
  Layers,
  Network,
  ArrowUpFromLine,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Signal,
  WifiOff,
  Zap,
  CheckCircle2,
  Activity,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OLT, ONU } from "@/types";

interface AdvancedDiagnosticsPanelProps {
  olts: OLT[];
  onus: ONU[];
  showToast: (msg: string, type?: "success" | "error") => void;
  onReload: () => Promise<void>;
  onRebootOnu: (onu: ONU) => void;
}

// Signal quality thresholds matching NexOLT: >=−18 Excellent, >=−23 Good, >=−26 Warning, else Critical
function getSignalTier(
  rx: number,
  status: string
): "excellent" | "good" | "warning" | "critical" | "offline" {
  if (status !== "Online") return "offline";
  if (rx >= -18) return "excellent";
  if (rx >= -23) return "good";
  if (rx >= -26) return "warning";
  return "critical";
}

const TIER_CONFIG = {
  excellent: {
    label: "Excellent",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    barColor: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  good: {
    label: "Good",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    barColor: "bg-blue-500",
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  warning: {
    label: "Warning",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    barColor: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  critical: {
    label: "Critical",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    barColor: "bg-rose-500",
    badge: "bg-rose-500/20 text-rose-400 border-rose-500/40",
  },
  offline: {
    label: "Offline",
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/30",
    barColor: "bg-slate-500",
    badge: "bg-slate-800 text-slate-400 border-slate-700",
  },
};

type Section = "health" | "down_detection" | "pon_ports" | "mac_table" | "uplink_ports";

export default function AdvancedDiagnosticsPanel({
  olts,
  onus,
  onRebootOnu,
}: AdvancedDiagnosticsPanelProps) {
  const [activeSection, setActiveSection] = useState<Section>("health");
  const [expandedOlt, setExpandedOlt] = useState<string | null>(null);

  // ── Derived stats ──
  const signalDist = useMemo(() => {
    const c = { excellent: 0, good: 0, warning: 0, critical: 0, offline: 0 };
    onus.forEach((o) => {
      const rx = typeof o.rx_power === "number" ? o.rx_power : parseFloat(String(o.rx_power ?? "-99"));
      const tier = getSignalTier(isNaN(rx) ? -99 : rx, o.status);
      c[tier]++;
    });
    return c;
  }, [onus]);

  const downedOnus = useMemo(
    () =>
      [...onus.filter((o) => o.status !== "Online")].sort((a, b) => {
        const p: Record<string, number> = { DyingGasp: 0, Los: 1, Offline: 2 };
        return (p[a.status] ?? 3) - (p[b.status] ?? 3);
      }),
    [onus]
  );

  const ponPortsPerOlt = useMemo(
    () =>
      olts.map((olt) => {
        const oltOnus = onus.filter((o) => o.olt === olt.id);
        const portMap: Record<string, { total: number; online: number; offline: number; rxSum: number }> = {};
        oltOnus.forEach((o) => {
          if (!portMap[o.pon_port]) portMap[o.pon_port] = { total: 0, online: 0, offline: 0, rxSum: 0 };
          portMap[o.pon_port].total++;
          if (o.status === "Online") {
            portMap[o.pon_port].online++;
            portMap[o.pon_port].rxSum += typeof o.rx_power === "number" ? o.rx_power : parseFloat(String(o.rx_power ?? "0"));
          } else portMap[o.pon_port].offline++;
        });
        return { olt, portMap };
      }),
    [olts, onus]
  );

  const macOnus = useMemo(
    () => onus.filter((o) => (o.mactable ?? []).length > 0).sort((a, b) => (b.mactable?.length ?? 0) - (a.mactable?.length ?? 0)),
    [onus]
  );

  const totalMacs = useMemo(() => onus.reduce((s, o) => s + (o.mactable?.length ?? 0), 0), [onus]);
  const totalOnline = onus.filter((o) => o.status === "Online").length;
  const total = onus.length;

  const sections: { id: Section; label: string; color: string; accent: string; icon: React.ReactNode }[] = [
    { id: "health", label: "ONU Health", color: "text-rose-400", accent: "border-rose-500/40 bg-rose-500/10", icon: <Heart className="h-5 w-5" /> },
    { id: "down_detection", label: "ONU Down Detection", color: "text-amber-400", accent: "border-amber-500/40 bg-amber-500/10", icon: <AlertTriangle className="h-5 w-5" /> },
    { id: "pon_ports", label: "PON Ports", color: "text-blue-400", accent: "border-blue-500/40 bg-blue-500/10", icon: <Network className="h-5 w-5" /> },
    { id: "mac_table", label: "MAC Table", color: "text-indigo-400", accent: "border-indigo-500/40 bg-indigo-500/10", icon: <Layers className="h-5 w-5" /> },
    { id: "uplink_ports", label: "Uplink Ports", color: "text-emerald-400", accent: "border-emerald-500/40 bg-emerald-500/10", icon: <ArrowUpFromLine className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
          <Activity className="h-5 w-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Advanced Diagnostics</h2>
          <p className="text-xs text-muted-foreground">ONU health, down detection, PON distribution, MAC learning &amp; uplink status</p>
        </div>
      </div>

      {/* Nav grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center ${
              activeSection === s.id ? `${s.accent} shadow-sm scale-[1.02]` : "border-border bg-card/60 hover:bg-card/80"
            }`}
          >
            <div className={`p-2 rounded-full ${activeSection === s.id ? s.accent : "bg-muted/30"}`}>
              <span className={activeSection === s.id ? s.color : "text-muted-foreground"}>{s.icon}</span>
            </div>
            <span className={`text-xs font-semibold leading-tight ${activeSection === s.id ? s.color : "text-foreground/80"}`}>
              {s.label}
            </span>
          </button>
        ))}
      </div>

      {/* ── ONU HEALTH ── */}
      {activeSection === "health" && (
        <div className="space-y-4">
          <Card className="border-border bg-card/60">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Heart className="h-4 w-4 text-rose-400" /> ONU Signal Health Distribution
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    ≥−18 Excellent · ≥−23 Good · ≥−26 Warning · &lt;−26 Critical (dBm)
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono">{totalOnline}/{total} Online</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Stacked bar */}
              <div className="w-full h-3 rounded-full overflow-hidden flex gap-px bg-muted/30">
                {(["excellent", "good", "warning", "critical", "offline"] as const).map((tier) => {
                  const pct = total > 0 ? (signalDist[tier] / total) * 100 : 0;
                  return pct > 0 ? (
                    <div key={tier} className={`${TIER_CONFIG[tier].barColor} h-full`} style={{ width: `${pct}%` }} title={`${TIER_CONFIG[tier].label}: ${signalDist[tier]}`} />
                  ) : null;
                })}
              </div>
              {/* Distribution cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {(["excellent", "good", "warning", "critical", "offline"] as const).map((tier) => {
                  const cfg = TIER_CONFIG[tier];
                  const count = signalDist[tier];
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={tier} className={`p-3 rounded-xl border ${cfg.bg} ${cfg.border} text-center`}>
                      <div className={`text-2xl font-black font-mono ${cfg.color}`}>{count}</div>
                      <div className={`text-[10px] font-bold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{pct}% of fleet</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Per-OLT breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {olts.map((olt) => {
              const oltOnus = onus.filter((o) => o.olt === olt.id);
              const online = oltOnus.filter((o) => o.status === "Online").length;
              const pct = oltOnus.length > 0 ? Math.round((online / oltOnus.length) * 100) : 0;
              const excellent = oltOnus.filter((o) => {
                const rx = typeof o.rx_power === "number" ? o.rx_power : parseFloat(String(o.rx_power ?? "-99"));
                return o.status === "Online" && rx >= -18;
              }).length;
              const critical = oltOnus.filter((o) => {
                const rx = typeof o.rx_power === "number" ? o.rx_power : parseFloat(String(o.rx_power ?? "-99"));
                return o.status === "Online" && rx < -26;
              }).length;
              return (
                <Card key={olt.id} className="border-border bg-card/60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-bold text-sm">{olt.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{olt.brand} · {olt.access_mode || "EPON"} · {olt.ip_address}</div>
                      </div>
                      <Badge className={olt.status === "Online" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border-rose-500/30"}>{olt.status}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-mono text-emerald-400 font-bold w-10 text-right">{pct}%</span>
                    </div>
                    <div className="flex gap-3 text-[11px] font-mono">
                      <span className="text-emerald-400">✓ {online}/{oltOnus.length} Online</span>
                      {excellent > 0 && <span className="text-emerald-300">⭐ {excellent} Excellent</span>}
                      {critical > 0 && <span className="text-rose-400">⚠ {critical} Critical</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ONU DOWN DETECTION ── */}
      {activeSection === "down_detection" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Offline", value: downedOnus.length, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/30" },
              { label: "Power Loss (Dying Gasp)", value: downedOnus.filter((o) => o.status === "DyingGasp").length, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
              { label: "Loss of Signal (LOS)", value: downedOnus.filter((o) => o.status === "Los").length, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
            ].map((s) => (
              <Card key={s.label} className={`border ${s.bg} bg-card/60`}>
                <CardContent className="p-4 text-center">
                  <div className={`text-2xl font-black font-mono ${s.color}`}>{s.value}</div>
                  <div className={`text-[11px] font-semibold mt-1 ${s.color}`}>{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border bg-card/60 overflow-hidden">
            <CardHeader className="p-4 pb-2 border-b border-border">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Offline &amp; Alarmed ONUs
                {downedOnus.length > 0 && <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-xs">{downedOnus.length} devices</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {downedOnus.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                  <p className="text-sm font-semibold text-foreground">All ONUs Online</p>
                  <p className="text-xs mt-1">Zero downed devices detected.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {downedOnus.map((onu) => {
                    const isDG = onu.status === "DyingGasp";
                    const isLos = onu.status === "Los";
                    return (
                      <div key={onu.id} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/30 transition-colors">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isDG ? "bg-amber-400" : isLos ? "bg-purple-400" : "bg-rose-500"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground truncate">{onu.customer_name || "Unbound ONU"}</span>
                            <Badge variant="outline" className={`text-[10px] font-bold shrink-0 ${isDG ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : isLos ? "text-purple-400 bg-purple-500/10 border-purple-500/30" : "text-rose-400 bg-rose-500/10 border-rose-500/30"}`}>
                              {isDG ? "Power Loss" : isLos ? "LOS" : "Offline"}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            {onu.olt_name || "OLT"} · {onu.pon_port}:{onu.onu_index} · {onu.mac_address || onu.serial_number || "No HW ID"}
                          </div>
                          {onu.customer_phone && <div className="text-[10px] text-muted-foreground mt-0.5">📞 {onu.customer_phone}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-mono text-rose-400 font-bold">
                            RX {typeof onu.rx_power === "number" ? onu.rx_power.toFixed(2) : "—"} dBm
                          </div>
                          {onu.uptime && <div className="text-[10px] text-muted-foreground">Last up: {onu.uptime}</div>}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => onRebootOnu(onu)} className="h-7 text-[10px] px-2 hover:border-rose-500/50 hover:text-rose-400 shrink-0">
                          <RotateCcw className="h-3 w-3 mr-1" /> Reboot
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PON PORTS ── */}
      {activeSection === "pon_ports" && (
        <div className="space-y-4">
          {ponPortsPerOlt.map(({ olt, portMap }) => {
            const portKeys = Object.keys(portMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            const isOpen = expandedOlt === olt.id || expandedOlt === null;
            return (
              <Card key={olt.id} className="border-border bg-card/60 overflow-hidden">
                <button onClick={() => setExpandedOlt(isOpen && expandedOlt === olt.id ? null : olt.id)} className="w-full">
                  <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <Network className="h-4 w-4 text-blue-400" />
                      <div className="text-left">
                        <CardTitle className="text-sm font-bold">{olt.name}</CardTitle>
                        <CardDescription className="text-[11px] mt-0.5 font-mono">{olt.brand} · {olt.ip_address} · {portKeys.length} active ports</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={olt.status === "Online" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border-rose-500/30"}>{olt.status}</Badge>
                      {expandedOlt === olt.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </CardHeader>
                </button>
                {(expandedOlt === olt.id || expandedOlt === null) && (
                  <CardContent className="p-4">
                    {portKeys.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic text-center py-4">No PON port data yet. Sync OLT to discover ports.</p>
                    ) : (
                      <div className="space-y-2">
                        {portKeys.map((port) => {
                          const s = portMap[port];
                          const pct = s.total > 0 ? (s.online / s.total) * 100 : 0;
                          const avgRx = s.online > 0 ? s.rxSum / s.online : 0;
                          const tier = s.online === 0 ? "offline" : getSignalTier(avgRx, "Online");
                          return (
                            <div key={port} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
                              <div className="w-24 shrink-0">
                                <div className="text-xs font-mono font-bold">{port}</div>
                                <div className="text-[10px] text-muted-foreground">{s.total} ONUs</div>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between text-[11px] mb-1">
                                  <span className="text-emerald-400 font-mono">{s.online} online</span>
                                  {s.offline > 0 && <span className="text-rose-400 font-mono">{s.offline} offline</span>}
                                  <span className="text-muted-foreground font-mono">{Math.round(pct)}%</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                              {s.online > 0 && (
                                <Badge variant="outline" className={`text-[10px] font-mono shrink-0 ${TIER_CONFIG[tier].badge}`}>
                                  Avg {avgRx.toFixed(1)} dBm
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
          {olts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Network className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No OLTs configured</p>
            </div>
          )}
        </div>
      )}

      {/* ── MAC TABLE ── */}
      {activeSection === "mac_table" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total MAC Entries", value: totalMacs, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/30" },
              { label: "ONUs with Learned MACs", value: macOnus.length, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
              { label: "ONUs without MACs", value: total - macOnus.length, color: "text-muted-foreground", bg: "bg-muted/20 border-border" },
            ].map((s) => (
              <Card key={s.label} className={`border ${s.bg} bg-card/60`}>
                <CardContent className="p-4 text-center">
                  <div className={`text-2xl font-black font-mono ${s.color}`}>{s.value}</div>
                  <div className={`text-[11px] font-semibold mt-1 ${s.color}`}>{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-border bg-card/60 overflow-hidden">
            <CardHeader className="p-4 pb-2 border-b border-border">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Layers className="h-4 w-4 text-indigo-400" /> Learned CPE MAC Addresses</CardTitle>
              <CardDescription className="text-xs mt-0.5">Customer-side devices detected behind each ONU port</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {macOnus.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-semibold text-foreground">No Learned MACs</p>
                  <p className="text-xs mt-1">Sync OLTs to populate the MAC learning table.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-background/90 text-muted-foreground uppercase text-[10px] font-bold tracking-wider border-b border-border">
                      <tr>
                        <th className="py-2.5 px-4">ONU / Subscriber</th>
                        <th className="py-2.5 px-4">Interface</th>
                        <th className="py-2.5 px-4">Learned MACs</th>
                        <th className="py-2.5 px-4">VLAN(s)</th>
                        <th className="py-2.5 px-4">OLT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 font-mono">
                      {macOnus.map((onu) => (
                        <tr key={onu.id} className="hover:bg-accent/30 transition-colors">
                          <td className="py-2.5 px-4 font-sans">
                            <div className="font-semibold text-foreground text-xs">{onu.customer_name || "Unbound"}</div>
                            <div className="text-[10px] text-muted-foreground">{onu.mac_address || onu.serial_number || "No HW ID"}</div>
                          </td>
                          <td className="py-2.5 px-4 text-indigo-400 font-bold">{onu.pon_port}:{onu.onu_index}</td>
                          <td className="py-2.5 px-4">
                            <div className="space-y-0.5">
                              {(onu.mactable ?? []).slice(0, 3).map((e, i) => <div key={i} className="text-[11px] text-foreground">{e.mac}</div>)}
                              {(onu.mactable ?? []).length > 3 && <div className="text-[10px] text-muted-foreground">+{(onu.mactable ?? []).length - 3} more</div>}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {[...new Set((onu.mactable ?? []).map((e) => e.vlan))].slice(0, 4).map((v, i) => (
                                <Badge key={i} variant="outline" className="text-[9px] bg-indigo-950/40 text-indigo-300 border-indigo-800/50">{v}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-sans text-muted-foreground text-[11px]">{onu.olt_name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── UPLINK PORTS ── */}
      {activeSection === "uplink_ports" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total OLTs", value: olts.length, color: "text-foreground", bg: "bg-muted/20 border-border" },
              { label: "OLTs Online", value: olts.filter((o) => o.status === "Online").length, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
              { label: "OLTs Offline", value: olts.filter((o) => o.status !== "Online").length, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/30" },
            ].map((s) => (
              <Card key={s.label} className={`border ${s.bg} bg-card/60`}>
                <CardContent className="p-4 text-center">
                  <div className={`text-2xl font-black font-mono ${s.color}`}>{s.value}</div>
                  <div className={`text-[11px] font-semibold mt-1 ${s.color}`}>{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {olts.map((olt) => {
              const oltOnus = onus.filter((o) => o.olt === olt.id);
              const online = oltOnus.filter((o) => o.status === "Online").length;
              const isOn = olt.status === "Online";
              return (
                <Card key={olt.id} className={`border bg-card/60 ${isOn ? "border-emerald-500/20" : "border-rose-500/20"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isOn ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                          <ArrowUpFromLine className={`h-4 w-4 ${isOn ? "text-emerald-400" : "text-rose-400"}`} />
                        </div>
                        <div>
                          <div className="font-bold text-sm">{olt.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{olt.brand} · {olt.access_mode || "EPON"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isOn && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
                        <Badge className={isOn ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]" : "bg-rose-500/15 text-rose-400 border-rose-500/30 text-[10px]"}>{olt.status}</Badge>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-[11px] font-mono">
                      <div className="flex justify-between"><span className="text-muted-foreground">IP Address</span><span className="font-semibold">{olt.ip_address}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">PON Ports</span><span>{olt.pon_ports_count || 8}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Active ONUs</span><span className="text-emerald-400 font-semibold">{online}/{oltOnus.length}</span></div>
                      {olt.upstream_router_name && (
                        <div className="flex justify-between pt-1 border-t border-border/50">
                          <span className="text-muted-foreground">Upstream Router</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${olt.upstream_router_status === "Online" ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
                            <span className="font-semibold">{olt.upstream_router_name}</span>
                          </div>
                        </div>
                      )}
                      {olt.last_sync && (
                        <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
                          <span>Last Sync</span><span>{new Date(olt.last_sync).toLocaleTimeString()}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {olts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ArrowUpFromLine className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No OLTs configured yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

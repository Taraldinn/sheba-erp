"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Radio,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Activity,
  RotateCcw,
  Copy,
  Check,
  Server,
  Layers,
  Terminal,
  Cpu,
  ShieldAlert,
  ArrowRight,
  Filter,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { OLT, ONU, OLTMonitorSummary, MACSearchResult } from "@/types";

interface OLTMonitorPanelProps {
  olts: OLT[];
  onus: ONU[];
  onReload: () => Promise<void>;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export default function OLTMonitorPanel({ olts, onus, onReload, showToast }: OLTMonitorPanelProps) {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<"fleet" | "mac_explorer">("fleet");

  // Summary Metrics
  const [summary, setSummary] = useState<OLTMonitorSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingOltId, setSyncingOltId] = useState<string | null>(null);

  // Filters
  const [selectedOltFilter, setSelectedOltFilter] = useState<string>("ALL");
  const [selectedPortFilter, setSelectedPortFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Online" | "Offline" | "Poor" | "Fair" | "Good">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Drawers
  const [selectedOnuForMacs, setSelectedOnuForMacs] = useState<ONU | null>(null);
  const [rawMacModalData, setRawMacModalData] = useState<{ oltName: string; port: string; output: string } | null>(null);
  const [loadingRawMac, setLoadingRawMac] = useState(false);
  const [rebootModalOnu, setRebootModalOnu] = useState<ONU | null>(null);
  const [rebooting, setRebooting] = useState(false);
  const [copiedMac, setCopiedMac] = useState<string | null>(null);

  // MAC Explorer State
  const [macSearchInput, setMacSearchInput] = useState("");
  const [macSearchLive, setMacSearchLive] = useState(false);
  const [macSearching, setMacSearching] = useState(false);
  const [macSearchResults, setMacSearchResults] = useState<MACSearchResult[]>([]);
  const [hasSearchedMac, setHasSearchedMac] = useState(false);

  // Expanded OLT cards
  const [expandedOlts, setExpandedOlts] = useState<Record<string, boolean>>({});

  const toggleExpandOlt = (oltId: string) => {
    setExpandedOlts((prev) => ({ ...prev, [oltId]: !prev[oltId] }));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMac(text);
    setTimeout(() => setCopiedMac(null), 2000);
  };

  // Load summary metrics from backend
  const loadSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const data = await ApiClient.getOLTMonitorSummary();
      setSummary(data);
    } catch (err: any) {
      console.warn("Failed to load OLT monitor summary:", err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Sync a single OLT
  const handleSyncOlt = async (oltId: string, oltName: string) => {
    try {
      setSyncingOltId(oltId);
      showToast(`Syncing ${oltName} in real-time...`, "success");
      const res = await ApiClient.syncOLTMonitor(oltId);
      showToast(`Synced ${oltName}: ${res.online_onus}/${res.total_onus} ONUs online`, "success");
      await Promise.all([loadSummary(), onReload()]);
    } catch (err: any) {
      showToast(err.message || `Failed to sync ${oltName}`, "error");
    } finally {
      setSyncingOltId(null);
    }
  };

  // Sync all OLTs
  const handleSyncAll = async () => {
    try {
      setSyncingAll(true);
      showToast("Starting real-time synchronization for all OLTs...", "success");
      await ApiClient.syncAllOLTsMonitor();
      showToast("All OLTs synchronized successfully", "success");
      await Promise.all([loadSummary(), onReload()]);
    } catch (err: any) {
      showToast(err.message || "Failed to sync all OLTs", "error");
    } finally {
      setSyncingAll(false);
    }
  };

  // Reboot ONU
  const handleConfirmReboot = async () => {
    if (!rebootModalOnu) return;
    try {
      setRebooting(true);
      const res = await ApiClient.rebootONU(rebootModalOnu.id);
      if (res.success) {
        showToast(`Reboot signal acknowledged for ONU ${rebootModalOnu.pon_port}:${rebootModalOnu.onu_index}`, "success");
      } else {
        showToast(res.message || "Reboot command failed", "error");
      }
      setRebootModalOnu(null);
      await onReload();
    } catch (err: any) {
      showToast(err.message || "Failed to reboot ONU", "error");
    } finally {
      setRebooting(false);
    }
  };

  // View Raw Port MAC Table
  const handleViewPortMacs = async (oltId: string, oltName: string, portStr: string) => {
    try {
      setLoadingRawMac(true);
      const portNum = portStr.replace(/\D/g, "") || "1";
      const res = await ApiClient.getOLTRawMacTable(oltId, portNum);
      setRawMacModalData({
        oltName,
        port: portStr,
        output: res.output || "No MAC entries found on this port.",
      });
    } catch (err: any) {
      showToast(err.message || "Failed to read MAC address table from OLT CLI", "error");
    } finally {
      setLoadingRawMac(false);
    }
  };

  // Perform MAC Search
  const handleSearchMac = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const term = macSearchInput.trim();
    if (!term) return;
    try {
      setMacSearching(true);
      setHasSearchedMac(true);
      const res = await ApiClient.searchOLTMAC(term, macSearchLive);
      setMacSearchResults(res.results || []);
      if (!res.results || res.results.length === 0) {
        showToast("No active devices found matching this MAC address", "error");
      } else {
        showToast(`Found ${res.results.length} device matching ${term}`, "success");
      }
    } catch (err: any) {
      showToast(err.message || "MAC search failed", "error");
    } finally {
      setMacSearching(false);
    }
  };

  // Derived KPI metrics
  const totalOnus = summary?.total_onus ?? onus.length;
  const activeOnus = summary?.active_onus ?? onus.filter((o) => o.status === "Online").length;
  const offlineOnus = summary?.offline_onus ?? onus.filter((o) => o.status !== "Online").length;
  const poorSignalOnus =
    summary?.poor_signal ??
    onus.filter((o) => o.status === "Online" && (o.rx_power <= -30.0 || o.signal_quality === "Poor")).length;
  const onlineRate = totalOnus > 0 ? Math.round((activeOnus / totalOnus) * 100) : 0;

  // Filtered ONU fleet
  const filteredOnus = useMemo(() => {
    return onus.filter((onu) => {
      // OLT filter
      if (selectedOltFilter !== "ALL" && onu.olt !== selectedOltFilter) {
        return false;
      }

      // Port filter
      if (selectedPortFilter !== "ALL") {
        const pMatch = onu.pon_port.match(/\d+$/);
        const pNum = pMatch ? pMatch[0] : "";
        if (pNum !== selectedPortFilter && onu.pon_port !== selectedPortFilter) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === "Online" && onu.status !== "Online") return false;
      if (statusFilter === "Offline" && onu.status === "Online") return false;
      if (statusFilter === "Poor") {
        if (onu.status !== "Online" || onu.rx_power > -30.0) return false;
      }
      if (statusFilter === "Fair") {
        if (onu.status !== "Online" || onu.rx_power > -25.0 || onu.rx_power <= -30.0) return false;
      }
      if (statusFilter === "Good") {
        if (onu.status !== "Online" || onu.rx_power <= -25.0) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesMac = (onu.mac_address || "").toLowerCase().includes(q);
        const matchesSn = (onu.serial_number || "").toLowerCase().includes(q);
        const matchesName = (onu.customer_name || onu.customer_full_name || "").toLowerCase().includes(q);
        const matchesUser = (onu.customer_username || "").toLowerCase().includes(q);
        const matchesPhone = (onu.customer_phone || "").toLowerCase().includes(q);
        const matchesPort = `${onu.pon_port}:${onu.onu_index}`.toLowerCase().includes(q);
        const matchesLearnedMacs = (onu.mactable || []).some(
          (m) => m.mac.toLowerCase().includes(q) || String(m.vlan).includes(q)
        );
        return matchesMac || matchesSn || matchesName || matchesUser || matchesPhone || matchesPort || matchesLearnedMacs;
      }

      return true;
    });
  }, [onus, selectedOltFilter, selectedPortFilter, statusFilter, searchQuery]);

  // Optical signal badge helper
  const renderSignalBadge = (onu: ONU) => {
    if (onu.status !== "Online") {
      return (
        <Badge variant="outline" className="bg-slate-800/60 text-slate-400 border-slate-700 text-xs">
          Offline
        </Badge>
      );
    }
    const rx = typeof onu.rx_power === "number" ? onu.rx_power : parseFloat(String(onu.rx_power) || "-99");

    if (rx > -25.0) {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-mono font-semibold">
          {rx.toFixed(2)} dBm (Good)
        </Badge>
      );
    } else if (rx > -30.0) {
      return (
        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs font-mono font-semibold">
          {rx.toFixed(2)} dBm (Fair)
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/40 text-xs font-mono font-bold flex items-center gap-1">
          <Zap className="h-3 w-3 animate-pulse text-rose-400" />
          {rx.toFixed(2)} dBm (Poor)
        </Badge>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Cockpit Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800 shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-indigo-400 animate-pulse" />
            <h2 className="text-xl font-bold tracking-tight text-white">OLT Fleet Live Monitor</h2>
            <Badge variant="outline" className="bg-indigo-950/60 text-indigo-300 border-indigo-700/50 text-xs">
              Legacy Parity Engine
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time optical diagnostic telemetry, per-PON distribution, and subscriber CPE learned MAC explorer.
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* View Mode Toggle */}
          <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex items-center">
            <button
              onClick={() => setViewMode("fleet")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "fleet" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Fleet Monitor
            </button>
            <button
              onClick={() => setViewMode("mac_explorer")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                viewMode === "mac_explorer" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              <Search className="h-3 w-3" />
              MAC Explorer
            </button>
          </div>

          <Button
            size="sm"
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncingAll ? "animate-spin" : ""}`} />
            <span>{syncingAll ? "Syncing..." : "Sync All OLTs"}</span>
          </Button>
        </div>
      </div>

      {/* Global Telemetry KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/80 border-slate-800 shadow-sm relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-slate-400 flex items-center justify-between">
              <span>Total Fleet ONUs</span>
              <Radio className="h-4 w-4 text-indigo-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-white font-mono">{totalOnus}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-[11px] text-slate-400">Connected across {olts.length} physical OLTs</div>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500/40" />
        </Card>

        <Card className="bg-slate-900/80 border-slate-800 shadow-sm relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-emerald-400/90 flex items-center justify-between">
              <span>Online Rate</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-400 font-mono flex items-baseline gap-2">
              <span>{activeOnus}</span>
              <span className="text-xs text-emerald-400/80 font-normal">({onlineRate}%)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${onlineRate}%` }} />
            </div>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/40" />
        </Card>

        <Card className="bg-slate-900/80 border-slate-800 shadow-sm relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-rose-400 flex items-center justify-between">
              <span>Offline ONUs</span>
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-400 font-mono">{offlineOnus}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-[11px] text-slate-400">
              {offlineOnus > 0 ? "Requires field / fiber inspection" : "Zero down alarms"}
            </div>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500/40" />
        </Card>

        <Card className="bg-slate-900/80 border-slate-800 shadow-sm relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-amber-400 flex items-center justify-between">
              <span>Poor Optical Signal</span>
              <Zap className="h-4 w-4 text-amber-400 animate-pulse" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-400 font-mono">{poorSignalOnus}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-[11px] text-slate-400">Rx ≤ -30.0 dBm (Degraded link)</div>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500/40" />
        </Card>
      </div>

      {/* VIEW MODE 1: FLEET MONITOR */}
      {viewMode === "fleet" && (
        <>
          {/* Per-OLT Cards & PON Port Distribution */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center gap-1.5">
                <Server className="h-4 w-4 text-indigo-400" />
                <span>OLT Hardware & PON Port Distribution</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Click any PON pill to instantly filter the fleet table
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {olts.map((olt) => {
                const oltSum = summary?.olt_summary?.[olt.id];
                const oltTotal = oltSum?.total ?? onus.filter((o) => o.olt === olt.id).length;
                const oltOnline = oltSum?.online ?? onus.filter((o) => o.olt === olt.id && o.status === "Online").length;
                const oltOffline = oltSum?.offline ?? oltTotal - oltOnline;
                const oltPoor = oltSum?.poor ?? 0;
                const isSyncing = syncingOltId === olt.id;
                const ports = oltSum?.ports || {};
                const portKeys = Object.keys(ports).sort((a, b) => parseInt(a) - parseInt(b));

                return (
                  <Card key={olt.id} className="bg-slate-900 border-slate-800 shadow transition-all hover:border-slate-700">
                    <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-start justify-between space-y-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-bold text-white">{olt.name}</CardTitle>
                          <Badge variant="outline" className="bg-slate-800 text-indigo-300 border-slate-700 font-mono text-xs">
                            {olt.brand} {olt.access_mode || "EPON"}
                          </Badge>
                          <Badge
                            className={
                              olt.status === "Online"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs"
                                : "bg-rose-500/20 text-rose-400 border-rose-500/30 text-xs"
                            }
                          >
                            {olt.status}
                          </Badge>
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-3">
                          <span>IP: {olt.ip_address}</span>
                          <span>•</span>
                          <span>Last Synced: {olt.last_sync ? new Date(olt.last_sync).toLocaleTimeString() : "Never"}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSyncOlt(olt.id, olt.name)}
                          disabled={isSyncing}
                          className="h-7 text-xs px-2.5 bg-slate-800 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700"
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                          Sync
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="px-4 pb-4 pt-1 space-y-3">
                      {/* OLT Micro KPI Badges */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-slate-300 font-mono">
                          Total: <strong className="text-white">{oltTotal}</strong>
                        </span>
                        <span className="bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-800/40 text-emerald-300 font-mono">
                          Online: <strong>{oltOnline}</strong>
                        </span>
                        <span className="bg-rose-950/40 px-2.5 py-1 rounded border border-rose-800/40 text-rose-300 font-mono">
                          Offline: <strong>{oltOffline}</strong>
                        </span>
                        {oltPoor > 0 && (
                          <span className="bg-amber-950/40 px-2.5 py-1 rounded border border-amber-800/40 text-amber-300 font-mono flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            Poor: <strong>{oltPoor}</strong>
                          </span>
                        )}
                      </div>

                      {/* PON Ports Pill Grid */}
                      <div className="pt-1">
                        <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>PON Interfaces ({portKeys.length > 0 ? portKeys.length : olt.pon_ports_count || 8} Ports)</span>
                        </div>

                        {portKeys.length === 0 ? (
                          <div className="text-xs text-slate-400 italic py-2 bg-slate-950/40 rounded text-center border border-slate-800/60">
                            No port telemetry yet. Click "Sync" to discover active ONUs.
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                            {portKeys.map((pKey) => {
                              const pStats = ports[pKey];
                              const isSelected = selectedOltFilter === olt.id && selectedPortFilter === pKey;
                              const isFullOnline = pStats.online === pStats.total && pStats.total > 0;
                              const hasPoor = (pStats.poor || 0) > 0;
                              const hasOffline = pStats.offline > 0;

                              return (
                                <button
                                  key={pKey}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedOltFilter("ALL");
                                      setSelectedPortFilter("ALL");
                                    } else {
                                      setSelectedOltFilter(olt.id);
                                      setSelectedPortFilter(pKey);
                                    }
                                  }}
                                  title={`Port ${pKey}: ${pStats.online}/${pStats.total} Online${
                                    hasPoor ? ` (${pStats.poor} poor signal)` : ""
                                  }`}
                                  className={`px-1.5 py-1.5 rounded text-center text-xs font-mono transition-all flex flex-col items-center justify-center border ${
                                    isSelected
                                      ? "ring-2 ring-indigo-500 bg-indigo-950/80 border-indigo-400 text-white"
                                      : isFullOnline && !hasPoor
                                      ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40"
                                      : hasOffline || hasPoor
                                      ? "bg-amber-950/30 border-amber-800/40 text-amber-300 hover:bg-amber-900/40"
                                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                                  }`}
                                >
                                  <span className="text-[10px] font-bold">P{pKey}</span>
                                  <span className="text-[9px] opacity-90">
                                    {pStats.online}/{pStats.total}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Interactive Live Fleet Table Section */}
          <Card className="bg-slate-900 border-slate-800 shadow-md">
            <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-800">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    <span>Live ONU Fleet Explorer</span>
                    <Badge variant="outline" className="text-xs font-mono bg-slate-800 text-slate-300 border-slate-700">
                      {filteredOnus.length} of {onus.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Live optical signal, alive-time, and learned CPE MACs
                  </CardDescription>
                </div>

                {/* Filter Controls Row */}
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {/* Search box */}
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Search MAC, customer, port..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs bg-slate-950 border-slate-800 text-white placeholder:text-slate-400"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-white"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* OLT Filter Select */}
                  <select
                    value={selectedOltFilter}
                    onChange={(e) => {
                      setSelectedOltFilter(e.target.value);
                      setSelectedPortFilter("ALL");
                    }}
                    className="h-8 text-xs bg-slate-950 border border-slate-800 rounded px-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">All OLTs</option>
                    {olts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>

                  {/* Clear Filter button */}
                  {(selectedOltFilter !== "ALL" || selectedPortFilter !== "ALL" || statusFilter !== "ALL" || searchQuery) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedOltFilter("ALL");
                        setSelectedPortFilter("ALL");
                        setStatusFilter("ALL");
                        setSearchQuery("");
                      }}
                      className="h-8 text-xs px-2 text-slate-400 hover:text-white"
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              {/* Status Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="text-[11px] text-slate-400 uppercase font-medium mr-1">Status:</span>
                {(
                  [
                    { id: "ALL", label: "All ONUs" },
                    { id: "Online", label: "Online Only" },
                    { id: "Offline", label: "Offline Only" },
                    { id: "Poor", label: "Poor (≤ -30 dBm)" },
                    { id: "Fair", label: "Fair (-25..-30 dBm)" },
                    { id: "Good", label: "Good (> -25 dBm)" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      statusFilter === tab.id
                        ? "bg-indigo-600 text-white font-medium shadow"
                        : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">OLT & Interface</th>
                      <th className="py-2.5 px-3">ONU MAC / SN</th>
                      <th className="py-2.5 px-3">Subscriber</th>
                      <th className="py-2.5 px-3">Optical Rx Power</th>
                      <th className="py-2.5 px-3">Tx / Temp</th>
                      <th className="py-2.5 px-3">Uptime</th>
                      <th className="py-2.5 px-3">Learned CPE MACs</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredOnus.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-10 text-slate-400 font-sans">
                          <Radio className="h-8 w-8 mx-auto mb-2 text-slate-400 opacity-50" />
                          <p className="text-sm font-medium">No ONUs matching the selected criteria</p>
                          <p className="text-xs text-slate-400 mt-1">Try resetting filters or syncing the OLT</p>
                        </td>
                      </tr>
                    ) : (
                      filteredOnus.map((onu) => {
                        const learnedMacs = onu.mactable || [];
                        const isOnline = onu.status === "Online";

                        return (
                          <tr key={onu.id} className="hover:bg-slate-800/40 transition-colors">
                            {/* Status */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    isOnline ? "bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse" : "bg-rose-500"
                                  }`}
                                />
                                <span className={isOnline ? "text-emerald-400 font-sans font-medium" : "text-rose-400 font-sans font-medium"}>
                                  {onu.status}
                                </span>
                              </div>
                            </td>

                            {/* OLT & Port:Index */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="text-slate-200 font-semibold">{onu.olt_name || "OLT"}</div>
                              <div className="text-[11px] text-indigo-400 font-bold">
                                {onu.pon_port}:{onu.onu_index}
                              </div>
                            </td>

                            {/* MAC & SN */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <span className="text-white font-bold">{onu.mac_address || "N/A"}</span>
                                {onu.mac_address && (
                                  <button
                                    onClick={() => handleCopy(onu.mac_address)}
                                    title="Copy MAC"
                                    className="text-slate-400 hover:text-indigo-400 p-0.5"
                                  >
                                    {copiedMac === onu.mac_address ? (
                                      <Check className="h-3 w-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">{onu.serial_number || "—"}</div>
                            </td>

                            {/* Subscriber */}
                            <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                              {onu.customer_name || onu.customer_full_name ? (
                                <div>
                                  <div className="font-semibold text-slate-200 text-xs truncate max-w-[150px]">
                                    {onu.customer_name || onu.customer_full_name}
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-400">
                                    {onu.customer_username || onu.customer_phone || "Active"}
                                  </div>
                                </div>
                              ) : (
                                <Badge variant="outline" className="bg-slate-800/80 text-slate-400 border-slate-700 text-[10px]">
                                  Unbound
                                </Badge>
                              )}
                            </td>

                            {/* Optical Rx Power */}
                            <td className="py-2.5 px-3 whitespace-nowrap">{renderSignalBadge(onu)}</td>

                            {/* Tx Power & Temperature */}
                            <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                              <div>Tx: {typeof onu.tx_power === "number" ? onu.tx_power.toFixed(2) : onu.tx_power || "—"} dBm</div>
                              <div className="text-[10px] text-slate-400">
                                {onu.temperature ? `${onu.temperature}°C` : "—"}
                              </div>
                            </td>

                            {/* Uptime */}
                            <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                              {onu.uptime || "—"}
                            </td>

                            {/* Learned CPE MACs */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {learnedMacs.length > 0 ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedOnuForMacs(onu)}
                                  className="h-6 text-[11px] px-2 bg-indigo-950/40 text-indigo-300 border-indigo-800/50 hover:bg-indigo-900/50 flex items-center gap-1 font-sans"
                                >
                                  <Layers className="h-3 w-3" />
                                  <span>{learnedMacs.length} CPE MAC{learnedMacs.length > 1 ? "s" : ""}</span>
                                </Button>
                              ) : (
                                <span className="text-slate-400 text-[11px] font-sans">0 learned</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-2.5 px-3 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewPortMacs(onu.olt, onu.olt_name || "OLT", onu.pon_port)}
                                  title="View Port CLI MAC Table"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-400 hover:bg-slate-800"
                                >
                                  <Terminal className="h-3.5 w-3.5" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setRebootModalOnu(onu)}
                                  title="Reboot ONU"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* VIEW MODE 2: MAC EXPLORER */}
      {viewMode === "mac_explorer" && (
        <div className="space-y-6">
          <Card className="bg-slate-900 border-slate-800 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Search className="h-5 w-5 text-indigo-400" />
                <span>Cross-OLT Subscriber MAC Explorer</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Instantly track subscriber Wi-Fi routers, CPE gateways, or client devices across all connected OLTs.
                Supports dotted format (<code>bc62.ce08.32ec</code>), colon format (<code>BC:62:CE:08:32:EC</code>), or plain hex.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearchMac} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    placeholder="Enter MAC address (e.g. 3068:9314:e93c or bc62.ce08.32ec)..."
                    value={macSearchInput}
                    onChange={(e) => setMacSearchInput(e.target.value)}
                    className="h-10 font-mono text-sm bg-slate-950 border-slate-800 text-white placeholder:text-slate-400"
                  />
                  {macSearchInput && (
                    <button
                      type="button"
                      onClick={() => setMacSearchInput("")}
                      className="absolute right-3 top-3 text-slate-400 hover:text-white"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={macSearchLive}
                      onChange={(e) => setMacSearchLive(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
                    />
                    <span>Live CLI probe</span>
                  </label>

                  <Button
                    type="submit"
                    disabled={macSearching || !macSearchInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow font-medium flex items-center gap-2"
                  >
                    <Search className={`h-4 w-4 ${macSearching ? "animate-spin" : ""}`} />
                    <span>{macSearching ? "Searching..." : "Search Fleet"}</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Search Results */}
          {hasSearchedMac && (
            <Card className="bg-slate-900 border-slate-800 shadow">
              <CardHeader className="pb-3 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Search Results for</span>
                    <Badge variant="outline" className="font-mono text-xs bg-slate-950 text-indigo-300 border-indigo-800">
                      {macSearchInput}
                    </Badge>
                  </CardTitle>
                  <span className="text-xs text-slate-400 font-mono">{macSearchResults.length} match(es)</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {macSearchResults.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-amber-400" />
                    <p className="text-sm font-semibold text-slate-200">MAC Address Not Found</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      No learned MAC entries or ONU records matched this query. Try checking "Live CLI probe" to query OLTs directly in real-time.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">MAC Address</th>
                          <th className="py-2.5 px-3">OLT Host</th>
                          <th className="py-2.5 px-3">Interface / ONU</th>
                          <th className="py-2.5 px-3">VLAN</th>
                          <th className="py-2.5 px-3">Subscriber</th>
                          <th className="py-2.5 px-3">Source</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {macSearchResults.map((res, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 px-3 text-white font-bold flex items-center gap-2">
                              <span>{res.mac}</span>
                              <button
                                onClick={() => handleCopy(res.mac)}
                                className="text-slate-400 hover:text-indigo-400"
                              >
                                {copiedMac === res.mac ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="text-slate-200 font-sans font-semibold">{res.olt_name}</div>
                              <div className="text-[11px] text-slate-400">{res.olt_ip}</div>
                            </td>
                            <td className="py-2.5 px-3 text-indigo-300 font-bold">
                              {res.port || res.onu_id}
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline" className="bg-slate-950 text-slate-300 border-slate-700 text-xs">
                                VLAN {res.vlan}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              {res.customer_name ? (
                                <div>
                                  <div className="font-semibold text-slate-200 text-xs">{res.customer_name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{res.customer_username}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-xs">Unregistered CPE</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  res.source === "live_probe"
                                    ? "bg-amber-950/40 text-amber-400 border-amber-800/50"
                                    : "bg-emerald-950/40 text-emerald-400 border-emerald-800/50"
                                }`}
                              >
                                {res.source === "live_probe" ? "Live CLI" : "Learned DB"}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setViewMode("fleet");
                                  setSearchQuery(res.mac);
                                }}
                                className="h-7 text-xs bg-slate-800 border-slate-700 text-slate-200 hover:text-white"
                              >
                                <span>Inspect Fleet</span>
                                <ArrowRight className="h-3 w-3 ml-1" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* MODAL 1: LEARNED CPE MAC ADDRESSES */}
      <Dialog open={!!selectedOnuForMacs} onOpenChange={() => setSelectedOnuForMacs(null)}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-400" />
              <span>Learned Customer CPE MAC Table</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              CPE devices and client Wi-Fi routers detected on ONU{" "}
              <strong className="text-indigo-300 font-mono">
                {selectedOnuForMacs?.pon_port}:{selectedOnuForMacs?.onu_index}
              </strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">ONU Hardware MAC:</span>
                <span className="text-white font-bold">{selectedOnuForMacs?.mac_address || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Associated Subscriber:</span>
                <span className="text-slate-200">{selectedOnuForMacs?.customer_name || "Unbound"}</span>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {(selectedOnuForMacs?.mactable || []).length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs italic">No learned MAC entries recorded.</div>
              ) : (
                (selectedOnuForMacs?.mactable || []).map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded bg-slate-950/80 border border-slate-800 text-xs font-mono"
                  >
                    <div>
                      <div className="text-white font-bold flex items-center gap-1.5">
                        <span>{entry.mac}</span>
                        <button
                          onClick={() => handleCopy(entry.mac)}
                          className="text-slate-400 hover:text-indigo-400"
                        >
                          {copiedMac === entry.mac ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400 font-sans">Learned dynamic subscriber device</div>
                    </div>
                    <Badge variant="outline" className="bg-indigo-950/60 text-indigo-300 border-indigo-800/50">
                      VLAN {entry.vlan}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelectedOnuForMacs(null)} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: RAW CLI PORT MAC TABLE */}
      <Dialog open={!!rawMacModalData} onOpenChange={() => setRawMacModalData(null)}>
        <DialogContent className="max-w-2xl bg-black border-slate-800 text-emerald-400">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between font-mono text-emerald-400 text-sm">
              <span className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                <span>CLI Output: {rawMacModalData?.oltName} ({rawMacModalData?.port})</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(rawMacModalData?.output || "")}
                className="h-7 text-xs bg-slate-900 text-slate-200 border-slate-700 hover:text-white"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="bg-slate-950 p-4 rounded border border-slate-800 max-h-96 overflow-y-auto font-mono text-xs text-emerald-300 whitespace-pre leading-relaxed">
            {rawMacModalData?.output}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRawMacModalData(null)}
              className="bg-slate-900 border-slate-700 text-slate-200 hover:text-white"
            >
              Close Terminal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: REBOOT ONU CONFIRMATION */}
      <Dialog open={!!rebootModalOnu} onOpenChange={() => setRebootModalOnu(null)}>
        <DialogContent className="max-w-sm bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <RotateCcw className="h-5 w-5 text-rose-400 animate-spin" style={{ animationDuration: "3s" }} />
              <span>Confirm ONU Reboot</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-300">
              Are you sure you want to reboot ONU on{" "}
              <strong className="text-white font-mono">
                {rebootModalOnu?.pon_port}:{rebootModalOnu?.onu_index}
              </strong>{" "}
              ({rebootModalOnu?.olt_name})?
            </DialogDescription>
          </DialogHeader>

          <div className="bg-rose-950/20 border border-rose-900/40 p-3 rounded text-xs text-rose-300">
            ⚠️ This will temporarily interrupt subscriber optical service while the device power-cycles.
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setRebootModalOnu(null)} disabled={rebooting} className="text-slate-400">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReboot}
              disabled={rebooting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {rebooting ? "Sending Reboot..." : "Yes, Reboot ONU"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

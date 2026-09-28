"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Cpu,
  Plus,
  Radio,
  Activity,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Search,
  Zap,
  Layers,
  Wand2,
  AlertTriangle,
  Link,
  Unlink,
  Signal,
  Check,
  X,
  Play,
  Server,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { OLT, ONU, OLTReconciliationRun, ONUAutoMatchCandidate, Router } from "@/types";
import OLTMonitorPanel from "@/components/network/OLTMonitorPanel";
import AdvancedDiagnosticsPanel from "@/components/network/AdvancedDiagnosticsPanel";

export default function OLTPage() {
  const [activeTab, setActiveTab] = useState<"monitor" | "diagnostics" | "olts" | "onus" | "reconciliation">("monitor");
  const [olts, setOlts] = useState<OLT[]>([]);
  const [onus, setOnus] = useState<ONU[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [selectedOltId, setSelectedOltId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [notification, setNotification] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Reconciliation state
  const [reconRuns, setReconRuns] = useState<OLTReconciliationRun[]>([]);
  const [reconFilter, setReconFilter] = useState<string>("ALL");
  const [auditing, setAuditing] = useState(false);

  // Auto match state
  const [autoMatchModalOpen, setAutoMatchModalOpen] = useState(false);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);
  const [autoMatchCandidates, setAutoMatchCandidates] = useState<ONUAutoMatchCandidate[]>([]);
  const [matchingRunning, setMatchingRunning] = useState(false);

  // OLT Create Modal
  const [oltModalOpen, setOltModalOpen] = useState(false);
  const [editingOlt, setEditingOlt] = useState<OLT | null>(null);
  const [oltForm, setOltForm] = useState<{
    name: string;
    brand: string;
    ip_address: string;
    pon_ports_count: number;
    snmp_community: string;
    status: "Online" | "Offline";
    upstream_router: string;
  }>({
    name: "",
    brand: "VSOL",
    ip_address: "",
    pon_ports_count: 8,
    snmp_community: "public",
    status: "Online",
    upstream_router: "",
  });

  // ONU Register Modal
  const [onuModalOpen, setOnuModalOpen] = useState(false);
  const [onuForm, setOnuForm] = useState<{
    olt: string;
    pon_port: string;
    onu_index: number;
    mac_address: string;
    serial_number: string;
    customer_name: string;
    customer_phone: string;
    rx_power: number;
    tx_power: number;
    status: "Online" | "Offline" | "DyingGasp" | "Los";
  }>({
    olt: "",
    pon_port: "EPON0/1",
    onu_index: 1,
    mac_address: "",
    serial_number: "",
    customer_name: "",
    customer_phone: "",
    rx_power: -19.5,
    tx_power: 2.1,
    status: "Online",
  });

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const [oltData, onuData, routerData] = await Promise.all([
        ApiClient.getOLTs(),
        ApiClient.getONUs(),
        ApiClient.getRouters().catch(() => []),
      ]);
      setOlts(oltData);
      setOnus(onuData);
      setRouters(routerData);
      if (oltData.length > 0 && !selectedOltId) {
        setSelectedOltId(oltData[0].id);
      }
    } catch (err) {
      console.error("Failed to load OLT/ONU data", err);
    }
  }, [selectedOltId]);

  const loadReconciliation = useCallback(async () => {
    if (!selectedOltId) return;
    try {
      const res = await ApiClient.getOLTReconciliationRuns(selectedOltId);
      setReconRuns(res.results || []);
    } catch (err) {
      console.error("Failed to load OLT reconciliation runs", err);
    }
  }, [selectedOltId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === "reconciliation") {
      loadReconciliation();
    }
  }, [activeTab, loadReconciliation]);

  const handleTriggerAudit = async () => {
    if (!selectedOltId) return;
    setAuditing(true);
    try {
      const run = await ApiClient.triggerOLTReconciliation(selectedOltId);
      showToast(`OLT Hardware Audit completed: ${run.matched_count} matched, ${run.unknown_in_erp_count} unknown, ${run.missing_in_olt_count} missing.`);
      loadReconciliation();
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to trigger OLT reconciliation", "error");
    } finally {
      setAuditing(false);
    }
  };

  const handleOpenAutoMatch = async () => {
    if (!selectedOltId) return;
    setAutoMatchModalOpen(true);
    setAutoMatchLoading(true);
    try {
      const preview = await ApiClient.autoMatchONUs(selectedOltId, true);
      setAutoMatchCandidates(preview.matches || []);
    } catch (err: any) {
      showToast("Failed to preview ONU auto-matching.", "error");
    } finally {
      setAutoMatchLoading(false);
    }
  };

  const handleExecuteAutoMatch = async () => {
    if (!selectedOltId) return;
    setMatchingRunning(true);
    try {
      const result = await ApiClient.autoMatchONUs(selectedOltId, false);
      showToast(`Successfully bound ${result.matched_count} ONUs to subscriber accounts!`);
      setAutoMatchModalOpen(false);
      loadData();
      loadReconciliation();
    } catch (err: any) {
      showToast(err.message || "Failed to execute auto-matching.", "error");
    } finally {
      setMatchingRunning(false);
    }
  };

  const handleRebootOnu = async (onu: ONU) => {
    try {
      const res = await ApiClient.rebootONU(onu.id);
      showToast(res.message || `Reboot command delivered to ONU on ${onu.pon_port}:${onu.onu_index}`);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to reboot ONU on physical OLT.", "error");
    }
  };

  const handleOltSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingOlt) {
        await ApiClient.updateOLT(editingOlt.id, oltForm);
        showToast("OLT updated successfully");
      } else {
        await ApiClient.createOLT(oltForm);
        showToast("OLT registered successfully");
      }
      setOltModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to save OLT", "error");
    }
  };

  const handleOnuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createONU({ ...onuForm, olt: selectedOltId });
      showToast("ONU registered successfully");
      setOnuModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to register ONU", "error");
    }
  };

  const filteredOnus = onus.filter((o) => {
    if (selectedOltId && o.olt !== selectedOltId) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (o.customer_name || "").toLowerCase().includes(s) ||
      (o.mac_address || "").toLowerCase().includes(s) ||
      (o.serial_number || "").toLowerCase().includes(s) ||
      (o.pon_port || "").toLowerCase().includes(s)
    );
  });

  const latestReconRun = reconRuns[0];
  const allDiscrepancies = latestReconRun?.discrepancy_details || [];
  const filteredDiscrepancies = allDiscrepancies.filter((d) => {
    if (reconFilter === "ALL") return true;
    return d.type === reconFilter;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 border animate-in slide-in-from-top-2 ${
            notification.type === "success"
              ? "bg-emerald-950/90 text-emerald-300 border-emerald-700/60"
              : "bg-rose-950/90 text-rose-300 border-rose-700/60"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          )}
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">OLT & Optical ONU Operations</h1>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] gap-1 px-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Phase 15 Hardware Reconciliation
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Chassis inventory, unconfigured ONU discovery, optical power distribution, auto-matching wizard, and OLT ↔ ERP reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-xs gap-1.5"
            onClick={handleOpenAutoMatch}
          >
            <Wand2 className="h-3.5 w-3.5" />
            ONU Auto-Matching
          </Button>

          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-1.5"
            onClick={() => {
              setEditingOlt(null);
              setOltForm({
                name: "",
                brand: "VSOL",
                ip_address: "10.10.20.1",
                pon_ports_count: 8,
                snmp_community: "public",
                status: "Online",
                upstream_router: "",
              });
              setOltModalOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add OLT
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-border text-xs gap-2">
        <button
          onClick={() => setActiveTab("monitor")}
          className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === "monitor"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="h-4 w-4" />
          Live Monitor & Fleet
        </button>
        <button
          onClick={() => setActiveTab("olts")}
          className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === "olts"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Cpu className="h-4 w-4" />
          OLT Chassis ({olts.length})
        </button>
        <button
          onClick={() => setActiveTab("onus")}
          className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === "onus"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Radio className="h-4 w-4" />
          Connected ONUs ({onus.length})
        </button>
        <button
          onClick={() => setActiveTab("reconciliation")}
          className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === "reconciliation"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="h-4 w-4" />
          Hardware Reconciliation Audit
        </button>
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === "diagnostics"
              ? "border-violet-500 text-violet-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="h-4 w-4" />
          Advanced Diagnostics
        </button>
      </div>

      {/* ════════════════════════ TAB 0: LIVE MONITOR ════════════════════════ */}
      {activeTab === "monitor" && (
        <OLTMonitorPanel
          olts={olts}
          onus={onus}
          onReload={loadData}
          showToast={showToast}
        />
      )}

      {/* ════════════════════════ TAB: ADVANCED DIAGNOSTICS ════════════════════════ */}
      {activeTab === "diagnostics" && (
        <AdvancedDiagnosticsPanel
          olts={olts}
          onus={onus}
          showToast={showToast}
          onReload={loadData}
          onRebootOnu={async (onu) => {
            try {
              const res = await ApiClient.rebootONU(onu.id);
              if (res.success) {
                showToast(`Reboot sent to ONU ${onu.pon_port}:${onu.onu_index}`, "success");
              } else {
                showToast(res.message || "Reboot failed", "error");
              }
              await loadData();
            } catch (err: any) {
              showToast(err.message || "Reboot error", "error");
            }
          }}
        />
      )}

      {/* ════════════════════════ TAB 1: OLTS ════════════════════════ */}
      {activeTab === "olts" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {olts.map((olt) => (
            <Card key={olt.id} className="border-border bg-card/60 shadow-sm hover:border-indigo-500/50 transition-all">
              <CardHeader className="p-4 pb-2 border-b border-border/80 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">{olt.name}</CardTitle>
                  <CardDescription className="text-[11px] font-mono mt-0.5">{olt.ip_address}</CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    olt.status === "Online"
                      ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                      : "border-rose-500/40 text-rose-400 bg-rose-500/10"
                  }`}
                >
                  {olt.status}
                </Badge>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Brand</span>
                    <span className="font-semibold text-foreground">{olt.brand}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">PON Ports</span>
                    <span className="font-semibold text-foreground">{olt.pon_ports_count || 8} Ports</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Active ONUs</span>
                    <span className="font-semibold text-emerald-400">{olt.online_onus || 0} Online</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Total Configured</span>
                    <span className="font-semibold text-foreground">{olt.total_onus || 0} Registered</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-border/50 flex items-center justify-between">
                    <span className="text-muted-foreground text-[10px] flex items-center gap-1">
                      <Server className="h-3 w-3 text-muted-foreground shrink-0" />
                      Upstream MikroTik:
                    </span>
                    <span className="font-semibold text-foreground text-[10px] flex items-center gap-1">
                      {olt.upstream_router_name ? (
                        <>
                          <span className={`h-1.5 w-1.5 rounded-full ${olt.upstream_router_status === "Online" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                          <span className="truncate max-w-[120px]">{olt.upstream_router_name}</span>
                          {olt.upstream_router_ip && <span className="font-mono text-[9px] text-muted-foreground">({olt.upstream_router_ip})</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground font-normal italic">Default BNG Gateway</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Last sync: {olt.last_sync ? new Date(olt.last_sync).toLocaleTimeString() : "Never"}
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2"
                      onClick={() => {
                        setSelectedOltId(olt.id);
                        setActiveTab("reconciliation");
                      }}
                    >
                      Audit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2"
                      onClick={() => {
                        setEditingOlt(olt);
                        setOltForm({
                          name: olt.name,
                          brand: olt.brand,
                          ip_address: olt.ip_address,
                          pon_ports_count: olt.pon_ports_count || 8,
                          snmp_community: "public",
                          status: olt.status,
                          upstream_router: olt.upstream_router || "",
                        });
                        setOltModalOpen(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ════════════════════════ TAB 2: ONUS ════════════════════════ */}
      {activeTab === "onus" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <Card className="border-border bg-card/60">
            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <select
                  value={selectedOltId}
                  onChange={(e) => setSelectedOltId(e.target.value)}
                  className="bg-background border border-border text-foreground text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 w-full sm:w-56"
                >
                  <option value="">All OLTs</option>
                  {olts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.brand})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Showing <strong className="text-foreground">{filteredOnus.length}</strong> ONUs
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search subscriber, serial, MAC..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
                <Button
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-1.5"
                  onClick={() => {
                    setOnuForm({
                      olt: selectedOltId || (olts[0]?.id || ""),
                      pon_port: "EPON0/1",
                      onu_index: 1,
                      mac_address: "",
                      serial_number: "",
                      customer_name: "",
                      customer_phone: "",
                      rx_power: -19.5,
                      tx_power: 2.1,
                      status: "Online",
                    });
                    setOnuModalOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Register ONU
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ONUs Table */}
          <Card className="border-border bg-card/60 overflow-hidden shadow-sm">
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-background/90 text-muted-foreground uppercase text-[10px] font-bold tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Subscriber Binding</th>
                    <th className="py-3 px-4">PON Port & Index</th>
                    <th className="py-3 px-4">Hardware Serial / MAC</th>
                    <th className="py-3 px-4">Optical RX Power</th>
                    <th className="py-3 px-4">Optical Status</th>
                    <th className="py-3 px-4">Distance</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                  {filteredOnus.map((onu) => {
                    const isAlarm = onu.rx_power < -27 || onu.status === "Los" || onu.status === "DyingGasp";
                    const isWarning = onu.rx_power < -24 && !isAlarm;
                    return (
                      <tr key={onu.id} className="hover:bg-accent/40 transition-colors">
                        <td className="py-3 px-4 font-sans">
                          <div className="font-bold text-foreground">{onu.customer_name || "Unassigned"}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {onu.customer_phone || "No Contact"}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-indigo-400 font-bold">
                          {onu.pon_port}:{onu.onu_index}
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-foreground font-medium">{onu.serial_number || "No SN"}</div>
                          <div className="text-[10px] text-muted-foreground">{onu.mac_address || "No MAC"}</div>
                        </td>

                        <td className="py-3 px-4 font-bold">
                          <span
                            className={
                              isAlarm
                                ? "text-rose-400 flex items-center gap-1"
                                : isWarning
                                ? "text-amber-400 flex items-center gap-1"
                                : "text-emerald-400 flex items-center gap-1"
                            }
                          >
                            <Signal className="h-3 w-3" />
                            {onu.rx_power} dBm
                          </span>
                        </td>

                        <td className="py-3 px-4 font-sans">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              onu.status === "Online"
                                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                : "border-rose-500/40 text-rose-400 bg-rose-500/10"
                            }`}
                          >
                            {onu.status}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 text-muted-foreground">
                          {onu.distance_meters ? `${onu.distance_meters} m` : "N/A"}
                        </td>

                        <td className="py-3 px-4 text-right font-sans">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRebootOnu(onu)}
                            className="h-7 text-[10px] gap-1 border-border text-foreground/80 hover:border-indigo-500/50"
                          >
                            <RotateCcw className="h-3 w-3" /> Reboot
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════════════════ TAB 3: RECONCILIATION ════════════════════════ */}
      {activeTab === "reconciliation" && (
        <div className="space-y-6">
          {/* Audit Controls & Summary Card */}
          <Card className="border-border bg-card/60">
            <CardHeader className="p-4 pb-2 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  OLT ↔ ERP Hardware Optical Reconciliation
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Compares registered subscriber ONU bindings against actual physical discovery on OLT PON interfaces.
                </CardDescription>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={selectedOltId}
                  onChange={(e) => setSelectedOltId(e.target.value)}
                  className="bg-background border border-border text-foreground text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                >
                  {olts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.brand})
                    </option>
                  ))}
                </select>

                <Button
                  size="sm"
                  disabled={auditing}
                  onClick={handleTriggerAudit}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${auditing ? "animate-spin" : ""}`} />
                  {auditing ? "Auditing OLT..." : "Trigger Live Hardware Audit"}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4">
              {latestReconRun ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                      Matched
                    </span>
                    <span className="text-xl font-black text-emerald-400">{latestReconRun.matched_count}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block">
                      Unknown in ERP
                    </span>
                    <span className="text-xl font-black text-blue-400">{latestReconRun.unknown_in_erp_count}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                      Missing in OLT
                    </span>
                    <span className="text-xl font-black text-amber-400">{latestReconRun.missing_in_olt_count}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 block">
                      Binding Mismatch
                    </span>
                    <span className="text-xl font-black text-purple-400">{latestReconRun.binding_mismatch_count}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">
                      Optical Alarms
                    </span>
                    <span className="text-xl font-black text-rose-400">{latestReconRun.optical_alarm_count}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic text-center py-4">
                  No previous audit runs found for this OLT. Click &quot;Trigger Live Hardware Audit&quot; above.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Discrepancy Breakdown Table */}
          {latestReconRun && (
            <Card className="border-border bg-card/60 overflow-hidden shadow-sm">
              <CardHeader className="p-4 pb-2 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">
                    Hardware Discrepancies & Discovered Devices
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Live findings from physical OLT query.
                  </CardDescription>
                </div>

                {/* Filter pills */}
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {["ALL", "UNKNOWN_IN_ERP", "MISSING_IN_OLT", "BINDING_MISMATCH", "OPTICAL_ALARM"].map((type) => (
                    <button
                      key={type}
                      onClick={() => setReconFilter(type)}
                      className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                        reconFilter === type
                          ? "bg-indigo-600 text-white"
                          : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                    >
                      {type.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <table className="w-full text-left text-xs">
                  <thead className="bg-background/90 text-muted-foreground uppercase text-[10px] font-bold tracking-wider border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Discrepancy Type</th>
                      <th className="py-3 px-4">Hardware Serial / MAC</th>
                      <th className="py-3 px-4">Interface / Port</th>
                      <th className="py-3 px-4">Subscriber</th>
                      <th className="py-3 px-4">Diagnostic Details</th>
                      <th className="py-3 px-4 text-right">Resolve</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                    {filteredDiscrepancies.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground font-sans">
                          No discrepancies found matching the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredDiscrepancies.map((d, idx) => (
                        <tr key={idx} className="hover:bg-accent/40 transition-colors">
                          <td className="py-3 px-4 font-sans">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold ${
                                d.type === "UNKNOWN_IN_ERP"
                                  ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                                  : d.type === "MISSING_IN_OLT"
                                  ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                                  : d.type === "OPTICAL_ALARM"
                                  ? "border-rose-500/40 text-rose-400 bg-rose-500/10"
                                  : "border-purple-500/40 text-purple-400 bg-purple-500/10"
                              }`}
                            >
                              {d.type.replace(/_/g, " ")}
                            </Badge>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-bold text-foreground">{d.serial_number || "N/A"}</div>
                            <div className="text-[10px] text-muted-foreground">{d.mac_address || "N/A"}</div>
                          </td>

                          <td className="py-3 px-4 text-indigo-400 font-bold">
                            {d.pon_port || d.olt_port || "N/A"}
                          </td>

                          <td className="py-3 px-4 font-sans text-foreground">
                            {d.customer_name || "Unbound / Orphan"}
                          </td>

                          <td className="py-3 px-4 font-sans text-muted-foreground text-xs">
                            {d.message}
                          </td>

                          <td className="py-3 px-4 text-right font-sans">
                            {d.type === "UNKNOWN_IN_ERP" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10"
                                onClick={handleOpenAutoMatch}
                              >
                                Auto-Match
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-mono">Logged</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* AUTO-MATCHING WIZARD MODAL */}
      {autoMatchModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-2xl w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-indigo-400">
                <Wand2 className="h-5 w-5" />
                <h3 className="font-bold text-base text-foreground">ONU Auto-Matching Engine</h3>
              </div>
              <button
                onClick={() => setAutoMatchModalOpen(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Correlates unassigned physical ONUs on this OLT against ERP subscribers by checking registered hardware IDs (serial & MAC addresses) and contact references.
            </p>

            {autoMatchLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-400" />
                Scanning OLT unassigned devices against ERP subscribers...
              </div>
            ) : autoMatchCandidates.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground border border-border rounded-lg bg-background">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
                No unassigned ONUs requiring matching were found on this OLT!
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Found {autoMatchCandidates.length} Matched Candidate(s)</span>
                  <span className="text-emerald-400 font-bold">Ready to Auto-Bind</span>
                </div>

                <div className="border border-border rounded-lg max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-background text-muted-foreground uppercase text-[10px] font-bold border-b border-border">
                      <tr>
                        <th className="py-2.5 px-3">Discovered ONU</th>
                        <th className="py-2.5 px-3">Subscriber Account</th>
                        <th className="py-2.5 px-3">Confidence</th>
                        <th className="py-2.5 px-3">Match Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-[11px]">
                      {autoMatchCandidates.map((c, idx) => (
                        <tr key={idx} className="hover:bg-accent/40 font-mono">
                          <td className="py-2 px-3">
                            <div className="font-bold text-foreground">{c.serial_number || c.mac_address}</div>
                            <div className="text-[10px] text-indigo-400">{c.pon_port}</div>
                          </td>
                          <td className="py-2 px-3 font-sans">
                            <div className="font-bold text-foreground">{c.customer_name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{c.pppoe_username}</div>
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                              {c.confidence}% Match
                            </Badge>
                          </td>
                          <td className="py-2 px-3 font-sans text-muted-foreground text-[10px]">
                            {c.match_reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setAutoMatchModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={matchingRunning}
                    onClick={handleExecuteAutoMatch}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {matchingRunning ? "Binding..." : `Confirm & Auto-Bind ${autoMatchCandidates.length} ONUs`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADD/EDIT OLT MODAL */}
      <Dialog open={oltModalOpen} onOpenChange={setOltModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Cpu className="h-5 w-5 text-indigo-500" />
              {editingOlt ? "Edit OLT" : "Add Optical Line Terminal (OLT)"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleOltSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">OLT Name</label>
              <Input
                placeholder="e.g. Uttara-OLT-VSOL-01"
                value={oltForm.name}
                onChange={(e) => setOltForm({ ...oltForm, name: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Brand</label>
                <select
                  value={oltForm.brand}
                  onChange={(e) => setOltForm({ ...oltForm, brand: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs"
                >
                  <option value="VSOL">V-SOL</option>
                  <option value="HUAWEI">Huawei</option>
                  <option value="ZTE">ZTE</option>
                  <option value="BDCOM">BDCOM</option>
                  <option value="CDATA">C-Data</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">IP Address</label>
                <Input
                  placeholder="10.10.20.1"
                  value={oltForm.ip_address}
                  onChange={(e) => setOltForm({ ...oltForm, ip_address: e.target.value })}
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">PON Ports Count</label>
              <Input
                type="number"
                value={oltForm.pon_ports_count}
                onChange={(e) => setOltForm({ ...oltForm, pon_ports_count: parseInt(e.target.value) || 8 })}
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Upstream MikroTik Router</label>
              <select
                value={oltForm.upstream_router}
                onChange={(e) => setOltForm({ ...oltForm, upstream_router: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">None (Standalone Gateway)</option>
                {routers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.ip_address} ({r.status})
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-muted-foreground block mt-1">
                Associates this OLT optical frame with the core MikroTik BNG for dynamic topology aggregation.
              </span>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOltModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Save OLT
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* REGISTER ONU MODAL */}
      <Dialog open={onuModalOpen} onOpenChange={setOnuModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Radio className="h-5 w-5 text-indigo-500" />
              Register Optical Network Unit (ONU)
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleOnuSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Subscriber Name</label>
              <Input
                placeholder="Tanvir Ahmed"
                value={onuForm.customer_name}
                onChange={(e) => setOnuForm({ ...onuForm, customer_name: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">MAC Address</label>
                <Input
                  placeholder="BC:54:51:7A:B2:1C"
                  value={onuForm.mac_address}
                  onChange={(e) => setOnuForm({ ...onuForm, mac_address: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Serial Number</label>
                <Input
                  placeholder="VSOL1234ABCD"
                  value={onuForm.serial_number}
                  onChange={(e) => setOnuForm({ ...onuForm, serial_number: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">PON Port</label>
                <Input
                  placeholder="EPON0/1"
                  value={onuForm.pon_port}
                  onChange={(e) => setOnuForm({ ...onuForm, pon_port: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">ONU Index</label>
                <Input
                  type="number"
                  value={onuForm.onu_index}
                  onChange={(e) => setOnuForm({ ...onuForm, onu_index: parseInt(e.target.value) || 1 })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOnuModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Register ONU
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

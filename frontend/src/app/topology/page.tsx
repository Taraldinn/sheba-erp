"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GitFork,
  Server,
  Radio,
  Wifi,
  Activity,
  RefreshCw,
  Zap,
  Layers,
  AlertTriangle,
  X,
  ArrowRight,
  Shield,
  Coins,
  TrendingDown,
  Building,
  Search,
  ChevronRight,
  ChevronLeft,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserCheck,
  UserX,
  ExternalLink,
  Phone,
  Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";
import {
  AuthoritativeHierarchyResponse,
  AuthoritativeInternetNode,
  AuthoritativeRouterNode,
  AuthoritativePopNode,
  AuthoritativeOltNode,
  AuthoritativePonNode,
  TopologyDrilldownResponse,
  PathImpactAnalysis,
} from "@/types";

export default function TopologyPage() {
  const [hierarchy, setHierarchy] = useState<AuthoritativeInternetNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Failure Simulation Drawer State
  const [impactDrawer, setImpactDrawer] = useState<{
    open: boolean;
    targetType: string;
    targetId: string;
    targetName: string;
    loading: boolean;
    data: PathImpactAnalysis | null;
  }>({
    open: false,
    targetType: "",
    targetId: "",
    targetName: "",
    loading: false,
    data: null,
  });

  // On-Demand Drill-Down Drawer State (Large ISP Dataset Protection)
  const [drilldownDrawer, setDrilldownDrawer] = useState<{
    open: boolean;
    nodeType: string;
    nodeId: string;
    title: string;
    subtitle: string;
    page: number;
    pageSize: number;
    search: string;
    loading: boolean;
    data: TopologyDrilldownResponse | null;
  }>({
    open: false,
    nodeType: "",
    nodeId: "",
    title: "",
    subtitle: "",
    page: 1,
    pageSize: 20,
    search: "",
    loading: false,
    data: null,
  });

  // Quick Simulation Selector
  const [simTargetType, setSimTargetType] = useState<string>("router");
  const [simTargetId, setSimTargetId] = useState<string>("");

  const loadHierarchy = useCallback(async () => {
    try {
      const data: AuthoritativeHierarchyResponse = await ApiClient.getAuthoritativeTopology();
      setHierarchy(data.authoritative_hierarchy);
    } catch (err) {
      console.error("Failed to load authoritative hierarchy", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHierarchy();
  }, [loadHierarchy]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadHierarchy();
  };

  // Trigger blast-radius impact analysis
  const handleAnalyzeImpact = async (targetType: string, targetId: string, targetName: string) => {
    setImpactDrawer({
      open: true,
      targetType,
      targetId,
      targetName,
      loading: true,
      data: null,
    });
    try {
      const analysis = await ApiClient.simulateAuthoritativeImpact(targetType, targetId);
      setImpactDrawer((prev) => ({ ...prev, loading: false, data: analysis }));
    } catch (err) {
      console.error("Authoritative impact simulation failed", err);
      setImpactDrawer((prev) => ({ ...prev, loading: false }));
    }
  };

  // Open paginated drill-down drawer
  const handleOpenDrilldown = async (nodeType: string, nodeId: string, title: string, subtitle: string, page = 1, search = "") => {
    setDrilldownDrawer({
      open: true,
      nodeType,
      nodeId,
      title,
      subtitle,
      page,
      pageSize: 20,
      search,
      loading: true,
      data: null,
    });
    try {
      const drillData = await ApiClient.getTopologyDrilldown(nodeType, nodeId, page, 20, search);
      setDrilldownDrawer((prev) => ({ ...prev, loading: false, data: drillData }));
    } catch (err) {
      console.error("Topology drilldown failed", err);
      setDrilldownDrawer((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleDrilldownSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (drilldownDrawer.nodeType && drilldownDrawer.nodeId) {
      handleOpenDrilldown(
        drilldownDrawer.nodeType,
        drilldownDrawer.nodeId,
        drilldownDrawer.title,
        drilldownDrawer.subtitle,
        1,
        drilldownDrawer.search
      );
    }
  };

  const handleDrilldownPageChange = (newPage: number) => {
    if (drilldownDrawer.nodeType && drilldownDrawer.nodeId) {
      handleOpenDrilldown(
        drilldownDrawer.nodeType,
        drilldownDrawer.nodeId,
        drilldownDrawer.title,
        drilldownDrawer.subtitle,
        newPage,
        drilldownDrawer.search
      );
    }
  };

  // Health badge helper
  const renderHealthBadge = (health: string) => {
    switch (health) {
      case "Online":
        return (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Online
          </Badge>
        );
      case "Degraded":
      case "Warning":
        return (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
            {health}
          </Badge>
        );
      case "Critical":
        return (
          <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-400 text-[10px] gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping"></span>
            Critical
          </Badge>
        );
      case "Offline":
      default:
        return (
          <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-400 text-[10px]">
            Offline
          </Badge>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Network Topology & Impact Analysis
            </h1>
            <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-[11px] gap-1 px-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
              Phase 20 Authoritative Chain
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Authoritative relationship tree: <span className="font-semibold text-foreground/90">Internet → Router → POP → OLT → PON → ONU → Customer</span> with blast-radius simulation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={refreshing}
            className="border-border bg-card text-xs gap-1.5 text-foreground/80"
            onClick={handleRefresh}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
            Refresh Topology
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {hierarchy && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Core Routers</span>
            <span className="text-xl font-extrabold text-blue-400">{hierarchy.total_routers}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">POP Branches</span>
            <span className="text-xl font-extrabold text-indigo-400">{hierarchy.total_pops}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">OLT Frames</span>
            <span className="text-xl font-extrabold text-emerald-400">{hierarchy.total_olts}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Subscribers</span>
            <span className="text-xl font-extrabold text-foreground">{hierarchy.total_customers}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Online Now</span>
            <span className="text-xl font-extrabold text-emerald-400">{hierarchy.online_customers}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Subscribers Offline</span>
            <span className="text-xl font-extrabold text-amber-400">
              {Math.max(0, hierarchy.total_customers - hierarchy.online_customers)}
            </span>
          </div>
        </div>
      )}

      {/* AUTHORITATIVE HIERARCHY TREE VIEW */}
      <Card className="border-border bg-background/80 overflow-hidden shadow-sm">
        <CardHeader className="pb-3 border-b border-border/80 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
            <CardTitle className="text-sm font-semibold text-foreground">
              Authoritative Multi-Tier Network Graph
            </CardTitle>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500"></span> Internet
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span> Router
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500"></span> POP
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> OLT
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> PON
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-8">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-400" />
              Building authoritative topology hierarchy...
            </div>
          ) : !hierarchy ? (
            <div className="py-12 text-center text-muted-foreground">
              No authoritative network hierarchy records found.
            </div>
          ) : (
            <div className="space-y-8">
              {/* TIER 0: INTERNET TRANSIT GATEWAY */}
              <div className="text-center">
                <div className="inline-flex flex-col items-center p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 text-center min-w-[320px] shadow-sm relative">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span className="font-bold text-sm text-foreground">{hierarchy.name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Upstream BGP Transit • Gateways: {hierarchy.total_routers} • Subscribers: {hierarchy.total_customers}
                  </p>
                  <div className="mt-2">
                    <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-400 text-[10px]">
                      Backbone Operational
                    </Badge>
                  </div>
                </div>

                {/* Trunk Connector */}
                <div className="flex justify-center">
                  <div className="w-0.5 h-6 bg-cyan-500/40"></div>
                </div>
              </div>

              {/* TIER 1: ROUTERS */}
              <div className="space-y-6">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-center">
                  Tier 1: Core BNG Routers
                </div>

                <div className="space-y-6">
                  {hierarchy.children.map((router: AuthoritativeRouterNode) => (
                    <div key={router.id} className="p-4 rounded-xl bg-card border border-border/90 shadow-sm space-y-4">
                      {/* Router Banner */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <Server className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-foreground text-base">{router.name}</h3>
                              {renderHealthBadge(router.health)}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                              IP: {router.ip_address} • CPU: {router.cpu_usage}% • RAM: {router.memory_usage}% • Active PPPoE: {router.active_sessions}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="text-xs h-7 px-2.5 gap-1.5"
                            onClick={() => handleAnalyzeImpact("router", router.raw_id, router.name)}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Simulate Router Failure
                          </Button>
                        </div>
                      </div>

                      {/* TIER 2: POP BRANCHES UNDER THIS ROUTER */}
                      {router.children.length === 0 ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          No downstream POP branches associated with this router.
                        </div>
                      ) : (
                        <div className="pl-2 sm:pl-4 border-l-2 border-indigo-500/30 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                            <Building className="h-3.5 w-3.5" />
                            Tier 2: Downstream POP Branches ({router.children.length})
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            {router.children.map((pop: AuthoritativePopNode) => (
                              <div key={pop.id} className="p-3.5 rounded-lg bg-card/60 border border-border/70 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Building className="h-4 w-4 text-indigo-400" />
                                    <span className="font-semibold text-sm text-foreground">{pop.name}</span>
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{pop.code}</span>
                                    {renderHealthBadge(pop.health)}
                                  </div>

                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground text-[11px]">
                                      Location: {pop.location || "NOC"} • Backup: {pop.power_backup || "Grid"}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-[11px] h-6 px-2 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10"
                                      onClick={() => handleAnalyzeImpact("pop", pop.raw_id, pop.name)}
                                    >
                                      Simulate POP Outage
                                    </Button>
                                  </div>
                                </div>

                                {/* TIER 3: OLTS UNDER THIS POP */}
                                {pop.children.length === 0 ? (
                                  <div className="text-[11px] text-muted-foreground italic pl-3">
                                    No OLTs installed in this POP.
                                  </div>
                                ) : (
                                  <div className="pl-3 sm:pl-5 border-l border-emerald-500/30 space-y-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                      <Radio className="h-3.5 w-3.5" />
                                      Tier 3: OLT Optical Chassis ({pop.children.length})
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {pop.children.map((olt: AuthoritativeOltNode) => (
                                        <div key={olt.id} className="p-3 rounded-lg bg-background/90 border border-border/80 space-y-2.5">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <Radio className="h-4 w-4 text-emerald-400" />
                                              <span className="font-semibold text-xs text-foreground">{olt.name}</span>
                                              <span className="text-[10px] text-muted-foreground">({olt.brand})</span>
                                            </div>
                                            {renderHealthBadge(olt.health)}
                                          </div>

                                          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                                            <span>IP: {olt.ip_address}</span>
                                            <span>ONUs: {olt.online_onus}/{olt.total_onus} Online</span>
                                          </div>

                                          <div className="flex justify-end pt-1">
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="text-[10px] h-5 px-1.5 text-emerald-400 hover:bg-emerald-500/10"
                                              onClick={() => handleAnalyzeImpact("olt", olt.raw_id, olt.name)}
                                            >
                                              Simulate OLT Failure →
                                            </Button>
                                          </div>

                                          {/* TIER 4: PON PORTS UNDER THIS OLT */}
                                          {olt.children.length > 0 && (
                                            <div className="pt-2 border-t border-border/50 space-y-1.5">
                                              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                                                <Layers className="h-3 w-3" />
                                                Tier 4: PON Interfaces ({olt.children.length})
                                              </div>

                                              <div className="flex flex-wrap gap-1.5">
                                                {olt.children.map((pon: AuthoritativePonNode) => (
                                                  <div
                                                    key={pon.id}
                                                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-card border border-border/60 hover:border-amber-500/40 transition-all text-[10px]"
                                                  >
                                                    <span className={`h-1.5 w-1.5 rounded-full ${
                                                      pon.health === 'Critical' ? 'bg-rose-400 animate-ping' : pon.health === 'Warning' ? 'bg-amber-400' : 'bg-emerald-400'
                                                    }`} />
                                                    <span className="font-semibold text-foreground">{pon.name}</span>
                                                    <span className="text-muted-foreground">
                                                      ({pon.online_onus}/{pon.total_onus})
                                                    </span>

                                                    {/* Drill-down button */}
                                                    <button
                                                      onClick={() => handleOpenDrilldown(
                                                        'pon',
                                                        `${olt.raw_id}_${pon.pon_port}`,
                                                        `PON Interface: ${pon.pon_port}`,
                                                        `OLT: ${olt.name} (${olt.brand})`
                                                      )}
                                                      className="ml-1 text-indigo-400 hover:text-indigo-300 font-medium underline"
                                                      title="Drill-down to view ONUs & Subscribers"
                                                    >
                                                      Drill-down
                                                    </button>

                                                    {/* Simulate Port Cut */}
                                                    <button
                                                      onClick={() => handleAnalyzeImpact('pon', `${olt.raw_id}_${pon.pon_port}`, `PON: ${pon.pon_port} on ${olt.name}`)}
                                                      className="text-rose-400 hover:text-rose-300 ml-1"
                                                      title="Simulate Fiber Cut on this PON Port"
                                                    >
                                                      Cut ⚡
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ON-DEMAND DRILLDOWN DRAWER (Large ISP Dataset Protection) */}
      {drilldownDrawer.open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-card border-l border-border h-full flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-400" />
                  <h3 className="font-bold text-foreground text-sm">{drilldownDrawer.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{drilldownDrawer.subtitle}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setDrilldownDrawer((prev) => ({ ...prev, open: false }))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Search Filter Bar */}
            <div className="p-4 border-b border-border bg-background/50">
              <form onSubmit={handleDrilldownSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by serial, MAC, or subscriber name/username..."
                    className="pl-8 text-xs h-9"
                    value={drilldownDrawer.search}
                    onChange={(e) => setDrilldownDrawer((prev) => ({ ...prev, search: e.target.value }))}
                  />
                </div>
                <Button type="submit" size="sm" className="h-9 px-3 text-xs">
                  Search
                </Button>
              </form>
            </div>

            {/* Drill-down Results Table */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {drilldownDrawer.loading ? (
                <div className="py-16 text-center text-muted-foreground text-xs">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-400" />
                  Fetching optical signals and subscriber bindings...
                </div>
              ) : !drilldownDrawer.data || drilldownDrawer.data.results.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  No ONUs or subscribers found on this interface.
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-muted-foreground flex justify-between">
                    <span>Showing {drilldownDrawer.data.results.length} of {drilldownDrawer.data.total_count} ONUs</span>
                    <span>Page {drilldownDrawer.data.page} of {drilldownDrawer.data.total_pages}</span>
                  </div>

                  {drilldownDrawer.data.results.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg bg-background/80 border border-border hover:border-indigo-500/40 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-foreground">
                            {item.serial_number || item.mac_address}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">({item.mac_address})</span>
                          {renderHealthBadge(item.health)}
                        </div>

                        {(() => {
                          const rxNum = item.rx_power !== null && item.rx_power !== undefined && item.rx_power !== '' ? Number(item.rx_power) : NaN;
                          const isValid = Number.isFinite(rxNum);
                          const isHealthy = isValid && rxNum >= -27;
                          return (
                            <div className="text-right">
                              <span className={`text-xs font-mono font-bold ${
                                isHealthy ? 'text-emerald-400' : 'text-amber-400'
                              }`}>
                                {isValid ? `${item.rx_power} dBm` : 'N/A'}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Bound Customer Info */}
                      {item.customer ? (
                        <div className="p-2 rounded bg-card/60 border border-border/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground">{item.customer.name}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">({item.customer.customer_code})</span>
                              {item.customer.is_online ? (
                                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[9px] py-0 px-1">
                                  ONLINE
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-rose-500/40 text-rose-400 text-[9px] py-0 px-1">
                                  OFFLINE
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                              User: {item.customer.pppoe_username} • Pkg: {item.customer.package_name} • BNG: {item.customer.router_name}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-bold text-foreground">৳{item.customer.monthly_bill}</span>
                            <span className="text-[10px] text-muted-foreground block">/month</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground italic">
                          Unbound ONU (No subscriber registered)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {drilldownDrawer.data && drilldownDrawer.data.total_pages > 1 && (
              <div className="p-3 border-t border-border flex items-center justify-between text-xs bg-background/50">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={drilldownDrawer.data.page <= 1}
                  onClick={() => handleDrilldownPageChange(drilldownDrawer.data!.page - 1)}
                  className="h-7 text-xs gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {drilldownDrawer.data.page} of {drilldownDrawer.data.total_pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={drilldownDrawer.data.page >= drilldownDrawer.data.total_pages}
                  onClick={() => handleDrilldownPageChange(drilldownDrawer.data!.page + 1)}
                  className="h-7 text-xs gap-1"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAILURE BLAST-RADIUS SIMULATION DRAWER */}
      {impactDrawer.open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-card border-l border-border h-full flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-400 animate-pulse" />
                <div>
                  <h3 className="font-bold text-foreground text-sm">
                    Failure Blast-Radius Simulation
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    Target: {impactDrawer.targetType.toUpperCase()} • {impactDrawer.targetName}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setImpactDrawer((prev) => ({ ...prev, open: false }))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {impactDrawer.loading ? (
                <div className="py-20 text-center text-muted-foreground text-xs">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-rose-400" />
                  Calculating multi-tier topological impact and revenue blast-radius...
                </div>
              ) : !impactDrawer.data ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  Failed to compute failure blast-radius.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* KPI Impact Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                      <span className="text-[10px] uppercase font-bold text-rose-400 block">Subscribers Impacted</span>
                      <span className="text-2xl font-extrabold text-foreground">
                        {impactDrawer.data.impact_summary.total_subscribers_affected}
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        {impactDrawer.data.impact_summary.online_subscribers_affected} online now will drop
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <span className="text-[10px] uppercase font-bold text-amber-400 block">Revenue (MRR) At Risk</span>
                      <span className="text-2xl font-extrabold text-amber-400">
                        ৳{impactDrawer.data.impact_summary.mrr_at_risk}
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        Monthly recurring revenue in jeopardy
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <span className="text-[10px] uppercase font-bold text-blue-400 block">Est. Bandwidth Loss</span>
                      <span className="text-xl font-bold text-foreground">
                        {impactDrawer.data.impact_summary.estimated_bandwidth_loss_mbps} Mbps
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-card border border-border">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Downstream Hardware</span>
                      <span className="text-xl font-bold text-foreground">
                        {impactDrawer.data.impact_summary.dependent_olts_count} OLTs • {impactDrawer.data.impact_summary.dependent_onus_count} ONUs
                      </span>
                    </div>
                  </div>

                  {/* Impact Path Trace */}
                  <div className="p-3 rounded-lg bg-background/60 border border-border space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Authoritative Upstream Path Trace
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-foreground/90">
                      {impactDrawer.data.path_trace.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                          <span className="px-2 py-0.5 rounded bg-muted/60 text-[11px]">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Service Package Breakdown */}
                  {impactDrawer.data.package_breakdown && impactDrawer.data.package_breakdown.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Service Package Breakdown
                      </h4>
                      <div className="rounded-lg border border-border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 text-muted-foreground text-[11px]">
                            <tr>
                              <th className="p-2 text-left">Package Name</th>
                              <th className="p-2 text-center">Subscribers</th>
                              <th className="p-2 text-right">MRR At Risk</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {impactDrawer.data.package_breakdown.map((pkg, idx) => (
                              <tr key={idx} className="hover:bg-muted/20">
                                <td className="p-2 font-medium text-foreground">{pkg.package_name}</td>
                                <td className="p-2 text-center text-muted-foreground">{pkg.subscribers_count}</td>
                                <td className="p-2 text-right font-bold text-amber-400">৳{pkg.mrr_at_risk}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sample Impacted Subscribers */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Sample Affected Subscribers
                      </h4>
                      <span className="text-[11px] text-muted-foreground">
                        Showing first {impactDrawer.data.affected_customers_sample.length} customers
                      </span>
                    </div>

                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 text-muted-foreground text-[11px]">
                          <tr>
                            <th className="p-2 text-left">Subscriber</th>
                            <th className="p-2 text-left">PPPoE User</th>
                            <th className="p-2 text-left">Mobile</th>
                            <th className="p-2 text-right">Bill</th>
                            <th className="p-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {impactDrawer.data.affected_customers_sample.map((cust) => (
                            <tr key={cust.id} className="hover:bg-muted/20">
                              <td className="p-2">
                                <span className="font-semibold text-foreground block">{cust.name}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{cust.customer_code}</span>
                              </td>
                              <td className="p-2 font-mono text-muted-foreground">{cust.pppoe_username}</td>
                              <td className="p-2 font-mono text-muted-foreground">{cust.mobile}</td>
                              <td className="p-2 text-right font-bold text-foreground">৳{cust.monthly_bill}</td>
                              <td className="p-2 text-center">
                                {cust.is_online ? (
                                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[9px]">
                                    Online
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-muted text-muted-foreground text-[9px]">
                                    Offline
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Suggested Remediation */}
                  <div className="p-3.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      Recommended NOC Remediation & Redundancy Actions
                    </span>
                    <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
                      {impactDrawer.data.suggested_remediation.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

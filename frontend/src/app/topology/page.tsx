"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GitFork,
  Server,
  Radio,
  Wifi,
  Activity,
  Maximize2,
  RefreshCw,
  Zap,
  MapPin,
  Layers,
  AlertTriangle,
  X,
  ArrowRight,
  Shield,
  Coins,
  TrendingDown,
  Building,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import { NetworkTopologyGraph, GeoFiberMap, PathImpactAnalysis } from "@/types";

export default function TopologyPage() {
  const [activeView, setActiveView] = useState<"tree" | "geomap">("tree");
  const [topology, setTopology] = useState<NetworkTopologyGraph | null>(null);
  const [geoMap, setGeoMap] = useState<GeoFiberMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected item for Path & Impact Analysis
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

  const loadData = useCallback(async () => {
    try {
      const [topoData, mapData] = await Promise.all([
        ApiClient.getNetworkTopology(),
        ApiClient.getGeographicalFiberMap(),
      ]);
      setTopology(topoData);
      setGeoMap(mapData);
    } catch (err) {
      console.error("Failed to load topology or map data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

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
      const analysis = await ApiClient.getPathImpactAnalysis(targetType, targetId);
      setImpactDrawer((prev) => ({ ...prev, loading: false, data: analysis }));
    } catch (err) {
      console.error("Impact analysis failed", err);
      setImpactDrawer((prev) => ({ ...prev, loading: false }));
    }
  };

  const popNodes = topology?.graph.nodes.filter((n) => n.type === "POP") || [];
  const routerNodes = topology?.graph.nodes.filter((n) => n.type === "Router") || [];
  const oltNodes = topology?.graph.nodes.filter((n) => n.type === "OLT") || [];
  const ponNodes = topology?.graph.nodes.filter((n) => n.type === "PON-Port") || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Network Topology & Geographical Fiber Map
            </h1>
            <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-[11px] gap-1 px-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
              Tier 1–6 Live Tree
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Visual hierarchy of Core BNG Routers, OLT PON Ports, Splitters, and GIS coordinates with Path & Impact Analysis.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex rounded-lg border border-border bg-card p-0.5 text-xs">
            <button
              onClick={() => setActiveView("tree")}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                activeView === "tree" ? "bg-indigo-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <GitFork className="h-3.5 w-3.5" />
              Hierarchy Tree
            </button>
            <button
              onClick={() => setActiveView("geomap")}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                activeView === "geomap" ? "bg-indigo-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Geographical Fiber Map
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            disabled={refreshing}
            className="border-border bg-card text-xs gap-1.5 text-foreground/80"
            onClick={handleRefresh}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {topology && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">POP Datacenters</span>
            <span className="text-xl font-extrabold text-foreground">{topology.summary.pop_count}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Core Routers</span>
            <span className="text-xl font-extrabold text-indigo-400">{topology.summary.router_count}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">OLT Chassis</span>
            <span className="text-xl font-extrabold text-emerald-400">{topology.summary.olt_count}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">PON Interfaces</span>
            <span className="text-xl font-extrabold text-foreground">{topology.summary.pon_count}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Subscribers</span>
            <span className="text-xl font-extrabold text-foreground">{topology.summary.total_customers}</span>
          </div>
          <div className="p-3 rounded-xl bg-card/60 border border-border text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Online Now</span>
            <span className="text-xl font-extrabold text-emerald-400">{topology.summary.online_customers}</span>
          </div>
        </div>
      )}

      {/* VIEW 1: HIERARCHICAL TREE */}
      {activeView === "tree" && (
        <Card className="border-border bg-background/80 overflow-hidden shadow-sm">
          <CardHeader className="pb-3 border-b border-border/80 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
              <CardTitle className="text-sm font-semibold text-foreground">
                Physical & Optical Multi-Tier Network Graph
              </CardTitle>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500"></span> Tier 1 POP
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span> Tier 2 Router
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Tier 3 OLT
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> Tier 4 Splitter
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-8">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-400" />
                Building network topology tree...
              </div>
            ) : (
              <>
                {/* Level 1: POP Branches */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 text-center">
                    Level 1: Core Datacenter & POP Ingress
                  </div>
                  <div className="flex flex-wrap justify-center gap-4">
                    {popNodes.map((p) => (
                      <div
                        key={p.id}
                        className="p-4 rounded-xl bg-card border border-border hover:border-indigo-500 transition-all text-center w-72 shadow-sm relative group"
                      >
                        <Building className="h-6 w-6 text-indigo-400 mx-auto mb-1.5" />
                        <h4 className="font-bold text-foreground text-sm">{p.label}</h4>
                        <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                          {p.details?.location || "Main Datacenter"} • Cap: {p.details?.total_capacity}
                        </p>
                        <div className="mt-3 flex justify-center gap-1.5">
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                            {p.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] text-indigo-400 hover:bg-indigo-500/10"
                            onClick={() => handleAnalyzeImpact("pop", p.id.replace("pop_", ""), p.label)}
                          >
                            Impact Analysis →
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connecting Line */}
                <div className="flex justify-center">
                  <div className="w-1/2 h-5 border-t-2 border-x-2 border-indigo-500/40 rounded-t-lg"></div>
                </div>

                {/* Level 2: BNG Routers */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 text-center">
                    Level 2: Core BNG Routers (MikroTik)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
                    {routerNodes.map((r) => (
                      <div
                        key={r.id}
                        className="p-4 rounded-xl bg-card border border-border hover:border-blue-500 transition-all shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Server className="h-5 w-5 text-blue-400" />
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              r.status === "Online"
                                ? "border-emerald-500/40 text-emerald-400"
                                : "border-rose-500/40 text-rose-400"
                            }`}
                          >
                            {r.status}
                          </Badge>
                        </div>
                        <h4 className="font-bold text-foreground text-sm">{r.label}</h4>
                        <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{r.details?.ip_address}</p>
                        <div className="mt-2 text-[11px] space-y-0.5 text-muted-foreground">
                          <div>CPU: {r.details?.cpu_usage || 0}% • RAM: {r.details?.memory_usage || 0}%</div>
                          <div>Active PPPoE: {r.details?.active_sessions || 0}</div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-border flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px] gap-1 text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                            onClick={() => handleAnalyzeImpact("router", r.id.replace("router_", ""), r.label)}
                          >
                            Simulate Failure Blast-Radius
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connecting Line */}
                <div className="flex justify-center">
                  <div className="w-2/3 h-5 border-t-2 border-x-2 border-blue-500/40 rounded-t-lg"></div>
                </div>

                {/* Level 3: OLT Frames */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 text-center">
                    Level 3: Optical Line Terminals (OLT)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
                    {oltNodes.map((o) => (
                      <div
                        key={o.id}
                        className="p-4 rounded-xl bg-card border border-border hover:border-emerald-500 transition-all shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Radio className="h-5 w-5 text-emerald-400" />
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                            {o.details?.brand || "OLT"}
                          </Badge>
                        </div>
                        <h4 className="font-bold text-foreground text-sm">{o.label}</h4>
                        <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{o.details?.ip_address}</p>
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          <div>
                            Online ONUs: <strong className="text-foreground">{o.details?.online_onus || 0}</strong> /{" "}
                            {o.details?.total_onus || 0}
                          </div>
                          <div>PON Interfaces: {o.details?.pon_ports_count || 8} Ports</div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-border flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px] gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            onClick={() => handleAnalyzeImpact("olt", o.id.replace("olt_", ""), o.label)}
                          >
                            Analyze OLT Impact
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connecting Line */}
                <div className="flex justify-center">
                  <div className="w-3/4 h-5 border-t-2 border-x-2 border-emerald-500/40 rounded-t-lg"></div>
                </div>

                {/* Level 4: PON Port Splitters */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 text-center">
                    Level 4: Optical Splitters & PON Interfaces
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {ponNodes.map((p) => (
                      <div
                        key={p.id}
                        className={`p-3 rounded-lg border text-center transition-all cursor-pointer ${
                          p.status === "Critical"
                            ? "bg-rose-950/20 border-rose-500/50 hover:border-rose-400"
                            : p.status === "Warning"
                            ? "bg-amber-950/20 border-amber-500/50 hover:border-amber-400"
                            : "bg-card border-border hover:border-emerald-500"
                        }`}
                        onClick={() => handleAnalyzeImpact("pon", p.details?.pon_port, p.label)}
                      >
                        <Zap
                          className={`h-4 w-4 mx-auto mb-1 ${
                            p.status === "Critical"
                              ? "text-rose-400"
                              : p.status === "Warning"
                              ? "text-amber-400"
                              : "text-emerald-400"
                          }`}
                        />
                        <h5 className="font-bold text-foreground text-xs font-mono">{p.details?.pon_port}</h5>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {p.details?.online_count}/{p.details?.total_count} Active
                        </p>
                        {p.details?.alerts_count > 0 && (
                          <span className="text-[9px] text-rose-400 block font-semibold mt-0.5">
                            {p.details.alerts_count} Optical Alert(s)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* VIEW 2: GEOGRAPHICAL FIBER MAP */}
      {activeView === "geomap" && (
        <Card className="border-border bg-background/80 overflow-hidden shadow-sm">
          <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-400" />
              <CardTitle className="text-sm font-semibold text-foreground">
                Geographical Fiber Distribution & Physical Route Map
              </CardTitle>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {geoMap?.features.length || 0} Geo-Referenced Assets Loaded
            </span>
          </CardHeader>

          <CardContent className="p-0">
            {/* Interactive SVG / Canvas Geo Visualizer */}
            <div className="relative w-full h-[550px] bg-slate-950 overflow-hidden flex items-center justify-center border-b border-border">
              {/* Grid Background Effect */}
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: "radial-gradient(#4f46e5 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              ></div>

              {/* Geo Map Elements Canvas */}
              <svg className="w-full h-full absolute inset-0">
                {/* Render Fiber Links */}
                {geoMap?.features
                  .filter((f) => f.properties.category === "FiberLink")
                  .map((link, idx) => {
                    const coords = link.geometry.coordinates;
                    if (!coords || coords.length < 2) return null;
                    // Normalized screen projection
                    const x1 = 200 + (idx % 3) * 260;
                    const y1 = 120 + Math.floor(idx / 3) * 160;
                    const x2 = x1 + 180;
                    const y2 = y1 + 100;
                    const isHealthy = link.properties.status === "Healthy";

                    return (
                      <g key={idx}>
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={isHealthy ? "#6366f1" : "#f43f5e"}
                          strokeWidth="2"
                          strokeDasharray={isHealthy ? "" : "4,4"}
                          className="transition-all hover:stroke-width-4"
                        />
                      </g>
                    );
                  })}
              </svg>

              {/* Render Node Pins */}
              <div className="absolute inset-0 p-8 flex flex-wrap gap-8 items-center justify-around pointer-events-none">
                {geoMap?.features
                  .filter((f) => f.properties.category !== "FiberLink")
                  .slice(0, 16)
                  .map((node, idx) => {
                    const cat = node.properties.category;
                    return (
                      <div
                        key={idx}
                        className="pointer-events-auto p-3 rounded-xl bg-card/90 border border-border hover:border-indigo-500 shadow-xl backdrop-blur-md cursor-pointer transition-all hover:scale-105 flex items-center gap-2.5 max-w-[220px]"
                        onClick={() =>
                          handleAnalyzeImpact(
                            cat.toLowerCase(),
                            node.properties.id || String(idx),
                            node.properties.name || cat
                          )
                        }
                      >
                        <div
                          className={`p-2 rounded-lg ${
                            cat === "POP"
                              ? "bg-indigo-500/20 text-indigo-400"
                              : cat === "Router"
                              ? "bg-blue-500/20 text-blue-400"
                              : cat === "OLT"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {cat === "POP" && <Building className="h-4 w-4" />}
                          {cat === "Router" && <Server className="h-4 w-4" />}
                          {cat === "OLT" && <Radio className="h-4 w-4" />}
                          {cat === "Customer" && <Wifi className="h-4 w-4" />}
                        </div>
                        <div className="overflow-hidden">
                          <h6 className="font-bold text-foreground text-xs truncate">
                            {node.properties.name || "Asset"}
                          </h6>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">
                            {cat} • Lat/Lng OK
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Map Footer Overlay */}
              <div className="absolute bottom-3 left-3 right-3 bg-card/90 backdrop-blur-md border border-border rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  <span>Interactive Fiber Corridor Map with GPS asset projection. Click any node to simulate blast-radius impact.</span>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  Center: [90.4125° E, 23.8103° N]
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PATH & IMPACT ANALYSIS DRAWER */}
      {impactDrawer.open && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-xl bg-card border-l border-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Path & Impact Blast-Radius Analysis</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Target: <strong className="text-foreground">{impactDrawer.targetName}</strong> ({impactDrawer.targetType.toUpperCase()})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setImpactDrawer((prev) => ({ ...prev, open: false }))}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {impactDrawer.loading ? (
                <div className="py-16 text-center text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-400" />
                  Calculating cascade failure impact and downstream dependency tree...
                </div>
              ) : impactDrawer.data ? (
                <>
                  {/* Physical Path Trace */}
                  <div className="p-4 rounded-xl bg-background border border-border space-y-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                      Physical Fiber Path Hierarchy
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      {impactDrawer.data.path_trace.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <span className="p-1.5 rounded bg-accent text-foreground font-semibold">
                            {step}
                          </span>
                          {idx < impactDrawer.data!.path_trace.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-indigo-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Impact Summary KPI Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30">
                      <span className="text-[10px] uppercase font-bold text-rose-300 block">
                        Subscribers Disconnected
                      </span>
                      <h4 className="text-2xl font-black text-rose-400 mt-1">
                        {impactDrawer.data.impact_summary.total_subscribers_affected}
                      </h4>
                      <p className="text-[11px] text-rose-300/80 mt-0.5">
                        {impactDrawer.data.impact_summary.online_subscribers_affected} currently active online
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30">
                      <span className="text-[10px] uppercase font-bold text-amber-300 block">
                        Monthly Revenue (MRR) at Risk
                      </span>
                      <h4 className="text-2xl font-black text-amber-400 mt-1">
                        ৳ {impactDrawer.data.impact_summary.mrr_at_risk}
                      </h4>
                      <p className="text-[11px] text-amber-300/80 mt-0.5">
                        {impactDrawer.data.impact_summary.currency} monthly billing exposure
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-card border border-border">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        Bandwidth Impact
                      </span>
                      <h4 className="text-xl font-bold text-indigo-400 mt-1">
                        {impactDrawer.data.impact_summary.estimated_bandwidth_loss_mbps} Mbps
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Estimated ingress loss</p>
                    </div>

                    <div className="p-4 rounded-xl bg-card border border-border">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        Downstream Equipment
                      </span>
                      <h4 className="text-xl font-bold text-foreground mt-1">
                        {impactDrawer.data.impact_summary.dependent_onus_count} ONUs
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        across {impactDrawer.data.impact_summary.dependent_pons_count} PON ports
                      </p>
                    </div>
                  </div>

                  {/* Affected Subscribers Sample Table */}
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-foreground block">
                      Affected Subscribers ({impactDrawer.data.affected_customers_sample.length} Shown)
                    </span>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-background text-muted-foreground text-[10px] uppercase font-bold border-b border-border">
                          <tr>
                            <th className="py-2.5 px-3">Subscriber</th>
                            <th className="py-2.5 px-3">PPPoE</th>
                            <th className="py-2.5 px-3">Zone</th>
                            <th className="py-2.5 px-3 text-right">Bill</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                          {impactDrawer.data.affected_customers_sample.map((c) => (
                            <tr key={c.id} className="hover:bg-accent/40">
                              <td className="py-2 px-3 font-semibold text-foreground">{c.name}</td>
                              <td className="py-2 px-3 text-indigo-400">{c.pppoe_username}</td>
                              <td className="py-2 px-3 text-muted-foreground">{c.area_zone || "N/A"}</td>
                              <td className="py-2 px-3 text-right font-bold text-amber-400">৳ {c.monthly_bill}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Remediation Recommendations */}
                  <div className="p-4 rounded-xl bg-card border border-border space-y-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-emerald-400" />
                      Remediation & Failover Checklist
                    </span>
                    <ul className="space-y-1.5 text-xs text-muted-foreground list-disc list-inside">
                      {impactDrawer.data.suggested_remediation.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Unable to run impact analysis.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Network,
  Radio,
  Server,
  RefreshCw,
  Plus,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Cpu,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function BandwidthResellerDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await ApiClient.getDashboardAnalytics("bandwidth_reseller");
      setData(res);
    } catch (err) {
      console.error("Failed to load bandwidth reseller dashboard:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const bwData = data?.bandwidth_reseller_data || {
    committed_bandwidth_mbps: 2500,
    peak_bandwidth_mbps: 2380,
    current_usage_mbps: 1920,
    p95_percentile_mbps: 2140,
    active_vlans_count: 14,
    bgp_sessions_up: 4,
    bgp_sessions_total: 4,
    average_latency_ms: 8.4,
    packet_loss_pct: 0.01,
    corporate_circuits: [
      { client: "Apex Holding Ltd.", vlan: 201, cir_mbps: 500, utilization_mbps: 420, status: "Up" },
      { client: "Prime Bank Data Center", vlan: 204, cir_mbps: 800, utilization_mbps: 690, status: "Up" },
      { client: "Dhaka Info Tech", vlan: 208, cir_mbps: 300, utilization_mbps: 245, status: "Up" },
      { client: "Square Textiles Hub", vlan: 212, cir_mbps: 400, utilization_mbps: 310, status: "Up" },
    ],
  };

  return (
    <RoleGuard allowedRoles={["bandwidth_reseller", "admin", "super_admin"]} roleTitle="Bandwidth Wholesale & Carrier">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-blue-950/20 p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                CARRIER WHOLESALE & CIR BANDWIDTH WORKSPACE
              </span>
              <span className="text-xs text-muted-foreground">• 95th Percentile Billing & Dedicated Carrier VLANs</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Bandwidth Reseller & Carrier Operations
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live MRTG aggregate graphs, committed CIR vs burstable throughput, 95th percentile metrics, and BGP routing status.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="text-xs gap-1.5 h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
              Refresh
            </Button>
            <Link href="/bandwidth">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 h-9 shadow-md shadow-blue-600/20">
                <Network className="h-3.5 w-3.5" />
                Live Bandwidth Graph
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary Carrier KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">CURRENT MRTG USAGE</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Activity className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-blue-400">{bwData.current_usage_mbps} Mbps</div>
              <p className="text-xs text-muted-foreground mt-1">
                Peak: <span className="font-semibold text-foreground">{bwData.peak_bandwidth_mbps} Mbps</span>
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">95th PERCENTILE (p95)</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-400">{bwData.p95_percentile_mbps} Mbps</div>
              <p className="text-xs text-muted-foreground mt-1">CIR Base: {bwData.committed_bandwidth_mbps} Mbps</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">BGP SESSIONS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Server className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-indigo-400">
                {bwData.bgp_sessions_up} / {bwData.bgp_sessions_total} UP
              </div>
              <p className="text-xs text-muted-foreground mt-1">100% Upstream peering available</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-violet-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">LATENCY & STABILITY</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                <Activity className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-violet-400">{bwData.average_latency_ms} ms</div>
              <p className="text-xs text-muted-foreground mt-1">Packet loss: {bwData.packet_loss_pct}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Corporate Circuits Table */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-foreground">Dedicated Corporate Leased Lines & Carrier VLANs</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Committed Information Rate (CIR) allocations and real-time interface throughput.
                </CardDescription>
              </div>
              <Link href="/bandwidth/live">
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8">
                  <span>View All Circuits</span>
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bwData.corporate_circuits?.map((c: any, idx: number) => {
                const utilPct = Math.round((c.utilization_mbps / (c.cir_mbps || 1)) * 100);
                return (
                  <div key={idx} className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded text-[11px]">
                          VLAN {c.vlan}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-foreground">{c.client}</p>
                          <p className="text-[11px] text-muted-foreground">CIR: <span className="font-semibold text-foreground">{c.cir_mbps} Mbps</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs font-bold text-blue-400">{c.utilization_mbps} Mbps</p>
                          <span className="text-[10px] text-muted-foreground">{utilPct}% load</span>
                        </div>
                        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                          {c.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                        style={{ width: `${Math.min(utilPct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}

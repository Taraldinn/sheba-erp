"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  Coins,
  Users,
  Network,
  RefreshCw,
  Plus,
  ArrowUpRight,
  Radio,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function ResellerL1DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await ApiClient.getDashboardAnalytics("reseller_l1");
      setData(res);
    } catch (err) {
      console.error("Failed to load reseller L1 dashboard:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const l1Data = data?.reseller_l1_data || {
    pop_name: "Uttara Main POP-01",
    wallet_balance: 74500.0,
    credit_limit: 150000.0,
    total_subscribers: 420,
    active_pppoe_sessions: 365,
    sub_resellers_count: 6,
    allocated_bandwidth_mbps: 800,
    current_bandwidth_mbps: 620,
    sub_reseller_list: [
      { name: "Metro Link (L2)", zone: "Sector 3", clients: 85, wallet: 12400.0 },
      { name: "Speed Net (L2)", zone: "Sector 7", clients: 110, wallet: 18500.0 },
      { name: "Fast Optical (L2)", zone: "Sector 11", clients: 64, wallet: 8900.0 },
      { name: "Direct Retail Line", zone: "Central POP", clients: 161, wallet: 34700.0 },
    ],
  };

  return (
    <RoleGuard allowedRoles={["reseller_l1", "reseller", "admin", "super_admin"]} roleTitle="Reseller Level 1 POP">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-emerald-950/20 p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                MASTER POP RESELLER (LEVEL 1)
              </span>
              <span className="text-xs text-muted-foreground">• {l1Data.pop_name}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Level 1 POP Operations & Dealer Management
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live tracking of POP wallet balance, credit ceiling, aggregate CIR utilization, and subordinate L2 dealer accounts.
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
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
              Refresh
            </Button>
            <Link href="/wallet">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 h-9 shadow-md shadow-emerald-600/20">
                <Wallet className="h-3.5 w-3.5" />
                Recharge POP Wallet
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary L1 KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">POP WALLET BALANCE</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Wallet className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-400">৳{(Number(l1Data?.wallet_balance) || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Credit Limit: <span className="font-semibold text-foreground">৳{(Number(l1Data?.credit_limit) || 0).toLocaleString()}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">TOTAL POP SUBSCRIBERS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-indigo-400">{l1Data.total_subscribers} Lines</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-emerald-400 font-semibold">{l1Data.active_pppoe_sessions} online</span> sessions
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">CIR BANDWIDTH CONSUMPTION</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Radio className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-sky-400">{l1Data.current_bandwidth_mbps} Mbps</div>
              <p className="text-xs text-muted-foreground mt-1">
                Allocated pool: {l1Data.allocated_bandwidth_mbps} Mbps ({Math.round((l1Data.current_bandwidth_mbps / l1Data.allocated_bandwidth_mbps) * 100)}% load)
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-violet-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">SUB-RESELLER DEALERS (L2)</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                <Layers className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-violet-400">{l1Data.sub_resellers_count} Dealers</div>
              <p className="text-xs text-muted-foreground mt-1">Sub-ISP distribution points</p>
            </CardContent>
          </Card>
        </div>

        {/* Sub-Reseller Dealer Distribution Table */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-foreground">Subordinate Reseller (Level 2 POP) Dealers</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Dealer clients, retail zones, and subordinate prepaid balances under this POP.
                </CardDescription>
              </div>
              <Link href="/resellers">
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8">
                  <Plus className="h-3 w-3" />
                  <span>Add Sub-Reseller</span>
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {l1Data.sub_reseller_list?.map((dealer: any, idx: number) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-border bg-muted/20 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold text-xs">
                      #{idx + 1}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{dealer.name}</p>
                      <p className="text-[11px] text-muted-foreground">Coverage Zone: <span className="text-foreground font-medium">{dealer.zone}</span></p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-auto text-right">
                    <div>
                      <p className="text-xs font-bold text-foreground">{dealer.clients} Retail Clients</p>
                      <p className="text-[11px] text-emerald-400 font-semibold">Wallet: ৳{(Number(dealer?.wallet) || 0).toLocaleString()}</p>
                    </div>
                    <Link href={`/wallet?transfer_to=${dealer.name}`}>
                      <Button size="sm" variant="outline" className="text-xs gap-1 h-8">
                        <span>Fund Dealer</span>
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}

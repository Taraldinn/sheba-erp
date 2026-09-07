"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  Users,
  Coins,
  RefreshCw,
  Plus,
  ArrowRight,
  Clock,
  Radio,
  Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function ResellerL2DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await ApiClient.getDashboardAnalytics("reseller_l2");
      setData(res);
    } catch (err) {
      console.error("Failed to load sub-reseller L2 dashboard:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const l2Data = data?.reseller_l2_data || {
    parent_reseller: "Uttara Main POP-01",
    sub_reseller_name: "Metro Link Network (L2)",
    wallet_balance: 12400.0,
    active_subscribers: 85,
    online_sessions: 78,
    expiring_today: 4,
    commission_earned_month: 8500.0,
    recent_recharges: [
      { user: "cust_rahim_01", package: "15 Mbps Unlimited", amount: 650.0, time: "10 mins ago" },
      { user: "cust_fahim_02", package: "25 Mbps Premium", amount: 950.0, time: "1 hour ago" },
      { user: "cust_anika_03", package: "10 Mbps Home", amount: 500.0, time: "3 hours ago" },
      { user: "cust_shakil_04", package: "20 Mbps Gamer", amount: 800.0, time: "5 hours ago" },
    ],
  };

  return (
    <RoleGuard allowedRoles={["reseller_l2", "agent", "admin", "super_admin"]} roleTitle="Sub Reseller Level 2 POP">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-violet-950/20 p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                SUB RESELLER (LEVEL 2 POP)
              </span>
              <span className="text-xs text-muted-foreground">• Parent POP: {l2Data.parent_reseller}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {l2Data.sub_reseller_name} Operations Portal
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Direct retail customer recharges, online active sessions, expiring subscriptions, and commission revenues.
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
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-violet-400" : ""}`} />
              Refresh
            </Button>
            <Link href="/customers/new">
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5 h-9 shadow-md shadow-violet-600/20">
                <Plus className="h-3.5 w-3.5" />
                Quick Customer Setup
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary L2 KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-violet-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">RETAIL WALLET</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                <Wallet className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-violet-400">৳{(Number(l2Data?.wallet_balance) || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Available balance for customer recharges</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">MY ACTIVE CUSTOMERS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-400">{l2Data.active_subscribers} Lines</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-semibold text-foreground">{l2Data.online_sessions} online</span> sessions
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">EXPIRING TODAY</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Clock className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-400">{l2Data.expiring_today} Subscribers</div>
              <p className="text-xs text-muted-foreground mt-1">Require instant package recharge</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">COMMISSION THIS MONTH</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Coins className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-sky-400">৳{(Number(l2Data?.commission_earned_month) || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Commission profit earned</p>
            </CardContent>
          </Card>
        </div>

        {/* Live Recharges Feed */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Recent Customer Recharges</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Instant PPPoE package renewals executed from this sub-reseller wallet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {l2Data.recent_recharges?.map((rec: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{rec.user}</p>
                      <p className="text-[11px] text-muted-foreground">{rec.package}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">৳{rec.amount}</p>
                    <span className="text-[10px] text-muted-foreground">{rec.time}</span>
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

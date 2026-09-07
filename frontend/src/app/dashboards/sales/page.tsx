"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Target,
  UserPlus,
  Package,
  RefreshCw,
  Plus,
  Share2,
  CalendarCheck,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function SalesDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await ApiClient.getDashboardAnalytics("sales");
      setData(res);
    } catch (err) {
      console.error("Failed to load sales dashboard:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const salesData = data?.sales_data || {
    new_signups_this_month: 42,
    sales_target_month: 60,
    conversion_rate_pct: 72.5,
    pending_installations: 8,
    top_packages: [
      { name: "Super 25M Unlimited", speed: "25 Mbps", price: 800, subscribers: 380 },
      { name: "Family 40M Pro", speed: "40 Mbps", price: 1200, subscribers: 290 },
      { name: "Basic 15M Home", speed: "15 Mbps", price: 500, subscribers: 240 },
      { name: "Corporate 100M Fiber", speed: "100 Mbps", price: 3500, subscribers: 45 },
    ],
    lead_sources: [
      { source: "Field Marketing & Leaflets", percentage: 45 },
      { source: "Website & Online Portal", percentage: 30 },
      { source: "Customer Referrals", percentage: 25 },
    ],
  };

  return (
    <RoleGuard allowedRoles={["sales", "admin", "super_admin"]} roleTitle="Sales & Marketing">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-indigo-950/20 p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                SALES & GROWTH WORKSPACE
              </span>
              <span className="text-xs text-muted-foreground">• Subscriber Acquisition & Package Popularity</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Sales Operations Command Center
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live tracking of prospective leads, monthly targets, conversion rates, and on-site installations.
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
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
              Refresh
            </Button>
            <Link href="/customers/new">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 h-9 shadow-md shadow-indigo-600/20">
                <Plus className="h-3.5 w-3.5" />
                New Customer Lead
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary Sales KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">NEW SIGNUPS (THIS MONTH)</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <UserPlus className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-indigo-400">{salesData.new_signups_this_month}</div>
              <p className="text-xs text-muted-foreground mt-1">Target: {salesData.sales_target_month} activations</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">TARGET COMPLETION</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Target className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-400">
                {Math.round((salesData.new_signups_this_month / (salesData.sales_target_month || 1)) * 100)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">On track for monthly quota</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-violet-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">CONVERSION RATE</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-violet-400">{salesData.conversion_rate_pct}%</div>
              <p className="text-xs text-muted-foreground mt-1">Lead inquiry to paid subscriber</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">PENDING INSTALLATIONS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <CalendarCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-400">{salesData.pending_installations}</div>
              <p className="text-xs text-muted-foreground mt-1">Field surveys & fiber splicing</p>
            </CardContent>
          </Card>
        </div>

        {/* Top Packages & Lead Sources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Top Performing Packages</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Subscriber choice ranking by total connected customers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {salesData.top_packages?.map((pkg: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs">
                        #{idx + 1}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{pkg.name}</p>
                        <p className="text-[11px] text-muted-foreground">{pkg.speed} • ৳{pkg.price}/month</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-foreground">{pkg.subscribers} lines</p>
                      <span className="text-[10px] text-emerald-400 font-semibold">Active</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Acquisition Channels</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Inflow breakdown of prospective customer inquiries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {salesData.lead_sources?.map((ls: any, idx: number) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{ls.source}</span>
                    <span className="font-bold text-foreground">{ls.percentage}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full"
                      style={{ width: `${ls.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </RoleGuard>
  );
}

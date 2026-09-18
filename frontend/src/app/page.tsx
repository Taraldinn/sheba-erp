"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  UserX,
  CreditCard,
  DollarSign,
  TrendingUp,
  Server,
  Radio,
  LifeBuoy,
  Layers,
  Activity,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Router, PaymentTransaction, Package, DashboardKPIs } from "@/types";

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [routers, setRouters] = useState<Router[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [onlineSessionsCount, setOnlineSessionsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, routersRes, packagesRes, txRes, sessionsRes] = await Promise.allSettled([
        ApiClient.getDashboardAnalytics("admin"),
        ApiClient.getRouters(),
        ApiClient.getPackages(),
        ApiClient.getTransactions(),
        ApiClient.getUserSessions(),
      ]);

      if (analyticsRes.status === "fulfilled" && analyticsRes.value?.kpis) {
        setKpis(analyticsRes.value.kpis);
      } else if (analyticsRes.status === "rejected") {
        console.error("Dashboard analytics error:", analyticsRes.reason);
        const reasonObj = analyticsRes.reason as { message?: string } | undefined;
        setError(reasonObj?.message || "Failed to load dashboard metrics");
      }

      if (routersRes.status === "fulfilled") {
        setRouters(routersRes.value || []);
      }
      if (packagesRes.status === "fulfilled") {
        setPackages(packagesRes.value || []);
      }
      if (txRes.status === "fulfilled") {
        setTransactions(txRes.value || []);
      }
      if (sessionsRes.status === "fulfilled") {
        const sessList = sessionsRes.value || [];
        setOnlineSessionsCount(sessList.length);
      }
    } catch (err: unknown) {
      console.error("Dashboard error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.allSettled([
      ApiClient.getDashboardAnalytics("admin"),
      ApiClient.getRouters(),
      ApiClient.getPackages(),
      ApiClient.getTransactions(),
      ApiClient.getUserSessions(),
    ])
      .then(([analyticsRes, routersRes, packagesRes, txRes, sessionsRes]) => {
        if (ignore) return;
        if (analyticsRes.status === "fulfilled" && analyticsRes.value?.kpis) {
          setKpis(analyticsRes.value.kpis);
        } else if (analyticsRes.status === "rejected") {
          console.error("Dashboard analytics error:", analyticsRes.reason);
          const reasonObj = analyticsRes.reason as { message?: string } | undefined;
          setError(reasonObj?.message || "Failed to load dashboard metrics");
        }

        if (routersRes.status === "fulfilled") {
          setRouters(routersRes.value || []);
        }
        if (packagesRes.status === "fulfilled") {
          setPackages(packagesRes.value || []);
        }
        if (txRes.status === "fulfilled") {
          setTransactions(txRes.value || []);
        }
        if (sessionsRes.status === "fulfilled") {
          const sessList = sessionsRes.value || [];
          setOnlineSessionsCount(sessList.length);
        }
      })
      .catch((err: unknown) => {
        if (ignore) return;
        console.error("Dashboard error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Failed to load dashboard data");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const totalCustomers = kpis?.total_customers ?? 0;
  const activeCustomers = kpis?.active_customers ?? 0;
  const expiredCustomers = kpis?.expired_customers ?? 0;
  const suspendedCustomers = kpis?.suspended_customers ?? 0;
  const inactiveCustomers = expiredCustomers + suspendedCustomers;

  const todayCollection = kpis?.today_collection ?? 0;
  const monthCollection = kpis?.month_collection ?? 0;
  const totalDue = kpis?.total_due ?? 0;
  const totalAdvance = kpis?.total_advance ?? 0;

  const totalRouters = kpis?.total_routers ?? routers.length;
  const onlineRouters = kpis?.online_routers ?? routers.filter((r) => r.status === "Online").length;
  const totalOnus = kpis?.total_onus ?? 0;
  const onlineOnus = kpis?.online_onus ?? 0;
  const openTickets = kpis?.open_tickets ?? 0;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto text-xs">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <Radio className="h-5 w-5 text-indigo-500" />
            Active ISP Operations Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time subscriber status, billing collections, network routers, and support queues.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
            className="h-8 text-xs gap-1.5 border-border bg-card cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/customers/new">
            <Button size="sm" className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer">
              <Users className="h-3.5 w-3.5" />
              New Customer
            </Button>
          </Link>
        </div>
      </div>

      {/* Global API Error Banner if analytics failed */}
      {error && (
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-semibold text-xs">{error}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            className="h-7 text-[11px] border-destructive/30 hover:bg-destructive/20"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Core KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Customers Card */}
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Subscribers
              </span>
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-foreground">
                {loading && !kpis ? "..." : totalCustomers.toLocaleString()}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px]">
                <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                  <UserCheck className="h-3 w-3" />
                  {activeCustomers} Active
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-rose-500 font-medium flex items-center gap-0.5">
                  <UserX className="h-3 w-3" />
                  {inactiveCustomers} Inactive
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Collections Card */}
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Today&apos;s Collection
              </span>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CreditCard className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-foreground">
                {loading && !kpis ? "..." : formatCurrency(todayCollection)}
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                <span>Month: <strong className="text-foreground">{formatCurrency(monthCollection)}</strong></span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Due Balance Card */}
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Due
              </span>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-amber-500">
                {loading && !kpis ? "..." : formatCurrency(totalDue)}
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                <span>Advance Pool: <strong className="text-foreground">{formatCurrency(totalAdvance)}</strong></span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Network Devices Card */}
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Network Routers
              </span>
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Server className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-foreground">
                {loading && !kpis ? "..." : `${onlineRouters} / ${totalRouters}`}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px]">
                <span className="text-emerald-500 font-semibold flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {onlineRouters} Online
                </span>
                {totalOnus > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{onlineOnus}/{totalOnus} ONUs</span>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Active Packages */}
        <div className="p-3 bg-card border border-border rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-indigo-500" />
            <div>
              <div className="text-muted-foreground text-[10px] uppercase font-bold">Active Packages</div>
              <div className="text-base font-bold text-foreground">
                {packages.filter((p) => p.is_active).length} Profiles
              </div>
            </div>
          </div>
          <Link href="/packages" className="text-indigo-500 hover:text-indigo-400">
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Online Sessions */}
        <div className="p-3 bg-card border border-border rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-emerald-500" />
            <div>
              <div className="text-muted-foreground text-[10px] uppercase font-bold">Live Sessions</div>
              <div className="text-base font-bold text-foreground">
                {onlineSessionsCount !== null ? `${onlineSessionsCount} Active` : `${activeCustomers} PPPoE`}
              </div>
            </div>
          </div>
          <Link href="/online-sessions" className="text-emerald-500 hover:text-emerald-400">
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Open Tickets */}
        <div className="p-3 bg-card border border-border rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LifeBuoy className="h-4 w-4 text-amber-500" />
            <div>
              <div className="text-muted-foreground text-[10px] uppercase font-bold">Open Tickets</div>
              <div className="text-base font-bold text-foreground">
                {openTickets} Pending
              </div>
            </div>
          </div>
          <Link href="/support" className="text-amber-500 hover:text-amber-400">
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Optical Health Warnings */}
        <div className="p-3 bg-card border border-border rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <div>
              <div className="text-muted-foreground text-[10px] uppercase font-bold">Optical Warnings</div>
              <div className="text-base font-bold text-foreground">
                {kpis?.warning_onus ?? 0} Low Power
              </div>
            </div>
          </div>
          <Link href="/olt?tab=onus" className="text-rose-500 hover:text-rose-400">
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Operational Tables: Routers & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Routers Status Table */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <Server className="h-4 w-4 text-indigo-500" />
                Network Routers Status
              </CardTitle>
              <CardDescription className="text-[11px] text-muted-foreground">
                Core and distribution MikroTik gateways
              </CardDescription>
            </div>
            <Link href="/routers">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-indigo-500">
                View All ({routers.length})
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {routers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {loading ? "Loading routers..." : "No network routers registered yet."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Router Name</th>
                      <th className="p-3">IP Address</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {routers.slice(0, 5).map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="p-3 font-semibold text-foreground">
                          {r.name}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {r.ip_address}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={r.status || (r.is_active ? "Online" : "Offline")} />
                        </td>
                        <td className="p-3 text-right text-muted-foreground">
                          {r.location || "Core NOC"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payment Transactions */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <Receipt className="h-4 w-4 text-emerald-500" />
                Recent Payment Collections
              </CardTitle>
              <CardDescription className="text-[11px] text-muted-foreground">
                Automated webhook & cash ledger entries
              </CardDescription>
            </div>
            <Link href="/payments">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-500">
                View Ledger
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {loading ? "Loading transactions..." : "No recent transactions found."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground font-bold border-b border-border text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Trx ID</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.slice(0, 5).map((tx) => (
                      <tr key={tx.id} className="hover:bg-muted/30">
                        <td className="p-3 font-mono font-semibold text-indigo-400">
                          {tx.trx_id || `TRX-${tx.id.slice(0, 8)}`}
                        </td>
                        <td className="p-3 text-muted-foreground font-medium">
                          {tx.payment_method || "Direct Payment"}
                        </td>
                        <td className="p-3 font-bold text-foreground">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="p-3 text-right">
                          <StatusBadge status={tx.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

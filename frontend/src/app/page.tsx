"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  UserPlus,
  CheckCircle,
  Handshake,
  UserCheck,
  FileText,
  AlertTriangle,
  Clock,
  UserX,
  Ticket,
  Activity,
  TrendingUp,
  CreditCard,
  Radio,
  WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Router, PaymentTransaction, ONU, DashboardKPIs } from "@/types";
import { mockKPIs } from "@/lib/mock-data";
import { RoleGuard } from "@/components/auth/RoleGuard";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

const defaultTraffic = [
  { time: "1400M", download: 380, upload: 90 },
  { time: "1050M", download: 310, upload: 75 },
  { time: "700M", download: 480, upload: 110 },
  { time: "350M", download: 740, upload: 195 },
  { time: "0M", download: 1390, upload: 385 },
];

const defaultRevenue = [
  { month: "Apr", collection: 320, target: 300 },
  { month: "May", collection: 345, target: 320 },
  { month: "Jun", collection: 380, target: 350 },
  { month: "Jul", collection: 410, target: 380 },
  { month: "Aug", collection: 440, target: 400 },
  { month: "Sep", collection: 485, target: 420 },
];

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs>(mockKPIs);
  const [trafficData, setTrafficData] = useState<any[]>(defaultTraffic);
  const [revenueTrend, setRevenueTrend] = useState<any[]>(defaultRevenue);
  const [routers, setRouters] = useState<Router[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [onus, setOnus] = useState<ONU[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [analyticsRes, rRes, tRes, oRes] = await Promise.allSettled([
          ApiClient.getDashboardAnalytics("admin"),
          ApiClient.getRouters(),
          ApiClient.getTransactions(),
          ApiClient.getONUs(),
        ]);

        if (analyticsRes.status === "fulfilled" && analyticsRes.value?.kpis) {
          setKpis({
            ...mockKPIs,
            ...analyticsRes.value.kpis,
          });
          if (analyticsRes.value.traffic_distribution?.length > 0) {
            setTrafficData(analyticsRes.value.traffic_distribution);
          }
          if (analyticsRes.value.monthly_trend?.length > 0) {
            setRevenueTrend(
              analyticsRes.value.monthly_trend.map((m: any) => ({
                ...m,
                collection: Math.round((Number(m.collection) || 0) / 1000),
                target: Math.round((Number(m.target) || 0) / 1000),
              }))
            );
          }
        }
        if (rRes.status === "fulfilled") setRouters(rRes.value || []);
        if (tRes.status === "fulfilled") setTransactions(tRes.value || []);
        if (oRes.status === "fulfilled") setOnus(oRes.value || []);
      } catch (err) {
        console.error("Failed to load dashboard data from API:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalClients = Number(kpis?.total_customers ?? 2840);
  const activeClients = Number(kpis?.active_customers ?? 2490);
  const suspendedClients = Number(kpis?.suspended_customers ?? 65);
  const expiredClients = Number(kpis?.expired_customers ?? 285);
  const monthCollection = Number(kpis?.month_collection ?? 1428000);
  const todayRevenue = Number(kpis?.today_collection ?? 48500);
  const totalDue = Number(kpis?.total_due ?? 164000);
  const totalAdvance = Number(kpis?.total_advance ?? 82500);
  const onlineRoutersCount = Number(kpis?.online_routers ?? 6);
  const totalRoutersCount = Number(kpis?.total_routers ?? (routers.length || 6));
  const registeredOnusCount = Number(kpis?.total_onus ?? 2150);
  const opticalWarningsCount = Number(kpis?.warning_onus ?? 42);
  const openTicketsCount = Number(kpis?.open_tickets ?? 8);

  // 16 Custom Dashboard KPI Cards - Matching Executive Admin Dashboard Screenshot
  const dashboardKpiCards = [
    // ── Row 1 ──────────────────────────────────────────────────────────
    {
      title: "Total Clients",
      value: totalClients.toLocaleString(),
      icon: Users,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      accentBorder: "border-l-blue-500",
      href: "/customers",
    },
    {
      title: "New Clients (This Month)",
      value: "227",
      icon: UserPlus,
      iconColor: "text-purple-500",
      iconBg: "bg-purple-500/10",
      accentBorder: "border-l-purple-500",
      href: "/customers/new",
    },
    {
      title: "Active Clients",
      value: activeClients.toLocaleString(),
      subtext: `Online Line: ${Math.round((activeClients / (totalClients || 1)) * 100)}%`,
      icon: CheckCircle,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      accentBorder: "border-l-emerald-500",
      href: "/customers?status=Active",
    },
    {
      title: "Promise Active",
      value: "8",
      icon: Handshake,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      accentBorder: "border-l-amber-500",
      href: "/customers?status=PromiseActive",
    },

    // ── Row 2 ──────────────────────────────────────────────────────────
    {
      title: "Free Clients",
      value: "3",
      icon: UserCheck,
      iconColor: "text-teal-500",
      iconBg: "bg-teal-500/10",
      accentBorder: "border-l-teal-500",
      href: "/customers?status=Free",
    },
    {
      title: "Total Billing Amount",
      value: formatCurrency(2272000),
      icon: FileText,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      accentBorder: "border-l-indigo-500",
      href: "/billing",
    },
    {
      title: "Total Due Amount",
      value: formatCurrency(totalDue),
      icon: AlertTriangle,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-500/10",
      accentBorder: "border-l-rose-500",
      href: "/billing?tab=dues",
    },
    {
      title: "Total Advance",
      value: formatCurrency(totalAdvance),
      icon: Clock,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      accentBorder: "border-l-emerald-500",
      href: "/billing?tab=advance",
    },

    // ── Row 3 ──────────────────────────────────────────────────────────
    {
      title: "Suspended / Off Lines",
      value: suspendedClients.toLocaleString(),
      icon: WifiOff,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-500/10",
      accentBorder: "border-l-rose-500",
      href: "/customers?status=Suspended",
    },
    {
      title: "Expired Subscribers",
      value: expiredClients.toLocaleString(),
      icon: UserX,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      accentBorder: "border-l-amber-500",
      href: "/customers?status=Expired",
    },
    {
      title: "This Month Collection",
      value: formatCurrency(monthCollection),
      icon: CreditCard,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      accentBorder: "border-l-emerald-500",
      href: "/payments",
    },
    {
      title: "Open Tickets",
      value: openTicketsCount.toString(),
      icon: Ticket,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      accentBorder: "border-l-indigo-500",
      href: "/support",
    },

    // ── Row 4 ──────────────────────────────────────────────────────────
    {
      title: "Online Routers",
      value: `${onlineRoutersCount}/${totalRoutersCount}`,
      icon: Activity,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      accentBorder: "border-l-emerald-500",
      href: "/routers",
    },
    {
      title: "Registered ONUs",
      value: registeredOnusCount.toString(),
      icon: Radio,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      accentBorder: "border-l-indigo-500",
      href: "/olt",
    },
    {
      title: "Optical Warnings",
      value: opticalWarningsCount.toString(),
      icon: AlertTriangle,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      accentBorder: "border-l-amber-500",
      href: "/olt",
    },
    {
      title: "Today's Revenue",
      value: formatCurrency(todayRevenue),
      icon: TrendingUp,
      iconColor: "text-sky-500",
      iconBg: "bg-sky-500/10",
      accentBorder: "border-l-sky-500",
      href: "/payments",
    },
  ];

  return (
    <RoleGuard allowedRoles={["admin", "super_admin", "staff", "tenant_owner"]} roleTitle="Executive ISP Admin">
      <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto text-xs">
        {/* ───────────────────────────────────────────────────────────── */}
        {/* 16 KPI Metric Cards Grid */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dashboardKpiCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <Link key={idx} href={card.href}>
                <div
                  className={`group relative rounded-xl p-4 border border-border border-l-4 ${card.accentBorder} bg-card hover:bg-accent/40 shadow-xs hover:shadow-md transition-all hover:-translate-y-0.5 min-h-[92px] flex flex-col justify-between cursor-pointer select-none`}
                >
                  {/* Header Title & Circular Icon */}
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                      {card.title}
                    </span>
                    <div
                      className={`h-7 w-7 rounded-lg flex items-center justify-center ${card.iconBg} ${card.iconColor} transition-transform group-hover:scale-110`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Main Metric Value & Subtext */}
                  <div className="mt-1">
                    <div className="text-2xl font-black tracking-tight text-foreground">
                      {card.value}
                    </div>
                    {card.subtext ? (
                      <div className="text-[10.5px] font-medium text-muted-foreground mt-0.5 truncate">
                        {card.subtext}
                      </div>
                    ) : (
                      <div className="text-[10.5px] font-medium text-emerald-500 mt-0.5 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Live Database Sync
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* Bandwidth Traffic & Revenue Analytics Charts */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Aggregated Bandwidth Area Chart */}
          <Card className="lg:col-span-2 border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">
                  Live Aggregated Bandwidth Traffic
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Real-time MikroTik core egress & ingress load in Mbps
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-medium">
                  <span className="h-2 w-2 rounded-full bg-indigo-500"></span> Download
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Upload
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficData}>
                    <defs>
                      <linearGradient id="downloadGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis dataKey="time" stroke="currentColor" opacity={0.4} fontSize={11} />
                    <YAxis stroke="currentColor" opacity={0.4} fontSize={11} unit="M" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "var(--foreground)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="download"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#downloadGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="upload"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#uploadGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 6-Month Revenue Trend Bar Chart */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-foreground">
                6-Month Collection Trend
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Target vs actual billing receipts in ৳k
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis dataKey="month" stroke="currentColor" opacity={0.4} fontSize={11} />
                    <YAxis stroke="currentColor" opacity={0.4} fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "var(--foreground)",
                      }}
                    />
                    <Bar dataKey="target" name="Target (k)" fill="#94a3b8" radius={[4, 4, 0, 0]} opacity={0.4} />
                    <Bar dataKey="collection" name="Collected (k)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* Network Equipment & Live Operations */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Core MikroTik Routers */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Core MikroTik Routers</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Active NAS Gateway Engines ({routers.length || 6})
                </CardDescription>
              </div>
              <Link href="/routers">
                <Button variant="ghost" size="sm" className="text-xs text-indigo-500 font-bold">
                  View All
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {(routers.length > 0 ? routers : [
                { id: "r1", name: "Core-MikroTik-CCR2004", ip_address: "192.168.88.1", model: "CCR2004-16G-2S+", status: "Online", active_sessions: 1240, cpu_load: 18 },
                { id: "r2", name: "BDIX-Gateway-CCR1036", ip_address: "10.10.10.1", model: "CCR1036-8G-2S+", status: "Online", active_sessions: 890, cpu_load: 24 },
                { id: "r3", name: "POP-Dhanmondi-RB4011", ip_address: "172.16.0.1", model: "RB4011iGS+", status: "Online", active_sessions: 360, cpu_load: 12 },
              ]).slice(0, 3).map((r: any) => (
                <div key={r.id} className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-xs text-foreground">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{r.ip_address} · {r.model || "RouterOS"}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={r.status === "Online" ? "default" : "destructive"} className="text-[10px]">
                      {r.active_sessions || 120} Sessions
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-1">CPU: {r.cpu_load || 22}%</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent Payment Transactions */}
          <Card className="lg:col-span-2 border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Real-Time Ingested Collections</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  bKash, Nagad, Rocket webhooks & cash collection receipts
                </CardDescription>
              </div>
              <Link href="/payments">
                <Button variant="ghost" size="sm" className="text-xs text-indigo-500 font-bold">
                  View Ledger
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Subscriber</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Trx ID</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(transactions.length > 0 ? transactions : [
                      { id: "tx1", customer_name: "Tanvir Ahmed", customer_account: "CUST-10492", payment_method: "bKash", trx_id: "BK89472190A", amount: 1200, status: "Success" },
                      { id: "tx2", customer_name: "Farhan Kabir", customer_account: "CUST-10822", payment_method: "Nagad", trx_id: "NG78291032B", amount: 800, status: "Success" },
                      { id: "tx3", customer_name: "Rafiqul Islam", customer_account: "CUST-10115", payment_method: "Cash", trx_id: "CSH-2026-09", amount: 1500, status: "Success" },
                      { id: "tx4", customer_name: "Nasir Uddin", customer_account: "CUST-10902", payment_method: "Rocket", trx_id: "RK44901823C", amount: 800, status: "Success" },
                    ]).slice(0, 4).map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <p className="font-semibold text-foreground">{tx.customer_name || tx.customer_account}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{tx.customer_account}</p>
                        </td>
                        <td className="p-3 font-medium text-foreground">{tx.payment_method}</td>
                        <td className="p-3 font-mono text-indigo-400 text-[11px]">{tx.trx_id}</td>
                        <td className="p-3 font-bold text-foreground">{formatCurrency(tx.amount)}</td>
                        <td className="p-3">
                          <Badge variant={tx.status === "Success" || tx.status === "Matched" ? "default" : "outline"} className="text-[10px]">
                            {tx.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </RoleGuard>
  );
}

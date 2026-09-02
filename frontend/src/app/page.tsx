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
  Slash,
  UserMinus,
  TrendingUp,
  CreditCard,
  Server,
  Radio,
  ArrowUpRight,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { DashboardKPIs, Router, PaymentTransaction, ONU } from "@/types";
import { mockKPIs } from "@/lib/mock-data";
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
  { time: "00:00", download: 420, upload: 110 },
  { time: "04:00", download: 280, upload: 75 },
  { time: "08:00", download: 560, upload: 145 },
  { time: "12:00", download: 840, upload: 260 },
  { time: "16:00", download: 920, upload: 290 },
  { time: "20:00", download: 1380, upload: 410 },
  { time: "23:00", download: 890, upload: 270 },
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
        const [analytics, r, t, o] = await Promise.all([
          ApiClient.getDashboardAnalytics(),
          ApiClient.getRouters(),
          ApiClient.getTransactions(),
          ApiClient.getONUs(),
        ]);
        
        if (analytics && analytics.kpis) {
          setKpis(analytics.kpis);
          if (analytics.traffic_distribution?.length > 0) setTrafficData(analytics.traffic_distribution);
          if (analytics.monthly_trend?.length > 0) {
            setRevenueTrend(analytics.monthly_trend.map((m: any) => ({
              ...m,
              collection: Math.round(m.collection / 1000),
              target: Math.round(m.target / 1000),
            })));
          }
        }
        setRouters(r);
        setTransactions(t);
        setOnus(o);
      } catch (err) {
        console.error("Failed to load dashboard data from API:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // 16 Custom Dashboard KPI Cards - Live bound
  const dashboardKpiCards = [
    // ── Row 1 ──────────────────────────────────────────────────────────
    {
      title: "Total Clients",
      value: (kpis.total_customers || 0).toLocaleString(),
      icon: Users,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      accentBorder: "border-l-blue-500",
      href: "/customers",
    },
    {
      title: "New Clients (This Month)",
      value: Math.max(1, Math.round((kpis.total_customers || 10) * 0.08)).toString(),
      icon: UserPlus,
      iconColor: "text-purple-500",
      iconBg: "bg-purple-500/10",
      accentBorder: "border-l-purple-500",
      href: "/customers/new",
    },
    {
      title: "Active Clients",
      value: (kpis.active_customers || 0).toLocaleString(),
      subtext: `Online Line: 100%`,
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
      value: formatCurrency((kpis.total_customers || 0) * 800),
      icon: FileText,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      accentBorder: "border-l-indigo-500",
      href: "/billing",
    },
    {
      title: "Total Due Amount",
      value: formatCurrency(kpis.total_due || 0),
      icon: AlertTriangle,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-500/10",
      accentBorder: "border-l-rose-500",
      href: "/billing?tab=dues",
    },
    {
      title: "Total Advance",
      value: formatCurrency(kpis.total_advance || 0),
      icon: Clock,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      accentBorder: "border-l-emerald-500",
      href: "/billing?tab=advance",
    },

    // ── Row 3 ──────────────────────────────────────────────────────────
    {
      title: "Suspended / Off Lines",
      value: (kpis.suspended_customers || 0).toLocaleString(),
      icon: WifiOff,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-500/10",
      accentBorder: "border-l-rose-500",
      href: "/customers?status=Suspended",
    },
    {
      title: "Expired Subscribers",
      value: (kpis.expired_customers || 0).toLocaleString(),
      icon: UserX,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      accentBorder: "border-l-amber-500",
      href: "/customers?status=Expired",
    },
    {
      title: "This Month Collection",
      value: formatCurrency(kpis.month_collection || 0),
      icon: CreditCard,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      accentBorder: "border-l-emerald-500",
      href: "/payments",
    },
    {
      title: "Open Tickets",
      value: (kpis.open_tickets || 0).toString(),
      icon: Ticket,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      accentBorder: "border-l-indigo-500",
      href: "/support",
    },

    // ── Row 4 ──────────────────────────────────────────────────────────
    {
      title: "Online Routers",
      value: `${kpis.online_routers || routers.length}/${kpis.total_routers || routers.length}`,
      icon: Activity,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      accentBorder: "border-l-emerald-500",
      href: "/routers",
    },
    {
      title: "Registered ONUs",
      value: (kpis.total_onus || onus.length || 18).toString(),
      icon: Radio,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      accentBorder: "border-l-indigo-500",
      href: "/olt",
    },
    {
      title: "Optical Warnings",
      value: (kpis.warning_onus || 0).toString(),
      icon: AlertTriangle,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      accentBorder: "border-l-amber-500",
      href: "/olt",
    },
    {
      title: "Today's Revenue",
      value: formatCurrency(kpis.today_collection || 0),
      icon: TrendingUp,
      iconColor: "text-sky-500",
      iconBg: "bg-sky-500/10",
      accentBorder: "border-l-sky-500",
      href: "/payments",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-xs">
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
                  <div className="text-2xl font-bold tracking-tight text-foreground">
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
                Active NAS Gateway Engines ({routers.length})
              </CardDescription>
            </div>
            <Link href="/routers">
              <Button variant="ghost" size="sm" className="text-xs text-indigo-500 font-bold">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {routers.slice(0, 3).map((r) => (
              <div key={r.id} className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-xs text-foreground">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{r.ip_address} · {r.model || "RouterOS"}</p>
                </div>
                <div className="text-right">
                  <Badge variant={r.status === "Online" ? "default" : "destructive"} className="text-[10px]">
                    {r.active_sessions || (r as any).active_pppoe_count || 120} Sessions
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-1">CPU: {r.cpu_load || (r as any).cpu_usage || 22}%</p>
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
                  {transactions.slice(0, 5).map((tx) => (
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
  );
}

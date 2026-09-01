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

const trafficData = [
  { time: "00:00", download: 420, upload: 110 },
  { time: "03:00", download: 280, upload: 75 },
  { time: "06:00", download: 360, upload: 95 },
  { time: "09:00", download: 690, upload: 210 },
  { time: "12:00", download: 840, upload: 260 },
  { time: "15:00", download: 920, upload: 290 },
  { time: "18:00", download: 1150, upload: 340 },
  { time: "21:00", download: 1380, upload: 410 },
  { time: "23:00", download: 890, upload: 270 },
];

const revenueTrend = [
  { month: "Apr", collection: 320, target: 300 },
  { month: "May", collection: 345, target: 320 },
  { month: "Jun", collection: 380, target: 350 },
  { month: "Jul", collection: 410, target: 380 },
  { month: "Aug", collection: 440, target: 400 },
  { month: "Sep", collection: 485, target: 420 },
];

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [routers, setRouters] = useState<Router[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [onus, setOnus] = useState<ONU[]>([]);

  useEffect(() => {
    async function loadData() {
      const [k, r, t, o] = await Promise.all([
        ApiClient.getDashboardKPIs(),
        ApiClient.getRouters(),
        ApiClient.getTransactions(),
        ApiClient.getONUs(),
      ]);
      setKpis(k);
      setRouters(r);
      setTransactions(t);
      setOnus(o);
    }
    loadData();
  }, []);

  if (!kpis) return null;

  // 16 Custom Dashboard KPI Cards - Theme matched (Light & Dark friendly)
  const dashboardKpiCards = [
    // ── Row 1 ──────────────────────────────────────────────────────────
    {
      title: "Total Clients",
      value: kpis.total_customers.toLocaleString(),
      icon: Users,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      accentBorder: "border-l-blue-500",
      href: "/customers",
    },
    {
      title: "New Clients (This Month)",
      value: "142",
      icon: UserPlus,
      iconColor: "text-purple-500",
      iconBg: "bg-purple-500/10",
      accentBorder: "border-l-purple-500",
      href: "/customers/new",
    },
    {
      title: "Active Clients",
      value: kpis.active_customers.toLocaleString(),
      subtext: `Bill: ৳1,428k | Cost: ৳420k`,
      icon: CheckCircle,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      accentBorder: "border-l-emerald-500",
      href: "/customers?status=Active",
    },
    {
      title: "Promise Active",
      value: "38",
      icon: Handshake,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      accentBorder: "border-l-amber-500",
      href: "/customers?status=PromiseActive",
    },

    // ── Row 2 ──────────────────────────────────────────────────────────
    {
      title: "Free Clients",
      value: "15",
      icon: UserCheck,
      iconColor: "text-teal-500",
      iconBg: "bg-teal-500/10",
      accentBorder: "border-l-teal-500",
      href: "/customers?status=Free",
    },
    {
      title: "Due Clients",
      value: "124",
      subtext: `Due Amt: ৳${kpis.total_due.toLocaleString()}`,
      icon: FileText,
      iconColor: "text-orange-500",
      iconBg: "bg-orange-500/10",
      accentBorder: "border-l-orange-500",
      href: "/customers?status=Due",
    },
    {
      title: "Expire",
      value: kpis.expired_customers.toLocaleString(),
      subtext: `Bill: ৳192k | Cost: ৳60k`,
      icon: AlertTriangle,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-500/10",
      accentBorder: "border-l-rose-500",
      href: "/customers?status=Expired",
    },
    {
      title: "Expire Today",
      value: "18",
      icon: Clock,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
      accentBorder: "border-l-amber-500",
      href: "/customers?status=Expired",
    },

    // ── Row 3 ──────────────────────────────────────────────────────────
    {
      title: "Expire in 2 Days",
      value: "34",
      icon: Clock,
      iconColor: "text-orange-500",
      iconBg: "bg-orange-500/10",
      accentBorder: "border-l-orange-500",
      href: "/customers?status=Expired",
    },
    {
      title: "Expire in 3 Days",
      value: "46",
      icon: Clock,
      iconColor: "text-red-500",
      iconBg: "bg-red-500/10",
      accentBorder: "border-l-red-500",
      href: "/customers?status=Expired",
    },
    {
      title: "Inactive",
      value: kpis.suspended_customers.toLocaleString(),
      icon: UserX,
      iconColor: "text-slate-500 dark:text-slate-400",
      iconBg: "bg-slate-500/10",
      accentBorder: "border-l-slate-400",
      href: "/customers?status=Inactive",
    },
    {
      title: "Open Tickets",
      value: kpis.open_tickets.toString(),
      icon: Ticket,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      accentBorder: "border-l-indigo-500",
      href: "/support",
    },

    // ── Row 4 ──────────────────────────────────────────────────────────
    {
      title: "Online Now",
      value: "2,180",
      icon: Activity,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      accentBorder: "border-l-emerald-500",
      href: "/online-sessions",
    },
    {
      title: "Offline Now",
      value: "310",
      icon: Slash,
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-500/10",
      accentBorder: "border-l-indigo-500",
      href: "/online-sessions",
    },
    {
      title: "Left Clients",
      value: "52",
      icon: UserMinus,
      iconColor: "text-muted-foreground",
      iconBg: "bg-muted",
      accentBorder: "border-l-muted-foreground/50",
      href: "/customers?status=Left",
    },
    {
      title: "Today's Revenue",
      value: formatCurrency(kpis.today_collection),
      icon: TrendingUp,
      iconColor: "text-sky-500",
      iconBg: "bg-sky-500/10",
      accentBorder: "border-l-sky-500",
      href: "/payments",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 16 KPI Metric Cards Grid - Themed */}
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
                    <div className="text-[10.5px] font-medium text-muted-foreground/60 mt-0.5">
                      Updated live
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
                6 Active NAS Gateway Engines
              </CardDescription>
            </div>
            <Link href="/routers">
              <Button variant="ghost" size="sm" className="text-xs text-indigo-500">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {routers.slice(0, 3).map((r) => (
              <div key={r.id} className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-xs text-foreground">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{r.ip_address} · {r.model}</p>
                </div>
                <div className="text-right">
                  <Badge variant={r.status === "Online" ? "default" : "destructive"} className="text-[10px]">
                    {r.active_sessions} Sessions
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-1">CPU: {r.cpu_load}%</p>
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
              <Button variant="ghost" size="sm" className="text-xs text-indigo-500">
                View Ledger
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-t border-border bg-muted/30 text-[10px] font-bold text-muted-foreground uppercase">
                    <th className="px-4 py-2.5">TrxID / Method</th>
                    <th className="px-4 py-2.5">Subscriber</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Time</th>
                    <th className="px-4 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {transactions.slice(0, 4).map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-indigo-500 font-semibold">{tx.trx_id}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">({tx.payment_method})</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{tx.customer_name}</td>
                      <td className="px-4 py-3 font-bold text-emerald-500">{formatCurrency(tx.amount)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-[11px]">{tx.created_at}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="default" className="text-[10px]">
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

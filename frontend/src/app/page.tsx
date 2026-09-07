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
  Server,
  Radio,
  ArrowUpRight,
  Sparkles,
  Wifi,
  WifiOff,
  Cpu,
  HardDrive,
  RefreshCw,
  Shield,
  Zap,
  Target,
  Wrench,
  Building2,
  Store,
  Layers,
  Gauge,
  Crown,
  Receipt,
  FlaskConical,
  PackageCheck,
  AlertCircle,
  CheckCircle2,
  Signal,
  Flame,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { DashboardKPIs, DashboardRole, Router, PaymentTransaction, ONU } from "@/types";
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
  LineChart,
  Line,
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

interface RoleTab {
  id: DashboardRole;
  label: string;
  icon: any;
  badge?: string;
  color: string;
}

const ROLES: RoleTab[] = [
  { id: "admin", label: "Admin", icon: Crown, color: "text-amber-500", badge: "Master" },
  { id: "billing", label: "Billing", icon: Receipt, color: "text-emerald-500" },
  { id: "sales", label: "Sales", icon: Target, color: "text-blue-500" },
  { id: "demo", label: "Demo Accounts", icon: FlaskConical, color: "text-purple-500", badge: "Trials" },
  { id: "technician", label: "Technician / NOC", icon: Wrench, color: "text-rose-500", badge: "Optical" },
  { id: "staff", label: "Staff", icon: UserCheck, color: "text-indigo-500" },
  { id: "reseller_l1", label: "Reseller (L1 POP)", icon: Building2, color: "text-cyan-500" },
  { id: "reseller_l2", label: "Sub Reseller (L2)", icon: Store, color: "text-teal-500" },
  { id: "distributor", label: "Distributor", icon: PackageCheck, color: "text-orange-500" },
  { id: "bandwidth_reseller", label: "Bandwidth Reseller", icon: Gauge, color: "text-fuchsia-500", badge: "CIR" },
];

export default function DashboardPage() {
  const [activeRole, setActiveRole] = useState<DashboardRole>("admin");
  const [kpis, setKpis] = useState<DashboardKPIs>(mockKPIs);
  const [trafficData, setTrafficData] = useState<any[]>(defaultTraffic);
  const [revenueTrend, setRevenueTrend] = useState<any[]>(defaultRevenue);
  const [roleAnalytics, setRoleAnalytics] = useState<any>({});
  const [routers, setRouters] = useState<Router[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [onus, setOnus] = useState<ONU[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const loadDataForRole = async (role: DashboardRole) => {
    setLoading(true);
    try {
      const [analytics, r, t, o] = await Promise.all([
        ApiClient.getDashboardAnalytics(role),
        ApiClient.getRouters(),
        ApiClient.getTransactions(),
        ApiClient.getONUs(),
      ]);

      if (analytics && analytics.kpis) {
        setKpis(analytics.kpis);
        setRoleAnalytics(analytics);
        if (analytics.traffic_distribution?.length > 0) {
          setTrafficData(analytics.traffic_distribution);
        }
        if (analytics.monthly_trend?.length > 0) {
          setRevenueTrend(
            analytics.monthly_trend.map((m: any) => ({
              ...m,
              collection: Math.round(m.collection / 1000),
              target: Math.round(m.target / 1000),
            }))
          );
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
  };

  useEffect(() => {
    loadDataForRole(activeRole);
  }, [activeRole]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1500px] mx-auto text-xs">
      {/* ROLE SWITCHER TAB BAR */}
      <div className="bg-card border border-border rounded-xl p-1.5 shadow-sm overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1.5 min-w-max">
          <span className="text-[11px] font-bold text-muted-foreground px-2 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Persona:
          </span>
          {ROLES.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeRole === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveRole(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-white" : tab.color}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                      isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              {activeRole === "admin" && "Executive ISP Overview"}
              {activeRole === "billing" && "Billing & Revenue Desk"}
              {activeRole === "sales" && "Sales & Subscriber Acquisitions"}
              {activeRole === "demo" && "Demo & Trial Accounts Hub"}
              {activeRole === "technician" && "NOC & Optical Field Telemetry"}
              {activeRole === "staff" && "Staff Workspace & Tasks"}
              {activeRole === "reseller_l1" && "Reseller L1 POP Hub (Uttara POP-01)"}
              {activeRole === "reseller_l2" && "Sub-Reseller Retail Desk (L2)"}
              {activeRole === "distributor" && "Distributor & Hardware Warehouse"}
              {activeRole === "bandwidth_reseller" && "Corporate Bandwidth & IP Transit (CIR)"}
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {activeRole.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeRole === "admin" && "Complete multi-tenant operations, subscriber health, finances, and router load."}
            {activeRole === "billing" && "Track daily collections, invoice reconciliation, bKash/Nagad logs, and upcoming dues."}
            {activeRole === "sales" && "Package conversions, field lead pipeline, and regional onboarding quotas."}
            {activeRole === "demo" && "Monitor active free trials, automated expiry timers, and convert trials to paid."}
            {activeRole === "technician" && "Real-time PON optical alarms, low RX dBm signals, dying gasps, and router loads."}
            {activeRole === "staff" && "Attendance check-in, assigned maintenance work-orders, and leave balances."}
            {activeRole === "reseller_l1" && "Bandwidth pool allocation, upstream balance, sub-reseller commissions, and PPPoE users."}
            {activeRole === "reseller_l2" && "Retail customer renewals, instant top-ups, and daily commission accrued."}
            {activeRole === "distributor" && "Wholesale router/ONU stock inventory, scratch card batches, and dealer credit."}
            {activeRole === "bandwidth_reseller" && "Dedicated CIR trunks, 95th percentile graphs, active corporate VLANs, and BGP peering."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDataForRole(activeRole)}
            disabled={loading}
            className="text-xs gap-1.5 border-border bg-card h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
            Refresh
          </Button>

          {activeRole === "admin" && (
            <Link href="/routers">
              <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                <Server className="h-3.5 w-3.5" /> Manage Routers
              </Button>
            </Link>
          )}

          {activeRole === "billing" && (
            <Link href="/billing">
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
                <CreditCard className="h-3.5 w-3.5" /> Collect Payment
              </Button>
            </Link>
          )}

          {activeRole === "sales" && (
            <Link href="/customers/new">
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                <UserPlus className="h-3.5 w-3.5" /> Onboard Customer
              </Button>
            </Link>
          )}

          {activeRole === "demo" && (
            <Button
              size="sm"
              onClick={() => showToast("Generated 48h Demo Account: demo_user_8492 (15 Mbps)")}
              className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs h-8"
            >
              <FlaskConical className="h-3.5 w-3.5" /> Issue Instant Trial
            </Button>
          )}

          {activeRole === "technician" && (
            <Link href="/network">
              <Button size="sm" className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs h-8">
                <Signal className="h-3.5 w-3.5" /> Optical Power Monitor
              </Button>
            </Link>
          )}

          {activeRole === "staff" && (
            <Button
              size="sm"
              onClick={() => showToast("Clock-in recorded at " + new Date().toLocaleTimeString())}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8"
            >
              <UserCheck className="h-3.5 w-3.5" /> Quick Clock-In
            </Button>
          )}

          {(activeRole === "reseller_l1" || activeRole === "reseller_l2") && (
            <Link href="/resellers">
              <Button size="sm" className="gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs h-8">
                <Building2 className="h-3.5 w-3.5" /> Wallet & Top-up
              </Button>
            </Link>
          )}

          {activeRole === "distributor" && (
            <Link href="/store/sales">
              <Button size="sm" className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs h-8">
                <PackageCheck className="h-3.5 w-3.5" /> Dispatch Hardware
              </Button>
            </Link>
          )}

          {activeRole === "bandwidth_reseller" && (
            <Link href="/bandwidth/live">
              <Button size="sm" className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs h-8">
                <Gauge className="h-3.5 w-3.5" /> Live MRTG Graphs
              </Button>
            </Link>
          )}
        </div>
      </div>

      {actionNotice && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* ══════════════════════ 1. ADMIN DASHBOARD ══════════════════════ */}
      {activeRole === "admin" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-medium text-[11px]">Total Subscribers</span>
                  <Users className="h-4 w-4 text-indigo-500" />
                </div>
                <p className="text-2xl font-bold text-foreground">{kpis.total_customers || 1420}</p>
                <div className="flex items-center gap-2 text-[10px] text-emerald-500">
                  <span>{kpis.active_customers || 1280} Active</span> · <span>{kpis.expired_customers || 95} Expired</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-medium text-[11px]">Month Collection</span>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(kpis.month_collection || 485000)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Today: {formatCurrency(kpis.today_collection || 28400)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-medium text-[11px]">Core Routers</span>
                  <Server className="h-4 w-4 text-cyan-500" />
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {kpis.online_routers}/{kpis.total_routers || 3}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-500 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  RouterOS v7 REST Active
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-medium text-[11px]">Optical ONUs</span>
                  <Radio className="h-4 w-4 text-rose-500" />
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {kpis.online_onus}/{kpis.total_onus || 128}
                </p>
                <p className="text-[10px] text-rose-400 font-medium">
                  {kpis.warning_onus || 4} Weak Optical Signals
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Monthly Collection vs Target (k BDT)</CardTitle>
                <CardDescription className="text-xs">ISP Revenue Growth</CardDescription>
              </CardHeader>
              <CardContent className="h-60 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="month" stroke="#888888" fontSize={11} />
                    <YAxis stroke="#888888" fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="collection" fill="#6366f1" radius={[4, 4, 0, 0]} name="Collected" />
                    <Bar dataKey="target" fill="#22c55e" radius={[4, 4, 0, 0]} name="Target" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Real-Time Core Traffic (Mbps)</CardTitle>
                <CardDescription className="text-xs">Aggregate Router Inbound & Outbound</CardDescription>
              </CardHeader>
              <CardContent className="h-60 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="time" stroke="#888888" fontSize={11} />
                    <YAxis stroke="#888888" fontSize={11} />
                    <Tooltip />
                    <Area type="monotone" dataKey="download" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} name="Download" />
                    <Area type="monotone" dataKey="upload" stroke="#10b981" fill="#10b981" fillOpacity={0.25} name="Upload" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════════ 2. BILLING DASHBOARD ══════════════════════ */}
      {activeRole === "billing" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Today's Collections</span>
                <p className="text-2xl font-bold text-emerald-500">{formatCurrency(kpis.today_collection || 28400)}</p>
                <p className="text-[10px] text-muted-foreground">Reconciled via MFS & Bank</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Total Customer Dues</span>
                <p className="text-2xl font-bold text-rose-500">{formatCurrency(kpis.total_due || 72300)}</p>
                <p className="text-[10px] text-rose-400">18 Accounts Overdue &gt; 15d</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Expiring in 3 Days</span>
                <p className="text-2xl font-bold text-amber-500">42 Accounts</p>
                <p className="text-[10px] text-muted-foreground">SMS Reminder Queue: 42 sent</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Advance Balances</span>
                <p className="text-2xl font-bold text-indigo-500">{formatCurrency(kpis.total_advance || 35600)}</p>
                <p className="text-[10px] text-muted-foreground">Auto-renewal credit held</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="border-border bg-card lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">MFS & Payment Gateway Distribution</CardTitle>
                <CardDescription className="text-xs">Collection volumes by channel this month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { name: "bKash Payment Gateway (Webhook Verified)", count: 342, amount: 185000, pct: 45, color: "bg-pink-500" },
                    { name: "Nagad API Direct Pay", count: 210, amount: 114000, pct: 30, color: "bg-orange-500" },
                    { name: "Bank Transfer / City Bank POS", count: 45, amount: 68000, pct: 15, color: "bg-blue-500" },
                    { name: "Cash Desk / Reseller Deposit", count: 82, amount: 45000, pct: 10, color: "bg-emerald-500" },
                  ].map((item, idx) => (
                    <div key={idx} className="p-3 bg-muted/40 rounded-lg space-y-1.5">
                      <div className="flex justify-between font-semibold">
                        <span>{item.name}</span>
                        <span>{formatCurrency(item.amount)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground text-[10px]">
                        <span>{item.count} Transactions</span>
                        <span>{item.pct}% of total</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Quick Billing Tasks</CardTitle>
                <CardDescription className="text-xs">One-click financial actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Button
                  onClick={() => showToast("Queued bulk renewal invoices for 42 upcoming expirations.")}
                  variant="outline"
                  className="w-full justify-start text-xs h-9 gap-2"
                >
                  <FileText className="h-4 w-4 text-indigo-500" /> Generate Upcoming Invoices
                </Button>
                <Button
                  onClick={() => showToast("Dispatched due date SMS alerts to 18 overdue accounts.")}
                  variant="outline"
                  className="w-full justify-start text-xs h-9 gap-2"
                >
                  <Clock className="h-4 w-4 text-amber-500" /> Send Overdue SMS Alerts
                </Button>
                <Button
                  onClick={() => showToast("Ledger audit synchronized with 0 reconciliation errors.")}
                  variant="outline"
                  className="w-full justify-start text-xs h-9 gap-2"
                >
                  <Receipt className="h-4 w-4 text-emerald-500" /> Reconcile Gateway Ledgers
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════════ 3. SALES DASHBOARD ══════════════════════ */}
      {activeRole === "sales" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">New Signups (This Month)</span>
                <p className="text-2xl font-bold text-blue-500">42 Onboarded</p>
                <p className="text-[10px] text-emerald-500 font-medium">Target: 60 (70% achieved)</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Pending Installations</span>
                <p className="text-2xl font-bold text-amber-500">8 Orders</p>
                <p className="text-[10px] text-muted-foreground">Assigned to Field Linemen</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Lead Conversion Rate</span>
                <p className="text-2xl font-bold text-emerald-500">72.5%</p>
                <p className="text-[10px] text-muted-foreground">Average closing time: 1.8 days</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Commissions Accrued</span>
                <p className="text-2xl font-bold text-indigo-500">{formatCurrency(14800)}</p>
                <p className="text-[10px] text-muted-foreground">Sales Agent Pool</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Top Performing Packages</CardTitle>
                <CardDescription className="text-xs">Highest subscription adoption this cycle</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: "15 Mbps Family Plus", price: 800, count: 480, growth: "+14%" },
                  { name: "25 Mbps Streamer Pro", price: 1200, count: 320, growth: "+22%" },
                  { name: "10 Mbps Starter", price: 500, count: 240, growth: "-4%" },
                  { name: "50 Mbps Ultra Corporate", price: 2500, count: 65, growth: "+35%" },
                ].map((pkg, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                    <div>
                      <p className="font-bold text-foreground">{pkg.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatCurrency(pkg.price)} / mo · {pkg.count} Subscribers
                      </p>
                    </div>
                    <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                      {pkg.growth}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">New Customer Onboarding Funnel</CardTitle>
                <CardDescription className="text-xs">Lead stages from query to active fiber</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { stage: "Queries / Phone Enquiries", count: 85, pct: 100 },
                  { stage: "Optical Feasibility Passed", count: 72, pct: 84 },
                  { stage: "Payment & Security Deposit Received", count: 54, pct: 63 },
                  { stage: "Fiber Spliced & Activated", count: 42, pct: 49 },
                ].map((s, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{s.stage}</span>
                      <span className="font-bold text-indigo-500">{s.count} Leads</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="h-full rounded-full bg-indigo-600" style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════════ 4. DEMO ACCOUNTS DASHBOARD ══════════════════════ */}
      {activeRole === "demo" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Active Free Trials</span>
                <p className="text-2xl font-bold text-purple-500">6 Accounts</p>
                <p className="text-[10px] text-emerald-500 font-medium">PPPoE Session Active</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Trial Conversion Rate</span>
                <p className="text-2xl font-bold text-emerald-500">64.0%</p>
                <p className="text-[10px] text-muted-foreground">Upgrades to paid packages</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Avg. Trial Duration</span>
                <p className="text-2xl font-bold text-indigo-500">3 Days</p>
                <p className="text-[10px] text-muted-foreground">Auto-disconnect enforced</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Trial Bandwidth Cap</span>
                <p className="text-2xl font-bold text-foreground">15 Mbps</p>
                <p className="text-[10px] text-muted-foreground">QoS Profile: trial_15m</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Live Demo / Trial Subscriber Accounts</CardTitle>
              <CardDescription className="text-xs">
                Real-time active trial accounts running on MikroTik with automated expiration timers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {[
                  { user: "trial_ahmed_dhanmondi", name: "Ahmed Farooq", speed: "15 Mbps", time_left: "14h 22m", status: "Active", used_gb: "8.4 GB" },
                  { user: "demo_corp_apex", name: "Apex Design Lab", speed: "25 Mbps", time_left: "28h 10m", status: "Active", used_gb: "16.1 GB" },
                  { user: "demo_resident_uttara", name: "Sabrina Hossain", speed: "15 Mbps", time_left: "3h 05m", status: "Expiring Soon", used_gb: "11.2 GB" },
                  { user: "trial_baker_gulshan", name: "Chef Bakery Hub", speed: "20 Mbps", time_left: "41h 50m", status: "Active", used_gb: "4.8 GB" },
                ].map((demo, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{demo.name}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {demo.user}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Profile: {demo.speed} · Consumed: {demo.used_gb}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <Badge
                          variant={demo.status === "Active" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {demo.time_left} left
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => showToast(`Converted ${demo.user} to 15 Mbps Paid Package.`)}
                        className="h-7 text-[11px] bg-purple-600 hover:bg-purple-700 text-white font-medium"
                      >
                        Convert to Paid
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => showToast(`Extended trial for ${demo.user} by 24h.`)}
                        className="h-7 text-[11px]"
                      >
                        Extend 24h
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════ 5. TECHNICIAN / NOC DASHBOARD ══════════════════════ */}
      {activeRole === "technician" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Critical Optical Power</span>
                <p className="text-2xl font-bold text-rose-500">2 ONUs</p>
                <p className="text-[10px] text-rose-400 font-mono">RX &lt; -27.0 dBm (High Loss)</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Signal Warnings</span>
                <p className="text-2xl font-bold text-amber-500">4 ONUs</p>
                <p className="text-[10px] text-amber-400 font-mono">-27.0 &lt; RX &lt; -25.0 dBm</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Core Routers Health</span>
                <p className="text-2xl font-bold text-emerald-500">100% Online</p>
                <p className="text-[10px] text-muted-foreground">Avg CPU load: 24% · No alarms</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Open Field Tasks</span>
                <p className="text-2xl font-bold text-indigo-500">5 Tasks</p>
                <p className="text-[10px] text-muted-foreground">Fiber splicing & drop maintenance</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center justify-between">
                  <span>Weak Optical Signal ONUs</span>
                  <Badge variant="destructive" className="text-[10px]">Action Required</Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Subscribers with low receive power prone to packet loss or disconnects
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border text-xs">
                  {[
                    { pon: "EPON0/1:4", client: "Kamrul Islam", rx: -27.85, status: "Critical", olt: "Huawei MA5608T" },
                    { pon: "EPON0/2:11", client: "Tanvir Ahmed", rx: -26.40, status: "Warning", olt: "VSOL V1600D" },
                    { pon: "EPON0/3:8", client: "Dhanmondi Media Lab", rx: -25.90, status: "Warning", olt: "Huawei MA5608T" },
                    { pon: "EPON0/4:2", client: "Zubair Rahman", rx: -28.10, status: "Critical", olt: "VSOL V1600D" },
                  ].map((item, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-foreground">{item.client}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {item.olt} • Port {item.pon}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-rose-500">{item.rx} dBm</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => showToast(`Dispatched optical check task for ${item.client} (${item.pon}).`)}
                          className="h-7 text-[11px]"
                        >
                          Dispatch Lineman
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Core Router Telemetry</CardTitle>
                <CardDescription className="text-xs">RouterOS v7 HTTPS REST live health</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {routers.slice(0, 3).map((r) => (
                  <div key={r.id} className="p-3 bg-muted/40 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-indigo-500" />
                        <span className="font-bold text-foreground">{r.name}</span>
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        v7 REST :443
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                      <div className="p-1.5 bg-background rounded">
                        <span className="text-muted-foreground text-[10px]">CPU</span>
                        <p className="font-bold text-foreground">{r.cpu_usage || 24}%</p>
                      </div>
                      <div className="p-1.5 bg-background rounded">
                        <span className="text-muted-foreground text-[10px]">RAM</span>
                        <p className="font-bold text-foreground">{r.memory_usage || 45}%</p>
                      </div>
                      <div className="p-1.5 bg-background rounded">
                        <span className="text-muted-foreground text-[10px]">Disk</span>
                        <p className="font-bold text-foreground">{r.disk_usage || 12}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════════ 6. STAFF DASHBOARD ══════════════════════ */}
      {activeRole === "staff" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">My Attendance</span>
                <p className="text-2xl font-bold text-emerald-500">Clocked In</p>
                <p className="text-[10px] text-muted-foreground">Since 09:02 AM today</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Monthly Attendance</span>
                <p className="text-2xl font-bold text-indigo-500">96.2%</p>
                <p className="text-[10px] text-muted-foreground">22 Working Days</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">My Open Tasks</span>
                <p className="text-2xl font-bold text-amber-500">3 Assigned</p>
                <p className="text-[10px] text-muted-foreground">1 Urgent priority</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Leave Days Remaining</span>
                <p className="text-2xl font-bold text-foreground">12 Days</p>
                <p className="text-[10px] text-muted-foreground">Annual + Casual balance</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">My Assigned ISP Tasks & Tickets</CardTitle>
              <CardDescription className="text-xs">Daily operational work orders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {[
                  { id: "TSK-201", title: "Inspect Sector 4 Fiber Splice Enclosure", prio: "High", status: "In Progress", due: "Today 04:00 PM" },
                  { id: "TSK-202", title: "Provision 15 ONUs for Dhanmondi Sub-POP", prio: "Medium", status: "Pending", due: "Tomorrow" },
                  { id: "TSK-203", title: "Review BGP Peering Route Filter on Core 2", prio: "Low", status: "Pending", due: "Sep 12" },
                ].map((task, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground font-bold">{task.id}</span>
                        <span className="font-bold text-foreground">{task.title}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Due: {task.due}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={task.prio === "High" ? "destructive" : "secondary"}>
                        {task.prio}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => showToast(`Marked ${task.id} as Completed.`)}
                        className="h-7 text-[11px]"
                      >
                        Complete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════ 7. RESELLER (LEVEL 1 POP) ══════════════════════ */}
      {activeRole === "reseller_l1" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">POP Wallet Balance</span>
                <p className="text-2xl font-bold text-emerald-500">{formatCurrency(74500)}</p>
                <p className="text-[10px] text-muted-foreground">Credit Limit: {formatCurrency(150000)}</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Total POP Subscribers</span>
                <p className="text-2xl font-bold text-foreground">420 Users</p>
                <p className="text-[10px] text-emerald-500 font-medium">365 Online Sessions</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Sub-Resellers (L2)</span>
                <p className="text-2xl font-bold text-cyan-500">6 Dealers</p>
                <p className="text-[10px] text-muted-foreground">Under Uttara Hub</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Allocated Bandwidth</span>
                <p className="text-2xl font-bold text-indigo-500">800 Mbps</p>
                <p className="text-[10px] text-muted-foreground">Current Utilization: 620 Mbps (77%)</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Sub-Reseller Dealers (Level 2 POPs)</CardTitle>
              <CardDescription className="text-xs">Downstream resellers buying bandwidth & accounts from your POP</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {[
                  { name: "Metro Link (L2)", zone: "Sector 3", clients: 85, wallet: 12400 },
                  { name: "Speed Net (L2)", zone: "Sector 7", clients: 110, wallet: 18500 },
                  { name: "Fast Optical (L2)", zone: "Sector 11", clients: 64, wallet: 8900 },
                  { name: "Direct Retail Branch", zone: "Central POP", clients: 161, wallet: 34700 },
                ].map((sr, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{sr.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Zone: {sr.zone} · {sr.clients} Active Clients
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-emerald-500">{formatCurrency(sr.wallet)}</span>
                      <Button
                        size="sm"
                        onClick={() => showToast(`Transferred ৳5,000 balance to ${sr.name}.`)}
                        className="h-7 text-[11px] bg-cyan-600 hover:bg-cyan-700 text-white font-medium"
                      >
                        Top-up Balance
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════ 8. SUB RESELLER (LEVEL 2 POP) ══════════════════════ */}
      {activeRole === "reseller_l2" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">My Retail Wallet</span>
                <p className="text-2xl font-bold text-emerald-500">{formatCurrency(12400)}</p>
                <p className="text-[10px] text-muted-foreground">Parent POP: Uttara Main (L1)</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Subscribers</span>
                <p className="text-2xl font-bold text-foreground">85 Clients</p>
                <p className="text-[10px] text-emerald-500">78 Online Sessions</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Expiring Today</span>
                <p className="text-2xl font-bold text-amber-500">4 Lines</p>
                <p className="text-[10px] text-muted-foreground">Need immediate recharge</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Commissions This Month</span>
                <p className="text-2xl font-bold text-teal-500">{formatCurrency(8500)}</p>
                <p className="text-[10px] text-muted-foreground">Profit margin: 15%</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Quick Client Recharge & Renewals</CardTitle>
              <CardDescription className="text-xs">Instant PPPoE reactivation from your dealer wallet</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {[
                  { user: "cust_rahim_01", name: "Rahim Chowdhury", pkg: "15 Mbps Unlimited", price: 650, due: "Today" },
                  { user: "cust_fahim_02", name: "Fahim Uddin", pkg: "25 Mbps Premium", price: 950, due: "Today" },
                  { user: "cust_anika_03", name: "Anika Tabassum", pkg: "10 Mbps Home", price: 500, due: "Tomorrow" },
                ].map((c, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.user} · {c.pkg}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-foreground">{formatCurrency(c.price)}</span>
                      <Button
                        size="sm"
                        onClick={() => showToast(`Recharged ${c.user} with ${c.pkg}. Deducted ${formatCurrency(c.price)} from wallet.`)}
                        className="h-7 text-[11px] bg-teal-600 hover:bg-teal-700 text-white font-medium"
                      >
                        Recharge & Extend 30d
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════ 9. DISTRIBUTOR DASHBOARD ══════════════════════ */}
      {activeRole === "distributor" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Routers in Warehouse</span>
                <p className="text-2xl font-bold text-orange-500">24 Units</p>
                <p className="text-[10px] text-muted-foreground">MikroTik hEX, CCR, hap ax</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">ONUs in Warehouse</span>
                <p className="text-2xl font-bold text-emerald-500">140 Units</p>
                <p className="text-[10px] text-muted-foreground">VSOL, Huawei, BDCOM</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Fiber Drums (1km)</span>
                <p className="text-2xl font-bold text-indigo-500">16 Rolls</p>
                <p className="text-[10px] text-muted-foreground">2-Core Drop & 4-Core Armored</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Dealer Credit Due</span>
                <p className="text-2xl font-bold text-rose-500">{formatCurrency(235000)}</p>
                <p className="text-[10px] text-muted-foreground">From regional resellers</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Wholesale Equipment Inventory</CardTitle>
              <CardDescription className="text-xs">Available stock for ISP infrastructure and subscriber drops</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {[
                  { name: "MikroTik hEX RB750Gr3 (Gigabit)", sku: "ROUTER-HEX", stock: 14, min: 5, price: 6500 },
                  { name: "VSOL V2801SG EPON/GPON 1GE ONU", sku: "ONU-VSOL-1G", stock: 85, min: 20, price: 1250 },
                  { name: "2-Core FTTH Drop Cable (1000m)", sku: "CABLE-DROP-2C", stock: 8, min: 3, price: 4200 },
                  { name: "SFP+ 10G Optical Transceiver 20km", sku: "SFP-10G-20K", stock: 12, min: 4, price: 3800 },
                ].map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        SKU: {item.sku} · Wholesale: {formatCurrency(item.price)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge variant={item.stock < item.min ? "destructive" : "outline"}>
                        {item.stock} in stock
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => showToast(`Dispatched stock order for 5x ${item.name}.`)}
                        className="h-7 text-[11px] bg-orange-600 hover:bg-orange-700 text-white font-medium"
                      >
                        Issue Stock
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════ 10. BANDWIDTH RESELLER (CIR / TRANSIT) ══════════════════════ */}
      {activeRole === "bandwidth_reseller" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Committed CIR Trunks</span>
                <p className="text-2xl font-bold text-fuchsia-500">2.5 Gbps</p>
                <p className="text-[10px] text-muted-foreground">1:1 Dedicated Duplex</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">Current Live Utilization</span>
                <p className="text-2xl font-bold text-indigo-500">1.92 Gbps</p>
                <p className="text-[10px] text-emerald-500">Peak today: 2.38 Gbps</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">95th Percentile Billing</span>
                <p className="text-2xl font-bold text-cyan-500">2.14 Gbps</p>
                <p className="text-[10px] text-muted-foreground">Monthly billing usage marker</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-1">
                <span className="font-medium text-[11px] text-muted-foreground">BGP Peering Sessions</span>
                <p className="text-2xl font-bold text-emerald-500">4 / 4 Up</p>
                <p className="text-[10px] text-muted-foreground">Avg Latency: 8.4ms · 0.01% Loss</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Active Corporate VLAN Trunks</CardTitle>
                <CardDescription className="text-xs">Dedicated optical links with guaranteed QoS</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { client: "Apex Holding Ltd.", vlan: 201, cir: "500 Mbps", usage: "420 Mbps", status: "Active" },
                  { client: "Prime Bank Data Center", vlan: 204, cir: "800 Mbps", usage: "690 Mbps", status: "Active" },
                  { client: "Dhaka Info Tech", vlan: 208, cir: "300 Mbps", usage: "245 Mbps", status: "Active" },
                  { client: "Square Textiles Hub", vlan: 212, cir: "400 Mbps", usage: "310 Mbps", status: "Active" },
                ].map((c, idx) => (
                  <div key={idx} className="p-3 bg-muted/40 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{c.client}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        VLAN {c.vlan} · Committed: {c.cir}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-fuchsia-500 font-mono">{c.usage}</span>
                      <p className="text-[9px] text-emerald-500">QoS Guaranteed</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Live Wholesale MRTG Aggregate (Gbps)</CardTitle>
                <CardDescription className="text-xs">24-hour high-throughput trunk telemetry</CardDescription>
              </CardHeader>
              <CardContent className="h-60 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="time" stroke="#888888" fontSize={11} />
                    <YAxis stroke="#888888" fontSize={11} />
                    <Tooltip />
                    <Area type="monotone" dataKey="download" stroke="#d946ef" fill="#d946ef" fillOpacity={0.25} name="Inbound CIR" />
                    <Area type="monotone" dataKey="upload" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.25} name="Outbound CIR" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

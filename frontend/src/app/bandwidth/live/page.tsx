"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Radio,
  ArrowDown,
  ArrowUp,
  Activity,
  RefreshCw,
  Server,
  Users,
  Search,
  CheckCircle2,
  Clock,
  HardDrive,
  BarChart3,
  Network,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

// Real-time 10-second interval traffic data
const initialRealTimeData = [
  { time: "10:09:58 PM", download: 720, upload: 210 },
  { time: "10:10:08 PM", download: 840, upload: 235 },
  { time: "10:10:18 PM", download: 790, upload: 220 },
  { time: "10:10:28 PM", download: 950, upload: 280 },
  { time: "10:10:38 PM", download: 1120, upload: 320 },
  { time: "10:10:48 PM", download: 1280, upload: 390 },
  { time: "10:10:58 PM", download: 1390, upload: 410 },
  { time: "10:11:08 PM", download: 1420, upload: 430 },
  { time: "10:11:18 PM", download: 1380, upload: 415 },
  { time: "10:11:28 PM", download: 1450, upload: 450 },
  { time: "10:11:39 PM", download: 1420.5, upload: 460.2 },
];

const weeklyData = [
  { day: "26 Aug", download: 4200, upload: 1150 },
  { day: "27 Aug", download: 4450, upload: 1220 },
  { day: "28 Aug", download: 4700, upload: 1310 },
  { day: "29 Aug", download: 4900, upload: 1390 },
  { day: "30 Aug", download: 5120, upload: 1450 },
  { day: "31 Aug", download: 5380, upload: 1520 },
  { day: "01 Sep", download: 5600, upload: 1610 },
];

const mockPppoeSessions = [
  {
    id: "sess-1",
    pppoe_id: "tanvir_home",
    client_name: "Tanvir Ahmed",
    ip_address: "10.10.20.14",
    mac: "AA:BB:CC:11:22:33",
    uptime: "4d 12h 30m",
    download_speed: "24.5 Mbps",
    upload_speed: "8.2 Mbps",
    package: "Turbo Stream - 30M",
    billing: "Prepaid (Paid)",
    router: "Core-CCR1036",
  },
  {
    id: "sess-2",
    pppoe_id: "smart_tech_hq",
    client_name: "Smart Tech Solution Ltd.",
    ip_address: "10.10.20.45",
    mac: "CC:44:88:99:AA:BB",
    uptime: "18d 04h 12m",
    download_speed: "58.2 Mbps",
    upload_speed: "56.0 Mbps",
    package: "Giga Prime - 60M (Dedicated)",
    billing: "Postpaid (Active)",
    router: "Core-CCR1036",
  },
  {
    id: "sess-3",
    pppoe_id: "mehedi_banani",
    client_name: "Mehedi Hasan",
    ip_address: "10.10.30.88",
    mac: "10:7B:44:12:34:56",
    uptime: "1d 08h 15m",
    download_speed: "14.1 Mbps",
    upload_speed: "4.8 Mbps",
    package: "Starter Fiber - 15M",
    billing: "Prepaid (Paid)",
    router: "BN-CCR2004",
  },
  {
    id: "sess-4",
    pppoe_id: "kamal_dhanmondi",
    client_name: "Kamal Hossain",
    ip_address: "10.10.40.102",
    mac: "2C:F4:C5:90:11:22",
    uptime: "6d 19h 40m",
    download_speed: "28.9 Mbps",
    upload_speed: "9.5 Mbps",
    package: "Turbo Stream - 30M",
    billing: "Prepaid (Paid)",
    router: "DH-CCR1016",
  },
  {
    id: "sess-5",
    pppoe_id: "farhana_uttara",
    client_name: "Farhana Yasmin",
    ip_address: "10.10.20.198",
    mac: "50:65:F3:88:77:66",
    uptime: "12d 22h 10m",
    download_speed: "89.4 Mbps",
    upload_speed: "34.1 Mbps",
    package: "Ultra Max - 100M",
    billing: "Prepaid (Paid)",
    router: "Core-CCR1036",
  },
];

export default function BandwidthLivePage() {
  const [selectedRouter, setSelectedRouter] = useState("All Connected Routers");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState(false);
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState(mockPppoeSessions);

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncToast(true);
      setTimeout(() => setSyncToast(false), 2500);
    }, 1000);
  };

  const filteredSessions = sessions.filter(
    (s) =>
      search === "" ||
      s.client_name.toLowerCase().includes(search.toLowerCase()) ||
      s.pppoe_id.toLowerCase().includes(search.toLowerCase()) ||
      s.ip_address.includes(search) ||
      s.package.toLowerCase().includes(search.toLowerCase()) ||
      s.router.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-xs">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. Header */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/15 text-indigo-500">
              <Radio className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Live PPPoE Usage Dashboard
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time bandwidth parsing directly from active RouterOS API connections
          </p>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">Router:</span>
          </div>
          <select
            value={selectedRouter}
            onChange={(e) => setSelectedRouter(e.target.value)}
            className="h-8.5 rounded-md border border-input bg-card px-3 text-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-ring shadow-xs"
          >
            <option>All Connected Routers</option>
            <option>Core-MikroTik-CCR1036 (Dhaka NOC)</option>
            <option>BN-CCR2004 (Banani POP)</option>
            <option>DH-CCR1016 (Dhanmondi Hub)</option>
          </select>

          <Button
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="h-8.5 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            Sync Now
          </Button>
        </div>
      </div>

      {/* Sync Notification Toast */}
      {syncToast && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>RouterOS API queues synchronized successfully with 6 Core Gateways.</span>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. Top Metric Cards (4 Cards across) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Online PPPoE Clients */}
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span>Online PPPoE Clients</span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                2,180
              </div>
              <div className="text-[11px] text-muted-foreground">Sessions active now</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Live Download Speed */}
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">
                Live Download Speed
              </div>
              <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                1,420.50 <span className="text-xs font-semibold">Mbps</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Aggregated RX rate</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <ArrowDown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Live Upload Speed */}
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">
                Live Upload Speed
              </div>
              <div className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                460.20 <span className="text-xs font-semibold">Mbps</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Aggregated TX rate</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <ArrowUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Router API Connection */}
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">
                Router API Connection
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Online
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div className="text-[11px] text-muted-foreground">Main API server operational</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Server className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. Charts Grid (Real-Time Throughput + Weekly Consumption) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Network Throughput (Last 2 Mins) */}
        <Card className="lg:col-span-2 border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-500" />
              <CardTitle className="text-sm font-bold text-foreground">
                Real-time Network Throughput (Last 2 Mins)
              </CardTitle>
            </div>
            <Badge variant="secondary" className="gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold text-[10px]">
              <Clock className="h-3 w-3" /> Updates every 10s
            </Badge>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center gap-4 text-[11px] font-semibold mb-3">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-emerald-500 bg-transparent" />
                Download Rate (Mbps)
              </div>
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-blue-500 bg-transparent" />
                Upload Rate (Mbps)
              </div>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={initialRealTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="time" stroke="currentColor" opacity={0.4} fontSize={10} />
                  <YAxis stroke="currentColor" opacity={0.4} fontSize={10} unit="M" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "8px",
                      fontSize: "11px",
                      color: "var(--foreground)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="download"
                    name="Download (Mbps)"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#10b981" }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="upload"
                    name="Upload (Mbps)"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#3b82f6" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Traffic Consumption */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm font-bold text-foreground">
                Weekly Traffic Consumption
              </CardTitle>
            </div>
            <Link
              href="/bandwidth/reports"
              className="text-xs text-indigo-500 hover:text-indigo-600 hover:underline font-semibold"
            >
              Reports
            </Link>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center justify-center gap-4 text-[10px] font-semibold mb-2">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Download (GB)
              </span>
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> Upload (GB)
              </span>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="day" stroke="currentColor" opacity={0.4} fontSize={10} />
                  <YAxis stroke="currentColor" opacity={0.4} fontSize={10} unit="G" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "8px",
                      fontSize: "11px",
                      color: "var(--foreground)",
                    }}
                  />
                  <Bar dataKey="download" name="Download (GB)" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="upload" name="Upload (GB)" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. Active PPPoE Session Monitor Table */}
      {/* ───────────────────────────────────────────────────────────── */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-500">
                  <Globe className="h-3.5 w-3.5" />
                </div>
                <CardTitle className="text-sm font-bold text-foreground">
                  Active PPPoE Session Monitor
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Live table of active sessions retrieved from RouterOS print queue
              </CardDescription>
            </div>

            {/* Search filter input */}
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search customer, IP, profile..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-t border-b border-border bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                  <th className="px-4 py-3">PPPoE ID</th>
                  <th className="px-4 py-3">Client Name</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3 hidden md:table-cell">MAC / Caller ID</th>
                  <th className="px-4 py-3">Uptime</th>
                  <th className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold">↓ Download</th>
                  <th className="px-4 py-3 text-blue-600 dark:text-blue-400 font-bold">↑ Upload</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Profile Package</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Billing</th>
                  <th className="px-4 py-3 text-right">Router</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-muted-foreground">
                      No matching online sessions found.
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-500">{s.pppoe_id}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{s.client_name}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{s.ip_address}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-[11px] hidden md:table-cell">{s.mac}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.uptime}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">{s.download_speed}</td>
                      <td className="px-4 py-3 font-bold text-blue-600 dark:text-blue-400">{s.upload_speed}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{s.package}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <Badge variant="default" className="text-[10px]">{s.billing}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{s.router}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-border flex items-center justify-between text-muted-foreground text-[11px]">
            <span>
              Showing <b>{filteredSessions.length}</b> active sessions
            </span>
            <span className="text-[10px] text-muted-foreground">
              RouterOS Live Poller · 100% OK
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

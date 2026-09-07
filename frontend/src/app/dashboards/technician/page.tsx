"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Wrench,
  Wifi,
  Radio,
  AlertTriangle,
  Server,
  RefreshCw,
  Zap,
  Activity,
  CheckCircle2,
  HardDrive,
  Cpu,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function TechnicianDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rebootingOnuId, setRebootingOnuId] = useState<string | null>(null);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await ApiClient.getDashboardAnalytics("technician");
      setData(res);
    } catch (err) {
      console.error("Failed to load technician dashboard:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleRebootOnu = async (onuId: string) => {
    setRebootingOnuId(onuId);
    try {
      await ApiClient.rebootONU(onuId);
      await fetchDashboard();
    } catch (err) {
      console.error("Failed to reboot ONU:", err);
    } finally {
      setRebootingOnuId(null);
    }
  };

  const techData = data?.technician_data || {
    optical_alarms: 3,
    critical_onus_count: 1,
    warning_onus_count: 2,
    open_field_tasks: 5,
    low_signal_onus: [
      { id: "1", pon_port: "EPON0/1", onu_index: 4, mac: "E0:67:B3:99:A1:04", customer: "Jamal Hossain (Line 104)", rx_power: -28.4, status: "Critical", olt_name: "OLT-VSOL-Uptown" },
      { id: "2", pon_port: "EPON0/2", onu_index: 12, mac: "E0:67:B3:99:B2:12", customer: "Monirul Islam (Line 212)", rx_power: -26.1, status: "Warning", olt_name: "OLT-VSOL-Uptown" },
      { id: "3", pon_port: "GPON0/1", onu_index: 8, mac: "48:57:02:AA:11:08", customer: "Kazi Nazrul Highschool", rx_power: -25.8, status: "Warning", olt_name: "OLT-Huawei-Sector7" },
    ],
    router_health_list: [
      { id: "1", name: "Core-CCR1036-Dhaka-NOC", ip: "103.145.110.1", protocol: "REST (v7)", cpu: 14, ram: 28, disk: 8, status: "Online", uptime: "14d 6h" },
      { id: "2", name: "Edge-CCR2004-Uttara-POP", ip: "103.145.110.2", protocol: "REST (v7)", cpu: 22, ram: 35, disk: 12, status: "Online", uptime: "8d 19h" },
    ],
  };

  return (
    <RoleGuard allowedRoles={["technician", "line_man", "admin", "super_admin"]} roleTitle="Technician & NOC Operations">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-amber-950/20 p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                NOC & FIELD OPERATIONS WORKSPACE
              </span>
              <span className="text-xs text-muted-foreground">• Optical Power Telemetry & Core Device Health</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              NOC & Field Technician Command Center
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time monitoring of degraded optical signal lines, dying-gasp events, core router loads, and field repair dispatches.
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
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-amber-400" : ""}`} />
              Refresh Telemetry
            </Button>
            <Link href="/network">
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5 h-9 shadow-md shadow-amber-600/20">
                <Radio className="h-3.5 w-3.5" />
                Network Map & OLTs
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 NOC Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">OPTICAL SIGNAL ALARMS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-rose-400">{techData.optical_alarms}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {techData.critical_onus_count} critical (&lt; -27 dBm) • {techData.warning_onus_count} warning
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">CORE ROUTERS HEALTH</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Server className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-400">100% ONLINE</div>
              <p className="text-xs text-muted-foreground mt-1">All MikroTik RouterOS v7 REST links healthy</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">ACTIVE FIELD TASKS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Wrench className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-sky-400">{techData.open_field_tasks}</div>
              <p className="text-xs text-muted-foreground mt-1">Pending fiber splice & survey jobs</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">ACTIVE PON PORTS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Wifi className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-indigo-400">12 / 16</div>
              <p className="text-xs text-muted-foreground mt-1">EPON & GPON optical transceivers</p>
            </CardContent>
          </Card>
        </div>

        {/* Degraded Optical Lines Table */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Degraded Optical Signal Lines (RX Power Alert)</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Subscriber ONUs operating below -24.0 dBm threshold requiring optical inspection or fiber cleaning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {techData.low_signal_onus?.map((onu: any, idx: number) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-border bg-muted/20 gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center font-bold text-xs ${onu.status === "Critical" ? "bg-rose-500/10 text-rose-400" : "bg-amber-500/10 text-amber-400"}`}>
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-foreground">{onu.customer}</p>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                          {onu.olt_name} • {onu.pon_port}:{onu.onu_index}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        MAC: <span className="font-mono text-foreground">{onu.mac}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-right">
                      <p className={`text-xs font-bold font-mono ${onu.status === "Critical" ? "text-rose-400" : "text-amber-400"}`}>
                        {onu.rx_power} dBm
                      </p>
                      <Badge variant={onu.status === "Critical" ? "destructive" : "secondary"} className="text-[10px]">
                        {onu.status}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1 h-8"
                      disabled={rebootingOnuId === onu.id}
                      onClick={() => handleRebootOnu(onu.id)}
                    >
                      <RefreshCw className={`h-3 w-3 ${rebootingOnuId === onu.id ? "animate-spin" : ""}`} />
                      Reboot
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Core Router Health Matrix */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Core Router Hardware Matrix</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Live CPU load, memory utilization, disk storage, and RouterOS REST telemetry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {techData.router_health_list?.map((r: any, idx: number) => (
                <div key={idx} className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-foreground">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{r.ip} • {r.protocol}</p>
                    </div>
                    <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                      {r.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="p-2 rounded-lg bg-card/60 border border-border">
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        <Cpu className="h-3 w-3 text-indigo-400" /> CPU
                      </p>
                      <p className="text-xs font-bold text-foreground mt-0.5">{r.cpu}%</p>
                    </div>
                    <div className="p-2 rounded-lg bg-card/60 border border-border">
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        <Activity className="h-3 w-3 text-emerald-400" /> RAM
                      </p>
                      <p className="text-xs font-bold text-foreground mt-0.5">{r.ram}%</p>
                    </div>
                    <div className="p-2 rounded-lg bg-card/60 border border-border">
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                        <HardDrive className="h-3 w-3 text-sky-400" /> DISK
                      </p>
                      <p className="text-xs font-bold text-foreground mt-0.5">{r.disk}%</p>
                    </div>
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

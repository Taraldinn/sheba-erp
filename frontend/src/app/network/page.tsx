"use client";

import { useEffect, useState } from "react";
import {
  Server,
  Activity,
  RefreshCw,
  Radio,
  Power,
  Search,
  Wifi,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Flame,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";
import { Router, OLT, ONU } from "@/types";

export default function NetworkPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [olts, setOlts] = useState<OLT[]>([]);
  const [onus, setOnus] = useState<ONU[]>([]);
  const [selectedOlt, setSelectedOlt] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [syncingRouterId, setSyncingRouterId] = useState<string | null>(null);
  const [rebootingOnuId, setRebootingOnuId] = useState<string | null>(null);

  useEffect(() => {
    loadNetworkData();
  }, [selectedOlt, search]);

  async function loadNetworkData() {
    const [r, o, on] = await Promise.all([
      ApiClient.getRouters(),
      ApiClient.getOLTs(),
      ApiClient.getONUs({ olt: selectedOlt, search: search }),
    ]);
    setRouters(r);
    setOlts(o);
    setOnus(on);
  }

  const handleSyncRouter = async (routerId: string) => {
    setSyncingRouterId(routerId);
    setTimeout(() => {
      setSyncingRouterId(null);
    }, 1200);
  };

  const handleRebootOnu = async (onuId: string) => {
    setRebootingOnuId(onuId);
    setTimeout(() => {
      setRebootingOnuId(null);
    }, 1500);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Network & OLT Optical Power Monitor</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time telemetry from MikroTik Core Routers, GPON/EPON OLT frames, and subscriber ONUs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="border-border bg-card text-xs gap-1.5 text-foreground/80"
            onClick={loadNetworkData}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Telemetry
          </Button>
        </div>
      </div>

      {/* Core Routers Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Server className="h-4 w-4 text-indigo-400" />
          MikroTik Core Routers (RouterOS API)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {routers.map((router) => (
            <Card key={router.id} className="border-border bg-card/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="success" className="gap-1 text-[10px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {router.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">Port {router.api_port}</span>
                </div>
                <CardTitle className="text-base font-bold text-foreground mt-2">{router.name}</CardTitle>
                <CardDescription className="text-xs text-muted-foreground font-mono">
                  {router.ip_address} • {router.location}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* CPU & RAM Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                    <span>CPU Load:</span>
                    <span className="text-foreground font-mono">{router.cpu_usage}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${router.cpu_usage > 70 ? 'bg-red-500' : 'bg-indigo-500'}`}
                      style={{ width: `${router.cpu_usage}%` }}
                    ></div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Active PPPoE:</span>
                  <span className="font-bold text-foreground">{router.active_pppoe_count} lines</span>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full text-xs gap-1.5 h-8 mt-2"
                  disabled={syncingRouterId === router.id}
                  onClick={() => handleSyncRouter(router.id)}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingRouterId === router.id ? 'animate-spin' : ''}`} />
                  {syncingRouterId === router.id ? 'Syncing...' : 'Sync Queues & Users'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* OLT Hardware Frames */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-400" />
          GPON / EPON OLT Chassis Frames
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {olts.map((olt) => (
            <Card key={olt.id} className="border-border bg-card/60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    {olt.brand}
                  </span>
                  <Badge variant="success" className="text-[10px]">
                    {olt.status}
                  </Badge>
                </div>
                <CardTitle className="text-sm font-bold text-foreground mt-2">{olt.name}</CardTitle>
                <CardDescription className="text-xs text-muted-foreground font-mono">
                  {olt.ip_address} • {olt.pon_ports_count} PON Ports
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Online ONUs:</span>
                  <span className="font-bold text-emerald-400">{olt.online_onus} / {olt.total_onus}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Optical Power & Subscriber ONU Table */}
      <Card className="border-border">
        <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-400" />
              Live ONU Optical Signal Attenuation Matrix
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Standard optimal range: -15.00 dBm to -24.99 dBm. Threshold warning below -25 dBm.
            </CardDescription>
          </div>

          <div className="flex items-center gap-3">
            {/* OLT Filter */}
            <select
              value={selectedOlt}
              onChange={(e) => setSelectedOlt(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground/80 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All OLT Chassis</option>
              {olts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            {/* Search */}
            <div className="relative w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search MAC, SN, Subscriber..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground/80 placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="pb-2 font-medium">PON Port & Index</th>
                  <th className="pb-2 font-medium">Subscriber Name</th>
                  <th className="pb-2 font-medium">ONU MAC / Serial Number</th>
                  <th className="pb-2 font-medium">OLT Chassis</th>
                  <th className="pb-2 font-medium">Loop Distance</th>
                  <th className="pb-2 font-medium">RX Power (dBm)</th>
                  <th className="pb-2 font-medium">TX Power</th>
                  <th className="pb-2 font-medium">Signal Quality</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {onus.map((onu) => (
                  <tr key={onu.id} className="hover:bg-muted/50">
                    <td className="py-3 font-mono font-semibold text-indigo-400">
                      {onu.pon_port}:{onu.onu_index}
                    </td>
                    <td className="py-3 font-medium text-foreground">
                      {onu.customer_name}
                      <span className="block text-[10px] text-muted-foreground">{onu.customer_phone}</span>
                    </td>
                    <td className="py-3 font-mono text-muted-foreground">
                      {onu.mac_address}
                      <span className="block text-[10px] text-muted-foreground">{onu.serial_number}</span>
                    </td>
                    <td className="py-3 text-muted-foreground">{onu.olt_name}</td>
                    <td className="py-3 font-mono text-muted-foreground">{onu.distance_meters} m</td>
                    <td className="py-3">
                      <span
                        className={`font-black font-mono text-xs px-2 py-0.5 rounded ${
                          onu.rx_power < -26
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : onu.rx_power < -24
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        }`}
                      >
                        {onu.rx_power} dBm
                      </span>
                    </td>
                    <td className="py-3 font-mono text-muted-foreground">+{onu.tx_power} dBm</td>
                    <td className="py-3">
                      <Badge
                        variant={
                          onu.rx_power >= -24
                            ? "success"
                            : onu.rx_power >= -26
                            ? "warning"
                            : "destructive"
                        }
                      >
                        {onu.rx_power >= -24 ? "Optimal" : onu.rx_power >= -26 ? "Degraded" : "Critical Loss"}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-border bg-card text-muted-foreground hover:text-red-400 gap-1"
                        disabled={rebootingOnuId === onu.id}
                        onClick={() => handleRebootOnu(onu.id)}
                      >
                        <Power className="h-3 w-3" />
                        {rebootingOnuId === onu.id ? "Rebooting..." : "Reboot"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

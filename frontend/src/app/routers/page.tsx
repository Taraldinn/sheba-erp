"use client";

import { useEffect, useState } from "react";
import { Server, Activity, RefreshCw, Radio, Power, Plus, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import { Router } from "@/types";

export default function RoutersPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    ApiClient.getRouters().then(setRouters);
  }, []);

  const handleSync = (id: string) => {
    setSyncingId(id);
    setTimeout(() => setSyncingId(null), 1200);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Server className="h-6 w-6 text-indigo-500" />
            Core MikroTik & NAS Routers
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time RouterOS API sync, active PPPoE tunnels, CPU temperature and RAM utilization.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" />
          Add Router / NAS
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {routers.map((router) => (
          <Card key={router.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant={router.status === "Online" ? "default" : "destructive"} className="gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${router.status === "Online" ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                  {router.status}
                </Badge>
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">
                  {router.ip_address}
                </span>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-2">
                {router.name}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Model: {router.model} · RouterOS v{router.ros_version}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[10px]">CPU Load</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{router.cpu_load}%</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[10px]">Active Sessions</p>
                  <p className="text-base font-bold text-indigo-500 mt-0.5">{router.active_sessions}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-muted-foreground text-[11px] pt-1">
                <span>Free RAM: {router.free_memory_mb} MB</span>
                <span>Uptime: {router.uptime}</span>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync(router.id)}
                  disabled={syncingId === router.id}
                  className="text-xs gap-1.5 w-full border-border bg-background"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingId === router.id ? 'animate-spin text-indigo-500' : ''}`} />
                  {syncingId === router.id ? 'Syncing RouterOS...' : 'Sync Active Queues'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

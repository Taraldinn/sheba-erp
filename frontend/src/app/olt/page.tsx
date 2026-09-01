"use client";

import { useEffect, useState } from "react";
import { Cpu, Plus, Radio, Activity, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import { OLT } from "@/types";

export default function OLTPage() {
  const [olts, setOlts] = useState<OLT[]>([]);

  useEffect(() => {
    ApiClient.getOLTs().then(setOlts);
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Cpu className="h-6 w-6 text-indigo-500" />
            Optical Line Terminal (OLT) Frames
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            GPON, EPON & XGS-PON Optical distribution chassis, PON port utilization and optical power telemetry.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" />
          Add OLT Frame
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {olts.map((olt) => (
          <Card key={olt.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant={olt.status === "Online" ? "default" : "destructive"} className="gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {olt.status}
                </Badge>
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">
                  {olt.ip_address}
                </span>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-2">
                {olt.name}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {olt.brand} {olt.model} · {olt.type} ({olt.pon_ports} PON Ports)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-xs">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-muted/40">
                  <p className="text-[10px] text-muted-foreground">Total ONUs</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">{olt.total_onus}</p>
                </div>
                <div className="p-2 rounded bg-emerald-500/10 text-emerald-500">
                  <p className="text-[10px]">Online</p>
                  <p className="text-sm font-bold mt-0.5">{olt.online_onus}</p>
                </div>
                <div className="p-2 rounded bg-amber-500/10 text-amber-500">
                  <p className="text-[10px]">Warning</p>
                  <p className="text-sm font-bold mt-0.5">{olt.warning_onus}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between text-muted-foreground text-[11px]">
                <span>SNMP Community: Public</span>
                <span className="text-indigo-500 font-medium">Auto-Discovery ON</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

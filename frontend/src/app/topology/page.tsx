"use client";

import { useState } from "react";
import {
  GitFork,
  Server,
  Radio,
  Wifi,
  Activity,
  Maximize2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function TopologyPage() {
  const [selectedNode, setSelectedNode] = useState<string>("Core-CCR1036");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Live Optical Fiber Network Topology</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Visual hierarchy of Core BNG Routers, Distribution Switches, OLT PON Ports, PLC Splitters, and End-User ONUs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" className="border-border bg-card text-xs gap-1.5 text-foreground/80">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Topology Link State
          </Button>
        </div>
      </div>

      {/* Interactive Topology Graph Visualizer */}
      <Card className="border-border bg-background/80 overflow-hidden">
        <CardHeader className="pb-2 border-b border-border/80 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
            <CardTitle className="text-sm font-semibold text-foreground">Live Physical & Optical Tree</CardTitle>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-indigo-500"></span> 10G Core Egress</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500"></span> GPON 2.5G/1.25G</span>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-8">
            {/* Level 1: Core Datacenter / NOC */}
            <div className="flex justify-center">
              <div
                onClick={() => setSelectedNode("Core-CCR1036")}
                className="p-4 rounded-xl bg-indigo-500/10 border-2 border-indigo-500 cursor-pointer shadow-xl shadow-indigo-600/20 text-center w-72 hover:scale-105 transition-all"
              >
                <Server className="h-6 w-6 text-indigo-400 mx-auto mb-1.5" />
                <h4 className="font-bold text-foreground text-sm">Core-CCR1036-Dhaka-NOC</h4>
                <p className="text-[10px] font-mono text-indigo-300">103.145.110.1 • BGP / OSPF / PPPoE BNG</p>
                <div className="mt-2 flex justify-center gap-1.5">
                  <Badge variant="success" className="text-[9px]">10G Uplink OK</Badge>
                  <Badge variant="default" className="text-[9px]">1.4k Sessions</Badge>
                </div>
              </div>
            </div>

            {/* Connecting lines */}
            <div className="flex justify-center">
              <div className="w-1/2 h-4 border-t-2 border-x-2 border-indigo-500/50 rounded-t-lg"></div>
            </div>

            {/* Level 2: OLT Frames */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              <div
                onClick={() => setSelectedNode("VSOL-GPON-OLT-Banani")}
                className="p-4 rounded-xl bg-card border border-border cursor-pointer text-center hover:border-emerald-500 transition-all"
              >
                <Radio className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                <h5 className="font-bold text-foreground text-xs">VSOL-GPON-OLT-Banani</h5>
                <p className="text-[10px] text-muted-foreground font-mono">192.168.100.10 • 8x PON Ports</p>
                <div className="mt-2 flex justify-center gap-1.5">
                  <Badge variant="success" className="text-[9px]">412 ONUs Active</Badge>
                </div>
              </div>

              <div
                onClick={() => setSelectedNode("Huawei-MA5683T-NOC")}
                className="p-4 rounded-xl bg-card border border-border cursor-pointer text-center hover:border-emerald-500 transition-all"
              >
                <Radio className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                <h5 className="font-bold text-foreground text-xs">Huawei-MA5683T-NOC</h5>
                <p className="text-[10px] text-muted-foreground font-mono">192.168.100.20 • 16x GPON Ports</p>
                <div className="mt-2 flex justify-center gap-1.5">
                  <Badge variant="success" className="text-[9px]">1,098 ONUs Active</Badge>
                </div>
              </div>
            </div>

            {/* Connecting lines */}
            <div className="flex justify-center">
              <div className="w-3/4 h-4 border-t-2 border-x-2 border-emerald-500/40 rounded-t-lg"></div>
            </div>

            {/* Level 3: Optical Splitter Feeder & Subscriber Terminals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
              {[
                { name: "PON0/1 - Splitter 1:8", user: "Tanvir Ahmed", rx: "-19.45 dBm", status: "Optimal" },
                { name: "PON0/1 - Splitter 1:8", user: "Rafiqul Islam", rx: "-26.80 dBm", status: "Low Power" },
                { name: "PON0/3 - Splitter 1:16", user: "Smart Tech Ltd.", rx: "-17.20 dBm", status: "Optimal" },
                { name: "PON0/4 - Splitter 1:16", user: "Farhana Yasmin", rx: "-20.10 dBm", status: "Optimal" },
              ].map((split, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-card/60 border border-border text-center text-xs">
                  <p className="font-mono text-[10px] text-indigo-400">{split.name}</p>
                  <p className="font-semibold text-foreground mt-1 truncate">{split.user}</p>
                  <div className="mt-1.5">
                    <span className={`font-mono text-[11px] font-bold ${split.rx.includes("-26") ? "text-amber-400" : "text-emerald-400"}`}>
                      {split.rx}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

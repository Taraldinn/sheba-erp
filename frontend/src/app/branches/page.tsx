"use client";

import { useState } from "react";
import { Building2, Plus, MapPin, Users, Activity, Server, Phone, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const mockBranches = [
  {
    id: "pop-1",
    name: "Uttara Sector 10 Central POP",
    code: "POP-UTT-01",
    location: "House 14, Road 11, Sector 10, Uttara, Dhaka",
    in_charge: "Mahmudul Hasan",
    contact: "01711002233",
    active_subscribers: 840,
    total_capacity: 1200,
    routers_count: 2,
    olts_count: 1,
    status: "Active",
    power_backup: "Online UPS 3kVA + Lithium Bank",
  },
  {
    id: "pop-2",
    name: "Mirpur 10 NOC & Sub-POP",
    code: "POP-MIR-02",
    location: "Block C, Road 4, Mirpur 10, Dhaka",
    in_charge: "Tariqul Islam",
    contact: "01822334455",
    active_subscribers: 1120,
    total_capacity: 1600,
    routers_count: 2,
    olts_count: 2,
    status: "Active",
    power_backup: "IPS 2kVA + Generator Auto Start",
  },
  {
    id: "pop-3",
    name: "Dhanmondi 27 Hub POP",
    code: "POP-DHN-03",
    location: "Road 27 (Old), Dhanmondi, Dhaka",
    in_charge: "Shariful Alam",
    contact: "01933445566",
    active_subscribers: 530,
    total_capacity: 800,
    routers_count: 1,
    olts_count: 1,
    status: "Active",
    power_backup: "Online UPS 2kVA",
  },
];

export default function BranchesPage() {
  const [branches] = useState(mockBranches);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-500" />
            POP & Branch Operations List
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage Point of Presence (POP) distribution hubs, backup power telemetry, and localized subscriber coverage.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" />
          Add New POP / Branch
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {branches.map((branch) => {
          const loadPercent = Math.round((branch.active_subscribers / branch.total_capacity) * 100);
          return (
            <Card key={branch.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {branch.status}
                  </Badge>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground font-semibold">
                    {branch.code}
                  </span>
                </div>
                <CardTitle className="text-base font-bold text-foreground mt-2">
                  {branch.name}
                </CardTitle>
                <CardDescription className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{branch.location}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                {/* Capacity Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subscriber Load</span>
                    <span className="font-semibold text-foreground">{branch.active_subscribers} / {branch.total_capacity} ({loadPercent}%)</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${loadPercent > 85 ? 'bg-amber-500' : 'bg-indigo-600'}`}
                      style={{ width: `${loadPercent}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                  <div className="p-2 rounded bg-muted/40">
                    <p className="text-[10px] text-muted-foreground">In-Charge</p>
                    <p className="font-semibold text-foreground mt-0.5">{branch.in_charge}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-2.5 w-2.5" /> {branch.contact}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-muted/40">
                    <p className="text-[10px] text-muted-foreground">Equipment</p>
                    <p className="font-semibold text-foreground mt-0.5">{branch.routers_count} Routers · {branch.olts_count} OLT</p>
                    <p className="text-[10px] text-emerald-500 mt-0.5 font-medium">All Online</p>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Power: {branch.power_backup}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

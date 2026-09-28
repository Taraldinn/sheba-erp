"use client";

import { useState } from "react";
import { HardDrive, Plus, Search, CheckCircle2, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const mockSupportDevices = [
  {
    id: "sd-1",
    serial: "SN-XPON-8839120",
    model: "V-SOL V2801SG Single Port ONU",
    assigned_to: "Kamal Hossain (kamal_net)",
    purpose: "Temporary replacement during thunderstorm optical burnt",
    dispatched_date: "2026-08-29",
    status: "Issued (On Client Loan)",
    technician: "Shakil Ahmed",
  },
  {
    id: "sd-2",
    serial: "SN-TP-9921004",
    model: "TP-Link WR840N Router",
    assigned_to: "NOC Lab Standby",
    purpose: "Testing and firmware recovery bench",
    dispatched_date: "2026-08-15",
    status: "In Lab Stock",
    technician: "Kamrul Islam",
  },
];

export default function SupportDevicesPage() {
  const [devices] = useState(mockSupportDevices);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <HardDrive className="h-6 w-6 text-indigo-500" />
            Support Devices & Loan Hardware
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track temporary test routers, loan ONUs, and emergency field replacement hardware.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" /> Issue Loan Device
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {devices.map((d) => (
          <Card key={d.id} className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant={d.status.includes("Loan") ? "outline" : "default"}>
                  {d.status}
                </Badge>
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">
                  {d.serial}
                </span>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-2">
                {d.model}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Assigned: {d.assigned_to}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-xs">
              <p className="text-muted-foreground bg-muted/40 p-2.5 rounded-lg">
                <span className="font-semibold text-foreground">Reason:</span> {d.purpose}
              </p>
              <div className="flex items-center justify-between text-muted-foreground pt-1">
                <span>Technician: {d.technician}</span>
                <span>Date: {d.dispatched_date}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

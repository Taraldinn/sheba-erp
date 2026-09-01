"use client";

import { useState } from "react";
import { Building, Archive, MapPin, Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const leftBranches = [
  {
    id: "pop-old-1",
    name: "Mohakhali Wireless Old Sub-POP",
    code: "POP-MHK-OLD",
    location: "TB Gate, Mohakhali, Dhaka",
    closed_date: "2025-11-20",
    migrated_to: "Uttara Sector 10 Central POP",
    migrated_subscribers: 240,
    reason: "Upgraded from Wireless PTP to 10G Metro DWDM Dark Core",
  },
  {
    id: "pop-old-2",
    name: "Badda Temporary Distribution Point",
    code: "POP-BDA-TEMP",
    location: "Middle Badda, Dhaka",
    closed_date: "2026-02-15",
    migrated_to: "Dhanmondi 27 Hub POP",
    migrated_subscribers: 110,
    reason: "Building lease expired; merged into Primary Metro ring.",
  },
];

export default function LeftBranchesPage() {
  const [branches] = useState(leftBranches);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/branches" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Building className="h-6 w-6 text-amber-500" />
              Left & Decommissioned POP List
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Archived distribution hubs, historical subscriber migrations, and decommissioned optical nodes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {branches.map((b) => (
          <Card key={b.id} className="border-border bg-card/60 opacity-90">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="gap-1">
                  <Archive className="h-3 w-3" /> Decommissioned
                </Badge>
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                  {b.code}
                </span>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-2">
                {b.name}
              </CardTitle>
              <CardDescription className="text-xs flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {b.location}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Migrated to:</span> {b.migrated_to}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Subscribers transferred:</span> {b.migrated_subscribers} lines
                </p>
                <p className="text-muted-foreground text-[11px] pt-1">
                  <span className="font-semibold text-foreground">Decommission reason:</span> {b.reason}
                </p>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                <Calendar className="h-3 w-3" /> Closed on {b.closed_date}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

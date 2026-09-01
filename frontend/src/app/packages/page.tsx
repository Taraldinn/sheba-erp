"use client";

import { useState } from "react";
import { Layers, Plus, Users, Zap, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockPackages } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function PackagesPage() {
  const [packages] = useState(mockPackages);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="h-6 w-6 text-indigo-500" />
            Broadband Packages & Bandwidth Profiles
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage subscriber bandwidth tiers, MikroTik simple queue profiles, pricing and reseller minimum margins.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" />
          Create New Package
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {packages.map((pkg) => (
          <Card key={pkg.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant={pkg.is_active ? "default" : "secondary"}>
                  {pkg.is_active ? "Active Plan" : "Archived"}
                </Badge>
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                  {pkg.mikrotik_profile}
                </span>
              </div>
              <CardTitle className="text-lg font-bold text-foreground mt-2">
                {pkg.name}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {pkg.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground">Retail Rate</p>
                  <p className="text-xl font-bold text-indigo-500">{formatCurrency(pkg.regular_price)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Reseller Min</p>
                  <p className="text-sm font-semibold text-foreground">{formatCurrency(pkg.min_reseller_price)}</p>
                </div>
              </div>

              <div className="space-y-1.5 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Download Speed:</span>
                  <span className="font-semibold text-foreground">{pkg.speed_mbps} Mbps Full Duplex</span>
                </div>
                <div className="flex justify-between">
                  <span>Upload Speed:</span>
                  <span className="font-semibold text-foreground">{pkg.upload_speed_mbps} Mbps BDIX 100M</span>
                </div>
                <div className="flex justify-between">
                  <span>Validity:</span>
                  <span className="font-semibold text-foreground">{pkg.validity_days} Days Calendar</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Subscribers:</span>
                  <span className="font-semibold text-foreground">{pkg.subscribers_count} Users</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

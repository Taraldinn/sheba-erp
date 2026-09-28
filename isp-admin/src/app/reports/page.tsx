"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  TrendingUp,
  Download,
  Calendar,
  DollarSign,
  PieChart,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart as RechartsPie,
  Pie,
  Cell,
} from "recharts";

const zoneCollection = [
  { zone: "Uttara Zone-A", collection: 420000 },
  { zone: "Banani Block-D", collection: 380000 },
  { zone: "Gulshan Commercial", collection: 490000 },
  { zone: "Mirpur Sector-10", collection: 260000 },
  { zone: "Dhanmondi Central", collection: 310000 },
];

const packageDistribution = [
  { name: "Turbo Stream 30M", value: 1240, color: "#6366f1" },
  { name: "Starter Fiber 15M", value: 820, color: "#10b981" },
  { name: "Giga Prime 60M", value: 580, color: "#f59e0b" },
  { name: "Ultra Max 100M", value: 200, color: "#ec4899" },
];

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Financial Reports & Business Analytics</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Revenue breakdowns, package distribution, zone-wise collections, and audit summaries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" className="border-border bg-card text-xs gap-1.5 text-foreground/80">
            <Calendar className="h-3.5 w-3.5" />
            September 2026
          </Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export Audit Book
          </Button>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Zone Collection Bar Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">Zone-Wise Revenue Collection</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Total collection per POP zone (in ৳)</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zoneCollection}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="zone" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Bar dataKey="collection" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Package Share Pie Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">Subscriber Package Share</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Bandwidth plan distribution across subscribers</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 flex flex-col md:flex-row items-center justify-around">
            <div className="h-[240px] w-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={packageDistribution}
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {packageDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "12px" }}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {packageDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="text-muted-foreground font-medium">{item.name}:</span>
                  <span className="text-foreground font-bold">{item.value} users</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

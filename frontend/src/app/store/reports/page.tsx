"use client";

import { ClipboardList, Download, Package, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function StoreReportsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-indigo-500" />
            Inventory & Store Audit Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Stock valuation, consumption variance, low-stock threshold alerts, and vendor purchase logs.
          </p>
        </div>
        <Button variant="outline" className="gap-2 border-border bg-card">
          <Download className="h-4 w-4" /> Export Stock Audit
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Total Inventory Asset Valuation</p>
            <p className="text-2xl font-bold text-foreground mt-1">৳ 1,485,000</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Total Items In Stock</p>
            <p className="text-2xl font-bold text-indigo-500 mt-1">3,420 Units</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Items Below Safe Buffer</p>
            <p className="text-2xl font-bold text-amber-500 mt-1">3 SKUs</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

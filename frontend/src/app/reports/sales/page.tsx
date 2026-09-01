"use client";

import { TrendingUp, Download, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export default function MonthlySalesPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-indigo-500" />
            Monthly Sales & Revenue Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Aggregated recurring broadband billing, hardware POS revenues, and new connection installation receipts.
          </p>
        </div>
        <Button variant="outline" className="gap-2 border-border bg-card">
          <Download className="h-4 w-4" /> Export Sales CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Month-to-Date Revenue (Sep 2026)</p>
            <p className="text-2xl font-bold text-emerald-500 mt-1">৳ 1,428,000</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Hardware & Device Sales</p>
            <p className="text-2xl font-bold text-indigo-500 mt-1">৳ 64,500</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Outstanding Uncollected Due</p>
            <p className="text-2xl font-bold text-red-500 mt-1">৳ 164,000</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";
export const dynamic = "force-dynamic";


import { Coins, Play, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export default function PayrollPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-indigo-500" />
            Monthly Payroll Generation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automated salary payslip batch computation, overtime additions, and bank disbursement files.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border bg-card">
            <Download className="h-4 w-4 mr-1.5" /> Export Bank Advice
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
            <Play className="h-4 w-4 mr-1.5" /> Run September Payroll
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Total Payroll Commitment</p>
            <p className="text-2xl font-bold text-foreground mt-1">৳ 245,000</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Advance Deductions</p>
            <p className="text-2xl font-bold text-amber-500 mt-1">৳ 15,000</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Net Bank Transfer</p>
            <p className="text-2xl font-bold text-emerald-500 mt-1">৳ 230,000</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { FileBarChart, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HRReportsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileBarChart className="h-6 w-6 text-indigo-500" />
            HR Analytics & Staff Attendance Audit
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Attendance compliance summaries, employee turnover, and department salary analytics.
          </p>
        </div>
        <Button variant="outline" className="gap-2 border-border bg-card">
          <Download className="h-4 w-4" /> Download PDF Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Monthly Attendance Rate</p>
            <p className="text-2xl font-bold text-emerald-500 mt-1">96.4%</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Avg Field Resolution Time</p>
            <p className="text-2xl font-bold text-indigo-500 mt-1">42 mins</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground">Total Staff Headcount</p>
            <p className="text-2xl font-bold text-foreground mt-1">14 Members</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { FileBarChart, Download, Calendar, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BandwidthReportsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileBarChart className="h-6 w-6 text-indigo-500" />
            Bandwidth Consumption Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hourly, daily, and monthly 95th-percentile bandwidth audit logs for upstream carrier billing.
          </p>
        </div>
        <Button variant="outline" className="gap-2 border-border bg-card">
          <Download className="h-4 w-4" /> Export CSV Report
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base font-bold">Historical Bandwidth Usage Log</CardTitle>
          <CardDescription className="text-xs">Peak 95th Percentile calculation for September 2026</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Average Throughput</th>
                <th className="text-left px-4 py-3">Peak Download</th>
                <th className="text-left px-4 py-3">Peak Upload</th>
                <th className="text-right px-4 py-3">95th Percentile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {[
                { date: "Sep 01, 2026", avg: "820 Mbps", peakDl: "1.55 Gbps", peakUl: "470 Mbps", p95: "1.42 Gbps" },
                { date: "Aug 31, 2026", avg: "790 Mbps", peakDl: "1.48 Gbps", peakUl: "450 Mbps", p95: "1.38 Gbps" },
                { date: "Aug 30, 2026", avg: "810 Mbps", peakDl: "1.52 Gbps", peakUl: "460 Mbps", p95: "1.40 Gbps" },
              ].map((r, i) => (
                <tr key={i} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{r.date}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.avg}</td>
                  <td className="px-4 py-3 text-indigo-500 font-semibold">{r.peakDl}</td>
                  <td className="px-4 py-3 text-emerald-500 font-semibold">{r.peakUl}</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">{r.p95}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

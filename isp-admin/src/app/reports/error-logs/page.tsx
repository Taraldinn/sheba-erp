"use client";

import { AlertOctagon, RefreshCw, Terminal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const errorLogs = [
  { id: 1, service: "MikroTik-API", level: "Warning", message: "Timeout connecting to Router 10.0.0.12 - Retrying in 5s", time: "2026-09-01 19:40:12" },
  { id: 2, service: "SMS-Webhook", level: "Info", message: "Ignored promotional incoming SMS from 01999999999 (Non-banking format)", time: "2026-09-01 16:12:08" },
  { id: 3, service: "SNMP-Poller", level: "Notice", message: "OLT Pon Port 1/3 high temperature alert (48°C)", time: "2026-09-01 14:05:44" },
];

export default function ErrorLogsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <AlertOctagon className="h-6 w-6 text-red-500" />
            System Exceptions & Error Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time error tracebacks, API connection dropouts, and daemon exception telemetry.
          </p>
        </div>
        <Button variant="outline" className="gap-2 border-border bg-card">
          <RefreshCw className="h-4 w-4" /> Refresh Log Stream
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Terminal className="h-4 w-4 text-indigo-500" />
            Backend Exception Stream
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Service</th>
                <th className="text-left px-4 py-3">Severity</th>
                <th className="text-left px-4 py-3">Message</th>
                <th className="text-right px-4 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {errorLogs.map((e) => (
                <tr key={e.id} className="hover:bg-muted/50 transition-colors font-mono">
                  <td className="px-4 py-3 font-semibold text-foreground">{e.service}</td>
                  <td className="px-4 py-3">
                    <Badge variant={e.level === "Warning" ? "outline" : "secondary"}>{e.level}</Badge>
                  </td>
                  <td className="px-4 py-3 text-foreground font-sans">{e.message}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{e.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { History, Shield, User, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const logs = [
  { id: 1, user: "admin", action: "Updated Package Bandwidth for Turbo Stream (30M -> 35M)", ip: "192.168.1.5", time: "2026-09-01 21:15:02", category: "System Config" },
  { id: 2, user: "kamrul_noc", action: "MikroTik Sync Manual Trigger for CCR1036-Core", ip: "10.0.0.4", time: "2026-09-01 20:45:11", category: "Network NOC" },
  { id: 3, user: "farhana_bill", action: "Approved Payment Verification bKash TrxID: 9K9P2M4X7Q", ip: "192.168.1.18", time: "2026-09-01 10:25:30", category: "Billing" },
];

export default function ActivityLogsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <History className="h-6 w-6 text-indigo-500" />
            Audit & System Activity Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Immutable tracking of operator logins, billing updates, package modifications and NAS queue sync events.
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">Recent System Audit Trail</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Action Description</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">IP Address</th>
                <th className="text-right px-4 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">{l.user}</td>
                  <td className="px-4 py-3 text-foreground">{l.action}</td>
                  <td className="px-4 py-3">
                    <Badge variant="default">{l.category}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{l.ip}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{l.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

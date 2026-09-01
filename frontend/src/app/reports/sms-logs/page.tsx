"use client";

import { MessageSquare, RefreshCw, Send, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const smsLogs = [
  { id: 1, recipient: "01711223344", message: "Dear Tanvir Ahmed, your bill Tk 800 for Sep 2026 received. Expiry: 01-Oct-2026. -Sheba Net", status: "Delivered", time: "2026-09-01 10:24 AM" },
  { id: 2, recipient: "01977665544", message: "Dear Smart Tech, recharge successful for 60 Mbps Dedicated. Balance Tk 0. -Sheba Net", status: "Delivered", time: "2026-09-01 11:45 AM" },
  { id: 3, recipient: "01844991100", message: "Notice: Scheduled fiber maintenance on Uttara Sector 10 from 02:00 AM to 05:00 AM.", status: "Delivered", time: "2026-08-31 08:00 PM" },
];

export default function SmsLogsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-indigo-500" />
            Outgoing & Inbound SMS Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automated payment notifications, OTP verifications, and broadcast SMS delivery delivery receipts.
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">SMS Gateway Delivery Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Recipient</th>
                <th className="text-left px-4 py-3">SMS Content</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Sent Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {smsLogs.map((s) => (
                <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-foreground">{s.recipient}</td>
                  <td className="px-4 py-3 text-foreground">{s.message}</td>
                  <td className="px-4 py-3">
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {s.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{s.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

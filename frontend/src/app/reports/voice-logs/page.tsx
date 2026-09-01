"use client";

import { PhoneCall, Play, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const voiceLogs = [
  { id: 1, caller: "01711223344", customer: "Tanvir Ahmed", agent: "Jannatun Nayeem", duration: "2m 45s", reason: "LOS Optical Blink inquiry", time: "2026-09-01 02:10 PM", rating: "5/5" },
  { id: 2, caller: "01977665544", customer: "Smart Tech Solution", agent: "Kamrul Islam", duration: "4m 12s", reason: "BDIX Routing latency query", time: "2026-09-01 11:15 AM", rating: "5/5" },
];

export default function VoiceLogsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <PhoneCall className="h-6 w-6 text-indigo-500" />
            Voice Call CDR & Call Center Records
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customer helpline inbound call logs, PBX call audio recordings, and IVR resolution times.
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">Helpline CDR Stream</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Caller</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Support Agent</th>
                <th className="text-left px-4 py-3">Duration</th>
                <th className="text-left px-4 py-3">Reason</th>
                <th className="text-right px-4 py-3">Audio / Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {voiceLogs.map((v) => (
                <tr key={v.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-foreground">{v.caller}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{v.customer}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.agent}</td>
                  <td className="px-4 py-3 text-indigo-500 font-semibold">{v.duration}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.reason}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-indigo-500">
                      <Play className="h-3 w-3" /> Play CDR
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

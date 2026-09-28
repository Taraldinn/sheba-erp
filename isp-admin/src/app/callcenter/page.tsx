"use client";

import { useState } from "react";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Radio,
  Play,
  Search,
  CheckCircle2,
  Clock,
  User,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockCallLogs, CallLogItem } from "@/lib/mock-data";

export default function CallCenterPage() {
  const [logs, setLogs] = useState<CallLogItem[]>(mockCallLogs);
  const [broadcastSent, setBroadcastSent] = useState(false);

  const handleTriggerVoiceReminder = () => {
    setBroadcastSent(true);
    setTimeout(() => setBroadcastSent(false), 2500);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Call Center & Automated Voice Broadcasting</h1>
          <p className="text-xs text-muted-foreground mt-1">
            VoIP IP-Phone call logs, customer caller ID lookup, and automated voice reminder campaigns.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
            onClick={handleTriggerVoiceReminder}
          >
            <Radio className="h-3.5 w-3.5" />
            Trigger Expiry Voice Broadcast
          </Button>
        </div>
      </div>

      {broadcastSent && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Automated IVR Voice Reminder queued for 285 expired subscribers. Audio template: &apos;Bill Expiry Notice&apos;.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Inbound Calls Today</span>
              <PhoneIncoming className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">42 calls</p>
            <p className="text-[11px] text-emerald-400 mt-1">Avg duration: 2m 14s</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Voice Broadcasts</span>
              <Radio className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400 mt-1">285 sent</p>
            <p className="text-[11px] text-muted-foreground mt-1">94% pickup rate</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Active Support Agents</span>
              <User className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">4 online</p>
            <p className="text-[11px] text-indigo-400 mt-1">SIP Trunk OK</p>
          </CardContent>
        </Card>
      </div>

      {/* Call Logs Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Recent Call Logs & Recordings</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Real-time SIP trunk call records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="pb-2 font-medium">Caller Number & Subscriber</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Agent / IVR Channel</th>
                  <th className="pb-2 font-medium">Call Duration</th>
                  <th className="pb-2 font-medium">Call Result</th>
                  <th className="pb-2 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/50">
                    <td className="py-3 font-semibold text-foreground">
                      {log.customer_name}
                      <span className="block text-[10px] font-mono text-muted-foreground">{log.caller}</span>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded bg-muted text-foreground font-medium">
                        {log.type}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{log.agent}</td>
                    <td className="py-3 font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {log.duration}
                      </span>
                    </td>
                    <td className="py-3">
                      <Badge variant="success">{log.status}</Badge>
                    </td>
                    <td className="py-3 text-muted-foreground">{log.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

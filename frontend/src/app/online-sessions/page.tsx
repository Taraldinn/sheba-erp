"use client";

import { useState } from "react";
import {
  Activity,
  RefreshCw,
  Search,
  Power,
  Shield,
  Wifi,
  Radio,
  CheckCircle2,
  Clock,
  ArrowDownUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockOnlineSessions, OnlineSession } from "@/lib/mock-data";

export default function OnlineSessionsPage() {
  const [sessions, setSessions] = useState<OnlineSession[]>(mockOnlineSessions);
  const [search, setSearch] = useState("");
  const [kickedUser, setKickedUser] = useState<string | null>(null);

  const handleKickSession = (username: string) => {
    setKickedUser(username);
    setTimeout(() => {
      setSessions(sessions.filter((s) => s.username !== username));
      setKickedUser(null);
    }, 1000);
  };

  const filtered = sessions.filter(
    (s) =>
      s.username.toLowerCase().includes(search.toLowerCase()) ||
      s.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      s.ip_address.includes(search) ||
      s.mac_address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Live Active PPPoE Sessions</h1>
            <Badge variant="success" className="gap-1 text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              MikroTik Live Sync
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time subscriber tunnel telemetry, IP assignments, active uptime, and data consumption.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="border-border bg-card text-xs gap-1.5 text-foreground/80"
            onClick={() => setSessions(mockOnlineSessions)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Active PPPoE
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{filtered.length} Active Sessions</span>
              <span>across 3 MikroTik Core BNGs</span>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search username, IP, MAC address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground/80 placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background/80 text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-3 px-4 font-semibold">Subscriber / Username</th>
                  <th className="py-3 px-4 font-semibold">Framed IP Address</th>
                  <th className="py-3 px-4 font-semibold">Caller-ID / MAC</th>
                  <th className="py-3 px-4 font-semibold">BNG Core Router</th>
                  <th className="py-3 px-4 font-semibold">Active Uptime</th>
                  <th className="py-3 px-4 font-semibold">Rate Limit</th>
                  <th className="py-3 px-4 font-semibold">Download / Upload</th>
                  <th className="py-3 px-4 font-semibold text-right">Disconnect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((session) => (
                  <tr key={session.id} className="hover:bg-card/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-foreground">{session.customer_name}</div>
                      <div className="text-[11px] font-mono text-indigo-400 font-medium">{session.username}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-emerald-400">
                      {session.ip_address}
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      <div>{session.mac_address}</div>
                      <div className="text-[10px] text-muted-foreground">{session.caller_id}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                      {session.router_name}
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {session.uptime}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="default" className="text-[10px] font-mono">
                        {session.rate_limit}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-mono text-foreground/80">
                      <div>↓ {(session.download_mb / 1024).toFixed(2)} GB</div>
                      <div className="text-[10px] text-muted-foreground">↑ {(session.upload_mb / 1024).toFixed(2)} GB</div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-[11px] gap-1"
                        disabled={kickedUser === session.username}
                        onClick={() => handleKickSession(session.username)}
                        title="Terminate PPPoE session from MikroTik"
                      >
                        <Power className="h-3 w-3" />
                        {kickedUser === session.username ? "Kicking..." : "Kick Session"}
                      </Button>
                    </td>
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

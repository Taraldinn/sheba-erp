"use client";

import React, { useState, useEffect } from "react";
import { Clock, RefreshCw, Wifi, WifiOff, ArrowDown, ArrowUp, Search, Calendar, CheckCircle2, Shield } from "lucide-react";
import { PortalApiClient } from "@/lib/portal-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SessionRecord {
  id: string | number;
  is_online?: boolean;
  ip_address: string;
  mac_address?: string;
  caller_id?: string;
  connected_at: string;
  disconnected_at?: string | null;
  duration_seconds?: number;
  bytes_in: number;
  bytes_out: number;
  terminate_cause?: string;
}

interface SessionHistoryTableProps {
  isLoggedIn?: boolean;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "0s";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0 || secs > 0) parts.push(`${secs}s`);
  return parts.slice(0, 3).join(" ");
}

export function SessionHistoryTable({ isLoggedIn = false }: SessionHistoryTableProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ONLINE" | "HISTORY">("ALL");

  const loadSessions = async () => {
    setLoading(true);
    try {
      if (isLoggedIn && PortalApiClient.isAuthenticated()) {
        const data = await PortalApiClient.getSessions();
        if (Array.isArray(data)) {
          setSessions(data);
        }
      } else {
        // Fallback demo session data
        const now = Date.now();
        setSessions([
          {
            id: "curr-1",
            is_online: true,
            ip_address: "103.145.120.45",
            mac_address: "BC:54:51:7A:B2:1C",
            caller_id: "BC:54:51:7A:B2:1C",
            connected_at: new Date(now - 14 * 3600 * 1000).toISOString(),
            disconnected_at: null,
            duration_seconds: 14 * 3600 + 1200,
            bytes_in: 245200000000,
            bytes_out: 40600000000,
            terminate_cause: "Active Session",
          },
          {
            id: "hist-1",
            is_online: false,
            ip_address: "103.145.120.45",
            mac_address: "BC:54:51:7A:B2:1C",
            caller_id: "BC:54:51:7A:B2:1C",
            connected_at: new Date(now - 48 * 3600 * 1000).toISOString(),
            disconnected_at: new Date(now - 24 * 3600 * 1000).toISOString(),
            duration_seconds: 24 * 3600,
            bytes_in: 312000000000,
            bytes_out: 48000000000,
            terminate_cause: "User-Request",
          },
          {
            id: "hist-2",
            is_online: false,
            ip_address: "103.145.120.45",
            mac_address: "BC:54:51:7A:B2:1C",
            caller_id: "BC:54:51:7A:B2:1C",
            connected_at: new Date(now - 72 * 3600 * 1000).toISOString(),
            disconnected_at: new Date(now - 48 * 3600 * 1000).toISOString(),
            duration_seconds: 23 * 3600 + 4500,
            bytes_in: 180000000000,
            bytes_out: 22000000000,
            terminate_cause: "Admin-Reset",
          },
          {
            id: "hist-3",
            is_online: false,
            ip_address: "103.145.120.12",
            mac_address: "BC:54:51:7A:B2:1C",
            caller_id: "BC:54:51:7A:B2:1C",
            connected_at: new Date(now - 120 * 3600 * 1000).toISOString(),
            disconnected_at: new Date(now - 72 * 3600 * 1000).toISOString(),
            duration_seconds: 48 * 3600,
            bytes_in: 410000000000,
            bytes_out: 65000000000,
            terminate_cause: "Lost-Carrier",
          },
        ]);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [isLoggedIn]);

  const filteredSessions = sessions.filter((s) => {
    if (statusFilter === "ONLINE" && !s.is_online) return false;
    if (statusFilter === "HISTORY" && s.is_online) return false;
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      const ipMatch = s.ip_address?.toLowerCase().includes(q);
      const macMatch = s.mac_address?.toLowerCase().includes(q) || s.caller_id?.toLowerCase().includes(q);
      const causeMatch = s.terminate_cause?.toLowerCase().includes(q);
      return ipMatch || macMatch || causeMatch;
    }
    return true;
  });

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-indigo-400" />
            Connection & Usage Log History (Last 50 Sessions)
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Complete records of PPPoE dialing, session duration, IP leases, and traffic consumed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSessions}
            disabled={loading}
            className="h-8 text-xs border-border gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
              statusFilter === "ALL"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ONLINE")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
              statusFilter === "ONLINE"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Active Online ({sessions.filter((s) => s.is_online).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("HISTORY")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
              statusFilter === "HISTORY"
                ? "bg-muted-foreground/30 text-foreground border-border"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Past Sessions ({sessions.filter((s) => !s.is_online).length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search IP, MAC or cause..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="h-8 text-xs pl-8 bg-background border-border"
          />
        </div>
      </div>

      {/* Session Table */}
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
            <tr>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Session Start</th>
              <th className="py-2.5 px-3">Session End</th>
              <th className="py-2.5 px-3">Duration</th>
              <th className="py-2.5 px-3">Download (Data In)</th>
              <th className="py-2.5 px-3">Upload (Data Out)</th>
              <th className="py-2.5 px-3">Assigned IP</th>
              <th className="py-2.5 px-3">Disconnect Cause</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-1 text-indigo-400" />
                  Loading session records...
                </td>
              </tr>
            ) : filteredSessions.length > 0 ? (
              filteredSessions.map((s) => (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-3">
                    {s.is_online ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] gap-1 px-1.5 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0.5">
                        Closed
                      </Badge>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-foreground">
                    {s.connected_at ? new Date(s.connected_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                    {s.disconnected_at ? new Date(s.disconnected_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : s.is_online ? <span className="text-emerald-400 font-semibold">Active Now</span> : "—"}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-foreground">
                    {formatDuration(s.duration_seconds)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-blue-400 font-bold">
                    <span className="flex items-center gap-1">
                      <ArrowDown className="h-3 w-3" />
                      {formatBytes(s.bytes_in)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-purple-400 font-bold">
                    <span className="flex items-center gap-1">
                      <ArrowUp className="h-3 w-3" />
                      {formatBytes(s.bytes_out)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-foreground">
                    {s.ip_address}
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-muted-foreground">
                    {s.terminate_cause || (s.is_online ? "Active session" : "Normal Disconnect")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  No session history records match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

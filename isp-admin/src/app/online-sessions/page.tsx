"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  RefreshCw,
  Search,
  Power,
  Clock,
  ArrowDownUp,
  Server,
  User,
  Shield,
  Wifi,
  ExternalLink,
  History,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";
import { LiveSession, CustomerSessionTelemetry, Router } from "@/types";

export default function OnlineSessionsPage() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [selectedRouter, setSelectedRouter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kickingUser, setKickingUser] = useState<string | null>(null);

  // Terminate confirm modal
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; session: LiveSession | null }>({
    open: false,
    session: null,
  });

  // Customer inspection drawer
  const [telemetryDrawer, setTelemetryDrawer] = useState<{
    open: boolean;
    customerName: string;
    username: string;
    loading: boolean;
    data: CustomerSessionTelemetry | null;
  }>({
    open: false,
    customerName: "",
    username: "",
    loading: false,
    data: null,
  });

  const [notification, setNotification] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadRouters = async () => {
    try {
      const data = await ApiClient.getRouters();
      setRouters(data);
    } catch (e) {
      console.error("Failed to load routers", e);
    }
  };

  const loadSessions = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await ApiClient.getLiveSessions({
        router: selectedRouter || undefined,
        search: search || undefined,
        refresh: isManualRefresh,
      });
      setSessions(res.sessions || []);
    } catch (err: any) {
      console.error("Failed to load live sessions", err);
      showToast("Failed to fetch live sessions from network service.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedRouter, search]);

  useEffect(() => {
    loadRouters();
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleKickSession = async (session: LiveSession) => {
    setKickingUser(session.username);
    try {
      const res = await ApiClient.terminateSession(session.username, session.router_id);
      showToast(res.message || `Session for ${session.username} terminated.`);
      setConfirmModal({ open: false, session: null });
      // Reload sessions
      loadSessions(true);
    } catch (err: any) {
      showToast(err.message || "Failed to terminate session on router.", "error");
    } finally {
      setKickingUser(null);
    }
  };

  const handleInspectCustomer = async (session: LiveSession) => {
    if (!session.customer_id) {
      showToast(`No linked customer record found for username ${session.username}`, "error");
      return;
    }
    setTelemetryDrawer({
      open: true,
      customerName: session.customer_name,
      username: session.username,
      loading: true,
      data: null,
    });
    try {
      const telemetry = await ApiClient.getCustomerSessionTelemetry(session.customer_id);
      setTelemetryDrawer((prev) => ({ ...prev, loading: false, data: telemetry }));
    } catch (err: any) {
      console.error("Failed to load customer telemetry", err);
      showToast("Failed to fetch customer telemetry.", "error");
      setTelemetryDrawer((prev) => ({ ...prev, loading: false }));
    }
  };

  // Aggregated live telemetry
  const totalSessions = sessions.length;
  const totalRxBps = sessions.reduce((acc, s) => acc + (s.rx_rate_bps || 0), 0);
  const totalTxBps = sessions.reduce((acc, s) => acc + (s.tx_rate_bps || 0), 0);
  const totalBytesGB = (sessions.reduce((acc, s) => acc + (s.total_bytes || 0), 0) / (1024 ** 3)).toFixed(2);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 border animate-in slide-in-from-top-2 ${
            notification.type === "success"
              ? "bg-emerald-950/90 text-emerald-300 border-emerald-700/60"
              : "bg-rose-950/90 text-rose-300 border-rose-700/60"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          )}
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Live Active PPPoE Sessions</h1>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] gap-1 px-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Realtime BNG Sync
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Phase 14 Realtime Network Telemetry: short-lived Redis cache, instant search, subscriber lookup, and backend session termination.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={refreshing}
            className="border-border bg-card text-xs gap-2 text-foreground/80 hover:border-indigo-500/60"
            onClick={() => loadSessions(true)}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
            {refreshing ? "Polling MikroTik..." : "Refresh Live BNG State"}
          </Button>
        </div>
      </div>

      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Active Tunnels</p>
              <h3 className="text-2xl font-extrabold text-foreground mt-1">{totalSessions}</h3>
              <p className="text-[11px] text-emerald-400 mt-0.5 flex items-center gap-1 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> 100% Online
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Wifi className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Download Rate (RX)</p>
              <h3 className="text-2xl font-extrabold text-indigo-400 mt-1">
                {(totalRxBps / 1_000_000).toFixed(1)} <span className="text-sm font-semibold text-muted-foreground">Mbps</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Aggregate Ingress</p>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <ArrowDownUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Upload Rate (TX)</p>
              <h3 className="text-2xl font-extrabold text-emerald-400 mt-1">
                {(totalTxBps / 1_000_000).toFixed(1)} <span className="text-sm font-semibold text-muted-foreground">Mbps</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Aggregate Egress</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Activity className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">Total Cumulative Vol</p>
              <h3 className="text-2xl font-extrabold text-foreground mt-1">
                {totalBytesGB} <span className="text-sm font-semibold text-muted-foreground">GB</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Active session volume</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Server className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter / Search Bar */}
      <Card className="border-border bg-card/60">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Router selector */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={selectedRouter}
                onChange={(e) => setSelectedRouter(e.target.value)}
                className="bg-background border border-border text-foreground text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 w-full sm:w-56"
              >
                <option value="">All BNG Routers</option>
                {routers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.ip_address})
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Showing <strong className="text-foreground">{sessions.length}</strong> active
              </span>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search username, subscriber name, IP address, MAC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card className="border-border bg-card/60 overflow-hidden shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background/90 text-muted-foreground border-b border-border/80 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="py-3 px-4">Subscriber / PPPoE</th>
                  <th className="py-3 px-4">Framed IP & MAC</th>
                  <th className="py-3 px-4">BNG Router</th>
                  <th className="py-3 px-4">Uptime & Last Seen</th>
                  <th className="py-3 px-4">Live Speed (RX / TX)</th>
                  <th className="py-3 px-4">Total Data</th>
                  <th className="py-3 px-4 text-center">Inspect</th>
                  <th className="py-3 px-4 text-right">Disconnect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-400" />
                      Loading live sessions from Redis & MikroTik BNG...
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No active PPPoE sessions found matching your filters.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-accent/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          {s.customer_name}
                          {s.customer_code && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              ({s.customer_code})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-indigo-400 font-medium">
                          {s.username}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {s.package_name} • {s.area_zone || "Main Zone"}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-emerald-400">{s.ip_address}</div>
                        <div className="text-[10px] text-muted-foreground">{s.mac_address || "No MAC"}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-foreground/80">
                        <div className="font-medium text-xs">{s.router_name}</div>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-border text-muted-foreground">
                          v7 REST
                        </Badge>
                      </td>

                      <td className="py-3 px-4 font-mono text-muted-foreground">
                        <div className="flex items-center gap-1 text-foreground/90 font-medium">
                          <Clock className="h-3 w-3 text-indigo-400" />
                          {s.uptime}
                        </div>
                        <div className="text-[10px]">
                          {s.connected_at ? new Date(s.connected_at).toLocaleTimeString() : "Recent"}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <div className="text-indigo-400 font-semibold">↓ {s.rx_rate_formatted}</div>
                        <div className="text-emerald-400 font-semibold">↑ {s.tx_rate_formatted}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-foreground/80">
                        <div>↓ {(s.bytes_in / (1024 ** 3)).toFixed(2)} GB</div>
                        <div className="text-[10px] text-muted-foreground">↑ {(s.bytes_out / (1024 ** 3)).toFixed(2)} GB</div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10"
                          onClick={() => handleInspectCustomer(s)}
                          title="View subscriber diagnostics & historical sessions"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2.5 text-[11px] gap-1 shadow-sm"
                          disabled={kickingUser === s.username}
                          onClick={() => setConfirmModal({ open: true, session: s })}
                        >
                          <Power className="h-3 w-3" />
                          {kickingUser === s.username ? "Kicking..." : "Disconnect"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Modal for Session Termination */}
      {confirmModal.open && confirmModal.session && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">Terminate Live PPPoE Session?</h3>
                <p className="text-xs text-muted-foreground">Immediate hardware disconnection via MikroTik</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to kick subscriber <strong className="text-foreground">{confirmModal.session.customer_name}</strong> (
              <span className="font-mono text-indigo-400">{confirmModal.session.username}</span>) from router{" "}
              <strong className="text-foreground">{confirmModal.session.router_name}</strong>?
            </p>

            <div className="p-3 rounded-lg bg-background border border-border text-[11px] font-mono space-y-1">
              <div>Assigned IP: {confirmModal.session.ip_address}</div>
              <div>Current Uptime: {confirmModal.session.uptime}</div>
              <div>Data Vol: {(confirmModal.session.total_bytes / (1024 ** 2)).toFixed(1)} MB</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setConfirmModal({ open: false, session: null })}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="text-xs gap-1.5"
                disabled={Boolean(kickingUser)}
                onClick={() => handleKickSession(confirmModal.session!)}
              >
                <Power className="h-3.5 w-3.5" />
                {kickingUser ? "Terminating..." : "Confirm Disconnect"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Telemetry & Historical Sessions Drawer */}
      {telemetryDrawer.open && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-2xl bg-card border-l border-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">{telemetryDrawer.customerName}</h3>
                  <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-[10px] font-mono">
                    {telemetryDrawer.username}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Realtime subscriber status and historical connection records (PostgreSQL).
                </p>
              </div>
              <button
                onClick={() => setTelemetryDrawer((prev) => ({ ...prev, open: false }))}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {telemetryDrawer.loading ? (
                <div className="py-12 text-center text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-400" />
                  Loading session telemetry...
                </div>
              ) : telemetryDrawer.data ? (
                <>
                  {/* Status Overview Card */}
                  <div className="p-4 rounded-xl bg-background border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Current Status</span>
                      {telemetryDrawer.data.is_online ? (
                        <Badge variant="success" className="gap-1 text-[11px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Online Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-rose-500/30 text-rose-400 text-[11px]">
                          Offline
                        </Badge>
                      )}
                    </div>

                    {telemetryDrawer.data.active_session && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Framed IP</span>
                          <span className="text-emerald-400 font-bold">
                            {telemetryDrawer.data.active_session.ip_address}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Caller MAC</span>
                          <span className="text-foreground font-medium">
                            {telemetryDrawer.data.active_session.mac_address || "N/A"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Uptime</span>
                          <span className="text-indigo-400 font-medium">
                            {telemetryDrawer.data.active_session.uptime}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Current RX</span>
                          <span className="text-indigo-400 font-bold">
                            {telemetryDrawer.data.active_session.rx_rate_formatted}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Current TX</span>
                          <span className="text-emerald-400 font-bold">
                            {telemetryDrawer.data.active_session.tx_rate_formatted}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">BNG Router</span>
                          <span className="text-foreground">
                            {telemetryDrawer.data.active_session.router_name}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Aggregate Lifetime Stats */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-background border border-border">
                      <span className="text-[10px] text-muted-foreground block uppercase font-bold">Total Sessions</span>
                      <span className="text-lg font-bold text-foreground">
                        {telemetryDrawer.data.aggregates.total_sessions_count}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-background border border-border">
                      <span className="text-[10px] text-muted-foreground block uppercase font-bold">Total Cumulative Traffic</span>
                      <span className="text-lg font-bold text-indigo-400">
                        {(telemetryDrawer.data.aggregates.total_bytes / (1024 ** 3)).toFixed(2)} GB
                      </span>
                    </div>
                  </div>

                  {/* Historical Sessions Table */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <History className="h-4 w-4 text-indigo-400" />
                      Session History (PostgreSQL Records)
                    </div>

                    {telemetryDrawer.data.session_history.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No past session records archived yet.</p>
                    ) : (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-background text-muted-foreground text-[10px] uppercase font-bold border-b border-border">
                            <tr>
                              <th className="py-2.5 px-3">IP Address</th>
                              <th className="py-2.5 px-3">Duration</th>
                              <th className="py-2.5 px-3">Data Transferred</th>
                              <th className="py-2.5 px-3">Disconnected</th>
                              <th className="py-2.5 px-3">Cause</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                            {telemetryDrawer.data.session_history.map((h) => (
                              <tr key={h.id} className="hover:bg-accent/40">
                                <td className="py-2 px-3 font-semibold text-foreground">{h.ip_address}</td>
                                <td className="py-2 px-3 text-muted-foreground">{h.duration_formatted}</td>
                                <td className="py-2 px-3">
                                  ↓ {(h.bytes_in / (1024 ** 2)).toFixed(1)}M / ↑ {(h.bytes_out / (1024 ** 2)).toFixed(1)}M
                                </td>
                                <td className="py-2 px-3 text-muted-foreground text-[10px]">
                                  {h.disconnected_at ? new Date(h.disconnected_at).toLocaleString() : "N/A"}
                                </td>
                                <td className="py-2 px-3">
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] px-1 py-0 ${
                                      h.terminate_cause === "Admin-Reset"
                                        ? "border-rose-500/40 text-rose-400"
                                        : "border-border text-muted-foreground"
                                    }`}
                                  >
                                    {h.terminate_cause}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Unable to load telemetry.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

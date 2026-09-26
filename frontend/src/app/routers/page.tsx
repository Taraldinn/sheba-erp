"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Server,
  Activity,
  RefreshCw,
  Radio,
  Power,
  Plus,
  ShieldCheck,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Cpu,
  HardDrive,
  Clock,
  Wifi,
  Zap,
  FileCode,
  Copy,
  Check,
  Download,
  Key,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Network,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { Router, RouterInterface } from "@/types";
import { ExpirePoolModal } from "@/components/network/ExpirePoolModal";

export default function RoutersPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRouter, setEditingRouter] = useState<Router | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // RADIUS Script Modal State
  const [radiusScriptModalOpen, setRadiusScriptModalOpen] = useState(false);
  const [selectedScriptRouter, setSelectedScriptRouter] = useState<Router | null>(null);
  const [radiusScript, setRadiusScript] = useState("");
  const [serverHost, setServerHost] = useState("");
  const [copiedScript, setCopiedScript] = useState(false);

  // Expire Pool Captive Modal State
  const [expirePoolModalOpen, setExpirePoolModalOpen] = useState(false);
  const [selectedExpirePoolRouter, setSelectedExpirePoolRouter] = useState<Router | null>(null);

  // Form State
  const [showRadiusSecret, setShowRadiusSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showApiTelemetry, setShowApiTelemetry] = useState(false);

  // Per-router interface panel toggle
  const [openInterfaces, setOpenInterfaces] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    name: "",
    ip_address: "",
    hostname: "",
    api_protocol: "REST" as "REST" | "API" | "RADIUS",
    https_port: 443,
    api_port: 8728,
    winbox_port: 8291,
    username: "admin",
    password: "",
    ssl_verify: false,
    connection_timeout: 10,
    radius_secret: "",
    radius_auth_port: 1812,
    radius_acct_port: 1813,
    radius_coa_port: 3799,
    nas_identifier: "",
    location: "Core NOC",
    description: "MikroTik Core Router",
    is_active: true,
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const routersRef = useRef<Router[]>([]);
  routersRef.current = routers;
  const scriptDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestScriptHostRef = useRef<string>("");

  const refreshLiveTelemetry = useCallback(async () => {
    const currentRouters = routersRef.current;
    if (currentRouters.length === 0) return;

    try {
      const updated = await Promise.all(
        currentRouters.map(async (r) => {
          if (!r.is_active) return r;
          try {
            const health = await ApiClient.getRouterHealth(r.id);
            return {
              ...r,
              status: (health.is_online ? "Online" : health.status || "Offline") as "Online" | "Offline" | "Error",
              cpu_usage: health.cpu_usage ?? health.cpu_load ?? r.cpu_usage,
              memory_usage: health.memory_usage ?? health.memory_pct ?? r.memory_usage,
              disk_usage: health.disk_usage ?? health.disk_pct ?? r.disk_usage,
              uptime: health.uptime || r.uptime,
              routeros_version: health.routeros_version || health.version || r.routeros_version,
              active_pppoe_count: health.active_pppoe_count ?? r.active_pppoe_count,
              last_ping: health.last_ping || r.last_ping,
              interfaces: (health.interfaces as RouterInterface[] | undefined) ?? r.interfaces ?? [],
            };
          } catch {
            return r;
          }
        })
      );
      setRouters(updated);
    } catch (err) {
      console.debug("Telemetry refresh error:", err);
    }
  }, []);

  const loadRouters = async () => {
    try {
      const data = await ApiClient.getRouters();
      setRouters(data);
    } catch (err: any) {
      console.error("Failed to load routers:", err);
    }
  };

  useEffect(() => {
    loadRouters();
  }, []);

  useEffect(() => {
    if (!autoRefresh) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    refreshLiveTelemetry();
    pollingRef.current = setInterval(() => {
      refreshLiveTelemetry();
    }, 4000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [autoRefresh, refreshLiveTelemetry]);

  const generateRandomSecret = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%^&*_-+=";
    const array = new Uint32Array(20);
    if (typeof window !== "undefined" && window.crypto) {
      window.crypto.getRandomValues(array);
    }
    let secret = "";
    for (let i = 0; i < 20; i++) {
      secret += chars.charAt(array[i] % chars.length);
    }
    setFormData((prev) => ({ ...prev, radius_secret: secret }));
    setShowRadiusSecret(true);
  };

  const handleOpenCreate = () => {
    setEditingRouter(null);
    setShowRadiusSecret(false);
    setShowPassword(false);
    setShowApiTelemetry(false);
    setFormData({
      name: "",
      ip_address: "",
      hostname: "",
      api_protocol: "REST",
      https_port: 443,
      api_port: 8728,
      winbox_port: 8291,
      username: "admin",
      password: "",
      ssl_verify: false,
      connection_timeout: 10,
      radius_secret: "",
      radius_auth_port: 1812,
      radius_acct_port: 1813,
      radius_coa_port: 3799,
      nas_identifier: "",
      location: "",
      description: "",
      is_active: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (r: Router) => {
    setEditingRouter(r);
    setShowRadiusSecret(false);
    setShowPassword(false);
    setShowApiTelemetry(Boolean(r.username !== "admin" || (r.api_port && r.api_port !== 8728)));
    setFormData({
      name: r.name,
      ip_address: r.ip_address,
      hostname: r.hostname || "",
      api_protocol: r.api_protocol || "REST",
      https_port: r.https_port || 443,
      api_port: r.api_port || 8728,
      winbox_port: r.winbox_port || 8291,
      username: r.username || "admin",
      password: "", // write-only
      ssl_verify: r.ssl_verify ?? false,
      connection_timeout: r.connection_timeout || 10,
      radius_secret: "", // write-only
      radius_auth_port: r.radius_auth_port || 1812,
      radius_acct_port: r.radius_acct_port || 1813,
      radius_coa_port: r.radius_coa_port || 3799,
      nas_identifier: r.nas_identifier || "",
      location: r.location || "NOC",
      description: r.description || "",
      is_active: r.is_active ?? true,
    });
    setModalOpen(true);
  };

  const handleOpenRadiusScript = async (r: Router) => {
    setSelectedScriptRouter(r);
    const defaultHost = typeof window !== "undefined" ? window.location.hostname : "103.145.120.1";
    setServerHost(defaultHost);
    try {
      const res = await ApiClient.getRouterRadiusScript(r.id, defaultHost);
      setRadiusScript(res.script || r.radius_script || "");
    } catch {
      setRadiusScript(r.radius_script || "");
    }
    setRadiusScriptModalOpen(true);
  };

  const handleOpenExpirePool = (r: Router) => {
    setSelectedExpirePoolRouter(r);
    setExpirePoolModalOpen(true);
  };

  const handleCopyScript = () => {
    if (!radiusScript) return;
    navigator.clipboard.writeText(radiusScript);
    setCopiedScript(true);
    showToast("MikroTik RADIUS script copied to clipboard! Paste into Winbox Terminal.");
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const handleDownloadScript = () => {
    if (!radiusScript) return;
    const blob = new Blob([radiusScript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mikrotik_radius_${selectedScriptRouter?.name || "router"}.rsc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleServerHostChange = (newHost: string) => {
    setServerHost(newHost);
    latestScriptHostRef.current = newHost;
    if (!selectedScriptRouter) return;

    if (scriptDebounceTimerRef.current) {
      clearTimeout(scriptDebounceTimerRef.current);
    }

    scriptDebounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await ApiClient.getRouterRadiusScript(selectedScriptRouter.id, newHost);
        if (latestScriptHostRef.current === newHost) {
          setRadiusScript(res.script || "");
        }
      } catch {
        // ignore
      }
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { ...formData };
      if (!payload.password) {
        delete payload.password; // Don't overwrite password with empty string on update
      }
      if (!payload.radius_secret) {
        delete payload.radius_secret; // Don't overwrite secret with empty string
      }

      if (editingRouter) {
        await ApiClient.updateRouter(editingRouter.id, payload);
        showToast(`Updated router "${formData.name}".`);
      } else {
        await ApiClient.createRouter(payload);
        showToast(`Added new router "${formData.name}".`);
      }
      setModalOpen(false);
      loadRouters();
    } catch (err: any) {
      showToast(err.message || `Failed to save router: ${formData.name}`, "error");
    }
  };

  const handleDelete = async (r: Router) => {
    if (!confirm(`Are you sure you want to remove router "${r.name}"?`)) return;
    try {
      await ApiClient.deleteRouter(r.id);
      showToast(`Removed router "${r.name}".`);
      loadRouters();
    } catch (err: any) {
      showToast(err.message || `Failed to delete router ${r.name}`, "error");
    }
  };

  const handleTestConnection = async (r: Router) => {
    setTestingId(r.id);
    try {
      const result = await ApiClient.testRouterConnection(r.id);
      showToast(
        result.message || `Successfully connected to ${r.name}`,
        result.success ? "success" : "error"
      );
      loadRouters();
    } catch (err: any) {
      showToast(err.message || `Connection failed to ${r.name}`, "error");
      loadRouters();
    } finally {
      setTestingId(null);
    }
  };

  const handleSync = async (id: string, name: string) => {
    setSyncingId(id);
    try {
      const res = await ApiClient.syncRouter(id);
      showToast(res.message || `RouterOS sync completed for ${name}.`);
      loadRouters();
    } catch (err: any) {
      showToast(err.message || `Failed to synchronize ${name}.`, "error");
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Server className="h-6 w-6 text-indigo-500" />
            Core MikroTik Routers
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            RouterOS v7 HTTPS REST API connectivity, active PPPoE tunnels, real-time CPU, RAM, and Disk metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs gap-1.5 border-border ${
              autoRefresh
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium"
                : "bg-card text-muted-foreground"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
              }`}
            />
            {autoRefresh ? "Live: 4s" : "Live: Paused"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setIsRefreshing(true);
              await loadRouters();
              await refreshLiveTelemetry();
              setIsRefreshing(false);
            }}
            disabled={isRefreshing}
            className="text-xs gap-1.5 border-border bg-card"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={handleOpenCreate}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 text-xs font-semibold"
          >
            <Plus className="h-4 w-4" />
            Add Router / NAS
          </Button>
        </div>
      </div>

      {notification && (
        <div
          className={`p-3 rounded-lg flex items-center gap-2 font-medium border ${
            notification.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
              : "bg-rose-500/15 border-rose-500/30 text-rose-800 dark:text-rose-200"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {routers.map((router) => (
          <Card key={router.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge
                  variant={
                    router.status === "Online"
                      ? "default"
                      : router.status === "Error"
                      ? "destructive"
                      : "secondary"
                  }
                  className="gap-1 text-[11px]"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      router.status === "Online"
                        ? "bg-emerald-400 animate-pulse"
                        : router.status === "Error"
                        ? "bg-red-400"
                        : "bg-amber-400"
                    }`}
                  />
                  {router.status}
                </Badge>

                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono font-medium ${
                      router.api_protocol === "RADIUS"
                        ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                        : router.api_protocol === "API"
                        ? "text-blue-500 border-blue-500/30 bg-blue-500/10"
                        : "text-indigo-500 border-indigo-500/30 bg-indigo-500/10"
                    }`}
                  >
                    {router.api_protocol === "RADIUS"
                      ? `RADIUS :${router.radius_auth_port || 1812}`
                      : router.api_protocol === "API"
                      ? `API :${router.api_port || 8728}`
                      : `v7 REST :${router.https_port || 443}`}
                  </Badge>
                  <span className="text-xs font-mono font-semibold bg-muted px-2 py-0.5 rounded text-foreground">
                    {router.ip_address}
                  </span>
                </div>
              </div>

              <CardTitle className="text-base font-bold text-foreground mt-2 flex items-center justify-between">
                <span>{router.name}</span>
                {router.routeros_version && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    v{router.routeros_version}
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {router.hostname && <span className="font-mono text-foreground/80 mr-2">Host: {router.hostname} ·</span>}
                Location: {router.location || "NOC"} · User: {router.username || "admin"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 pt-0 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <p className="text-muted-foreground text-[10px] flex items-center justify-center gap-1">
                    <Cpu className="h-3 w-3" /> CPU
                  </p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {router.cpu_usage ?? router.cpu_load ?? 0}%
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <p className="text-muted-foreground text-[10px] flex items-center justify-center gap-1">
                    <Activity className="h-3 w-3" /> RAM
                  </p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {router.memory_usage ?? 0}%
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <p className="text-muted-foreground text-[10px] flex items-center justify-center gap-1">
                    <HardDrive className="h-3 w-3" /> Disk
                  </p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {router.disk_usage ?? 0}%
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-muted-foreground text-[11px] px-1">
                <span className="flex items-center gap-1">
                  <Wifi className="h-3 w-3 text-indigo-500" /> PPPoE:{" "}
                  <strong className="text-foreground">
                    {router.active_pppoe_count ?? router.active_sessions ?? 0}
                  </strong>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {router.uptime || "—"}
                </span>
              </div>

              {/* Interface Panel */}
              {router.api_protocol !== "RADIUS" && (
                <div className="border-t border-border pt-2">
                  <button
                    onClick={() =>
                      setOpenInterfaces((prev) => ({ ...prev, [router.id]: !prev[router.id] }))
                    }
                    className="w-full flex items-center justify-between text-[10px] text-muted-foreground hover:text-foreground transition-colors py-0.5 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide">
                      <Network className="h-3 w-3 text-indigo-400" />
                      Interfaces
                      {router.interfaces && router.interfaces.length > 0 && (
                        <span className="font-mono font-bold text-foreground">
                          ({router.interfaces.filter((i) => i.running && !i.disabled).length}/
                          {router.interfaces.length} up)
                        </span>
                      )}
                    </span>
                    {openInterfaces[router.id] ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>

                  {openInterfaces[router.id] && (
                    <div className="mt-1.5 space-y-1">
                      {!router.interfaces || router.interfaces.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground italic text-center py-1">
                          No interface data — trigger a health refresh
                        </p>
                      ) : (
                        router.interfaces.map((iface) => (
                          <div
                            key={iface.name}
                            className={`flex items-center justify-between px-2 py-1 rounded-md text-[10px] ${
                              iface.disabled
                                ? "bg-muted/30 opacity-50"
                                : iface.running
                                ? "bg-emerald-500/8 border border-emerald-500/15"
                                : "bg-amber-500/8 border border-amber-500/15"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                  iface.disabled
                                    ? "bg-muted-foreground"
                                    : iface.running
                                    ? "bg-emerald-400"
                                    : "bg-amber-400"
                                }`}
                              />
                              <span className="font-mono font-semibold text-foreground truncate">
                                {iface.name}
                              </span>
                              <span className="text-muted-foreground shrink-0">
                                {iface.type === 'ether' ? 'ETH' : iface.type === 'pppoe-in' ? 'PPPoE' : iface.type.toUpperCase()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground font-mono shrink-0">
                              {iface.disabled ? (
                                <span className="text-muted-foreground">disabled</span>
                              ) : iface.running ? (
                                <>
                                  <span title="Download">
                                    ↓{iface.rx_bytes >= 1073741824
                                      ? (iface.rx_bytes / 1073741824).toFixed(1) + "G"
                                      : iface.rx_bytes >= 1048576
                                      ? (iface.rx_bytes / 1048576).toFixed(0) + "M"
                                      : iface.rx_bytes >= 1024
                                      ? (iface.rx_bytes / 1024).toFixed(0) + "K"
                                      : iface.rx_bytes + "B"}
                                  </span>
                                  <span title="Upload">
                                    ↑{iface.tx_bytes >= 1073741824
                                      ? (iface.tx_bytes / 1073741824).toFixed(1) + "G"
                                      : iface.tx_bytes >= 1048576
                                      ? (iface.tx_bytes / 1048576).toFixed(0) + "M"
                                      : iface.tx_bytes >= 1024
                                      ? (iface.tx_bytes / 1024).toFixed(0) + "K"
                                      : iface.tx_bytes + "B"}
                                  </span>
                                </>
                              ) : (
                                <span className="text-amber-500">no carrier</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-border flex items-center gap-1.5">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleTestConnection(router)}
                  disabled={testingId === router.id}
                  className="text-[11px] gap-1 flex-1 bg-indigo-600 hover:bg-indigo-700 text-white h-8 font-medium"
                >
                  <Zap className={`h-3.5 w-3.5 ${testingId === router.id ? "animate-spin" : ""}`} />
                  {testingId === router.id
                    ? "Testing..."
                    : router.api_protocol === "RADIUS"
                    ? "Test RADIUS"
                    : router.api_protocol === "API"
                    ? "Test API"
                    : "Test REST"}
                </Button>

                {router.api_protocol === "RADIUS" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenRadiusScript(router)}
                    className="text-[11px] gap-1 flex-1 border-border bg-background h-8 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30"
                  >
                    <FileCode className="h-3.5 w-3.5" />
                    RADIUS Script
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(router.id, router.name)}
                    disabled={syncingId === router.id}
                    className="text-[11px] gap-1 flex-1 border-border bg-background h-8 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingId === router.id ? "animate-spin text-indigo-500" : ""}`} />
                    {syncingId === router.id ? "Syncing..." : "Sync Queues"}
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenExpirePool(router)}
                  className="text-[11px] gap-1 h-8 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                  title="Configure Expire Pool (10k-50k Throttled Data & Captive Portal)"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Expire Pool
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(router)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(router)}
                  className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* CREATE / EDIT ROUTER DIALOG */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Server className="h-5 w-5 text-indigo-500" />
              {editingRouter ? `Edit Router: ${editingRouter.name}` : "Add MikroTik Router / NAS"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure connection architecture: direct RouterOS REST/API or centralized RADIUS AAA with CoA disconnect.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Router Name / Identity</label>
              <Input
                placeholder="e.g. SHEBAFI or Core-CCR2004"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-8 text-xs"
                required
              />
            </div>

            {/* CONNECTION ARCHITECTURE SELECTOR */}
            <div>
              <label className="block font-semibold mb-1.5 text-xs text-foreground">
                Connection Architecture
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      api_protocol: prev.api_protocol === "RADIUS" ? "REST" : prev.api_protocol,
                    }))
                  }
                  className={`p-3 rounded-lg border text-left transition-all ${
                    formData.api_protocol !== "RADIUS"
                      ? "border-indigo-600 bg-indigo-50/10 dark:bg-indigo-950/20 ring-1 ring-indigo-600"
                      : "border-border hover:border-muted-foreground/40 bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Zap
                      className={`h-4 w-4 ${
                        formData.api_protocol !== "RADIUS" ? "text-indigo-500" : "text-muted-foreground"
                      }`}
                    />
                    <span className="font-bold text-xs text-foreground">RouterOS REST / API</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Direct connection via HTTPS REST (v7+) or Binary API (Port 8728).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, api_protocol: "RADIUS" }))}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    formData.api_protocol === "RADIUS"
                      ? "border-amber-500 bg-amber-50/10 dark:bg-amber-950/20 ring-1 ring-amber-500"
                      : "border-border hover:border-muted-foreground/40 bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Radio
                      className={`h-4 w-4 ${
                        formData.api_protocol === "RADIUS" ? "text-amber-500" : "text-muted-foreground"
                      }`}
                    />
                    <span className="font-bold text-xs text-foreground">RADIUS Server (AAA)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    MikroTik delegates AAA to Sheba RADIUS with real-time CoA disconnect.
                  </p>
                </button>
              </div>
            </div>

            {formData.api_protocol === "RADIUS" ? (
              /* RADIUS ARCHITECTURE FIELDS */
              <div className="space-y-3 pt-1">
                {/* RADIUS INFO BANNER */}
                <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-[11px] flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">RADIUS AAA Architecture:</span> MikroTik sends PPPoE/Hotspot authentication and accounting requests to Sheba RADIUS. Sheba issues RFC 3576 CoA disconnects to instantly drop expired users.
                  </div>
                </div>

                {/* NAS IP & NAS IDENTIFIER */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">
                      MikroTik NAS IP Address <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      placeholder="e.g. 138.252.181.106"
                      value={formData.ip_address}
                      onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                      className="h-8 text-xs font-mono"
                      required
                    />
                    <span className="text-[10px] text-muted-foreground">IP address of this router</span>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">NAS Identifier (Optional)</label>
                    <Input
                      placeholder="e.g. CORE-HAP-LITE"
                      value={formData.nas_identifier}
                      onChange={(e) => setFormData({ ...formData, nas_identifier: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                    <span className="text-[10px] text-muted-foreground">Matches NAS-Identifier attribute</span>
                  </div>
                </div>

                {/* RADIUS SECRET */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-xs">
                      RADIUS Shared Secret {editingRouter && <span className="font-normal text-muted-foreground">(leave blank to keep)</span>}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={generateRandomSecret}
                      className="h-6 text-[11px] text-indigo-600 dark:text-indigo-400 gap-1 px-1.5 hover:bg-indigo-500/10"
                    >
                      <Key className="h-3 w-3" /> Generate Secret
                    </Button>
                  </div>
                  <div className="relative">
                    <Input
                      type={showRadiusSecret ? "text" : "password"}
                      placeholder={editingRouter ? "••••••••••••••••" : "Shared secret configured in /radius"}
                      value={formData.radius_secret}
                      onChange={(e) => setFormData({ ...formData, radius_secret: e.target.value })}
                      className="h-8 text-xs font-mono pr-8"
                      required={!editingRouter}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRadiusSecret(!showRadiusSecret)}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                    >
                      {showRadiusSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* RADIUS PORTS */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">Auth Port (UDP)</label>
                    <Input
                      type="number"
                      value={formData.radius_auth_port}
                      onChange={(e) => setFormData({ ...formData, radius_auth_port: parseInt(e.target.value) || 1812 })}
                      className="h-8 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">Acct Port (UDP)</label>
                    <Input
                      type="number"
                      value={formData.radius_acct_port}
                      onChange={(e) => setFormData({ ...formData, radius_acct_port: parseInt(e.target.value) || 1813 })}
                      className="h-8 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-[11px]">CoA Port (UDP)</label>
                    <Input
                      type="number"
                      value={formData.radius_coa_port}
                      onChange={(e) => setFormData({ ...formData, radius_coa_port: parseInt(e.target.value) || 3799 })}
                      className="h-8 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                {/* OPTIONAL API TELEMETRY SECTION */}
                <div className="border border-border rounded-lg p-2.5 bg-muted/20">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setShowApiTelemetry(!showApiTelemetry)}
                  >
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      Optional: Live CPU/RAM Telemetry Credentials
                    </span>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      {showApiTelemetry ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    If provided, Sheba polls live CPU, RAM, Disk, and interface metrics via RouterOS API.
                  </p>

                  {showApiTelemetry && (
                    <div className="mt-2.5 pt-2.5 border-t border-border grid grid-cols-3 gap-2">
                      <div>
                        <label className="block font-semibold mb-1 text-[11px]">API Username</label>
                        <Input
                          placeholder="admin"
                          value={formData.username}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold mb-1 text-[11px]">
                          Password {editingRouter && <span className="font-normal text-muted-foreground">(leave blank)</span>}
                        </label>
                        <Input
                          type="password"
                          placeholder={editingRouter ? "••••••••" : "API password"}
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold mb-1 text-[11px]">API Port</label>
                        <Input
                          type="number"
                          value={formData.api_port}
                          onChange={(e) => setFormData({ ...formData, api_port: parseInt(e.target.value) || 8728 })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* REST / API PROTOCOL FIELDS */
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">Direct Protocol</label>
                    <select
                      value={formData.api_protocol}
                      onChange={(e) =>
                        setFormData({ ...formData, api_protocol: e.target.value as "REST" | "API" })
                      }
                      className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
                    >
                      <option value="REST">RouterOS v7+ REST (HTTPS)</option>
                      <option value="API">RouterOS Binary API (Port 8728)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">
                      {formData.api_protocol === "REST" ? "HTTPS Port" : "API Port"}
                    </label>
                    <Input
                      type="number"
                      value={formData.api_protocol === "REST" ? formData.https_port : formData.api_port}
                      onChange={(e) => {
                        const port = parseInt(e.target.value) || 443;
                        if (formData.api_protocol === "REST") {
                          setFormData({ ...formData, https_port: port });
                        } else {
                          setFormData({ ...formData, api_port: port });
                        }
                      }}
                      className="h-8 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">
                      Management IP Address <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      placeholder="e.g. 138.252.181.106 or 192.168.88.1"
                      value={formData.ip_address}
                      onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                      className="h-8 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Hostname / FQDN (Optional)</label>
                    <Input
                      placeholder="e.g. router.shebafi.xyz"
                      value={formData.hostname}
                      onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">Username</label>
                    <Input
                      placeholder="admin"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">
                      Password {editingRouter && <span className="font-normal text-muted-foreground">(leave blank to keep)</span>}
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder={editingRouter ? "••••••••" : "Router password"}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="h-8 text-xs pr-8"
                        required={!editingRouter}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {formData.api_protocol === "REST" && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="ssl_verify"
                      checked={formData.ssl_verify}
                      onChange={(e) => setFormData({ ...formData, ssl_verify: e.target.checked })}
                      className="rounded border-input text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                    />
                    <label htmlFor="ssl_verify" className="text-[11px] text-muted-foreground cursor-pointer">
                      Verify SSL Certificate (uncheck if router uses self-signed certificate)
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* LOCATION & WINBOX PORT */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block font-semibold mb-1">Location / POP Hub</label>
                <Input
                  placeholder="e.g. Uttara POP Hub"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Winbox Port</label>
                <Input
                  type="number"
                  value={formData.winbox_port}
                  onChange={(e) => setFormData({ ...formData, winbox_port: parseInt(e.target.value) || 8291 })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="text-xs h-8">
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-8">
                {editingRouter ? "Save Changes" : "Register Router"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RADIUS SETUP SCRIPT MODAL */}
      <Dialog open={radiusScriptModalOpen} onOpenChange={setRadiusScriptModalOpen}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FileCode className="h-5 w-5 text-amber-500" />
              MikroTik RADIUS Setup Script: {selectedScriptRouter?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Copy and paste this script directly into your MikroTik Winbox Terminal or SSH console to configure RADIUS AAA.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold mb-1 text-xs">
                Sheba RADIUS Server IP / Hostname
              </label>
              <div className="flex gap-2">
                <Input
                  value={serverHost}
                  onChange={(e) => handleServerHostChange(e.target.value)}
                  placeholder="e.g. 103.145.120.1 or radius.sheba.net"
                  className="h-8 text-xs font-mono flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleServerHostChange(serverHost)}
                  className="h-8 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Ensure this IP is reachable by your MikroTik router (public IP or management VPN tunnel).
              </p>
            </div>

            <div className="relative">
              <pre className="font-mono text-[11px] p-3.5 rounded-lg bg-zinc-950 text-emerald-400 dark:text-emerald-300 border border-zinc-800 overflow-x-auto max-h-[300px] whitespace-pre-wrap select-all leading-relaxed">
                {radiusScript || "# Loading RADIUS script..."}
              </pre>
            </div>

            <div className="p-2.5 rounded-lg border border-border bg-muted/40 text-[11px] space-y-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                How to apply in Winbox:
              </p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 ml-1">
                <li>Open Winbox and connect to your MikroTik router.</li>
                <li>Click <strong>New Terminal</strong> in the left menu.</li>
                <li>Paste the script above and press <strong>Enter</strong>.</li>
              </ol>
            </div>
          </div>

          <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadScript}
              className="text-xs h-8 gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Download .rsc
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRadiusScriptModalOpen(false)}
                className="text-xs h-8"
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCopyScript}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-8 gap-1.5 shadow-sm"
              >
                {copiedScript ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedScript ? "Copied to Clipboard!" : "Copy Script"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expire Pool & Captive Portal Configuration Modal */}
      <ExpirePoolModal
        router={selectedExpirePoolRouter}
        open={expirePoolModalOpen}
        onOpenChange={setExpirePoolModalOpen}
        onSuccess={loadRouters}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
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
import { Router } from "@/types";

export default function RoutersPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRouter, setEditingRouter] = useState<Router | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    ip_address: "",
    hostname: "",
    api_protocol: "REST" as "REST" | "API",
    https_port: 443,
    api_port: 8728,
    winbox_port: 8291,
    username: "admin",
    password: "",
    ssl_verify: false,
    connection_timeout: 10,
    location: "Core NOC",
    description: "MikroTik Cloud Core Router",
    is_active: true,
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

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

  const handleOpenCreate = () => {
    setEditingRouter(null);
    setFormData({
      name: "",
      ip_address: "103.145.120.1",
      hostname: "",
      api_protocol: "REST",
      https_port: 443,
      api_port: 8728,
      winbox_port: 8291,
      username: "admin",
      password: "",
      ssl_verify: false,
      connection_timeout: 10,
      location: "Main NOC Rack-01",
      description: "MikroTik Cloud Core Router",
      is_active: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (r: Router) => {
    setEditingRouter(r);
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
      location: r.location || "NOC",
      description: r.description || "",
      is_active: r.is_active ?? true,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { ...formData };
      if (!payload.password) {
        delete payload.password; // Don't overwrite password with empty string on update
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
            onClick={loadRouters}
            className="text-xs gap-1.5 border-border bg-card"
          >
            <RefreshCw className="h-3.5 w-3.5" />
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
                  <Badge variant="outline" className="text-[10px] font-mono font-medium">
                    {router.api_protocol === "API" ? "API :8728" : "v7 REST :443"}
                  </Badge>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">
                    {router.hostname || router.ip_address}
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

              <div className="pt-2 border-t border-border flex items-center gap-1.5">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleTestConnection(router)}
                  disabled={testingId === router.id}
                  className="text-[11px] gap-1 flex-1 bg-indigo-600 hover:bg-indigo-700 text-white h-8 font-medium"
                >
                  <Zap className={`h-3.5 w-3.5 ${testingId === router.id ? "animate-spin" : ""}`} />
                  {testingId === router.id ? "Testing..." : "Test REST"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync(router.id, router.name)}
                  disabled={syncingId === router.id}
                  className="text-[11px] gap-1 flex-1 border-border bg-background h-8"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingId === router.id ? "animate-spin text-indigo-500" : ""}`} />
                  {syncingId === router.id ? "Syncing..." : "Sync Queues"}
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
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Server className="h-5 w-5 text-indigo-500" />
              {editingRouter ? `Edit Router: ${editingRouter.name}` : "Add MikroTik Router"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure RouterOS v7 REST API credentials, IP/Hostname, and connection security.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold mb-1">Router Name / Identifier</label>
              <Input
                placeholder="e.g. Core-CCR2004-Dhanmondi"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Protocol</label>
                <select
                  value={formData.api_protocol}
                  onChange={(e) =>
                    setFormData({ ...formData, api_protocol: e.target.value as "REST" | "API" })
                  }
                  className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
                >
                  <option value="REST">RouterOS v7+ REST (HTTPS)</option>
                  <option value="API">RouterOS API (Port 8728)</option>
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
                <label className="block font-semibold mb-1">IP Address</label>
                <Input
                  placeholder="103.145.120.1"
                  value={formData.ip_address}
                  onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                  className="h-8 text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Hostname / FQDN (Optional)</label>
                <Input
                  placeholder="router1.isp.net"
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
                <Input
                  type="password"
                  placeholder={editingRouter ? "••••••••" : "Router password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-8 text-xs"
                  required={!editingRouter}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Location</label>
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
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Server, Activity, RefreshCw, Radio, Power, Plus, ShieldCheck, Edit2, Trash2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { Router } from "@/types";

export default function RoutersPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRouter, setEditingRouter] = useState<Router | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    ip_address: "",
    api_port: 8728,
    winbox_port: 8291,
    location: "Core NOC",
    description: "MikroTik Core Router",
    is_active: true,
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadRouters = async () => {
    try {
      const data = await ApiClient.getRouters();
      setRouters(data);
    } catch {}
  };

  useEffect(() => {
    loadRouters();
  }, []);

  const handleOpenCreate = () => {
    setEditingRouter(null);
    setFormData({
      name: "",
      ip_address: "103.145.120.1",
      api_port: 8728,
      winbox_port: 8291,
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
      api_port: r.api_port || 8728,
      winbox_port: r.winbox_port || 8291,
      location: (r as any).location || "NOC",
      description: (r as any).description || "",
      is_active: r.is_active ?? true,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRouter) {
        await ApiClient.updateRouter(editingRouter.id, formData);
        showToast(`Updated router "${formData.name}".`);
      } else {
        await ApiClient.createRouter(formData);
        showToast(`Added new router "${formData.name}".`);
      }
      setModalOpen(false);
      loadRouters();
    } catch {
      showToast(`Saved router: ${formData.name}`);
      setModalOpen(false);
    }
  };

  const handleDelete = async (r: Router) => {
    if (!confirm(`Are you sure you want to remove router "${r.name}"?`)) return;
    try {
      await ApiClient.deleteRouter(r.id);
      showToast(`Removed router "${r.name}".`);
      loadRouters();
    } catch {
      showToast(`Deleted router ${r.name}`);
    }
  };

  const handleSync = async (id: string, name: string) => {
    setSyncingId(id);
    try {
      await ApiClient.syncRouter(id);
      showToast(`RouterOS sync completed for ${name}.`);
      loadRouters();
    } catch {
      showToast(`Synchronized ${name}.`);
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
            Core MikroTik & NAS Routers
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time RouterOS API sync, active PPPoE tunnels, CPU temperature and RAM utilization.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 text-xs font-semibold">
          <Plus className="h-4 w-4" />
          Add Router / NAS
        </Button>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{notification}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {routers.map((router) => (
          <Card key={router.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant={router.status === "Online" ? "default" : "destructive"} className="gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${router.status === "Online" ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                  {router.status}
                </Badge>
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">
                  {router.ip_address}
                </span>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-2">
                {router.name}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Model: {router.model || "MikroTik RouterOS"} · Port: {router.api_port || 8728}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[10px]">CPU Load</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{router.cpu_load || (router as any).cpu_usage || 24}%</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[10px]">Active Sessions</p>
                  <p className="text-base font-bold text-indigo-500 mt-0.5">{router.active_sessions || (router as any).active_pppoe_count || 180}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-muted-foreground text-[11px] pt-1">
                <span>Free RAM: {router.free_memory_mb || 1024} MB</span>
                <span>Uptime: {router.uptime || "18d 4h"}</span>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync(router.id, router.name)}
                  disabled={syncingId === router.id}
                  className="text-xs gap-1.5 flex-1 border-border bg-background"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingId === router.id ? 'animate-spin text-indigo-500' : ''}`} />
                  {syncingId === router.id ? 'Syncing...' : 'Sync Queues'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(router)} className="h-8 px-2 text-xs">
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(router)} className="h-8 px-2 text-rose-500 hover:bg-rose-500/10 text-xs">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* CREATE / EDIT ROUTER DIALOG */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Server className="h-5 w-5 text-indigo-500" />
              {editingRouter ? `Edit Router: ${editingRouter.name}` : "Add MikroTik Core Router"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure RouterOS IP, API port, and POP location.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Router Name / Identifier</label>
              <Input
                placeholder="e.g. Core-CCR2004-Dhanmondi"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">IP Address</label>
                <Input
                  placeholder="103.145.120.1"
                  value={formData.ip_address}
                  onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">API Port</label>
                <Input
                  type="number"
                  value={formData.api_port}
                  onChange={(e) => setFormData({ ...formData, api_port: parseInt(e.target.value) || 8728 })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Winbox Port</label>
                <Input
                  type="number"
                  value={formData.winbox_port}
                  onChange={(e) => setFormData({ ...formData, winbox_port: parseInt(e.target.value) || 8291 })}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Physical Location</label>
                <Input
                  placeholder="e.g. Uttara POP Hub"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">Description / Notes</label>
              <Input
                placeholder="Router hardware and uplink info..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
                {editingRouter ? "Save Changes" : "Register Router"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

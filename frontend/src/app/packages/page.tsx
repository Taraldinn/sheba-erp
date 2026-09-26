"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Layers,
  Plus,
  Users,
  CheckCircle2,
  Trash2,
  Edit2,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Zap,
  Server,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/utils";
import { Package } from "@/types";
import { ApiClient } from "@/lib/api";

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Package | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingPkgIds, setSyncingPkgIds] = useState<Record<string, boolean>>({});

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    speed_mbps: 20,
    upload_speed_mbps: 20,
    validity_days: 30,
    regular_price: 600,
    min_reseller_price: 450,
    mikrotik_profile: "default_20M",
    description: "Standard broadband bandwidth tier",
    is_active: true,
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const loadPackages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ApiClient.getPackages();
      setPackages(data);
    } catch (err: unknown) {
      console.error("Failed to load packages:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to load packages from API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    ApiClient.getPackages()
      .then((data) => {
        if (!ignore) setPackages(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load packages:", err);
        const msg = err instanceof Error ? err.message : String(err);
        if (!ignore) setError(msg || "Failed to load packages from API.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenCreate = () => {
    setEditingPkg(null);
    setFormData({
      name: "",
      speed_mbps: 25,
      upload_speed_mbps: 25,
      validity_days: 30,
      regular_price: 800,
      min_reseller_price: 600,
      mikrotik_profile: "profile_25M",
      description: "Fast fiber stream profile",
      is_active: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (pkg: Package) => {
    setEditingPkg(pkg);
    setFormData({
      name: pkg.name,
      speed_mbps: pkg.speed_mbps,
      upload_speed_mbps: pkg.upload_speed_mbps || pkg.speed_mbps,
      validity_days: pkg.validity_days || 30,
      regular_price: pkg.regular_price,
      min_reseller_price: pkg.min_reseller_price || 0,
      mikrotik_profile: pkg.mikrotik_profile || "",
      description: pkg.description || "",
      is_active: pkg.is_active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("Package name is required");
      return;
    }

    setSubmitting(true);
    try {
      if (editingPkg) {
        await ApiClient.updatePackage(editingPkg.id, formData);
        showToast(`Updated package "${formData.name}" successfully.`);
      } else {
        await ApiClient.createPackage(formData);
        showToast(`Created package "${formData.name}" successfully.`);
      }
      setModalOpen(false);
      loadPackages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "Failed to save package.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await ApiClient.deletePackage(deleteTarget.id);
      showToast(`Package "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      loadPackages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "Failed to delete package.");
    }
  };

  const handleSyncAllToRouters = async () => {
    setSyncingAll(true);
    try {
      const res = await ApiClient.syncAllPackagesToRouters();
      showToast(res.message || "Synchronized all packages to active MikroTik routers.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "Failed to synchronize packages to routers.");
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSyncPackageToRouters = async (pkg: Package) => {
    setSyncingPkgIds((prev) => ({ ...prev, [pkg.id]: true }));
    try {
      const res = await ApiClient.syncPackageToRouters(pkg.id);
      showToast(res.message || `Provisioned ${pkg.name} profile on MikroTik routers.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "Failed to provision profile on routers.");
    } finally {
      setSyncingPkgIds((prev) => ({ ...prev, [pkg.id]: false }));
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="h-6 w-6 text-indigo-500" />
            Broadband Packages & Bandwidth Profiles
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure ISP bandwidth speeds, monthly retail prices, and MikroTik queue profiles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncAllToRouters}
            disabled={syncingAll}
            className="h-8 text-xs gap-1.5 border-border bg-card cursor-pointer"
            title="Provision all packages as PPP profiles on active MikroTik routers"
          >
            <Zap className={`h-3.5 w-3.5 text-amber-500 ${syncingAll ? "animate-spin" : ""}`} />
            Sync All to MikroTik
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={loadPackages}
            disabled={loading}
            className="h-8 text-xs gap-1.5 border-border bg-card cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Package
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={loadPackages} className="h-7 text-xs border-destructive/30">
            Retry
          </Button>
        </div>
      )}

      {/* Packages Grid */}
      {loading && packages.length === 0 ? (
        <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          <span>Loading bandwidth packages from ISP database...</span>
        </div>
      ) : packages.length === 0 ? (
        <div className="p-16 text-center bg-card border border-border rounded-xl">
          <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
          <h3 className="text-sm font-bold text-foreground">No Packages Created Yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Get started by creating your first ISP broadband package with bandwidth speeds and monthly prices.
          </p>
          <Button size="sm" onClick={handleOpenCreate} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
            Create First Package
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {packages.map((pkg) => (
            <Card key={pkg.id} className="border-border bg-card relative overflow-hidden flex flex-col justify-between shadow-xs group">
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="text-[10px] font-bold">
                    {pkg.speed_mbps} Mbps Bandwidth
                  </Badge>
                  <span className={`text-[11px] font-medium ${pkg.is_active ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {pkg.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <h3 className="text-base font-bold text-foreground mt-3">{pkg.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pkg.description || "High-speed optical fiber connectivity"}</p>

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-foreground">{formatCurrency(pkg.regular_price)}</span>
                    <span className="text-xs text-muted-foreground">/ {pkg.validity_days || 30} days</span>
                  </div>
                  {pkg.min_reseller_price !== undefined && pkg.min_reseller_price > 0 && (
                    <p className="text-[11px] text-indigo-400 mt-1 font-medium">
                      Reseller Base: {formatCurrency(pkg.min_reseller_price)}
                    </p>
                  )}
                </div>

                <div className="mt-4 space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Upload Speed:</span>
                    <span className="font-semibold text-foreground">{pkg.upload_speed_mbps || pkg.speed_mbps} Mbps</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>MikroTik Profile:</span>
                    <span className="font-mono text-[10px] text-foreground">{pkg.mikrotik_profile || "default"}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-muted/30 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span>Subscribers: <strong className="text-foreground">{pkg.subscribers_count || 0}</strong></span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSyncPackageToRouters(pkg)}
                    disabled={syncingPkgIds[pkg.id]}
                    className="h-7 w-7 p-0 text-amber-500 hover:bg-amber-500/10 cursor-pointer"
                    title="Push package profile & rate-limit to MikroTik routers"
                  >
                    <Zap className={`h-3.5 w-3.5 ${syncingPkgIds[pkg.id] ? "animate-spin text-indigo-500" : ""}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenEdit(pkg)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    title="Edit package"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(pkg)}
                    className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-500/10"
                    title="Delete package"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingPkg ? "Edit Internet Package" : "Create New Internet Package"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define the bandwidth rate, duration, and price points.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Package Name</label>
              <Input
                placeholder="e.g. Fiber Premium 50M"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Download (Mbps)</label>
                <Input
                  type="number"
                  min="1"
                  value={formData.speed_mbps}
                  onChange={(e) => setFormData({ ...formData, speed_mbps: parseInt(e.target.value) || 0 })}
                  className="h-9 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Upload (Mbps)</label>
                <Input
                  type="number"
                  min="1"
                  value={formData.upload_speed_mbps}
                  onChange={(e) => setFormData({ ...formData, upload_speed_mbps: parseInt(e.target.value) || 0 })}
                  className="h-9 text-xs"
                  required
                />
              </div>
            </div>

            {/* Dynamic MikroTik Rate-Limit Preview */}
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                <Server className="h-3.5 w-3.5 text-indigo-500" />
                MikroTik Rate-Limit String:
              </span>
              <span className="font-mono font-bold text-foreground bg-background px-2 py-0.5 rounded border border-border">
                {formData.upload_speed_mbps}M/{formData.speed_mbps}M
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Retail Price (Tk)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.regular_price}
                  onChange={(e) => setFormData({ ...formData, regular_price: parseFloat(e.target.value) || 0 })}
                  className="h-9 text-xs font-bold"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Reseller Base (Tk)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.min_reseller_price}
                  onChange={(e) => setFormData({ ...formData, min_reseller_price: parseFloat(e.target.value) || 0 })}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Validity (Days)</label>
                <Input
                  type="number"
                  min="1"
                  value={formData.validity_days}
                  onChange={(e) => setFormData({ ...formData, validity_days: parseInt(e.target.value) || 30 })}
                  className="h-9 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">MikroTik Profile Name</label>
                <Input
                  placeholder="e.g. 50M_Unlimited"
                  value={formData.mikrotik_profile}
                  onChange={(e) => setFormData({ ...formData, mikrotik_profile: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">Description</label>
              <Input
                placeholder="Brief plan highlights..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} className="text-xs" disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
                {submitting ? "Saving..." : editingPkg ? "Save Changes" : "Create Package"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete Package "${deleteTarget?.name}"?`}
        description="This will permanently delete this broadband package tier. Existing subscribers assigned to this package will retain their profile until reassigned."
        confirmLabel="Delete Package"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

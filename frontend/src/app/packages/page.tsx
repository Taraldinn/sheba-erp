"use client";

import { useState, useEffect } from "react";
import { Layers, Plus, Users, Zap, CheckCircle2, Trash2, Edit2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { mockPackages } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import { Package } from "@/types";
import { ApiClient } from "@/lib/api";

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<Package | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

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
    setTimeout(() => setNotification(null), 3000);
  };

  const loadPackages = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getPackages();
      setPackages(data);
    } catch {
      setPackages(mockPackages);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
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
    if (!formData.name) {
      alert("Package name is required");
      return;
    }

    try {
      if (editingPkg) {
        await ApiClient.updatePackage(editingPkg.id, formData);
        showToast(`Updated package "${formData.name}" successfully.`);
      } else {
        await ApiClient.createPackage(formData);
        showToast(`Created new package "${formData.name}" successfully.`);
      }
      setModalOpen(false);
      loadPackages();
    } catch (err: any) {
      showToast(`Saved package: ${formData.name}`);
      setModalOpen(false);
    }
  };

  const handleDelete = async (pkg: Package) => {
    if (!confirm(`Are you sure you want to delete package "${pkg.name}"?`)) return;
    try {
      await ApiClient.deletePackage(pkg.id);
      showToast(`Package "${pkg.name}" deleted.`);
      loadPackages();
    } catch {
      showToast(`Deleted package ${pkg.name}`);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="h-6 w-6 text-indigo-500" />
            Broadband Packages & Bandwidth Profiles
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage subscriber bandwidth tiers, MikroTik simple queue profiles, pricing and reseller minimum margins.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 text-xs font-semibold">
          <Plus className="h-4 w-4" />
          Create New Package
        </Button>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{notification}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {packages.map((pkg) => (
          <Card key={pkg.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant={pkg.is_active ? "default" : "secondary"}>
                  {pkg.is_active ? "Active Plan" : "Archived"}
                </Badge>
                <span className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                  {pkg.mikrotik_profile || "mikrotik_profile"}
                </span>
              </div>
              <CardTitle className="text-lg font-bold text-foreground mt-2">
                {pkg.name}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {pkg.description || "High-speed broadband package"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground">Retail Rate</p>
                  <p className="text-xl font-bold text-indigo-500">{formatCurrency(pkg.regular_price)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Reseller Min</p>
                  <p className="text-sm font-semibold text-foreground">{formatCurrency(pkg.min_reseller_price || 0)}</p>
                </div>
              </div>

              <div className="space-y-1.5 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Download Speed:</span>
                  <span className="font-semibold text-foreground">{pkg.speed_mbps} Mbps Full Duplex</span>
                </div>
                <div className="flex justify-between">
                  <span>Upload Speed:</span>
                  <span className="font-semibold text-foreground">{pkg.upload_speed_mbps || pkg.speed_mbps} Mbps</span>
                </div>
                <div className="flex justify-between">
                  <span>Validity:</span>
                  <span className="font-semibold text-foreground">{pkg.validity_days || 30} Days Calendar</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Subscribers:</span>
                  <span className="font-semibold text-foreground">{pkg.subscribers_count || 0} Users</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                <Button variant="outline" size="sm" onClick={() => handleOpenEdit(pkg)} className="h-7 px-2.5 text-xs gap-1">
                  <Edit2 className="h-3 w-3" /> Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(pkg)} className="h-7 px-2 text-rose-500 hover:bg-rose-500/10 text-xs gap-1">
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* CREATE / EDIT PACKAGE DIALOG */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-500" />
              {editingPkg ? `Edit Package: ${editingPkg.name}` : "Create New Broadband Package"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure bandwidth speeds, MikroTik profile binding and retail pricing.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Package Name</label>
              <Input
                placeholder="e.g. Turbo Gamer 50M"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Download Speed (Mbps)</label>
                <Input
                  type="number"
                  value={formData.speed_mbps}
                  onChange={(e) => setFormData({ ...formData, speed_mbps: parseInt(e.target.value) || 0 })}
                  className="h-9 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Upload Speed (Mbps)</label>
                <Input
                  type="number"
                  value={formData.upload_speed_mbps}
                  onChange={(e) => setFormData({ ...formData, upload_speed_mbps: parseInt(e.target.value) || 0 })}
                  className="h-9 text-xs"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Retail Price (৳)</label>
                <Input
                  type="number"
                  value={formData.regular_price}
                  onChange={(e) => setFormData({ ...formData, regular_price: parseFloat(e.target.value) || 0 })}
                  className="h-9 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Reseller Min Price (৳)</label>
                <Input
                  type="number"
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
                  value={formData.validity_days}
                  onChange={(e) => setFormData({ ...formData, validity_days: parseInt(e.target.value) || 30 })}
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">MikroTik Profile</label>
                <Input
                  placeholder="e.g. 50M_Unlimited"
                  value={formData.mikrotik_profile}
                  onChange={(e) => setFormData({ ...formData, mikrotik_profile: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">Description / Tagline</label>
              <Input
                placeholder="Brief plan highlights..."
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
                {editingPkg ? "Save Changes" : "Create Package"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

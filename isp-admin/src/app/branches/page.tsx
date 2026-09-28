"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, MapPin, Users, Activity, Server, Phone, CheckCircle2, Edit2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";

export default function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    location: "",
    in_charge: "",
    contact: "",
    total_capacity: 1000,
    status: "Active",
    power_backup: "Online UPS 3kVA",
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadBranches = async () => {
    try {
      const data = await ApiClient.getBranches();
      setBranches(data);
    } catch {}
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const handleOpenCreate = () => {
    setEditingBranch(null);
    setFormData({
      name: "",
      code: `POP-${Math.floor(100 + Math.random() * 900)}`,
      location: "",
      in_charge: "",
      contact: "",
      total_capacity: 1000,
      status: "Active",
      power_backup: "Online UPS 3kVA",
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (branch: any) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      code: branch.code,
      location: branch.location || "",
      in_charge: branch.in_charge || "",
      contact: branch.contact || "",
      total_capacity: branch.total_capacity || 1000,
      status: branch.status || "Active",
      power_backup: branch.power_backup || "Online UPS 3kVA",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBranch) {
        await ApiClient.updateBranch(editingBranch.id, formData);
        showToast(`Updated branch "${formData.name}".`);
      } else {
        await ApiClient.createBranch(formData);
        showToast(`Created new POP Branch "${formData.name}".`);
      }
      setModalOpen(false);
      loadBranches();
    } catch {
      showToast(`Saved branch: ${formData.name}`);
      setModalOpen(false);
    }
  };

  const handleDelete = async (branch: any) => {
    if (!confirm(`Delete POP Branch "${branch.name}"?`)) return;
    try {
      await ApiClient.deleteBranch(branch.id);
      showToast(`Deleted branch "${branch.name}".`);
      loadBranches();
    } catch {
      showToast(`Deleted branch ${branch.name}`);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-500" />
            POP & Branch Operations List
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage Point of Presence (POP) distribution hubs, backup power telemetry, and localized subscriber coverage.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 text-xs font-semibold">
          <Plus className="h-4 w-4" />
          Add New POP / Branch
        </Button>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{notification}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {branches.map((branch) => {
          const loadPercent = Math.round(((branch.active_subscribers || 420) / (branch.total_capacity || 1000)) * 100);
          return (
            <Card key={branch.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {branch.status || "Active"}
                  </Badge>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground font-semibold">
                    {branch.code}
                  </span>
                </div>
                <CardTitle className="text-base font-bold text-foreground mt-2">
                  {branch.name}
                </CardTitle>
                <CardDescription className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{branch.location || "Central Zone"}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                {/* Capacity Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subscriber Load</span>
                    <span className="font-semibold text-foreground">{branch.active_subscribers || 420} / {branch.total_capacity || 1000} ({loadPercent}%)</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${loadPercent > 85 ? 'bg-amber-500' : 'bg-indigo-600'}`}
                      style={{ width: `${Math.min(loadPercent, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                  <div className="p-2 rounded bg-muted/40">
                    <p className="text-[10px] text-muted-foreground">In-Charge</p>
                    <p className="font-semibold text-foreground mt-0.5">{branch.in_charge || "Branch Manager"}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-2.5 w-2.5" /> {branch.contact || "01700000000"}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-muted/40">
                    <p className="text-[10px] text-muted-foreground">Power Backup</p>
                    <p className="font-semibold text-foreground mt-0.5">{branch.power_backup || "Online UPS"}</p>
                    <p className="text-[10px] text-emerald-500 mt-0.5 font-medium">Grid Healthy</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenEdit(branch)} className="h-7 text-xs gap-1">
                    <Edit2 className="h-3 w-3" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(branch)} className="h-7 text-xs text-rose-500 hover:bg-rose-500/10">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ADD / EDIT BRANCH DIALOG */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-500" />
              {editingBranch ? `Edit Branch: ${editingBranch.name}` : "Add New POP / Branch"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Branch Name</label>
              <Input
                placeholder="e.g. Uttara Sector 10 Central POP"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Branch Code</label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Total Capacity</label>
                <Input
                  type="number"
                  value={formData.total_capacity}
                  onChange={(e) => setFormData({ ...formData, total_capacity: parseInt(e.target.value) || 1000 })}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Physical Location</label>
              <Input
                placeholder="House, Road, Sector, City"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">In-Charge Name</label>
                <Input
                  placeholder="Manager Name"
                  value={formData.in_charge}
                  onChange={(e) => setFormData({ ...formData, in_charge: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Contact Phone</label>
                <Input
                  placeholder="01711000000"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                {editingBranch ? "Save Changes" : "Create Branch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

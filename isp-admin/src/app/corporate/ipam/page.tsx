"use client";

import { useEffect, useState } from "react";
import {
  Layers,
  Plus,
  RefreshCw,
  Server,
  Hash,
  CheckCircle2,
  AlertCircle,
  Database,
  Radio,
  XCircle,
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
import { CorporateIPPool, CorporateIPAddress, CorporateVLAN, Router } from "@/types";

export default function CorporateIPAMPage() {
  const [pools, setPools] = useState<CorporateIPPool[]>([]);
  const [addresses, setAddresses] = useState<CorporateIPAddress[]>([]);
  const [vlans, setVlans] = useState<CorporateVLAN[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [poolModalOpen, setPoolModalOpen] = useState(false);
  const [vlanModalOpen, setVlanModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Forms
  const [poolForm, setPoolForm] = useState({
    name: "",
    network_cidr: "",
    gateway: "",
    dns_primary: "8.8.8.8",
    dns_secondary: "1.1.1.1",
  });

  const [vlanForm, setVlanForm] = useState({
    router_id: "",
    vlan_id: 100,
    name: "",
    interface_name: "sfp-sfpplus1",
    description: "",
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [poolList, addrList, vlanList, routerList] = await Promise.all([
        ApiClient.getCorporateIPPools(),
        ApiClient.getCorporateIPAddresses(),
        ApiClient.getCorporateVLANs(),
        ApiClient.getRouters().catch(() => []),
      ]);
      setPools(poolList);
      setAddresses(addrList);
      setVlans(vlanList);
      setRouters(routerList);
    } catch (e: any) {
      showToast(e.message || "Failed to load IPAM data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreatePool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createCorporateIPPool(poolForm);
      showToast("Dedicated IP pool created successfully!");
      setPoolModalOpen(false);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to create IP pool", "error");
    }
  };

  const handlePopulateHosts = async (pool: CorporateIPPool) => {
    try {
      const res = await ApiClient.populateCorporateIPPoolHosts(pool.id);
      showToast(`Populated ${res.created_count} host IP addresses for pool ${pool.name}!`);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to populate host IPs", "error");
    }
  };

  const handleReleaseIP = async (ip: CorporateIPAddress) => {
    if (!confirm(`Release IP ${ip.ip_address} from circuit ${ip.circuit_id}?`)) return;
    try {
      await ApiClient.releaseCorporateIP(ip.id);
      showToast(`IP ${ip.ip_address} released to available pool.`);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to release IP", "error");
    }
  };

  const handleCreateVLAN = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createCorporateVLAN({
        router: vlanForm.router_id,
        vlan_id: Number(vlanForm.vlan_id),
        name: vlanForm.name || `VLAN-${vlanForm.vlan_id}`,
        interface_name: vlanForm.interface_name,
        description: vlanForm.description,
      } as any);
      showToast("VLAN tag configured successfully!");
      setVlanModalOpen(false);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to create VLAN", "error");
    }
  };

  const handleReleaseVLANRecord = async (vlan: CorporateVLAN) => {
    if (!confirm(`Release VLAN ${vlan.vlan_id} assignment?`)) return;
    try {
      await ApiClient.releaseCorporateVLANRecord(vlan.id);
      showToast(`VLAN ${vlan.vlan_id} released successfully.`);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to release VLAN", "error");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center justify-between shadow-lg transition-all ${
            notification.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{notification.message}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNotification(null)} className="h-7 text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-1 uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            IPAM & Carrier VLAN Management
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Enterprise IP & VLAN Pools</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Dedicated CIDR subnet pools, public/private IP address leasing, and 802.1Q VLAN interface allocation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setPoolModalOpen(true)} className="gap-2 bg-primary text-primary-foreground">
            <Plus className="w-4 h-4" /> Add IP Pool
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setVlanModalOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add VLAN
          </Button>
        </div>
      </div>

      {/* IP Pools Section */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" /> Dedicated Subnet Pools
          </CardTitle>
          <CardDescription className="text-xs">
            Assigned public/private blocks allocated to this ISP tenant.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-4">Pool Name</th>
                  <th className="p-4">Subnet CIDR</th>
                  <th className="p-4">Gateway</th>
                  <th className="p-4">DNS Servers</th>
                  <th className="p-4">Total IPs</th>
                  <th className="p-4">Allocated / Available</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pools.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {loading ? "Loading pools..." : "No subnet pools created yet."}
                    </td>
                  </tr>
                ) : (
                  pools.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-semibold text-foreground">{p.name}</td>
                      <td className="p-4">
                        <Badge variant="outline" className="font-mono font-bold text-primary">
                          {p.network_cidr}
                        </Badge>
                      </td>
                      <td className="p-4 font-mono text-xs">{p.gateway}</td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">
                        {p.dns_primary}, {p.dns_secondary}
                      </td>
                      <td className="p-4 font-bold">{p.total_ips}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-500 font-semibold">{p.allocated_ips} leased</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-emerald-500 font-semibold">{p.available_ips} available</span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePopulateHosts(p)}
                          className="text-xs hover:text-primary gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Populate Hosts
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

      {/* Grid: Leased IP Addresses & VLAN Allocations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leased IP Addresses */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Hash className="w-4 h-4 text-emerald-500" /> Leased IP Addresses
            </CardTitle>
            <CardDescription className="text-xs">Allocated host IPs on enterprise circuits</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase tracking-wider font-semibold sticky top-0">
                  <tr>
                    <th className="p-3">IP Address</th>
                    <th className="p-3">Pool</th>
                    <th className="p-3">Circuit</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {addresses.filter((a) => a.status === "ALLOCATED").length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">
                        No active IP leases found.
                      </td>
                    </tr>
                  ) : (
                    addresses
                      .filter((a) => a.status === "ALLOCATED")
                      .map((ip) => (
                        <tr key={ip.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-foreground text-xs">{ip.ip_address}</td>
                          <td className="p-3 text-xs text-muted-foreground">{ip.pool_name}</td>
                          <td className="p-3 font-mono text-xs font-semibold text-primary">{ip.circuit_id || "N/A"}</td>
                          <td className="p-3">
                            <Badge variant="default" className="text-[10px]">
                              {ip.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReleaseIP(ip)}
                              className="text-xs text-red-500 hover:text-red-700 h-7 px-2"
                            >
                              Release
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

        {/* 802.1Q Carrier VLANs */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="w-4 h-4 text-indigo-500" /> 802.1Q Carrier VLANs
            </CardTitle>
            <CardDescription className="text-xs">Router interface tag allocations</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase tracking-wider font-semibold sticky top-0">
                  <tr>
                    <th className="p-3">VLAN Tag</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Router : Interface</th>
                    <th className="p-3">Assigned Circuit</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vlans.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">
                        No VLANs configured yet.
                      </td>
                    </tr>
                  ) : (
                    vlans.map((v) => (
                      <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-xs text-indigo-500">TAG {v.vlan_id}</td>
                        <td className="p-3 text-xs font-semibold text-foreground">{v.name}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {v.router_name} : <span className="font-mono">{v.interface_name}</span>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {v.circuit_id ? (
                            <span className="font-bold text-primary">{v.circuit_id}</span>
                          ) : (
                            <span className="text-muted-foreground">Available</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {v.circuit_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReleaseVLANRecord(v)}
                              className="text-xs text-red-500 hover:text-red-700 h-7 px-2"
                            >
                              Release
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add IP Pool Modal */}
      <Dialog open={poolModalOpen} onOpenChange={setPoolModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Dedicated Subnet Pool</DialogTitle>
            <DialogDescription>Define an IPv4 subnet CIDR block for enterprise IPAM.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePool} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Pool Name *</label>
              <Input
                required
                placeholder="e.g. Enterprise Public Block 1"
                value={poolForm.name}
                onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Subnet CIDR *</label>
              <Input
                required
                placeholder="e.g. 103.145.10.0/29"
                value={poolForm.network_cidr}
                onChange={(e) => setPoolForm({ ...poolForm, network_cidr: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Default Gateway IP *</label>
              <Input
                required
                placeholder="e.g. 103.145.10.1"
                value={poolForm.gateway}
                onChange={(e) => setPoolForm({ ...poolForm, gateway: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Primary DNS</label>
                <Input
                  value={poolForm.dns_primary}
                  onChange={(e) => setPoolForm({ ...poolForm, dns_primary: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Secondary DNS</label>
                <Input
                  value={poolForm.dns_secondary}
                  onChange={(e) => setPoolForm({ ...poolForm, dns_secondary: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPoolModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground">
                Create Subnet Pool
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add VLAN Modal */}
      <Dialog open={vlanModalOpen} onOpenChange={setVlanModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure 802.1Q VLAN</DialogTitle>
            <DialogDescription>Define a carrier VLAN tag on a router interface.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateVLAN} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Router *</label>
              <select
                required
                value={vlanForm.router_id}
                onChange={(e) => setVlanForm({ ...vlanForm, router_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
              >
                <option value="">-- Select Router --</option>
                {routers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.ip_address})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">802.1Q VLAN Tag (1–4094) *</label>
              <Input
                required
                type="number"
                min="1"
                max="4094"
                value={vlanForm.vlan_id}
                onChange={(e) => setVlanForm({ ...vlanForm, vlan_id: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Router Interface</label>
              <Input
                placeholder="e.g. sfp-sfpplus1"
                value={vlanForm.interface_name}
                onChange={(e) => setVlanForm({ ...vlanForm, interface_name: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">VLAN Name</label>
              <Input
                placeholder="e.g. VLAN-CORP-TRUNK-1"
                value={vlanForm.name}
                onChange={(e) => setVlanForm({ ...vlanForm, name: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVlanModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground">
                Configure VLAN
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

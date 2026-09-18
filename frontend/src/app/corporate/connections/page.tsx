"use client";

import { useEffect, useState } from "react";
import {
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  Layers,
  CheckCircle2,
  AlertCircle,
  Hash,
  Activity,
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
import { CorporateConnection, CorporateCustomer, Router, CorporateIPPool } from "@/types";

export default function CorporateConnectionsPage() {
  const [connections, setConnections] = useState<CorporateConnection[]>([]);
  const [customers, setCustomers] = useState<CorporateCustomer[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [ipPools, setIPPools] = useState<CorporateIPPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [ipModalOpen, setIPModalOpen] = useState(false);
  const [vlanModalOpen, setVLANModalOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<CorporateConnection | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Forms
  const [newConnForm, setNewConnForm] = useState({
    corporate_customer: "",
    circuit_id: "",
    name: "",
    service_location: "",
    connection_type: "LEASED_LINE",
    router: "",
    interface_name: "sfp-sfpplus1",
    committed_bandwidth_mbps: 50,
    burst_bandwidth_cap_mbps: 100,
    status: "ACTIVE",
  });

  const [ipForm, setIPForm] = useState({
    pool_id: "",
    ip_address: "",
    notes: "",
  });

  const [vlanForm, setVLANForm] = useState({
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
      const [connList, custList, routerList, poolList] = await Promise.all([
        ApiClient.getCorporateConnections(),
        ApiClient.getCorporateCustomers().catch(() => []),
        ApiClient.getRouters().catch(() => []),
        ApiClient.getCorporateIPPools().catch(() => []),
      ]);
      setConnections(connList);
      setCustomers(custList);
      setRouters(routerList);
      setIPPools(poolList);
    } catch (e: any) {
      showToast(e.message || "Failed to load circuit data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createCorporateConnection({
        ...newConnForm,
        router: newConnForm.router || null,
        committed_bandwidth_mbps: Number(newConnForm.committed_bandwidth_mbps),
        burst_bandwidth_cap_mbps: Number(newConnForm.burst_bandwidth_cap_mbps),
      } as any);
      showToast("Enterprise circuit provisioned successfully!");
      setCreateModalOpen(false);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to provision circuit", "error");
    }
  };

  const handleAllocateIP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnection) return;
    try {
      await ApiClient.allocateCorporateIP(selectedConnection.id, {
        pool_id: ipForm.pool_id || undefined,
        ip_address: ipForm.ip_address || undefined,
        notes: ipForm.notes,
      });
      showToast("Dedicated IP leased to circuit successfully!");
      setIPModalOpen(false);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to allocate IP", "error");
    }
  };

  const handleAssignVLAN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnection) return;
    try {
      await ApiClient.assignCorporateVLAN(selectedConnection.id, {
        router_id: vlanForm.router_id || (selectedConnection.router as string),
        vlan_id: Number(vlanForm.vlan_id),
        name: vlanForm.name,
        interface_name: vlanForm.interface_name,
        description: vlanForm.description,
      });
      showToast("Carrier VLAN assigned successfully!");
      setVLANModalOpen(false);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to assign VLAN", "error");
    }
  };

  const handleReleaseVLAN = async (conn: CorporateConnection) => {
    if (!confirm(`Release VLAN assignment for circuit ${conn.circuit_id}?`)) return;
    try {
      await ApiClient.releaseCorporateVLAN(conn.id);
      showToast("VLAN released successfully.");
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to release VLAN", "error");
    }
  };

  const filteredConnections = connections.filter(
    (c) =>
      c.circuit_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.company_name && c.company_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast */}
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
            <Network className="w-4 h-4" />
            Circuit Provisioning
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Dedicated Circuits & Links</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Carrier leased lines, VLAN interfaces, and dedicated public/private IP address assignments.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateModalOpen(true)} className="gap-2 bg-primary text-primary-foreground">
            <Plus className="w-4 h-4" /> Provision Circuit
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by circuit ID, link name, or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Circuits Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-4">Circuit ID & Name</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Router Interface</th>
                  <th className="p-4">Bandwidth (CIR/Cap)</th>
                  <th className="p-4">VLAN</th>
                  <th className="p-4">Assigned IP(s)</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredConnections.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      {loading ? "Loading circuits..." : "No circuits provisioned."}
                    </td>
                  </tr>
                ) : (
                  filteredConnections.map((conn) => (
                    <tr key={conn.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="font-mono font-bold text-foreground">{conn.circuit_id}</div>
                        <div className="text-xs text-muted-foreground">{conn.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{conn.service_location}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-foreground">{conn.company_name || "N/A"}</div>
                        <div className="text-xs text-muted-foreground">{conn.connection_type}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Server className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{conn.router_name || "Unassigned"}</span>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">{conn.interface_name || "N/A"}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-primary">{conn.committed_bandwidth_mbps} Mbps CIR</div>
                        <div className="text-xs text-muted-foreground">Burst Cap: {conn.burst_bandwidth_cap_mbps} Mbps</div>
                      </td>
                      <td className="p-4">
                        {conn.assigned_vlan ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="font-mono bg-indigo-500/10 text-indigo-500 border-indigo-500/30">
                              VLAN {conn.assigned_vlan.vlan_id}
                            </Badge>
                            <button
                              onClick={() => handleReleaseVLAN(conn)}
                              title="Release VLAN"
                              className="text-muted-foreground hover:text-red-500 transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="p-4">
                        {conn.assigned_ips && conn.assigned_ips.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {conn.assigned_ips.map((ip, i) => (
                              <Badge key={i} variant="secondary" className="font-mono text-xs">
                                {ip}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="p-4">
                        <Badge variant={conn.status === "ACTIVE" ? "default" : "secondary"} className="text-xs">
                          {conn.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedConnection(conn);
                              setIPModalOpen(true);
                            }}
                            className="text-xs hover:text-primary"
                          >
                            + IP
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedConnection(conn);
                              setVLANForm({
                                ...vlanForm,
                                router_id: (conn.router as string) || "",
                                interface_name: conn.interface_name || "ether1",
                              });
                              setVLANModalOpen(true);
                            }}
                            className="text-xs hover:text-indigo-500"
                          >
                            + VLAN
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Provision Circuit Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Provision Enterprise Circuit</DialogTitle>
            <DialogDescription>Attach a new physical or virtual circuit to a corporate customer.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateConnection} className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Corporate Client *</label>
                <select
                  required
                  value={newConnForm.corporate_customer}
                  onChange={(e) => setNewConnForm({ ...newConnForm, corporate_customer: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="">-- Select Client --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Circuit ID *</label>
                <Input
                  required
                  placeholder="e.g. CKT-DHK-001"
                  value={newConnForm.circuit_id}
                  onChange={(e) => setNewConnForm({ ...newConnForm, circuit_id: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Circuit / Link Name *</label>
                <Input
                  required
                  placeholder="e.g. Primary DC Leased Line"
                  value={newConnForm.name}
                  onChange={(e) => setNewConnForm({ ...newConnForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Site / Service Location *</label>
                <Input
                  required
                  placeholder="e.g. Tower 2, Level 8, Motijheel"
                  value={newConnForm.service_location}
                  onChange={(e) => setNewConnForm({ ...newConnForm, service_location: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Connection Type</label>
                <select
                  value={newConnForm.connection_type}
                  onChange={(e) => setNewConnForm({ ...newConnForm, connection_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="LEASED_LINE">Dedicated Leased Line</option>
                  <option value="METRO_ETHERNET">Metro Ethernet Circuit</option>
                  <option value="VLAN_TRUNK">802.1Q VLAN Trunk</option>
                  <option value="PPPOE_ENTERPRISE">PPPoE Enterprise Tunnel</option>
                  <option value="STATIC_ROUTED">Static Routed IP Circuit</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Terminating Router</label>
                <select
                  value={newConnForm.router}
                  onChange={(e) => setNewConnForm({ ...newConnForm, router: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="">-- Optional Router --</option>
                  {routers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.ip_address})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Interface Name</label>
                <Input
                  placeholder="e.g. sfp-sfpplus1, ether2"
                  value={newConnForm.interface_name}
                  onChange={(e) => setNewConnForm({ ...newConnForm, interface_name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Allocated CIR (Mbps) *</label>
                <Input
                  required
                  type="number"
                  min="1"
                  value={newConnForm.committed_bandwidth_mbps}
                  onChange={(e) => setNewConnForm({ ...newConnForm, committed_bandwidth_mbps: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Physical Burst Cap (Mbps) *</label>
                <Input
                  required
                  type="number"
                  min="1"
                  value={newConnForm.burst_bandwidth_cap_mbps}
                  onChange={(e) => setNewConnForm({ ...newConnForm, burst_bandwidth_cap_mbps: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground">
                Provision Link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Allocate IP Modal */}
      <Dialog open={ipModalOpen} onOpenChange={setIPModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Allocate Dedicated IP Address</DialogTitle>
            <DialogDescription>Circuit: {selectedConnection?.circuit_id}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAllocateIP} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Select Subnet Pool</label>
              <select
                value={ipForm.pool_id}
                onChange={(e) => setIPForm({ ...ipForm, pool_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
              >
                <option value="">-- Any Available Pool --</option>
                {ipPools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.network_cidr}) - {p.available_ips} available
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Requested IP Address (Optional)
              </label>
              <Input
                placeholder="Leave blank to auto-allocate next available"
                value={ipForm.ip_address}
                onChange={(e) => setIPForm({ ...ipForm, ip_address: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes / Interface Binding</label>
              <Input
                placeholder="e.g. WAN Gateway Interface"
                value={ipForm.notes}
                onChange={(e) => setIPForm({ ...ipForm, notes: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIPModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground">
                Allocate IP
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign VLAN Modal */}
      <Dialog open={vlanModalOpen} onOpenChange={setVLANModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign 802.1Q Carrier VLAN</DialogTitle>
            <DialogDescription>Circuit: {selectedConnection?.circuit_id}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignVLAN} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Router *</label>
              <select
                required
                value={vlanForm.router_id}
                onChange={(e) => setVLANForm({ ...vlanForm, router_id: e.target.value })}
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
                onChange={(e) => setVLANForm({ ...vlanForm, vlan_id: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Interface Name</label>
              <Input
                placeholder="e.g. sfp-sfpplus1"
                value={vlanForm.interface_name}
                onChange={(e) => setVLANForm({ ...vlanForm, interface_name: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">VLAN Name (Optional)</label>
              <Input
                placeholder="e.g. VLAN-ACME-PRIMARY"
                value={vlanForm.name}
                onChange={(e) => setVLANForm({ ...vlanForm, name: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVLANModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground">
                Assign VLAN
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

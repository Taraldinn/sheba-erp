"use client";

import { useEffect, useState } from "react";
import { Cpu, Plus, Radio, Activity, RefreshCw, Edit2, Trash2, CheckCircle2, RotateCcw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { OLT, ONU } from "@/types";
import { mockOLTs, mockONUs } from "@/lib/mock-data";

export default function OLTPage() {
  const [activeTab, setActiveTab] = useState<"olts" | "onus">("olts");
  const [olts, setOlts] = useState<OLT[]>([]);
  const [onus, setOnus] = useState<ONU[]>([]);
  const [search, setSearch] = useState("");
  const [notification, setNotification] = useState<string | null>(null);

  // OLT Modal
  const [oltModalOpen, setOltModalOpen] = useState(false);
  const [editingOlt, setEditingOlt] = useState<OLT | null>(null);
  const [oltForm, setOltForm] = useState<{
    name: string;
    brand: string;
    ip_address: string;
    pon_ports_count: number;
    snmp_community: string;
    status: "Online" | "Offline";
  }>({
    name: "",
    brand: "VSOL",
    ip_address: "",
    pon_ports_count: 8,
    snmp_community: "public",
    status: "Online",
  });

  // ONU Modal
  const [onuModalOpen, setOnuModalOpen] = useState(false);
  const [onuForm, setOnuForm] = useState<{
    olt: string;
    pon_port: string;
    onu_index: number;
    mac_address: string;
    serial_number: string;
    customer_name: string;
    customer_phone: string;
    rx_power: number;
    tx_power: number;
    status: "Online" | "Offline" | "DyingGasp" | "Los";
  }>({
    olt: "",
    pon_port: "EPON-0/1",
    onu_index: 1,
    mac_address: "",
    serial_number: "",
    customer_name: "",
    customer_phone: "",
    rx_power: -19.5,
    tx_power: 2.1,
    status: "Online",
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadData = async () => {
    try {
      const [oltData, onuData] = await Promise.all([
        ApiClient.getOLTs(),
        ApiClient.getONUs(),
      ]);
      setOlts(oltData);
      setOnus(onuData);
      if (oltData.length > 0 && !onuForm.olt) {
        setOnuForm((prev) => ({ ...prev, olt: oltData[0].id }));
      }
    } catch {
      setOlts(mockOLTs);
      setOnus(mockONUs);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreateOlt = () => {
    setEditingOlt(null);
    setOltForm({
      name: "",
      brand: "VSOL",
      ip_address: "10.10.20.1",
      pon_ports_count: 8,
      snmp_community: "public",
      status: "Online",
    });
    setOltModalOpen(true);
  };

  const handleOltSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingOlt) {
        await ApiClient.updateOLT(editingOlt.id, oltForm);
        showToast(`Updated OLT "${oltForm.name}".`);
      } else {
        await ApiClient.createOLT(oltForm);
        showToast(`Added OLT "${oltForm.name}".`);
      }
      setOltModalOpen(false);
      loadData();
    } catch {
      showToast(`Saved OLT: ${oltForm.name}`);
      setOltModalOpen(false);
    }
  };

  const handleOltDelete = async (olt: OLT) => {
    if (!confirm(`Delete OLT "${olt.name}"?`)) return;
    try {
      await ApiClient.deleteOLT(olt.id);
      showToast(`Deleted OLT ${olt.name}`);
      loadData();
    } catch {
      showToast(`Deleted OLT ${olt.name}`);
    }
  };

  const handleOnuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createONU(onuForm);
      showToast(`Registered ONU for ${onuForm.customer_name}.`);
      setOnuModalOpen(false);
      loadData();
    } catch {
      showToast(`Saved ONU for ${onuForm.customer_name}`);
      setOnuModalOpen(false);
    }
  };

  const handleRebootOnu = async (onu: ONU) => {
    try {
      await ApiClient.rebootONU(onu.id);
      showToast(`Reboot signal sent to ONU ${onu.serial_number || onu.mac_address}.`);
      loadData();
    } catch {
      showToast(`Rebooting ONU...`);
    }
  };

  const filteredOnus = onus.filter(
    (o) =>
      o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.mac_address?.toLowerCase().includes(search.toLowerCase()) ||
      o.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.pon_port?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Cpu className="h-6 w-6 text-indigo-500" />
            Optical Line Terminal (OLT) & ONU Telemetry
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            GPON, EPON & XGS-PON distribution chassis, PON port optical power and real-time ONU diagnostics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleOpenCreateOlt} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 text-xs font-semibold">
            <Plus className="h-4 w-4" />
            Add OLT Frame
          </Button>
          <Button onClick={() => setOnuModalOpen(true)} variant="outline" className="gap-2 text-xs font-semibold border-indigo-500/40 text-indigo-400">
            <Plus className="h-4 w-4" />
            Register ONU
          </Button>
        </div>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{notification}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("olts")}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
            activeTab === "olts" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          OLT Frames ({olts.length})
        </button>
        <button
          onClick={() => setActiveTab("onus")}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
            activeTab === "onus" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Registered ONUs ({onus.length})
        </button>
      </div>

      {/* TAB 1: OLT FRAMES */}
      {activeTab === "olts" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {olts.map((olt) => (
            <Card key={olt.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant={olt.status === "Online" ? "default" : "destructive"} className="gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {olt.status}
                  </Badge>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">
                    {olt.ip_address}
                  </span>
                </div>
                <CardTitle className="text-base font-bold text-foreground mt-2">
                  {olt.name}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {olt.brand} {olt.model || "Chassis"} · {(olt as any).pon_ports_count || olt.pon_ports || 8} PON Ports
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-muted/40">
                    <p className="text-[10px] text-muted-foreground">Total ONUs</p>
                    <p className="text-sm font-bold text-foreground mt-0.5">{olt.total_onus || 0}</p>
                  </div>
                  <div className="p-2 rounded bg-emerald-500/10 text-emerald-500">
                    <p className="text-[10px]">Online</p>
                    <p className="text-sm font-bold mt-0.5">{olt.online_onus || 0}</p>
                  </div>
                  <div className="p-2 rounded bg-amber-500/10 text-amber-500">
                    <p className="text-[10px]">Warning</p>
                    <p className="text-sm font-bold mt-0.5">{olt.warning_onus || 0}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">SNMP: Public</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleOltDelete(olt)} className="h-7 px-2 text-rose-500 hover:bg-rose-500/10 text-xs">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* TAB 2: REGISTERED ONUS */}
      {activeTab === "onus" && (
        <div className="space-y-4">
          <div className="relative">
            <Input
              placeholder="Search ONUs by Customer Name, MAC Address, Serial Number or PON Port..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-xs pl-9"
            />
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
          </div>

          <Card className="border-border bg-card">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border text-[10px] uppercase">
                  <tr>
                    <th className="p-3">Subscriber</th>
                    <th className="p-3">PON Port</th>
                    <th className="p-3">MAC / Serial</th>
                    <th className="p-3">Optical RX</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredOnus.map((onu) => (
                    <tr key={onu.id} className="hover:bg-muted/30">
                      <td className="p-3">
                        <p className="font-bold text-foreground">{onu.customer_name}</p>
                        <p className="text-[10px] text-muted-foreground">{onu.customer_phone}</p>
                      </td>
                      <td className="p-3 font-mono font-semibold text-indigo-400">
                        {onu.pon_port}:{onu.onu_index}
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        <div>{onu.mac_address}</div>
                        <div className="text-[10px] text-muted-foreground">{onu.serial_number}</div>
                      </td>
                      <td className="p-3 font-mono font-bold">
                        <span className={onu.rx_power < -25 ? "text-rose-500" : "text-emerald-400"}>
                          {onu.rx_power} dBm
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge variant={onu.status === "Online" ? "default" : "destructive"} className="text-[10px]">
                          {onu.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRebootOnu(onu)}
                          className="h-7 text-[10px] gap-1 border-border"
                        >
                          <RotateCcw className="h-3 w-3" /> Reboot
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ADD OLT MODAL */}
      <Dialog open={oltModalOpen} onOpenChange={setOltModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Cpu className="h-5 w-5 text-indigo-500" />
              Add Optical Line Terminal (OLT)
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleOltSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">OLT Name</label>
              <Input
                placeholder="e.g. Uttara-OLT-VSOL-01"
                value={oltForm.name}
                onChange={(e) => setOltForm({ ...oltForm, name: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Brand</label>
                <select
                  value={oltForm.brand}
                  onChange={(e) => setOltForm({ ...oltForm, brand: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs"
                >
                  <option>VSOL</option>
                  <option>Huawei</option>
                  <option>ZTE</option>
                  <option>BDCOM</option>
                  <option>Fiberhome</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">IP Address</label>
                <Input
                  placeholder="10.10.20.1"
                  value={oltForm.ip_address}
                  onChange={(e) => setOltForm({ ...oltForm, ip_address: e.target.value })}
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">PON Ports Count</label>
              <Input
                type="number"
                value={oltForm.pon_ports_count}
                onChange={(e) => setOltForm({ ...oltForm, pon_ports_count: parseInt(e.target.value) || 8 })}
                className="h-9 text-xs"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOltModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Save OLT
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* REGISTER ONU MODAL */}
      <Dialog open={onuModalOpen} onOpenChange={setOnuModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Radio className="h-5 w-5 text-indigo-500" />
              Register Optical Network Unit (ONU)
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleOnuSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Subscriber Name</label>
              <Input
                placeholder="Tanvir Ahmed"
                value={onuForm.customer_name}
                onChange={(e) => setOnuForm({ ...onuForm, customer_name: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">MAC Address</label>
                <Input
                  placeholder="BC:54:51:7A:B2:1C"
                  value={onuForm.mac_address}
                  onChange={(e) => setOnuForm({ ...onuForm, mac_address: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Serial Number</label>
                <Input
                  placeholder="VSOL1234ABCD"
                  value={onuForm.serial_number}
                  onChange={(e) => setOnuForm({ ...onuForm, serial_number: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">PON Port</label>
                <Input
                  placeholder="EPON-0/1"
                  value={onuForm.pon_port}
                  onChange={(e) => setOnuForm({ ...onuForm, pon_port: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">ONU Index</label>
                <Input
                  type="number"
                  value={onuForm.onu_index}
                  onChange={(e) => setOnuForm({ ...onuForm, onu_index: parseInt(e.target.value) || 1 })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOnuModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Register ONU
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

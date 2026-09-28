"use client";

import { useEffect, useState } from "react";
import {
  Shield,
  Key,
  Network,
  RefreshCw,
  Copy,
  Download,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Plug,
  Server,
  FileCode,
  Globe,
  Radio,
  ExternalLink,
  RotateCw,
  Send,
  History,
  Activity,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiClient } from "@/lib/api";
import {
  WireGuardConfig,
  WireGuardAuditEvent,
  WireGuardHandshake,
  OLT,
  Router,
} from "@/types";

interface WireGuardPanelProps {
  routers?: Router[];
  olts?: OLT[];
}

export function WireGuardPanel({ routers = [], olts = [] }: WireGuardPanelProps) {
  const [configs, setConfigs] = useState<WireGuardConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<WireGuardConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string; latency_ms?: number } | null>(null);

  // Script Modal State
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<{ filename: string; script: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Subnet Form State
  const [newSubnet, setNewSubnet] = useState("");
  const [newSubnetLabel, setNewSubnetLabel] = useState("");
  const [selectedOltId, setSelectedOltId] = useState("");
  const [isAddingSubnet, setIsAddingSubnet] = useState(false);

  // Form State for Config
  const [formData, setFormData] = useState({
    router: "",
    router_name: "MikroTik Core",
    router_location: "Main NOC",
    wg_ip: "10.255.0.2/30",
    mik_public_key: "",
    mik_private_key: "",
    vps_public_key: "",
    endpoint_ip: "103.145.120.10",
    endpoint_port: 51820,
    allowed_ips: "0.0.0.0/0",
    snmp_community: "public",
  });

  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Phase 22: lifecycle state
  const [rotating, setRotating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [refreshingHandshakes, setRefreshingHandshakes] = useState(false);
  const [handshakes, setHandshakes] = useState<WireGuardHandshake[]>([]);
  const [auditEvents, setAuditEvents] = useState<WireGuardAuditEvent[]>([]);
  const [rotationResult, setRotationResult] = useState<{
    public_key: string; private_key: string;
  } | null>(null);
  const [pushResult, setPushResult] = useState<{
    ok: boolean; message: string; script: string;
  } | null>(null);
  const [lifecycleTab, setLifecycleTab] = useState<"handshakes" | "audit">("handshakes");
  const [generatingKeypair, setGeneratingKeypair] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadConfigs = async () => {
    setIsLoading(true);
    try {
      const data = await ApiClient.getWireGuardConfigs();
      const list = Array.isArray(data) ? data : [];
      setConfigs(list);
      if (list.length > 0) {
        const primary = list[0];
        setSelectedConfig(primary);
        setFormData({
          router: primary.router || "",
          router_name: primary.router_name || "MikroTik Core",
          router_location: primary.router_location || "",
          wg_ip: primary.wg_ip || "10.255.0.2/30",
          mik_public_key: primary.mik_public_key || "",
          mik_private_key: "",
          vps_public_key: primary.vps_public_key || "",
          endpoint_ip: primary.endpoint_ip || "",
          endpoint_port: primary.endpoint_port || 51820,
          allowed_ips: primary.allowed_ips || "0.0.0.0/0",
          snmp_community: primary.snmp_community || "public",
        });
      }
    } catch (err: any) {
      showToast(err.message || "Failed to load WireGuard configurations", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: any = { ...formData };
      if (!payload.router) {
        payload.router = null;
      }
      if (!payload.mik_private_key) {
        delete payload.mik_private_key;
      }

      if (selectedConfig) {
        await ApiClient.updateWireGuardConfig(selectedConfig.id, payload);
        showToast("WireGuard tunnel configuration updated.");
      } else {
        await ApiClient.createWireGuardConfig(payload);
        showToast("WireGuard tunnel configuration created.");
      }
      loadConfigs();
    } catch (err: any) {
      showToast(err.message || "Failed to save configuration", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (configId: string) => {
    setTestingId(configId);
    setTestResult(null);
    try {
      const res = await ApiClient.testWireGuard(configId);
      setTestResult({
        id: configId,
        success: res.success,
        message: res.message || "Host reachable",
        latency_ms: res.latency_ms,
      });
      showToast(res.message || "Connection reachable", res.success ? "success" : "error");
      loadConfigs();
    } catch (err: any) {
      setTestResult({
        id: configId,
        success: false,
        message: err.message || "Connection probe failed",
      });
      showToast(err.message || "Connection failed", "error");
    } finally {
      setTestingId(null);
    }
  };

  const handleOpenScript = async (configId: string) => {
    setScriptModalOpen(true);
    setGeneratingScript(true);
    setGeneratedScript(null);
    setCopied(false);
    try {
      const res = await ApiClient.getWireGuardScript(configId);
      setGeneratedScript({
        filename: res.filename || "wireguard_config.rsc",
        script: res.script,
      });
    } catch (err: any) {
      showToast(err.message || "Failed to generate script", "error");
    } finally {
      setGeneratingScript(false);
    }
  };

  const handleCopyScript = () => {
    if (!generatedScript?.script) return;
    navigator.clipboard.writeText(generatedScript.script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadScript = () => {
    if (!generatedScript?.script) return;
    const blob = new Blob([generatedScript.script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = generatedScript.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddSubnet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConfig || !newSubnet.trim()) return;
    setIsAddingSubnet(true);
    try {
      await ApiClient.addWireGuardSubnet({
        vpn_config: selectedConfig.id,
        subnet: newSubnet.trim(),
        label: newSubnetLabel.trim(),
        olt: selectedOltId || undefined,
      });
      setNewSubnet("");
      setNewSubnetLabel("");
      setSelectedOltId("");
      showToast("OLT subnet routed through tunnel.");
      loadConfigs();
    } catch (err: any) {
      showToast(err.message || "Failed to add subnet", "error");
    } finally {
      setIsAddingSubnet(false);
    }
  };

  const handleDeleteSubnet = async (subnetId: string) => {
    if (!confirm("Are you sure you want to remove this subnet route?")) return;
    try {
      await ApiClient.deleteWireGuardSubnet(subnetId);
      showToast("Subnet route removed.");
      loadConfigs();
    } catch (err: any) {
      showToast(err.message || "Failed to delete subnet", "error");
    }
  };

  // ── Phase 22 lifecycle ────────────────────────────────────────────────
  const handleGenerateKeypair = async () => {
    setGeneratingKeypair(true);
    try {
      const kp = await ApiClient.generateWireGuardKeypair();
      setFormData((prev) => ({
        ...prev,
        mik_public_key: kp.public_key,
        mik_private_key: kp.private_key,
      }));
      showToast("Generated fresh WireGuard keypair. Save the config to persist it.");
    } catch (err: any) {
      showToast(err.message || "Failed to generate keypair", "error");
    } finally {
      setGeneratingKeypair(false);
    }
  };

  const handleRotateKeys = async (configId: string) => {
    if (!confirm("Rotate the MikroTik-side WireGuard keypair? This updates the private key server-side and records an audit event. Re-push the script to the router.")) return;
    setRotating(true);
    try {
      const result = await ApiClient.rotateWireGuardKeys(configId);
      setRotationResult({ public_key: result.public_key, private_key: result.private_key });
      showToast("Keypair rotated. Copy the new private key now — it will not be shown again.");
      await loadConfigs();
    } catch (err: any) {
      showToast(err.message || "Key rotation failed", "error");
    } finally {
      setRotating(false);
    }
  };

  const handlePushScript = async (configId: string) => {
    if (!confirm("Generate and push the RouterOS .rsc script to the MikroTik now?")) return;
    setPushing(true);
    try {
      const result = await ApiClient.pushWireGuardScript(configId);
      setPushResult({ ok: result.ok, message: result.message, script: result.script || "" });
      showToast(result.ok ? "Push succeeded." : `Push failed: ${result.message}`);
      await loadConfigs();
    } catch (err: any) {
      showToast(err.message || "Push failed", "error");
    } finally {
      setPushing(false);
    }
  };

  const handleRefreshHandshakes = async (configId: string) => {
    setRefreshingHandshakes(true);
    try {
      await ApiClient.refreshWireGuardHandshakes(configId);
      const list = await ApiClient.getWireGuardHandshakes(configId, 20);
      setHandshakes(list.results || []);
      showToast("Handshakes refreshed.");
    } catch (err: any) {
      showToast(err.message || "Failed to refresh handshakes", "error");
    } finally {
      setRefreshingHandshakes(false);
    }
  };

  const loadAuditLog = async (configId: string) => {
    try {
      const list = await ApiClient.getWireGuardAuditLog(configId, 50);
      setAuditEvents(list.results || []);
    } catch {
      setAuditEvents([]);
    }
  };

  useEffect(() => {
    if (selectedConfig) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadAuditLog(selectedConfig.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfig?.id]);

  return (
    <div className="space-y-6 text-xs">
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

      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-500">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              WireGuard Site-to-Site VPN
              {selectedConfig?.is_reachable ? (
                <Badge variant="success" className="text-[10px] py-0 px-1.5 h-4">Reachable</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">Offline</Badge>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">
              Securely interconnects MikroTik routers and remote OLT subnets with the Sheba centralized management plane.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedConfig && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestConnection(selectedConfig.id)}
                disabled={testingId === selectedConfig.id}
                className="gap-1.5 text-xs border-border bg-card"
              >
                <Plug className={`h-3.5 w-3.5 ${testingId === selectedConfig.id ? "animate-spin text-amber-500" : "text-emerald-500"}`} />
                {testingId === selectedConfig.id ? "Probing..." : "Test Connection"}
              </Button>
              <Button
                size="sm"
                onClick={() => handleOpenScript(selectedConfig.id)}
                className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                <FileCode className="h-3.5 w-3.5" />
                Generate Script (.rsc)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRotateKeys(selectedConfig.id)}
                disabled={rotating}
                className="gap-1.5 text-xs border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
              >
                <RotateCw className={`h-3.5 w-3.5 ${rotating ? "animate-spin" : ""}`} />
                {rotating ? "Rotating…" : "Rotate Keys"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePushScript(selectedConfig.id)}
                disabled={pushing}
                className="gap-1.5 text-xs border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
              >
                <Send className="h-3.5 w-3.5" /> {pushing ? "Pushing…" : "Push to Router"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRefreshHandshakes(selectedConfig.id)}
                disabled={refreshingHandshakes}
                className="gap-1.5 text-xs"
              >
                <Activity className={`h-3.5 w-3.5 ${refreshingHandshakes ? "animate-pulse" : ""}`} />
                {refreshingHandshakes ? "Checking…" : "Refresh Handshakes"}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadConfigs}
            className="text-xs border-border bg-card"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Grid: Form on Left, Subnets on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Tunnel Settings Form */}
        <div className="lg:col-span-7">
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Key className="h-4 w-4 text-indigo-500" />
                Tunnel Credentials & Endpoints
              </CardTitle>
              <CardDescription className="text-xs">
                Supports Tenant Default Hub (global) and Router-Specific configuration overrides.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Target Scope</label>
                    <select
                      value={formData.router}
                      onChange={(e) => {
                        const rId = e.target.value;
                        setFormData({ ...formData, router: rId });
                        const matched = configs.find((c) => (c.router || "") === rId);
                        if (matched) setSelectedConfig(matched);
                      }}
                      className="mt-1 w-full bg-background border border-input rounded-md px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-ring"
                    >
                      <option value="">-- Tenant Default Hub (Global) --</option>
                      {routers.map((r) => (
                        <option key={r.id} value={r.id}>
                          Router: {r.name} ({r.ip_address})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tunnel Display Name</label>
                    <Input
                      value={formData.router_name}
                      onChange={(e) => setFormData({ ...formData, router_name: e.target.value })}
                      placeholder="e.g. Core-MikroTik"
                      className="mt-1 text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">WireGuard Tunnel IP (CIDR)</label>
                    <Input
                      value={formData.wg_ip}
                      onChange={(e) => setFormData({ ...formData, wg_ip: e.target.value })}
                      placeholder="10.255.0.2/30"
                      className="mt-1 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Router Location</label>
                    <Input
                      value={formData.router_location}
                      onChange={(e) => setFormData({ ...formData, router_location: e.target.value })}
                      placeholder="e.g. NOC Server Room"
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Endpoint Host / IP</label>
                    <Input
                      value={formData.endpoint_ip}
                      onChange={(e) => setFormData({ ...formData, endpoint_ip: e.target.value })}
                      placeholder="103.145.120.10"
                      className="mt-1 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Endpoint Port</label>
                    <Input
                      type="number"
                      value={formData.endpoint_port}
                      onChange={(e) => setFormData({ ...formData, endpoint_port: parseInt(e.target.value) || 51820 })}
                      className="mt-1 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-1 border-t border-border/60">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">MikroTik WireGuard Public Key</label>
                      <Input
                        value={formData.mik_public_key}
                        onChange={(e) => setFormData({ ...formData, mik_public_key: e.target.value })}
                        placeholder="MikroTik wg public key"
                        className="mt-1 text-xs font-mono"
                        required
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateKeypair}
                      disabled={generatingKeypair}
                      className="gap-1.5 text-xs"
                      title="Server-side Curve25519 keypair generation"
                    >
                      <Key className={`h-3.5 w-3.5 ${generatingKeypair ? "animate-pulse" : ""}`} />
                      {generatingKeypair ? "Generating…" : "Generate Keypair"}
                    </Button>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      MikroTik Private Key (AES-256 Encrypted)
                      {selectedConfig?.mik_private_key_set && (
                        <span className="text-emerald-500 font-normal ml-2">✓ Key saved in database</span>
                      )}
                    </label>
                    <Input
                      type="password"
                      value={formData.mik_private_key}
                      onChange={(e) => setFormData({ ...formData, mik_private_key: e.target.value })}
                      placeholder={selectedConfig?.mik_private_key_set ? "•••••••••••• (Leave blank to keep current)" : "Paste private key to encrypt"}
                      className="mt-1 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Server WireGuard Public Key</label>
                    <Input
                      value={formData.vps_public_key}
                      onChange={(e) => setFormData({ ...formData, vps_public_key: e.target.value })}
                      placeholder="VPS server wg public key"
                      className="mt-1 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <Button
                    type="submit"
                    disabled={isSaving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-5 shadow-xs"
                  >
                    {isSaving ? "Saving Settings..." : "Save VPN Configuration"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: OLT Subnet Manager */}
        <div className="lg:col-span-5 space-y-5">
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Network className="h-4 w-4 text-emerald-500" />
                Routed OLT Subnets
              </CardTitle>
              <CardDescription className="text-xs">
                Subnets routed through the tunnel with automated NAT rules in MikroTik.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Existing Subnets Table */}
              <div className="space-y-2">
                {selectedConfig?.subnets && selectedConfig.subnets.length > 0 ? (
                  selectedConfig.subnets.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-background/60 hover:bg-background transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-foreground">{sub.subnet}</span>
                          {sub.olt_name && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 text-indigo-500 border-indigo-500/30">
                              {sub.olt_name}
                            </Badge>
                          )}
                        </div>
                        {sub.label && <p className="text-[11px] text-muted-foreground">{sub.label}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSubnet(sub.id)}
                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 h-7 w-7 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 border border-dashed border-border rounded-lg text-muted-foreground">
                    <Network className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
                    <p className="text-xs font-medium">No OLT subnets configured</p>
                    <p className="text-[11px] opacity-75">Add a subnet below to route through the tunnel.</p>
                  </div>
                )}
              </div>

              {/* Add Subnet Form */}
              {selectedConfig && (
                <form onSubmit={handleAddSubnet} className="pt-3 border-t border-border space-y-3">
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5 text-indigo-500" />
                    Add New Subnet Route
                  </div>

                  {olts.length > 0 && (
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Quick-select OLT</label>
                      <select
                        value={selectedOltId}
                        onChange={(e) => {
                          const oId = e.target.value;
                          setSelectedOltId(oId);
                          const o = olts.find((x) => x.id === oId);
                          if (o) {
                            setNewSubnetLabel(`OLT ${o.name}`);
                            if (o.ip_address) {
                              const parts = o.ip_address.split(".");
                              if (parts.length === 4) {
                                setNewSubnet(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`);
                              }
                            }
                          }
                        }}
                        className="mt-1 w-full bg-background border border-input rounded-md px-2 py-1 text-xs"
                      >
                        <option value="">-- Choose OLT for prefill --</option>
                        {olts.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} ({o.ip_address})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Subnet (CIDR)</label>
                      <Input
                        value={newSubnet}
                        onChange={(e) => setNewSubnet(e.target.value)}
                        placeholder="172.25.28.0/24"
                        className="mt-1 text-xs font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Label (Optional)</label>
                      <Input
                        value={newSubnetLabel}
                        onChange={(e) => setNewSubnetLabel(e.target.value)}
                        placeholder="OLT Zone BDCOM"
                        className="mt-1 text-xs"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isAddingSubnet}
                    className="w-full text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  >
                    {isAddingSubnet ? "Adding..." : "Add Subnet Route"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Phase 22: Lifecycle — Handshakes + Audit Log */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                Tunnel Lifecycle
              </CardTitle>
              <CardDescription className="text-xs">
                Live WireGuard peer liveness and the datewise audit log
                (key rotations, pushes, handshake failures).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Tabs value={lifecycleTab} onValueChange={(v) => setLifecycleTab(v as any)}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="handshakes" className="text-xs">
                    <Activity className="h-3.5 w-3.5 mr-1" /> Handshakes ({handshakes.length})
                  </TabsTrigger>
                  <TabsTrigger value="audit" className="text-xs">
                    <History className="h-3.5 w-3.5 mr-1" /> Audit Log ({auditEvents.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="handshakes" className="mt-4">
                  {!selectedConfig ? (
                    <div className="text-xs text-muted-foreground py-6 text-center">
                      Select a configuration to view peer handshakes.
                    </div>
                  ) : handshakes.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-6 text-center">
                      No handshakes yet. Click &ldquo;Refresh Handshakes&rdquo; to poll the router.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase text-slate-500">
                          <tr>
                            <th className="text-left px-2 py-1.5">Peer</th>
                            <th className="text-left px-2 py-1.5">Endpoint</th>
                            <th className="text-left px-2 py-1.5">Last Handshake</th>
                            <th className="text-right px-2 py-1.5">RX</th>
                            <th className="text-right px-2 py-1.5">TX</th>
                            <th className="text-left px-2 py-1.5">State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {handshakes.map((h) => (
                            <tr key={h.id} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-2 py-1.5 font-mono">{h.peer_public_key.slice(0, 12)}…</td>
                              <td className="px-2 py-1.5 font-mono text-[10px]">{h.peer_endpoint || "—"}</td>
                              <td className="px-2 py-1.5">{h.last_handshake_at ? new Date(h.last_handshake_at).toLocaleString() : "—"}</td>
                              <td className="px-2 py-1.5 text-right">{h.rx_bytes}</td>
                              <td className="px-2 py-1.5 text-right">{h.tx_bytes}</td>
                              <td className="px-2 py-1.5">
                                <Badge variant={h.state === "ACTIVE" ? "default" : h.state === "STALE" ? "secondary" : "destructive"}>
                                  {h.state}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="audit" className="mt-4">
                  {auditEvents.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-6 text-center">
                      No audit events yet for this configuration.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase text-slate-500">
                          <tr>
                            <th className="text-left px-2 py-1.5">When</th>
                            <th className="text-left px-2 py-1.5">Event</th>
                            <th className="text-left px-2 py-1.5">Actor</th>
                            <th className="text-left px-2 py-1.5">Summary</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditEvents.map((e) => (
                            <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-2 py-1.5 text-[11px]">{new Date(e.occurred_at).toLocaleString()}</td>
                              <td className="px-2 py-1.5">
                                <Badge variant="outline" className="text-[10px]">{e.event_type}</Badge>
                                {e.is_saas_admin ? (
                                  <Badge variant="outline" className="ml-1 text-[10px] border-violet-400 text-violet-700">SaaS</Badge>
                                ) : null}
                              </td>
                              <td className="px-2 py-1.5 text-[11px]">{e.actor || "—"}</td>
                              <td className="px-2 py-1.5 text-[11px] text-muted-foreground truncate max-w-[300px]">{e.summary}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Script Generator Modal */}
      <Dialog open={scriptModalOpen} onOpenChange={setScriptModalOpen}>
        <DialogContent className="max-w-3xl border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <FileCode className="h-5 w-5 text-indigo-500" />
              MikroTik RouterOS WireGuard Script (.rsc)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Generated configuration script for {generatedScript?.filename || "MikroTik"}. Import via WinBox Terminal or System Scripts.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {generatingScript ? (
              <div className="text-center py-10 space-y-2">
                <RefreshCw className="h-6 w-6 animate-spin text-indigo-500 mx-auto" />
                <p className="text-xs text-muted-foreground">Generating decrypted RouterOS configuration...</p>
              </div>
            ) : generatedScript?.script ? (
              <pre className="p-4 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-[380px] border border-border/40 select-all">
                {generatedScript.script}
              </pre>
            ) : (
              <div className="p-4 rounded-lg bg-rose-500/10 text-rose-500 text-xs">
                Could not generate script. Ensure a valid private key is stored.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyScript}
              disabled={!generatedScript?.script}
              className="text-xs gap-1.5 border-border"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadScript}
              disabled={!generatedScript?.script}
              className="text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              <Download className="h-3.5 w-3.5" />
              Download .rsc File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotation Result — private key shown ONCE */}
      <Dialog open={!!rotationResult} onOpenChange={(o) => !o && setRotationResult(null)}>
        <DialogContent className="border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Key className="h-5 w-5 text-amber-500" />
              New WireGuard Keypair (Copy Now)
            </DialogTitle>
            <DialogDescription className="text-xs">
              The private key is shown only once. Save it somewhere safe;
              afterward only the encrypted-at-rest copy is available.
            </DialogDescription>
          </DialogHeader>
          {rotationResult && (
            <div className="space-y-3 text-xs">
              <div>
                <div className="font-semibold uppercase text-[10px] text-muted-foreground">Public Key</div>
                <div className="font-mono bg-slate-50 dark:bg-slate-800/60 p-2 rounded text-[11px] break-all">
                  {rotationResult.public_key}
                </div>
              </div>
              <div>
                <div className="font-semibold uppercase text-[10px] text-muted-foreground">Private Key</div>
                <div className="font-mono bg-amber-50 dark:bg-amber-950/40 p-2 rounded text-[11px] break-all flex items-start gap-2">
                  <span className="flex-1">{rotationResult.private_key}</span>
                  <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(rotationResult.private_key)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="text-amber-700 dark:text-amber-300 text-xs">
                Re-push the script to the MikroTik after rotation so it picks up the new public key.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotationResult(null)}>
              I have saved the keys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push Result — show script + status */}
      <Dialog open={!!pushResult} onOpenChange={(o) => !o && setPushResult(null)}>
        <DialogContent className="max-w-3xl border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="h-5 w-5 text-emerald-500" />
              Push to MikroTik
            </DialogTitle>
            <DialogDescription className="text-xs">
              {pushResult?.ok ? "Script applied successfully." : "Push failed."}
              {pushResult?.message ? ` — ${pushResult.message}` : ""}
            </DialogDescription>
          </DialogHeader>
          {pushResult?.script && (
            <pre className="bg-slate-950 text-slate-100 font-mono text-[11px] p-3 rounded max-h-[320px] overflow-auto">
              {pushResult.script}
            </pre>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

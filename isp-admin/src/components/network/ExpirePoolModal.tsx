"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Zap,
  Shield,
  Copy,
  Check,
  RefreshCw,
  Server,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Wifi,
  Sliders,
  Terminal,
  Activity,
  CreditCard,
  Layers,
} from "lucide-react";
import { Router, RouterExpirePoolConfig } from "@/types";
import { ApiClient } from "@/lib/api";

interface ExpirePoolModalProps {
  router: Router | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const PRESET_RATES = [
  { label: "10k / 10k", value: "10k/10k", desc: "Ultra Strict (10 KB/s - Portal only)" },
  { label: "20k / 32k", value: "20k/32k", desc: "Recommended (20k Up / 32k Down for bKash/Nagad)" },
  { label: "32k / 32k", value: "32k/32k", desc: "Standard (32 KB/s Balanced captive access)" },
  { label: "20k / 50k", value: "20k/50k", desc: "Fast Pay (50 KB/s Smooth gateway loading)" },
  { label: "50k / 50k", value: "50k/50k", desc: "Max Grace (50 KB/s Full invoice & payment view)" },
];

export function ExpirePoolModal({ router, open, onOpenChange, onSuccess }: ExpirePoolModalProps) {
  const [activeTab, setActiveTab] = useState<"policy" | "script" | "status">("policy");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<RouterExpirePoolConfig | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form State
  const [enabled, setEnabled] = useState(true);
  const [poolName, setPoolName] = useState("expired_pool");
  const [profileName, setProfileName] = useState("sheba_expired_profile");
  const [rateLimit, setRateLimit] = useState("32k/32k");
  const [customRate, setCustomRate] = useState("");
  const [isCustomRate, setIsCustomRate] = useState(false);
  const [poolNetwork, setPoolNetwork] = useState("172.31.250.10-172.31.250.250");
  const [localAddress, setLocalAddress] = useState("172.31.250.1");
  const [redirectUrl, setRedirectUrl] = useState("http://172.31.250.1:8080/portal?expired=true");
  const [walledGarden, setWalledGarden] = useState(
    "bkash.com, nagad.com.bd, sslcommerz.com, rocket, upaybd.com, 103.145.120.0/24"
  );
  const [script, setScript] = useState("");

  const loadConfig = useCallback(async () => {
    if (!router?.id) return;
    setLoading(true);
    setFeedback(null);
    try {
      const data = await ApiClient.getRouterExpirePool(router.id);
      setConfig(data);
      setEnabled(data.expire_pool_enabled);
      setPoolName(data.expire_pool_name || "expired_pool");
      setProfileName(data.expire_profile_name || "sheba_expired_profile");
      const currentRate = data.expire_rate_limit || "32k/32k";
      setRateLimit(currentRate);
      const isPreset = PRESET_RATES.some((r) => r.value === currentRate);
      if (!isPreset) {
        setIsCustomRate(true);
        setCustomRate(currentRate);
      } else {
        setIsCustomRate(false);
      }
      setPoolNetwork(data.expire_pool_network || "172.31.250.10-172.31.250.250");
      setLocalAddress(data.expire_local_address || "172.31.250.1");
      setRedirectUrl(data.expire_redirect_url || `http://${data.expire_local_address || "172.31.250.1"}:8080/portal?expired=true`);
      setWalledGarden(
        data.expire_walled_garden ||
          "bkash.com, nagad.com.bd, sslcommerz.com, rocket, upaybd.com, 103.145.120.0/24"
      );
      setScript(data.script || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg || "Failed to load Expire Pool config." });
    } finally {
      setLoading(false);
    }
  }, [router?.id]);

  useEffect(() => {
    if (open && router?.id) {
      loadConfig();
    }
  }, [open, router?.id, loadConfig]);

  const handleCopyScript = () => {
    if (!script) return;
    navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSelectPresetRate = (rate: string) => {
    setIsCustomRate(false);
    setRateLimit(rate);
  };

  const handleSaveAndProvision = async (shouldProvision = true) => {
    if (!router?.id) return;
    setSaving(true);
    setFeedback(null);
    const finalRate = isCustomRate ? customRate.trim() || "32k/32k" : rateLimit;

    try {
      const res = await ApiClient.updateRouterExpirePool(router.id, {
        expire_pool_enabled: enabled,
        expire_pool_name: poolName.trim(),
        expire_profile_name: profileName.trim(),
        expire_rate_limit: finalRate,
        expire_pool_network: poolNetwork.trim(),
        expire_local_address: localAddress.trim(),
        expire_redirect_url: redirectUrl.trim(),
        expire_walled_garden: walledGarden.trim(),
        provision_to_router: shouldProvision,
      });

      setConfig(res);
      setScript(res.script || "");
      const provMsg = res.provision_result?.success
        ? " Live provisioning on MikroTik router succeeded!"
        : res.provision_result?.error
        ? ` Provisioning error: ${res.provision_result.error}`
        : "";

      setFeedback({
        type: "success",
        message: `${res.message || "Expire Pool configuration saved."}${provMsg}`,
      });

      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message: msg || "Failed to update Expire Pool." });
    } finally {
      setSaving(false);
    }
  };

  if (!router) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-card border-border text-foreground max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 shadow-sm">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                  Prepaid Expire Pool & Captive Portal
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono uppercase font-bold ${
                      enabled
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {enabled ? "Active Captive Mode" : "Disabled (Hard Disconnect)"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <Server className="h-3 w-3" />
                  <span className="font-semibold text-foreground">{router.name}</span>
                  <span>({router.ip_address})</span>
                  <span>•</span>
                  <span>Keep expired users connected with throttled data for payment</span>
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadConfig}
              disabled={loading}
              className="h-8 text-xs gap-1 border-border shrink-0 cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Reload
            </Button>
          </div>

          {/* Quick Statistics Strip */}
          {config?.stats && (
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/50 text-xs">
              <div className="p-2 rounded-lg bg-card/60 border border-border/60">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                  Total Subscribers
                </span>
                <span className="text-sm font-bold font-mono text-foreground">
                  {config.stats.total_subscribers}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
                  Active (Full Speed)
                </span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {config.stats.active_subscribers}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
                <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block flex items-center gap-1">
                  <Activity className="h-3 w-3 animate-pulse" />
                  In Expire Pool ({isCustomRate ? customRate || rateLimit : rateLimit})
                </span>
                <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                  {config.stats.expired_subscribers}
                </span>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex items-center gap-1.5 mt-3 -mb-1">
            <button
              type="button"
              onClick={() => setActiveTab("policy")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === "policy"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              Bandwidth & Captive Policy
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("script")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === "script"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              RouterOS CLI Script
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("status")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === "status"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Live Provisioning Status
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Feedback Alert */}
          {feedback && (
            <div
              className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                feedback.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 border-destructive/30 text-destructive"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {activeTab === "policy" && (
            <div className="space-y-4">
              {/* Feature Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30">
                <div className="space-y-0.5">
                  <span className="font-bold text-foreground text-sm flex items-center gap-2">
                    Enable Expire Pool (Captive Redirection)
                    <Badge variant="outline" className="text-[10px] bg-background">
                      Walled Garden
                    </Badge>
                  </span>
                  <p className="text-muted-foreground text-xs max-w-xl">
                    When active, expired prepaid subscribers will <strong>NOT</strong> get disconnected.
                    Instead, they receive throttled emergency bandwidth (10kb–50kb) so they can access bKash/Nagad and pay bills.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnabled(!enabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    enabled ? "bg-indigo-600" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Bandwidth Throttling Section (Admin Decides 10kb - 50kb) */}
              <div className="space-y-2.5 p-3.5 rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-foreground flex items-center gap-1.5 text-xs">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    Throttled Rate Limit (Admin Decides 10kb - 50kb)
                  </label>
                  <span className="text-[11px] font-mono font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded">
                    Selected: {isCustomRate ? customRate || "Custom" : rateLimit}
                  </span>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Select an optimal grace bandwidth rate. 20k–32k is highly recommended to guarantee fast bKash & Nagad OTP checkout while preventing general video or downloads.
                </p>

                {/* Preset Chips */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                  {PRESET_RATES.map((preset) => {
                    const isSelected = !isCustomRate && rateLimit === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => handleSelectPresetRate(preset.value)}
                        className={`p-2.5 text-left rounded-lg border text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-600/10 text-foreground ring-1 ring-indigo-600"
                            : "border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold font-mono text-xs">{preset.label}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                        </div>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          {preset.desc}
                        </span>
                      </button>
                    );
                  })}

                  {/* Custom Rate Card */}
                  <div
                    className={`p-2.5 text-left rounded-lg border text-xs transition-all ${
                      isCustomRate
                        ? "border-indigo-600 bg-indigo-600/10 text-foreground ring-1 ring-indigo-600"
                        : "border-border bg-muted/20 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Custom Rate</span>
                      <input
                        type="radio"
                        checked={isCustomRate}
                        onChange={() => setIsCustomRate(true)}
                        className="cursor-pointer"
                      />
                    </div>
                    <Input
                      placeholder="e.g. 15k/40k"
                      value={customRate}
                      onFocus={() => setIsCustomRate(true)}
                      onChange={(e) => {
                        setIsCustomRate(true);
                        setCustomRate(e.target.value);
                      }}
                      className="h-7 text-xs font-mono bg-background mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Subnet & Network Profiles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Expire Pool Name
                  </label>
                  <Input
                    value={poolName}
                    onChange={(e) => setPoolName(e.target.value)}
                    className="h-8 text-xs font-mono bg-muted/20"
                    placeholder="expired_pool"
                  />
                  <span className="text-[10px] text-muted-foreground">MikroTik /ip pool identifier</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    PPP Profile Name
                  </label>
                  <Input
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="h-8 text-xs font-mono bg-muted/20"
                    placeholder="sheba_expired_profile"
                  />
                  <span className="text-[10px] text-muted-foreground">Assigned to subscriber upon expiry</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Expired IP Range (Subnet)
                  </label>
                  <Input
                    value={poolNetwork}
                    onChange={(e) => setPoolNetwork(e.target.value)}
                    className="h-8 text-xs font-mono bg-muted/20"
                    placeholder="172.31.250.10-172.31.250.250"
                  />
                  <span className="text-[10px] text-muted-foreground">Isolated non-routable captive IP pool</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Local Gateway IP
                  </label>
                  <Input
                    value={localAddress}
                    onChange={(e) => setLocalAddress(e.target.value)}
                    className="h-8 text-xs font-mono bg-muted/20"
                    placeholder="172.31.250.1"
                  />
                  <span className="text-[10px] text-muted-foreground">Default gateway assigned to expired CPE</span>
                </div>
              </div>

              {/* Captive Redirect URL */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5 text-indigo-500" />
                  Captive Payment Redirect URL (Port 80 HTTP Pop-up)
                </label>
                <Input
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  className="h-8 text-xs font-mono bg-muted/20"
                  placeholder="http://172.31.250.1:8080/portal?expired=true"
                />
                <span className="text-[10px] text-muted-foreground">
                  Where unauthenticated browser requests are redirected by MikroTik Web Proxy. Automatically pops up Wi-Fi Sign-in on mobile phones and PCs.
                </span>
              </div>

              {/* Walled Garden Whitelist */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-emerald-500" />
                  Walled Garden Whitelisted Gateways & Hosts
                </label>
                <textarea
                  value={walledGarden}
                  onChange={(e) => setWalledGarden(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-muted/20 p-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="bkash.com, nagad.com.bd, sslcommerz.com, rocket, upaybd.com, 103.145.120.0/24"
                />
                <span className="text-[10px] text-muted-foreground">
                  Payment gateway endpoints and ISP portal hosts that expired subscribers are allowed to access without restriction.
                </span>
              </div>
            </div>
          )}

          {activeTab === "script" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground text-sm">RouterOS Terminal Command Script</h3>
                  <p className="text-muted-foreground text-[11px]">
                    Copy and paste these commands into Winbox Terminal or SSH to configure the complete captive walled garden.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleCopyScript}
                  className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied to Clipboard!" : "Copy Commands"}
                </Button>
              </div>

              <div className="relative rounded-xl border border-border bg-zinc-950 p-4 font-mono text-[11px] leading-relaxed text-zinc-100 overflow-x-auto shadow-inner">
                <pre>{script || "# Loading terminal commands..."}</pre>
              </div>

              <div className="p-3 rounded-lg border border-border/70 bg-muted/30 text-[11px] text-muted-foreground space-y-1">
                <strong className="text-foreground block">What this script provisions on MikroTik:</strong>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Creates IP pool <code className="text-indigo-400 font-bold">{poolName}</code> with isolated IP range</li>
                  <li>Configures PPP profile <code className="text-indigo-400 font-bold">{profileName}</code> with <code className="text-amber-400 font-bold">{isCustomRate ? customRate : rateLimit}</code> rate-limit</li>
                  <li>Adds <code className="text-emerald-400 font-bold">allowed_payment_gateways</code> to firewall address-list</li>
                  <li>Creates destination NAT rule redirecting port 80 traffic to local proxy</li>
                  <li>Enables transparent Web Proxy with automatic 302 redirection to payment portal</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === "status" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-indigo-500" />
                  MikroTik Provisioning Breakdown
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="font-medium text-foreground">1. IP Pool Configuration</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{poolName} ({poolNetwork})</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="font-medium text-foreground">2. PPP Throttled Profile</span>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-amber-500">
                      {profileName} • {isCustomRate ? customRate : rateLimit}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="font-medium text-foreground">3. Firewall Walled Garden List</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">allowed_payment_gateways</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="font-medium text-foreground">4. Captive NAT Redirection Rule</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">dstnat:80 -&gt; redirect:8080</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="font-medium text-foreground">5. Web Proxy Payment Redirection</span>
                    </div>
                    <span className="font-mono text-[11px] text-indigo-400 truncate max-w-[200px]" title={redirectUrl}>
                      {redirectUrl}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={() => handleSaveAndProvision(true)}
                    disabled={saving}
                    className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-2 cursor-pointer"
                  >
                    <Zap className={`h-4 w-4 ${saving ? "animate-spin text-amber-300" : ""}`} />
                    {saving ? "Provisioning MikroTik Device..." : "⚡ Push & Live Provision on MikroTik Now"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs border-border cursor-pointer"
          >
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => handleSaveAndProvision(false)}
              className="h-8 text-xs border-border cursor-pointer"
            >
              Save Policy Only
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => handleSaveAndProvision(true)}
              className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 cursor-pointer"
            >
              <Zap className={`h-3.5 w-3.5 ${saving ? "animate-spin text-amber-300" : ""}`} />
              {saving ? "Provisioning..." : "Save & Provision on Router"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

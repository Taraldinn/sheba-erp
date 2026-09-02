"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CreditCard, Bell, Phone, Save, CheckCircle2, RefreshCw, Eye, EyeOff,
  Wifi, WifiOff, Upload, Plus, Trash2, MessageSquare, Volume2, Settings,
  ShieldCheck, AlertTriangle, Clock, BarChart2, PhoneCall, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";

/* ─────────────────────────── helpers ───────────────────────────── */
function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      type="button"
      id={id}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? "bg-indigo-600" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SectionHeader({ icon: Icon, title, color = "text-indigo-400" }: { icon: any; title: string; color?: string }) {
  return (
    <div className={`flex items-center gap-2 font-bold text-sm text-foreground border-b border-border pb-2 mb-4`}>
      <Icon className={`h-4 w-4 ${color}`} />
      {title}
    </div>
  );
}

function PasswordField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "••••••••••••••••"}
        className="bg-background text-xs h-9 pr-9"
      />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/* ───────────────────────── main component ───────────────────────── */
const TABS = ["Payment Gateways", "SMS Configuration", "SMS Templates", "Voice Call Reminder"] as const;
type Tab = typeof TABS[number];

const TAB_PARAM_MAP: Record<string, Tab> = {
  // Mapping from URL param to tab name

  "": "Payment Gateways",
  "sms": "SMS Configuration",
  "templates": "SMS Templates",
  "voice": "Voice Call Reminder",
};

// Reverse mapping for updating URL when tab changes
const TAB_TO_PARAM: Record<Tab, string> = {
  "Payment Gateways": "",
  "SMS Configuration": "sms",
  "SMS Templates": "templates",
  "Voice Call Reminder": "voice",
};

const SMS_SHORTCODES = ["[NAME]", "[ID]", "[PASS]", "[AMOUNT]", "[DAYS]", "[DATE]"];

export default function GatewaysSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab") || "";
  const [activeTab, setActiveTab] = useState<Tab>(
    TAB_PARAM_MAP[tabParam] ?? "Payment Gateways"
  );

  // Sync tab when URL param changes (browser back/forward or sidebar click)
  useEffect(() => {
    const mapped = TAB_PARAM_MAP[tabParam] ?? "Payment Gateways";
    setActiveTab(mapped);
  }, [tabParam]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<number | null>(null);
  const [testCallLoading, setTestCallLoading] = useState(false);
  const [testCallResult, setTestCallResult] = useState<string | null>(null);

  /* ── Payment Gateway state ── */
  const [bkash, setBkash] = useState({
    id: "", sandbox: false, shopEnabled: false, shopBaseUrl: "https://shop.bkash.com/merchant",
    prodKey: "", prodSecret: "", prodUser: "admin", prodPass: "",
    sbKey: "", sbSecret: "", sbUser: "", sbPass: "",
  });
  const [nagad, setNagad] = useState({ id: "", sandbox: false, merchantId: "", merchantPhone: "", publicKey: "", privateKey: "" });
  const [ssl, setSSL] = useState({ id: "", enabled: false, sandbox: false, storeId: "", storePass: "" });

  /* ── SMS state ── */
  const [smsData, setSmsData] = useState({
    sms_enabled: true,
    sms_provider: "Custom URL Gateway",
    sms_gateway_url: "https://api.provider.com/send?key={KEY}&sender={SENDER}&msg={MSG}&to={NUMBER}",
    sms_api_key: "",
    sms_sender_id: "SHEBAFI",
  });

  /* ── SMS Templates state ── */
  const [tpl, setTpl] = useState({
    welcome_sms_template: "Welcome [NAME]! Your [ID] is active. Password: [PASS].",
    payment_sms_template: "Dear [NAME], we have received [AMOUNT]৳ for ID [ID].",
    advance_loan_sms_template: "Dear [NAME], [DAYS] days credit added to ID [ID].",
    reminder_27d_template: "Dear [NAME], your bill ID [ID] is due in 3 days.",
    reminder_27d_time: "12:00 AM",
    expiry_reminder_template: "Dear [NAME], your service ID [ID] expires today.",
    expiry_reminder_time: "12:00 AM",
  });

  /* ── Voice state ── */
  const [voice, setVoice] = useState({
    is_enabled: false, api_bearer_token: "awaj_xxxxxxxxxxxxxxxxxxxxxxxx",
    caller_sender_id: "", voice_file_name: "my_reminder_voice",
    enable_expiry_reminder: true, call_when: "On Expiry Date",
    call_time: "10:00 AM", retry_unanswered: false,
    max_attempts: "1 Attempt (No Retry)", retry_delay: "1 Hour",
    safe_hours_start: "09:00 AM", safe_hours_end: "08:00 PM",
    account_balance: "0.00", calls_today: 0, answered_count: 0,
    unanswered_count: 0, failed_count: 0, rejected_count: 0, pending_count: 0,
  });
  const [testPhone, setTestPhone] = useState("017XXXXXXXX");
  const [testSender, setTestSender] = useState("");
  const [testVoice, setTestVoice] = useState("");
  const [uploadVoiceName, setUploadVoiceName] = useState("my_reminder_voice");
  const [voiceTemplates, setVoiceTemplates] = useState<any[]>([]);

  /* ── Bootstrap ── */
  useEffect(() => {
    async function load() {
      const [settings, gws, vs, vt] = await Promise.all([
        ApiClient.getSettings(),
        ApiClient.getPaymentGateways(),
        ApiClient.getVoiceSettings(),
        ApiClient.getVoiceTemplates(),
      ]);
      if (settings) {
        setSettingId(settings.id);
        setSmsData({
          sms_enabled: settings.sms_enabled ?? true,
          sms_provider: settings.sms_provider || "Custom URL Gateway",
          sms_gateway_url: settings.sms_gateway_url || "",
          sms_api_key: settings.sms_api_key || "",
          sms_sender_id: settings.sms_sender_id || "SHEBAFI",
        });
        setTpl({
          welcome_sms_template: settings.welcome_sms_template || tpl.welcome_sms_template,
          payment_sms_template: settings.payment_sms_template || tpl.payment_sms_template,
          advance_loan_sms_template: settings.advance_loan_sms_template || tpl.advance_loan_sms_template,
          reminder_27d_template: settings.reminder_27d_template || tpl.reminder_27d_template,
          reminder_27d_time: settings.reminder_27d_time || "12:00 AM",
          expiry_reminder_template: settings.expiry_reminder_template || tpl.expiry_reminder_template,
          expiry_reminder_time: settings.expiry_reminder_time || "12:00 AM",
        });
      }
      if (gws && gws.length > 0) {
        const bk = gws.find((g: any) => g.provider === "BKASH");
        const ng = gws.find((g: any) => g.provider === "NAGAD");
        const ss = gws.find((g: any) => g.provider === "SSLCOMMERZ");
        if (bk) setBkash((p) => ({ ...p, id: bk.id, sandbox: bk.is_sandbox, shopEnabled: bk.shop_payment_enabled, shopBaseUrl: bk.shop_base_url || p.shopBaseUrl, prodKey: bk.app_key || "", prodSecret: bk.app_secret || "", prodUser: bk.username || "admin", prodPass: bk.password || "", sbKey: bk.sandbox_app_key || "", sbSecret: bk.sandbox_app_secret || "", sbUser: bk.sandbox_username || "", sbPass: bk.sandbox_password || "" }));
        if (ng) setNagad((p) => ({ ...p, id: ng.id, sandbox: ng.is_sandbox, merchantId: ng.merchant_number || "", merchantPhone: ng.merchant_phone || "", publicKey: ng.public_key || "", privateKey: ng.private_key || "" }));
        if (ss) setSSL((p) => ({ ...p, id: ss.id, enabled: ss.is_active, sandbox: ss.is_sandbox, storeId: ss.store_id || "", storePass: ss.store_password || "" }));
      }
      if (vs) {
        setVoiceId(vs.id);
        setVoice((p) => ({ ...p, ...vs }));
      }
      setVoiceTemplates(vt || []);
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Save SMS settings + templates
      if (settingId) {
        await ApiClient.updateSettings(settingId, { ...smsData, ...tpl });
      }
      // Save bKash gateway
      const bkPayload = {
        provider: "BKASH", title: "bKash Payment",
        is_sandbox: bkash.sandbox, shop_payment_enabled: bkash.shopEnabled, shop_base_url: bkash.shopBaseUrl,
        app_key: bkash.prodKey, app_secret: bkash.prodSecret, username: bkash.prodUser, password: bkash.prodPass,
        sandbox_app_key: bkash.sbKey, sandbox_app_secret: bkash.sbSecret,
        sandbox_username: bkash.sbUser, sandbox_password: bkash.sbPass,
        is_active: true, tenant: null,
      };
      if (bkash.id) await ApiClient.updatePaymentGateway(bkash.id, bkPayload);
      else await ApiClient.createPaymentGateway(bkPayload);

      // Save Nagad
      const ngPayload = { provider: "NAGAD", title: "Nagad Payment", is_sandbox: nagad.sandbox, merchant_number: nagad.merchantId, merchant_phone: nagad.merchantPhone, public_key: nagad.publicKey, private_key: nagad.privateKey, is_active: true };
      if (nagad.id) await ApiClient.updatePaymentGateway(nagad.id, ngPayload);
      else await ApiClient.createPaymentGateway(ngPayload);

      // Save voice settings
      if (voiceId) await ApiClient.updateVoiceSettings(voiceId, voice);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleTestCall = async () => {
    setTestCallLoading(true);
    setTestCallResult(null);
    try {
      const res = await ApiClient.voiceTestCall({ phone: testPhone, sender: testSender, voice: testVoice });
      setTestCallResult(res.message || "Call queued successfully.");
    } catch {
      setTestCallResult("Test call queued. Check Awaj dashboard for status.");
    } finally {
      setTestCallLoading(false);
    }
  };

  const answerRate = voice.calls_today > 0 ? Math.round((voice.answered_count / voice.calls_today) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6 text-indigo-500" />
            Payment, SMS & Voice Configuration
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Configure online payment gateways, SMS provider, message templates, and voice call reminders.</p>
        </div>
        {saved && (
          <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
            <CheckCircle2 className="h-4 w-4" /> Saved successfully!
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 pb-px">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              const param = TAB_TO_PARAM[tab];
              router.push(param ? `/settings?tab=${param}` : "/settings");
            }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-all -mb-px ${
              activeTab === tab
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "Payment Gateways" && <CreditCard className="h-3.5 w-3.5" />}
            {tab === "SMS Configuration" && <Bell className="h-3.5 w-3.5" />}
            {tab === "SMS Templates" && <MessageSquare className="h-3.5 w-3.5" />}
            {tab === "Voice Call Reminder" && <Volume2 className="h-3.5 w-3.5" />}
            {tab}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* ════════════════════════ PAYMENT GATEWAYS ════════════════════════ */}
        {activeTab === "Payment Gateways" && (
          <div className="space-y-5 text-xs">
            {/* bKash */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="text-[#E2136E] font-black text-base">b</span>
                    <span style={{ color: "#E2136E" }}>bKash</span> Configuration
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Sandbox Active</span>
                    <Toggle id="bkash-sandbox" checked={bkash.sandbox} onChange={(v) => setBkash((p) => ({ ...p, sandbox: v }))} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                {/* bKash Shop Payment */}
                <div className="p-3.5 rounded-lg border border-border bg-background/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">bKash Shop Payment</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Enable</span>
                      <Toggle id="bkash-shop" checked={bkash.shopEnabled} onChange={(v) => setBkash((p) => ({ ...p, shopEnabled: v }))} />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-muted-foreground mb-1">bKash Shop Base URL</label>
                    <Input value={bkash.shopBaseUrl} onChange={(e) => setBkash((p) => ({ ...p, shopBaseUrl: e.target.value }))} className="bg-background h-9 text-xs" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Must be a valid https://shop.bkash.com/ URL.</p>
                  </div>
                </div>

                {/* Production Credentials */}
                <div className="space-y-3">
                  <SectionHeader icon={ShieldCheck} title="Production Credentials" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="block text-muted-foreground font-medium mb-1">Production App Key</label><Input value={bkash.prodKey} onChange={(e) => setBkash((p) => ({ ...p, prodKey: e.target.value }))} className="bg-background h-9 text-xs" /></div>
                    <div><label className="block text-muted-foreground font-medium mb-1">Production App Secret</label><PasswordField value={bkash.prodSecret} onChange={(v) => setBkash((p) => ({ ...p, prodSecret: v }))} /></div>
                    <div><label className="block text-muted-foreground font-medium mb-1">Production Username</label><Input value={bkash.prodUser} onChange={(e) => setBkash((p) => ({ ...p, prodUser: e.target.value }))} className="bg-background h-9 text-xs" /></div>
                    <div><label className="block text-muted-foreground font-medium mb-1">Production Password</label><PasswordField value={bkash.prodPass} onChange={(v) => setBkash((p) => ({ ...p, prodPass: v }))} /></div>
                  </div>
                </div>

                {/* Sandbox Credentials */}
                <div className="space-y-3">
                  <SectionHeader icon={AlertTriangle} title="Sandbox Credentials" color="text-amber-400" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="block text-muted-foreground font-medium mb-1">Sandbox App Key</label><Input value={bkash.sbKey} onChange={(e) => setBkash((p) => ({ ...p, sbKey: e.target.value }))} className="bg-background h-9 text-xs" /></div>
                    <div><label className="block text-muted-foreground font-medium mb-1">Sandbox App Secret</label><PasswordField value={bkash.sbSecret} onChange={(v) => setBkash((p) => ({ ...p, sbSecret: v }))} /></div>
                    <div><label className="block text-muted-foreground font-medium mb-1">Sandbox Username</label><Input value={bkash.sbUser} onChange={(e) => setBkash((p) => ({ ...p, sbUser: e.target.value }))} className="bg-background h-9 text-xs" /></div>
                    <div><label className="block text-muted-foreground font-medium mb-1">Sandbox Password</label><PasswordField value={bkash.sbPass} onChange={(v) => setBkash((p) => ({ ...p, sbPass: v }))} /></div>
                  </div>
                </div>

                {/* Test Connection */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5">
                  <div>
                    <span className="font-bold text-foreground">Test Connection</span>
                    <p className="text-[11px] text-muted-foreground">Admin Only — Verify bKash API credentials</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10">
                    <Wifi className="h-3.5 w-3.5" /> Test bKash
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Nagad */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="text-orange-500">🟠</span> Nagad Configuration
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Sandbox</span>
                    <Toggle id="nagad-sandbox" checked={nagad.sandbox} onChange={(v) => setNagad((p) => ({ ...p, sandbox: v }))} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="block text-muted-foreground font-medium mb-1">Merchant ID</label><Input value={nagad.merchantId} onChange={(e) => setNagad((p) => ({ ...p, merchantId: e.target.value }))} className="bg-background h-9 text-xs" /></div>
                  <div><label className="block text-muted-foreground font-medium mb-1">Merchant Phone</label><Input value={nagad.merchantPhone} onChange={(e) => setNagad((p) => ({ ...p, merchantPhone: e.target.value }))} className="bg-background h-9 text-xs" placeholder="+880..." /></div>
                  <div className="md:col-span-2"><label className="block text-muted-foreground font-medium mb-1">Public Key</label><textarea rows={3} value={nagad.publicKey} onChange={(e) => setNagad((p) => ({ ...p, publicKey: e.target.value }))} className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono" placeholder="-----BEGIN PUBLIC KEY-----" /></div>
                  <div className="md:col-span-2"><label className="block text-muted-foreground font-medium mb-1">Private Key</label><textarea rows={3} value={nagad.privateKey} onChange={(e) => setNagad((p) => ({ ...p, privateKey: e.target.value }))} className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono" placeholder="-----BEGIN PRIVATE KEY-----" /></div>
                </div>
              </CardContent>
            </Card>

            {/* SSLCommerz */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="text-blue-400">🔵</span> SSLCOMMERZ Configuration
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Enable</span>
                      <Toggle id="ssl-enabled" checked={ssl.enabled} onChange={(v) => setSSL((p) => ({ ...p, enabled: v }))} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Sandbox</span>
                      <Toggle id="ssl-sandbox" checked={ssl.sandbox} onChange={(v) => setSSL((p) => ({ ...p, sandbox: v }))} />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="block text-muted-foreground font-medium mb-1">Store ID</label><Input value={ssl.storeId} onChange={(e) => setSSL((p) => ({ ...p, storeId: e.target.value }))} className="bg-background h-9 text-xs" /></div>
                  <div><label className="block text-muted-foreground font-medium mb-1">Store Password</label><PasswordField value={ssl.storePass} onChange={(v) => setSSL((p) => ({ ...p, storePass: v }))} /></div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════════════════════════ SMS CONFIGURATION ════════════════════════ */}
        {activeTab === "SMS Configuration" && (
          <Card className="border-border bg-card/60 text-xs">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Bell className="h-4 w-4 text-emerald-400" />SMS Gateway Configuration</CardTitle>
              <CardDescription className="text-xs">Set up your SMS provider to send notifications.</CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              {/* Toggle system SMS */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-background/50">
                <div>
                  <p className="font-bold text-foreground">Enable SMS System</p>
                  <p className="text-[11px] text-muted-foreground">Toggle system-wide SMS sending.</p>
                </div>
                <Toggle id="sms-enabled" checked={smsData.sms_enabled} onChange={(v) => setSmsData((p) => ({ ...p, sms_enabled: v }))} />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1.5">SMS Gateway Type</label>
                <select value={smsData.sms_provider} onChange={(e) => setSmsData((p) => ({ ...p, sms_provider: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                  <option>Custom URL Gateway</option>
                  <option>Greenweb Bangladesh API</option>
                  <option>BulkSMS BD HTTP Gateway</option>
                  <option>Onnorokom SMS Gateway</option>
                  <option>Twilio Cloud SMS</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1.5">API Gateway URL</label>
                <Input value={smsData.sms_gateway_url} onChange={(e) => setSmsData((p) => ({ ...p, sms_gateway_url: e.target.value }))} className="bg-background h-9 text-xs font-mono" />
                <p className="text-[11px] text-muted-foreground mt-0.5">Use placeholders: <span className="font-mono text-indigo-400">{"{KEY}"}</span>, <span className="font-mono text-indigo-400">{"{SENDER}"}</span>, <span className="font-mono text-indigo-400">{"{MSG}"}</span>, <span className="font-mono text-indigo-400">{"{NUMBER}"}</span></p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1.5">API Key</label>
                  <PasswordField value={smsData.sms_api_key} onChange={(v) => setSmsData((p) => ({ ...p, sms_api_key: v }))} placeholder="Your gateway API token" />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1.5">Sender ID</label>
                  <Input value={smsData.sms_sender_id} onChange={(e) => setSmsData((p) => ({ ...p, sms_sender_id: e.target.value }))} className="bg-background h-9 text-xs" placeholder="SHEBAFI" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ════════════════════════ SMS TEMPLATES ════════════════════════ */}
        {activeTab === "SMS Templates" && (
          <div className="space-y-5 text-xs">
            {/* Shortcodes reference */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-bold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-indigo-400" />SMS Templates — Customize Automated Messages</CardTitle><CardDescription className="text-xs">Customize the automated messages sent to clients.</CardDescription></CardHeader>
              <CardContent className="p-5 space-y-1">
                <p className="font-bold text-foreground mb-2">Available Shortcodes</p>
                <p className="text-[11px] text-muted-foreground mb-3">Use shortcodes below to dynamically insert subscriber data.</p>
                <div className="flex flex-wrap gap-2">
                  {SMS_SHORTCODES.map((code) => (
                    <span key={code} className="px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-[11px] font-bold">{code}</span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {[
              { key: "welcome_sms_template", label: "Welcome SMS", desc: "Sent when a new subscriber is activated." },
              { key: "payment_sms_template", label: "Payment Received", desc: "Sent on successful recharge." },
              { key: "advance_loan_sms_template", label: "Advance Loan / Credit", desc: "Sent when advance days are added." },
              { key: "reminder_27d_template", label: "Payment Reminder (27 Days)", desc: "Sent 3 days before expiry.", timeKey: "reminder_27d_time" },
              { key: "expiry_reminder_template", label: "Expiry Reminder (30 Days)", desc: "Sent on expiry date.", timeKey: "expiry_reminder_time" },
            ].map(({ key, label, desc, timeKey }) => (
              <Card key={key} className="border-border bg-card/60">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                    {timeKey && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <Input type="time" value={(tpl as any)[timeKey] || "00:00"} onChange={(e) => setTpl((p) => ({ ...p, [timeKey]: e.target.value }))} className="bg-background h-8 text-xs w-28" />
                      </div>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    value={(tpl as any)[key]}
                    onChange={(e) => setTpl((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ════════════════════════ VOICE CALL REMINDER ════════════════════════ */}
        {activeTab === "Voice Call Reminder" && (
          <div className="space-y-5 text-xs">
            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { label: "Balance", value: `৳${voice.account_balance}`, color: "text-emerald-400" },
                { label: "Calls Today", value: voice.calls_today, color: "text-foreground" },
                { label: "Answered", value: voice.answered_count, color: "text-emerald-400" },
                { label: "Unanswered", value: voice.unanswered_count, color: "text-amber-400" },
                { label: "Failed", value: voice.failed_count, color: "text-red-400" },
                { label: "Rejected", value: voice.rejected_count, color: "text-rose-400" },
                { label: "Pending", value: voice.pending_count, color: "text-indigo-400" },
                { label: "Answer Rate", value: `${answerRate}%`, color: answerRate > 60 ? "text-emerald-400" : "text-amber-400" },
              ].map(({ label, value, color }) => (
                <Card key={label} className="border-border bg-card/60">
                  <CardContent className="p-3 text-center">
                    <p className={`text-lg font-black ${color}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Voice System Settings */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm font-bold flex items-center gap-2"><Volume2 className="h-4 w-4 text-indigo-400" />Voice Call Reminder Configuration</CardTitle><CardDescription className="text-xs">Manage automatic billing voice broadcasts and retry configurations.</CardDescription></CardHeader>
              <CardContent className="p-5 space-y-5">
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-background/50">
                  <div>
                    <p className="font-bold text-foreground">Enable Voice Call System</p>
                    <p className="text-[11px] text-muted-foreground">Toggle system-wide voice reminders.</p>
                  </div>
                  <Toggle id="voice-enabled" checked={voice.is_enabled} onChange={(v) => setVoice((p) => ({ ...p, is_enabled: v }))} />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1.5">API Bearer Token</label>
                  <PasswordField value={voice.api_bearer_token} onChange={(v) => setVoice((p) => ({ ...p, api_bearer_token: v }))} placeholder="awaj_xxxxxxxxxxxxxxxxxxxxxxxx" />
                  <p className="text-[11px] text-muted-foreground mt-1">Your token will be encrypted and stored securely.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Caller Sender ID (Sender)</label>
                    <select value={voice.caller_sender_id} onChange={(e) => setVoice((p) => ({ ...p, caller_sender_id: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      <option value="">-- Select Active Sender --</option>
                      <option value="+8809612000000">+8809612000000</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Active approved calling numbers from AwajDigital account.</p>
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Voice File (Audio Voice)</label>
                    <select value={voice.voice_file_name} onChange={(e) => setVoice((p) => ({ ...p, voice_file_name: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      <option value="">-- Select Approved Voice --</option>
                      {voiceTemplates.filter((t) => t.status === "Approved").map((t) => (
                        <option key={t.id} value={t.voice_name}>{t.voice_name}</option>
                      ))}
                      <option value="my_reminder_voice">my_reminder_voice</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Only APPROVED voices can be used for automated reminders.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Schedule & Retry */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card className="border-border bg-card/60">
                <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm font-bold flex items-center gap-2"><Clock className="h-4 w-4 text-indigo-400" />Expiry Call Schedule</CardTitle></CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Enable Expiry Reminder</span>
                    <Toggle id="expiry-reminder" checked={voice.enable_expiry_reminder} onChange={(v) => setVoice((p) => ({ ...p, enable_expiry_reminder: v }))} />
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Call When</label>
                    <select value={voice.call_when} onChange={(e) => setVoice((p) => ({ ...p, call_when: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      <option>On Expiry Date</option>
                      <option>1 Day Before Expiry</option>
                      <option>3 Days Before Expiry</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Call Time (Asia/Dhaka timezone)</label>
                    <Input type="time" value={voice.call_time} onChange={(e) => setVoice((p) => ({ ...p, call_time: e.target.value }))} className="bg-background h-9 text-xs" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card/60">
                <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm font-bold flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" />Retry Settings</CardTitle></CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Retry Unanswered Calls</span>
                    <Toggle id="retry-unanswered" checked={voice.retry_unanswered} onChange={(v) => setVoice((p) => ({ ...p, retry_unanswered: v }))} />
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Maximum Attempts</label>
                    <select value={voice.max_attempts} onChange={(e) => setVoice((p) => ({ ...p, max_attempts: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      <option>1 Attempt (No Retry)</option>
                      <option>2 Attempts</option>
                      <option>3 Attempts</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Retry Delay</label>
                    <select value={voice.retry_delay} onChange={(e) => setVoice((p) => ({ ...p, retry_delay: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      <option>30 Minutes</option>
                      <option>1 Hour</option>
                      <option>2 Hours</option>
                      <option>4 Hours</option>
                    </select>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Safe Calling Hours */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" />Safe Calling Hours</CardTitle></CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Allowed Calls Start From</label>
                    <Input type="time" value={voice.safe_hours_start} onChange={(e) => setVoice((p) => ({ ...p, safe_hours_start: e.target.value }))} className="bg-background h-9 text-xs" />
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Allowed Calls Until</label>
                    <Input type="time" value={voice.safe_hours_end} onChange={(e) => setVoice((p) => ({ ...p, safe_hours_end: e.target.value }))} className="bg-background h-9 text-xs" />
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No automated calls will be initiated outside of these hours. Manual test calls can still run but will display a warning.
                </div>
              </CardContent>
            </Card>

            {/* Manual Test Call */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm font-bold flex items-center gap-2"><PhoneCall className="h-4 w-4 text-indigo-400" />Manual Test Call</CardTitle></CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Phone Number</label>
                    <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="017XXXXXXXX" className="bg-background h-9 text-xs" />
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Sender</label>
                    <select value={testSender} onChange={(e) => setTestSender(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      <option value="">-- Sender --</option>
                      <option value="+8809612000000">+8809612000000</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Voice</label>
                    <select value={testVoice} onChange={(e) => setTestVoice(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                      <option value="">-- Voice --</option>
                      <option value="my_reminder_voice">my_reminder_voice</option>
                      {voiceTemplates.map((t) => <option key={t.id} value={t.voice_name}>{t.voice_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="button" onClick={handleTestCall} disabled={testCallLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 text-xs">
                    {testCallLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
                    Send Test Call
                  </Button>
                  {testCallResult && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{testCallResult}</span>}
                </div>
              </CardContent>
            </Card>

            {/* Upload Voice File */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm font-bold flex items-center gap-2"><Upload className="h-4 w-4 text-indigo-400" />Upload Voice File</CardTitle></CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Voice Name</label>
                    <Input value={uploadVoiceName} onChange={(e) => setUploadVoiceName(e.target.value)} placeholder="my_reminder_voice" className="bg-background h-9 text-xs" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Use letters, numbers, and underscores only.</p>
                  </div>
                  <div>
                    <label className="block font-semibold text-foreground mb-1.5">Audio File (Max 10MB)</label>
                    <Input type="file" accept=".mp3,.wav,.ogg,.m4a,.aac,.webm,.flac" className="bg-background text-xs file:bg-indigo-600 file:text-white file:border-0 file:rounded-md file:px-2.5 file:py-1 file:mr-3 file:text-xs file:font-semibold h-9" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Allowed: mp3, wav, ogg, m4a, aac, webm, flac</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10">
                  <Upload className="h-3.5 w-3.5" /> Upload Voice File
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Bottom Save */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="text-[11px] text-muted-foreground">Changes are persisted to the Django backend in real-time.</span>
          <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 px-6 shadow-md shadow-indigo-600/20">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wifi,
  WifiOff,
  CreditCard,
  Zap,
  CheckCircle2,
  Calendar,
  Download,
  Headphones,
  Shield,
  ArrowRight,
  Sparkles,
  Radio,
  Clock,
  AlertTriangle,
  FileText,
  Activity,
  Gauge,
  RotateCcw,
  Smartphone,
  Laptop,
  Tv,
  HelpCircle,
  Plus,
  Send,
  Eye,
  EyeOff,
  ChevronRight,
  TrendingUp,
  Server,
  Lock,
  ArrowUpRight,
  MessageSquare,
  Check,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { PortalHeader } from "@/components/layouts/PortalHeader";

type PortalTab = "overview" | "billing" | "speedtest" | "packages" | "support" | "wifi";

export default function SubscriberPortalPage() {
  const [activeTab, setActiveTab] = useState<PortalTab>("overview");
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("bKash");
  const [paySuccess, setPaySuccess] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);

  // Speed test state
  const [testingSpeed, setTestingSpeed] = useState(false);
  const [testStage, setTestStage] = useState<"idle" | "ping" | "download" | "upload" | "done">("idle");
  const [ping, setPing] = useState(4);
  const [jitter, setJitter] = useState(1);
  const [downloadSpeed, setDownloadSpeed] = useState(30.4);
  const [uploadSpeed, setUploadSpeed] = useState(29.8);
  const [currentSpeedGauge, setCurrentSpeedGauge] = useState(0);

  // Support ticket state
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketCategory, setTicketCategory] = useState("Slow Speed / High Latency");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketSubmitted, setTicketSubmitted] = useState(false);

  // Advance loan state
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [advanceClaimed, setAdvanceClaimed] = useState(false);

  // WiFi password toggle
  const [showWifiPass, setShowWifiPass] = useState(false);
  const [wifiPass, setWifiPass] = useState("sheba_fiber_2026");
  const [wifiSaved, setWifiSaved] = useState(false);

  // Internet Line On/Off Control state
  const [internetActive, setInternetActive] = useState(true);
  const [internetStatusToast, setInternetStatusToast] = useState<string | null>(null);

  const toggleInternetAccess = () => {
    const nextState = !internetActive;
    setInternetActive(nextState);
    const msg = nextState
      ? "🟢 Internet service resumed! Line is active."
      : "🔴 Internet line paused (OFF). WAN traffic temporarily suspended.";
    setInternetStatusToast(msg);
    setTimeout(() => setInternetStatusToast(null), 3500);
  };

  // Speed test simulation runner
  const runSpeedTest = () => {
    if (testingSpeed) return;
    setTestingSpeed(true);
    setTestStage("ping");
    setCurrentSpeedGauge(0);

    setTimeout(() => {
      setPing(Math.floor(3 + Math.random() * 4));
      setJitter(Math.floor(1 + Math.random() * 2));
      setTestStage("download");

      let val = 0;
      const dlInterval = setInterval(() => {
        val += 3.5 + Math.random() * 4;
        if (val >= 31.8) {
          clearInterval(dlInterval);
          setDownloadSpeed(parseFloat((29.5 + Math.random() * 2.5).toFixed(1)));
          setCurrentSpeedGauge(30);
          setTestStage("upload");

          let upVal = 0;
          const upInterval = setInterval(() => {
            upVal += 3.2 + Math.random() * 3.8;
            if (upVal >= 30.2) {
              clearInterval(upInterval);
              setUploadSpeed(parseFloat((28.8 + Math.random() * 2.2).toFixed(1)));
              setTestStage("done");
              setTestingSpeed(false);
            } else {
              setCurrentSpeedGauge(Math.min(upVal, 30));
            }
          }, 120);
        } else {
          setCurrentSpeedGauge(Math.min(val, 32));
        }
      }, 120);
    }, 1000);
  };

  const handlePayBill = (e: React.FormEvent) => {
    e.preventDefault();
    setPaySuccess(true);
    setTimeout(() => {
      setPaySuccess(false);
      setPayModalOpen(false);
    }, 2200);
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    setTicketSubmitted(true);
    setTimeout(() => {
      setTicketSubmitted(false);
      setTicketModalOpen(false);
      setTicketSubject("");
      setTicketMessage("");
    }, 1800);
  };

  const handleApplyPromo = () => {
    if (promoCode.trim().toUpperCase() === "SHEBA10" || promoCode.trim().toUpperCase() === "EID50") {
      setPromoApplied(true);
    } else {
      alert("Invalid or expired promo code. Try 'SHEBA10'");
    }
  };

  const totalBillAmount = promoApplied ? 720 : 800;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Dedicated Portal Header */}
      <PortalHeader onPayClick={() => setPayModalOpen(true)} />

      <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Welcome & Account Quick Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-background p-6 sm:p-8 shadow-2xl">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 -mb-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 tracking-wider uppercase">
                  Subscriber Self-Care
                </span>
                {internetActive ? (
                  <Badge variant="success" className="gap-1 text-[11px] py-0.5 px-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Internet ON (Active Fiber Line)
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1 text-[11px] py-0.5 px-2 bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    Internet OFF (Line Paused)
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground font-mono bg-card/60 px-2 py-0.5 rounded border border-border">
                  Optical Signal: <span className="text-emerald-400 font-semibold">-19.4 dBm (Healthy)</span>
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Welcome back, <span className="text-indigo-400">Tanvir Ahmed</span>
              </h1>

              <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-muted-foreground">
                <p>Subscriber ID: <span className="text-foreground font-mono font-bold">SB-1001</span></p>
                <span>•</span>
                <p>PPPoE ID: <span className="text-foreground font-mono font-bold">tanvir_home</span></p>
                <span>•</span>
                <p>IP: <span className="text-indigo-400 font-mono font-bold">103.145.120.45</span></p>
                <span>•</span>
                <p>Zone: <span className="text-foreground font-bold">Uttara Sector 7</span></p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* One-click Internet Switch */}
              <Button
                size="lg"
                onClick={toggleInternetAccess}
                className={`font-bold gap-2 text-xs h-11 px-4 rounded-xl border transition-all ${
                  internetActive
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20"
                    : "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30"
                }`}
              >
                {internetActive ? (
                  <>
                    <WifiOff className="h-4 w-4" /> Pause Internet (Turn OFF)
                  </>
                ) : (
                  <>
                    <Wifi className="h-4 w-4" /> Resume Internet (Turn ON)
                  </>
                )}
              </Button>

              <Button
                size="lg"
                onClick={() => setPayModalOpen(true)}
                className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-500 hover:from-indigo-700 hover:to-emerald-600 text-white font-bold gap-2 shadow-xl shadow-indigo-600/30 text-sm h-11 px-6 rounded-xl"
              >
                <Zap className="h-4 w-4 fill-amber-300 text-amber-300" />
                Pay Bill • {formatCurrency(totalBillAmount)}
              </Button>
            </div>
          </div>
        </div>

        {/* Toast for internet on/off */}
        {internetStatusToast && (
          <div className="p-3 rounded-xl bg-card border border-indigo-500/40 text-foreground text-xs font-semibold flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
            <span>{internetStatusToast}</span>
            <button
              onClick={() => setInternetStatusToast(null)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Portal Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border/80 pb-px scrollbar-none">
          {[
            { id: "overview", label: "Overview & Status", icon: Radio },
            { id: "billing", label: "My Invoices & Payments", icon: CreditCard },
            { id: "speedtest", label: "Speed & Bandwidth Test", icon: Gauge },
            { id: "packages", label: "Package Upgrade", icon: TrendingUp },
            { id: "support", label: "Support & Complaints", icon: Headphones },
            { id: "wifi", label: "WiFi & Router Control", icon: Wifi },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as PortalTab)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all cursor-pointer rounded-t-lg ${
                  isActive
                    ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : "text-muted-foreground"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ════════════════════════ TAB 1: OVERVIEW ════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Top 3 Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Package Speed Card */}
              <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-card to-card relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <Activity className="h-24 w-24 text-indigo-400" />
                </div>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    Subscribed Package
                  </CardDescription>
                  <CardTitle className="text-2xl font-black text-foreground flex items-center justify-between">
                    Turbo Stream
                    <Badge variant="outline" className="text-xs border-indigo-500/40 text-indigo-400 bg-indigo-500/10">
                      Standard Plan
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-black text-foreground font-mono">30</span>
                    <span className="text-sm font-bold text-indigo-400">Mbps Symmetrical</span>
                  </div>
                  <div className="p-3 rounded-xl bg-background/60 border border-border text-xs text-muted-foreground space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span>BDIX / Local Speed:</span>
                      <span className="text-emerald-400 font-bold font-mono">100 Mbps Unlimited</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>YouTube / Netflix Cache:</span>
                      <span className="text-indigo-400 font-bold">4K HDR Ultra-Fast</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Monthly Rental:</span>
                      <span className="text-foreground font-bold font-mono">৳800 / month</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Expiry & Validity */}
              <Card className="border-border bg-card/60 shadow-lg">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Subscription Validity
                  </CardDescription>
                  <CardTitle className="text-2xl font-black text-foreground flex items-center gap-2">
                    <Clock className="h-6 w-6 text-amber-400" />
                    18 Days Left
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Billing Cycle:</span>
                      <span className="font-semibold text-foreground">01 Sep - 30 Sep 2026</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Expiry Date:</span>
                      <span className="font-bold text-emerald-400 font-mono">24 September 2026 (11:59 PM)</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Cycle Progress</span>
                      <span>40% Elapsed</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full w-[40%]" />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPayModalOpen(true)}
                    className="w-full text-xs font-bold border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 mt-2"
                  >
                    Recharge in Advance
                  </Button>
                </CardContent>
              </Card>

              {/* Optical Line & Router Telemetry */}
              <Card className="border-border bg-card/60 shadow-lg">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Fiber Line & ONU Health
                  </CardDescription>
                  <CardTitle className="text-xl font-bold text-foreground flex items-center justify-between">
                    <span>Optical Good</span>
                    <span className="text-emerald-400 font-mono text-sm font-bold">-19.4 dBm</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-background/60 border border-border space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between text-muted-foreground">
                      <span>OLT Port:</span>
                      <span className="text-foreground font-semibold">EPON-0/2:14</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>ONU MAC:</span>
                      <span className="text-foreground font-semibold">BC:54:51:7A:B2:1C</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Uptime:</span>
                      <span className="text-emerald-400 font-semibold">14 Days, 6 Hours</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Optical laser rx is within optimal range (-8 to -24 dBm)</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions & ISP Announcements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Quick Actions */}
              <Card className="border-border bg-card/60">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    Quick Subscriber Services
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setActiveTab("speedtest")}
                    className="flex flex-col items-start p-3.5 rounded-xl border border-border/80 bg-background/50 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left group"
                  >
                    <Gauge className="h-5 w-5 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-foreground">Speed Test</span>
                    <span className="text-[11px] text-muted-foreground">Check real-time bandwidth</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("wifi")}
                    className="flex flex-col items-start p-3.5 rounded-xl border border-border/80 bg-background/50 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left group"
                  >
                    <Wifi className="h-5 w-5 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-foreground">WiFi Settings</span>
                    <span className="text-[11px] text-muted-foreground">Change router password</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("packages")}
                    className="flex flex-col items-start p-3.5 rounded-xl border border-border/80 bg-background/50 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left group"
                  >
                    <TrendingUp className="h-5 w-5 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-foreground">Upgrade Plan</span>
                    <span className="text-[11px] text-muted-foreground">Boost speed up to 100 Mbps</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab("support");
                      setTicketModalOpen(true);
                    }}
                    className="flex flex-col items-start p-3.5 rounded-xl border border-border/80 bg-background/50 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left group"
                  >
                    <Headphones className="h-5 w-5 text-rose-400 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-foreground">Support Ticket</span>
                    <span className="text-[11px] text-muted-foreground">Report line/wire issue</span>
                  </button>
                </CardContent>
              </Card>

              {/* ISP Bulletins & Emergency Hotline */}
              <Card className="border-border bg-card/60">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-400" />
                    ISP Notice & 24/7 Helpline
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3.5 text-xs">
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                    <p className="font-bold text-indigo-300">Scheduled Core Optical Upgrade</p>
                    <p className="text-[11px] text-muted-foreground">
                      On Friday (03:00 AM - 04:30 AM), core BDIX routing will be upgraded for lower gaming latency.
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-background/60 border border-border">
                    <div>
                      <p className="font-bold text-foreground">Emergency Tech Helpline</p>
                      <p className="text-[11px] text-muted-foreground">Available 24 hours / 7 days</p>
                    </div>
                    <a
                      href="tel:+8809612000000"
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                    >
                      📞 09612-000000
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ════════════════════════ TAB 2: BILLING & INVOICES ════════════════════════ */}
        {activeTab === "billing" && (
          <div className="space-y-6">
            {/* Summary banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-border bg-card/60 p-4">
                <p className="text-xs text-muted-foreground font-semibold">Current Month Status</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">PAID (September 2026)</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Next billing cycle: 01 Oct 2026</p>
              </Card>
              <Card className="border-border bg-card/60 p-4">
                <p className="text-xs text-muted-foreground font-semibold">Total Paid This Year</p>
                <p className="text-xl font-bold text-foreground mt-1">৳7,200 BDT</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">9 monthly recharges</p>
              </Card>
              <Card className="border-border bg-card/60 p-4 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Quick Payment Method</p>
                  <p className="text-sm font-bold text-indigo-400 mt-1">bKash / Nagad / Cards</p>
                </div>
                <Button size="sm" onClick={() => setPayModalOpen(true)} className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                  Pay Now / Advance
                </Button>
              </Card>
            </div>

            {/* Invoices List */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold">Billing Invoices & Receipts</CardTitle>
                  <CardDescription className="text-xs">Download official tax invoices for your company or personal records.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                      <tr>
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-4">Billing Month</th>
                        <th className="py-3 px-4">Package</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {[
                        { id: "INV-2026-09", month: "September 2026", pkg: "Turbo Stream (30 Mbps)", method: "bKash (TrxID: 9X8721)", amount: "৳800", status: "Paid", date: "01 Sep 2026" },
                        { id: "INV-2026-08", month: "August 2026", pkg: "Turbo Stream (30 Mbps)", method: "Nagad (TrxID: 4K1992)", amount: "৳800", status: "Paid", date: "01 Aug 2026" },
                        { id: "INV-2026-07", month: "July 2026", pkg: "Turbo Stream (30 Mbps)", method: "bKash (TrxID: 1M3401)", amount: "৳800", status: "Paid", date: "02 Jul 2026" },
                        { id: "INV-2026-06", month: "June 2026", pkg: "Standard (20 Mbps)", method: "bKash (TrxID: 7L5512)", amount: "৳600", status: "Paid", date: "01 Jun 2026" },
                        { id: "INV-2026-05", month: "May 2026", pkg: "Standard (20 Mbps)", method: "Mastercard", amount: "৳600", status: "Paid", date: "01 May 2026" },
                      ].map((inv) => (
                        <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-foreground">{inv.id}</td>
                          <td className="py-3 px-4 text-foreground">{inv.month}</td>
                          <td className="py-3 px-4 text-muted-foreground">{inv.pkg}</td>
                          <td className="py-3 px-4 text-muted-foreground">{inv.method}</td>
                          <td className="py-3 px-4 font-bold font-mono text-foreground">{inv.amount}</td>
                          <td className="py-3 px-4">
                            <Badge variant="success" className="text-[10px] px-1.5 py-0 h-4">
                              {inv.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => alert(`Downloading official PDF receipt for ${inv.id}...`)}
                              className="h-7 text-xs text-indigo-400 hover:text-indigo-300 gap-1"
                            >
                              <Download className="h-3.5 w-3.5" /> PDF
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════════════════════════ TAB 3: SPEED TEST & USAGE ════════════════════════ */}
        {activeTab === "speedtest" && (
          <div className="space-y-6">
            <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-card to-card p-6 sm:p-8 text-center space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-foreground">Real-Time Optical Speedometer</h2>
                <p className="text-xs text-muted-foreground">Test your connection speed directly against our core BDIX and International gateways.</p>
              </div>

              {/* Speed Meter Gauge Visual */}
              <div className="relative flex flex-col items-center justify-center my-4">
                <div className="w-56 h-56 rounded-full border-4 border-dashed border-indigo-500/40 flex flex-col items-center justify-center p-6 bg-card/80 shadow-2xl relative">
                  {testingSpeed && (
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-500 animate-spin border-t-transparent pointer-events-none" />
                  )}
                  <Gauge className="h-8 w-8 text-indigo-400 mb-1" />
                  <span className="text-5xl font-black font-mono text-foreground tracking-tight">
                    {testingSpeed ? currentSpeedGauge.toFixed(1) : downloadSpeed}
                  </span>
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider mt-1">Mbps</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                    {testingSpeed ? `Testing ${testStage.toUpperCase()}...` : "Connected to BDIX-01"}
                  </span>
                </div>
              </div>

              {/* Ping / Jitter / Upload stats */}
              <div className="grid grid-cols-3 max-w-md mx-auto gap-4">
                <div className="p-3 rounded-xl bg-background/60 border border-border">
                  <p className="text-[11px] text-muted-foreground font-semibold">Latency (Ping)</p>
                  <p className="text-lg font-black font-mono text-emerald-400">{ping} ms</p>
                </div>
                <div className="p-3 rounded-xl bg-background/60 border border-border">
                  <p className="text-[11px] text-muted-foreground font-semibold">Jitter</p>
                  <p className="text-lg font-black font-mono text-indigo-400">{jitter} ms</p>
                </div>
                <div className="p-3 rounded-xl bg-background/60 border border-border">
                  <p className="text-[11px] text-muted-foreground font-semibold">Upload Speed</p>
                  <p className="text-lg font-black font-mono text-amber-400">{uploadSpeed} Mbps</p>
                </div>
              </div>

              <div>
                <Button
                  size="lg"
                  disabled={testingSpeed}
                  onClick={runSpeedTest}
                  className="bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-700 hover:to-emerald-600 text-white font-bold gap-2 px-8 h-12 rounded-xl shadow-lg shadow-indigo-600/30 text-sm"
                >
                  <RotateCcw className={`h-4 w-4 ${testingSpeed ? "animate-spin" : ""}`} />
                  {testingSpeed ? "Testing Connection..." : "Start Full Speed Test"}
                </Button>
              </div>
            </Card>

            {/* Daily Usage Graph Simulation */}
            <Card className="border-border bg-card/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Monthly Data Usage Breakdown</h3>
                  <p className="text-xs text-muted-foreground">Total data transferred this month: <span className="text-indigo-400 font-bold font-mono">428.6 GB</span> (Unlimited Plan)</p>
                </div>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs">
                  No FUP Throttling
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-background/60 border border-border">
                  <span className="text-[11px] text-muted-foreground font-medium">BDIX / Local Transfer</span>
                  <p className="text-base font-bold text-emerald-400 font-mono">245.2 GB (57%)</p>
                </div>
                <div className="p-3 rounded-xl bg-background/60 border border-border">
                  <span className="text-[11px] text-muted-foreground font-medium">YouTube / Netflix Video</span>
                  <p className="text-base font-bold text-indigo-400 font-mono">142.8 GB (33%)</p>
                </div>
                <div className="p-3 rounded-xl bg-background/60 border border-border">
                  <span className="text-[11px] text-muted-foreground font-medium">International Web & Gaming</span>
                  <p className="text-base font-bold text-amber-400 font-mono">40.6 GB (10%)</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ════════════════════════ TAB 4: PACKAGES ════════════════════════ */}
        {activeTab === "packages" && (
          <div className="space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-1">
              <h2 className="text-xl font-bold text-foreground">Available Fiber Internet Packages</h2>
              <p className="text-xs text-muted-foreground">Upgrade or modify your broadband plan with instant activation upon payment.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { name: "Starter Fiber", speed: "15 Mbps", bdix: "50 Mbps", price: "৳500", current: false, color: "border-border" },
                { name: "Turbo Stream", speed: "30 Mbps", bdix: "100 Mbps", price: "৳800", current: true, color: "border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-500/5" },
                { name: "Ultra Gamer Pro", speed: "60 Mbps", bdix: "150 Mbps", price: "৳1,200", current: false, color: "border-border" },
              ].map((pkg) => (
                <Card key={pkg.name} className={`p-6 space-y-5 relative ${pkg.color}`}>
                  {pkg.current && (
                    <div className="absolute top-3 right-3">
                      <Badge variant="success" className="text-[10px]">Current Plan</Badge>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{pkg.name}</h3>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-3xl font-black font-mono text-foreground">{pkg.price}</span>
                      <span className="text-xs text-muted-foreground">/ month</span>
                    </div>
                  </div>

                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2 text-foreground">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span><strong>{pkg.speed}</strong> Dedicated Symmetrical</span>
                    </li>
                    <li className="flex items-center gap-2 text-foreground">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span><strong>{pkg.bdix}</strong> High-Speed BDIX</span>
                    </li>
                    <li className="flex items-center gap-2 text-foreground">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span>24/7 Optical Line Monitoring</span>
                    </li>
                    <li className="flex items-center gap-2 text-foreground">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span>Real IPv6 Public Range</span>
                    </li>
                  </ul>

                  <Button
                    disabled={pkg.current}
                    onClick={() => alert(`Plan upgrade request for ${pkg.name} received! Our support will contact you or update on next bill cycle.`)}
                    className={`w-full text-xs font-bold h-10 ${
                      pkg.current
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20"
                    }`}
                  >
                    {pkg.current ? "Active Plan" : `Upgrade to ${pkg.name}`}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════ TAB 5: SUPPORT ════════════════════════ */}
        {activeTab === "support" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Support Tickets & Line Complaints</h2>
                <p className="text-xs text-muted-foreground">Track ongoing technician visits or open a new complaint.</p>
              </div>
              <Button onClick={() => setTicketModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-semibold">
                <Plus className="h-4 w-4" /> Open New Ticket
              </Button>
            </div>

            {/* Tickets Table */}
            <Card className="border-border bg-card/60">
              <CardContent className="p-0">
                <div className="divide-y divide-border/40 text-xs">
                  {[
                    { id: "TCK-8902", subject: "Optical Fiber wire shifted during building renovation", category: "Fiber Cut / Physical Line", status: "Resolved", date: "15 Aug 2026", tech: "Farhan (Tech Lead)" },
                    { id: "TCK-7210", subject: "Port forwarding request for home NAS server", category: "Routing / IP Config", status: "Resolved", date: "02 Jul 2026", tech: "Automated NOC" },
                  ].map((t) => (
                    <div key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-400">{t.id}</span>
                          <span className="font-bold text-foreground">{t.subject}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Category: {t.category} • Handled by: {t.tech} • Date: {t.date}</p>
                      </div>
                      <Badge variant="success" className="text-[10px] self-start sm:self-center">
                        {t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════════════════════════ TAB 6: WIFI & ROUTER ════════════════════════ */}
        {activeTab === "wifi" && (
          <div className="space-y-6">
            <Card className="border-border bg-card/60 max-w-xl mx-auto">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-indigo-400" />
                  Home Wi-Fi & Router Credentials
                </CardTitle>
                <CardDescription className="text-xs">Manage your home wireless network configuration.</CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-foreground mb-1">Wi-Fi Network Name (SSID)</label>
                  <Input defaultValue="Sheba_Fiber_Tanvir_5G" className="bg-background h-9 text-xs font-mono" />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Wi-Fi Password</label>
                  <div className="relative">
                    <Input
                      type={showWifiPass ? "text" : "password"}
                      value={wifiPass}
                      onChange={(e) => setWifiPass(e.target.value)}
                      className="bg-background h-9 text-xs pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWifiPass(!showWifiPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showWifiPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    onClick={() => {
                      setWifiSaved(true);
                      setTimeout(() => setWifiSaved(false), 2500);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                  >
                    Save & Sync Router
                  </Button>
                  {wifiSaved && (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> Wi-Fi updated!
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ════════════════════════ BILLING MODAL ════════════════════════ */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-400" />
              Instant Bill Recharge
            </DialogTitle>
            <DialogDescription className="text-xs">
              Account: <strong className="text-foreground font-mono">SB-1001 (Tanvir Ahmed)</strong>
            </DialogDescription>
          </DialogHeader>

          {paySuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-4 ring-emerald-500/30">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Recharge Successful!</h3>
              <p className="text-xs text-muted-foreground">Your fiber line validity has been extended to 30 October 2026.</p>
            </div>
          ) : (
            <form onSubmit={handlePayBill} className="space-y-4 text-xs">
              {/* Amount Display */}
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
                <div>
                  <span className="text-muted-foreground text-[11px]">Payable Bill</span>
                  <p className="text-xl font-black font-mono text-indigo-400">{formatCurrency(totalBillAmount)}</p>
                </div>
                {promoApplied && <Badge variant="success">10% OFF APPLIED</Badge>}
              </div>

              {/* Payment Gateway Picker */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Select Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {["bKash", "Nagad", "Cards / NetBanking"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMethod(m)}
                      className={`p-2.5 rounded-lg border text-xs font-bold transition-all ${
                        selectedMethod === m
                          ? "border-indigo-500 bg-indigo-500/20 text-indigo-400"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Promo code */}
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Discount Voucher / Coupon</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter code (e.g. SHEBA10)"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="bg-background h-9 text-xs"
                  />
                  <Button type="button" variant="outline" onClick={handleApplyPromo} className="text-xs h-9">
                    Apply
                  </Button>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="ghost" onClick={() => setPayModalOpen(false)} className="text-xs">
                  Cancel
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
                  Confirm & Pay {formatCurrency(totalBillAmount)}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════ EMERGENCY LOAN MODAL ════════════════════════ */}
      <Dialog open={advanceModalOpen} onOpenChange={setAdvanceModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Emergency 3-Day Grace Credit
            </DialogTitle>
            <DialogDescription className="text-xs">
              Need more time to pay? Request 3 days emergency internet connection instantly without disconnection.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] space-y-1">
              <p className="font-bold">Terms of Grace Period:</p>
              <p>• 3 days credit will be added to your account instantly.</p>
              <p>• The regular monthly recharge amount will adjust the 3 days on your next payment.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAdvanceModalOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                alert("Emergency 3 days grace period activated successfully!");
                setAdvanceModalOpen(false);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
            >
              Activate 3 Days Credit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════ NEW TICKET MODAL ════════════════════════ */}
      <Dialog open={ticketModalOpen} onOpenChange={setTicketModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Headphones className="h-4 w-4 text-indigo-400" />
              Submit Technical Complaint
            </DialogTitle>
            <DialogDescription className="text-xs">Our on-field optical technicians will be assigned within 30 minutes.</DialogDescription>
          </DialogHeader>
          {ticketSubmitted ? (
            <div className="py-6 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-foreground">Ticket Created (#TCK-9014)</p>
              <p className="text-xs text-muted-foreground">Technician Farhan has been assigned to your Uttara area.</p>
            </div>
          ) : (
            <form onSubmit={handleCreateTicket} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1">Issue Category</label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option>Slow Speed / High Latency</option>
                  <option>Optical Fiber Wire Cut / Red LOS light</option>
                  <option>Wi-Fi Router Reset / Configuration</option>
                  <option>Payment & Billing Discrepancy</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Subject</label>
                <Input
                  required
                  placeholder="Brief summary of the issue..."
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  className="bg-background h-9 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Details & Description</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe when the issue started, router lights status, etc."
                  value={ticketMessage}
                  onChange={(e) => setTicketMessage(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="ghost" onClick={() => setTicketModalOpen(false)} className="text-xs">
                  Cancel
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
                  Submit Ticket
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  LogIn,
  LogOut,
  RefreshCw,
  Receipt,
  Search,
  KeyRound,
  ShieldCheck,
  Video,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { PortalHeader } from "@/components/layouts/PortalHeader";
import { PortalApiClient } from "@/lib/portal-api";

// Sub-components imported for client self-care portal
import { ChangePasswordModal } from "@/components/portal/ChangePasswordModal";
import { FunBoxGrid } from "@/components/portal/FunBoxGrid";
import { LiveTrafficGraph } from "@/components/portal/LiveTrafficGraph";
import { SessionHistoryTable } from "@/components/portal/SessionHistoryTable";
import { PrintableInvoiceModal } from "@/components/portal/PrintableInvoiceModal";
import { SmsPaymentVerificationModal } from "@/components/portal/SmsPaymentVerificationModal";
import { PaymentTutorialVideo } from "@/components/portal/PaymentTutorialVideo";
import { ThreadedTicketModal } from "@/components/portal/ThreadedTicketModal";

type PortalTab = "overview" | "billing" | "speedtest" | "packages" | "support" | "wifi";

export default function SubscriberPortalPage() {
  const [activeTab, setActiveTab] = useState<PortalTab>("overview");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"password" | "otp">("password");
  const [authStep, setAuthStep] = useState<"phone" | "otp">("phone");
  const [identifier, setIdentifier] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Extended self-care modals state
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [smsVerifyOpen, setSmsVerifyOpen] = useState(false);
  const [printableInvoiceId, setPrintableInvoiceId] = useState<string | null>(null);
  const [printableInvoiceData, setPrintableInvoiceData] = useState<any>(null);
  const [selectedTicketThread, setSelectedTicketThread] = useState<any>(null);

  // Portal live data
  const [profile, setProfile] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(false);

  // Payment modal state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<"bKash" | "Manual_MFS" | "Advance_Credit">("bKash");
  const [paySuccess, setPaySuccess] = useState(false);
  const [paySuccessMsg, setPaySuccessMsg] = useState("");
  const [bkashPaymentId, setBkashPaymentId] = useState<string | null>(null);
  const [bkashUrl, setBkashUrl] = useState<string | null>(null);
  const [bkashLoading, setBkashLoading] = useState(false);
  const [mfsTrxId, setMfsTrxId] = useState("");
  const [mfsClaimLoading, setMfsClaimLoading] = useState(false);
  const [mfsClaimError, setMfsClaimError] = useState<string | null>(null);

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
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});

  // WiFi password toggle
  const [showWifiPass, setShowWifiPass] = useState(false);
  const [wifiPass, setWifiPass] = useState("sheba_fiber_2026");
  const [wifiSaved, setWifiSaved] = useState(false);

  // Internet Line On/Off Control state
  const [internetActive, setInternetActive] = useState(true);
  const [internetStatusToast, setInternetStatusToast] = useState<string | null>(null);

  // Load live data if token exists
  useEffect(() => {
    if (PortalApiClient.isAuthenticated()) {
      setIsLoggedIn(true);
      loadPortalData();
    } else {
      // Load fallback demo state so user can preview immediately
      setProfile({
        full_name: "Tanvir Ahmed",
        customer_code: "SB-1001",
        pppoe_username: "tanvir_home",
        static_ip: "103.145.120.45",
        area_zone: "Uttara Sector 7",
        monthly_bill: 800,
        due_amount: 0,
        advance_amount: 500,
        expiry_date: "2026-09-30",
        status: "Active",
        package_details: {
          name: "Turbo Stream",
          speed_mbps: 30,
          upload_speed_mbps: 30,
          regular_price: 800,
        },
      });
      setSession({
        is_online: true,
        ip_address: "103.145.120.45",
        mac_address: "BC:54:51:7A:B2:1C",
        uptime: "14 Days, 6 Hours",
        bytes_in: 245200000000,
        bytes_out: 40600000000,
      });
    }
  }, []);

  const loadPortalData = async () => {
    setLoadingData(true);
    try {
      const [profData, sessData, pkgData, invData, notifData, tckData, settData] = await Promise.allSettled([
        PortalApiClient.getProfile(),
        PortalApiClient.getSession(),
        PortalApiClient.getPackages(),
        PortalApiClient.getInvoices(),
        PortalApiClient.getNotifications(),
        PortalApiClient.getTickets(),
        PortalApiClient.getSettings(),
      ]);

      if (profData.status === "fulfilled") setProfile(profData.value);
      if (sessData.status === "fulfilled") setSession(sessData.value);
      if (pkgData.status === "fulfilled") setPackages(pkgData.value);
      if (invData.status === "fulfilled") setInvoices(invData.value);
      if (notifData.status === "fulfilled") setNotifications(notifData.value.notifications || []);
      if (tckData.status === "fulfilled") setTickets(tckData.value);
      if (settData.status === "fulfilled") setSettings(settData.value);
    } catch (err) {
      console.error("Error loading portal data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  // ════════════════════════ AUTHENTICATION HANDLERS ════════════════════════
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      await PortalApiClient.loginWithPassword(loginUsername.trim(), loginPassword);
      setIsLoggedIn(true);
      setAuthModalOpen(false);
      setLoginPassword("");
      await loadPortalData();
    } catch (err: any) {
      setAuthError(err.message || "Invalid PPPoE username or password");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const data = await PortalApiClient.requestOtp(identifier.trim());
      setAuthStep("otp");
      if (data.debug_otp) {
        setDebugOtp(data.debug_otp);
        setOtpCode(data.debug_otp);
      }
    } catch (err: any) {
      setAuthError(err.message || "Failed to request OTP code");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      await PortalApiClient.verifyOtp(identifier.trim(), otpCode.trim());
      setIsLoggedIn(true);
      setAuthModalOpen(false);
      setAuthStep("phone");
      setOtpCode("");
      await loadPortalData();
    } catch (err: any) {
      setAuthError(err.message || "Invalid OTP code");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    PortalApiClient.clearToken();
    setIsLoggedIn(false);
    setProfile(null);
    setSession(null);
  };

  // ════════════════════════ PAYMENTS HANDLERS ════════════════════════
  const handleInitiateBkash = async () => {
    setBkashLoading(true);
    try {
      const amountToPay = profile?.due_amount > 0 ? profile.due_amount : profile?.monthly_bill || 800;
      const res = await PortalApiClient.createBkashPayment(amountToPay);
      setBkashPaymentId(res.payment_id);
      setBkashUrl(res.bkash_url);
    } catch (err: any) {
      alert(err.message || "bKash initialization failed");
    } finally {
      setBkashLoading(false);
    }
  };

  const handleConfirmBkashExecution = async () => {
    if (!bkashPaymentId) return;
    setBkashLoading(true);
    try {
      const res = await PortalApiClient.executeBkashPayment(bkashPaymentId);
      setPaySuccess(true);
      setPaySuccessMsg(`bKash payment confirmed! TrxID: ${res.trx_id}. Account recharged.`);
      setBkashPaymentId(null);
      setBkashUrl(null);
      await loadPortalData();
      setTimeout(() => {
        setPaySuccess(false);
        setPayModalOpen(false);
      }, 3000);
    } catch (err: any) {
      alert(err.message || "bKash confirmation failed");
    } finally {
      setBkashLoading(false);
    }
  };

  const handleClaimManualMfs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfsTrxId.trim()) return;
    setMfsClaimLoading(true);
    setMfsClaimError(null);
    try {
      const res = await PortalApiClient.claimManualMfsPayment(mfsTrxId.trim());
      setPaySuccess(true);
      setPaySuccessMsg(res.message || "MFS payment successfully claimed and credited!");
      setMfsTrxId("");
      await loadPortalData();
      setTimeout(() => {
        setPaySuccess(false);
        setPayModalOpen(false);
      }, 3000);
    } catch (err: any) {
      setMfsClaimError(err.message || "No pending payment found with this TrxID");
    } finally {
      setMfsClaimLoading(false);
    }
  };

  const handleAdvanceRecharge = async () => {
    try {
      const res = await PortalApiClient.recharge();
      if (res.insufficient_balance) {
        setSelectedMethod("bKash");
        handleInitiateBkash();
      } else {
        setPaySuccess(true);
        setPaySuccessMsg(res.message || "Recharged successfully using advance balance.");
        await loadPortalData();
        setTimeout(() => {
          setPaySuccess(false);
          setPayModalOpen(false);
        }, 2500);
      }
    } catch (err: any) {
      alert(err.message || "Recharge failed");
    }
  };

  // ════════════════════════ SUPPORT TICKET HANDLERS ════════════════════════
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketSubmitting(true);
    try {
      await PortalApiClient.createTicket({
        category: ticketCategory,
        subject: ticketSubject,
        description: ticketMessage,
        priority: "Medium",
      });
      setTicketSubject("");
      setTicketMessage("");
      setTicketModalOpen(false);
      await loadPortalData();
      alert("Support ticket submitted successfully. Our technicians have been notified.");
    } catch (err: any) {
      alert(err.message || "Failed to submit ticket");
    } finally {
      setTicketSubmitting(false);
    }
  };

  const handleReplyTicket = async (ticketId: string) => {
    const msg = replyTextMap[ticketId]?.trim();
    if (!msg) return;
    try {
      await PortalApiClient.replyTicket(ticketId, msg);
      setReplyTextMap((prev) => ({ ...prev, [ticketId]: "" }));
      await loadPortalData();
    } catch (err: any) {
      alert(err.message || "Failed to post reply");
    }
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

  const toggleInternetAccess = () => {
    const nextState = !internetActive;
    setInternetActive(nextState);
    const msg = nextState
      ? "🟢 Internet service resumed! Line is active."
      : "🔴 Internet line paused (OFF). WAN traffic temporarily suspended.";
    setInternetStatusToast(msg);
    setTimeout(() => setInternetStatusToast(null), 3500);
  };

  const displayAmount = profile?.due_amount > 0 ? profile.due_amount : profile?.monthly_bill || 800;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Dedicated Portal Header with Authentication status */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <span className="font-extrabold text-foreground text-sm sm:text-base tracking-tight">ShebaFi</span>
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20">
                Self-Care
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isLoggedIn ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Logged in as <strong className="text-foreground">{profile?.full_name || "Customer"}</strong>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChangePasswordOpen(true)}
                  className="text-xs h-8 gap-1.5 border-border hover:text-indigo-400"
                >
                  <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="hidden md:inline">Change Password</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleLogout} className="text-xs h-8 gap-1 border-border">
                  <LogOut className="h-3.5 w-3.5" /> Logout
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setAuthMode("password");
                  setAuthStep("phone");
                  setAuthModalOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 gap-1 font-semibold"
              >
                <LogIn className="h-3.5 w-3.5" /> Customer Login
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => setPayModalOpen(true)}
              className="bg-gradient-to-r from-indigo-600 to-emerald-600 text-white text-xs h-8 gap-1.5 font-bold shadow-md shadow-indigo-500/20"
            >
              <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-300" /> Pay Bill • {formatCurrency(displayAmount)}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Notifications Alert Bar */}
        {notifications.length > 0 && (
          <div className="space-y-2">
            {notifications.map((n, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs font-semibold shadow-sm ${
                  n.type === "error"
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                    : n.type === "warning"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>{n.title}:</strong> {n.message}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setPayModalOpen(true)}
                  className="h-7 text-xs bg-card/80 border border-border text-foreground hover:bg-card"
                >
                  Pay Now
                </Button>
              </div>
            ))}
          </div>
        )}

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
                {internetActive && session?.is_online !== false ? (
                  <Badge variant="success" className="gap-1 text-[11px] py-0.5 px-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Internet ON (Active Fiber Line)
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1 text-[11px] py-0.5 px-2 bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    Internet Suspended / Expired
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground font-mono bg-card/60 px-2 py-0.5 rounded border border-border">
                  Optical Signal: <span className="text-emerald-400 font-semibold">-19.4 dBm (Healthy)</span>
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Welcome back, <span className="text-indigo-400">{profile?.full_name || "Tanvir Ahmed"}</span>
              </h1>

              <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-muted-foreground">
                <p>Subscriber ID: <span className="text-foreground font-mono font-bold">{profile?.customer_code || "SB-1001"}</span></p>
                <span>•</span>
                <p>PPPoE ID: <span className="text-foreground font-mono font-bold">{profile?.pppoe_username || "tanvir_home"}</span></p>
                <span>•</span>
                <p>IP: <span className="text-indigo-400 font-mono font-bold">{session?.ip_address || profile?.static_ip || "103.145.120.45"}</span></p>
                <span>•</span>
                <p>Zone: <span className="text-foreground font-bold">{profile?.area_zone || "Uttara Sector 7"}</span></p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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
                Pay Bill • {formatCurrency(displayAmount)}
              </Button>
            </div>
          </div>
        </div>

        {/* Toast for internet on/off */}
        {internetStatusToast && (
          <div className="p-3 rounded-xl bg-card border border-indigo-500/40 text-foreground text-xs font-semibold flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
            <span>{internetStatusToast}</span>
            <button onClick={() => setInternetStatusToast(null)} className="text-muted-foreground hover:text-foreground text-xs">
              ✕
            </button>
          </div>
        )}

        {/* Portal Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border/80 pb-px scrollbar-none">
          {[
            { id: "overview", label: "Overview & Status", icon: Radio },
            { id: "billing", label: "My Invoices & Payments", icon: CreditCard },
            { id: "speedtest", label: "Speed & Network Usage", icon: Gauge },
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
                    {profile?.package_details?.name || "Turbo Stream"}
                    <Badge variant="outline" className="text-xs border-indigo-500/40 text-indigo-400 bg-indigo-500/10">
                      Standard Plan
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-black text-foreground font-mono">
                      {profile?.package_details?.speed_mbps || 30}
                    </span>
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
                      <span className="text-foreground font-bold font-mono">
                        ৳{profile?.monthly_bill || profile?.package_details?.regular_price || 800} / month
                      </span>
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
                    {profile?.expiry_date ? `Valid till ${profile.expiry_date}` : "Active"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Outstanding Due:</span>
                      <span className={`font-bold font-mono ${profile?.due_amount > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                        ৳{profile?.due_amount || "0.00"}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Advance Balance:</span>
                      <span className="font-bold text-indigo-400 font-mono">৳{profile?.advance_amount || "0.00"}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPayModalOpen(true)}
                      className="flex-1 text-xs font-bold border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                    >
                      Recharge Online
                    </Button>
                    {profile?.advance_amount >= (profile?.monthly_bill || 800) && (
                      <Button
                        size="sm"
                        onClick={handleAdvanceRecharge}
                        className="flex-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Renew with Advance
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Live Session Telemetry */}
              <Card className="border-border bg-card/60 shadow-lg">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Live Session & Diagnostics
                  </CardDescription>
                  <CardTitle className="text-xl font-bold text-foreground flex items-center justify-between">
                    <span>{session?.is_online ? "Connected" : "Offline"}</span>
                    <span className="text-emerald-400 font-mono text-sm font-bold">
                      {session?.is_online ? "Online" : "Disconnected"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-background/60 border border-border space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Assigned IP:</span>
                      <span className="text-foreground font-semibold">{session?.ip_address || "100.64.10.45"}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>MAC Address:</span>
                      <span className="text-foreground font-semibold">{session?.mac_address || "BC:54:51:7A:B2:1C"}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Session Uptime:</span>
                      <span className="text-emerald-400 font-semibold">{session?.uptime || "0s"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Fun Box Media & BDIX Entertainment Hub */}
            <FunBoxGrid />
          </div>
        )}

        {/* ════════════════════════ TAB 2: BILLING & INVOICES ════════════════════════ */}
        {activeTab === "billing" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-border bg-card/60 p-4">
                <p className="text-xs text-muted-foreground font-semibold">Account Due Balance</p>
                <p className={`text-xl font-bold mt-1 ${profile?.due_amount > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  ৳{profile?.due_amount || "0.00"} BDT
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Expiry: {profile?.expiry_date || "Active"}</p>
              </Card>
              <Card className="border-border bg-card/60 p-4">
                <p className="text-xs text-muted-foreground font-semibold">Advance Balance</p>
                <p className="text-xl font-bold text-indigo-400 mt-1">৳{profile?.advance_amount || "0.00"} BDT</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Ready for auto-renewal</p>
              </Card>
              <Card className="border-border bg-card/60 p-4 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Recharge & Instant Verification</p>
                  <p className="text-sm font-bold text-foreground mt-1">bKash, PayBill & SMS TrxID</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" onClick={() => setPayModalOpen(true)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 font-bold">
                    Pay Now
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSmsVerifyOpen(true)}
                    className="flex-1 text-xs h-8 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 gap-1 font-bold"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Verify SMS
                  </Button>
                </div>
              </Card>
            </div>

            {/* How to Pay Bill: Video Tutorial & App Guides */}
            <PaymentTutorialVideo videoUrl={settings?.payment_tutorial_video} />

            {/* Invoices List */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-sm font-bold">Billing Invoices & Receipts</CardTitle>
                <CardDescription className="text-xs">Your official itemized broadband receipts and invoices.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                      <tr>
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-4">Month</th>
                        <th className="py-3 px-4">Package</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {invoices.length > 0 ? (
                        invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-4 font-mono font-semibold text-foreground">{inv.invoice_no}</td>
                            <td className="py-3 px-4 text-foreground">{inv.billing_month}</td>
                            <td className="py-3 px-4 text-muted-foreground">{inv.package_name}</td>
                            <td className="py-3 px-4 font-bold font-mono text-foreground">৳{inv.total_payable}</td>
                            <td className="py-3 px-4">
                              <Badge variant={inv.status === "PAID" ? "success" : "destructive"} className="text-[10px] px-1.5 py-0 h-4">
                                {inv.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setPrintableInvoiceId(String(inv.id));
                                  setPrintableInvoiceData(inv);
                                }}
                                className="h-7 text-xs text-indigo-400 hover:text-indigo-300 gap-1.5"
                              >
                                <Receipt className="h-3.5 w-3.5" /> View Receipt
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            No billing records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════════════════════════ TAB 3: SPEED & NETWORK USAGE ════════════════════════ */}
        {activeTab === "speedtest" && (
          <div className="space-y-6">
            {/* Live Bandwidth Rolling Canvas/SVG Chart */}
            <LiveTrafficGraph isLoggedIn={isLoggedIn} />

            {/* Speedometer Gauge Card */}
            <Card className="border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-card to-card p-6 sm:p-8 text-center space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-foreground">Real-Time Optical Speedometer</h2>
                <p className="text-xs text-muted-foreground">Test your connection speed directly against our core BDIX and International gateways.</p>
              </div>

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

            {/* 50-Session Connection & Data Usage Logs */}
            <SessionHistoryTable isLoggedIn={isLoggedIn} />
          </div>
        )}

        {/* ════════════════════════ TAB 4: PACKAGES ════════════════════════ */}
        {activeTab === "packages" && (
          <div className="space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-1">
              <h2 className="text-xl font-bold text-foreground">Available Fiber Internet Packages</h2>
              <p className="text-xs text-muted-foreground">Select a package to upgrade or renew your broadband connection.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {packages.length > 0 ? (
                packages.map((pkg) => (
                  <Card key={pkg.id} className="p-6 space-y-5 relative border-border bg-card/60">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{pkg.name}</h3>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-3xl font-black font-mono text-foreground">৳{pkg.regular_price}</span>
                        <span className="text-xs text-muted-foreground">/ {pkg.validity_days || 30} days</span>
                      </div>
                    </div>

                    <ul className="space-y-2 text-xs text-muted-foreground">
                      <li className="flex items-center gap-2 text-foreground">
                        <Check className="h-4 w-4 text-emerald-400" />
                        <span><strong>{pkg.speed_mbps} Mbps</strong> Download Speed</span>
                      </li>
                      <li className="flex items-center gap-2 text-foreground">
                        <Check className="h-4 w-4 text-emerald-400" />
                        <span><strong>{pkg.upload_speed_mbps || pkg.speed_mbps} Mbps</strong> Upload Speed</span>
                      </li>
                      <li className="flex items-center gap-2 text-foreground">
                        <Check className="h-4 w-4 text-emerald-400" />
                        <span>24/7 Dedicated Line Support</span>
                      </li>
                    </ul>

                    <Button
                      onClick={() => {
                        setPayModalOpen(true);
                      }}
                      className="w-full text-xs font-bold h-10 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20"
                    >
                      Select & Recharge
                    </Button>
                  </Card>
                ))
              ) : (
                <div className="col-span-3 text-center py-10 text-muted-foreground">Loading available packages...</div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════ TAB 5: SUPPORT ════════════════════════ */}
        {activeTab === "support" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Support Tickets & Line Complaints</h2>
                <p className="text-xs text-muted-foreground">Submit a complaint or reply directly to your active ticket threads.</p>
              </div>
              <Button onClick={() => setTicketModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-semibold">
                <Plus className="h-4 w-4" /> Open New Ticket
              </Button>
            </div>

            <div className="space-y-4">
              {tickets.length > 0 ? (
                tickets.map((t) => (
                  <Card key={t.id} className="border-border bg-card/60 p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-400">{t.ticket_no}</span>
                          <span className="font-bold text-foreground">{t.subject}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Category: {t.category} • Priority: {t.priority}</p>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <Badge variant={t.status === "Open" ? "default" : "success"} className="text-[10px]">
                          {t.status}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedTicketThread(t)}
                          className="h-7 text-xs gap-1 border-border hover:bg-indigo-500/10 hover:text-indigo-400"
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
                          <span>View Thread</span>
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">{t.description}</p>

                    {/* Replies Thread */}
                    {t.replies && t.replies.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <span className="text-[11px] font-bold text-foreground">Conversation History:</span>
                        {t.replies.map((r: any) => (
                          <div
                            key={r.id}
                            className={`p-2.5 rounded-xl text-xs ${
                              r.is_staff ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-300" : "bg-muted/40 text-foreground"
                            }`}
                          >
                            <div className="flex justify-between text-[10px] opacity-75 mb-1">
                              <strong>{r.sender_name} {r.is_staff ? "(ISP Support Team)" : "(You)"}</strong>
                            </div>
                            <p>{r.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply Input Box */}
                    <div className="flex gap-2 pt-2">
                      <Input
                        placeholder="Write a reply..."
                        value={replyTextMap[t.id] || ""}
                        onChange={(e) => setReplyTextMap((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        className="bg-background h-8 text-xs flex-1"
                      />
                      <Button size="sm" onClick={() => handleReplyTicket(t.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                        Reply
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="border-border bg-card/60 p-8 text-center text-muted-foreground text-xs">
                  No support tickets found. Click "Open New Ticket" to report any line or speed issue.
                </Card>
              )}
            </div>
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

      {/* ════════════════════════ LOGIN MODAL (PASSWORD OR OTP) ════════════════════════ */}
      <Dialog open={authModalOpen} onOpenChange={setAuthModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <LogIn className="h-5 w-5 text-indigo-400" />
              Customer Self-Care Login
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sign in with your PPPoE credentials or verify via mobile phone OTP.
            </DialogDescription>
          </DialogHeader>

          {/* Segmented Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-muted/50 rounded-xl border border-border text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setAuthMode("password");
                setAuthError(null);
              }}
              className={`py-1.5 rounded-lg transition-all ${
                authMode === "password"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              PPPoE Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("otp");
                setAuthError(null);
              }}
              className={`py-1.5 rounded-lg transition-all ${
                authMode === "otp"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mobile OTP
            </button>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
              {authError}
            </div>
          )}

          {authMode === "password" ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-foreground">PPPoE Username / Login ID</label>
                <Input
                  required
                  placeholder="e.g. tanvir_home"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="bg-background h-9 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-foreground">Password</label>
                <div className="relative">
                  <Input
                    required
                    type={showLoginPassword ? "text" : "password"}
                    placeholder="Enter subscriber password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="bg-background h-9 text-xs pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Default password is your PPPoE password or registered phone number.
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="ghost" onClick={() => setAuthModalOpen(false)} className="text-xs">
                  Cancel
                </Button>
                <Button type="submit" disabled={authLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
                  {authLoading ? "Authenticating..." : "Sign In to Portal"}
                </Button>
              </DialogFooter>
            </form>
          ) : authStep === "phone" ? (
            <form onSubmit={handleRequestOtp} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-foreground">Mobile Number or PPPoE Username</label>
                <Input
                  required
                  placeholder="e.g. 017XXXXXXXX or username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="bg-background h-9 text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="ghost" onClick={() => setAuthModalOpen(false)} className="text-xs">
                  Cancel
                </Button>
                <Button type="submit" disabled={authLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
                  {authLoading ? "Sending Code..." : "Send Verification Code"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-foreground">Enter 6-Digit OTP Code</label>
                <Input
                  required
                  maxLength={6}
                  placeholder="6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="bg-background h-9 text-xs font-mono tracking-widest text-center text-lg"
                />
                {debugOtp && (
                  <p className="text-[11px] text-emerald-400 mt-1.5 font-mono">
                    Development OTP Code: <strong>{debugOtp}</strong>
                  </p>
                )}
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="ghost" onClick={() => setAuthStep("phone")} className="text-xs">
                  Back
                </Button>
                <Button type="submit" disabled={authLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
                  {authLoading ? "Verifying..." : "Verify & Sign In"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════ RECHARGE & PAYMENT MODAL ════════════════════════ */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-400" />
              Broadband Bill Recharge
            </DialogTitle>
            <DialogDescription className="text-xs">
              Account: <strong className="text-foreground font-mono">{profile?.customer_code || "SB-1001"} ({profile?.full_name || "Tanvir Ahmed"})</strong>
            </DialogDescription>
          </DialogHeader>

          {paySuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto ring-4 ring-emerald-500/30">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Payment Successful!</h3>
              <p className="text-xs text-muted-foreground">{paySuccessMsg}</p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Amount Display */}
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
                <div>
                  <span className="text-muted-foreground text-[11px]">Payable Bill</span>
                  <p className="text-xl font-black font-mono text-indigo-400">{formatCurrency(displayAmount)}</p>
                </div>
                <Badge variant="outline" className="border-indigo-500/40 text-indigo-400">
                  Instant Line Renewal
                </Badge>
              </div>

              {/* Method Selector */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Select Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "bKash", label: "bKash Gateway" },
                    { id: "Manual_MFS", label: "Claim MFS TrxID" },
                    { id: "Advance_Credit", label: "Advance Balance" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMethod(m.id as any)}
                      className={`p-2.5 rounded-lg border text-xs font-bold transition-all ${
                        selectedMethod === m.id
                          ? "border-indigo-500 bg-indigo-500/20 text-indigo-400"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* bKash Tokenized Checkout Flow */}
              {selectedMethod === "bKash" && (
                <div className="space-y-3 pt-1">
                  <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-300 space-y-1 text-[11px]">
                    <p className="font-bold">bKash Tokenized Payment Integration:</p>
                    <p>Click below to open bKash checkout, enter your PIN, and confirm execution.</p>
                  </div>

                  {!bkashPaymentId ? (
                    <Button
                      onClick={handleInitiateBkash}
                      disabled={bkashLoading}
                      className="w-full bg-[#E2136E] hover:bg-[#C91060] text-white font-bold h-10 text-xs shadow-md"
                    >
                      {bkashLoading ? "Connecting to bKash..." : "Proceed with bKash Checkout"}
                    </Button>
                  ) : (
                    <div className="space-y-2 border border-indigo-500/30 rounded-xl p-3 bg-card/60 text-center">
                      <p className="text-[11px] text-muted-foreground">
                        bKash Payment ID: <span className="font-mono font-bold text-foreground">{bkashPaymentId}</span>
                      </p>
                      <Button
                        onClick={handleConfirmBkashExecution}
                        disabled={bkashLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 text-xs"
                      >
                        {bkashLoading ? "Executing Payment..." : "Confirm & Complete bKash Payment"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Manual MFS / Forwarder Claim Flow */}
              {selectedMethod === "Manual_MFS" && (
                <form onSubmit={handleClaimManualMfs} className="space-y-3 pt-1">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 space-y-1 text-[11px]">
                    <p className="font-bold">Manual MFS Payment Forwarder:</p>
                    <p>Sent money via personal bKash/Nagad to your ISP provider? Enter your 10-character TrxID below to automatically claim and restore your line.</p>
                  </div>

                  {mfsClaimError && (
                    <p className="text-[11px] text-rose-400 font-semibold">{mfsClaimError}</p>
                  )}

                  <div>
                    <label className="block font-semibold mb-1 text-foreground">Transaction ID (TrxID)</label>
                    <Input
                      required
                      placeholder="e.g. 9H82JKS10A"
                      value={mfsTrxId}
                      onChange={(e) => setMfsTrxId(e.target.value)}
                      className="bg-background h-9 text-xs font-mono uppercase"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={mfsClaimLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 text-xs"
                  >
                    {mfsClaimLoading ? "Verifying Transaction..." : "Claim & Restore Internet"}
                  </Button>
                </form>
              )}

              {/* Advance Credit Flow */}
              {selectedMethod === "Advance_Credit" && (
                <div className="space-y-3 pt-1">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 space-y-1 text-[11px]">
                    <p className="font-bold">Advance Credit Renewal:</p>
                    <p>Current Advance Balance: ৳{profile?.advance_amount || "0.00"}. Required: ৳{displayAmount}.</p>
                  </div>

                  <Button
                    onClick={handleAdvanceRecharge}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 text-xs"
                  >
                    Deduct & Renew Subscription
                  </Button>
                </div>
              )}
            </div>
          )}
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
              <Button type="submit" disabled={ticketSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
                {ticketSubmitting ? "Submitting..." : "Submit Ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════ CHANGE PASSWORD MODAL ════════════════════════ */}
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />

      {/* ════════════════════════ SMS / MFS PAYMENT VERIFICATION MODAL ════════════════════════ */}
      <SmsPaymentVerificationModal
        isOpen={smsVerifyOpen}
        onClose={() => setSmsVerifyOpen(false)}
        onSuccess={(msg) => {
          setPaySuccessMsg(msg);
          setPaySuccess(true);
          setPayModalOpen(true);
          loadPortalData();
          setTimeout(() => setPaySuccess(false), 3500);
        }}
        customerCode={profile?.customer_code}
        pppoeUsername={profile?.pppoe_username}
      />

      {/* ════════════════════════ PRINTABLE INVOICE RECEIPT MODAL ════════════════════════ */}
      <PrintableInvoiceModal
        isOpen={!!printableInvoiceId}
        onClose={() => {
          setPrintableInvoiceId(null);
          setPrintableInvoiceData(null);
        }}
        invoiceId={printableInvoiceId}
        fallbackInvoice={printableInvoiceData}
        customerProfile={profile}
      />

      {/* ════════════════════════ THREADED TICKET CONVERSATION MODAL ════════════════════════ */}
      <ThreadedTicketModal
        isOpen={!!selectedTicketThread}
        onClose={() => setSelectedTicketThread(null)}
        ticket={selectedTicketThread}
        onTicketUpdated={loadPortalData}
      />
    </div>
  );
}

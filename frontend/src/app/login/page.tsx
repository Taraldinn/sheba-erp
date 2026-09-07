"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Radio,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
  Zap,
  Smartphone,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Timer,
  Wrench,
  Briefcase,
  Layers,
  Coins,
  Boxes,
  Activity,
  UserCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";

interface PersonaConfig {
  id: string;
  name: string;
  label: string;
  icon: any;
  defaultUser: string;
  defaultPass: string;
  targetDashboard: string;
  color: string;
  description: string;
}

const PERSONAS: PersonaConfig[] = [
  {
    id: "admin",
    name: "Admin",
    label: "ISP Managing Director & Admin",
    icon: ShieldCheck,
    defaultUser: "admin",
    defaultPass: "admin123",
    targetDashboard: "/",
    color: "from-indigo-600 to-indigo-800",
    description: "Central executive oversight, full core network routing, financial ledger & system policies.",
  },
  {
    id: "billing",
    name: "Billing",
    label: "Billing Operator & Accounts",
    icon: DollarSign,
    defaultUser: "billing_op",
    defaultPass: "billing123",
    targetDashboard: "/dashboards/billing",
    color: "from-emerald-600 to-emerald-800",
    description: "Invoicing, due collection alerts, MFS reconciliation (bKash/Nagad), and cash counter.",
  },
  {
    id: "sales",
    name: "Sales",
    label: "Sales & Client Acquisition",
    icon: TrendingUp,
    defaultUser: "sales_lead",
    defaultPass: "sales123",
    targetDashboard: "/dashboards/sales",
    color: "from-blue-600 to-blue-800",
    description: "New customer leads, monthly signup quotas, package popularity, and survey dispatches.",
  },
  {
    id: "demo",
    name: "Demo Accounts",
    label: "Trial Accounts Manager",
    icon: Timer,
    defaultUser: "demo_mgr",
    defaultPass: "demo123",
    targetDashboard: "/dashboards/demo",
    color: "from-amber-600 to-amber-800",
    description: "Temporary evaluation PPPoE lines, countdown timers, quota enforcement, and trial conversions.",
  },
  {
    id: "technician",
    name: "Technician",
    label: "NOC Engineer & Field Tech",
    icon: Wrench,
    defaultUser: "noc_tech",
    defaultPass: "tech123",
    targetDashboard: "/dashboards/technician",
    color: "from-rose-600 to-rose-800",
    description: "Degraded optical lines (RX power < -24 dBm), core router REST health, ONU reboot, splice tasks.",
  },
  {
    id: "staff",
    name: "Staff",
    label: "General Operations Staff",
    icon: Briefcase,
    defaultUser: "staff_ops",
    defaultPass: "staff123",
    targetDashboard: "/dashboards/staff",
    color: "from-sky-600 to-sky-800",
    description: "Employee attendance clock-in, assigned work orders, maintenance logs, and leave requests.",
  },
  {
    id: "reseller_l1",
    name: "Reseller (L1 POP)",
    label: "Master POP Reseller (Level 1)",
    icon: Layers,
    defaultUser: "reseller_l1",
    defaultPass: "reseller123",
    targetDashboard: "/dashboards/reseller-l1",
    color: "from-purple-600 to-purple-800",
    description: "POP wallet balance, credit ceilings, subordinate dealer management, and aggregate CIR pool.",
  },
  {
    id: "reseller_l2",
    name: "Sub Reseller (L2 POP)",
    label: "Sub Reseller Dealer (Level 2)",
    icon: Coins,
    defaultUser: "reseller_l2",
    defaultPass: "reseller123",
    targetDashboard: "/dashboards/reseller-l2",
    color: "from-violet-600 to-violet-800",
    description: "Retail customer recharges, active PPPoE sessions, instant renewals, and commission ledger.",
  },
  {
    id: "distributor",
    name: "Distributor",
    label: "Hardware & Voucher Distributor",
    icon: Boxes,
    defaultUser: "distributor_main",
    defaultPass: "dist123",
    targetDashboard: "/dashboards/distributor",
    color: "from-teal-600 to-teal-800",
    description: "Central hardware warehouse, routers, ONUs/ONTs, fiber drums, and scratch voucher cards.",
  },
  {
    id: "bandwidth_reseller",
    name: "Bandwidth Reseller",
    label: "Carrier Wholesale Bandwidth",
    icon: Activity,
    defaultUser: "bandwidth_carrier",
    defaultPass: "bw123",
    targetDashboard: "/dashboards/bandwidth-reseller",
    color: "from-cyan-600 to-cyan-800",
    description: "Committed CIR aggregate graphs, 95th percentile billing, corporate VLANs, and BGP status.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedPersona, setSelectedPersona] = useState<PersonaConfig>(PERSONAS[0]);
  const [isCustomerMode, setIsCustomerMode] = useState(false);
  const [username, setUsername] = useState(PERSONAS[0].defaultUser);
  const [password, setPassword] = useState(PERSONAS[0].defaultPass);
  const [customerPhone, setCustomerPhone] = useState("01712345678");
  const [customerOtp, setCustomerOtp] = useState("1234");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSelectPersona = (p: PersonaConfig) => {
    setSelectedPersona(p);
    setIsCustomerMode(false);
    setUsername(p.defaultUser);
    setPassword(p.defaultPass);
    setErrorMsg("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (isCustomerMode) {
      // Customer self-care simulation
      setTimeout(() => {
        localStorage.setItem("sheba_user_role", "customer");
        localStorage.setItem("sheba_user_name", "Subscriber Client");
        router.push("/portal");
      }, 500);
      return;
    }

    try {
      const res = await ApiClient.login(username, password);
      if (res && res.token) {
        localStorage.setItem("sheba_auth_token", res.token);
        localStorage.setItem("sheba_user_role", (res.role || selectedPersona.id).toLowerCase());
        localStorage.setItem("sheba_user_name", res.user?.first_name ? `${res.user.first_name} ${res.user.last_name || ""}`.trim() : username);
        if (res.tenant) {
          localStorage.setItem("sheba_tenant", JSON.stringify(res.tenant));
        }

        const targetUrl = res.dashboard_url || selectedPersona.targetDashboard;
        router.push(targetUrl);
      } else {
        setErrorMsg("Authentication failed. Please check credentials.");
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      // Fallback in case of network issue
      localStorage.setItem("sheba_user_role", selectedPersona.id.toLowerCase());
      localStorage.setItem("sheba_user_name", selectedPersona.name);
      router.push(selectedPersona.targetDashboard);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-4xl space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 items-center justify-center shadow-xl shadow-indigo-500/25 ring-1 ring-white/20">
            <Radio className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">SHEBA ISP PLATFORM</h1>
          <p className="text-xs text-muted-foreground">Department-Specific Login & Role-Isolated Operation Portals</p>
        </div>

        {/* Persona Portal Switcher Grid */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-center uppercase tracking-wider text-muted-foreground">
            Select Operational Portal / Role To Authenticate:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {PERSONAS.map((p) => {
              const isSelected = !isCustomerMode && selectedPersona.id === p.id;
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPersona(p)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-500/15 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30"
                      : "border-border bg-card/60 hover:bg-card hover:border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div className={`h-6 w-6 rounded-lg flex items-center justify-center ${isSelected ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    {isSelected && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
                  </div>
                  <div>
                    <p className={`text-xs font-bold leading-tight ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                      {p.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.defaultUser}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Subscriber Portal Button */}
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setIsCustomerMode(true)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                isCustomerMode
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Subscriber Self-Care Portal (Client Login)</span>
            </button>
          </div>
        </div>

        {/* Login Card */}
        <div className="max-w-md mx-auto w-full">
          <Card className="border-border bg-card/70 backdrop-blur-xl shadow-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-tr ${isCustomerMode ? "from-emerald-600 to-teal-600" : selectedPersona.color} text-white flex items-center justify-center shadow-md`}>
                  {isCustomerMode ? <Smartphone className="h-5 w-5" /> : <selectedPersona.icon className="h-5 w-5" />}
                </div>
                <div>
                  <CardTitle className="text-base text-foreground">
                    {isCustomerMode ? "Subscriber Portal Sign In" : `${selectedPersona.name} Portal`}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    {isCustomerMode ? "Enter registered mobile number or PPPoE username." : selectedPersona.label}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {errorMsg && (
                <div className="mb-4 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                {!isCustomerMode ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Username / Staff ID</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="pl-9 text-xs"
                          placeholder="Username"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-9 text-xs"
                          placeholder="Password"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Mobile Number or Subscriber ID</label>
                      <div className="relative">
                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="pl-9 text-xs"
                          placeholder="017XXXXXXXX or SB-1001"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Portal Password / OTP</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="password"
                          required
                          value={customerOtp}
                          onChange={(e) => setCustomerOtp(e.target.value)}
                          className="pl-9 text-xs"
                          placeholder="••••"
                        />
                      </div>
                    </div>
                  </>
                )}

                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-10 gap-2 shadow-lg shadow-indigo-600/25 cursor-pointer"
                  disabled={loading}
                >
                  {loading ? "Authenticating..." : isCustomerMode ? "Open Client Portal" : `Enter ${selectedPersona.name} Workspace`}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              {/* Persona Description */}
              {!isCustomerMode && (
                <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border text-[11px] text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" />
                    Role Boundary Isolation:
                  </p>
                  <p>{selectedPersona.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

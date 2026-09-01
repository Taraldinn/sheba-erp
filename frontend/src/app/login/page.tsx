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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.push("/");
    }, 600);
  };

  const handleRoleQuickFill = (role: string) => {
    if (role === "admin") {
      setUsername("admin");
      setPassword("admin123");
    } else if (role === "reseller") {
      setUsername("reseller_uttara");
      setPassword("reseller123");
    } else if (role === "customer") {
      router.push("/portal");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Glow effects */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 items-center justify-center shadow-xl shadow-indigo-500/25 ring-1 ring-white/20">
            <Radio className="h-6 w-6 text-foreground" />
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">SHEBA ISP ERP</h1>
          <p className="text-xs text-muted-foreground">Enterprise Subscriber Billing & Optical Network Operations</p>
        </div>

        {/* Login Card */}
        <Card className="border-border bg-card/60 backdrop-blur-xl shadow-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-foreground">Sign In to Dashboard</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Enter your staff or administrative credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
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

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-10 gap-2 shadow-lg shadow-indigo-600/25"
                disabled={loading}
              >
                {loading ? "Authenticating..." : "Access Control Panel"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            {/* Quick-fill Roles Demo */}
            <div className="mt-6 pt-4 border-t border-border space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground text-center">Quick Demo Access:</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px] border-border bg-background text-muted-foreground hover:text-foreground"
                  onClick={() => handleRoleQuickFill("admin")}
                >
                  Super Admin
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px] border-border bg-background text-muted-foreground hover:text-foreground"
                  onClick={() => handleRoleQuickFill("reseller")}
                >
                  Reseller / Sub-ISP
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px] border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:text-foreground"
                  onClick={() => handleRoleQuickFill("customer")}
                >
                  Customer Portal
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

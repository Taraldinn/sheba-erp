"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Timer,
  Clock,
  Sparkles,
  UserCheck,
  RefreshCw,
  Plus,
  ArrowRight,
  HardDrive,
  BadgeAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function DemoAccountsDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await ApiClient.getDashboardAnalytics("demo");
      setData(res);
    } catch (err) {
      console.error("Failed to load demo accounts dashboard:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const demoData = data?.demo_data || {
    active_trials: 6,
    expired_trials: 3,
    converted_to_paid_pct: 64.0,
    average_trial_days: 3,
    trial_accounts: [
      { id: "1", name: "Rashedul Islam", username: "demo_rashed", package: "Trial 20M Fast", expires_in_hours: 14, bandwidth_used_gb: 18.5, status: "Active" },
      { id: "2", name: "Nazmul Hassan", username: "demo_nazmul", package: "Trial 20M Fast", expires_in_hours: 6, bandwidth_used_gb: 24.2, status: "Expiring Soon" },
      { id: "3", name: "Mohammad Arif", username: "trial_arif", package: "Trial 15M Standard", expires_in_hours: 28, bandwidth_used_gb: 9.1, status: "Active" },
      { id: "4", name: "Fairuz Chowdhury", username: "demo_fairuz", package: "Trial 30M Ultra", expires_in_hours: 3, bandwidth_used_gb: 35.8, status: "Expiring Soon" },
    ],
  };

  return (
    <RoleGuard allowedRoles={["demo", "admin", "super_admin"]} roleTitle="Demo Accounts & Trials">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-amber-950/20 p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                TRIAL OPERATIONS WORKSPACE
              </span>
              <span className="text-xs text-muted-foreground">• Temporary PPPoE & Evaluation Lines</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Demo Accounts Command Center
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live tracking of subscriber trial lines, expiry countdown timers, bandwidth quotas, and conversion to paid lines.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="text-xs gap-1.5 h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-amber-400" : ""}`} />
              Refresh
            </Button>
            <Link href="/customers/new">
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5 h-9 shadow-md shadow-amber-600/20">
                <Plus className="h-3.5 w-3.5" />
                Issue New Trial Account
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary Trial Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">ACTIVE DEMO ACCOUNTS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-400">{demoData.active_trials}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently browsing trial users</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">EXPIRED / CUTOFF</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <Clock className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-rose-400">{demoData.expired_trials}</div>
              <p className="text-xs text-muted-foreground mt-1">Automatic NAS queue throttled</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">TRIAL CONVERSION RATE</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <UserCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-400">{demoData.converted_to_paid_pct}%</div>
              <p className="text-xs text-muted-foreground mt-1">Converted to full paid packages</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">AVERAGE TRIAL DURATION</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Timer className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-sky-400">{demoData.average_trial_days} Days</div>
              <p className="text-xs text-muted-foreground mt-1">Standard evaluation window</p>
            </CardContent>
          </Card>
        </div>

        {/* Active Trial Accounts Table */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Active Trial Line Monitoring</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Real-time countdown and bandwidth consumption on active demo PPPoE secrets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {demoData.trial_accounts?.map((trial: any, idx: number) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-border bg-muted/20 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs">
                      <Timer className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-foreground">{trial.name}</p>
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                          {trial.username}
                        </code>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {trial.package} • Consumed: <span className="font-semibold text-foreground">{trial.bandwidth_used_gb} GB</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-right">
                      <p className="text-xs font-bold text-amber-400">{trial.expires_in_hours} hrs left</p>
                      <Badge variant={trial.status === "Active" ? "secondary" : "destructive"} className="text-[10px]">
                        {trial.status}
                      </Badge>
                    </div>
                    <Link href={`/customers/new?convert_trial=${trial.username}`}>
                      <Button size="sm" variant="outline" className="text-xs gap-1 h-8">
                        <span>Convert</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}

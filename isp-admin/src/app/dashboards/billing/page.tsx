"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  DollarSign,
  AlertCircle,
  Clock,
  RefreshCw,
  Plus,
  Send,
  FileCheck,
  Receipt,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function BillingDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await ApiClient.getDashboardAnalytics("billing");
      setData(res);
    } catch (err) {
      console.error("Failed to load billing dashboard:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const billingData = data?.billing_data || {
    paid_invoices: 480,
    unpaid_invoices: 85,
    overdue_invoices: 18,
    expiring_in_3_days: 34,
    payment_methods: [
      { method: "bKash Gateway", count: 342, amount: 185000 },
      { method: "Nagad Gateway", count: 210, amount: 114000 },
      { method: "Bank Transfer / POS", count: 45, amount: 68000 },
      { method: "Cash Desk", count: 82, amount: 45000 },
    ],
    recent_invoices: [
      { id: "INV-2026-0001", customer: "Rahim Chowdhury", amount: 1200, status: "Paid" },
      { id: "INV-2026-0002", customer: "Karim Uddin", amount: 850, status: "Pending" },
      { id: "INV-2026-0003", customer: "Sadia Sultana", amount: 1500, status: "Paid" },
      { id: "INV-2026-0004", customer: "Tanvir Ahmed", amount: 650, status: "Pending" },
      { id: "INV-2026-0005", customer: "Nusrat Jahan", amount: 2000, status: "Paid" },
    ],
  };

  return (
    <RoleGuard allowedRoles={["billing", "billing_operator", "admin", "super_admin"]} roleTitle="Billing Department">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-emerald-950/20 p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                FINANCE & BILLING WORKSPACE
              </span>
              <span className="text-xs text-muted-foreground">• Invoicing, Dues & Gateway Reconciliation</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Billing Operations Command Center
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live tracking of subscriber dues, invoice clearing, MFS transaction settlements, and cash collections.
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
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
              Refresh
            </Button>
            <Link href="/billing">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 h-9 shadow-md shadow-emerald-600/20">
                <Receipt className="h-3.5 w-3.5" />
                Generate Batch Invoices
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary Billing Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">PAID INVOICES (THIS MONTH)</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <FileCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-400">{billingData.paid_invoices}</div>
              <p className="text-xs text-muted-foreground mt-1">Successfully cleared subscriber bills</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">UNPAID INVOICES</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Clock className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-400">{billingData.unpaid_invoices}</div>
              <p className="text-xs text-muted-foreground mt-1">Pending payment collection</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">OVERDUE ACCOUNTS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <AlertCircle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-rose-400">{billingData.overdue_invoices}</div>
              <p className="text-xs text-muted-foreground mt-1">Candidates for automatic suspension</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">EXPIRING IN 3 DAYS</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Clock className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-sky-400">{billingData.expiring_in_3_days}</div>
              <p className="text-xs text-muted-foreground mt-1">Automated SMS reminders queued</p>
            </CardContent>
          </Card>
        </div>

        {/* Payment Channels & Recent Invoices */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Payment Gateways Breakdown</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Revenue collection distribution across MFS channels and POS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {billingData.payment_methods?.map((pm: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{pm.method}</p>
                      <p className="text-[11px] text-muted-foreground">{pm.count} transactions</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-foreground">৳{(Number(pm?.amount) || 0).toLocaleString()}</p>
                    <span className="text-[10px] text-emerald-400 font-semibold">Settled</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Recent Invoices</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Latest billing records generated across subscriber lines.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {billingData.recent_invoices?.map((inv: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/10 text-xs">
                    <div>
                      <span className="font-mono font-semibold text-foreground">{inv.id}</span>
                      <p className="text-muted-foreground text-[11px]">{inv.customer}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-foreground">৳{inv.amount}</span>
                      <Badge variant={inv.status === "Paid" ? "secondary" : "outline"} className={inv.status === "Paid" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}>
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Billing Action Tray */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Billing Actions</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Quick execution of daily finance operations.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link href="/billing">
                <Button variant="outline" className="w-full h-14 flex flex-col items-center justify-center gap-1 text-xs border-border bg-card hover:bg-muted/50">
                  <FileText className="h-4 w-4 text-emerald-400" />
                  <span>Generate Invoices</span>
                </Button>
              </Link>
              <Link href="/payments/verification">
                <Button variant="outline" className="w-full h-14 flex flex-col items-center justify-center gap-1 text-xs border-border bg-card hover:bg-muted/50">
                  <CreditCard className="h-4 w-4 text-indigo-400" />
                  <span>Reconcile MFS</span>
                </Button>
              </Link>
              <Link href="/payments">
                <Button variant="outline" className="w-full h-14 flex flex-col items-center justify-center gap-1 text-xs border-border bg-card hover:bg-muted/50">
                  <Plus className="h-4 w-4 text-sky-400" />
                  <span>Add Payment</span>
                </Button>
              </Link>
              <Link href="/settings?tab=sms">
                <Button variant="outline" className="w-full h-14 flex flex-col items-center justify-center gap-1 text-xs border-border bg-card hover:bg-muted/50">
                  <Send className="h-4 w-4 text-amber-400" />
                  <span>Send Due SMS</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  Receipt,
  Plus,
  Package as PackageIcon,
  CheckCircle,
  FileText,
  DollarSign,
  Layers,
  ArrowUpRight,
  Printer,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiClient } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Package } from "@/types";

export default function BillingPage() {
  const [packages, setPackages] = useState<Package[]>([]);

  useEffect(() => {
    async function load() {
      const p = await ApiClient.getPackages();
      setPackages(p);
    }
    load();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Billing & Package Catalog</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage internet bandwidth packages, reseller price matrices, invoices, and payment ledger.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
            <Plus className="h-4 w-4" />
            Create Package
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="packages" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="packages">Packages / Profiles</TabsTrigger>
          <TabsTrigger value="invoices">Generated Invoices</TabsTrigger>
          <TabsTrigger value="reseller">Reseller Rates</TabsTrigger>
        </TabsList>

        {/* Packages Tab */}
        <TabsContent value="packages" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map((pkg) => (
              <Card key={pkg.id} className="border-border bg-card/60 relative overflow-hidden flex flex-col justify-between">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <Badge variant="default" className="text-[10px]">
                      {pkg.speed_mbps} Mbps Bandwidth
                    </Badge>
                    <span className="text-[11px] text-emerald-400 font-medium">Active</span>
                  </div>

                  <h3 className="text-base font-bold text-foreground mt-3">{pkg.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pkg.description}</p>

                  <div className="mt-4 pt-4 border-t border-border/80">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-foreground">{formatCurrency(pkg.regular_price)}</span>
                      <span className="text-xs text-muted-foreground">/ 30 days</span>
                    </div>
                    <p className="text-[11px] text-indigo-400 mt-1 font-medium">
                      Reseller Base: {formatCurrency(pkg.min_reseller_price)}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-background/60 border-t border-border/80 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Subscribers: <strong className="text-foreground">{pkg.subscribers_count || 0}</strong></span>
                  <span className="font-mono text-[10px] text-muted-foreground">{pkg.mikrotik_profile}</span>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-4">
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Monthly Invoices (September 2026)</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Automated monthly recurring invoices generated on the 1st of the month.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" className="border-border bg-card text-xs gap-1.5">
                <Printer className="h-3.5 w-3.5" />
                Bulk Statement Print
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr>
                      <th className="pb-2 font-medium">Invoice #</th>
                      <th className="pb-2 font-medium">Subscriber</th>
                      <th className="pb-2 font-medium">Package</th>
                      <th className="pb-2 font-medium">Monthly Charge</th>
                      <th className="pb-2 font-medium">Total Payable</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {[
                      { no: "INV-20260901-01", cust: "Tanvir Ahmed (tanvir_home)", pkg: "Turbo Stream - 30 Mbps", bill: 800, total: 800, status: "Paid" },
                      { no: "INV-20260901-02", cust: "Rafiqul Islam (rafiq_banani)", pkg: "Starter Fiber - 15 Mbps", bill: 500, total: 500, status: "Due" },
                      { no: "INV-20260901-03", cust: "Smart Tech Solution Ltd.", pkg: "Giga Prime - 60 Mbps", bill: 1200, total: 1100, status: "Paid" },
                      { no: "INV-20260901-04", cust: "Kazi Mahbub Alam (kazi_mahbub)", pkg: "Turbo Stream - 30 Mbps", bill: 800, total: 800, status: "Paid" },
                    ].map((inv) => (
                      <tr key={inv.no} className="hover:bg-muted/50">
                        <td className="py-3 font-mono font-medium text-indigo-400">{inv.no}</td>
                        <td className="py-3 font-medium text-foreground">{inv.cust}</td>
                        <td className="py-3 text-muted-foreground">{inv.pkg}</td>
                        <td className="py-3 text-muted-foreground">{formatCurrency(inv.bill)}</td>
                        <td className="py-3 font-bold text-foreground">{formatCurrency(inv.total)}</td>
                        <td className="py-3">
                          <Badge variant={inv.status === "Paid" ? "success" : "warning"}>
                            {inv.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground">
                            <Download className="h-3.5 w-3.5 mr-1" />
                            PDF
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reseller Pricing Matrix */}
        <TabsContent value="reseller" className="mt-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">Sub-ISP & Reseller Rate Overrides</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Custom pricing rules negotiated per reseller account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr>
                      <th className="pb-2 font-medium">Reseller Account</th>
                      <th className="pb-2 font-medium">Package</th>
                      <th className="pb-2 font-medium">Retail Price</th>
                      <th className="pb-2 font-medium">Custom Wholesale Rate</th>
                      <th className="pb-2 font-medium">Margin / Line</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {[
                      { res: "Uttara Sub-ISP (reseller_uttara)", pkg: "Starter Fiber - 15 Mbps", retail: 500, custom: 320, margin: 180 },
                      { res: "Uttara Sub-ISP (reseller_uttara)", pkg: "Turbo Stream - 30 Mbps", retail: 800, custom: 520, margin: 280 },
                      { res: "Banani Local Agent (agent_banani)", pkg: "Giga Prime - 60 Mbps", retail: 1200, custom: 800, margin: 400 },
                    ].map((r, idx) => (
                      <tr key={idx} className="hover:bg-muted/50">
                        <td className="py-3 font-semibold text-foreground">{r.res}</td>
                        <td className="py-3 text-muted-foreground">{r.pkg}</td>
                        <td className="py-3 text-muted-foreground">{formatCurrency(r.retail)}</td>
                        <td className="py-3 font-bold text-indigo-400">{formatCurrency(r.custom)}</td>
                        <td className="py-3 font-bold text-emerald-400">+{formatCurrency(r.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

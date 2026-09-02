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
import { mockPackages } from "@/lib/mock-data";

export default function BillingPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [p, inv] = await Promise.all([
          ApiClient.getPackages(),
          ApiClient.getInvoices(),
        ]);
        setPackages(p);
        setInvoices(inv);
      } catch {
        setPackages(mockPackages);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-indigo-500" />
            Billing & Package Catalog
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage internet bandwidth packages, reseller price matrices, invoices, and payment ledger.
          </p>
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
              <Card key={pkg.id} className="border-border bg-card relative overflow-hidden flex flex-col justify-between shadow-sm">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <Badge variant="default" className="text-[10px]">
                      {pkg.speed_mbps} Mbps Bandwidth
                    </Badge>
                    <span className="text-[11px] text-emerald-400 font-medium">Active</span>
                  </div>

                  <h3 className="text-base font-bold text-foreground mt-3">{pkg.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pkg.description}</p>

                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-foreground">{formatCurrency(pkg.regular_price)}</span>
                      <span className="text-xs text-muted-foreground">/ {pkg.validity_days || 30} days</span>
                    </div>
                    <p className="text-[11px] text-indigo-400 mt-1 font-medium">
                      Reseller Base: {formatCurrency(pkg.min_reseller_price || 0)}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-muted/30 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>Subscribers: <strong className="text-foreground">{pkg.subscribers_count || 0}</strong></span>
                  <span className="font-mono text-[10px] text-muted-foreground">{pkg.mikrotik_profile}</span>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Monthly Invoices Ledger</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Automated recurring invoices generated for active subscribers.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" className="border-border text-xs gap-1.5 font-semibold">
                <Printer className="h-3.5 w-3.5" />
                Bulk Statement Print
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Invoice #</th>
                      <th className="p-3">Subscriber</th>
                      <th className="p-3">Monthly Charge</th>
                      <th className="p-3">Total Payable</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.map((inv) => (
                      <tr key={inv.id || inv.invoice_number} className="hover:bg-muted/30">
                        <td className="p-3 font-mono font-bold text-indigo-400">{inv.invoice_number || `INV-${inv.id?.slice(0, 8)}`}</td>
                        <td className="p-3 font-medium text-foreground">{inv.customer_name || inv.customer}</td>
                        <td className="p-3 text-muted-foreground">{formatCurrency(inv.amount || inv.total_amount || 0)}</td>
                        <td className="p-3 font-bold text-foreground">{formatCurrency(inv.amount || inv.total_amount || 0)}</td>
                        <td className="p-3">
                          <Badge variant={inv.status === "Paid" ? "default" : "outline"} className="text-[10px]">
                            {inv.status || "Unpaid"}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-400 hover:text-indigo-300">
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
          <Card className="border-border bg-card">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold text-foreground">Reseller & Corporate Wholesale Rates</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Minimum billing threshold per subscriber profile for sub-providers and corporate bulk clients.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border text-[10px] uppercase">
                  <tr>
                    <th className="p-3">Profile / Plan</th>
                    <th className="p-3">Download / Upload</th>
                    <th className="p-3">Retail Price</th>
                    <th className="p-3">Reseller Base Cost</th>
                    <th className="p-3">Min Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {packages.map((pkg) => {
                    const margin = (pkg.regular_price || 0) - (pkg.min_reseller_price || 0);
                    return (
                      <tr key={pkg.id} className="hover:bg-muted/30">
                        <td className="p-3 font-semibold text-foreground">{pkg.name}</td>
                        <td className="p-3 font-mono text-muted-foreground">{pkg.speed_mbps}M / {pkg.upload_speed_mbps || pkg.speed_mbps}M</td>
                        <td className="p-3 font-semibold">{formatCurrency(pkg.regular_price)}</td>
                        <td className="p-3 font-semibold text-indigo-400">{formatCurrency(pkg.min_reseller_price || 0)}</td>
                        <td className="p-3 font-bold text-emerald-400">+{formatCurrency(margin)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

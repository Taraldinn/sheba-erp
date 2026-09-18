"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Network,
  Activity,
  TrendingUp,
  Layers,
  Server,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Radio,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";
import { CorporateCustomer, CorporateConnection, CorporateBillingPeriod } from "@/types";

export default function CorporateOverviewPage() {
  const [customers, setCustomers] = useState<CorporateCustomer[]>([]);
  const [connections, setConnections] = useState<CorporateConnection[]>([]);
  const [periods, setPeriods] = useState<CorporateBillingPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [custs, conns, pers] = await Promise.all([
        ApiClient.getCorporateCustomers().catch(() => []),
        ApiClient.getCorporateConnections().catch(() => []),
        ApiClient.getCorporateBillingPeriods().catch(() => []),
      ]);
      setCustomers(custs);
      setConnections(conns);
      setPeriods(pers);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalCIR = customers.reduce((sum, c) => sum + (c.committed_bandwidth_mbps || 0), 0);
  const activeCircuits = connections.filter((c) => c.status === "ACTIVE").length;
  const invoicedRevenue = periods
    .filter((p) => p.status === "INVOICED")
    .reduce((sum, p) => sum + parseFloat(p.total_payable || "0"), 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-1 uppercase tracking-wider">
            <Building2 className="w-4 h-4" />
            Enterprise Infrastructure
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Corporate / Enterprise ISP Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Dedicated leased lines, 95th-percentile burst billing, carrier VLANs, and aggregated telemetry.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/corporate/customers">
            <Button size="sm" className="gap-2 bg-primary text-primary-foreground">
              <Plus className="w-4 h-4" /> Add Corporate Client
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm hover:border-primary/50 transition-colors">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Corporate Accounts</p>
              <h3 className="text-2xl font-bold mt-1">{customers.length}</h3>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <span className="text-emerald-500 font-medium">{customers.filter((c) => c.status === "ACTIVE").length} Active</span> profiles
              </p>
            </div>
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <Building2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:border-primary/50 transition-colors">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Circuits / Links</p>
              <h3 className="text-2xl font-bold mt-1">{activeCircuits}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Total links: <span className="font-semibold">{connections.length}</span>
              </p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
              <Network className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:border-primary/50 transition-colors">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Committed CIR Capacity</p>
              <h3 className="text-2xl font-bold mt-1">
                {totalCIR >= 1000 ? `${(totalCIR / 1000).toFixed(2)} Gbps` : `${totalCIR} Mbps`}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-emerald-500" /> Carrier Trunk Bandwidth
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-500">
              <Activity className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:border-primary/50 transition-colors">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoiced P95 Revenue</p>
              <h3 className="text-2xl font-bold mt-1">৳{invoicedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</h3>
              <p className="text-xs text-muted-foreground mt-1">Single-Ledger Synchronized</p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
              <TrendingUp className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link href="/corporate/customers" className="group">
          <Card className="h-full border hover:border-primary/60 hover:shadow-md transition-all cursor-pointer">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <Building2 className="w-5 h-5 text-primary" />
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <CardTitle className="text-base mt-2">Corporate Clients</CardTitle>
              <CardDescription className="text-xs">Profiles, SLAs, contracts & CIR commitments</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/corporate/connections" className="group">
          <Card className="h-full border hover:border-primary/60 hover:shadow-md transition-all cursor-pointer">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <Network className="w-5 h-5 text-blue-500" />
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
              </div>
              <CardTitle className="text-base mt-2">Circuits & Leased Lines</CardTitle>
              <CardDescription className="text-xs">Metro ethernet, fiber trunks, and interface mapping</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/corporate/telemetry" className="group">
          <Card className="h-full border hover:border-primary/60 hover:shadow-md transition-all cursor-pointer">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <Activity className="w-5 h-5 text-purple-500" />
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-500 transition-colors" />
              </div>
              <CardTitle className="text-base mt-2">MRTG & Bandwidth</CardTitle>
              <CardDescription className="text-xs">5-min high-resolution traffic telemetry & 95th line</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/corporate/billing" className="group">
          <Card className="h-full border hover:border-primary/60 hover:shadow-md transition-all cursor-pointer">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
              </div>
              <CardTitle className="text-base mt-2">P95 Burst Invoicing</CardTitle>
              <CardDescription className="text-xs">Quality gate evaluation, burst billing & financial audit</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* Main Grid: Active Circuits & Corporate Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Circuits */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Dedicated Circuits</CardTitle>
                <CardDescription className="text-xs">Active enterprise carrier links</CardDescription>
              </div>
              <Link href="/corporate/connections">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  View All <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {connections.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No enterprise circuits provisioned yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {connections.slice(0, 5).map((conn) => (
                  <div key={conn.id} className="p-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{conn.circuit_id}</span>
                        <Badge variant={conn.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {conn.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{conn.name} • {conn.service_location}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Router: <span className="font-medium text-foreground">{conn.router_name || "N/A"}</span> ({conn.interface_name || "unassigned"})
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-primary">{conn.committed_bandwidth_mbps} Mbps CIR</div>
                      <div className="text-xs text-muted-foreground">Cap: {conn.burst_bandwidth_cap_mbps} Mbps</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Corporate Clients List */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Enterprise Profiles</CardTitle>
                <CardDescription className="text-xs">Contracted corporate subscribers</CardDescription>
              </div>
              <Link href="/corporate/customers">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  View All <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {customers.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No corporate profiles created yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {customers.slice(0, 5).map((cust) => (
                  <div key={cust.id} className="p-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{cust.company_name}</span>
                        <Badge variant={cust.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {cust.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Contact: {cust.contact_person} ({cust.billing_contact_phone})
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Base Fee: ৳{parseFloat(cust.base_monthly_fee).toLocaleString()} • Burst: ৳{cust.burst_rate_per_mbps}/Mbps
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {cust.committed_bandwidth_mbps} Mbps
                      </div>
                      <div className="text-xs text-muted-foreground">{cust.active_circuits_count || 0} link(s)</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

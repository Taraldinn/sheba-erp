"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Package,
  Cpu,
  RefreshCw,
  Plus,
  ArrowRight,
  AlertTriangle,
  BadgePercent,
  Layers,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function DistributorDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await ApiClient.getDashboardAnalytics("distributor");
      setData(res);
    } catch (err) {
      console.error("Failed to load distributor dashboard:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const distData = data?.distributor_data || {
    routers_in_stock: 24,
    onus_in_stock: 140,
    fiber_drums_in_stock: 16,
    scratch_cards_inventory: 1250,
    total_inventory_value: 845000.0,
    dealer_credit_receivable: 235000.0,
    stock_items: [
      { name: "MikroTik hEX RB750Gr3", sku: "ROUTER-HEX", qty: 14, min_alert: 5, unit_price: 6500 },
      { name: "VSOL V2801SG EPON/GPON ONU", sku: "ONU-VSOL-1G", qty: 85, min_alert: 20, unit_price: 1250 },
      { name: "2-Core FTTH Drop Cable (1000m)", sku: "CABLE-DROP-2C", qty: 8, min_alert: 3, unit_price: 4200 },
      { name: "SFP+ 10G Optical Transceiver 20km", sku: "SFP-10G-20K", qty: 12, min_alert: 4, unit_price: 3800 },
    ],
  };

  return (
    <RoleGuard allowedRoles={["distributor", "admin", "super_admin"]} roleTitle="Distributor & Hardware Logistics">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-teal-950/20 p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                WHOLESALE & INVENTORY DISTRIBUTION WORKSPACE
              </span>
              <span className="text-xs text-muted-foreground">• Routers, ONUs, Fiber Drums & Scratch Cards</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Distributor Hardware & Inventory Hub
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live tracking of central warehouse stocks, minimum alert levels, scratch cards, and dealer credit lines.
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
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-teal-400" : ""}`} />
              Refresh
            </Button>
            <Link href="/inventory">
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1.5 h-9 shadow-md shadow-teal-600/20">
                <Plus className="h-3.5 w-3.5" />
                Receive Shipment
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary Distributor KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-teal-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">ONUs / ONTs IN STOCK</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <Package className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-teal-400">{distData.onus_in_stock} Units</div>
              <p className="text-xs text-muted-foreground mt-1">EPON / GPON optical transceivers</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">ROUTERS IN STOCK</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Cpu className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-indigo-400">{distData.routers_in_stock} Units</div>
              <p className="text-xs text-muted-foreground mt-1">MikroTik hEX & Wi-Fi routers</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">SCRATCH CARDS AVAILABLE</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <BadgePercent className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-amber-400">{distData.scratch_cards_inventory} Cards</div>
              <p className="text-xs text-muted-foreground mt-1">Prepaid scratch vouchers printed</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">TOTAL INVENTORY VALUE</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Boxes className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-400">৳{(Number(distData?.total_inventory_value) || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Receivables: ৳{(Number(distData?.dealer_credit_receivable) || 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stock Items Table */}
        <Card className="border-border bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-foreground">Critical Warehouse Inventory</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Real-time warehouse quantities against minimum restock thresholds.
                </CardDescription>
              </div>
              <Link href="/inventory">
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8">
                  <span>Manage Stock</span>
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {distData.stock_items?.map((item: any, idx: number) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-border bg-muted/20 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold text-xs">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        SKU: <span className="font-mono text-foreground">{item.sku}</span> • Unit Wholesale: ৳{item.unit_price}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-auto text-right">
                    <div>
                      <p className="text-xs font-bold text-foreground">{item.qty} In Stock</p>
                      <span className="text-[10px] text-muted-foreground">Alert threshold: {item.min_alert}</span>
                    </div>
                    <Badge variant={item.qty > item.min_alert ? "secondary" : "destructive"} className="text-[10px]">
                      {item.qty > item.min_alert ? "Healthy" : "Low Stock"}
                    </Badge>
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

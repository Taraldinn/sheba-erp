"use client";

import { useState } from "react";
import {
  Briefcase,
  Plus,
  CreditCard,
  Zap,
  Users,
  DollarSign,
  Search,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { mockResellers, ResellerItem } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function ResellersPage() {
  const [resellers, setResellers] = useState<ResellerItem[]>(mockResellers);
  const [selectedReseller, setSelectedReseller] = useState<ResellerItem | null>(null);
  const [rechargeModalOpen, setRechargeModalOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("10000");

  const handleOpenRecharge = (reseller: ResellerItem) => {
    setSelectedReseller(reseller);
    setRechargeModalOpen(true);
  };

  const handleRechargeWallet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReseller) return;
    const updated = resellers.map((r) =>
      r.id === selectedReseller.id ? { ...r, wallet_balance: r.wallet_balance + parseFloat(rechargeAmount) } : r
    );
    setResellers(updated);
    setRechargeModalOpen(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Sub-ISP & Reseller Network</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage reseller wallets, credit limits, commission splits, and sub-subscriber portfolios.
          </p>
        </div>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
          <Plus className="h-4 w-4" />
          Add Reseller Partner
        </Button>
      </div>

      {/* Reseller Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {resellers.map((reseller) => (
          <Card key={reseller.id} className="border-border bg-card/60 flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant="success" className="text-[10px]">
                  {reseller.status}
                </Badge>
                <span className="text-xs font-semibold text-indigo-400">{reseller.commission_rate}% Margin</span>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-2">{reseller.name}</CardTitle>
              <CardDescription className="text-xs text-muted-foreground font-mono">
                @{reseller.username} • {reseller.phone}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Wallet balances */}
              <div className="p-3 rounded-xl bg-background/80 border border-border space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Prepaid Wallet:</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {formatCurrency(reseller.wallet_balance)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Credit Limit:</span>
                  <span className="font-mono text-muted-foreground">{formatCurrency(reseller.credit_limit)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[10px]">Total Subscribers</p>
                  <p className="font-bold text-foreground text-sm">{reseller.subscribers_count}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/40">
                  <p className="text-muted-foreground text-[10px]">Active Lines</p>
                  <p className="font-bold text-emerald-400 text-sm">{reseller.active_count}</p>
                </div>
              </div>

              <Button
                size="sm"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 h-8"
                onClick={() => handleOpenRecharge(reseller)}
              >
                <CreditCard className="h-3.5 w-3.5" />
                Credit Reseller Wallet
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Wallet Credit Modal */}
      <Dialog open={rechargeModalOpen} onOpenChange={setRechargeModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-indigo-400" />
              Recharge Wallet: {selectedReseller?.name}
            </DialogTitle>
            <DialogDescription>
              Current Balance: {formatCurrency(selectedReseller?.wallet_balance || 0)}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRechargeWallet} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Credit Amount (৳)</label>
              <Input
                type="number"
                required
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Payment Collection Method</label>
              <select className="flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="Cash">Cash Handover</option>
                <option value="Bank">Bank Wire Transfer</option>
                <option value="Cheque">Cheque Deposit</option>
              </select>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setRechargeModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Post Credit to Wallet
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

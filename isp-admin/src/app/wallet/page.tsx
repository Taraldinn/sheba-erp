"use client";

import { useState } from "react";
import { Wallet, Plus, ArrowUpRight, ArrowDownLeft, ShieldCheck, CreditCard, History, Building } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

const mockWalletHistory = [
  {
    id: "w-tx-1",
    type: "Deposit",
    amount: 50000,
    source: "Bank Wire Transfer (City Bank)",
    reference: "DEP-20260901-88",
    date: "2026-09-01 11:30 AM",
    status: "Approved",
  },
  {
    id: "w-tx-2",
    type: "Bulk Recharge",
    amount: -14800,
    source: "Automated Monthly Billing Renewal",
    reference: "AUTORENEW-32-SUBSCRIBERS",
    date: "2026-09-01 12:00 AM",
    status: "Processed",
  },
  {
    id: "w-tx-3",
    type: "Deposit",
    amount: 25000,
    source: "bKash Merchant Instant Top-up",
    reference: "TXN_BK_992120",
    date: "2026-08-28 04:15 PM",
    status: "Approved",
  },
];

export default function WalletPage() {
  const [balance] = useState(82500);
  const [history] = useState(mockWalletHistory);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Wallet className="h-6 w-6 text-indigo-500" />
            Wallet & Deposit Operations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Prepaid balance ledger, upstream bandwidth settlement, and deposit top-up history.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" />
          Deposit Balance
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="border-indigo-500/20 bg-indigo-500/10">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-indigo-400">Available Prepaid Balance</CardDescription>
            <CardTitle className="text-3xl font-bold text-foreground mt-1">
              {formatCurrency(balance)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Ready for automated subscriber recharge & NTTN transit settlement.</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-muted-foreground">Monthly Total Deposited</CardDescription>
            <CardTitle className="text-3xl font-bold text-emerald-500 mt-1">
              {formatCurrency(75000)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">2 Bank Transfers & 1 Mobile Financial Services Topup.</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium text-muted-foreground">Spent on Recharges</CardDescription>
            <CardTitle className="text-3xl font-bold text-foreground mt-1">
              {formatCurrency(14800)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Billed across active FTTH & Reseller client lines.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <History className="h-4 w-4 text-indigo-500" />
            Wallet Transaction Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Source / Method</th>
                  <th className="text-left px-4 py-3">Reference Trx</th>
                  <th className="text-left px-4 py-3">Date & Time</th>
                  <th className="text-right px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {history.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground flex items-center gap-2">
                      {tx.amount > 0 ? (
                        <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-amber-500" />
                      )}
                      {tx.type}
                    </td>
                    <td className={`px-4 py-3 font-bold ${tx.amount > 0 ? 'text-emerald-500' : 'text-foreground'}`}>
                      {tx.amount > 0 ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{tx.source}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{tx.reference}</td>
                    <td className="px-4 py-3 text-muted-foreground">{tx.date}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="default">{tx.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

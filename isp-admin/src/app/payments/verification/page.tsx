"use client";

import { useState } from "react";
import { CheckCircle2, Search, RefreshCw, Smartphone, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

const pendingVerifications = [
  {
    id: "tx-v1",
    gateway: "bKash",
    trx_id: "9K9P2M4X7Q",
    sender: "01711223344",
    amount: 800,
    subscriber: "Tanvir Ahmed (tanvir_home)",
    timestamp: "2026-09-01 10:24 AM",
    status: "Auto-Matched",
  },
  {
    id: "tx-v2",
    gateway: "Nagad",
    trx_id: "NGD88219482",
    sender: "01977665544",
    amount: 2400,
    subscriber: "Smart Tech Solution Ltd.",
    timestamp: "2026-09-01 11:45 AM",
    status: "Auto-Matched",
  },
  {
    id: "tx-v3",
    gateway: "bKash",
    trx_id: "9M4K1P88XQ",
    sender: "01844991100",
    amount: 500,
    subscriber: "Unknown / Unmatched (Needs Manual Verification)",
    timestamp: "2026-09-01 03:10 PM",
    status: "Pending Manual Review",
  },
];

export default function PaymentVerificationPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-indigo-500" />
            Payment & TrxID Verification Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cross-verify mobile banking TrxID with subscriber accounts, reconcile offline cash collections and approve manually.
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">Transaction Verification Feed</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Gateway / TrxID</th>
                <th className="text-left px-4 py-3">Sender Phone</th>
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Matched Subscriber</th>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-right px-4 py-3">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {pendingVerifications.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{tx.gateway}</p>
                    <p className="font-mono text-indigo-500 text-[11px]">{tx.trx_id}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono">{tx.sender}</td>
                  <td className="px-4 py-3 font-bold text-foreground">{formatCurrency(tx.amount)}</td>
                  <td className="px-4 py-3 text-foreground font-medium">{tx.subscriber}</td>
                  <td className="px-4 py-3 text-muted-foreground">{tx.timestamp}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={tx.status.includes("Pending") ? "destructive" : "default"}>
                      {tx.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

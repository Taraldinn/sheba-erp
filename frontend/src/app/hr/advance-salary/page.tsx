"use client";

import { Wallet, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export default function AdvanceSalaryPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Wallet className="h-6 w-6 text-indigo-500" />
            Advance Salary & Loan Adjustments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Staff advance loan disbursement, installment deduction schedules, and payroll offsets.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" /> Disburse Advance
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base font-bold">Active Advance Disbursal Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Employee</th>
                <th className="text-left px-4 py-3">Advance Amount</th>
                <th className="text-left px-4 py-3">Monthly Deduction</th>
                <th className="text-left px-4 py-3">Remaining Balance</th>
                <th className="text-right px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {[
                { name: "Shakil Ahmed", amount: 15000, monthly: 5000, remaining: 10000, status: "Active Recovery" },
                { name: "Kamrul Islam", amount: 20000, monthly: 10000, remaining: 0, status: "Fully Settled" },
              ].map((r, i) => (
                <tr key={i} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">{r.name}</td>
                  <td className="px-4 py-3 font-bold text-foreground">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatCurrency(r.monthly)}/mo</td>
                  <td className="px-4 py-3 font-semibold text-amber-500">{formatCurrency(r.remaining)}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={r.status.includes("Active") ? "default" : "outline"}>{r.status}</Badge>
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

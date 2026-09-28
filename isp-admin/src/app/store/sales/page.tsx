"use client";

import { useState } from "react";
import { ShoppingCart, Plus, Search, User, Calendar, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

const mockSales = [
  {
    id: "sale-101",
    invoice_no: "POS-2026-0891",
    customer: "Tanvir Ahmed (tanvir_home)",
    item: "Dual Band Gigabit XPON ONU",
    quantity: 1,
    unit_price: 1850,
    total: 1850,
    sold_by: "Kamrul Islam",
    date: "2026-09-01",
    payment_status: "Paid (Cash)",
  },
  {
    id: "sale-102",
    invoice_no: "POS-2026-0892",
    customer: "Smart Tech Solution Ltd.",
    item: "Cat6 Outdoor UTP Cable Roll (305m)",
    quantity: 2,
    unit_price: 6800,
    total: 13600,
    sold_by: "Farhana Akter",
    date: "2026-09-01",
    payment_status: "Paid (Bank Transfer)",
  },
  {
    id: "sale-103",
    invoice_no: "POS-2026-0893",
    customer: "Mehedi Hasan",
    item: "Archer C6 AC1200 Wi-Fi Router",
    quantity: 1,
    unit_price: 2850,
    total: 2850,
    sold_by: "Shakil Ahmed",
    date: "2026-08-31",
    payment_status: "Paid (bKash)",
  },
];

export default function StoreSalesPage() {
  const [sales] = useState(mockSales);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-indigo-500" />
            Device & Hardware Point of Sale (POS)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Subscriber ONU/Router purchases, patch cord & optical accessories retail billing.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" /> New Sale / POS Invoice
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">Recent Hardware Sales Ledger</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <th className="text-left px-4 py-3">Invoice #</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Item Description</th>
                <th className="text-left px-4 py-3">Qty</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Total</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Sold By</th>
                <th className="text-right px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-indigo-500">{s.invoice_no}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{s.customer}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{s.item}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.quantity}</td>
                  <td className="px-4 py-3 font-bold text-foreground">{formatCurrency(s.total)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{s.sold_by}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant="default">{s.payment_status}</Badge>
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

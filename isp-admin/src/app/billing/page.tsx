"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Receipt,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiClient } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Customer } from "@/types";

interface InvoiceLine {
  description?: string;
  quantity?: number;
  unit_price: number;
  line_total?: number;
}

interface InvoiceItem {
  id: string;
  invoice_no?: string;
  customer?: string;
  customer_name?: string;
  customer_username?: string;
  package_name?: string;
  billing_month?: string;
  total_payable: number;
  paid_amount: number;
  due_amount: number;
  status: string;
  due_date?: string;
  created_at?: string;
  lines?: InvoiceLine[];
}

interface RechargeItem {
  id: string;
  customer?: string;
  customer_name?: string;
  customer_username?: string;
  package_name?: string;
  amount: number;
  validity_days?: number;
  payment_method?: string;
  status?: string;
  transaction_id?: string;
  processed_by_name?: string;
  created_at?: string;
  notes?: string;
}

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get("tab");
  const activeTab = rawTab === "recharges" ? "recharges" : "invoices";

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [recharges, setRecharges] = useState<RechargeItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Filters
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("ALL");
  const [rechargeSearch, setRechargeSearch] = useState("");

  // Invoice Detail Modal
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);

  // New Recharge Modal
  const [rechargeModalOpen, setRechargeModalOpen] = useState(false);
  const [rechargeSubmitting, setRechargeSubmitting] = useState(false);
  const [rechargeForm, setRechargeForm] = useState({
    customer_id: "",
    amount: "500",
    validity_days: "30",
    payment_method: "Cash",
    notes: "",
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const loadBillingData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invData, recData, custData] = await Promise.all([
        ApiClient.getInvoices(invoiceStatusFilter !== "ALL" ? invoiceStatusFilter : undefined),
        ApiClient.getRecharges().catch(() => []),
        ApiClient.getCustomers().catch(() => []),
      ]);
      setInvoices(invData);
      setRecharges(recData);
      setCustomers(custData);
      if (custData.length > 0 && !rechargeForm.customer_id) {
        setRechargeForm((prev) => ({ ...prev, customer_id: custData[0].id }));
      }
    } catch (err: unknown) {
      console.error("Failed to load billing data:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to load billing records.");
    } finally {
      setLoading(false);
    }
  }, [invoiceStatusFilter, rechargeForm.customer_id]);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      ApiClient.getInvoices(invoiceStatusFilter !== "ALL" ? invoiceStatusFilter : undefined),
      ApiClient.getRecharges().catch(() => []),
      ApiClient.getCustomers().catch(() => []),
    ])
      .then(([invData, recData, custData]) => {
        if (ignore) return;
        setInvoices(invData);
        setRecharges(recData);
        setCustomers(custData);
        if (custData.length > 0 && !rechargeForm.customer_id) {
          setRechargeForm((prev) => ({ ...prev, customer_id: custData[0].id }));
        }
      })
      .catch((err: unknown) => {
        if (ignore) return;
        console.error("Failed to load billing data:", err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Failed to load billing records.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [invoiceStatusFilter, rechargeForm.customer_id]);

  const handleTabChange = (newTab: string) => {
    router.replace(`/billing?tab=${newTab}`, { scroll: false });
  };

  const handleCreateRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rechargeForm.customer_id) {
      alert("Please select a subscriber to recharge.");
      return;
    }

    setRechargeSubmitting(true);
    try {
      await ApiClient.createRecharge({
        customer_id: rechargeForm.customer_id,
        amount: Number(rechargeForm.amount),
        validity_days: Number(rechargeForm.validity_days),
        payment_method: rechargeForm.payment_method,
        notes: rechargeForm.notes || "Recharge from Billing portal",
      });
      showToast("Subscriber recharge processed successfully.");
      setRechargeModalOpen(false);
      loadBillingData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "Failed to process recharge.");
    } finally {
      setRechargeSubmitting(false);
    }
  };

  // Filtered Invoices
  const filteredInvoices = invoices.filter((inv) => {
    const q = invoiceSearch.toLowerCase();
    const invNo = (inv.invoice_no || inv.id || "").toLowerCase();
    const custName = (inv.customer_name || inv.customer_username || "").toLowerCase();
    return q === "" || invNo.includes(q) || custName.includes(q);
  });

  // Filtered Recharges
  const filteredRecharges = recharges.filter((rec) => {
    const q = rechargeSearch.toLowerCase();
    const custName = (rec.customer_name || rec.customer_username || "").toLowerCase();
    const trx = (rec.transaction_id || "").toLowerCase();
    return q === "" || custName.includes(q) || trx.includes(q);
  });

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-indigo-500" />
            Billing & Invoicing Operations
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Operational subscriber invoices, payment ledger allocations, and customer recharges.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadBillingData}
            disabled={loading}
            className="h-8 text-xs gap-1.5 border-border bg-card cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setRechargeModalOpen(true)}
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Process Recharge
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={loadBillingData} className="h-7 text-xs border-destructive/30">
            Retry
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="invoices" className="text-xs font-semibold">
            Invoices ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="recharges" className="text-xs font-semibold">
            Recharges ({recharges.length})
          </TabsTrigger>
        </TabsList>

        {/* ════════════════ INVOICES TAB ════════════════ */}
        <TabsContent value="invoices" className="mt-4 space-y-4">
          <Card className="border-border bg-card shadow-xs">
            <CardContent className="p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search invoice number or subscriber..."
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    className="h-8 pl-8 text-xs bg-muted/30"
                  />
                </div>
                <select
                  value={invoiceStatusFilter}
                  onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-xs">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Invoice #</th>
                      <th className="p-3">Subscriber</th>
                      <th className="p-3">Package</th>
                      <th className="p-3">Total Payable</th>
                      <th className="p-3">Paid Amount</th>
                      <th className="p-3">Due Balance</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading && invoices.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-muted-foreground">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                            <span>Loading invoices from billing ledger...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-muted-foreground">
                          No invoices found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredInvoices.map((inv) => (
                        <tr key={inv.id || inv.invoice_no} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-indigo-500">
                            {inv.invoice_no || `INV-${inv.id?.slice(0, 8)}`}
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-foreground block">
                              {inv.customer_name || inv.customer_username || "Subscriber"}
                            </span>
                            {inv.customer_username && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {inv.customer_username}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {inv.package_name || "Broadband Service"}
                          </td>
                          <td className="p-3 font-bold text-foreground">
                            {formatCurrency(inv.total_payable || 0)}
                          </td>
                          <td className="p-3 text-emerald-500 font-semibold">
                            {formatCurrency(inv.paid_amount || 0)}
                          </td>
                          <td className="p-3 text-amber-500 font-semibold">
                            {formatCurrency(inv.due_amount || 0)}
                          </td>
                          <td className="p-3">
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {inv.due_date ? formatDate(inv.due_date) : "—"}
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedInvoice(inv)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="View invoice line items"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════ RECHARGES TAB ════════════════ */}
        <TabsContent value="recharges" className="mt-4 space-y-4">
          <Card className="border-border bg-card shadow-xs">
            <CardContent className="p-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search subscriber or transaction ID..."
                  value={rechargeSearch}
                  onChange={(e) => setRechargeSearch(e.target.value)}
                  className="h-8 pl-8 text-xs bg-muted/30"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-xs">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Subscriber</th>
                      <th className="p-3">Package</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Validity Days</th>
                      <th className="p-3">Payment Method</th>
                      <th className="p-3">Transaction ID</th>
                      <th className="p-3 text-right">Processed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading && recharges.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-muted-foreground">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                            <span>Loading recharge records...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredRecharges.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-muted-foreground">
                          No recharge records found.
                        </td>
                      </tr>
                    ) : (
                      filteredRecharges.map((rec) => (
                        <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-muted-foreground font-mono">
                            {rec.created_at ? formatDate(rec.created_at) : "Recent"}
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-foreground block">
                              {rec.customer_name || rec.customer_username || "Subscriber"}
                            </span>
                            {rec.customer_username && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {rec.customer_username}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {rec.package_name || "Standard Profile"}
                          </td>
                          <td className="p-3 font-bold text-emerald-500">
                            {formatCurrency(rec.amount)}
                          </td>
                          <td className="p-3 text-foreground font-medium">
                            {rec.validity_days || 30} Days
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-muted text-foreground text-[10px] font-semibold border border-border">
                              {rec.payment_method || "Cash"}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[10px] text-muted-foreground">
                            {rec.transaction_id || "—"}
                          </td>
                          <td className="p-3 text-right text-muted-foreground font-mono">
                            {rec.processed_by_name || "System"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice Detail Modal */}
      <Dialog open={Boolean(selectedInvoice)} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Invoice Details: {selectedInvoice?.invoice_no}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Issued to {selectedInvoice?.customer_name} ({selectedInvoice?.customer_username})
                </DialogDescription>
              </div>
              <StatusBadge status={selectedInvoice?.status} />
            </div>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border border-border">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Billing Month</span>
                  <p className="font-semibold text-foreground mt-0.5">{selectedInvoice.billing_month || "Current Period"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Due Date</span>
                  <p className="text-foreground mt-0.5">{selectedInvoice.due_date ? formatDate(selectedInvoice.due_date) : "—"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Package</span>
                  <p className="text-foreground mt-0.5">{selectedInvoice.package_name || "Broadband Subscription"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Issued At</span>
                  <p className="text-foreground mt-0.5">{selectedInvoice.created_at ? formatDate(selectedInvoice.created_at) : "—"}</p>
                </div>
              </div>

              {/* Line Items if available */}
              {selectedInvoice.lines && selectedInvoice.lines.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Itemized Line Items</span>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/60 text-muted-foreground text-[10px] uppercase font-bold">
                        <tr>
                          <th className="p-2">Description</th>
                          <th className="p-2">Qty</th>
                          <th className="p-2 text-right">Unit Price</th>
                          <th className="p-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selectedInvoice.lines.map((l: InvoiceLine, idx: number) => (
                          <tr key={idx}>
                            <td className="p-2">{l.description || "Internet bandwidth"}</td>
                            <td className="p-2 font-mono">{l.quantity || 1}</td>
                            <td className="p-2 text-right font-mono">{formatCurrency(l.unit_price)}</td>
                            <td className="p-2 text-right font-bold">{formatCurrency(l.line_total || l.unit_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Totals Summary */}
              <div className="grid grid-cols-3 gap-2 text-center p-3 bg-muted/40 rounded-lg border border-border">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Payable</span>
                  <p className="text-base font-black text-foreground mt-0.5">{formatCurrency(selectedInvoice.total_payable)}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Paid</span>
                  <p className="text-base font-bold text-emerald-500 mt-0.5">{formatCurrency(selectedInvoice.paid_amount || 0)}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Due</span>
                  <p className="text-base font-bold text-amber-500 mt-0.5">{formatCurrency(selectedInvoice.due_amount || 0)}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedInvoice(null)} className="text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Recharge Modal */}
      <Dialog open={rechargeModalOpen} onOpenChange={setRechargeModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Process Subscriber Recharge</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select subscriber and enter payment amount to add service validity.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateRecharge} className="space-y-3.5 text-xs">
            <div>
              <label className="text-xs font-semibold text-foreground">Select Subscriber</label>
              <select
                required
                value={rechargeForm.customer_id}
                onChange={(e) => setRechargeForm({ ...rechargeForm, customer_id: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={rechargeSubmitting}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.pppoe_username}) - Due: Tk {c.due_amount}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Recharge Amount (Tk)</label>
                <Input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={rechargeForm.amount}
                  onChange={(e) => setRechargeForm({ ...rechargeForm, amount: e.target.value })}
                  className="mt-1 text-xs font-bold"
                  disabled={rechargeSubmitting}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Validity (Days)</label>
                <Input
                  type="number"
                  required
                  min="1"
                  value={rechargeForm.validity_days}
                  onChange={(e) => setRechargeForm({ ...rechargeForm, validity_days: e.target.value })}
                  className="mt-1 text-xs"
                  disabled={rechargeSubmitting}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Payment Method</label>
              <select
                value={rechargeForm.payment_method}
                onChange={(e) => setRechargeForm({ ...rechargeForm, payment_method: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={rechargeSubmitting}
              >
                <option value="Cash">Cash Desk</option>
                <option value="bKash">bKash</option>
                <option value="Nagad">Nagad</option>
                <option value="Rocket">Rocket</option>
                <option value="Bank">Bank Deposit</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Operational Note</label>
              <Input
                placeholder="Optional receipt number or remarks"
                value={rechargeForm.notes}
                onChange={(e) => setRechargeForm({ ...rechargeForm, notes: e.target.value })}
                className="mt-1 text-xs"
                disabled={rechargeSubmitting}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rechargeSubmitting}
                onClick={() => setRechargeModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={rechargeSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {rechargeSubmitting ? "Processing..." : "Confirm Recharge"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          <span>Loading billing records...</span>
        </div>
      }
    >
      <BillingContent />
    </Suspense>
  );
}

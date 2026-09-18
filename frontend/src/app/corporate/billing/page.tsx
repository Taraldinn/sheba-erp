"use client";

import { useEffect, useState } from "react";
import {
  Calculator,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  RefreshCw,
  Plus,
  FileText,
  TrendingUp,
  ShieldAlert,
  Info,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { CorporateBillingPeriod, CorporateCustomer } from "@/types";

export default function CorporateBillingPage() {
  const [periods, setPeriods] = useState<CorporateBillingPeriod[]>([]);
  const [customers, setCustomers] = useState<CorporateCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerFilter, setCustomerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<CorporateBillingPeriod | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form for New Billing Period
  const [formData, setFormData] = useState({
    corporate_customer: "",
    period_start: "",
    period_end: "",
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [periodList, custList] = await Promise.all([
        ApiClient.getCorporateBillingPeriods({
          corporate_customer: customerFilter || undefined,
          status: statusFilter || undefined,
        }),
        ApiClient.getCorporateCustomers().catch(() => []),
      ]);
      setPeriods(periodList);
      setCustomers(custList);
    } catch (e: any) {
      showToast(e.message || "Failed to load billing periods", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [customerFilter, statusFilter]);

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.corporate_customer || !formData.period_start || !formData.period_end) {
      showToast("Please fill in all required fields", "error");
      return;
    }

    try {
      await ApiClient.createCorporateBillingPeriod({
        corporate_customer: formData.corporate_customer,
        period_start: new Date(formData.period_start).toISOString(),
        period_end: new Date(formData.period_end).toISOString(),
      });
      showToast("Billing period created successfully!");
      setCreateModalOpen(false);
      setFormData({
        corporate_customer: "",
        period_start: "",
        period_end: "",
      });
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to create billing period", "error");
    }
  };

  const handleCalculate = async (periodId: string) => {
    setActionLoading(periodId);
    try {
      const updated = await ApiClient.calculateCorporateBillingPeriod(periodId);
      showToast(`P95 calculation completed! Billable: ${updated.p95_billable_mbps} Mbps.`);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to calculate P95 bandwidth", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleFinalizeInvoice = async (period: CorporateBillingPeriod) => {
    if (period.status === "INVOICED") {
      showToast("This period has already been invoiced.", "error");
      return;
    }

    if (!confirm(`Finalize and post official invoice for ${period.company_name || "Corporate Customer"}? Total: ${period.total_payable} BDT`)) {
      return;
    }

    setActionLoading(period.id);
    try {
      const result = await ApiClient.finalizeCorporateInvoice(period.id);
      showToast(`Invoice #${result.invoice_no} generated and appended to LedgerEntry successfully!`);
      loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to generate corporate invoice", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Metrics summary
  const totalPeriods = periods.length;
  const invoicedCount = periods.filter((p) => p.status === "INVOICED").length;
  const calculatedCount = periods.filter((p) => p.status === "CALCULATED").length;
  const insufficientCount = periods.filter((p) => p.status === "INSUFFICIENT_DATA").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "INVOICED":
        return <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">INVOICED</Badge>;
      case "CALCULATED":
        return <Badge className="bg-purple-600 text-white hover:bg-purple-700">CALCULATED</Badge>;
      case "CALCULATING":
        return <Badge className="bg-blue-600 text-white animate-pulse">CALCULATING</Badge>;
      case "INSUFFICIENT_DATA":
        return <Badge className="bg-rose-600 text-white hover:bg-rose-700">INSUFFICIENT DATA</Badge>;
      case "OPEN":
      default:
        return <Badge className="bg-amber-600 text-white hover:bg-amber-700">OPEN</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between shadow-md border ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
              : "bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800"
          }`}
        >
          <div className="flex items-center gap-3">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            )}
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs font-semibold underline hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calculator className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            95th Percentile Bandwidth Billing & Invoicing
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Deterministic P95 traffic calculation, CIR burst overage audit, and immutable Ledger-backed corporate invoicing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4" />
            New Billing Period
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Periods
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {totalPeriods}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Across all enterprise clients
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Calculated P95
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-purple-700 dark:text-purple-300">
              {calculatedCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Awaiting final invoice approval
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Invoiced & Posted
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {invoicedCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Synced with Ledger & AR
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Insufficient Data Gate
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-700 dark:text-rose-300">
              {insufficientCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Coverage &lt; 80% (Bursting blocked)
          </CardContent>
        </Card>
      </div>

      {/* P95 Policy Alert Info */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-3">
        <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            Corporate 95th Percentile Bandwidth Billing Policy:
          </span>
          <p>
            MRTG collects 5-minute telemetry intervals. Across all circuits for a client, throughput is summed per 5-minute bucket: <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">Metric = max(inbound_bps, outbound_bps)</code>. Samples are sorted ascending, and P95 is calculated deterministically at <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">ceil(0.95 * N) - 1</code>.
            If telemetry coverage is below <strong>80%</strong>, burst overage billing is automatically blocked to prevent unfair penalties.
          </p>
        </div>
      </div>

      {/* Filter Controls */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-1/2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
                Filter by Enterprise Customer
              </label>
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">All Corporate Clients</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name} ({c.committed_bandwidth_mbps} Mbps CIR)
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-1/2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
                Filter by Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="CALCULATING">CALCULATING</option>
                <option value="CALCULATED">CALCULATED</option>
                <option value="INVOICED">INVOICED</option>
                <option value="INSUFFICIENT_DATA">INSUFFICIENT DATA</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Periods Table */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Billing & P95 Audit Cycles
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Review telemetry collection coverage, computed P95 billable rate, and finalize official invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Coverage & Samples</th>
                  <th className="px-4 py-3">CIR / P95 Billable</th>
                  <th className="px-4 py-3">Burst (Mbps)</th>
                  <th className="px-4 py-3">Total Payable</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      <div className="flex justify-center items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                        Loading corporate billing cycles...
                      </div>
                    </td>
                  </tr>
                ) : periods.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No corporate billing periods found. Click &quot;New Billing Period&quot; to initialize a cycle.
                    </td>
                  </tr>
                ) : (
                  periods.map((period) => {
                    const coverageNum = parseFloat(period.coverage_percent || "0");
                    const isGated = coverageNum < 80.0 && period.total_samples > 0;
                    const burstNum = parseFloat(period.burst_mbps || "0");

                    return (
                      <tr key={period.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {period.company_name || "Enterprise Client"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div>{new Date(period.period_start).toLocaleDateString()}</div>
                          <div className="text-slate-400 text-[11px]">to {new Date(period.period_end).toLocaleDateString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs">{period.coverage_percent}%</span>
                            {isGated ? (
                              <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[10px] px-1.5 py-0 border border-rose-300 dark:border-rose-800">
                                &lt;80% Gated
                              </Badge>
                            ) : coverageNum >= 80 ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] px-1.5 py-0">
                                OK
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {period.total_samples} samples
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs">
                            <span className="text-slate-500">CIR: </span>
                            <span className="font-semibold">{period.committed_mbps} Mbps</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-500">P95: </span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">
                              {period.p95_billable_mbps ? `${period.p95_billable_mbps} Mbps` : "-"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {burstNum > 0 ? (
                            <span className="font-bold text-amber-600 dark:text-amber-400 text-xs">
                              +{period.burst_mbps} Mbps
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">0 Mbps</span>
                          )}
                          <div className="text-[11px] text-slate-400">
                            @{period.burst_rate_per_mbps}/M
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-xs text-slate-900 dark:text-slate-100">
                          {period.total_payable ? `${parseFloat(period.total_payable).toLocaleString()} BDT` : "-"}
                          <div className="text-[11px] font-normal text-slate-400">
                            Base: {period.base_charge ? parseFloat(period.base_charge).toLocaleString() : 0}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(period.status)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {period.invoice_no ? (
                            <Badge variant="outline" className="font-mono text-[11px] border-emerald-400 text-emerald-700 dark:text-emerald-300">
                              #{period.invoice_no}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-slate-600 dark:text-slate-400"
                            onClick={() => {
                              setSelectedPeriod(period);
                              setDetailsModalOpen(true);
                            }}
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            Audit
                          </Button>

                          {period.status !== "INVOICED" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
                              disabled={actionLoading === period.id}
                              onClick={() => handleCalculate(period.id)}
                            >
                              <Calculator className="w-3.5 h-3.5 mr-1" />
                              {actionLoading === period.id ? "Calc..." : "Calc P95"}
                            </Button>
                          )}

                          {period.status === "CALCULATED" && (
                            <Button
                              size="sm"
                              className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={actionLoading === period.id}
                              onClick={() => handleFinalizeInvoice(period)}
                            >
                              <Receipt className="w-3.5 h-3.5 mr-1" />
                              Invoice
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal: New Billing Period */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Open New Corporate Billing Period</DialogTitle>
            <DialogDescription>
              Initialize a monthly or on-demand telemetry billing cycle for an enterprise account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePeriod} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Corporate Customer *
              </label>
              <select
                required
                value={formData.corporate_customer}
                onChange={(e) => setFormData({ ...formData, corporate_customer: e.target.value })}
                className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Select Enterprise Client...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name} ({c.committed_bandwidth_mbps} Mbps CIR)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Period Start *
                </label>
                <Input
                  type="datetime-local"
                  required
                  value={formData.period_start}
                  onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Period End *
                </label>
                <Input
                  type="datetime-local"
                  required
                  value={formData.period_end}
                  onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md text-xs text-slate-500 space-y-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Note:</span>
              <p>
                The calculation engine aggregates MRTG samples across all active circuits configured under this enterprise profile.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Initialize Period
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Audit & Calculation Details */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              P95 Calculation Audit Breakdown
            </DialogTitle>
            <DialogDescription>
              Detailed mathematical breakdown and coverage metrics for this billing cycle.
            </DialogDescription>
          </DialogHeader>

          {selectedPeriod && (
            <div className="space-y-4 text-sm">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-slate-400 block">Customer:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedPeriod.company_name}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Period Span:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {new Date(selectedPeriod.period_start).toLocaleDateString()} – {new Date(selectedPeriod.period_end).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Status:</span>
                  <div className="mt-0.5">{getStatusBadge(selectedPeriod.status)}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Official Invoice:</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {selectedPeriod.invoice_no ? `#${selectedPeriod.invoice_no}` : "Not finalized"}
                  </span>
                </div>
              </div>

              {/* Bandwidth Audit Metrics */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Telemetry & P95 Results
                </h4>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded">
                    <span className="text-slate-400 block">Samples / Coverage:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {selectedPeriod.total_samples} samples ({selectedPeriod.coverage_percent}%)
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded">
                    <span className="text-slate-400 block">Committed CIR:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {selectedPeriod.committed_mbps} Mbps
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded">
                    <span className="text-slate-400 block">Billable P95:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      {selectedPeriod.p95_billable_mbps ? `${selectedPeriod.p95_billable_mbps} Mbps` : "-"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-400">P95 Inbound:</span>{" "}
                    <span className="font-semibold">{selectedPeriod.p95_inbound_mbps || 0} Mbps</span>
                  </div>
                  <div>
                    <span className="text-slate-400">P95 Outbound:</span>{" "}
                    <span className="font-semibold">{selectedPeriod.p95_outbound_mbps || 0} Mbps</span>
                  </div>
                </div>
              </div>

              {/* Financial Charges Breakdown */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Charge Calculation
                </h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Base CIR Fee ({selectedPeriod.committed_mbps} Mbps):</span>
                    <span className="font-semibold">
                      {parseFloat(selectedPeriod.base_charge || "0").toLocaleString()} BDT
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">
                      Burst Overage ({selectedPeriod.burst_mbps || 0} Mbps @ {selectedPeriod.burst_rate_per_mbps} BDT/Mbps):
                    </span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {parseFloat(selectedPeriod.burst_charge || "0").toLocaleString()} BDT
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-sm text-slate-900 dark:text-slate-100">
                    <span>Total Net Payable:</span>
                    <span className="text-indigo-600 dark:text-indigo-400">
                      {parseFloat(selectedPeriod.total_payable || "0").toLocaleString()} BDT
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Coverage Warning if insufficient */}
              {parseFloat(selectedPeriod.coverage_percent || "0") < 80.0 && selectedPeriod.total_samples > 0 && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-md text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Data Quality Gate Active:</span> Coverage is {selectedPeriod.coverage_percent}%, which is below the 80% threshold required for burst overage billing. Any burst charge has been waived.
                  </div>
                </div>
              )}

              {/* Metadata inspector */}
              {selectedPeriod.calculation_metadata && Object.keys(selectedPeriod.calculation_metadata).length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 font-medium">Engine Execution Telemetry:</span>
                  <pre className="p-2 bg-slate-950 text-emerald-400 rounded text-[11px] overflow-x-auto font-mono">
                    {JSON.stringify(selectedPeriod.calculation_metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDetailsModalOpen(false)}>
              Close
            </Button>
            {selectedPeriod && selectedPeriod.status === "CALCULATED" && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  setDetailsModalOpen(false);
                  handleFinalizeInvoice(selectedPeriod);
                }}
              >
                <Receipt className="w-4 h-4 mr-1.5" />
                Finalize & Post Invoice
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

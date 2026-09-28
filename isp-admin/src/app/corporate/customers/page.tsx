"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Layers,
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
import { CorporateCustomer, Customer } from "@/types";

export default function CorporateCustomersPage() {
  const [customers, setCustomers] = useState<CorporateCustomer[]>([]);
  const [baseCustomers, setBaseCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<any | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form
  const [formData, setFormData] = useState({
    customer_id: "",
    company_name: "",
    legal_name: "",
    trade_license_no: "",
    bin_tin: "",
    contact_person: "",
    billing_contact_email: "",
    billing_contact_phone: "",
    committed_bandwidth_mbps: 100,
    burst_rate_per_mbps: "500.00",
    base_monthly_fee: "25000.00",
    billing_cycle: "CALENDAR_MONTH",
    credit_terms_days: 30,
    aggregation_policy: "AGGREGATE_SUM",
    status: "ACTIVE",
    notes: "",
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [corpList, baseList] = await Promise.all([
        ApiClient.getCorporateCustomers({ search: searchQuery, status: statusFilter }),
        ApiClient.getCustomers().catch(() => []),
      ]);
      setCustomers(corpList);
      setBaseCustomers(baseList);
    } catch (e: any) {
      showToast(e.message || "Failed to load corporate customers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id) {
      showToast("Please select an underlying customer account.", "error");
      return;
    }
    try {
      await ApiClient.createCorporateCustomer({
        customer: formData.customer_id,
        company_name: formData.company_name,
        legal_name: formData.legal_name,
        trade_license_no: formData.trade_license_no,
        bin_tin: formData.bin_tin,
        contact_person: formData.contact_person,
        billing_contact_email: formData.billing_contact_email,
        billing_contact_phone: formData.billing_contact_phone,
        committed_bandwidth_mbps: Number(formData.committed_bandwidth_mbps),
        burst_rate_per_mbps: formData.burst_rate_per_mbps,
        base_monthly_fee: formData.base_monthly_fee,
        billing_cycle: formData.billing_cycle as any,
        credit_terms_days: Number(formData.credit_terms_days),
        aggregation_policy: formData.aggregation_policy as any,
        status: formData.status as any,
        notes: formData.notes,
      });
      showToast("Corporate client profile registered successfully!");
      setCreateModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to create corporate customer profile", "error");
    }
  };

  const viewSummary = async (cust: CorporateCustomer) => {
    try {
      const summary = await ApiClient.getCorporateCustomerSummary(cust.id);
      setSelectedSummary(summary);
      setSummaryModalOpen(true);
    } catch (e: any) {
      showToast("Could not load customer summary.", "error");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center justify-between shadow-lg transition-all ${
            notification.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{notification.message}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNotification(null)} className="h-7 text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-1 uppercase tracking-wider">
            <Building2 className="w-4 h-4" />
            Client Directory
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Corporate Clients</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Enterprise subscriber accounts with committed information rate (CIR) and SLA agreements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateModalOpen(true)} className="gap-2 bg-primary text-primary-foreground">
            <Plus className="w-4 h-4" /> Register Client
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by company name, TIN, or contact person..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Search
            </Button>
          </form>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm bg-background text-foreground"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="SUSPENDED">Suspended Only</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Client Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground border-b text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-4">Company Name</th>
                  <th className="p-4">Contact</th>
                  <th className="p-4">CIR Bandwidth</th>
                  <th className="p-4">Base Fee & Burst</th>
                  <th className="p-4">Circuits</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {loading ? "Loading corporate profiles..." : "No corporate clients found."}
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-foreground">{c.company_name}</div>
                        {c.legal_name && <div className="text-xs text-muted-foreground">{c.legal_name}</div>}
                        {c.bin_tin && <div className="text-[11px] text-muted-foreground">TIN: {c.bin_tin}</div>}
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-foreground">{c.contact_person}</div>
                        <div className="text-xs text-muted-foreground">{c.billing_contact_email}</div>
                        <div className="text-xs text-muted-foreground">{c.billing_contact_phone}</div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className="font-mono text-primary font-bold">
                          {c.committed_bandwidth_mbps} Mbps CIR
                        </Badge>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{c.aggregation_policy}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-foreground">৳{parseFloat(c.base_monthly_fee).toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Burst: ৳{c.burst_rate_per_mbps}/Mbps</div>
                      </td>
                      <td className="p-4">
                        <Badge variant="secondary" className="font-semibold">
                          {c.active_circuits_count || 0} active link(s)
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge
                          variant={
                            c.status === "ACTIVE"
                              ? "default"
                              : c.status === "SUSPENDED"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewSummary(c)}
                          className="text-xs gap-1.5 hover:text-primary"
                        >
                          <Eye className="w-3.5 h-3.5" /> Summary
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

      {/* Summary Dialog */}
      <Dialog open={summaryModalOpen} onOpenChange={setSummaryModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enterprise Customer Summary</DialogTitle>
            <DialogDescription>{selectedSummary?.company_name}</DialogDescription>
          </DialogHeader>
          {selectedSummary && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Active Circuits:</span>
                <span className="font-bold">{selectedSummary.active_circuits_count}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Total Committed CIR:</span>
                <span className="font-bold text-primary">{selectedSummary.total_committed_cir_mbps} Mbps</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Base Monthly Fee:</span>
                <span className="font-bold">৳{parseFloat(selectedSummary.base_monthly_fee).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Burst Rate:</span>
                <span className="font-bold">৳{selectedSummary.burst_rate_per_mbps}/Mbps</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                  Assigned Dedicated IPs ({selectedSummary.assigned_ips_count}):
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selectedSummary.assigned_ips?.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No dedicated IPs assigned.</span>
                  ) : (
                    selectedSummary.assigned_ips.map((ip: any, idx: number) => (
                      <Badge key={idx} variant="outline" className="font-mono text-xs">
                        {ip.ip_address} ({ip.connection__circuit_id})
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSummaryModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register Corporate Profile</DialogTitle>
            <DialogDescription>
              Create a contracted corporate subscriber profile anchored to a customer account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCustomer} className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Anchor Customer Account *
                </label>
                <select
                  required
                  value={formData.customer_id}
                  onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                >
                  <option value="">-- Select Customer Account --</option>
                  {baseCustomers.map((cust) => (
                    <option key={cust.id} value={cust.id}>
                      {cust.full_name} ({cust.customer_code || cust.pppoe_username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Company Legal / Trade Name *
                </label>
                <Input
                  required
                  placeholder="e.g. ACME Bangladesh Ltd."
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Contact Person *
                </label>
                <Input
                  required
                  placeholder="Full name of primary liaison"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Billing Email *
                </label>
                <Input
                  required
                  type="email"
                  placeholder="billing@company.com"
                  value={formData.billing_contact_email}
                  onChange={(e) => setFormData({ ...formData, billing_contact_email: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Billing Phone *
                </label>
                <Input
                  required
                  placeholder="+8801700000000"
                  value={formData.billing_contact_phone}
                  onChange={(e) => setFormData({ ...formData, billing_contact_phone: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Committed CIR Bandwidth (Mbps) *
                </label>
                <Input
                  required
                  type="number"
                  min="1"
                  value={formData.committed_bandwidth_mbps}
                  onChange={(e) => setFormData({ ...formData, committed_bandwidth_mbps: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Base Monthly Contract Fee (৳) *
                </label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  value={formData.base_monthly_fee}
                  onChange={(e) => setFormData({ ...formData, base_monthly_fee: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Burst Rate per Mbps (৳) *
                </label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  value={formData.burst_rate_per_mbps}
                  onChange={(e) => setFormData({ ...formData, burst_rate_per_mbps: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  TIN / BIN Identifier
                </label>
                <Input
                  placeholder="e.g. 10023459812"
                  value={formData.bin_tin}
                  onChange={(e) => setFormData({ ...formData, bin_tin: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Payment Credit Terms (Days)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={formData.credit_terms_days}
                  onChange={(e) => setFormData({ ...formData, credit_terms_days: parseInt(e.target.value) || 30 })}
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground">
                Register Profile
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

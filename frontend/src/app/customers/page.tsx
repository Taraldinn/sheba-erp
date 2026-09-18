"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Users,
  Search,
  Plus,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Edit2,
  Loader2,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Customer, CustomerStatus, Package, Router } from "@/types";
import { ApiClient } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

function CustomersContent() {
  const searchParams = useSearchParams();
  const currentStatusParam = searchParams?.get("status") || "All";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Filters State
  const [selectedPackage, setSelectedPackage] = useState("All Packages");
  const [selectedZone, setSelectedZone] = useState("All Zones");
  const [selectedStatus, setSelectedStatus] = useState(currentStatusParam);
  const [prevStatusParam, setPrevStatusParam] = useState(currentStatusParam);

  if (prevStatusParam !== currentStatusParam) {
    setPrevStatusParam(currentStatusParam);
    setSelectedStatus(currentStatusParam);
  }

  // Modals & Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    mobile: "",
    email: "",
    address: "",
    area_zone: "",
    package: "",
    router: "",
    monthly_bill: "0",
    status: "Active",
  });
  const [rechargeCustomerTarget, setRechargeCustomerTarget] = useState<Customer | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState<string>("0");
  const [rechargeDays, setRechargeDays] = useState<string>("30");
  const [rechargeMethod, setRechargeMethod] = useState<string>("Cash");
  const [rechargeSubmitting, setRechargeSubmitting] = useState(false);

  // Delete Confirm Modal
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Notifications
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cData, pData, rData] = await Promise.all([
        ApiClient.getCustomers(),
        ApiClient.getPackages().catch(() => []),
        ApiClient.getRouters().catch(() => []),
      ]);
      setCustomers(cData);
      setPackages(pData);
      setRouters(rData);
    } catch (err: unknown) {
      console.error("Failed to load customer data:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to load customers from API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      ApiClient.getCustomers(),
      ApiClient.getPackages().catch(() => []),
      ApiClient.getRouters().catch(() => []),
    ])
      .then(([cData, pData, rData]) => {
        if (ignore) return;
        setCustomers(cData);
        setPackages(pData);
        setRouters(rData);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        console.error("Failed to load customer data:", err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Failed to load customers from API");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Distinct Filter options
  const uniqueZones = Array.from(new Set(customers.map((c) => c.area_zone))).filter(Boolean);

  // Remaining days calculation helper
  const getRemainingDays = (expiryDateStr: string | null) => {
    if (!expiryDateStr) return 0;
    const now = new Date();
    const expiry = new Date(expiryDateStr);
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Filtered dataset
  const filtered = customers.filter((c) => {
    const query = search.toLowerCase();
    const matchesSearch =
      search === "" ||
      (c.full_name && c.full_name.toLowerCase().includes(query)) ||
      (c.customer_code && c.customer_code.toLowerCase().includes(query)) ||
      (c.mobile && c.mobile.includes(query)) ||
      (c.pppoe_username && c.pppoe_username.toLowerCase().includes(query)) ||
      (c.address && c.address.toLowerCase().includes(query));

    let matchesStatus = true;
    if (selectedStatus !== "All" && selectedStatus !== "Any Status") {
      if (selectedStatus === "Due") {
        matchesStatus = Number(c.due_amount) > 0 || c.status === "Suspended";
      } else if (selectedStatus === "PromiseActive") {
        matchesStatus = c.status === "Active" && Boolean(c.promise_date);
      } else if (selectedStatus === "Free") {
        matchesStatus = Number(c.monthly_bill) === 0 || Number(c.discount) === 100;
      } else if (selectedStatus === "Inactive") {
        matchesStatus = c.status === "Suspended" || c.status === "Left" || c.status === "Expired";
      } else {
        matchesStatus = c.status === selectedStatus;
      }
    }

    const matchesPackage =
      selectedPackage === "All Packages" ||
      (c.package_name && c.package_name.includes(selectedPackage));

    const matchesZone = selectedZone === "All Zones" || c.area_zone === selectedZone;

    return matchesSearch && matchesStatus && matchesPackage && matchesZone;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filtered.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleInternet = async (customer: Customer) => {
    const isCurrentlyActive = customer.status === "Active";
    const nextState = isCurrentlyActive ? "off" : "on";
    const nextStatus: CustomerStatus = isCurrentlyActive ? "Suspended" : "Active";

    setCustomers((prev) =>
      prev.map((c) => (c.id === customer.id ? { ...c, status: nextStatus } : c))
    );

    try {
      await ApiClient.toggleInternet(customer.id, nextState);
      showNotification(`Internet service switched ${nextState.toUpperCase()} for ${customer.full_name}.`);
    } catch (err: unknown) {
      console.error("Toggle internet error:", err);
      showNotification(`Failed to toggle internet for ${customer.full_name}`);
      loadData();
    }
  };

  // Open Edit Customer Modal
  const handleOpenEdit = (customer: Customer) => {
    setEditCustomer(customer);
    setEditFormData({
      full_name: customer.full_name || "",
      mobile: customer.mobile || "",
      email: customer.email || "",
      address: customer.address || "",
      area_zone: customer.area_zone || "",
      package: customer.package ? String(customer.package) : "",
      router: customer.router ? String(customer.router) : "",
      monthly_bill: String(customer.monthly_bill || 0),
      status: customer.status || "Active",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustomer) return;

    try {
      const payload: Partial<Customer> = {
        full_name: editFormData.full_name,
        mobile: editFormData.mobile,
        email: editFormData.email || undefined,
        address: editFormData.address,
        area_zone: editFormData.area_zone,
        monthly_bill: Number(editFormData.monthly_bill),
        status: editFormData.status as CustomerStatus,
      };
      if (editFormData.package) payload.package = editFormData.package;
      if (editFormData.router) payload.router = editFormData.router;

      await ApiClient.updateCustomer(editCustomer.id, payload);
      showNotification(`Updated subscriber profile for ${editFormData.full_name}.`);
      setEditCustomer(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "Failed to update subscriber.");
    }
  };

  // Open Quick Recharge Modal
  const handleOpenRecharge = (customer: Customer) => {
    setRechargeCustomerTarget(customer);
    setRechargeAmount(String(customer.monthly_bill || 500));
    setRechargeDays("30");
    setRechargeMethod("Cash");
  };

  const handleExecuteRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rechargeCustomerTarget) return;

    setRechargeSubmitting(true);
    try {
      await ApiClient.rechargeCustomer(rechargeCustomerTarget.id, {
        amount: Number(rechargeAmount),
        validity_days: Number(rechargeDays),
        payment_method: rechargeMethod,
        notes: `Manual recharge via ISP console`,
      });
      showNotification(`Recharged Tk ${rechargeAmount} for ${rechargeCustomerTarget.full_name}.`);
      setRechargeCustomerTarget(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "Failed to execute recharge.");
    } finally {
      setRechargeSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await ApiClient.deleteCustomer(deleteTarget.id);
      showNotification(`Deleted subscriber ${deleteTarget.name}.`);
      setDeleteTarget(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || "Failed to delete subscriber.");
    }
  };

  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1500px] mx-auto text-xs">
      {/* 1. Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Subscriber Directory
              <Badge variant="outline" className="text-xs bg-card font-semibold">
                {filtered.length} of {customers.length}
              </Badge>
            </h1>
            <p className="text-muted-foreground text-[11px]">
              Active subscribers, PPPoE credentials, bandwidth packages, and operational actions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs gap-1.5 border-border bg-card cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/customers/new">
            <Button size="sm" className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer">
              <Plus className="h-3.5 w-3.5" />
              Add New Subscriber
            </Button>
          </Link>
        </div>
      </div>

      {/* Action Success Banner */}
      {actionSuccessMsg && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={loadData} className="h-7 text-xs border-destructive/30">
            Retry
          </Button>
        </div>
      )}

      {/* 2. Filter Bar */}
      <Card className="border-border bg-card shadow-xs">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name, code, phone, pppoe..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-muted/30"
              />
            </div>

            {/* Status Selector */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-8 rounded-md border border-input bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
              <option value="Expired">Expired</option>
              <option value="Due">Due / Outstanding</option>
              <option value="Inactive">Inactive</option>
            </select>

            {/* Package Selector */}
            <select
              value={selectedPackage}
              onChange={(e) => setSelectedPackage(e.target.value)}
              className="h-8 rounded-md border border-input bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="All Packages">All Packages</option>
              {packages.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Zone Selector */}
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="h-8 rounded-md border border-input bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="All Zones">All Zones</option>
              {uniqueZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* 3. Customer Table */}
      <Card className="border-border bg-card shadow-xs">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-bold text-[10px] tracking-wider">
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                  </th>
                  <th className="p-3">Subscriber</th>
                  <th className="p-3">Mobile & Address</th>
                  <th className="p-3">PPPoE Username</th>
                  <th className="p-3">Package / Rate</th>
                  <th className="p-3">Internet Status</th>
                  <th className="p-3">Account State</th>
                  <th className="p-3">Remaining</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && customers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                        <span>Loading subscribers from network database...</span>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      No subscribers found matching your search or filter parameters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const isOnline = c.status === "Active";
                    const remDays = getRemainingDays(c.expiry_date);

                    return (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds([...selectedIds, c.id]);
                              } else {
                                setSelectedIds(selectedIds.filter((id) => id !== c.id));
                              }
                            }}
                            className="h-3.5 w-3.5 rounded border-border"
                          />
                        </td>

                        {/* Subscriber Name & Code */}
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => setDetailCustomer(c)}
                            className="text-left group cursor-pointer"
                          >
                            <span className="font-bold text-foreground group-hover:text-indigo-500 transition-colors block">
                              {c.full_name}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {c.customer_code || "ID: " + c.id.slice(0, 8)}
                            </span>
                          </button>
                        </td>

                        {/* Mobile & Address */}
                        <td className="p-3">
                          <span className="font-mono text-foreground block">{c.mobile}</span>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[180px] block" title={c.address}>
                            {c.area_zone ? `${c.area_zone} • ` : ""}{c.address || "No address specified"}
                          </span>
                        </td>

                        {/* PPPoE Username */}
                        <td className="p-3 font-mono font-semibold text-indigo-500">
                          {c.pppoe_username || "—"}
                        </td>

                        {/* Package / Rate */}
                        <td className="p-3">
                          <span className="font-medium text-foreground block">
                            {c.package_name || "Standard Profile"}
                          </span>
                          <span className="text-[10px] text-emerald-500 font-semibold">
                            {formatCurrency(c.monthly_bill)}/mo
                          </span>
                        </td>

                        {/* Internet On/Off Toggle */}
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => handleToggleInternet(c)}
                            title={isOnline ? "Suspend Subscriber" : "Activate Subscriber"}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold transition-all border shadow-xs cursor-pointer ${
                              isOnline
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                                : "bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25"
                            }`}
                          >
                            {isOnline ? (
                              <>
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <Wifi className="h-3 w-3" />
                                <span>ON</span>
                              </>
                            ) : (
                              <>
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                <WifiOff className="h-3 w-3" />
                                <span>OFF</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* Account Status */}
                        <td className="p-3">
                          <StatusBadge status={c.status} />
                          {Number(c.due_amount) > 0 && (
                            <span className="block text-[10px] text-amber-500 font-bold mt-0.5">
                              Due: {formatCurrency(c.due_amount)}
                            </span>
                          )}
                        </td>

                        {/* Remaining Days */}
                        <td className="p-3 font-semibold">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                              remDays <= 0
                                ? "bg-rose-500/15 text-rose-500"
                                : remDays <= 3
                                ? "bg-amber-500/15 text-amber-500"
                                : "bg-emerald-500/15 text-emerald-500"
                            }`}
                          >
                            {remDays > 0 ? `${remDays} Days` : "Expired"}
                          </span>
                        </td>

                        {/* Action Buttons */}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenRecharge(c)}
                              className="h-7 px-2 text-[10px] text-indigo-500 hover:bg-indigo-500/10 font-bold"
                              title="Recharge subscriber balance"
                            >
                              Recharge
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDetailCustomer(c)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="View details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEdit(c)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="Edit subscriber"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteTarget({ id: c.id, name: c.full_name })}
                              className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-500/10"
                              title="Delete subscriber"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      {/* 4. Customer Details Modal (NO PPPOE PASSWORD SHOWN) */}
      <Dialog open={Boolean(detailCustomer)} onOpenChange={(open) => !open && setDetailCustomer(null)}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Subscriber Profile Details
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {detailCustomer?.customer_code || "Subscriber"} • {detailCustomer?.full_name}
                </DialogDescription>
              </div>
              <StatusBadge status={detailCustomer?.status} />
            </div>
          </DialogHeader>

          {detailCustomer && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border border-border">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Contact Phone</span>
                  <p className="font-mono font-semibold text-foreground mt-0.5">{detailCustomer.mobile}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Email Address</span>
                  <p className="text-foreground mt-0.5">{detailCustomer.email || "None"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Area Zone</span>
                  <p className="text-foreground mt-0.5">{detailCustomer.area_zone || "Default"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Physical Address</span>
                  <p className="text-foreground mt-0.5 truncate">{detailCustomer.address || "None"}</p>
                </div>
              </div>

              {/* Network Configuration */}
              <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-2">
                <span className="text-[10px] uppercase font-bold text-indigo-500">Network & PPPoE Credentials</span>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <span className="text-[10px] text-muted-foreground">PPPoE Username</span>
                    <p className="font-mono font-bold text-foreground">{detailCustomer.pppoe_username}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">PPPoE Password</span>
                    <p className="font-mono text-muted-foreground italic">•••••••• (Protected / Redacted)</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Target Router</span>
                    <p className="text-foreground">{detailCustomer.router_name || "Default Gateway"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Connection Type</span>
                    <p className="text-foreground">{detailCustomer.connection_type || "PPPoE"}</p>
                  </div>
                </div>
              </div>

              {/* Billing Info */}
              <div className="grid grid-cols-3 gap-2 text-center p-3 bg-muted/40 rounded-lg border border-border">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Monthly Bill</span>
                  <p className="text-base font-bold text-foreground mt-0.5">{formatCurrency(detailCustomer.monthly_bill)}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Due Balance</span>
                  <p className="text-base font-bold text-amber-500 mt-0.5">{formatCurrency(detailCustomer.due_amount)}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Advance Pool</span>
                  <p className="text-base font-bold text-emerald-500 mt-0.5">{formatCurrency(detailCustomer.advance_amount)}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailCustomer(null)}
              className="text-xs"
            >
              Close
            </Button>
            {detailCustomer && (
              <Button
                size="sm"
                onClick={() => {
                  const target = detailCustomer;
                  setDetailCustomer(null);
                  handleOpenRecharge(target);
                }}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                Recharge Account
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Edit Customer Modal */}
      <Dialog open={Boolean(editCustomer)} onOpenChange={(open) => !open && setEditCustomer(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Edit Subscriber Profile</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Modify account attributes and assigned network configurations.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
            <div>
              <label className="text-xs font-medium text-foreground">Full Name</label>
              <Input
                required
                value={editFormData.full_name}
                onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Mobile Phone</label>
                <Input
                  required
                  value={editFormData.mobile}
                  onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                  className="mt-1 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Email</label>
                <Input
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Package</label>
                <select
                  value={editFormData.package}
                  onChange={(e) => setEditFormData({ ...editFormData, package: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select Package</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.speed_mbps} Mbps)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Router Gateway</label>
                <select
                  value={editFormData.router}
                  onChange={(e) => setEditFormData({ ...editFormData, router: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select Router</option>
                  {routers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Monthly Bill (Tk)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editFormData.monthly_bill}
                  onChange={(e) => setEditFormData({ ...editFormData, monthly_bill: e.target.value })}
                  className="mt-1 text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Account Status</label>
                <select
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Expired">Expired</option>
                  <option value="Left">Left</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Physical Address</label>
              <Input
                value={editFormData.address}
                onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditCustomer(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 6. Quick Recharge Modal */}
      <Dialog open={Boolean(rechargeCustomerTarget)} onOpenChange={(open) => !open && setRechargeCustomerTarget(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Process Subscriber Recharge</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Add validity and post ledger transaction for {rechargeCustomerTarget?.full_name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleExecuteRecharge} className="space-y-3 text-xs">
            <div>
              <label className="text-xs font-medium text-foreground">Recharge Amount (Tk)</label>
              <Input
                type="number"
                required
                min="1"
                step="0.01"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                className="mt-1 text-xs font-bold text-foreground"
                disabled={rechargeSubmitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Validity Days</label>
                <Input
                  type="number"
                  required
                  min="1"
                  value={rechargeDays}
                  onChange={(e) => setRechargeDays(e.target.value)}
                  className="mt-1 text-xs"
                  disabled={rechargeSubmitting}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Payment Method</label>
                <select
                  value={rechargeMethod}
                  onChange={(e) => setRechargeMethod(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  disabled={rechargeSubmitting}
                >
                  <option value="Cash">Cash Counter</option>
                  <option value="bKash">bKash Manual</option>
                  <option value="Nagad">Nagad Manual</option>
                  <option value="Bank">Bank Deposit</option>
                </select>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rechargeSubmitting}
                onClick={() => setRechargeCustomerTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={rechargeSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {rechargeSubmitting ? "Executing Recharge..." : "Confirm Recharge"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 7. Delete Customer Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete Subscriber: ${deleteTarget?.name}?`}
        description="This will permanently delete this subscriber profile and terminate associated network bindings. This action cannot be undone."
        confirmLabel="Delete Subscriber"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          <span>Loading subscribers...</span>
        </div>
      }
    >
      <CustomersContent />
    </Suspense>
  );
}

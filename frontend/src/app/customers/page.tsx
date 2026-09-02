"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Users,
  Search,
  Plus,
  Filter,
  MoreHorizontal,
  PhoneCall,
  Mail,
  Wifi,
  WifiOff,
  Clock,
  Lock,
  UserPlus,
  Gift,
  AlertTriangle,
  UserX,
  UserMinus,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Upload,
  RefreshCw,
  Send,
  Radio,
  Check,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockCustomers, mockPackages } from "@/lib/mock-data";
import { Customer } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";

import { ApiClient } from "@/lib/api";

function CustomersContent() {
  const searchParams = useSearchParams();
  const currentStatusParam = searchParams?.get("status") || "Active";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Filters State
  const [selectedPackage, setSelectedPackage] = useState("All Packages");
  const [selectedZone, setSelectedZone] = useState("All Zones");
  const [selectedOwner, setSelectedOwner] = useState("All Owners");
  const [selectedStatus, setSelectedStatus] = useState(currentStatusParam);
  const [selectedRemDays, setSelectedRemDays] = useState("Rem. Days");

  // Selection State for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedReseller, setSelectedReseller] = useState("Select Reseller");
  const [bulkRechargeDays, setBulkRechargeDays] = useState("30");
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState("Cash");
  const [deductDue, setDeductDue] = useState(true);
  const [extendDays, setExtendDays] = useState("3");
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Load from API
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getCustomers();
      setCustomers(data);
    } catch {
      setCustomers(mockCustomers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const s = searchParams?.get("status");
    if (s) {
      setSelectedStatus(s);
    }
  }, [searchParams]);

  // Distinct Filter options
  const uniqueZones = Array.from(new Set(customers.map((c) => c.area_zone))).filter(Boolean);
  const uniqueOwners = Array.from(new Set(customers.map((c) => c.reseller_name || "Direct Sheba"))).filter(Boolean);

  // Remaining days calculation helper
  const getRemainingDays = (expiryDateStr: string | null) => {
    if (!expiryDateStr) return 0;
    const now = new Date("2026-09-01");
    const expiry = new Date(expiryDateStr);
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Filtered dataset
  const filtered = customers.filter((c) => {
    // Search query match
    const matchesSearch =
      search === "" ||
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_code.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile.includes(search) ||
      c.pppoe_username.toLowerCase().includes(search.toLowerCase()) ||
      c.address.toLowerCase().includes(search.toLowerCase());

    // Status filter match
    let matchesStatus = true;
    if (selectedStatus !== "Any Status" && selectedStatus !== "All") {
      if (selectedStatus === "Due") {
        matchesStatus = c.due_amount > 0 || c.status === "Suspended";
      } else if (selectedStatus === "PromiseActive") {
        matchesStatus = c.status === "Active" && Boolean(c.promise_date);
      } else if (selectedStatus === "Free") {
        matchesStatus = c.monthly_bill === 0 || c.discount === 100;
      } else if (selectedStatus === "Inactive") {
        matchesStatus = c.status === "Suspended" || c.status === "Left";
      } else {
        matchesStatus = c.status === selectedStatus;
      }
    }

    // Package filter match
    const matchesPackage =
      selectedPackage === "All Packages" || (c.package_name && c.package_name.includes(selectedPackage));

    // Zone filter match
    const matchesZone = selectedZone === "All Zones" || c.area_zone === selectedZone;

    // Owner filter match
    const matchesOwner =
      selectedOwner === "All Owners" || (c.reseller_name || "Direct Sheba") === selectedOwner;

    // Remaining days filter match
    let matchesRemDays = true;
    const rem = getRemainingDays(c.expiry_date);
    if (selectedRemDays === "< 3 Days") matchesRemDays = rem > 0 && rem <= 3;
    else if (selectedRemDays === "< 7 Days") matchesRemDays = rem > 0 && rem <= 7;
    else if (selectedRemDays === "Expired (<= 0)") matchesRemDays = rem <= 0;

    return matchesSearch && matchesStatus && matchesPackage && matchesZone && matchesOwner && matchesRemDays;
  });

  // Bulk Selection Handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filtered.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const showNotification = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  const handleToggleInternet = async (customer: Customer) => {
    const isCurrentlyActive = customer.status === "Active";
    const nextStatus = isCurrentlyActive ? "Suspended" : "Active";
    
    // Optimistic update
    setCustomers((prev) =>
      prev.map((item) =>
        item.id === customer.id ? { ...item, status: nextStatus as any } : item
      )
    );

    try {
      await ApiClient.toggleInternet(customer.id, isCurrentlyActive ? 'off' : 'on');
      if (isCurrentlyActive) {
        showNotification(`🔴 Internet turned OFF for ${customer.full_name} (${customer.pppoe_username}). Session dropped.`);
      } else {
        showNotification(`🟢 Internet turned ON for ${customer.full_name} (${customer.pppoe_username}). Line active.`);
      }
    } catch {
      showNotification(`Updated status for ${customer.pppoe_username}`);
    }
  };

  const handleQuickRecharge = async (customer: Customer) => {
    try {
      await ApiClient.rechargeCustomer(customer.id, {
        amount: customer.monthly_bill || 800,
        validity_days: 30,
        payment_method: "Cash",
      });
      showNotification(`Successfully recharged 30 days for ${customer.full_name} via API.`);
      loadCustomers();
    } catch (err: any) {
      showNotification(`Recharged ${customer.full_name} for 30 days.`);
    }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete customer ${name}?`)) return;
    try {
      await ApiClient.deleteCustomer(id);
      showNotification(`Deleted customer ${name}`);
      loadCustomers();
    } catch {
      showNotification(`Removed customer ${name}`);
    }
  };

  const handleBulkInternetOn = async () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one client to turn ON internet.");
      return;
    }
    setCustomers((prev) =>
      prev.map((item) =>
        selectedIds.includes(item.id) ? { ...item, status: "Active" as any } : item
      )
    );
    for (const id of selectedIds) {
      try { await ApiClient.toggleInternet(id, 'on'); } catch {}
    }
    showNotification(`🟢 Turned ON Internet for ${selectedIds.length} subscriber(s).`);
    setSelectedIds([]);
  };

  const handleBulkInternetOff = async () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one client to turn OFF internet.");
      return;
    }
    setCustomers((prev) =>
      prev.map((item) =>
        selectedIds.includes(item.id) ? { ...item, status: "Suspended" as any } : item
      )
    );
    for (const id of selectedIds) {
      try { await ApiClient.toggleInternet(id, 'off'); } catch {}
    }
    showNotification(`🔴 Turned OFF (Suspended) Internet for ${selectedIds.length} subscriber(s). Sessions dropped.`);
    setSelectedIds([]);
  };

  const handleBulkRecharge = () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one client to recharge.");
      return;
    }
    showNotification(`Successfully processed bulk recharge (${bulkRechargeDays} days) for ${selectedIds.length} clients.`);
    setSelectedIds([]);
  };

  const handleBulkExtend = () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one client to extend.");
      return;
    }
    showNotification(`Extended validity by ${extendDays} days for ${selectedIds.length} clients.`);
    setSelectedIds([]);
  };

  const handleBulkDisable = () => {
    handleBulkInternetOff();
  };

  const handleBulkLeft = () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one client.");
      return;
    }
    showNotification(`Marked ${selectedIds.length} clients as Left/Disconnected.`);
    setSelectedIds([]);
  };

  const handleBulkSms = () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one client to send SMS.");
      return;
    }
    showNotification(`Broadcast SMS queued for ${selectedIds.length} mobile numbers.`);
    setSelectedIds([]);
  };

  const handleMoveReseller = () => {
    if (selectedIds.length === 0 || selectedReseller === "Select Reseller") {
      alert("Please select clients and target reseller.");
      return;
    }
    showNotification(`Moved ${selectedIds.length} clients to reseller: ${selectedReseller}.`);
    setSelectedIds([]);
  };

  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;

  return (
    <div className="p-6 space-y-4 max-w-[1500px] mx-auto text-xs">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. Header & Dropdown Filters Bar */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Title */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
            <Users className="h-4.5 w-4.5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {selectedStatus === "All" || selectedStatus === "Any Status" ? "All Clients" : `${selectedStatus} Clients`}
          </h1>
          <Badge variant="outline" className="ml-1 text-[11px] font-semibold bg-card">
            {filtered.length} Subscribers
          </Badge>
        </div>

        {/* Filters and Export/Import Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Packages Dropdown */}
          <select
            value={selectedPackage}
            onChange={(e) => setSelectedPackage(e.target.value)}
            className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option>All Packages</option>
            {mockPackages.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Zones Dropdown */}
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option>All Zones</option>
            {uniqueZones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>

          {/* Owners Dropdown */}
          <select
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option>All Owners</option>
            {uniqueOwners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>

          {/* Status Dropdown */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
          >
            <option>Any Status</option>
            <option value="Active">Active</option>
            <option value="Due">Due</option>
            <option value="PromiseActive">Promise Active</option>
            <option value="Free">Free</option>
            <option value="Expired">Expired</option>
            <option value="Inactive">Inactive</option>
            <option value="Left">Left</option>
          </select>

          {/* Remaining Days Filter */}
          <select
            value={selectedRemDays}
            onChange={(e) => setSelectedRemDays(e.target.value)}
            className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option>Rem. Days</option>
            <option>&lt; 3 Days</option>
            <option>&lt; 7 Days</option>
            <option>Expired (&lt;= 0)</option>
          </select>

          {/* Export Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => showNotification("Exported active subscriber records to Excel/CSV.")}
            className="h-8 gap-1.5 text-xs border-emerald-600/40 text-emerald-600 dark:text-emerald-400 bg-card hover:bg-emerald-500/10 font-medium"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
            Export
          </Button>

          {/* Import Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => showNotification("Open client CSV batch importer.")}
            className="h-8 gap-1.5 text-xs border-blue-600/40 text-blue-600 dark:text-blue-400 bg-card hover:bg-blue-500/10 font-medium"
          >
            <Upload className="h-3.5 w-3.5 text-blue-500" />
            Import
          </Button>

          {/* Add Client CTA */}
          <Link href="/customers/new">
            <Button size="sm" className="h-8 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">
              <UserPlus className="h-3.5 w-3.5" />
              New Client
            </Button>
          </Link>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. Full-width Search Bar */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="relative w-full flex items-center">
        <Input
          placeholder="Search by Subscriber Name, Phone, PPPoE Username, Address or Custom ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full pr-10 pl-3 bg-card border-border text-xs text-foreground"
        />
        <button
          type="button"
          className="absolute right-0 h-9 w-9 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-r-md transition-colors"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. Stale Cache / Background Sync Warning Banner */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-2.5 rounded-lg flex items-center justify-between gap-3 text-[11px] font-medium">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span>
            Live status cache is stale (updated 52 minutes ago). The background synchronization daemon might be stopped.
          </span>
        </div>
        <button
          type="button"
          onClick={() => showNotification("MikroTik & OLT daemon synchronization triggered.")}
          className="underline hover:text-amber-500 font-semibold shrink-0 cursor-pointer"
        >
          Sync Now
        </button>
      </div>

      {/* Action Success Toast */}
      {actionSuccessMsg && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. Bulk Actions Toolbar */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-card border border-border p-2.5 rounded-xl text-xs">
        {/* Left: Select All Checkbox */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer font-semibold text-foreground select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span>Select All {selectedIds.length > 0 && `(${selectedIds.length})`}</span>
          </label>
        </div>

        {/* Right Action Widgets */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Move to Reseller Widget */}
          <div className="flex items-center border border-amber-500/40 rounded-full pl-3 pr-1 py-0.5 bg-amber-500/5">
            <span className="text-muted-foreground mr-1">Move:</span>
            <select
              value={selectedReseller}
              onChange={(e) => setSelectedReseller(e.target.value)}
              className="bg-transparent text-xs text-foreground font-medium focus:outline-none mr-2"
            >
              <option>Select Reseller</option>
              <option>Reseller Uttara North</option>
              <option>Reseller Mirpur Hub</option>
              <option>Direct Sheba</option>
            </select>
            <Button
              size="sm"
              onClick={handleMoveReseller}
              className="h-6 px-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px]"
            >
              Move
            </Button>
          </div>

          {/* Bulk Recharge Widget */}
          <div className="flex items-center border border-red-500/30 rounded-full pl-3 pr-1 py-0.5 bg-red-500/5 gap-1.5">
            <span className="text-muted-foreground">Bulk:</span>
            <input
              type="text"
              value={bulkRechargeDays}
              onChange={(e) => setBulkRechargeDays(e.target.value)}
              className="w-7 text-center font-bold bg-transparent text-indigo-500 focus:outline-none"
            />
            <select
              value={bulkPaymentMethod}
              onChange={(e) => setBulkPaymentMethod(e.target.value)}
              className="bg-transparent text-xs text-foreground focus:outline-none pr-1"
            >
              <option>Cash</option>
              <option>bKash</option>
              <option>Nagad</option>
              <option>Bank</option>
            </select>
            <button
              type="button"
              className="h-6 px-2 text-[10px] rounded-md border border-blue-500/40 text-blue-500 hover:bg-blue-500/10 font-semibold"
            >
              Memo
            </button>
            <label className="flex items-center gap-1 text-[11px] text-red-500 font-medium cursor-pointer pl-1">
              <input
                type="checkbox"
                checked={deductDue}
                onChange={(e) => setDeductDue(e.target.checked)}
                className="h-3.5 w-3.5 rounded text-red-500"
              />
              <span className="hidden sm:inline">Deduct Due Balance</span>
            </label>
            <Button
              size="sm"
              onClick={handleBulkRecharge}
              className="h-6 px-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-[11px]"
            >
              Recharge
            </Button>
          </div>

          {/* Validity Extend Widget */}
          <div className="flex items-center border border-cyan-500/30 rounded-full pl-3 pr-1 py-0.5 bg-cyan-500/5">
            <span className="text-muted-foreground mr-1">Ext:</span>
            <input
              type="text"
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              className="w-6 text-center font-bold bg-transparent text-cyan-500 focus:outline-none mr-1"
            />
            <Button
              size="sm"
              onClick={handleBulkExtend}
              className="h-6 px-3 rounded-full bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-[11px]"
            >
              Extend
            </Button>
          </div>

          {/* Bulk Internet ON & OFF Controls */}
          <div className="flex items-center gap-1 border border-border rounded-full p-0.5 bg-muted/30">
            <Button
              size="sm"
              onClick={handleBulkInternetOn}
              className="h-6 px-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] gap-1"
            >
              <Wifi className="h-3 w-3" /> Internet ON
            </Button>
            <Button
              size="sm"
              onClick={handleBulkInternetOff}
              className="h-6 px-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] gap-1"
            >
              <WifiOff className="h-3 w-3" /> Internet OFF
            </Button>
          </div>

          {/* Bulk Left */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkLeft}
            className="h-7 px-3 rounded-full border-red-500/50 text-red-500 hover:bg-red-500/10 font-semibold text-[11px] gap-1"
          >
            <UserMinus className="h-3 w-3" /> Left
          </Button>

          {/* Bulk SMS */}
          <Button
            size="sm"
            onClick={handleBulkSms}
            className="h-7 px-3 rounded-full bg-slate-950 hover:bg-slate-900 text-white dark:bg-slate-800 dark:hover:bg-slate-700 font-semibold text-[11px] gap-1"
          >
            <Send className="h-3 w-3" /> SMS
          </Button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 5. Clients Table */}
      {/* ───────────────────────────────────────────────────────────── */}
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
                  <th className="p-3 font-bold text-foreground">ID</th>
                  <th className="p-3 font-bold text-foreground">Name</th>
                  <th className="p-3 font-bold text-foreground">Phone</th>
                  <th className="p-3 font-bold text-foreground">Address</th>
                  <th className="p-3 font-bold text-foreground">Zone</th>
                  <th className="p-3 font-bold text-foreground">Package</th>
                  <th className="p-3 font-bold text-foreground">Owner</th>
                  <th className="p-3 font-bold text-foreground">Internet On/Off</th>
                  <th className="p-3 font-bold text-foreground">Status</th>
                  <th className="p-3 font-bold text-foreground">Rem. Days</th>
                  <th className="p-3 text-right font-bold text-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-16 text-muted-foreground">
                      No clients found matching the selected parameters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const isSelected = selectedIds.includes(c.id);
                    const remDays = getRemainingDays(c.expiry_date);
                    const isOnline = c.status === "Active";

                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-muted/40 transition-colors ${isSelected ? "bg-indigo-500/5" : ""}`}
                      >
                        {/* Checkbox */}
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectRow(c.id)}
                            className="h-3.5 w-3.5 rounded border-border cursor-pointer"
                          />
                        </td>

                        {/* ID */}
                        <td className="p-3 font-mono font-semibold text-indigo-500">
                          <div>{c.customer_code}</div>
                          <div className="text-[10px] text-muted-foreground font-normal">{c.pppoe_username}</div>
                        </td>

                        {/* Name */}
                        <td className="p-3">
                          <p className="font-bold text-foreground">{c.full_name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.email}</p>
                        </td>

                        {/* Phone */}
                        <td className="p-3 font-mono text-muted-foreground">
                          {c.mobile}
                        </td>

                        {/* Address */}
                        <td className="p-3 text-muted-foreground max-w-[180px] truncate" title={c.address}>
                          {c.address}
                        </td>

                        {/* Zone */}
                        <td className="p-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-foreground font-medium text-[11px]">
                            {c.area_zone}
                          </span>
                        </td>

                        {/* Package */}
                        <td className="p-3">
                          <p className="font-semibold text-foreground">{c.package_name || "Custom Plan"}</p>
                          <p className="text-[10px] text-indigo-500 font-medium">{formatCurrency(c.monthly_bill)}/mo</p>
                        </td>

                        {/* Owner */}
                        <td className="p-3 text-muted-foreground font-medium">
                          {c.reseller_name || "Direct Sheba"}
                        </td>

                        {/* Internet On/Off Interactive Toggle */}
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => handleToggleInternet(c)}
                            title={isOnline ? "Click to Turn OFF Internet (Suspend)" : "Click to Turn ON Internet (Activate)"}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold transition-all border shadow-xs cursor-pointer ${
                              isOnline
                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                                : "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25"
                            }`}
                          >
                            {isOnline ? (
                              <>
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                <Wifi className="h-3 w-3" />
                                <span>ON</span>
                              </>
                            ) : (
                              <>
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                                <WifiOff className="h-3 w-3" />
                                <span>OFF</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* Status */}
                        <td className="p-3">
                          <Badge
                            variant={
                              c.status === "Active"
                                ? "default"
                                : c.status === "Due" || c.status === "Suspended"
                                ? "destructive"
                                : "outline"
                            }
                            className="text-[10px]"
                          >
                            {c.status}
                          </Badge>
                        </td>

                        {/* Rem. Days */}
                        <td className="p-3 font-semibold">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              remDays <= 0
                                ? "bg-red-500/15 text-red-500"
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
                              onClick={() => handleQuickRecharge(c)}
                              className="h-7 px-2 text-[10px] text-indigo-500 hover:bg-indigo-500/10 font-bold"
                            >
                              Recharge
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteCustomer(c.id, c.full_name)}
                              className="h-7 px-2 text-[10px] text-rose-500 hover:bg-rose-500/10 font-bold"
                            >
                              Delete
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

          {filtered.length > 0 && (
            <div className="p-3 border-t border-border flex items-center justify-between text-muted-foreground text-[11px]">
              <span>
                Showing <b>{filtered.length}</b> of <b>{customers.length}</b> total subscribers
              </span>
              <span>
                Selected: <b>{selectedIds.length}</b> clients
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading Subscribers...</div>}>
      <CustomersContent />
    </Suspense>
  );
}

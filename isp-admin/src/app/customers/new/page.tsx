"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Network,
  User,
  Save,
  Loader2,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";
import { Customer, Package, Router } from "@/types";
import { WelcomeCredentialsCard } from "@/components/customers/WelcomeCredentialsCard";

export default function AddNewClientPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<Package[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdCustomer, setCreatedCustomer] = useState<Customer | null>(null);

  // Form States
  const [formData, setFormData] = useState({
    // Client Identity
    full_name: "",
    mobile: "",
    email: "",
    national_id: "",
    customer_code: "",
    address: "",
    area_zone: "Default",

    // Network & PPPoE
    connection_type: "PPPoE" as "PPPoE" | "Static_IP" | "DHCP",
    pppoe_username: "",
    pppoe_password: "",
    router: "",

    // Package & Billing
    package: "",
    billing_type: "Prepaid" as "Prepaid" | "Postpaid",
    monthly_bill: "0.00",
    discount: "0.00",
    remarks: "",
  });

  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [pkgs, rtrs] = await Promise.all([
          ApiClient.getPackages(),
          ApiClient.getRouters(),
        ]);
        setPackages(pkgs.filter((p) => p.is_active));
        setRouters(rtrs);

        if (pkgs.length > 0) {
          const firstPkg = pkgs[0];
          setFormData((prev) => ({
            ...prev,
            package: firstPkg.id,
            monthly_bill: String(firstPkg.regular_price),
            router: rtrs.length > 0 ? rtrs[0].id : "",
          }));
        } else if (rtrs.length > 0) {
          setFormData((prev) => ({
            ...prev,
            router: rtrs[0].id,
          }));
        }
      } catch (err) {
        console.error("Failed to load packages/routers for customer creation:", err);
      } finally {
        setLoadingInitial(false);
      }
    }
    loadDropdowns();
  }, []);

  const handlePackageChange = (pkgId: string) => {
    const selectedPkg = packages.find((p) => p.id === pkgId);
    const regularPrice = selectedPkg ? Number(selectedPkg.regular_price) : 0;
    const discountVal = Number(formData.discount) || 0;
    const finalAmount = Math.max(0, regularPrice - discountVal);

    setFormData((prev) => ({
      ...prev,
      package: pkgId,
      monthly_bill: finalAmount.toFixed(2),
    }));
  };

  const handleDiscountChange = (discountStr: string) => {
    const discountVal = Number(discountStr) || 0;
    const selectedPkg = packages.find((p) => p.id === formData.package);
    const regularPrice = selectedPkg ? Number(selectedPkg.regular_price) : 0;
    const finalAmount = Math.max(0, regularPrice - discountVal);

    setFormData((prev) => ({
      ...prev,
      discount: discountStr,
      monthly_bill: finalAmount.toFixed(2),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.full_name.trim()) {
      setErrorMsg("Subscriber full name is required.");
      return;
    }
    if (!formData.mobile.trim()) {
      setErrorMsg("Primary mobile phone number is required.");
      return;
    }
    if (!formData.pppoe_username.trim()) {
      setErrorMsg("PPPoE username is required for subscriber network authentication.");
      return;
    }

    setSubmitting(true);

    try {
      const payload: Partial<Customer> & Record<string, unknown> = {
        full_name: formData.full_name.trim(),
        mobile: formData.mobile.trim(),
        email: formData.email.trim() || undefined,
        national_id: formData.national_id.trim() || undefined,
        address: formData.address.trim() || undefined,
        area_zone: formData.area_zone.trim() || "Default",
        connection_type: formData.connection_type,
        pppoe_username: formData.pppoe_username.trim(),
        billing_type: formData.billing_type,
        monthly_bill: Number(formData.monthly_bill),
        discount: Number(formData.discount || 0),
        remarks: formData.remarks.trim() || undefined,
      };

      if (formData.pppoe_password) {
        payload.pppoe_password = formData.pppoe_password;
      }
      if (formData.customer_code.trim()) {
        payload.customer_code = formData.customer_code.trim();
      }
      if (formData.package) {
        payload.package = formData.package;
      }
      if (formData.router) {
        payload.router = formData.router;
      }

      const created = await ApiClient.createCustomer(payload as Partial<Customer>);
      setCreatedCustomer(created);
      setSuccess(true);
      // Give the operator a longer read-window than the old 1.2s —
      // they need to copy the auto-issued password before the
      // redirect fires. The button below lets them dismiss manually.
      setTimeout(() => {
        router.push("/customers");
      }, 12000);
    } catch (err: unknown) {
      console.error("Customer creation error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || "Failed to create subscriber. Please review the form inputs.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto text-xs">
      {/* Top Banner Header */}
      <div className="bg-indigo-700 text-white rounded-xl p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <Link href="/customers" className="hover:opacity-80 transition-opacity">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <UserPlus className="h-5 w-5" />
          <h1 className="text-base lg:text-lg font-bold tracking-tight">
            Register New Broadband Subscriber
          </h1>
        </div>
        {success && (
          <div className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-800 px-3 py-1 rounded-md">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Customer Created Successfully!
          </div>
        )}
      </div>

      {/* Error alert banner */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-xs">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Auto-issued portal credentials (only after a successful create).
          The plain-text password is rendered ONCE here — operators
          should read it off to the customer before navigating away. */}
      {success && createdCustomer && (
        <WelcomeCredentialsCard
          customerId={createdCustomer.id}
          initialWelcome={createdCustomer.welcome}
          customerName={createdCustomer.full_name}
          freshIssue
          onResend={(next) =>
            setCreatedCustomer({ ...createdCustomer, welcome: next })
          }
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6" hidden={success}>
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-6 space-y-6">
            {/* Section 1: Customer Identity */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 flex items-center gap-1.5">
                <User className="h-4 w-4 text-indigo-500" />
                Subscriber Identity
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-foreground">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. Tanvir Ahmed"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="mt-1 text-xs"
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">
                    Mobile Number <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. 01711223344"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="mt-1 text-xs font-mono"
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">Email Address</label>
                  <Input
                    type="email"
                    placeholder="e.g. tanvir@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 text-xs"
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">National ID / Passport</label>
                  <Input
                    placeholder="e.g. 198926925810001"
                    value={formData.national_id}
                    onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
                    className="mt-1 text-xs font-mono"
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">Customer Code (Optional)</label>
                  <Input
                    placeholder="Auto-generated if empty (e.g. CUST-001)"
                    value={formData.customer_code}
                    onChange={(e) => setFormData({ ...formData, customer_code: e.target.value })}
                    className="mt-1 text-xs font-mono"
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">Area / Zone</label>
                  <Input
                    placeholder="e.g. Sector-4, Uttara"
                    value={formData.area_zone}
                    onChange={(e) => setFormData({ ...formData, area_zone: e.target.value })}
                    className="mt-1 text-xs"
                    disabled={submitting}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-foreground">Physical Address</label>
                  <Input
                    placeholder="House, Road, Apartment, Thana, District"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="mt-1 text-xs"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Network & PPPoE Configuration */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 flex items-center gap-1.5">
                <Network className="h-4 w-4 text-emerald-500" />
                Network & Gateway Configuration
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-foreground">Connection Type</label>
                  <select
                    value={formData.connection_type}
                    onChange={(e) => setFormData({ ...formData, connection_type: e.target.value as "PPPoE" | "Static_IP" | "DHCP" })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    disabled={submitting}
                  >
                    <option value="PPPoE">PPPoE (Point-to-Point over Ethernet)</option>
                    <option value="Static_IP">Static IP (Dedicated Allocation)</option>
                    <option value="DHCP">DHCP / IPoE</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">Target Network Router</label>
                  <select
                    value={formData.router}
                    onChange={(e) => setFormData({ ...formData, router: e.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    disabled={submitting || routers.length === 0}
                  >
                    {routers.length === 0 ? (
                      <option value="">No routers available</option>
                    ) : (
                      routers.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.ip_address})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">
                    PPPoE Username <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. tanvir_home"
                    value={formData.pppoe_username}
                    onChange={(e) => setFormData({ ...formData, pppoe_username: e.target.value })}
                    className="mt-1 text-xs font-mono"
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">
                    PPPoE Password (Masked)
                  </label>
                  <Input
                    type="password"
                    placeholder="Enter secret password"
                    value={formData.pppoe_password}
                    onChange={(e) => setFormData({ ...formData, pppoe_password: e.target.value })}
                    className="mt-1 text-xs"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Package & Billing Setup */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-indigo-500" />
                Package & Billing Plan
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-foreground">Internet Package</label>
                  <select
                    value={formData.package}
                    onChange={(e) => handlePackageChange(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    disabled={submitting || packages.length === 0}
                  >
                    {packages.length === 0 ? (
                      <option value="">No packages available</option>
                    ) : (
                      packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.speed_mbps} Mbps - Tk {p.regular_price})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">Billing Type</label>
                  <select
                    value={formData.billing_type}
                    onChange={(e) => setFormData({ ...formData, billing_type: e.target.value as "Prepaid" | "Postpaid" })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    disabled={submitting}
                  >
                    <option value="Prepaid">Prepaid (Payment Before Service)</option>
                    <option value="Postpaid">Postpaid (Monthly Invoicing)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">Special Discount (Tk)</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={formData.discount}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    className="mt-1 text-xs"
                    disabled={submitting}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-foreground">Monthly Bill Payable (Tk)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.monthly_bill}
                    onChange={(e) => setFormData({ ...formData, monthly_bill: e.target.value })}
                    className="mt-1 text-xs font-bold text-foreground"
                    disabled={submitting}
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="text-xs font-medium text-foreground">Remarks / Installation Note</label>
                  <Input
                    placeholder="Optional note"
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="mt-1 text-xs"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            {/* Submission Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Link href="/customers">
                <Button variant="outline" size="sm" type="button" disabled={submitting}>
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || loadingInitial}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registering Subscriber...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Register Subscriber
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {success && createdCustomer && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSuccess(false);
              setCreatedCustomer(null);
              // Reset just enough state for a fresh entry.
              setFormData((prev) => ({
                ...prev,
                full_name: '',
                mobile: '',
                pppoe_username: '',
                email: '',
                national_id: '',
                address: '',
                customer_code: '',
                remarks: '',
              }));
              // Scroll back to the top so the operator sees the form.
              if (typeof window !== 'undefined') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="gap-1.5 cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add Another Subscriber
          </Button>
          <Link href="/customers">
            <Button
              type="button"
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 cursor-pointer"
            >
              Go to Subscribers <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

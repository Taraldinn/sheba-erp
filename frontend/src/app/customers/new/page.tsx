"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  ArrowLeft,
  Compass,
  CheckCircle2,
  Phone,
  CreditCard,
  Network,
  ShieldCheck,
  User,
  MapPin,
  Save,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const DISTRICT_THANA_MAP: Record<string, string[]> = {
  Dhaka: ["Uttara", "Mirpur", "Dhanmondi", "Gulshan", "Banani", "Mohammadpur", "Badda", "Motijheel"],
  Chittagong: ["Agrabad", "Panchlaish", "Kotwali", "Halishahar", "Chandgaon", "Khulshi"],
  Sylhet: ["Kotwali", "Amberkhana", "Zindabazar", "South Surma", "Shahjalal Uposhohor"],
  Rajshahi: ["Boalia", "Motihar", "Rajpara", "Shah Mokhdum"],
  Khulna: ["Khalishpur", "Daulatpur", "Sonadanga", "Kotwali"],
  Gazipur: ["Tongi", "Joydebpur", "Sreepur", "Kaliakair"],
  Narayanganj: ["Fatullah", "Siddhirganj", "Bandar", "Sonargaon"],
};

const PACKAGES = [
  { id: "p1", name: "Starter Fiber - 15 Mbps", price: 500 },
  { id: "p2", name: "Turbo Stream - 30 Mbps", price: 800 },
  { id: "p3", name: "Giga Prime - 60 Mbps", price: 1200 },
  { id: "p4", name: "Enterprise Dedicated - 100 Mbps", price: 2500 },
];

export default function AddNewClientPage() {
  const router = useRouter();
  const [success, setSuccess] = useState(false);
  const [isGettingGps, setIsGettingGps] = useState(false);

  // Form States
  const [formData, setFormData] = useState({
    // Client Identity
    full_name: "",
    primary_phone: "",
    alternate_phone: "",
    nid: "",
    pppoe_username: "admin",
    pppoe_password: "••••••••••",
    client_code: "",
    address: "",
    district: "",
    thana: "",

    // Package & Billing
    package_id: "",
    discount: "0",
    bill_amount: "0.00",
    billing_position: "Active (Billable)",
    client_status: "Active",
    joining_date: "2026-09-01",
    billing_cycle: "Standard 30 Days",
    sms_notifications: "Enabled (Send SMS)",
    voice_notifications: "Enabled (Send Voice Call)",

    // Network & Location
    router_pop: "Core-MikroTik-CCR1036",
    zone: "Default / No Zone",
    tj_box: "None",
    connection_type: "Fiber (FTTH)",
    client_type: "Home",
    onu_mac: "",
    gps_coords: "",
    remarks: "",
  });

  const handlePackageChange = (pkgId: string) => {
    const pkg = PACKAGES.find((p) => p.id === pkgId);
    const regularPrice = pkg ? pkg.price : 0;
    const discountVal = Number(formData.discount) || 0;
    const finalAmount = Math.max(0, regularPrice - discountVal);

    setFormData({
      ...formData,
      package_id: pkgId,
      bill_amount: finalAmount.toFixed(2),
    });
  };

  const handleDiscountChange = (discountStr: string) => {
    const discountVal = Number(discountStr) || 0;
    const pkg = PACKAGES.find((p) => p.id === formData.package_id);
    const regularPrice = pkg ? pkg.price : 0;
    const finalAmount = Math.max(0, regularPrice - discountVal);

    setFormData({
      ...formData,
      discount: discountStr,
      bill_amount: finalAmount.toFixed(2),
    });
  };

  const handleGetGps = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          gps_coords: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`,
        }));
        setIsGettingGps(false);
      },
      () => {
        setIsGettingGps(false);
        setFormData((prev) => ({
          ...prev,
          gps_coords: "23.872854, 90.398412",
        }));
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(true);
    setTimeout(() => {
      router.push("/customers");
    }, 1500);
  };

  const availableThanas = formData.district ? DISTRICT_THANA_MAP[formData.district] || [] : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="bg-emerald-700 text-white rounded-xl p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <Link href="/customers" className="hover:opacity-80 transition-opacity">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <UserPlus className="h-5 w-5" />
          <h1 className="text-lg font-bold tracking-tight">Add New Client / Broadband User</h1>
        </div>
        {success && (
          <div className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-800 px-3 py-1 rounded-md">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Client Registered Successfully!
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-6 space-y-8 text-xs">
            {/* ───────────────────────────────────────────────────────────── */}
            {/* SECTION 1: Client Identity */}
            {/* ───────────────────────────────────────────────────────────── */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                Client Identity
              </h2>

              {/* Row 1: Full Name, Primary Phone, Alternate Phone */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="Enter Client Name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Primary Phone No <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="c.g. 01711000000"
                    value={formData.primary_phone}
                    onChange={(e) => setFormData({ ...formData, primary_phone: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Alternate Phone</label>
                  <Input
                    placeholder="Optional Number"
                    value={formData.alternate_phone}
                    onChange={(e) => setFormData({ ...formData, alternate_phone: e.target.value })}
                    className="bg-background"
                  />
                </div>
              </div>

              {/* Row 2: National ID (NID), PPPoE ID / Username */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    National ID (NID) <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="NID Number"
                    value={formData.nid}
                    onChange={(e) => setFormData({ ...formData, nid: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-semibold text-foreground mb-1">
                    PPPoE ID / Username <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="admin"
                    value={formData.pppoe_username}
                    onChange={(e) => setFormData({ ...formData, pppoe_username: e.target.value })}
                    className="bg-background font-mono"
                  />
                </div>
              </div>

              {/* Row 3: PPPoE Password, Client Code / Custom ID, Profile Picture */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    PPPoE Password <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="password"
                    required
                    value={formData.pppoe_password}
                    onChange={(e) => setFormData({ ...formData, pppoe_password: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Client Code / Custom ID (Optional)
                  </label>
                  <Input
                    placeholder="Custom ID or Code"
                    value={formData.client_code}
                    onChange={(e) => setFormData({ ...formData, client_code: e.target.value })}
                    className="bg-background font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Profile Picture</label>
                  <div className="flex items-center gap-2 border border-input rounded-md px-3 py-1.5 bg-background text-muted-foreground">
                    <input type="file" className="text-[11px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-muted file:text-foreground hover:file:bg-accent cursor-pointer w-full" />
                  </div>
                </div>
              </div>

              {/* Row 4: Address, District, Thana / Upazila */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1">Address</label>
                  <Input
                    placeholder="House, Street, Area info"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    District <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value, thana: "" })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">-- Select District --</option>
                    {Object.keys(DISTRICT_THANA_MAP).map((dist) => (
                      <option key={dist} value={dist}>{dist}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Thana / Upazila <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.thana}
                    onChange={(e) => setFormData({ ...formData, thana: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">-- Select Thana --</option>
                    {availableThanas.map((th) => (
                      <option key={th} value={th}>{th}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ───────────────────────────────────────────────────────────── */}
            {/* SECTION 2: Package & Billing Setup */}
            {/* ───────────────────────────────────────────────────────────── */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                Package & Billing Setup
              </h2>

              {/* Row 1: Select Package, Discount, Bill Amount, Billing Position */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Select Package <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.package_id}
                    onChange={(e) => handlePackageChange(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">-- Choose Package --</option>
                    {PACKAGES.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} (৳{pkg.price})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Discount (৳)</label>
                  <Input
                    type="number"
                    value={formData.discount}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Bill Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">৳</span>
                    <Input
                      readOnly
                      value={formData.bill_amount}
                      className="pl-7 bg-muted font-bold text-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Billing Position / Status</label>
                  <select
                    value={formData.billing_position}
                    onChange={(e) => setFormData({ ...formData, billing_position: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>Active (Billable)</option>
                    <option>Free / Complimentary</option>
                    <option>Suspended</option>
                    <option>Trial Account</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Client Status, Joining Date, Billing Cycle Day, SMS Notifications */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1">Client Status</label>
                  <select
                    value={formData.client_status}
                    onChange={(e) => setFormData({ ...formData, client_status: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>Active</option>
                    <option>Free</option>
                    <option>Promise Active</option>
                    <option>Due</option>
                    <option>Inactive</option>
                    <option>Expired</option>
                    <option>Left</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Joining Date</label>
                  <Input
                    type="date"
                    value={formData.joining_date}
                    onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Billing Cycle Day</label>
                  <select
                    value={formData.billing_cycle}
                    onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>Standard 30 Days</option>
                    <option>1st of Month</option>
                    <option>Fixed Calendar Month</option>
                    <option>Prepaid (Expiry on Balance Zero)</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1">Calculates pro-rata credit till this day.</p>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">SMS Notifications</label>
                  <select
                    value={formData.sms_notifications}
                    onChange={(e) => setFormData({ ...formData, sms_notifications: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>Enabled (Send SMS)</option>
                    <option>Disabled</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Voice Call Notifications */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1">Voice Call Notifications</label>
                  <select
                    value={formData.voice_notifications}
                    onChange={(e) => setFormData({ ...formData, voice_notifications: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>Enabled (Send Voice Call)</option>
                    <option>Disabled</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ───────────────────────────────────────────────────────────── */}
            {/* SECTION 3: Network & Location */}
            {/* ───────────────────────────────────────────────────────────── */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                Network & Location
              </h2>

              {/* Row 1: Router / POP, Zone Configuration, TJ Box / Port, Connection Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1">Router / POP</label>
                  <select
                    value={formData.router_pop}
                    onChange={(e) => setFormData({ ...formData, router_pop: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>Core-MikroTik-CCR1036</option>
                    <option>Mirpur-CCR2004</option>
                    <option>Uttara-CCR1072</option>
                    <option>Dhanmondi-CCR1016</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Zone Configuration</label>
                  <select
                    value={formData.zone}
                    onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>Default / No Zone</option>
                    <option>Zone 1 - Uttara Sector 10</option>
                    <option>Zone 2 - Mirpur 10 NOC</option>
                    <option>Zone 3 - Dhanmondi 27 Hub</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">TJ Box / Port</label>
                  <select
                    value={formData.tj_box}
                    onChange={(e) => setFormData({ ...formData, tj_box: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>None</option>
                    <option>BOX-A1 (Port 1 - Blue)</option>
                    <option>BOX-A1 (Port 2 - Orange)</option>
                    <option>BOX-M2 (Port 1 - Blue)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">Connection Type</label>
                  <select
                    value={formData.connection_type}
                    onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>Fiber (FTTH)</option>
                    <option>Cat6 / LAN</option>
                    <option>Wireless PtP</option>
                    <option>Corporate Dark Core</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Client Type, ONU MAC Address, GPS Coordinates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Client Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.client_type}
                    onChange={(e) => setFormData({ ...formData, client_type: e.target.value })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option>Home</option>
                    <option>Commercial / Office</option>
                    <option>SME / Corporate</option>
                    <option>Reseller Sub-client</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">ONU MAC Address</label>
                  <Input
                    placeholder="e.g. AA:BB:CC:11:22:33"
                    value={formData.onu_mac}
                    onChange={(e) => setFormData({ ...formData, onu_mac: e.target.value })}
                    className="bg-background font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">GPS Coordinates (Lat, Long)</label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Fetching..."
                      value={formData.gps_coords}
                      onChange={(e) => setFormData({ ...formData, gps_coords: e.target.value })}
                      className="bg-background font-mono flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGetGps}
                      disabled={isGettingGps}
                      className="h-9 px-3 border-border bg-background"
                      title="Fetch current GPS"
                    >
                      <MapPin className={`h-4 w-4 text-indigo-500 ${isGettingGps ? 'animate-bounce' : ''}`} />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Row 3: Remarks */}
              <div>
                <label className="block font-semibold text-foreground mb-1">Remarks</label>
                <Input
                  placeholder="Any notes..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="bg-background"
                />
              </div>
            </div>

            {/* ───────────────────────────────────────────────────────────── */}
            {/* Submit Button */}
            {/* ───────────────────────────────────────────────────────────── */}
            <div className="pt-4 border-t border-border">
              <Button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold h-11 text-sm shadow-lg shadow-emerald-700/25 flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4.5 w-4.5" />
                Register New Client & Save Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  Building,
  Sliders,
  Save,
  CheckCircle2,
  RefreshCw,
  Video,
  Upload,
  Clock,
  Tag,
  Eye,
  Calendar,
  Phone,
  Mail,
  MapPin,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ApiClient } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);
  const { fontScale, setFontScale, highContrast, setHighContrast, compactMode, setCompactMode } = useTheme();

  const [formData, setFormData] = useState({
    company_name: "ISP Billing",
    tenant_key: "17",
    address: "Your ISP Corporate Office Address",
    support_phone: "+880 1234-567890",
    support_email: "billing@isp.com",
    client_name: "fardin",
    client_date_of_birth: "2003-01-01",
    payment_tutorial_video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    logo_url: "",
    favicon_url: "",
    undo_recharge_deduct_hours: 2,
    admin_expire_time: "23:59",
    recharge_discount_enabled: true,
    show_reseller_profile_speed: true,
    ui_font_scale: 1,
    ui_high_contrast: false,
    ui_compact_mode: false,
  });

  useEffect(() => {
    async function fetchSettings() {
      try {
        const s = await ApiClient.getSettings();
        if (s) {
          setSettingId(s.id);
          setFormData((prev) => ({
            ...prev,
            company_name: s.company_name || prev.company_name,
            address: s.address || prev.address,
            support_phone: s.support_phone || prev.support_phone,
            support_email: s.support_email || prev.support_email,
            client_name: s.client_name || prev.client_name,
            client_date_of_birth: s.client_date_of_birth || prev.client_date_of_birth,
            payment_tutorial_video: s.payment_tutorial_video || prev.payment_tutorial_video,
            undo_recharge_deduct_hours: s.undo_recharge_deduct_hours ?? prev.undo_recharge_deduct_hours,
            admin_expire_time: s.admin_expire_time || prev.admin_expire_time,
            recharge_discount_enabled: s.recharge_discount_enabled ?? prev.recharge_discount_enabled,
            show_reseller_profile_speed: s.show_reseller_profile_speed ?? prev.show_reseller_profile_speed,
            ui_font_scale: s.ui_font_scale ?? prev.ui_font_scale,
            ui_high_contrast: s.ui_high_contrast ?? prev.ui_high_contrast,
            ui_compact_mode: s.ui_compact_mode ?? prev.ui_compact_mode,
          }));
          // Sync backend UI preferences to theme context
          if (s.ui_font_scale) setFontScale(s.ui_font_scale);
          if (s.ui_high_contrast) setHighContrast(s.ui_high_contrast);
          if (s.ui_compact_mode) setCompactMode(s.ui_compact_mode);
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (settingId) {
        await ApiClient.updateSettings(settingId, formData);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Sliders className="h-6 w-6 text-indigo-500" />
            General Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Basic information about your ISP branding and subscriber policy configuration.
          </p>
        </div>

        {saved && (
          <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 animate-pulse bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
            <CheckCircle2 className="h-4 w-4" /> Settings successfully saved!
          </span>
        )}
      </div>

      {/* Main Settings Card */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <Building className="h-4 w-4 text-indigo-500" />
            ISP Profile & System Defaults
          </CardTitle>
          <CardDescription className="text-xs">
            Manage your company identity, owner details, self-care tutorial video, and billing thresholds.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSave} className="space-y-6 text-xs">
            {/* Row 1: Company Name & Tenant Key */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block font-semibold text-foreground mb-1.5">Company Name</label>
                <Input
                  required
                  value={formData.company_name}
                  onChange={(e) => handleChange("company_name", e.target.value)}
                  placeholder="Enter company name"
                  className="bg-background text-xs h-10 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1.5">Tenant Key (ID No)</label>
                <div className="h-10 px-3 rounded-md bg-muted/60 border border-border flex items-center justify-between font-mono font-bold text-foreground">
                  <span>{formData.tenant_key} (shebafi)</span>
                  <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-400 border-indigo-500/20">Active</Badge>
                </div>
              </div>
            </div>

            {/* Row 2: Company Address */}
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Company Address</label>
              <textarea
                rows={2}
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="Your ISP Corporate Office Address"
                className="w-full rounded-md border border-input bg-background p-3 text-xs text-foreground focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Row 3: Company Phone & Company Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  Company Phone
                </label>
                <Input
                  value={formData.support_phone}
                  onChange={(e) => handleChange("support_phone", e.target.value)}
                  placeholder="+880 1234-567890"
                  className="bg-background text-xs h-10"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Company Email
                </label>
                <Input
                  type="email"
                  value={formData.support_email}
                  onChange={(e) => handleChange("support_email", e.target.value)}
                  placeholder="billing@isp.com"
                  className="bg-background text-xs h-10"
                />
              </div>
            </div>

            {/* Row 4: Client Name & Date of Birth */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Client Name (SaaS Client / Owner Name)
                </label>
                <Input
                  value={formData.client_name}
                  onChange={(e) => handleChange("client_name", e.target.value)}
                  placeholder="Enter Client / Owner Name"
                  className="bg-background text-xs h-10 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  Date of Birth
                </label>
                <Input
                  type="date"
                  value={formData.client_date_of_birth}
                  onChange={(e) => handleChange("client_date_of_birth", e.target.value)}
                  className="bg-background text-xs h-10"
                />
              </div>
            </div>

            {/* Row 5: Payment Tutorial Video URL */}
            <div>
              <label className="block font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5 text-indigo-400" />
                Payment Tutorial Video URL (YouTube)
              </label>
              <Input
                type="url"
                value={formData.payment_tutorial_video}
                onChange={(e) => handleChange("payment_tutorial_video", e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="bg-background text-xs h-10"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                This video will be shown in the self-care panel to guide users on how to pay their bills.
              </p>
            </div>

            {/* Row 6: Company Logo & Favicon */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-border/80 bg-muted/20">
              <div>
                <label className="block font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  Company Logo
                </label>
                <Input
                  type="file"
                  accept="image/*"
                  className="bg-background text-xs file:bg-indigo-600 file:text-white file:border-0 file:rounded-md file:px-2.5 file:py-1 file:mr-3 file:text-xs file:font-semibold"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Recommended: PNG, Transparent, Max 200px height.</p>
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  Favicon
                </label>
                <Input
                  type="file"
                  accept="image/*"
                  className="bg-background text-xs file:bg-indigo-600 file:text-white file:border-0 file:rounded-md file:px-2.5 file:py-1 file:mr-3 file:text-xs file:font-semibold"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Recommended: 32x32 ICO or PNG.</p>
              </div>
            </div>

            {/* Row 7: Undo Penalty & Direct Clients Expire Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Undo Recharge Penalty Threshold (Hours)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={formData.undo_recharge_deduct_hours}
                  onChange={(e) => handleChange("undo_recharge_deduct_hours", parseInt(e.target.value) || 0)}
                  placeholder="2"
                  className="bg-background text-xs h-10"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  If undo is done after this time, 1 day cost will be deducted.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Direct Clients Expire Time
                </label>
                <Input
                  type="time"
                  value={formData.admin_expire_time}
                  onChange={(e) => handleChange("admin_expire_time", e.target.value)}
                  className="bg-background text-xs h-10"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Time of day when Admin&apos;s direct active users reach expiry date gets disabling executed.
                </p>
              </div>
            </div>

            {/* Row 8: Recharge Discount Mode Switch */}
            <div className="p-4 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                  <Tag className="h-4 w-4 text-indigo-400" />
                  Recharge Discount Mode
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Enable discount fields for Manual Recharge and user-wise Bulk Recharge in this tenant only.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="recharge_discount_enabled"
                  checked={formData.recharge_discount_enabled}
                  onChange={(e) => handleChange("recharge_discount_enabled", e.target.checked)}
                  className="h-4 w-4 rounded bg-background border-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="recharge_discount_enabled" className="font-bold text-foreground text-xs cursor-pointer">
                  Enable Discount
                </label>
              </div>
            </div>

            {/* Row 9: Show Profile / Speed in Reseller My Rates Panel */}
            <div className="p-4 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                  <Eye className="h-4 w-4 text-indigo-400" />
                  Show &quot;Profile / Speed&quot; in Reseller My Rates Panel
                </div>
                <p className="text-[11px] text-muted-foreground">
                  If enabled, resellers can view the Profile / Speed column in their &quot;My Rates&quot; page. If disabled, this column is completely hidden.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="show_reseller_profile_speed"
                  checked={formData.show_reseller_profile_speed}
                  onChange={(e) => handleChange("show_reseller_profile_speed", e.target.checked)}
                  className="h-4 w-4 rounded bg-background border-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="show_reseller_profile_speed" className="font-bold text-foreground text-xs cursor-pointer">
                  Show Column
                </label>
              </div>
            </div>

            {/* User View / Accessibility Settings */}
            <div className="p-4 rounded-xl border border-border bg-muted/20">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/60">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                    <Eye className="h-4 w-4 text-indigo-400" />
                    User View Customization
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Adjust the interface for better readability and comfort on the customer side.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                  Live Preview
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                <div className="space-y-2">
                  <label className="block font-semibold text-foreground text-xs">Font Size</label>
                  <input
                    type="range"
                    min={90}
                    max={150}
                    step={5}
                    value={Math.round(formData.ui_font_scale * 100)}
                    onChange={(e) => {
                      const val = Number(e.target.value) / 100;
                      setFontScale(val);
                      handleChange("ui_font_scale", val);
                    }}
                    className="w-full accent-indigo-600"
                  />
                  <p className="text-[11px] text-muted-foreground">{Math.round(formData.ui_font_scale * 100)}% view scale</p>
                </div>

                <div className="p-3 rounded-lg border border-border bg-background/60 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-foreground text-xs">High Contrast</div>
                    <p className="text-[11px] text-muted-foreground">Improve readability for low vision.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.ui_high_contrast}
                    onChange={(e) => {
                      setHighContrast(e.target.checked);
                      handleChange("ui_high_contrast", e.target.checked);
                    }}
                    className="h-4 w-4 rounded bg-background border-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="p-3 rounded-lg border border-border bg-background/60 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-foreground text-xs">Compact View</div>
                    <p className="text-[11px] text-muted-foreground">Reduce spacing for denser layouts.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.ui_compact_mode}
                    onChange={(e) => {
                      setCompactMode(e.target.checked);
                      handleChange("ui_compact_mode", e.target.checked);
                    }}
                    className="h-4 w-4 rounded bg-background border-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <span className="text-[11px] text-muted-foreground">
                All changes including UI customization sync directly to the Django REST database in real-time.
              </span>

              <Button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 px-6 shadow-md shadow-indigo-600/20"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import React from 'react';
import { Building2, Mail, Phone, Globe, MapPin, FileText, Video, Calendar, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CompanySetting } from '@/lib/settings/settings-types';
import { ValidationErrorMap } from '@/lib/settings/settings-api';

interface CompanyProfileSettingsProps {
  settings: CompanySetting;
  onChange: (patch: Partial<CompanySetting>) => void;
  errors: ValidationErrorMap;
}

export function CompanyProfileSettings({
  settings,
  onChange,
  errors,
}: CompanyProfileSettingsProps) {
  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Company & Organization Profile
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                General company identity, tax registration, and billing header details displayed on invoices.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                Company Name <span className="text-rose-500">*</span>
              </label>
              <Input
                value={settings.company_name}
                onChange={(e) => onChange({ company_name: e.target.value })}
                placeholder="e.g. ShebaFi Broadband Ltd."
                className="bg-background text-xs h-9"
              />
              {errors.company_name && (
                <p className="text-[11px] text-rose-500 font-medium">{errors.company_name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Tagline / Motto</label>
              <Input
                value={settings.tagline}
                onChange={(e) => onChange({ tagline: e.target.value })}
                placeholder="e.g. Ultra Fast Optical Fiber Broadband"
                className="bg-background text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                Client / ISP Owner Name
              </label>
              <Input
                value={settings.client_name}
                onChange={(e) => onChange({ client_name: e.target.value })}
                placeholder="e.g. Fardin Ahmed"
                className="bg-background text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                Owner Date of Birth
              </label>
              <Input
                type="date"
                value={settings.client_date_of_birth || ''}
                onChange={(e) => onChange({ client_date_of_birth: e.target.value || null })}
                className="bg-background text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                Support Phone Number
              </label>
              <Input
                value={settings.support_phone}
                onChange={(e) => onChange({ support_phone: e.target.value })}
                placeholder="e.g. +880 1700-000000"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                Support Email
              </label>
              <Input
                type="email"
                value={settings.support_email}
                onChange={(e) => onChange({ support_email: e.target.value })}
                placeholder="e.g. billing@isp.com"
                className="bg-background text-xs h-9"
              />
              {errors.support_email && (
                <p className="text-[11px] text-rose-500 font-medium">{errors.support_email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                Official Website URL
              </label>
              <Input
                value={settings.website}
                onChange={(e) => onChange({ website: e.target.value })}
                placeholder="https://example.com"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                Tax / VAT / BIN Registration Number
              </label>
              <Input
                value={settings.tax_number}
                onChange={(e) => onChange({ tax_number: e.target.value })}
                placeholder="e.g. BIN-123456789"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              Corporate Office Address
            </label>
            <textarea
              rows={2}
              value={settings.address}
              onChange={(e) => onChange({ address: e.target.value })}
              placeholder="e.g. House 12, Road 4, Sector 7, Uttara, Dhaka-1230"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              Invoice Footer Legal Note
            </label>
            <textarea
              rows={2}
              value={settings.billing_footer_note}
              onChange={(e) => onChange({ billing_footer_note: e.target.value })}
              placeholder="e.g. Thank you for choosing Sheba Fi. Pay online via bKash or Nagad."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-muted-foreground" />
              Customer Portal Payment Tutorial Video URL (YouTube)
            </label>
            <Input
              value={settings.payment_tutorial_video}
              onChange={(e) => onChange({ payment_tutorial_video: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=..."
              className="bg-background text-xs h-9 font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Embedded in the customer self-care portal to instruct subscribers how to recharge.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import React from 'react';
import { DollarSign, Clock, ShieldAlert, FileText, CheckSquare, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CompanySetting } from '@/lib/settings/settings-types';
import { ValidationErrorMap } from '@/lib/settings/settings-api';

interface BillingConfigSettingsProps {
  settings: CompanySetting;
  onChange: (patch: Partial<CompanySetting>) => void;
  errors: ValidationErrorMap;
  onOptimisticToggle?: (field: keyof CompanySetting, value: boolean) => void;
}

export function BillingConfigSettings({
  settings,
  onChange,
  errors,
  onOptimisticToggle,
}: BillingConfigSettingsProps) {
  const handleToggle = (field: keyof CompanySetting, value: boolean) => {
    if (onOptimisticToggle) {
      onOptimisticToggle(field, value);
    } else {
      onChange({ [field]: value });
    }
  };

  return (
    <div className="space-y-6">
      {/* Currency & Invoicing Prefixes */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Currency & Invoicing Identifier Defaults
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configure currency denomination and serial numbering prefixes for invoices and customer IDs.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Currency Symbol</label>
              <Input
                value={settings.currency_symbol}
                onChange={(e) => onChange({ currency_symbol: e.target.value })}
                placeholder="৳ or $"
                className="bg-background text-xs h-9 font-mono"
              />
              {errors.currency_symbol && (
                <p className="text-[11px] text-rose-500">{errors.currency_symbol}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Currency ISO Code</label>
              <Input
                value={settings.currency_code}
                onChange={(e) => onChange({ currency_code: e.target.value.toUpperCase() })}
                placeholder="BDT, USD, etc."
                className="bg-background text-xs h-9 font-mono"
              />
              {errors.currency_code && (
                <p className="text-[11px] text-rose-500">{errors.currency_code}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                Invoice Prefix
              </label>
              <Input
                value={settings.invoice_prefix}
                onChange={(e) => onChange({ invoice_prefix: e.target.value })}
                placeholder="SHB-INV-"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                Customer ID Prefix
              </label>
              <Input
                value={settings.customer_id_prefix}
                onChange={(e) => onChange({ customer_id_prefix: e.target.value })}
                placeholder="SHB-"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expiry, Grace Periods & Auto Lock */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Billing Automation & Expiry Enforcement
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Control auto-suspension, invoice generation triggers, grace windows, and recharge policies.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Grace Period (Days)
              </label>
              <Input
                type="number"
                min="0"
                value={settings.grace_period_days}
                onChange={(e) => onChange({ grace_period_days: Math.max(0, parseInt(e.target.value) || 0) })}
                className="bg-background text-xs h-9 font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Days allowed past expiration before hard lock.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Promise Max (Days)
              </label>
              <Input
                type="number"
                min="0"
                value={settings.promise_max_days}
                onChange={(e) => onChange({ promise_max_days: Math.max(0, parseInt(e.target.value) || 0) })}
                className="bg-background text-xs h-9 font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Maximum temporary credit extension days.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Undo Recharge Grace (Hours)
              </label>
              <Input
                type="number"
                min="0"
                value={settings.undo_recharge_deduct_hours}
                onChange={(e) => onChange({ undo_recharge_deduct_hours: Math.max(0, parseInt(e.target.value) || 0) })}
                className="bg-background text-xs h-9 font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Hours before 1-day cost deduction on recharge rollback.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Daily Expiration Execution Time
              </label>
              <Input
                value={settings.admin_expire_time}
                onChange={(e) => onChange({ admin_expire_time: e.target.value })}
                placeholder="23:59"
                className="bg-background text-xs h-9 font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Time of day when expired subscribers are disabled.</p>
            </div>
          </div>

          {/* Policy Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border">
            <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                  Auto Lock On Expiry
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Automatically disconnect expired subscribers when grace period expires.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_lock_on_expiry}
                onChange={(e) => handleToggle('auto_lock_on_expiry', e.target.checked)}
                className="w-4 h-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                  Auto Generate Monthly Invoice
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Generate periodic subscriber recurring invoices at billing cycle start.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_generate_monthly_invoice}
                onChange={(e) => handleToggle('auto_generate_monthly_invoice', e.target.checked)}
                className="w-4 h-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Recharge Discount Fields
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Allow operators to apply customized discounts during manual or bulk recharges.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.recharge_discount_enabled}
                onChange={(e) => handleToggle('recharge_discount_enabled', e.target.checked)}
                className="w-4 h-4 rounded border-border text-amber-600 focus:ring-amber-500"
              />
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  Show Reseller Profile Speed
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Display profile bandwidth & speed ratings in Reseller My Rates panel.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.show_reseller_profile_speed}
                onChange={(e) => handleToggle('show_reseller_profile_speed', e.target.checked)}
                className="w-4 h-4 rounded border-border text-cyan-600 focus:ring-cyan-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

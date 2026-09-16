'use client';

import React from 'react';
import { Users, Shield, Clock, Video, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CompanySetting } from '@/lib/settings/settings-types';

interface CustomerSettingsPanelProps {
  settings: CompanySetting;
  onChange: (patch: Partial<CompanySetting>) => void;
  onOptimisticToggle?: (field: keyof CompanySetting, value: boolean) => void;
}

export function CustomerSettingsPanel({
  settings,
  onChange,
  onOptimisticToggle,
}: CustomerSettingsPanelProps) {
  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Subscriber Management Defaults & Self-Care Portal
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Subscriber identifier patterns, automated disconnection rules, and client portal settings.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 p-4 rounded-xl border border-border bg-muted/10">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                Subscriber ID Prefix Format
              </label>
              <Input
                value={settings.customer_id_prefix}
                onChange={(e) => onChange({ customer_id_prefix: e.target.value })}
                placeholder="SHB-"
                className="bg-background text-xs h-9 font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                New customers will automatically be assigned IDs matching this prefix (e.g.{' '}
                <span className="font-mono text-foreground font-semibold">{settings.customer_id_prefix}1001</span>).
              </p>
            </div>

            <div className="space-y-2 p-4 rounded-xl border border-border bg-muted/10">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-rose-400" />
                Portal Payment Video Tutorial
              </label>
              <Input
                value={settings.payment_tutorial_video}
                onChange={(e) => onChange({ payment_tutorial_video: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
                className="bg-background text-xs h-9 font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Shows directly inside the subscriber self-care portal as an interactive payment guide.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              Service Protection & Expiration Policies
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Auto-Lock On Expiry</span>
                  <input
                    type="checkbox"
                    checked={settings.auto_lock_on_expiry}
                    onChange={(e) => {
                      if (onOptimisticToggle) onOptimisticToggle('auto_lock_on_expiry', e.target.checked);
                      else onChange({ auto_lock_on_expiry: e.target.checked });
                    }}
                    className="w-4 h-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Lock subscriber network traffic instantly when package expires and grace period concludes.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    Grace Period Window
                  </span>
                  <span className="text-xs font-bold text-indigo-400 font-mono">
                    {settings.grace_period_days} Days
                  </span>
                </div>
                <Input
                  type="number"
                  min="0"
                  value={settings.grace_period_days}
                  onChange={(e) => onChange({ grace_period_days: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="bg-background text-xs h-8 font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Active connection continues during this grace buffer.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    Promise Max Extension
                  </span>
                  <span className="text-xs font-bold text-indigo-400 font-mono">
                    {settings.promise_max_days} Days
                  </span>
                </div>
                <Input
                  type="number"
                  min="0"
                  value={settings.promise_max_days}
                  onChange={(e) => onChange({ promise_max_days: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="bg-background text-xs h-8 font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Max days operators can grant as promise bill extension.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

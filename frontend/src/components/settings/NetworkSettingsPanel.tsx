'use client';

import React from 'react';
import { Router as RouterIcon, Server, Globe, Shield, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CompanySetting } from '@/lib/settings/settings-types';
import { ValidationErrorMap } from '@/lib/settings/settings-api';

interface NetworkSettingsPanelProps {
  settings: CompanySetting;
  onChange: (patch: Partial<CompanySetting>) => void;
  errors: ValidationErrorMap;
  onOptimisticToggle?: (field: keyof CompanySetting, value: boolean) => void;
}

export function NetworkSettingsPanel({
  settings,
  onChange,
  errors,
  onOptimisticToggle,
}: NetworkSettingsPanelProps) {
  return (
    <div className="space-y-6">
      {/* MikroTik Defaults */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <RouterIcon className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                MikroTik RouterOS API Defaults
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Global communication parameters when connecting to edge MikroTik NAS and BNG routers.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-muted-foreground" />
                Default RouterOS API Port
              </label>
              <Input
                type="number"
                min="1"
                max="65535"
                value={settings.mikrotik_default_port}
                onChange={(e) => onChange({ mikrotik_default_port: parseInt(e.target.value) || 8728 })}
                className="bg-background text-xs h-9 font-mono"
              />
              {errors.mikrotik_default_port && (
                <p className="text-[11px] text-rose-500">{errors.mikrotik_default_port}</p>
              )}
              <p className="text-[10px] text-muted-foreground">Standard plaintext RouterOS API port is 8728 (or 8729 for SSL).</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                API Connection Timeout (Seconds)
              </label>
              <Input
                type="number"
                min="1"
                max="60"
                value={settings.mikrotik_timeout_sec}
                onChange={(e) => onChange({ mikrotik_timeout_sec: parseInt(e.target.value) || 5 })}
                className="bg-background text-xs h-9 font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Socket connect and response wait timeout.</p>
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-rose-400" />
                  Auto Kick Expired Subscribers from Router
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Proactively terminate active PPPoE / IPoE sessions on the MikroTik router upon account expiry.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.mikrotik_auto_kick_on_expire}
                onChange={(e) => {
                  if (onOptimisticToggle) {
                    onOptimisticToggle('mikrotik_auto_kick_on_expire', e.target.checked);
                  } else {
                    onChange({ mikrotik_auto_kick_on_expire: e.target.checked });
                  }
                }}
                className="w-4 h-4 rounded border-border text-rose-600 focus:ring-rose-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DNS Resolvers */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Default DNS Resolvers for IP Pools & Profiles
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Default nameservers automatically assigned to client PPP profiles and DHCP pools.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Primary DNS Server IP</label>
              <Input
                value={settings.default_dns_primary}
                onChange={(e) => onChange({ default_dns_primary: e.target.value })}
                placeholder="8.8.8.8"
                className="bg-background text-xs h-9 font-mono"
              />
              {errors.default_dns_primary && (
                <p className="text-[11px] text-rose-500">{errors.default_dns_primary}</p>
              )}
              <p className="text-[10px] text-muted-foreground">e.g. 8.8.8.8 (Google Public DNS) or 1.1.1.1 (Cloudflare).</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Secondary DNS Server IP</label>
              <Input
                value={settings.default_dns_secondary}
                onChange={(e) => onChange({ default_dns_secondary: e.target.value })}
                placeholder="1.1.1.1"
                className="bg-background text-xs h-9 font-mono"
              />
              {errors.default_dns_secondary && (
                <p className="text-[11px] text-rose-500">{errors.default_dns_secondary}</p>
              )}
              <p className="text-[10px] text-muted-foreground">Fallback resolver for subscriber queries.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

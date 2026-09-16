'use client';

import React, { useState } from 'react';
import { MessageSquare, Key, Link as LinkIcon, Send, Clock, Eye, EyeOff, ShieldCheck, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CompanySetting, SmsProviderEnum } from '@/lib/settings/settings-types';

interface SmsSettingsPanelProps {
  settings: CompanySetting;
  onChange: (patch: Partial<CompanySetting>) => void;
  onOptimisticToggle?: (field: keyof CompanySetting, value: boolean) => void;
}

const SMS_PROVIDERS: SmsProviderEnum[] = [
  'Custom URL Gateway',
  'Greenweb',
  'BulkSMSBD',
  'Onnorokom',
  'Twilio',
];

const SMS_SHORTCODES = ['[NAME]', '[ID]', '[PASS]', '[AMOUNT]', '[DAYS]', '[DATE]'];

export function SmsSettingsPanel({
  settings,
  onChange,
  onOptimisticToggle,
}: SmsSettingsPanelProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  const handleToggle = (field: keyof CompanySetting, value: boolean) => {
    if (onOptimisticToggle) onOptimisticToggle(field, value);
    else onChange({ [field]: value });
  };

  const insertShortcode = (templateKey: keyof CompanySetting, shortcode: string) => {
    const current = (settings[templateKey] as string) || '';
    onChange({ [templateKey]: `${current} ${shortcode}` });
  };

  return (
    <div className="space-y-6">
      {/* Gateway Configuration */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-foreground">
                  SMS Gateway Connectivity
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Connect your telecom SMS API aggregator for automated subscriber notifications and OTP alerts.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Gateway Enabled:</span>
              <input
                type="checkbox"
                checked={settings.sms_enabled}
                onChange={(e) => handleToggle('sms_enabled', e.target.checked)}
                className="w-4 h-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">SMS Provider Gateway</label>
              <select
                value={settings.sms_provider}
                onChange={(e) => onChange({ sms_provider: e.target.value as SmsProviderEnum })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SMS_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                Sender Masking / Sender ID
              </label>
              <Input
                value={settings.sms_sender_id}
                onChange={(e) => onChange({ sms_sender_id: e.target.value })}
                placeholder="e.g. SHEBAFI"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-muted-foreground" />
                Gateway API Key / Token
              </label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.sms_api_key}
                  onChange={(e) => onChange({ sms_api_key: e.target.value })}
                  placeholder="Enter SMS gateway secret key"
                  className="bg-background text-xs h-9 font-mono pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
              Gateway HTTP Endpoint URL with URL Tokens
            </label>
            <Input
              value={settings.sms_gateway_url}
              onChange={(e) => onChange({ sms_gateway_url: e.target.value })}
              placeholder="https://api.provider.com/send?key={KEY}&sender={SENDER}&msg={MSG}&to={NUMBER}"
              className="bg-background text-xs h-9 font-mono text-emerald-400"
            />
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap pt-1">
              <span className="font-semibold text-foreground">Available Token Placeholders:</span>
              <Badge variant="outline" className="font-mono text-[10px] bg-muted/30">
                &#123;KEY&#125;
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] bg-muted/30">
                &#123;SENDER&#125;
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] bg-muted/30">
                &#123;MSG&#125;
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] bg-muted/30">
                &#123;NUMBER&#125;
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border">
            <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground">Send On Payment</span>
                <p className="text-[10px] text-muted-foreground">Receipt SMS on bill confirmation.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.send_sms_on_payment}
                onChange={(e) => handleToggle('send_sms_on_payment', e.target.checked)}
                className="w-4 h-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
              />
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground">Send On Expiry</span>
                <p className="text-[10px] text-muted-foreground">Warning SMS upon account expiry.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.send_sms_on_expiry}
                onChange={(e) => handleToggle('send_sms_on_expiry', e.target.checked)}
                className="w-4 h-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
              />
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Reminder Window</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  {settings.sms_reminder_days} Days Before
                </span>
              </div>
              <Input
                type="number"
                min="1"
                max="15"
                value={settings.sms_reminder_days}
                onChange={(e) => onChange({ sms_reminder_days: Math.max(1, parseInt(e.target.value) || 1) })}
                className="bg-background text-xs h-7 font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SMS Templates */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-foreground">
                  Automated SMS Notification Templates
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Customize message wording using interactive dynamic shortcode variables.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] text-muted-foreground font-medium mr-1">Insert Variable:</span>
              {SMS_SHORTCODES.map((code) => (
                <span
                  key={code}
                  className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono text-indigo-400 cursor-default"
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Welcome SMS */}
          <div className="space-y-1.5 p-3 rounded-xl border border-border bg-muted/10">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Welcome SMS Template</label>
              <div className="flex gap-1">
                {SMS_SHORTCODES.slice(0, 3).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => insertShortcode('welcome_sms_template', code)}
                    className="text-[10px] font-mono bg-muted/50 hover:bg-muted text-muted-foreground px-1 py-0.5 rounded"
                  >
                    +{code}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={2}
              value={settings.welcome_sms_template}
              onChange={(e) => onChange({ welcome_sms_template: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Payment SMS */}
          <div className="space-y-1.5 p-3 rounded-xl border border-border bg-muted/10">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Payment Received Template</label>
              <div className="flex gap-1">
                {SMS_SHORTCODES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => insertShortcode('payment_sms_template', code)}
                    className="text-[10px] font-mono bg-muted/50 hover:bg-muted text-muted-foreground px-1 py-0.5 rounded"
                  >
                    +{code}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={2}
              value={settings.payment_sms_template}
              onChange={(e) => onChange({ payment_sms_template: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Advance Credit SMS */}
          <div className="space-y-1.5 p-3 rounded-xl border border-border bg-muted/10">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Advance Credit / Loan SMS</label>
              <div className="flex gap-1">
                {['[NAME]', '[ID]', '[DAYS]'].map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => insertShortcode('advance_loan_sms_template', code)}
                    className="text-[10px] font-mono bg-muted/50 hover:bg-muted text-muted-foreground px-1 py-0.5 rounded"
                  >
                    +{code}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={2}
              value={settings.advance_loan_sms_template}
              onChange={(e) => onChange({ advance_loan_sms_template: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* 27-Day Bill Reminder */}
          <div className="space-y-2 p-3 rounded-xl border border-border bg-muted/10">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Upcoming Due Date Reminder Template
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Send Time:</span>
                <Input
                  value={settings.reminder_27d_time}
                  onChange={(e) => onChange({ reminder_27d_time: e.target.value })}
                  placeholder="12:00 AM"
                  className="bg-background text-xs h-7 w-24 font-mono"
                />
              </div>
            </div>
            <textarea
              rows={2}
              value={settings.reminder_27d_template}
              onChange={(e) => onChange({ reminder_27d_template: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Expiry Reminder */}
          <div className="space-y-2 p-3 rounded-xl border border-border bg-muted/10">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                Day of Expiration Reminder Template
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Send Time:</span>
                <Input
                  value={settings.expiry_reminder_time}
                  onChange={(e) => onChange({ expiry_reminder_time: e.target.value })}
                  placeholder="12:00 AM"
                  className="bg-background text-xs h-7 w-24 font-mono"
                />
              </div>
            </div>
            <textarea
              rows={2}
              value={settings.expiry_reminder_template}
              onChange={(e) => onChange({ expiry_reminder_template: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

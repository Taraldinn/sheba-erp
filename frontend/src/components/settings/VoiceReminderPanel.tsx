'use client';

import React from 'react';
import { PhoneCall, Clock, Key, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { VoiceSettingConfig } from '@/lib/settings/settings-types';

interface VoiceReminderPanelProps {
  voice: VoiceSettingConfig | null;
  onChange: (patch: Partial<VoiceSettingConfig>) => void;
}

export function VoiceReminderPanel({
  voice,
  onChange,
}: VoiceReminderPanelProps) {
  if (!voice) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8 text-center text-muted-foreground text-xs">
          No voice reminder integration configured for this tenant.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-600/15 text-purple-400 flex items-center justify-center">
                <PhoneCall className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-bold text-foreground">
                    Automated Voice Call Expiry Reminders
                  </CardTitle>
                  <Badge variant={voice.is_enabled ? 'default' : 'outline'} className="text-[10px]">
                    {voice.is_enabled ? 'ENABLED' : 'DISABLED'}
                  </Badge>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Places pre-recorded outbound telephone calls to subscribers whose broadband packages are about to expire.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Voice Calls Enabled:</span>
              <input
                type="checkbox"
                checked={voice.is_enabled}
                onChange={(e) => onChange({ is_enabled: e.target.checked })}
                className="w-4 h-4 rounded border-border text-purple-600 focus:ring-purple-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-muted-foreground" />
                API Bearer Token
              </label>
              <Input
                type="password"
                value={voice.api_bearer_token || ''}
                onChange={(e) => onChange({ api_bearer_token: e.target.value })}
                placeholder="awaj_xxxxxxxxxxxx"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-muted-foreground" />
                Caller Sender ID / CLI
              </label>
              <Input
                value={voice.caller_sender_id || ''}
                onChange={(e) => onChange({ caller_sender_id: e.target.value })}
                placeholder="e.g. 09612345678"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                Voice Recording Prompt Name
              </label>
              <Input
                value={voice.voice_file_name || ''}
                onChange={(e) => onChange({ voice_file_name: e.target.value })}
                placeholder="my_reminder_voice"
                className="bg-background text-xs h-9 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border">
            <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                Call Schedule Time
              </span>
              <Input
                value={voice.call_time || '10:00 AM'}
                onChange={(e) => onChange({ call_time: e.target.value })}
                className="bg-background text-xs h-8 font-mono"
              />
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                Safe Window Start
              </span>
              <Input
                value={voice.safe_hours_start || '09:00 AM'}
                onChange={(e) => onChange({ safe_hours_start: e.target.value })}
                className="bg-background text-xs h-8 font-mono"
              />
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                Safe Window End
              </span>
              <Input
                value={voice.safe_hours_end || '08:00 PM'}
                onChange={(e) => onChange({ safe_hours_end: e.target.value })}
                className="bg-background text-xs h-8 font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import React from 'react';
import { Palette, Image as ImageIcon, Sparkles, Sliders, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CompanySetting, ThemeModeEnum, AccentColorEnum } from '@/lib/settings/settings-types';

interface BrandingSettingsProps {
  settings: CompanySetting;
  onChange: (patch: Partial<CompanySetting>) => void;
  onOptimisticToggle?: (field: keyof CompanySetting, value: boolean) => void;
}

const THEME_OPTIONS: { id: ThemeModeEnum; label: string; desc: string }[] = [
  { id: 'dark', label: 'Dark Glassmorphic', desc: 'Sleek dark theme with translucent glass panels (Recommended)' },
  { id: 'light', label: 'Clean Light', desc: 'High-contrast bright daylight mode' },
  { id: 'system', label: 'System Default', desc: 'Syncs automatically with operating system theme' },
  { id: 'midnight', label: 'Midnight Deep Blue', desc: 'Navy blue deep enterprise night look' },
  { id: 'cyberpunk', label: 'Cyber Neon', desc: 'Futuristic high-saturation glow UI' },
];

const ACCENT_COLORS: { id: AccentColorEnum; label: string; colorClass: string; borderClass: string }[] = [
  { id: 'indigo', label: 'Electric Indigo', colorClass: 'bg-indigo-500', borderClass: 'border-indigo-500' },
  { id: 'emerald', label: 'Cyber Emerald', colorClass: 'bg-emerald-500', borderClass: 'border-emerald-500' },
  { id: 'violet', label: 'Ultra Violet', colorClass: 'bg-violet-500', borderClass: 'border-violet-500' },
  { id: 'cyan', label: 'Neon Cyan', colorClass: 'bg-cyan-500', borderClass: 'border-cyan-500' },
  { id: 'amber', label: 'Golden Amber', colorClass: 'bg-amber-500', borderClass: 'border-amber-500' },
  { id: 'rose', label: 'Vibrant Rose', colorClass: 'bg-rose-500', borderClass: 'border-rose-500' },
];

export function BrandingSettings({
  settings,
  onChange,
  onOptimisticToggle,
}: BrandingSettingsProps) {
  return (
    <div className="space-y-6">
      {/* Logos & Assets */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Brand Logos & Visual Assets
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Provide publicly accessible URL links for your ISP logo and browser favicon.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Brand Logo URL</label>
              <Input
                value={settings.logo_url}
                onChange={(e) => onChange({ logo_url: e.target.value })}
                placeholder="https://cdn.yourdomain.com/logo.png"
                className="bg-background text-xs h-9 font-mono"
              />
              {settings.logo_url ? (
                <div className="p-3 bg-muted/30 border border-border rounded-lg flex items-center gap-3">
                  <img
                    src={settings.logo_url}
                    alt="Logo Preview"
                    className="max-h-8 max-w-[120px] object-contain rounded"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span className="text-[11px] text-muted-foreground">Live Logo Preview</span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Default text logo will be rendered if blank.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Favicon URL (.ico or .png)</label>
              <Input
                value={settings.favicon_url}
                onChange={(e) => onChange({ favicon_url: e.target.value })}
                placeholder="https://cdn.yourdomain.com/favicon.png"
                className="bg-background text-xs h-9 font-mono"
              />
              {settings.favicon_url && (
                <div className="p-3 bg-muted/30 border border-border rounded-lg flex items-center gap-3">
                  <img
                    src={settings.favicon_url}
                    alt="Favicon Preview"
                    className="w-5 h-5 object-contain rounded"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span className="text-[11px] text-muted-foreground">Live Favicon Preview</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Theme & Aesthetics */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Theme Mode & Color Scheme
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Select your ISP control panel color palette and density.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme Mode Choices */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
              Theme Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {THEME_OPTIONS.map((theme) => {
                const isSelected = settings.theme_mode === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onChange({ theme_mode: theme.id })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                        : 'border-border bg-muted/20 hover:bg-muted/40'
                    }`}
                  >
                    <div className="font-semibold text-xs text-foreground">{theme.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{theme.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent Colors */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-muted-foreground" />
              Accent Highlight Color
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {ACCENT_COLORS.map((accent) => {
                const isSelected = settings.accent_color === accent.id;
                return (
                  <button
                    key={accent.id}
                    type="button"
                    onClick={() => onChange({ accent_color: accent.id })}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                      isSelected
                        ? `${accent.borderClass} bg-muted/40 ring-1 ring-border`
                        : 'border-border bg-muted/10 hover:bg-muted/30'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full ${accent.colorClass} shadow-xs`} />
                    <span className="text-[11px] font-medium text-foreground">{accent.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Layout & Telemetry Options */}
          <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border">
            <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-foreground">Compact Density Mode</div>
                <div className="text-[11px] text-muted-foreground">
                  Reduces table padding for high-density customer operations.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.compact_mode}
                onChange={(e) => {
                  if (onOptimisticToggle) {
                    onOptimisticToggle('compact_mode', e.target.checked);
                  } else {
                    onChange({ compact_mode: e.target.checked });
                  }
                }}
                className="w-4 h-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  Live Traffic Poll Interval
                </span>
                <span className="text-xs font-mono font-bold text-indigo-400">
                  {settings.live_traffic_interval_sec}s
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={settings.live_traffic_interval_sec}
                onChange={(e) => onChange({ live_traffic_interval_sec: Number(e.target.value) })}
                className="w-full accent-indigo-600 h-1.5 bg-muted rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1s (Ultra real-time)</span>
                <span>10s (Low bandwidth)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import {
  Palette,
  Image as ImageIcon,
  Sparkles,
  Sliders,
  Activity,
  Type,
  Check,
  Dices,
  Eye,
  Save,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CompanySetting, ThemeModeEnum, AccentColorEnum } from '@/lib/settings/settings-types';
import { useTheme } from '@/components/theme-provider';
import { THEME_PRESETS, ThemePreset } from '@/lib/theme/theme-presets';
import { RadiusSize } from '@/lib/theme/color-utils';

interface BrandingSettingsProps {
  settings: CompanySetting;
  onChange: (patch: Partial<CompanySetting>) => void;
  onOptimisticToggle?: (field: keyof CompanySetting, value: boolean) => void;
  onSaveTenantTheme?: () => Promise<void>;
}

const FONT_OPTIONS = [
  { id: 'var(--font-sans), system-ui, sans-serif', label: 'Space Grotesk (Default)' },
  { id: "'Inter', sans-serif", label: 'Inter' },
  { id: "'Roboto', sans-serif", label: 'Roboto' },
  { id: "'Outfit', sans-serif", label: 'Outfit' },
];

const RADIUS_OPTIONS: { id: RadiusSize; label: string }[] = [
  { id: 'none', label: 'Sharp (0px)' },
  { id: 'sm', label: 'Small (6px)' },
  { id: 'md', label: 'Medium (8px - Default)' },
  { id: 'lg', label: 'Large (12px)' },
  { id: 'full', label: 'Rounded Pill' },
];

export function BrandingSettings({
  settings,
  onChange,
  onOptimisticToggle,
}: BrandingSettingsProps) {
  const {
    theme,
    setTheme,
    themeState,
    activePreset,
    setPreset,
    setAccentHue,
    setRadius,
    setRadiusForm,
    setFontFamily,
    setVibrant,
    randomizeTheme,
  } = useTheme();

  const [savedLocally, setSavedLocally] = useState(false);

  const handleApplyPreset = (preset: ThemePreset) => {
    setPreset(preset.id);

    // Map preset to closest existing backend schema values
    let backendMode: ThemeModeEnum = 'dark';
    if (theme === 'light') backendMode = 'light';
    else if (theme === 'system') backendMode = 'system';

    let backendAccent: AccentColorEnum = 'indigo';
    if (preset.id === 'spotify') backendAccent = 'emerald';
    else if (preset.id === 'lavender' || preset.id === 'discord') backendAccent = 'violet';
    else if (preset.id === 'mint' || preset.id === 'sky') backendAccent = 'cyan';
    else if (preset.id === 'rabbit') backendAccent = 'amber';
    else if (preset.id === 'airbnb' || preset.id === 'netflix') backendAccent = 'rose';

    onChange({
      theme_mode: backendMode,
      accent_color: backendAccent,
    });

    setSavedLocally(true);
    setTimeout(() => setSavedLocally(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Logos & Assets */}
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

      {/* 2. HeroUI Theme Library: 11 Showcase Presets */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center">
                <Palette className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-foreground">
                  HeroUI Theme Library (All 11 Default Presets)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Choose from official HeroUI v3 curated theme palettes or customize with OKLCH controls.
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={randomizeTheme}
              className="gap-1.5 text-xs"
            >
              <Dices className="w-3.5 h-3.5 text-primary" />
              Randomize (T)
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Preset Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {THEME_PRESETS.map((preset) => {
              const isSelected = themeState.presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between gap-3 group cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/40 shadow-sm'
                      : 'border-border bg-muted/20 hover:bg-muted/40 hover:border-border/80'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-5 h-5 rounded-full shadow-sm ring-1 ring-border"
                        style={{ backgroundColor: preset.colorHex }}
                      />
                      <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                        {preset.name}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="p-0.5 rounded-full bg-primary text-primary-foreground">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {preset.description}
                  </p>
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border/50 text-[10px] text-muted-foreground font-mono">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.colorHex }} />
                    {preset.colorHex}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Real-time Fine-Tuning Sliders */}
          <div className="pt-4 border-t border-border space-y-4">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-primary" />
              Fine-Tuning & Adaptive Controls
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Accent Hue OKLCH Rainbow Slider */}
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Accent OKLCH Hue</span>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full border border-border shadow-xs"
                      style={{ backgroundColor: 'var(--accent)' }}
                    />
                    <span className="text-xs font-mono font-bold text-primary">
                      {Math.round(themeState.accentHue)}°
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={Math.round(themeState.accentHue)}
                  onChange={(e) => setAccentHue(Number(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background:
                      'linear-gradient(to right, #ff0000, #ff7700, #ffff00, #00ff00, #00ffff, #0066ff, #9900ff, #ff0099, #ff0000)',
                  }}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Warm Red</span>
                  <span>Cool Emerald</span>
                  <span>HeroUI Blue</span>
                  <span>Magenta</span>
                </div>
              </div>

              {/* Typography & Vibrant Palette */}
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-muted-foreground" />
                    Font Family
                  </span>
                  <select
                    value={themeState.fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="bg-background text-xs text-foreground font-medium rounded-lg px-2 py-1 border border-border cursor-pointer outline-none"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.label} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <div className="text-xs font-semibold text-foreground">Vibrant Color Palette</div>
                    <div className="text-[10px] text-muted-foreground">Boosts chroma saturation (+0.05)</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={themeState.isVibrant}
                      onChange={(e) => setVibrant(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                  </label>
                </div>
              </div>
            </div>

            {/* Corner Radius Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
                <span className="text-xs font-medium text-foreground">Component Border Radius</span>
                <div className="grid grid-cols-5 gap-1 pt-1">
                  {RADIUS_OPTIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRadius(r.id)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium text-center border transition-all cursor-pointer ${
                        themeState.radius === r.id
                          ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                          : 'border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {r.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
                <span className="text-xs font-medium text-foreground">Form Field Radius</span>
                <div className="grid grid-cols-5 gap-1 pt-1">
                  {RADIUS_OPTIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRadiusForm(r.id)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium text-center border transition-all cursor-pointer ${
                        themeState.radiusForm === r.id
                          ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                          : 'border-border bg-background/50 hover:bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {r.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Live Component Showcase Test-Drive Canvas */}
          <div className="pt-4 border-t border-border space-y-3">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-primary" />
              Live HeroUI Component Test-Drive
            </h4>

            <div className="p-4 rounded-2xl border border-border bg-muted/10 space-y-4">
              {/* Buttons row */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="default" size="sm">Primary Action</Button>
                <Button variant="secondary" size="sm">Secondary</Button>
                <Button variant="outline" size="sm">Outline</Button>
                <Button variant="destructive" size="sm">Danger</Button>
                <Button variant="ghost" size="sm">Ghost</Button>
              </div>

              {/* Status Chips row */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">HeroUI Theme Active</Badge>
                <Badge variant="success">Online: 4,812 PPPoE</Badge>
                <Badge variant="warning">Warning: 14 OLT Drops</Badge>
                <Badge variant="destructive">Critical Alarm</Badge>
                <Badge variant="secondary">{activePreset.name} Preset</Badge>
              </div>

              {/* Input test */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                <Input placeholder="Sample subscriber username..." className="bg-background text-xs" />
                <Input placeholder="IP Address (192.168.1.1)" className="bg-background text-xs" />
              </div>
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
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  Live Traffic Poll Interval
                </span>
                <span className="text-xs font-mono font-bold text-primary">
                  {settings.live_traffic_interval_sec}s
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={settings.live_traffic_interval_sec}
                onChange={(e) => onChange({ live_traffic_interval_sec: Number(e.target.value) })}
                className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
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

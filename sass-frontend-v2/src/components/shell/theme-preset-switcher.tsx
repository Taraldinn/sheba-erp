'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Check, Laptop, Moon, Palette, Rows3, Rows4, Sparkles, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useThemePreset, type ThemePreset, type DisplayDensity } from '@/hooks/use-theme-preset';

export function ThemePresetSwitcher() {
  const { theme, setTheme } = useTheme();
  const { preset, setPreset, density, setDensity } = useThemePreset();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-full border border-border/70 bg-card/40 px-2.5 font-mono text-xs text-muted-foreground backdrop-blur-md transition-all duration-200 hover:border-primary/40 hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Theme & Display Settings"
        >
          <span className="flex size-2 rounded-full bg-primary" />
          <span className="hidden sm:inline capitalize font-medium tracking-tight">
            {preset === 'signal' ? 'Signal' : 'Indigo'}
          </span>
          <span className="text-[10px] text-muted-foreground/60 hidden md:inline">·</span>
          <span className="text-[10px] text-muted-foreground/80 hidden md:inline capitalize">
            {density === 'compact' ? 'Compact' : 'Comfy'}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 text-xs rounded-xl border border-border/80 bg-card/90 backdrop-blur-2xl shadow-xl p-1.5 luxury-sheen">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
          Theme Preset
        </DropdownMenuLabel>
        <DropdownMenuGroup className="space-y-0.5">
          <DropdownMenuItem
            onClick={() => setPreset('signal')}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[oklch(0.62_0.2_42)] shadow-xs" />
              <span className="tracking-tight">Signal Ops (Amber)</span>
            </div>
            {preset === 'signal' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setPreset('indigo')}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[oklch(0.55_0.22_265)] shadow-xs" />
              <span className="tracking-tight">Modern SaaS (Indigo)</span>
            </div>
            {preset === 'indigo' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-1 border-border/50" />

        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
          Display Density
        </DropdownMenuLabel>
        <DropdownMenuGroup className="space-y-0.5">
          <DropdownMenuItem
            onClick={() => setDensity('comfortable')}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <Rows3 className="size-3.5 text-muted-foreground" />
              <span className="tracking-tight">Comfortable (Spacious)</span>
            </div>
            {density === 'comfortable' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setDensity('compact')}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <Rows4 className="size-3.5 text-muted-foreground" />
              <span className="tracking-tight">Compact (High Density)</span>
            </div>
            {density === 'compact' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-1 border-border/50" />

        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
          Color Mode
        </DropdownMenuLabel>
        <DropdownMenuGroup className="space-y-0.5">
          <DropdownMenuItem
            onClick={() => setTheme('light')}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <Sun className="size-3.5 text-muted-foreground" />
              <span>Light</span>
            </div>
            {theme === 'light' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setTheme('dark')}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <Moon className="size-3.5 text-muted-foreground" />
              <span>Dark</span>
            </div>
            {theme === 'dark' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setTheme('system')}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <Laptop className="size-3.5 text-muted-foreground" />
              <span>System</span>
            </div>
            {theme === 'system' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

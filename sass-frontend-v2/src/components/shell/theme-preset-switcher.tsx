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
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
          aria-label="Theme & Display Settings"
        >
          <Palette className="size-3.5 text-primary" />
          <span className="hidden sm:inline-capitalize">
            {preset === 'signal' ? 'Signal' : 'Indigo'} · {density === 'compact' ? 'Compact' : 'Comfy'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 text-xs">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Theme Preset
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => setPreset('signal')}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[oklch(0.62_0.2_42)]" />
              <span>Signal Ops (Amber)</span>
            </div>
            {preset === 'signal' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setPreset('indigo')}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[oklch(0.55_0.22_265)]" />
              <span>Modern SaaS (Indigo)</span>
            </div>
            {preset === 'indigo' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Display Density
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => setDensity('comfortable')}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Rows3 className="size-3.5 text-muted-foreground" />
              <span>Comfortable (Spacious)</span>
            </div>
            {density === 'comfortable' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setDensity('compact')}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Rows4 className="size-3.5 text-muted-foreground" />
              <span>Compact (High Density)</span>
            </div>
            {density === 'compact' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Color Mode
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => setTheme('light')}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sun className="size-3.5 text-muted-foreground" />
              <span>Light</span>
            </div>
            {theme === 'light' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setTheme('dark')}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Moon className="size-3.5 text-muted-foreground" />
              <span>Dark</span>
            </div>
            {theme === 'dark' && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setTheme('system')}
            className="flex items-center justify-between cursor-pointer"
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

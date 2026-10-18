'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, Command, Search, Sparkles } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { ThemePresetSwitcher } from '@/components/shell/theme-preset-switcher';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface Crumb {
  href: string;
  label: string;
}

export function DashboardHeader({
  crumbs,
  environment = 'Live',
  onOpenCommandPalette,
  onOpenNotifications,
  unreadNotificationsCount = 0,
}: {
  crumbs: Crumb[];
  environment?: string;
  onOpenCommandPalette: () => void;
  onOpenNotifications: () => void;
  unreadNotificationsCount?: number;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-13 shrink-0 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 lg:px-6 luxury-sheen transition-colors">
      <SidebarTrigger className="-ml-1.5 size-7 text-muted-foreground transition-colors hover:text-foreground" />
      <Separator orientation="vertical" className="mr-1 opacity-40 data-[orientation=vertical]:h-3.5" />

      {/* Breadcrumbs */}
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap text-xs">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <React.Fragment key={`${c.href}-${i}`}>
                <BreadcrumbItem className={i > 0 && !last ? 'hidden md:inline-flex' : 'min-w-0'}>
                  {last ? (
                    <BreadcrumbPage className="truncate font-medium text-foreground tracking-tight">
                      {c.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild className="text-muted-foreground/80 hover:text-foreground transition-colors">
                      <Link href={c.href as never}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && (
                  <BreadcrumbSeparator className={i > 0 ? 'hidden md:inline-flex opacity-40' : 'opacity-40'} />
                )}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Right-aligned action cluster */}
      <div className="ml-auto flex items-center gap-2">
        {/* Raycast-style Sleek Command Palette Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="group flex h-8 items-center gap-2.5 rounded-full border border-border/70 bg-card/40 px-3 text-xs text-muted-foreground backdrop-blur-md transition-all duration-200 hover:border-primary/40 hover:bg-card/70 hover:text-foreground hover:shadow-[0_0_20px_-4px_var(--primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Search className="size-3.5 text-muted-foreground/80 transition-colors group-hover:text-primary" />
          <span className="hidden sm:inline-block font-normal tracking-tight">Search or jump to...</span>
          <kbd className="pointer-events-none hidden sm:inline-flex h-4.5 select-none items-center gap-0.5 rounded-full border border-border/80 bg-muted/60 px-1.5 font-mono text-[10px] text-muted-foreground group-hover:border-primary/30 group-hover:text-foreground transition-colors">
            <span className="text-[10px]">⌘</span>K
          </kbd>
        </button>

        {/* Theme Preset & Density Switcher */}
        <ThemePresetSwitcher />

        {/* Notification Bell */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenNotifications}
                className="relative size-8 rounded-full text-muted-foreground transition-colors hover:text-foreground hover:bg-card/60"
                aria-label="Open notifications"
              >
                <Bell className="size-3.5" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-xs">
              Notifications & Alerts
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Telemetry Status Pill */}
        <span className="hidden items-center gap-2 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:inline-flex backdrop-blur-md">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-online opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-status-online" />
          </span>
          {environment}
        </span>
      </div>
    </header>
  );
}

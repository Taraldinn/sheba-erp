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
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:px-6">
      <SidebarTrigger className="-ml-1.5 size-8 text-muted-foreground hover:text-foreground" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />

      {/* Breadcrumbs */}
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <React.Fragment key={`${c.href}-${i}`}>
                <BreadcrumbItem className={i > 0 && !last ? 'hidden md:inline-flex' : 'min-w-0'}>
                  {last ? (
                    <BreadcrumbPage className="truncate font-medium">{c.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={c.href as never}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && <BreadcrumbSeparator className={i > 0 ? 'hidden md:inline-flex' : undefined} />}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Right-aligned action cluster */}
      <div className="ml-auto flex items-center gap-2">
        {/* Command Palette Trigger */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCommandPalette}
          className="h-8 gap-2 px-2.5 text-xs text-muted-foreground hover:text-foreground border-border bg-card/60 shadow-xs"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline-block">Search or jump to...</span>
          <kbd className="pointer-events-none hidden md:inline-flex h-4.5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

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
                className="relative size-8 text-muted-foreground hover:text-foreground"
                aria-label="Open notifications"
              >
                <Bell className="size-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1 right-1 flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
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
        <span className="hidden items-center gap-2 rounded-md border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:inline-flex bg-card/40">
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

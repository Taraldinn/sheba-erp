'use client';

import { Suspense, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { PortalSidebar } from '@/components/portal-sidebar';
import { ErrorBoundary } from '@/components/error-boundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DashboardHeader, type Crumb } from '@/components/shell/dashboard-header';
import { CommandPalette } from '@/components/shell/command-palette';
import { NotificationDrawer } from '@/components/shell/notification-drawer';
import { QuickActionHub } from '@/components/shell/quick-action-hub';

const ID_LIKE = /^([0-9]+|[0-9a-f]{8,}(-[0-9a-f]{4,})*)$/i;

function humanize(segment: string) {
  if (ID_LIKE.test(segment)) return 'Details';
  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b(olts?|onus?|pppoe|ip|vlans?|pbx|hr)\b/gi, (m) => m.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

function useCrumbs(rootHref: string, rootLabel: string): Crumb[] {
  const pathname = usePathname() ?? rootHref;
  const rest = pathname.replace(rootHref, '').split('/').filter(Boolean);
  const crumbs: Crumb[] = [{ href: rootHref, label: rootLabel }];
  rest.forEach((seg, i) => {
    crumbs.push({
      href: `${rootHref}/${rest.slice(0, i + 1).join('/')}`,
      label: humanize(seg),
    });
  });
  if (crumbs.length === 1) crumbs.push({ href: rootHref, label: 'Overview' });
  return crumbs;
}

function RouteFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function DashboardShell({
  rootHref,
  rootLabel,
  environment = 'Live',
  banner,
  errorLabel,
  children,
}: {
  rootHref: string;
  rootLabel: string;
  environment?: string;
  banner?: ReactNode;
  errorLabel: string;
  children: ReactNode;
}) {
  const crumbs = useCrumbs(rootHref, rootLabel);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <PortalSidebar />
        <SidebarInset className="min-w-0 bg-background">
          {banner}

          <DashboardHeader
            crumbs={crumbs}
            environment={environment}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenNotifications={() => setNotificationsOpen(true)}
            unreadNotificationsCount={3}
          />

          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[1500px]">
              <ErrorBoundary label={errorLabel}>
                <Suspense fallback={<RouteFallback />}>{children}</Suspense>
              </ErrorBoundary>
            </div>
          </main>

          {/* Interactive Shell Additions */}
          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
          />
          <NotificationDrawer
            open={notificationsOpen}
            onOpenChange={setNotificationsOpen}
          />
          <QuickActionHub />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

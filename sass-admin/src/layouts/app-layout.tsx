import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  Folder,
  HomeLine,
  LayoutAlt01,
  MessageChatCircle,
  PieChart03,
  Rows01,
  Settings01,
  SearchLg,
  Plus,
  CreditCard01,
  ShieldTick,
} from "@untitledui/icons";
import {
  MobileNavigationHeader,
  NavAccountCard,
  NavList
} from "@/components/application/app-navigation/sidebar-navigation-base";
import type { NavItemDividerType, NavItemType } from "@/components/application/app-navigation/config";
import { UntitledLogo } from "@/components/foundations/logo/untitledui-logo";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import { saasApi } from "@/api/client";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingOnboardingCount, setPendingOnboardingCount] = useState<number>(2);

  useEffect(() => {
    saasApi.getOnboardingRequests().then((requests) => {
      const pending = requests.filter((r) => r.status === 'pending').length;
      setPendingOnboardingCount(pending);
    }).catch(console.error);
  }, [location.pathname]);

  const navItems: (NavItemType | NavItemDividerType)[] = [
    {
      label: "Dashboard",
      href: "/",
      icon: HomeLine,
    },
    {
      label: "Tenants",
      href: "/tenants",
      icon: Rows01,
    },
    {
      label: "Domains",
      href: "/domains",
      icon: LayoutAlt01,
    },
    {
      label: "Onboarding",
      href: "/onboarding",
      icon: MessageChatCircle,
      badge: pendingOnboardingCount > 0 ? pendingOnboardingCount : undefined,
    },
    { divider: true },
    {
      label: "Packages",
      href: "/packages",
      icon: PieChart03,
    },
    {
      label: "Subscriptions",
      href: "/subscriptions",
      icon: Settings01,
    },
    {
      label: "Payments",
      href: "/payments",
      icon: CreditCard01,
    },
    { divider: true },
    {
      label: "Backups",
      href: "/backups",
      icon: Folder,
    },
    {
      label: "Audit Logs",
      href: "/audit-logs",
      icon: ShieldTick,
    },
  ];

  const MAIN_SIDEBAR_WIDTH = 280;

  const sidebarContent = (
    <aside
      style={{ width: `${MAIN_SIDEBAR_WIDTH}px` }}
      className="flex h-full w-full max-w-full flex-col justify-between overflow-y-auto bg-primary pt-5 shadow-xs border-r border-secondary"
    >
      <div className="flex flex-col gap-5 px-5">
        <div className="flex items-center justify-between">
          <UntitledLogo className="h-7" />
          <Badge color="brand" size="sm">
            SaaS Admin
          </Badge>
        </div>

        {/* Global Search input */}
        <Input
          shortcut="⌘K"
          size="sm"
          aria-label="Search SaaS Console"
          placeholder="Search SaaS..."
          icon={SearchLg}
        />
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <NavList activeUrl={location.pathname} items={navItems} />
      </div>

      {/* Footer / Account / Status Section */}
      <div className="mt-auto flex flex-col gap-3 px-4 py-4 border-t border-secondary">
        <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-solid opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success-solid"></span>
            </span>
            <span className="font-medium text-secondary">Control Plane</span>
          </div>
          <span className="text-tertiary">v2.4.0</span>
        </div>

        <NavAccountCard selectedAccountId="caitlyn" />
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-secondary_alt text-primary flex">
      {/* Mobile Header & Drawer */}
      <MobileNavigationHeader>{sidebarContent}</MobileNavigationHeader>

      {/* Desktop Fixed Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex z-30">
        {sidebarContent}
      </div>

      {/* Spacer to push main content right on desktop */}
      <div
        style={{ width: `${MAIN_SIDEBAR_WIDTH}px` }}
        className="hidden lg:block shrink-0"
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 hidden lg:flex h-16 items-center justify-between border-b border-secondary bg-primary/95 px-8 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-tertiary capitalize">
              {location.pathname === '/' ? 'Dashboard' : location.pathname.replace('/', '').replace('-', ' ')}
            </h2>
            <span className="text-quaternary">/</span>
            <span className="text-xs text-brand-secondary font-medium bg-brand-primary_alt px-2 py-0.5 rounded-full">
              Production
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              color="secondary"
              size="sm"
              iconLeading={Plus}
              onPress={() => navigate('/tenants')}
            >
              Add Tenant
            </Button>
            <Button
              color="secondary"
              size="sm"
              iconLeading={Folder}
              onPress={() => navigate('/backups')}
            >
              New Backup
            </Button>
          </div>
        </header>

        {/* Page View Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

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
  Sliders01,
  Users01,
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
import { ThemeToggle, ThemeToggleSegmented } from "@/components/application/theme/theme-toggle";
import { saasApi, STORAGE_KEYS, tenantApi } from "@/api/client";
import { PlaneSwap } from "@/components/onboarding/plane-swap";
import { DevPortalSwitcher } from "@/portal/dev-portal-switcher";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingOnboardingCount, setPendingOnboardingCount] = useState<number>(2);
  const [currentUser, setCurrentUser] = useState({
    id: "admin",
    name: "Caitlyn King",
    email: "admin@sheba.app",
    avatar: "https://www.untitledui.com/images/avatars/caitlyn-king?fm=webp&q=80",
    status: "online" as const,
  });

  const token = localStorage.getItem(STORAGE_KEYS.centralToken) || localStorage.getItem(STORAGE_KEYS.tenantToken);

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    saasApi.me().then((user) => {
      if (user && user.name) {
        setCurrentUser((prev) => ({
          ...prev,
          name: user.name,
          email: user.email || prev.email,
        }));
      }
    }).catch(console.error);
  }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    saasApi.getOnboardingRequests().then((requests) => {
      const pending = requests.filter((r: { status?: string }) => r.status === 'pending').length;
      setPendingOnboardingCount(pending);
    }).catch(console.error);
  }, [location.pathname, token]);

  const handleSignOut = async () => {
    await Promise.allSettled([saasApi.logout(), tenantApi.logout()]);
    navigate('/login', { replace: true });
  };

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
      label: "Feature Matrix",
      href: "/feature-matrix",
      icon: Sliders01,
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
    {
      label: "Team & Staff",
      href: "/employees",
      icon: Users01,
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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-tertiary">Theme</span>
          </div>
          <ThemeToggleSegmented className="w-full" size="sm" />
        </div>

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

        <PlaneSwap />

        <NavAccountCard
          selectedAccountId={currentUser.id}
          items={[currentUser]}
          onSignOut={handleSignOut}
        />
      </div>
    </aside>
  );

  if (!token) {
    return (
      <div className="min-h-screen bg-secondary_alt flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-solid border-t-transparent" />
      </div>
    );
  }

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
            <ThemeToggle variant="dropdown" showLabels size="sm" />
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

      <DevPortalSwitcher />
    </div>
  );
}

export const SuperAdminLayout = AppLayout;

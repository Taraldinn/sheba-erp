import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  BarChart01,
  LayersThree01,
  Receipt,
  Server01,
  Settings01,
  Ticket01,
  Users01,
  SearchLg,
  Plus,
} from "@untitledui/icons";
import {
  MobileNavigationHeader,
  NavAccountCard,
  NavList
} from "@/components/application/app-navigation/sidebar-navigation-base";
import type { NavItemDividerType, NavItemType } from "@/components/application/app-navigation/config";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { tenantApi, STORAGE_KEYS } from "@/api/client";
import { DevPortalSwitcher } from "@/portal/dev-portal-switcher";

const MAIN_SIDEBAR_WIDTH = 296;

export function IspLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [currentUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.tenantUser);
      if (raw) {
        const u = JSON.parse(raw);
        return {
          id: u.id || "isp_staff",
          name: u.username || u.name || "NOC Operator",
          email: u.email || "noc@isp.local",
          avatar: "https://www.untitledui.com/images/avatars/caitlyn-king?fm=webp&q=80",
          status: "online" as const,
        };
      }
    } catch {}
    return {
      id: "isp_staff",
      name: "ISP Network Admin",
      email: "admin@isp.local",
      avatar: "https://www.untitledui.com/images/avatars/caitlyn-king?fm=webp&q=80",
      status: "online" as const,
    };
  });

  const handleSignOut = async () => {
    await tenantApi.logout();
    navigate('/login', { replace: true });
  };

  const navItems: (NavItemType | NavItemDividerType)[] = [
    {
      label: "Operations Cockpit",
      href: "/",
      icon: BarChart01,
    },
    {
      label: "Subscribers",
      href: "/customers",
      icon: Users01,
      badge: "2.4k",
    },
    {
      label: "Billing & Invoices",
      href: "/billing",
      icon: Receipt,
    },
    {
      label: "Network & MikroTik",
      href: "/network",
      icon: Server01,
    },
    {
      label: "Reseller Hierarchy",
      href: "/resellers",
      icon: LayersThree01,
    },
    {
      label: "Support Tickets",
      href: "/tickets",
      icon: Ticket01,
      badge: "4",
    },
    {
      divider: true,
    },
    {
      label: "ISP Settings",
      href: "/settings",
      icon: Settings01,
    },
  ];

  const sidebarContent = (
    <div
      style={{ width: `${MAIN_SIDEBAR_WIDTH}px` }}
      className="flex h-full flex-col justify-between border-r border-border-secondary bg-bg-primary px-4 py-6"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-bg-brand-solid text-white shadow-sm">
              <Server01 className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-primary">Sheba ISP</span>
                <span className="rounded bg-brand-50 px-1.5 py-0.2 text-[10px] font-medium text-fg-brand-primary">
                  ERP
                </span>
              </div>
              <p className="text-[11px] text-tertiary">Broadband & Operations</p>
            </div>
          </div>
        </div>

        <Input
          placeholder="Search subscribers, routers..."
          icon={SearchLg}
          size="sm"
          className="w-full"
        />

        <NavList items={navItems} />
      </div>

      <div className="flex flex-col gap-4 border-t border-border-secondary pt-4">
        <NavAccountCard
          selectedAccountId={currentUser.id}
          items={[currentUser]}
          onSignOut={handleSignOut}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-secondary text-primary flex">
      <MobileNavigationHeader>{sidebarContent}</MobileNavigationHeader>

      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex z-30">
        {sidebarContent}
      </div>

      <div
        style={{ width: `${MAIN_SIDEBAR_WIDTH}px` }}
        className="hidden lg:block shrink-0"
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 hidden lg:flex h-16 items-center justify-between border-b border-border-secondary bg-bg-primary/95 px-8 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-secondary capitalize">
              {location.pathname === '/' ? 'Operations Cockpit' : location.pathname.replace('/', '').replace('-', ' ')}
            </h2>
            <span className="text-quaternary">/</span>
            <span className="text-xs text-fg-brand-primary font-medium bg-brand-50 px-2 py-0.5 rounded-full">
              ISP Workspace
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle variant="dropdown" showLabels size="sm" />
            <Button
              color="primary"
              size="sm"
              iconLeading={Plus}
              onPress={() => navigate('/customers')}
            >
              Add Subscriber
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      <DevPortalSwitcher />
    </div>
  );
}

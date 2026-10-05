import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  Globe01,
  Receipt,
  Zap,
  Signal01,
  Ticket01,
  Users01,
  Settings01,
} from "@untitledui/icons";
import {
  MobileNavigationHeader,
  NavAccountCard,
  NavList
} from "@/components/application/app-navigation/sidebar-navigation-base";
import type { NavItemDividerType, NavItemType } from "@/components/application/app-navigation/config";
import { Button } from "@/components/base/buttons/button";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { tenantApi, STORAGE_KEYS } from "@/api/client";
import { DevPortalSwitcher } from "@/portal/dev-portal-switcher";
import { usePortal } from "@/portal/portal-provider";
import { TenantBrandingInjector } from "@/portal/tenant-branding";

const MAIN_SIDEBAR_WIDTH = 280;

export function TenantLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const portal = usePortal();

  const tenantName = portal.branding?.name || `${portal.tenantSlug || 'Subscriber'} Portal`;

  const [currentUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.tenantUser);
      if (raw) {
        const u = JSON.parse(raw);
        return {
          id: u.id || "subscriber",
          name: u.username || u.name || "Active Subscriber",
          email: u.email || `${portal.tenantSlug || 'user'}@subscriber.local`,
          avatar: "https://www.untitledui.com/images/avatars/caitlyn-king?fm=webp&q=80",
          status: "online" as const,
        };
      }
    } catch {}
    return {
      id: "subscriber",
      name: "Subscribed User",
      email: `${portal.tenantSlug || 'subscriber'}@portal.local`,
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
      label: "My Account",
      href: "/",
      icon: Globe01,
    },
    {
      label: "Profile & KYC",
      href: "/customers",
      icon: Users01,
    },
    {
      label: "Bills & Invoices",
      href: "/billing",
      icon: Receipt,
      badge: "Due: ৳1,000",
    },
    {
      label: "Subscriptions",
      href: "/subscriptions",
      icon: Zap,
    },
    {
      label: "Usage Analytics",
      href: "/reports",
      icon: Signal01,
    },
    {
      divider: true,
    },
    {
      label: "Helpdesk & Support",
      href: "/tickets",
      icon: Ticket01,
    },
    {
      label: "Preferences",
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
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-bg-brand-solid text-white shadow-sm">
            <Globe01 className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-primary truncate">{tenantName}</h1>
            <p className="text-[11px] text-tertiary">Subscriber Self-Care</p>
          </div>
        </div>

        <div className="rounded-xl border border-border-secondary bg-bg-secondary p-3">
          <div className="flex items-center justify-between text-xs text-tertiary">
            <span>Connection Status</span>
            <span className="flex items-center gap-1 font-medium text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-primary">
            50 Mbps Premium Fiber
          </div>
          <p className="text-[11px] text-tertiary">Expires in 14 days</p>
        </div>

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
      <TenantBrandingInjector />
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
              {location.pathname === '/' ? 'My Account' : location.pathname.replace('/', '').replace('-', ' ')}
            </h2>
            <span className="text-quaternary">/</span>
            <span className="text-xs text-fg-brand-primary font-medium bg-brand-50 px-2 py-0.5 rounded-full">
              {tenantName}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle variant="dropdown" showLabels size="sm" />
            <Button
              color="primary"
              size="sm"
              iconLeading={Zap}
              onPress={() => navigate('/recharge')}
            >
              Pay Bill Now
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

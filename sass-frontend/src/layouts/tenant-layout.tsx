import React from 'react';
import { Outlet } from 'react-router';
import {
  Globe01,
  Receipt,
  Zap,
  Signal01,
  Ticket01,
  Users01,
  Settings01,
} from "@untitledui/icons";
import type { NavItemDividerType, NavItemType } from "@/components/application/app-navigation/config";
import { AppShell } from "@/components/application/app-shell/app-shell";
import { TenantBrandingInjector } from "@/portal/tenant-branding";
import { usePortal } from "@/portal/portal-provider";

export function TenantLayout() {
  const portal = usePortal();
  const tenantName = portal.branding?.name || `${portal.tenantSlug || 'Subscriber'} Portal`;

  const navItems: (NavItemType | NavItemDividerType)[] = [
    { label: "My Account", href: "/", icon: Globe01 },
    { label: "Profile & KYC", href: "/customers", icon: Users01 },
    { label: "Bills & Invoices", href: "/billing", icon: Receipt },
    { label: "Subscriptions", href: "/subscriptions", icon: Zap },
    { label: "Usage Analytics", href: "/reports", icon: Signal01 },
    { divider: true },
    { label: "Helpdesk & Support", href: "/tickets", icon: Ticket01 },
    { label: "Preferences", href: "/settings", icon: Settings01 },
  ];

  return (
    <>
      <TenantBrandingInjector />
      <AppShell navItems={navItems} portalName={tenantName} portalBadge="Subscriber Portal">
        <Outlet />
      </AppShell>
    </>
  );
}

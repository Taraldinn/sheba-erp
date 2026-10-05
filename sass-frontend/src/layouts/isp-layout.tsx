import React from 'react';
import { Outlet } from 'react-router';
import {
  BarChart01,
  Receipt,
  Server01,
  Settings01,
  Ticket01,
  Users01,
  CreditCard01,
  CpuChip01,
  Signal01,
  File06,
} from "@untitledui/icons";
import type { NavItemDividerType, NavItemType } from "@/components/application/app-navigation/config";
import { AppShell } from "@/components/application/app-shell/app-shell";

export function IspLayout() {
  const navItems: (NavItemType | NavItemDividerType)[] = [
    { label: "Operations Cockpit", href: "/", icon: BarChart01 },
    { label: "Subscribers", href: "/customers", icon: Users01 },
    { label: "Billing & Invoices", href: "/billing", icon: Receipt },
    { label: "Subscriptions", href: "/subscriptions", icon: CreditCard01 },
    { divider: true },
    { label: "MikroTik Routers", href: "/mikrotik", icon: Server01 },
    { label: "PPPoE Sessions", href: "/pppoe", icon: CpuChip01 },
    { label: "OLT Management", href: "/olt", icon: Signal01 },
    { label: "ONU Inventory", href: "/onu", icon: Server01 },
    { divider: true },
    { label: "Helpdesk & Tickets", href: "/tickets", icon: Ticket01 },
    { label: "Financial Reports", href: "/reports", icon: File06 },
    { label: "ISP System Settings", href: "/settings", icon: Settings01 },
  ];

  return (
    <AppShell navItems={navItems} portalName="ISP Operations" portalBadge="ISP Admin">
      <Outlet />
    </AppShell>
  );
}

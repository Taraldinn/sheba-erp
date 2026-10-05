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
  CreditCard01,
  ShieldTick,
  Sliders01,
  Users01,
} from "@untitledui/icons";
import type { NavItemDividerType, NavItemType } from "@/components/application/app-navigation/config";
import { saasApi, STORAGE_KEYS } from "@/api/client";
import { AppShell } from "@/components/application/app-shell/app-shell";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingOnboardingCount, setPendingOnboardingCount] = useState<number>(0);

  const token = localStorage.getItem(STORAGE_KEYS.centralToken) || localStorage.getItem(STORAGE_KEYS.tenantToken);

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
  }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    saasApi.getOnboardingRequests().then((requests) => {
      const pending = requests.filter((r: { status?: string }) => r.status === 'pending').length;
      setPendingOnboardingCount(pending);
    }).catch(() => {});
  }, [location.pathname, token]);

  const navItems: (NavItemType | NavItemDividerType)[] = [
    { label: "Dashboard", href: "/", icon: HomeLine },
    { label: "Tenants", href: "/tenants", icon: Rows01 },
    { label: "Feature Matrix", href: "/feature-matrix", icon: Sliders01 },
    { label: "Domains", href: "/domains", icon: LayoutAlt01 },
    {
      label: "Onboarding",
      href: "/onboarding",
      icon: MessageChatCircle,
      badge: pendingOnboardingCount > 0 ? pendingOnboardingCount : undefined,
    },
    { divider: true },
    { label: "Packages", href: "/packages", icon: PieChart03 },
    { label: "Subscriptions", href: "/subscriptions", icon: Settings01 },
    { label: "Payments", href: "/payments", icon: CreditCard01 },
    { divider: true },
    { label: "Backups", href: "/backups", icon: Folder },
    { label: "Audit Logs", href: "/audit-logs", icon: ShieldTick },
    { label: "Team & Staff", href: "/employees", icon: Users01 },
  ];

  return (
    <AppShell navItems={navItems} portalName="ShebaFi Platform" portalBadge="Super Admin">
      <Outlet />
    </AppShell>
  );
}

export const SuperAdminLayout = AppLayout;

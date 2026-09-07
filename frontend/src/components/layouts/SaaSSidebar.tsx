"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Inbox,
  Globe,
  Users,
  KeyRound,
  Layers,
  CreditCard,
  Receipt,
  Database,
  DownloadCloud,
  FileText,
  ShieldCheck,
  LogOut,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClient } from "@/lib/api";

export function SaaSSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(2);
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";

  useEffect(() => {
    async function checkPending() {
      try {
        const reqs = await ApiClient.getSaaSTenantRequests();
        if (Array.isArray(reqs)) {
          const pending = reqs.filter((r: any) => r.status === "pending").length;
          setPendingRequestsCount(pending);
        }
      } catch {}
    }
    checkPending();
  }, []);

  const navSections = [
    {
      title: "PLATFORM OVERVIEW",
      items: [
        {
          tab: "overview",
          label: "SaaS Command Center",
          icon: LayoutDashboard,
          href: "/saas-admin?tab=overview",
        },
      ],
    },
    {
      title: "TENANT MANAGEMENT",
      items: [
        {
          tab: "tenants",
          label: "Active ISP Tenants",
          icon: Building2,
          href: "/saas-admin?tab=tenants",
        },
        {
          tab: "requests",
          label: "Onboarding Requests",
          icon: Inbox,
          href: "/saas-admin?tab=requests",
          badge: pendingRequestsCount > 0 ? `${pendingRequestsCount} Pending` : undefined,
          badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        },
        {
          tab: "domains",
          label: "Domain Routing & DNS",
          icon: Globe,
          href: "/saas-admin?tab=domains",
        },
      ],
    },
    {
      title: "SOFTWARE USERS & ROLES",
      items: [
        {
          tab: "users",
          label: "Platform Super Admins",
          icon: ShieldCheck,
          href: "/saas-admin?tab=users",
        },
        {
          tab: "tenant-owners",
          label: "Tenant Master Accounts",
          icon: Users,
          href: "/saas-admin?tab=tenant-owners",
        },
      ],
    },
    {
      title: "SUBSCRIPTIONS & BILLING",
      items: [
        {
          tab: "packages",
          label: "SaaS Packages & Tiers",
          icon: Layers,
          href: "/saas-admin?tab=packages",
        },
        {
          tab: "subscriptions",
          label: "Tenant Subscriptions",
          icon: CreditCard,
          href: "/saas-admin?tab=subscriptions",
        },
        {
          tab: "payments",
          label: "Software Payment Ledger",
          icon: Receipt,
          href: "/saas-admin?tab=payments",
        },
      ],
    },
    {
      title: "DISASTER RECOVERY",
      items: [
        {
          tab: "backups",
          label: "Database Backups",
          icon: Database,
          href: "/saas-admin?tab=backups",
        },
        {
          tab: "exports",
          label: "Single-Tenant Data Export",
          icon: DownloadCloud,
          href: "/saas-admin?tab=exports",
        },
      ],
    },
    {
      title: "SYSTEM",
      items: [
        {
          tab: "audit",
          label: "Global Audit Stream",
          icon: FileText,
          href: "/saas-admin?tab=audit",
        },
      ],
    },
  ];

  const handleLogout = () => {
    localStorage.removeItem("sheba_token");
    localStorage.removeItem("sheba_auth_token");
    localStorage.removeItem("sheba_user_role");
    localStorage.removeItem("sheba_user_name");
    window.location.href = "/login";
  };

  return (
    <aside
      className={`relative flex flex-col border-r border-border bg-card/95 backdrop-blur-md transition-all duration-300 z-40 select-none ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/30">
            <ShieldCheck className="h-5 w-5" />
          </div>

          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-black text-xs tracking-tight text-foreground truncate">
                ShebaFi Global
              </span>
              <span className="text-[10px] font-mono text-violet-400 font-semibold truncate">
                admin.shebafi.xyz
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-6 w-6 rounded-md hover:bg-muted text-muted-foreground flex items-center justify-center transition-colors"
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Overseer Badge */}
      {!collapsed && (
        <div className="p-3 pb-1">
          <div className="px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-violet-300">
              <Sparkles className="h-3 w-3 text-violet-400" />
              <span>SaaS Platform Overseer</span>
            </div>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {!collapsed && (
              <p className="px-2.5 text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                {section.title}
              </p>
            )}

            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.tab;

              return (
                <Link key={item.tab} href={item.href}>
                  <div
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? "bg-violet-600 text-white shadow-sm shadow-violet-600/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-muted-foreground"}`} />

                    {!collapsed && (
                      <div className="flex-1 flex items-center justify-between truncate">
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1.5 py-0 h-4 border ${item.badgeColor || ""}`}
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer / Switcher / Logout */}
      <div className="p-3 border-t border-border space-y-2">
        {!collapsed && (
          <Link href="/">
            <Button
              size="sm"
              variant="outline"
              className="w-full text-[11px] justify-between h-8 bg-muted/30 border-dashed border-border text-indigo-300 hover:text-white"
            >
              <span>Launch ISP ERP</span>
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={handleLogout}
          className={`w-full text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-8 gap-2 ${
            collapsed ? "justify-center px-0" : "justify-start"
          }`}
          title="Logout from Control Plane"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </Button>
      </div>
    </aside>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Activity,
  Receipt,
  CreditCard,
  RefreshCw,
  Server,
  Cpu,
  Radio,
  LifeBuoy,
  UsersRound,
  Layers,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  LogOut,
  X,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface SubMenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tabParam?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredRoles?: string[];
  items: SubMenuItem[];
}

interface SingleNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredRoles?: string[];
  badge?: string;
}

type NavEntry =
  | { type: "single"; data: SingleNavItem }
  | { type: "group"; data: NavGroup };

interface Section {
  title?: string;
  entries: NavEntry[];
}

// Clean authoritative ISP ERP navigation structure
const ispNavSections: Section[] = [
  {
    entries: [
      {
        type: "single",
        data: { href: "/", label: "Dashboard", icon: LayoutDashboard },
      },
    ],
  },
  {
    title: "Operations",
    entries: [
      {
        type: "group",
        data: {
          id: "customers",
          label: "Customers",
          icon: Users,
          items: [
            { href: "/customers", label: "All Customers", icon: Users },
            { href: "/online-sessions", label: "Online Sessions", icon: Activity },
          ],
        },
      },
      {
        type: "group",
        data: {
          id: "billing",
          label: "Billing",
          icon: Receipt,
          requiredRoles: ["SUPER_ADMIN", "ADMIN", "BILLING", "BILLING_OPERATOR"],
          items: [
            { href: "/billing?tab=invoices", label: "Invoices", icon: Receipt, tabParam: "invoices" },
            { href: "/payments", label: "Payments", icon: CreditCard },
            { href: "/billing?tab=recharges", label: "Recharges", icon: RefreshCw, tabParam: "recharges" },
          ],
        },
      },
      {
        type: "group",
        data: {
          id: "network",
          label: "Network",
          icon: Server,
          requiredRoles: ["SUPER_ADMIN", "ADMIN", "TECHNICIAN", "LINE_MAN"],
          items: [
            { href: "/routers", label: "Routers", icon: Server },
            { href: "/olt?tab=olts", label: "OLTs", icon: Cpu, tabParam: "olts" },
            { href: "/olt?tab=onus", label: "ONUs", icon: Radio, tabParam: "onus" },
          ],
        },
      },
      {
        type: "single",
        data: {
          href: "/support",
          label: "Support Tickets",
          icon: LifeBuoy,
        },
      },
    ],
  },
  {
    title: "Administration",
    entries: [
      {
        type: "single",
        data: {
          href: "/staff",
          label: "Office Staff",
          icon: UsersRound,
          requiredRoles: ["SUPER_ADMIN", "ADMIN"],
        },
      },
      {
        type: "single",
        data: {
          href: "/packages",
          label: "Packages",
          icon: Layers,
          requiredRoles: ["SUPER_ADMIN", "ADMIN", "BILLING", "BILLING_OPERATOR"],
        },
      },
      {
        type: "single",
        data: {
          href: "/settings",
          label: "Settings",
          icon: Settings,
          requiredRoles: ["SUPER_ADMIN", "ADMIN"],
        },
      },
    ],
  },
];

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "ISP Admin",
  BILLING: "Billing Operator",
  BILLING_OPERATOR: "Billing Operator",
  TECHNICIAN: "NOC Engineer",
  LINE_MAN: "Field Technician",
  SUPPORT_STAFF: "Support Specialist",
  STAFF: "ISP Staff",
};

export interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ isMobileOpen = false, onCloseMobile }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, logout, tenantId } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    customers: true,
    billing: true,
    network: true,
  });

  const userRole = (user?.role || "ADMIN").toUpperCase();
  const tenantName = user?.tenant?.name || tenantId || "Active ISP";

  // Check role authorization for entry
  const isAuthorized = (requiredRoles?: string[]) => {
    if (!requiredRoles || requiredRoles.length === 0) return true;
    if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") return true;
    return requiredRoles.includes(userRole);
  };

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isSingleActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isSubItemActive = (sub: SubMenuItem) => {
    const urlParts = sub.href.split("?");
    const pathPart = urlParts[0];
    if (pathname !== pathPart) return false;

    if (sub.tabParam) {
      const currentTab = searchParams?.get("tab");
      return currentTab === sub.tabParam;
    }
    return true;
  };

  const handleNavClick = () => {
    if (isMobileOpen && onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleLogout = async () => {
    try {
      await logout("/login");
    } catch {
      router.push("/login");
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-card border-r border-border select-none">
      {/* Brand Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3.5">
        <Link
          href="/"
          onClick={handleNavClick}
          className="flex items-center gap-2.5 min-w-0"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 text-white shadow-md shadow-indigo-600/20">
            <Radio className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-black tracking-tight text-foreground truncate">
                SHEBA ISP ERP
              </span>
              <span className="text-[10px] text-muted-foreground font-medium truncate uppercase tracking-wider">
                {tenantName}
              </span>
            </div>
          )}
        </Link>

        {isMobileOpen && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-4">
        {ispNavSections.map((section, sIdx) => {
          // Filter entries by permissions
          const visibleEntries = section.entries.filter((entry) => {
            if (entry.type === "single") {
              return isAuthorized(entry.data.requiredRoles);
            }
            return isAuthorized(entry.data.requiredRoles);
          });

          if (visibleEntries.length === 0) return null;

          return (
            <div key={sIdx} className="space-y-1">
              {section.title && !collapsed && (
                <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  {section.title}
                </div>
              )}

              <div className="space-y-0.5">
                {visibleEntries.map((entry, eIdx) => {
                  if (entry.type === "single") {
                    const active = isSingleActive(entry.data.href);
                    const Icon = entry.data.icon;
                    return (
                      <Link
                        key={eIdx}
                        href={entry.data.href}
                        onClick={handleNavClick}
                        title={collapsed ? entry.data.label : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors group relative",
                          active
                            ? "bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 font-semibold"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          collapsed && "justify-center px-0"
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-105", active ? "text-indigo-600 dark:text-indigo-400" : "")} />
                        {!collapsed && <span className="truncate">{entry.data.label}</span>}
                        {!collapsed && entry.data.badge && (
                          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500">
                            {entry.data.badge}
                          </span>
                        )}
                      </Link>
                    );
                  }

                  // Collapsible Group
                  const group = entry.data;
                  const isOpen = openGroups[group.id] || false;
                  const GroupIcon = group.icon;
                  const isGroupChildActive = group.items.some((it) => isSubItemActive(it));

                  return (
                    <div key={group.id} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        title={collapsed ? group.label : undefined}
                        className={cn(
                          "flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors group cursor-pointer",
                          isGroupChildActive
                            ? "text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-600/5"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          collapsed && "justify-center px-0"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <GroupIcon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-105", isGroupChildActive ? "text-indigo-600 dark:text-indigo-400" : "")} />
                          {!collapsed && <span className="truncate">{group.label}</span>}
                        </div>
                        {!collapsed && (
                          <span className="text-muted-foreground/60 transition-transform duration-200">
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </span>
                        )}
                      </button>

                      {/* Submenu Accordion Items */}
                      {!collapsed && isOpen && (
                        <div className="pl-6 pr-1 py-0.5 space-y-0.5 border-l border-border/60 ml-4.5 my-0.5">
                          {group.items.map((sub, sIndex) => {
                            const subActive = isSubItemActive(sub);
                            const SubIcon = sub.icon;
                            return (
                              <Link
                                key={sIndex}
                                href={sub.href}
                                onClick={handleNavClick}
                                className={cn(
                                  "flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                                  subActive
                                    ? "bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 font-semibold"
                                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                )}
                              >
                                <SubIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{sub.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer Items (Role badge, Logout, Collapse) */}
      <div className="shrink-0 border-t border-border p-2 space-y-1 bg-card/60">
        {/* Active Staff Role Summary */}
        {!collapsed && user && (
          <div className="px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/50 text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-1.5 truncate">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span className="font-medium text-foreground truncate">
                {ROLE_DISPLAY_NAMES[userRole] || userRole}
              </span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {user.username}
            </span>
          </div>
        )}

        {/* Dedicated Logout */}
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10 dark:hover:bg-rose-950/30 transition-colors cursor-pointer",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>

        {/* Sidebar Desktop Collapse/Expand button */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "hidden lg:flex w-full items-center gap-2 rounded-lg px-2.5 py-1 text-xs text-muted-foreground/80 hover:bg-accent hover:text-foreground transition-colors border-t border-border/40 pt-1.5",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span className="text-[11px]">Collapse Menu</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex shrink-0 transition-all duration-300 z-30 h-screen sticky top-0",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Backdrop & Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Sliding Drawer */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl z-50 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

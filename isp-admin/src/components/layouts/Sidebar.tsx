"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Settings,
  Tag,
  Users,
  UserPlus,
  UserCheck,
  Gift,
  Clock,
  AlertTriangle,
  UserX,
  UserMinus,
  Activity,
  Ticket,
  Network,
  Radio,
  FileBarChart,
  Package,
  ShoppingCart,
  HardDrive,
  ClipboardList,
  Briefcase,
  UsersRound,
  CalendarCheck,
  CalendarX,
  Wallet,
  Coins,
  ShieldCheck,
  UserCog,
  Building2,
  Building,
  Server,
  Cpu,
  Globe,
  Layers,
  CheckCircle2,
  TrendingUp,
  FileSpreadsheet,
  History,
  AlertOctagon,
  MessageSquare,
  PhoneCall,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Zap,
  LogOut,
  ListTodo,
  CreditCard,
  Bell,
  Volume2,
  SlidersHorizontal,
  Archive,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  useFeatureFlag,
  useFeatureSnapshot,
} from "@/lib/feature-flags/FeatureFlagContext";

interface SubMenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  statusParam?: string;
  tabParam?: string;
  adminOnly?: boolean;
  /** When set, this entry is hidden if the named feature is disabled. */
  feature?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SubMenuItem[];
}

interface SingleNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  adminOnly?: boolean;
  /** When set, this entry is hidden if the named feature is disabled. */
  feature?: string;
}

type NavEntry =
  | { type: "single"; data: SingleNavItem }
  | { type: "group"; data: NavGroup };

interface Section {
  title?: string;
  entries: NavEntry[];
}

const navSections: Section[] = [
  {
    title: "ISP BILLING",
    entries: [
      {
        type: "single",
        data: { href: "/", label: "Dashboard", icon: LayoutDashboard },
      },
      {
        type: "single",
        data: { href: "/configuration", label: "Configuration", icon: Settings },
      },
      {
        type: "single",
        data: { href: "/offers", label: "Offer & Promotion", icon: Tag },
      },
      {
        type: "group",
        data: {
          id: "clients",
          label: "Client Management",
          icon: Users,
          items: [
            { href: "/customers/new", label: "Add New Client", icon: UserPlus },
            { href: "/customers?status=Active", label: "Active Clients", icon: UserCheck, statusParam: "Active" },
            { href: "/customers?status=Free", label: "Free Clients", icon: Gift, statusParam: "Free" },
            { href: "/customers?status=PromiseActive", label: "Promise Active Clients", icon: Clock, statusParam: "PromiseActive" },
            { href: "/customers?status=Due", label: "Due Clients", icon: AlertTriangle, statusParam: "Due" },
            { href: "/customers?status=Inactive", label: "Inactive Clients", icon: UserX, statusParam: "Inactive" },
            { href: "/customers?status=Expired", label: "Expire", icon: Clock, statusParam: "Expired" },
            { href: "/customers?status=Left", label: "Left Clients", icon: UserMinus, statusParam: "Left" },
            { href: "/online-sessions", label: "Online Monitoring", icon: Activity },
            { href: "/support", label: "Tickets", icon: Ticket },
          ],
        },
      },
      {
        type: "group",
        data: {
          id: "bandwidth",
          label: "Bandwidth Usage",
          icon: Network,
          items: [
            { href: "/bandwidth/live", label: "Live Usage", icon: Radio },
            { href: "/bandwidth/reports", label: "Usage Reports", icon: FileBarChart },
          ],
        },
      },
      {
        type: "group",
        data: {
          id: "store",
          label: "Store & Devices",
          icon: Package,
          items: [
            { href: "/inventory", label: "Inventory", icon: Package },
            { href: "/store/sales", label: "Product Sales", icon: ShoppingCart },
            { href: "/store/support-devices", label: "Support Devices", icon: HardDrive },
            { href: "/store/reports", label: "Store Reports", icon: ClipboardList },
          ],
        },
      },
      {
        type: "group",
        data: {
          id: "hr",
          label: "HR Management",
          icon: Briefcase,
          items: [
            { href: "/hr", label: "HR Dashboard", icon: LayoutDashboard },
            { href: "/hr/employees", label: "Employees", icon: UsersRound },
            { href: "/hr/attendance", label: "Attendance", icon: CalendarCheck },
            { href: "/hr/leave", label: "Leave Management", icon: CalendarX },
            { href: "/hr/advance-salary", label: "Advance Salary", icon: Wallet },
            { href: "/hr/payroll", label: "Payroll Generation", icon: Coins },
            { href: "/hr/salary-policies", label: "Salary Policies", icon: ShieldCheck },
            { href: "/hr/reports", label: "HR Reports", icon: FileBarChart },
          ],
        },
      },
      {
        type: "single",
        data: { href: "/resellers", label: "Manage Agents", icon: UserCog },
      },
      {
        type: "single",
        data: { href: "/branches", label: "POP/Branch List", icon: Building2 },
      },
      {
        type: "single",
        data: { href: "/branches/left", label: "Left POP/Branch List", icon: Building },
      },
      {
        type: "single",
        data: { href: "/staff", label: "Office Staff", icon: UsersRound },
      },
      {
        type: "single",
        data: { href: "/routers", label: "Routers", icon: Server },
      },
      {
        type: "single",
        data: {
          href: "/network/advanced-health",
          label: "Advanced Health",
          icon: Activity,
          adminOnly: true,
        },
      },
      {
        type: "single",
        data: {
          href: "/network/archive",
          label: "Archive & Export",
          icon: Archive,
          adminOnly: true,
        },
      },
      {
        type: "single",
        data: { href: "/olt", label: "OLT", icon: Cpu },
      },
      {
        type: "single",
        data: { href: "/topology", label: "Live Topology", icon: Globe },
      },
      {
        type: "single",
        data: { href: "/packages", label: "Packages", icon: Layers },
      },
    ],
  },
  {
    title: "REPORTS & SETTINGS",
    entries: [
      {
        type: "single",
        data: { href: "/notifications", label: "Notifications", icon: Bell },
      },
      {
        type: "single",
        data: {
          href: "/payments/verification",
          label: "Payment Verification",
          icon: CheckCircle2,
          feature: "billing.payments",
        },
      },
      {
        type: "single",
        data: { href: "/reports/sales", label: "Monthly Sales", icon: TrendingUp },
      },
      {
        type: "single",
        data: { href: "/reports/bulk-statement", label: "Bulk Statement", icon: FileSpreadsheet },
      },
      {
        type: "single",
        data: { href: "/reports/activity-logs", label: "Activity Log", icon: History },
      },
      {
        type: "single",
        data: { href: "/reports/error-logs", label: "Error Logs", icon: AlertOctagon },
      },
      {
        type: "single",
        data: {
          href: "/reports/sms-logs",
          label: "SMS Logs",
          icon: MessageSquare,
          feature: "billing.sms_logs",
        },
      },
      {
        type: "single",
        data: {
          href: "/reports/voice-logs",
          label: "Voice Logs",
          icon: PhoneCall,
          feature: "ip_phone.epbx",
        },
      },
      {
        type: "group",
        data: {
          id: "settings",
          label: "Settings",
          icon: Settings,
          items: [
            { href: "/settings/profile", label: "General Settings", icon: SlidersHorizontal },
            { href: "/settings", label: "Payment Gateways", icon: CreditCard },
            { href: "/settings?tab=sms", label: "SMS Configuration", icon: Bell },
            { href: "/settings?tab=templates", label: "SMS Templates", icon: MessageSquare },
            { href: "/settings?tab=voice", label: "Voice Call Reminder", icon: Volume2 },
          ],
        },
      },
    ],
  },
];

const footerItems: SingleNavItem[] = [
  { href: "/wallet", label: "Wallet & Deposit", icon: Wallet },
  { href: "/tasks", label: "Task Management", icon: ListTodo },
];

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: "Executive Admin",
  super_admin: "Executive Admin",
  tenant_owner: "Executive Admin",
  billing: "Billing Operator",
  billing_operator: "Billing Operator",
  sales: "Sales Executive",
  demo: "Demo Manager",
  technician: "NOC Technician",
  line_man: "Field Technician",
  staff: "General Staff",
  support_staff: "Support Staff",
  reseller_l1: "Reseller (L1 POP)",
  reseller: "Reseller (L1 POP)",
  reseller_l2: "Sub Reseller (L2)",
  agent: "Agent Dealer (L2)",
  distributor: "Distributor",
  bandwidth_reseller: "Bandwidth Carrier",
};

export interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ isMobileOpen = false, onCloseMobile }: SidebarProps = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string>("admin");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    clients: true,
    bandwidth: false,
    store: false,
    hr: false,
    settings: false,
  });

  const { user, logout } = useAuth();

  useEffect(() => {
    const rawRole = (
      (typeof user?.role === "string" ? user.role : "") ||
      localStorage.getItem("sheba_user_role") ||
      "admin"
    ).toLowerCase();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserRole(rawRole);
  }, [user]);

  const isAdminUser = useMemo(() => {
    return ["admin", "super_admin", "tenant_owner"].includes(userRole);
  }, [userRole]);

  const snapshot = useFeatureSnapshot();
  const featureFlags = snapshot.flags;

  // Resolve "is this feature enabled for the current tenant?".
  // When the snapshot hasn't loaded yet we conservatively hide
  // any feature-gated entry — they'd flash in for a frame if we
  // defaulted to true, which is worse than a brief missing link.
  const isFeatureEnabled = (key?: string): boolean => {
    if (!key) return true;
    if (!snapshot.loaded) return false;
    return !!featureFlags[key]?.enabled;
  };

  const visibleSections = useMemo(() => {
    return navSections
      .map((section) => ({
        ...section,
        entries: section.entries
          .map((entry) => {
            if (entry.type === "single") {
              if (entry.data.adminOnly && !isAdminUser) return null;
              if (!isFeatureEnabled(entry.data.feature)) return null;
              return entry;
            }
            if (entry.type === "group") {
              const items = entry.data.items.filter((item) => {
                if (item.adminOnly && !isAdminUser) return false;
                return isFeatureEnabled(item.feature);
              });
              if (items.length === 0) return null;
              return {
                ...entry,
                data: { ...entry.data, items },
              };
            }
            return null;
          })
          .filter((entry): entry is NavEntry => entry !== null),
      }))
      .filter((section) => section.entries.length > 0);
  }, [isAdminUser, snapshot]);

  const handleLogout = async () => {
    await logout("/login");
  };

  // Auto-expand accordion if child path matches
  useEffect(() => {
    navSections.forEach((sec) => {
      sec.entries.forEach((entry) => {
        if (entry.type === "group") {
          const isChildActive = entry.data.items.some((item) => {
            const [itemPath] = item.href.split("?");
            return pathname === itemPath || (pathname.startsWith(itemPath) && itemPath !== "/");
          });
          if (isChildActive) {
            setOpenGroups((prev) => ({ ...prev, [entry.data.id]: true }));
          }
        }
      });
    });
  }, [pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const isSubItemActive = (item: SubMenuItem) => {
    const [itemPath, itemQuery] = item.href.split("?");

    if (pathname !== itemPath) {
      return false;
    }

    if (itemQuery) {
      const itemParams = new URLSearchParams(itemQuery);
      for (const [key, val] of itemParams.entries()) {
        if (searchParams?.get(key) !== val) {
          return false;
        }
      }
      return true;
    }

    if (itemPath === "/settings") {
      const currentTab = searchParams?.get("tab") || "";
      return currentTab === "";
    }

    if (item.statusParam || itemPath === "/customers") {
      const currentStatus = searchParams?.get("status") || "";
      return currentStatus === (item.statusParam || "");
    }

    return true;
  };

  const isSingleActive = (href: string) => {
    const [itemPath] = href.split("?");
    if (itemPath === "/") return pathname === "/" && !searchParams?.toString();
    return pathname === itemPath;
  };

  const roleLabel = ROLE_DISPLAY_NAMES[userRole] || "Executive Admin";

  const sidebarContent = (
    <div className="flex flex-col h-full w-full border-r border-border bg-card select-none">
      {/* Brand Header matching Screenshot */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 h-14 border-b border-border shrink-0",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
          <Zap className="h-4.5 w-4.5 fill-current" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm tracking-tight text-foreground truncate">
              Sheba ERP
            </span>
            <span className="text-[10px] text-indigo-400 font-bold truncate leading-none tracking-wider uppercase">
              {roleLabel}
            </span>
          </div>
        )}
      </div>

      {/* Navigation list */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4 text-xs">
        {visibleSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {section.title && !collapsed && (
              <div className="px-3 py-1 font-bold text-[10px] tracking-wider uppercase text-muted-foreground/80">
                {section.title}
              </div>
            )}
            {section.title && collapsed && (
              <div className="my-1.5 border-t border-border/50" />
            )}

            <div className="space-y-0.5">
              {section.entries.map((entry, eIdx) => {
                if (entry.type === "single") {
                  const active = isSingleActive(entry.data.href);
                  const Icon = entry.data.icon;
                  return (
                    <Link
                      key={eIdx}
                      href={entry.data.href}
                      onClick={onCloseMobile}
                      title={collapsed ? entry.data.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium transition-colors group relative",
                        active
                          ? "bg-indigo-600 text-white font-semibold shadow-xs"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        collapsed && "justify-center px-0"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                          active ? "text-white" : ""
                        )}
                      />
                      {!collapsed && <span className="truncate">{entry.data.label}</span>}
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
                        "flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 font-medium transition-colors group cursor-pointer",
                        isGroupChildActive
                          ? "text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-600/5"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        collapsed && "justify-center px-0"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <GroupIcon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                            isGroupChildActive ? "text-indigo-600 dark:text-indigo-400" : ""
                          )}
                        />
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
                      <div className="pl-5 pr-1 py-0.5 space-y-0.5 border-l border-border/60 ml-4.5 my-0.5">
                        {group.items.map((sub, sIndex) => {
                          const subActive = isSubItemActive(sub);
                          const SubIcon = sub.icon;
                          return (
                            <Link
                              key={sIndex}
                              href={sub.href}
                              onClick={onCloseMobile}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                                subActive
                                  ? "bg-indigo-600 text-white font-semibold shadow-xs"
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
        ))}
      </nav>

      {/* Footer Items (Wallet, Tasks, Logout, Collapse) */}
      <div className="shrink-0 border-t border-border p-2 space-y-0.5 bg-card/60">
        {footerItems.map((item, fIdx) => {
          const active = isSingleActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={fIdx}
              href={item.href}
              onClick={onCloseMobile}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Dedicated Logout [Executive Admin] matching Screenshot */}
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 dark:hover:bg-red-950/30 transition-colors cursor-pointer",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Logout [{roleLabel}]</span>}
        </button>

        {/* Sidebar Collapse/Expand button */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "hidden lg:flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground/80 hover:bg-accent hover:text-foreground transition-colors mt-1 pt-2 border-t border-border/40 cursor-pointer",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Collapse Menu</span>
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
          collapsed ? "w-16" : "w-64"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl z-50 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

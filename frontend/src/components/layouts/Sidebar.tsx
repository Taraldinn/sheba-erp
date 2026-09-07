"use client";

import { useState, useEffect } from "react";
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
  User,
} from "lucide-react";

interface SubMenuItem {
  href: string;
  label: string;
  icon: any;
  statusParam?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: any;
  items: SubMenuItem[];
}

interface SingleNavItem {
  href: string;
  label: string;
  icon: any;
  badge?: string;
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
    title: "ISP Billing",
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
        data: { href: "/payments/verification", label: "Payment Verification", icon: CheckCircle2 },
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
        data: { href: "/reports/sms-logs", label: "SMS Logs", icon: MessageSquare },
      },
      {
        type: "single",
        data: { href: "/reports/voice-logs", label: "Voice Logs", icon: PhoneCall },
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

const ROLE_DASHBOARD_MAP: Record<string, { href: string; label: string }> = {
  admin: { href: "/", label: "Admin Dashboard" },
  super_admin: { href: "/", label: "Admin Dashboard" },
  billing: { href: "/dashboards/billing", label: "Billing Dashboard" },
  billing_operator: { href: "/dashboards/billing", label: "Billing Dashboard" },
  sales: { href: "/dashboards/sales", label: "Sales Dashboard" },
  demo: { href: "/dashboards/demo", label: "Demo Accounts Dashboard" },
  technician: { href: "/dashboards/technician", label: "NOC Dashboard" },
  line_man: { href: "/dashboards/technician", label: "NOC Dashboard" },
  staff: { href: "/dashboards/staff", label: "Staff Dashboard" },
  support_staff: { href: "/dashboards/staff", label: "Staff Dashboard" },
  reseller_l1: { href: "/dashboards/reseller-l1", label: "Reseller L1 Dashboard" },
  reseller: { href: "/dashboards/reseller-l1", label: "Reseller L1 Dashboard" },
  reseller_l2: { href: "/dashboards/reseller-l2", label: "Reseller L2 Dashboard" },
  agent: { href: "/dashboards/reseller-l2", label: "Reseller L2 Dashboard" },
  distributor: { href: "/dashboards/distributor", label: "Distributor Dashboard" },
  bandwidth_reseller: { href: "/dashboards/bandwidth-reseller", label: "Bandwidth Dashboard" },
};

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: "Executive Admin",
  super_admin: "Super Admin",
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

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string>("admin");
  const [userName, setUserName] = useState<string>("Admin");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    clients: true,
    bandwidth: false,
    store: false,
    hr: false,
  });

  useEffect(() => {
    const role = (localStorage.getItem("sheba_user_role") || "admin").toLowerCase();
    const name = localStorage.getItem("sheba_user_name") || "Operator";
    setUserRole(role);
    setUserName(name);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("sheba_auth_token");
    localStorage.removeItem("sheba_user_role");
    localStorage.removeItem("sheba_user_name");
    window.location.href = "/login";
  };

  // Compute filtered sections based on userRole
  const currentRoleDashboard = ROLE_DASHBOARD_MAP[userRole] || { href: "/", label: "Dashboard" };

  const getFilteredNavSections = () => {
    if (userRole === "admin" || userRole === "super_admin") {
      return navSections;
    }

    const allowedTitlesByRole: Record<string, string[]> = {
      billing: ["ISP Billing", "Reports"],
      billing_operator: ["ISP Billing", "Reports"],
      sales: ["ISP Billing", "Reports"],
      demo: ["ISP Billing"],
      technician: ["Network & Infrastructure", "Support Desk"],
      line_man: ["Network & Infrastructure", "Support Desk"],
      staff: ["HR & Payroll", "Support Desk"],
      support_staff: ["HR & Payroll", "Support Desk"],
      reseller_l1: ["Reseller Network", "ISP Billing"],
      reseller: ["Reseller Network", "ISP Billing"],
      reseller_l2: ["ISP Billing"],
      agent: ["ISP Billing"],
      distributor: ["Store & Inventory"],
      bandwidth_reseller: ["Bandwidth Management"],
    };

    const allowedTitles = allowedTitlesByRole[userRole] || ["ISP Billing"];
    const filtered = navSections.filter((sec) => !sec.title || allowedTitles.includes(sec.title));

    // Replace first Dashboard entry with the role-specific dashboard link
    return filtered.map((sec, idx) => {
      if (idx === 0) {
        return {
          ...sec,
          entries: sec.entries.map((entry) => {
            if (entry.type === "single" && entry.data.href === "/") {
              return {
                type: "single",
                data: {
                  href: currentRoleDashboard.href,
                  label: currentRoleDashboard.label,
                  icon: LayoutDashboard,
                },
              } as NavEntry;
            }
            return entry;
          }),
        };
      }
      return sec;
    });
  };

  const activeNavSections = getFilteredNavSections();

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

    // When item has no query parameters (e.g. /settings for Payment Gateways):
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

  return (
    <aside
      className={cn(
        "relative flex flex-col shrink-0 h-screen sticky top-0 border-r border-border bg-card transition-all duration-300 ease-in-out z-30 select-none",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 h-14 border-b border-border shrink-0",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
          <Zap className="h-4.5 w-4.5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm tracking-tight text-foreground truncate">
              Sheba ERP
            </span>
            <span className="text-[10px] text-indigo-400 font-semibold truncate leading-none uppercase">
              {ROLE_DISPLAY_NAMES[userRole] || "Operations"}
            </span>
          </div>
        )}
      </div>

      {/* Navigation list */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4 text-xs">
        {activeNavSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {section.title && !collapsed && (
              <div className="px-3 py-1 font-semibold text-[10px] tracking-wider uppercase text-muted-foreground/70">
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
                      title={collapsed ? entry.data.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium transition-colors group relative",
                        active
                          ? "bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 font-semibold"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        collapsed && "justify-center px-0"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-105", active ? "text-indigo-600 dark:text-indigo-400" : "")} />
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
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
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
        ))}
      </nav>

      {/* Footer Items (Wallet, Tasks, Logout) */}
      <div className="shrink-0 border-t border-border p-2 space-y-0.5 bg-card/60">
        {footerItems.map((item, fIdx) => {
          const active = isSingleActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={fIdx}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Dedicated Logout */}
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 dark:hover:bg-red-950/30 transition-colors cursor-pointer",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Logout ({ROLE_DISPLAY_NAMES[userRole] || "User"})</span>}
        </button>

        {/* Sidebar Collapse/Expand button */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground/80 hover:bg-accent hover:text-foreground transition-colors mt-1 pt-2 border-t border-border/40",
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
    </aside>
  );
}

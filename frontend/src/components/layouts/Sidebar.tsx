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
  { href: "/login", label: "Logout", icon: LogOut },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentStatus = searchParams?.get("status") || "";
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    clients: true,
    bandwidth: false,
    store: false,
    hr: false,
  });

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
    if (itemQuery && item.statusParam) {
      return pathname === itemPath && currentStatus === item.statusParam;
    }
    if (itemPath === "/") return pathname === "/";
    return pathname === itemPath || pathname.startsWith(itemPath + "/");
  };

  const isSingleActive = (href: string) => {
    const [itemPath] = href.split("?");
    if (itemPath === "/") return pathname === "/" && !searchParams?.toString();
    return pathname === itemPath || pathname.startsWith(itemPath + "/");
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
            <span className="text-[10px] text-muted-foreground truncate leading-none">
              ISP Operations & Billing
            </span>
          </div>
        )}
      </div>

      {/* Navigation list */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4 text-xs">
        {navSections.map((section, sIdx) => (
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
          const isLogout = item.label === "Logout";
          return (
            <Link
              key={fIdx}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                isLogout
                  ? "text-red-500 hover:bg-red-500/10 dark:hover:bg-red-950/30"
                  : active
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

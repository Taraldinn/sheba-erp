"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  Activity,
  BadgeCent,
  Box,
  Briefcase,
  Building,
  Building2,
  CreditCard,
  Database,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Link2,
  Network,
  Package,
  PhoneCall,
  Radio,
  Receipt,
  RefreshCw,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShoppingBag,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Wifi,
} from "lucide-react"

import { NavMain, type NavSection } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { BrandGlyph } from "@/components/brand-mark"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth/auth-provider"

type PortalKey = "super_admin" | "isp" | "tenant"

const portalConfigs: Record<
  PortalKey,
  { title: string; tag: string; root: string; sections: NavSection[] }
> = {
  super_admin: {
    title: "Shebafi Platform",
    tag: "Super admin",
    root: "/saas",
    sections: [
      {
        label: "Platform",
        items: [{ title: "Overview", url: "/saas", icon: LayoutDashboard }],
      },
      {
        label: "Tenancy",
        items: [
          {
            title: "Organizations",
            url: "/saas/organizations",
            icon: Building2,
          },
          { title: "Tenants", url: "/saas/tenants", icon: Building },
          { title: "Onboarding", url: "/saas/onboarding", icon: UserPlus },
          { title: "Domains", url: "/saas/domains", icon: Link2 },
        ],
      },
      {
        label: "Billing",
        items: [
          { title: "Packages", url: "/saas/packages", icon: Package },
          {
            title: "Subscriptions",
            url: "/saas/subscriptions",
            icon: CreditCard,
          },
          { title: "Payments", url: "/saas/payments", icon: Wallet },
          {
            title: "Reconciliation",
            url: "/saas/billing-reconcile",
            icon: BadgeCent,
          },
        ],
      },
      {
        label: "Operations",
        items: [
          { title: "Jobs & Tasks", url: "/saas/jobs", icon: RefreshCw },
          { title: "Deep Health", url: "/saas/health", icon: HeartPulse },
          { title: "Backups", url: "/saas/backups", icon: Database },
          { title: "Kill Switch", url: "/saas/kill-switch", icon: ShieldAlert },
        ],
      },
      {
        label: "Security",
        items: [
          {
            title: "Platform Admins",
            url: "/saas/platform-admins",
            icon: Shield,
          },
          {
            title: "Impersonation Log",
            url: "/saas/impersonation-log",
            icon: UserCheck,
          },
          { title: "Audit Logs", url: "/saas/audit", icon: FileText },
        ],
      },
    ],
  },
  isp: {
    title: "Shebafi ISP",
    tag: "Operator",
    root: "/isp",
    sections: [
      {
        label: "Operator",
        items: [{ title: "Overview", url: "/isp", icon: LayoutDashboard }],
      },
      {
        label: "Tenancy",
        items: [
          { title: "My Tenants", url: "/isp/tenants", icon: Building },
          {
            title: "Child Tenants",
            url: "/isp/child-tenants",
            icon: Building2,
          },
          { title: "Domains", url: "/isp/domains", icon: Link2 },
          { title: "Modules", url: "/isp/modules", icon: Box },
        ],
      },
      {
        label: "Subscribers",
        items: [
          { title: "Customers", url: "/isp/customers", icon: Users },
          { title: "Packages", url: "/isp/packages", icon: Package },
          {
            title: "Subscriptions",
            url: "/isp/subscriptions",
            icon: BadgeCent,
          },
          { title: "Resellers", url: "/isp/resellers", icon: Briefcase },
        ],
      },
      {
        label: "Billing & network",
        items: [
          { title: "Invoices", url: "/isp/invoices", icon: Receipt },
          { title: "Payments", url: "/isp/payments", icon: Wallet },
          { title: "Routers", url: "/isp/routers", icon: Server },
        ],
      },
    ],
  },
  tenant: {
    title: "ISP Billing",
    tag: "Workspace",
    root: "/tenant",
    sections: [
      {
        label: "Overview",
        items: [
          {
            title: "Dashboard",
            url: "/tenant",
            icon: LayoutDashboard,
          },
        ],
      },
      {
        label: "Subscribers & CRM",
        items: [
          {
            title: "Clients",
            url: "/tenant/customers",
            icon: Users,
            items: [
              { title: "All Clients", url: "/tenant/customers" },
              { title: "Add New Client", url: "/tenant/customers/new" },
              {
                title: "Active Clients",
                url: "/tenant/customers?status=ACTIVE",
              },
              { title: "Due / Pending", url: "/tenant/customers?has_due=true" },
              {
                title: "Inactive / Expired",
                url: "/tenant/customers?status=INACTIVE",
              },
            ],
          },
          {
            title: "Subscriptions",
            url: "/tenant/subscriptions",
            icon: BadgeCent,
          },
          {
            title: "Support Tickets",
            url: "/tenant/tickets",
            icon: ShieldAlert,
          },
          {
            title: "Call Center & PBX",
            url: "/tenant/callcenter",
            icon: PhoneCall,
            items: [
              { title: "Call Center", url: "/tenant/callcenter" },
              { title: "PBX Extensions", url: "/tenant/callcenter/pbx" },
              { title: "SMS Templates", url: "/tenant/callcenter/templates" },
            ],
          },
        ],
      },
      {
        label: "Billing & Finance",
        items: [
          {
            title: "Invoices",
            url: "/tenant/invoices",
            icon: Receipt,
          },
          {
            title: "Payments",
            url: "/tenant/payments",
            icon: Wallet,
            items: [
              { title: "Payment History", url: "/tenant/payments" },
              { title: "Verification", url: "/tenant/payments/verification" },
              {
                title: "SMS Gateways",
                url: "/tenant/payments/verification/devices",
              },
            ],
          },
          {
            title: "Packages & Pricing",
            url: "/tenant/packages",
            icon: Package,
            items: [
              { title: "All Packages", url: "/tenant/packages" },
              { title: "Reseller Pricing", url: "/tenant/resellers" },
            ],
          },
        ],
      },
      {
        label: "Network & NOC",
        items: [
          {
            title: "MikroTik & Core",
            url: "/tenant/routers",
            icon: Server,
            items: [
              { title: "MikroTik Routers", url: "/tenant/routers" },
              { title: "PPPoE Sessions", url: "/tenant/pppoe" },
              { title: "Live Bandwidth", url: "/tenant/bandwidth" },
              { title: "Traffic Reports", url: "/tenant/bandwidth/reports" },
            ],
          },
          {
            title: "Fiber & PON",
            url: "/tenant/olts",
            icon: Network,
            items: [
              { title: "OLT Devices", url: "/tenant/olts" },
              { title: "ONU Monitoring", url: "/tenant/onus" },
              { title: "Live Topology", url: "/tenant/topology" },
              { title: "TJ Distribution", url: "/tenant/tj-boxes" },
            ],
          },
          {
            title: "Zones & POPs",
            url: "/tenant/zones",
            icon: Building,
            items: [
              { title: "Zones & Areas", url: "/tenant/zones" },
              { title: "Active POP/Branches", url: "/tenant/branches" },
              { title: "Left POP/Branches", url: "/tenant/branches/left" },
            ],
          },
        ],
      },
      {
        label: "Enterprise & Inventory",
        items: [
          {
            title: "Corporate Leased",
            url: "/tenant/corporate",
            icon: Building2,
            items: [
              { title: "Corporate Dashboard", url: "/tenant/corporate" },
              {
                title: "Dedicated Connections",
                url: "/tenant/corporate/connections",
              },
              { title: "IP Pools", url: "/tenant/corporate/ip-pools" },
              { title: "VLAN Networks", url: "/tenant/corporate/vlans" },
            ],
          },
          {
            title: "Store & Inventory",
            url: "/tenant/store",
            icon: ShoppingBag,
            items: [
              { title: "Store Inventory", url: "/tenant/store" },
              {
                title: "Stock Transactions",
                url: "/tenant/store/transactions",
              },
            ],
          },
          {
            title: "Resellers & Agents",
            url: "/tenant/agents",
            icon: UserCheck,
          },
        ],
      },
      {
        label: "System & Administration",
        items: [
          {
            title: "HR & Staff",
            url: "/tenant/hr",
            icon: Briefcase,
            items: [
              { title: "Office Staff", url: "/tenant/staff" },
              { title: "Employee Directory", url: "/tenant/hr" },
              { title: "Attendance", url: "/tenant/hr/attendance" },
              { title: "Leaves", url: "/tenant/hr/leaves" },
              { title: "Payroll", url: "/tenant/hr/payroll" },
            ],
          },
          {
            title: "Settings & Audit",
            url: "/tenant/settings",
            icon: Settings,
            items: [
              { title: "Tenant Settings", url: "/tenant/settings" },
              { title: "Audit Logs", url: "/tenant/audit" },
            ],
          },
        ],
      },
    ],
  },
}

function SidebarNavSections({
  config,
  pathname,
}: {
  config: { sections: NavSection[]; root: string }
  pathname: string
}) {
  const searchParams = useSearchParams()
  const currentSearch = searchParams ? searchParams.toString() : ""

  return (
    <>
      {config.sections.map((section) => (
        <NavMain
          key={section.label}
          section={section}
          pathname={pathname}
          rootUrl={config.root}
          currentSearch={currentSearch}
        />
      ))}
    </>
  )
}

export function PortalSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const auth = useAuth()
  const pathname = usePathname() ?? "/"

  let key: PortalKey = "tenant"
  if (pathname.startsWith("/saas")) key = "super_admin"
  if (pathname.startsWith("/isp")) key = "isp"

  const config = portalConfigs[key]

  const userData = {
    name: auth.user?.name || auth.user?.username || "User",
    email: auth.user?.email ?? "",
    avatar: "",
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-14 justify-center border-b border-border/60 px-2.5 py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="h-10 group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:p-0! hover:bg-transparent active:bg-transparent rounded-md"
            >
              <BrandGlyph className="size-7 shrink-0 group-data-[collapsible=icon]:size-8 transition-transform" />
              <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold text-sidebar-accent-foreground tracking-tight">
                  {config.title}
                </span>
                <span className="truncate font-mono text-xs tracking-wider text-sidebar-foreground/70 uppercase">
                  {auth.user?.tenant?.name || config.tag}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0 py-2">
        <React.Suspense
          fallback={
            <>
              {config.sections.map((section) => (
                <NavMain
                  key={section.label}
                  section={section}
                  pathname={pathname}
                  rootUrl={config.root}
                />
              ))}
            </>
          }
        >
          <SidebarNavSections config={config} pathname={pathname} />
        </React.Suspense>
      </SidebarContent>
      <SidebarFooter className="border-t border-border/60 p-2">
        <div className="flex items-center gap-2 px-2 pt-0.5 pb-1 font-mono text-xs tracking-wider text-sidebar-foreground/60 uppercase group-data-[collapsible=icon]:hidden">
          <Activity className="text-success size-3.5" aria-hidden="true" />
          All systems nominal
        </div>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

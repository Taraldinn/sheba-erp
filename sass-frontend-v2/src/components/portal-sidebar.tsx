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

const portalConfigs: Record<PortalKey, { title: string; tag: string; root: string; sections: NavSection[] }> = {
  super_admin: {
    title: "Shebafi Platform",
    tag: "Super admin",
    root: "/saas",
    sections: [
      { label: "Platform", items: [{ title: "Overview", url: "/saas", icon: LayoutDashboard }] },
      {
        label: "Tenancy",
        items: [
          { title: "Organizations", url: "/saas/organizations", icon: Building2 },
          { title: "Tenants", url: "/saas/tenants", icon: Building },
          { title: "Onboarding", url: "/saas/onboarding", icon: UserPlus },
          { title: "Domains", url: "/saas/domains", icon: Link2 },
        ],
      },
      {
        label: "Billing",
        items: [
          { title: "Packages", url: "/saas/packages", icon: Package },
          { title: "Subscriptions", url: "/saas/subscriptions", icon: CreditCard },
          { title: "Payments", url: "/saas/payments", icon: Wallet },
          { title: "Reconciliation", url: "/saas/billing-reconcile", icon: BadgeCent },
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
          { title: "Platform Admins", url: "/saas/platform-admins", icon: Shield },
          { title: "Impersonation Log", url: "/saas/impersonation-log", icon: UserCheck },
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
      { label: "Operator", items: [{ title: "Overview", url: "/isp", icon: LayoutDashboard }] },
      {
        label: "Tenancy",
        items: [
          { title: "My Tenants", url: "/isp/tenants", icon: Building },
          { title: "Child Tenants", url: "/isp/child-tenants", icon: Building2 },
          { title: "Domains", url: "/isp/domains", icon: Link2 },
          { title: "Modules", url: "/isp/modules", icon: Box },
        ],
      },
      {
        label: "Subscribers",
        items: [
          { title: "Customers", url: "/isp/customers", icon: Users },
          { title: "Packages", url: "/isp/packages", icon: Package },
          { title: "Subscriptions", url: "/isp/subscriptions", icon: BadgeCent },
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
        label: "",
        items: [
          {
            title: "Dashboard",
            url: "/tenant",
            icon: LayoutDashboard,
          },
          {
            title: "Configuration",
            url: "/tenant/settings",
            icon: Settings,
            items: [
              { title: "Payment Verification", url: "/tenant/payments/verification" },
              { title: "SMS Gateways & Devices", url: "/tenant/payments/verification/devices" },
              { title: "Invoices & Billing", url: "/tenant/invoices" },
              { title: "Payment Transactions", url: "/tenant/payments" },
              { title: "Tenant Settings", url: "/tenant/settings" },
              { title: "Zones & POPs", url: "/tenant/zones" },
              { title: "TJ Boxes / Ports", url: "/tenant/tj-boxes" },
              { title: "Notifications", url: "/tenant/settings/notifications" },
              { title: "Audit Logs", url: "/tenant/audit" },
            ],
          },
          {
            title: "Offer & Promotion",
            url: "/tenant/packages",
            icon: Receipt,
            items: [
              { title: "Packages & Offers", url: "/tenant/packages" },
              { title: "Reseller Pricing", url: "/tenant/resellers" },
            ],
          },
          {
            title: "Client Management",
            url: "/tenant/customers",
            icon: Users,
            items: [
              { title: "Add New Client", url: "/tenant/customers/new" },
              { title: "Active Clients", url: "/tenant/customers?status=ACTIVE" },
              { title: "Free Clients", url: "/tenant/customers?billing_type=FREE" },
              { title: "Promise Active Clients", url: "/tenant/customers?status=PROMISE" },
              { title: "Due Clients", url: "/tenant/customers?has_due=true" },
              { title: "Inactive Clients", url: "/tenant/customers?status=INACTIVE" },
              { title: "Expire", url: "/tenant/customers?status=EXPIRED" },
              { title: "Left Clients", url: "/tenant/customers?status=TERMINATED" },
              { title: "Online Monitoring", url: "/tenant/bandwidth" },
              { title: "Tickets", url: "/tenant/tickets" },
            ],
          },
          {
            title: "Bandwidth Usage",
            url: "/tenant/bandwidth",
            icon: Activity,
            items: [
              { title: "Live Usage", url: "/tenant/bandwidth" },
              { title: "Usage Reports", url: "/tenant/bandwidth/reports" },
            ],
          },
          {
            title: "Store & Devices",
            url: "/tenant/store",
            icon: ShoppingBag,
            items: [
              { title: "Store Items", url: "/tenant/store" },
              { title: "Stock Movements", url: "/tenant/store/transactions" },
            ],
          },
          {
            title: "HR Management",
            url: "/tenant/hr",
            icon: Briefcase,
            items: [
              { title: "HR / Employees", url: "/tenant/hr" },
              { title: "Attendance", url: "/tenant/hr/attendance" },
              { title: "Leaves", url: "/tenant/hr/leaves" },
              { title: "Payroll", url: "/tenant/hr/payroll" },
            ],
          },
          {
            title: "Manage Agents",
            url: "/tenant/agents",
            icon: UserCheck,
          },
          {
            title: "POP/Branch List",
            url: "/tenant/branches",
            icon: Building2,
          },
          {
            title: "Left POP/Branch List",
            url: "/tenant/branches/left",
            icon: Building,
          },
          {
            title: "Office Staff",
            url: "/tenant/staff",
            icon: Users,
          },
          {
            title: "Routers",
            url: "/tenant/routers",
            icon: Server,
          },
          {
            title: "OLT",
            url: "/tenant/olts",
            icon: Network,
          },
          {
            title: "Live Topology",
            url: "/tenant/topology",
            icon: Link2,
          },
          {
            title: "Packages",
            url: "/tenant/packages",
            icon: Package,
          },
        ],
      },
    ],
  },
}

function SidebarNavSections({ config, pathname }: { config: { sections: NavSection[]; root: string }; pathname: string }) {
  const searchParams = useSearchParams()
  const currentSearch = searchParams ? searchParams.toString() : ""

  return (
    <>
      {config.sections.map((section) => (
        <NavMain key={section.label} section={section} pathname={pathname} rootUrl={config.root} currentSearch={currentSearch} />
      ))}
    </>
  )
}

export function PortalSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="h-10 hover:bg-transparent active:bg-transparent">
              <BrandGlyph className="size-7" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">{config.title}</span>
                <span className="truncate font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
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
                <NavMain key={section.label} section={section} pathname={pathname} rootUrl={config.root} />
              ))}
            </>
          }
        >
          <SidebarNavSections config={config} pathname={pathname} />
        </React.Suspense>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 pb-1 pt-0.5 font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          <Activity className="size-3 text-success" aria-hidden="true" />
          All systems nominal
        </div>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

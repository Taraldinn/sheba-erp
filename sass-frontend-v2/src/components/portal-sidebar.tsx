"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Users, Box, Link2, CreditCard, Building, Settings, Server, Network, FolderKanban, ShieldAlert, BadgeCent, Shield, Activity, RefreshCw, UserCheck, HeartPulse, FileText, Database, Briefcase, MapPin, Phone, Cpu, ShoppingBag, HardDrive, PhoneCall, Building2, Wrench, Radio } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarGroupLabel,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth/auth-provider"
import { usePortal } from "@/lib/portal/portal-provider"

const portalConfigs = {
  super_admin: {
    title: "Shebafi SaaS",
    navMain: [
      { title: "Overview", url: "/saas", icon: LayoutDashboard },
      { title: "Organizations", url: "/saas/organizations", icon: Building },
      { title: "Tenants", url: "/saas/tenants", icon: Building },
      { title: "Onboarding", url: "/saas/onboarding", icon: Users },
      { title: "Platform Admins", url: "/saas/platform-admins", icon: Shield },
      { title: "Kill Switch", url: "/saas/kill-switch", icon: ShieldAlert },
      { title: "Jobs & Tasks", url: "/saas/jobs", icon: RefreshCw },
      { title: "Deep Health", url: "/saas/health", icon: HeartPulse },
      { title: "Reconciliation", url: "/saas/billing-reconcile", icon: BadgeCent },
      { title: "Impersonation Log", url: "/saas/impersonation-log", icon: UserCheck },
      { title: "Audit Logs", url: "/saas/audit", icon: FileText },
      { title: "Backups", url: "/saas/backups", icon: Database },
      { title: "Packages", url: "/saas/packages", icon: Box },
      { title: "Subscriptions", url: "/saas/subscriptions", icon: CreditCard },
      { title: "Payments", url: "/saas/payments", icon: CreditCard },
      { title: "Domains", url: "/saas/domains", icon: Link2 },
    ],
  },
  isp: {
    title: "Shebafi ISP",
    navMain: [
      { title: "Overview", url: "/isp", icon: LayoutDashboard },
      { title: "My Tenants", url: "/isp/tenants", icon: Building },
      { title: "Child Tenants", url: "/isp/child-tenants", icon: Building },
      { title: "Domains", url: "/isp/domains", icon: Link2 },
      { title: "Modules", url: "/isp/modules", icon: Box },
      { title: "Customers", url: "/isp/customers", icon: Users },
      { title: "Packages", url: "/isp/packages", icon: Box },
      { title: "Subscriptions", url: "/isp/subscriptions", icon: BadgeCent },
      { title: "Invoices", url: "/isp/invoices", icon: CreditCard },
      { title: "Payments", url: "/isp/payments", icon: CreditCard },
      { title: "Routers", url: "/isp/routers", icon: Server },
      { title: "Resellers", url: "/isp/resellers", icon: Users },
    ],
  },
  tenant: {
    title: "Shebafi ERP",
    navMain: [
      // ── Operations (CRM, billing, support) ──────────────────────────
      {
        title: "Operations",
        url: "/tenant",
        icon: LayoutDashboard,
        isActive: true,
        items: [
          { title: "Overview", url: "/tenant" },
          { title: "Customers", url: "/tenant/customers" },
          { title: "Subscriptions", url: "/tenant/subscriptions" },
          { title: "Invoices", url: "/tenant/invoices" },
          { title: "Payments", url: "/tenant/payments" },
          { title: "Packages", url: "/tenant/packages" },
          { title: "Resellers", url: "/tenant/resellers" },
          { title: "Tickets", url: "/tenant/tickets" },
        ],
      },
      // ── Network (routers, OLTs, ONUs, branches, topology) ──────────
      {
        title: "Network",
        url: "/tenant/network",
        icon: Network,
        items: [
          { title: "Overview", url: "/tenant/network" },
          { title: "POP / Branches", url: "/tenant/branches" },
          { title: "Routers", url: "/tenant/routers" },
          { title: "OLTs", url: "/tenant/olts" },
          { title: "ONUs", url: "/tenant/onus" },
          { title: "Live Topology", url: "/tenant/topology" },
          { title: "PPPoE Accounts", url: "/tenant/pppoe" },
        ],
      },
      // ── Corporate (B2B clients, VLANs, IP pools) ──────────────────
      {
        title: "Corporate Clients",
        url: "/tenant/corporate",
        icon: Briefcase,
        items: [
          { title: "Clients", url: "/tenant/corporate" },
          { title: "Connections", url: "/tenant/corporate/connections" },
          { title: "IP Pools", url: "/tenant/corporate/ip-pools" },
          { title: "VLANs", url: "/tenant/corporate/vlans" },
        ],
      },
      // ── People (HR, office staff, callcenter agents) ───────────────
      {
        title: "People",
        url: "/tenant/hr",
        icon: Users,
        items: [
          { title: "HR / Employees", url: "/tenant/hr" },
          { title: "Attendance", url: "/tenant/hr/attendance" },
          { title: "Leaves", url: "/tenant/hr/leaves" },
          { title: "Payroll", url: "/tenant/hr/payroll" },
          { title: "Office Staff", url: "/tenant/staff" },
          { title: "Callcenter Agents", url: "/tenant/agents" },
        ],
      },
      // ── Inventory (store, devices, hardware) ───────────────────────
      {
        title: "Inventory",
        url: "/tenant/store",
        icon: ShoppingBag,
        items: [
          { title: "Store Items", url: "/tenant/store" },
          { title: "Stock Movements", url: "/tenant/store/transactions" },
        ],
      },
      // ── Callcenter (PBX) ────────────────────────────────────────────
      {
        title: "Call Center",
        url: "/tenant/callcenter",
        icon: PhoneCall,
        items: [
          { title: "Calls", url: "/tenant/callcenter" },
          { title: "Voice Templates", url: "/tenant/callcenter/templates" },
          { title: "PBX Config", url: "/tenant/callcenter/pbx" },
        ],
      },
      // ── Admin (settings, configuration) ────────────────────────────
      {
        title: "Configuration",
        url: "/tenant/settings",
        icon: Settings,
        items: [
          { title: "Tenant Settings", url: "/tenant/settings" },
          { title: "Notifications", url: "/tenant/settings/notifications" },
          { title: "Audit Logs", url: "/tenant/audit" },
        ],
      },
    ],
  },
}

export function PortalSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const auth = useAuth()
  const portalCtx = usePortal()
  const pathname = usePathname()

  let activePortalKey: "super_admin" | "isp" | "tenant" = "tenant"
  if (pathname.startsWith('/saas')) activePortalKey = "super_admin"
  if (pathname.startsWith('/isp')) activePortalKey = "isp"

  const config = portalConfigs[activePortalKey]

  const navItems = config.navMain.map((item) => ({
    ...item,
    isActive: pathname === item.url || (pathname.startsWith(item.url + '/') && item.url !== `/${activePortalKey}`),
  }))

  const userData = {
    name: auth.user?.username ?? "User",
    email: auth.user?.email ?? "",
    avatar: "",
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Network className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{config.title}</span>
                <span className="truncate text-xs">{auth.user?.tenant?.name || 'Dashboard'}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <NavMain items={navItems} />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

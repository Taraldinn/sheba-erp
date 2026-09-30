export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "ShebaFi SaaS Control Plane",
  shortName: "ShebaFi Admin",
  description:
    "Central SaaS control plane for the ShebaFi multi-tenant ISP platform.",
  apiBase: "/api/v1/saas",
  // Sidebar nav for the admin dashboard. Order matters — overview first.
  navSections: [
    {
      title: "Workspace",
      items: [
        { label: "Dashboard", href: "/overview", icon: "dashboard" },
        { label: "Operations", href: "/operations", icon: "operations" },
        { label: "Settings", href: "/settings", icon: "settings" },
      ],
    },
    {
      title: "Control Plane",
      items: [
        { label: "Tenants", href: "/tenants", icon: "tenants" },
        { label: "Domains", href: "/domains", icon: "domains" },
        { label: "Users", href: "/users", icon: "users" },
        {
          label: "Applications",
          href: "/applications",
          icon: "applications",
        },
      ],
    },
    {
      title: "Catalog",
      items: [
        { label: "Catalogs", href: "/catalogs", icon: "packages" },
        {
          label: "Packages",
          href: "/packages",
          icon: "packages",
        },
        {
          label: "Subscriptions",
          href: "/subscriptions",
          icon: "subscriptions",
        },
      ],
    },
    {
      title: "Operations",
      items: [
        { label: "Payments", href: "/payments", icon: "payments" },
        { label: "Backups", href: "/backups", icon: "backups" },
        {
          label: "API Credentials",
          href: "/api-credentials",
          icon: "credentials",
        },
      ],
    },
    {
      title: "Compliance",
      items: [{ label: "Audit Logs", href: "/audit-logs", icon: "audit-logs" }],
    },
  ],
  // Backwards-compat fallback for the existing navbar code.
  navItems: [{ label: "Dashboard", href: "/overview" }],
  navMenuItems: [
    { label: "Dashboard", href: "/overview" },
    { label: "Logout", href: "/logout" },
  ],
};

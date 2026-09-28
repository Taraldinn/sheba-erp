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
      title: "Overview",
      items: [{ label: "Dashboard", href: "/overview" }],
    },
    {
      title: "Tenants",
      items: [
        { label: "Tenants", href: "/tenants" },
        { label: "Domains", href: "/domains" },
        { label: "Users", href: "/users" },
      ],
    },
    {
      title: "Catalog",
      items: [
        { label: "Packages", href: "/packages" },
        { label: "Subscriptions", href: "/subscriptions" },
      ],
    },
    {
      title: "Operations",
      items: [
        { label: "Payments", href: "/payments" },
        { label: "Backups", href: "/backups" },
        { label: "Applications", href: "/applications" },
        { label: "API Credentials", href: "/api-credentials" },
      ],
    },
    {
      title: "Compliance",
      items: [{ label: "Audit Logs", href: "/audit-logs" }],
    },
  ],
  // Backwards-compat fallback for the existing navbar code.
  navItems: [{ label: "Dashboard", href: "/overview" }],
  navMenuItems: [
    { label: "Dashboard", href: "/overview" },
    { label: "Logout", href: "/logout" },
  ],
};

"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Button,
  Chip,
  Drawer,
  Surface,
} from "@heroui/react";

import { AvatarGradient } from "@/components/avatar-gradient";
import { ThemeSwitch } from "@/components/theme-switch";
import { useLogout } from "@/components/logout-button";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import {
  DashboardIcon,
  TenantsIcon,
  DomainsIcon,
  UsersIcon,
  PackagesIcon,
  SubscriptionsIcon,
  PaymentsIcon,
  BackupsIcon,
  ApplicationsIcon,
  CredentialsIcon,
  AuditLogsIcon,
  SearchIcon,
  PlusIcon,
  BellIcon,
} from "@/components/nav-icons";

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  is_superuser?: boolean;
  role?: string;
  platform?: string;
};

type Props = {
  user: AdminUser | null;
  children: ReactNode;
  onLogout?: () => void;
};

function getNavIcon(iconName?: string) {
  switch (iconName) {
    case "dashboard":
      return <DashboardIcon size={18} />;
    case "tenants":
      return <TenantsIcon size={18} />;
    case "domains":
      return <DomainsIcon size={18} />;
    case "users":
      return <UsersIcon size={18} />;
    case "packages":
      return <PackagesIcon size={18} />;
    case "subscriptions":
      return <SubscriptionsIcon size={18} />;
    case "payments":
      return <PaymentsIcon size={18} />;
    case "backups":
      return <BackupsIcon size={18} />;
    case "applications":
      return <ApplicationsIcon size={18} />;
    case "credentials":
      return <CredentialsIcon size={18} />;
    case "audit-logs":
      return <AuditLogsIcon size={18} />;
    default:
      return <DashboardIcon size={18} />;
  }
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Admin navigation" className="flex flex-col gap-5 px-3 py-2">
      {siteConfig.navSections.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted select-none">
            {section.title}
          </p>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/overview" && pathname.startsWith(item.href));
              const icon = getNavIcon((item as { icon?: string }).icon);
              const badge = (item as { badge?: string }).badge;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                      active
                        ? "bg-default/80 font-semibold text-foreground shadow-xs"
                        : "text-muted hover:text-foreground hover:bg-default/40",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn(active ? "text-foreground" : "text-muted")}>
                        {icon}
                      </span>
                      <span>{item.label}</span>
                    </div>
                    {badge && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          badge === "New"
                            ? "bg-success/15 text-success"
                            : "bg-default text-muted",
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu({
  user,
  onLogout,
}: {
  user: AdminUser | null;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const displayName = user?.username ?? "Administrator";
  const email = user?.email || "admin@shebafi.xyz";

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        type="button"
        className="flex items-center gap-3 rounded-full border border-separator/60 p-1 pr-3 transition-colors hover:bg-default/40"
        onClick={() => setOpen((v) => !v)}
      >
        <AvatarGradient name={displayName} size="sm" />
        <span className="hidden flex-col items-start text-left sm:flex">
          <span className="text-xs font-semibold leading-tight text-foreground">
            {displayName}
          </span>
          <span className="text-[10px] text-muted">Admin</span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-separator bg-surface p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="border-b border-separator/80 px-3 py-2.5">
            <p className="text-xs font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-[11px] text-muted">{email}</p>
          </div>
          <Link
            href="/overview"
            role="menuitem"
            className="flex items-center rounded-xl px-3 py-2 text-xs font-medium text-foreground hover:bg-default/50 transition-colors"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            href="/tenants"
            role="menuitem"
            className="flex items-center rounded-xl px-3 py-2 text-xs font-medium text-foreground hover:bg-default/50 transition-colors"
            onClick={() => setOpen(false)}
          >
            Manage Tenants
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded-xl px-3 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({ user, children, onLogout }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const { handleLogout } = useLogout();
  const signOut = onLogout ?? handleLogout;
  const username = user?.username ?? "Admin";

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground selection:bg-accent selection:text-accent-foreground">
      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-separator/80 bg-surface/90 backdrop-blur-md lg:flex">
        <div className="flex flex-col overflow-y-auto">
          {/* User profile card at top of sidebar matching Reference Image 2 */}
          <div className="flex items-center gap-3 border-b border-separator/80 p-4">
            <AvatarGradient name={username} size="md" />
            <div className="flex flex-col leading-tight overflow-hidden">
              <span className="truncate text-sm font-bold text-foreground">
                {username}
              </span>
              <span className="text-xs text-muted font-medium">Platform Admin</span>
            </div>
            <div className="ml-auto">
              <span
                title="System Operational"
                className="inline-block h-2 w-2 rounded-full bg-success ring-4 ring-success/20 animate-pulse"
              />
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 py-2">
            <NavItems />
          </div>
        </div>

        {/* Sidebar Footer matching Reference Image 2 */}
        <div className="border-t border-separator/80 p-3 flex flex-col gap-1 text-xs">
          <Link
            href="/overview"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-muted transition-colors hover:text-foreground hover:bg-default/40 font-medium"
          >
            <span className="text-base">ℹ️</span>
            <span>Help & Information</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-muted transition-colors hover:text-danger hover:bg-danger/10 font-medium text-left"
          >
            <span className="text-base">🚪</span>
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      <Drawer isOpen={mobileOpen} onOpenChange={setMobileOpen}>
        <Drawer.Backdrop />
        <Drawer.Content className="w-72 max-w-[85vw] bg-surface">
          <div className="flex items-center gap-3 border-b border-separator/80 p-4">
            <AvatarGradient name={username} size="md" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-foreground">{username}</span>
              <span className="text-xs text-muted">Platform Admin</span>
            </div>
          </div>
          <div className="overflow-y-auto py-2">
            <NavItems onNavigate={() => setMobileOpen(false)} />
          </div>
        </Drawer.Content>
      </Drawer>

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-1 flex-col overflow-x-hidden">
        {/* Topbar matching Reference Images 2, 4, 5 */}
        <Surface className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-separator/80 bg-surface/80 px-4 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              className="grid h-9 w-9 place-items-center rounded-xl border border-separator/60 text-muted transition-colors hover:bg-default/50 hover:text-foreground lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <span className="text-lg leading-none">☰</span>
            </button>
            <div className="flex flex-col">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground">
                Good day, {username}
              </h1>
              <span className="text-[11px] text-muted hidden sm:inline-block">
                ShebaFi Multi-Tenant SaaS Control Plane
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search input with keyboard shortcut hint */}
            <div className="relative hidden md:flex items-center">
              <span className="absolute left-3 text-muted">
                <SearchIcon size={14} />
              </span>
              <input
                type="text"
                placeholder="Search control plane..."
                className="h-9 w-52 lg:w-64 rounded-full border border-separator/80 bg-surface-secondary/70 pl-8 pr-8 text-xs placeholder:text-muted focus:border-foreground focus:outline-none transition-all"
              />
              <kbd className="absolute right-2.5 rounded border border-separator/80 bg-surface px-1.5 py-0.5 text-[9px] font-medium text-muted">
                ⌘K
              </kbd>
            </div>

            {/* Quick Action Button matching Reference Image 2: "+ New Tenant" */}
            <Button
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-4 py-1.5 text-xs font-semibold shadow-xs hover:opacity-90 transition-all cursor-pointer"
              onPress={() => router.push("/tenants?action=new")}
            >
              <PlusIcon size={14} />
              <span>Create Tenant</span>
            </Button>

            {/* SLA Chip */}
            <Chip
              color="success"
              variant="soft"
              className="hidden lg:inline-flex text-[11px] font-semibold"
            >
              99.98% SLA
            </Chip>

            <div className="h-5 w-px bg-separator mx-1 hidden sm:block" />

            {/* Notification Bell */}
            <button
              type="button"
              aria-label="Notifications"
              className="relative grid h-9 w-9 place-items-center rounded-full border border-separator/60 text-muted transition-colors hover:bg-default/40 hover:text-foreground"
            >
              <BellIcon size={16} />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
            </button>

            {/* Theme Toggle */}
            <ThemeSwitch />

            {/* User Dropdown */}
            <UserMenu user={user} onLogout={signOut} />
          </div>
        </Surface>

        {/* Page Content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>

        {/* Footer */}
        <footer className="border-t border-separator/70 bg-surface/40 px-4 py-3 text-xs text-muted sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
            <span>© {new Date().getFullYear()} {siteConfig.name}</span>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Cluster Operational
              </span>
              <span>v2.4-ControlPlane</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

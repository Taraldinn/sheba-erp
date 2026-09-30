"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, Drawer, Surface } from "@heroui/react";

import { AvatarGradient } from "@/components/avatar-gradient";
import { ThemeSwitch } from "@/components/theme-switch";
import { useLogout } from "@/components/logout-button";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import {
  DashboardIcon,
  OrdersIcon,
  TrackerIcon,
  AnalyticsIcon,
  SettingsIcon,
  HelpIcon,
  LogoutIcon,
  SidebarToggleIcon,
  InviteIcon,
  SearchIcon,
  BellIcon,
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
} from "@/components/nav-icons";
import { Receipt } from "@gravity-ui/icons";

function OperationsIcon({
  size = 18,
  width,
  height,
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return <Receipt height={height ?? size} width={width ?? size} {...props} />;
}

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
    case "orders":
      return <OrdersIcon size={18} />;
    case "tracker":
      return <TrackerIcon size={18} />;
    case "analytics":
      return <AnalyticsIcon size={18} />;
    case "settings":
      return <SettingsIcon size={18} />;
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
    case "operations":
      return <Receipt size={18} />;
    default:
      return <DashboardIcon size={18} />;
  }
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Admin navigation"
      className="flex flex-col gap-5 px-3 py-2"
    >
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
                    className={cn(
                      "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                      active
                        ? "bg-default/80 font-semibold text-foreground shadow-xs"
                        : "text-muted hover:text-foreground hover:bg-default/40",
                    )}
                    href={item.href}
                    onClick={onNavigate}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          active ? "text-foreground" : "text-muted",
                        )}
                      >
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
        className="flex items-center gap-3 rounded-full border border-separator/60 p-1 pr-3 transition-colors hover:bg-default/40"
        type="button"
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
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-separator bg-surface p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          role="menu"
          tabIndex={0}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="border-b border-separator/80 px-3 py-2.5">
            <p className="text-xs font-semibold text-foreground">
              {displayName}
            </p>
            <p className="truncate text-[11px] text-muted">{email}</p>
          </div>
          <Link
            className="flex items-center rounded-xl px-3 py-2 text-xs font-medium text-foreground hover:bg-default/50 transition-colors"
            href="/overview"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            className="flex items-center rounded-xl px-3 py-2 text-xs font-medium text-foreground hover:bg-default/50 transition-colors"
            href="/tenants"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Manage Tenants
          </Link>
          <button
            className="flex w-full items-center rounded-xl px-3 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
            role="menuitem"
            type="button"
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
  const username =
    user?.username && user.username.toLowerCase() !== "admin"
      ? user.username
      : "Kate Moore";

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground selection:bg-accent selection:text-accent-foreground">
      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-separator/60 bg-surface/60 backdrop-blur-md lg:flex">
        <div className="flex flex-col overflow-y-auto">
          {/* User profile at top of sidebar matching reference screenshot: Avatar + Name + "Admin" */}
          <div className="flex items-center gap-3 p-5 pb-3">
            <AvatarGradient name={username} size="md" />
            <div className="flex flex-col leading-tight overflow-hidden">
              <span className="truncate text-sm font-bold text-foreground">
                {username}
              </span>
              <span className="text-xs text-muted font-medium">Admin</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 py-2">
            <NavItems />
          </div>
        </div>

        {/* Sidebar Footer matching reference screenshot */}
        <div className="p-4 pt-2 flex flex-col gap-1 text-xs">
          <Link
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-muted transition-colors hover:text-foreground hover:bg-default/40 font-medium"
            href="/overview"
          >
            <HelpIcon size={18} />
            <span>Help & Information</span>
          </Link>
          <button
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-muted transition-colors hover:text-danger hover:bg-danger/10 font-medium text-left cursor-pointer"
            type="button"
            onClick={signOut}
          >
            <LogoutIcon size={18} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      <Drawer isOpen={mobileOpen} onOpenChange={setMobileOpen}>
        <Drawer.Backdrop />
        <Drawer.Content className="w-72 max-w-[85vw] bg-surface">
          <div className="flex items-center gap-3 p-4">
            <AvatarGradient name={username} size="md" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-foreground">
                {username}
              </span>
              <span className="text-xs text-muted">Admin</span>
            </div>
          </div>
          <div className="overflow-y-auto py-2">
            <NavItems onNavigate={() => setMobileOpen(false)} />
          </div>
        </Drawer.Content>
      </Drawer>

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-1 flex-col overflow-x-hidden">
        {/* Topbar matching screenshot: sidebar toggle + "Good morning, {username}" + right icon circles and invite button */}
        <Surface className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-separator/60 bg-surface/70 px-4 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Toggle navigation"
              className="grid h-8 w-8 place-items-center rounded-lg border border-separator/70 text-muted transition-colors hover:bg-default/50 hover:text-foreground cursor-pointer"
              type="button"
              onClick={() => setMobileOpen(true)}
            >
              <SidebarToggleIcon size={16} />
            </button>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              Good morning, {username.split(" ")[0]}
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search circular button matching screenshot */}
            <button
              aria-label="Search"
              className="grid h-9 w-9 place-items-center rounded-full border border-separator/70 bg-surface text-muted transition-colors hover:bg-default/40 hover:text-foreground cursor-pointer shadow-2xs"
              type="button"
              onClick={() => {
                const searchInput = document.getElementById(
                  "employee-search-input",
                );

                if (searchInput) {
                  searchInput.focus();
                } else {
                  router.push("/overview");
                }
              }}
            >
              <SearchIcon size={15} />
            </button>

            {/* Notification Bell matching screenshot */}
            <button
              aria-label="Notifications"
              className="grid h-9 w-9 place-items-center rounded-full border border-separator/70 bg-surface text-muted transition-colors hover:bg-default/40 hover:text-foreground cursor-pointer shadow-2xs"
              type="button"
            >
              <BellIcon size={15} />
            </button>

            {/* Action Button matching screenshot: solid dark pill button "+ Invite" */}
            <Button
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background dark:bg-white dark:text-zinc-950 px-4 py-1.5 text-xs font-semibold shadow-xs hover:opacity-90 transition-all cursor-pointer"
              onPress={() => {
                window.dispatchEvent(new CustomEvent("open-invite-modal"));
              }}
            >
              <InviteIcon size={14} />
              <span>Invite</span>
            </Button>

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
            <span>
              © {new Date().getFullYear()} {siteConfig.name}
            </span>
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

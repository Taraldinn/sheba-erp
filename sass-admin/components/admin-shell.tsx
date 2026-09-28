"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Avatar,
  Button,
  Chip,
  Drawer,
  Surface,
} from "@heroui/react";

import { ThemeSwitch } from "@/components/theme-switch";
import { useLogout } from "@/components/logout-button";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  is_superuser?: boolean;
};

type Props = {
  user: AdminUser | null;
  children: ReactNode;
  onLogout?: () => void;
};

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Admin navigation" className="flex flex-col gap-6 px-3 py-4">
      {siteConfig.navSections.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {section.title}
          </p>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/overview" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent/15 font-medium text-accent"
                        : "text-foreground hover:bg-default/50",
                    )}
                  >
                    {item.label}
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
  const initials = (user?.username ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="relative">
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        variant="tertiary"
        className="flex items-center gap-2 px-2"
        onPress={() => setOpen((v) => !v)}
      >
        <Avatar className="h-8 w-8 text-xs">{initials}</Avatar>
        <span className="hidden flex-col items-start text-left sm:flex">
          <span className="text-sm font-medium">
            {user?.username ?? "Signed out"}
          </span>
          <span className="text-xs text-muted">{user?.email ?? ""}</span>
        </span>
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-lg border border-separator bg-surface shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <Link
            href="/overview"
            role="menuitem"
            className="block px-4 py-2 text-sm hover:bg-default/40"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </Link>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-danger/10"
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
  const { handleLogout } = useLogout();
  const signOut = onLogout ?? handleLogout;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-separator bg-surface lg:block">
        <div className="flex h-16 items-center gap-2 border-b border-separator px-4">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground text-sm font-bold">
            S
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{siteConfig.shortName}</span>
            <span className="text-xs text-muted">Control Plane</span>
          </div>
        </div>
        <NavItems />
      </aside>

      <Drawer isOpen={mobileOpen} onOpenChange={setMobileOpen}>
        <Drawer.Backdrop />
        <Drawer.Content className="w-72 max-w-[85vw]">
          <div className="flex h-16 items-center gap-2 border-b border-separator px-4">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground text-sm font-bold">
              S
            </span>
            <span className="text-sm font-semibold">{siteConfig.shortName}</span>
          </div>
          <NavItems onNavigate={() => setMobileOpen(false)} />
        </Drawer.Content>
      </Drawer>

      <div className="flex min-h-screen flex-1 flex-col">
        <Surface className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-separator bg-surface/80 px-4 backdrop-blur lg:px-6">
          <Button
            aria-label="Open navigation"
            className="lg:hidden"
            variant="tertiary"
            onPress={() => setMobileOpen(true)}
          >
            <span aria-hidden className="block text-xl leading-none">☰</span>
          </Button>
          <Link
            href="/overview"
            className="text-sm font-semibold no-underline hover:no-underline"
          >
            {siteConfig.name}
          </Link>
          {user?.is_superuser ? (
            <Chip color="accent" variant="soft" className="hidden md:inline-flex">
              Platform Admin
            </Chip>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <ThemeSwitch />
            <UserMenu user={user} onLogout={signOut} />
          </div>
        </Surface>

        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>

        <footer className="border-t border-separator bg-surface/60 px-4 py-3 text-xs text-muted lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
            <span>© {new Date().getFullYear()} {siteConfig.name}</span>
            <span>v1.0.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

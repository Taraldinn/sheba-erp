"use client";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Search, LogOut, Menu, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationPopover } from "@/components/notifications/NotificationPopover";
import { useAuth } from "@/lib/auth";

export interface HeaderProps {
  onToggleMobileMenu?: () => void;
}

export function Header({ onToggleMobileMenu }: HeaderProps) {
  const { user, logout, tenantId } = useAuth();
  const tenantName = user?.tenant?.name || tenantId || "shebafi";

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-sm px-4 lg:px-6">
      {/* Mobile Menu Hamburger Button */}
      <button
        type="button"
        onClick={onToggleMobileMenu}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent lg:hidden cursor-pointer"
        aria-label="Open mobile navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile Brand Indicator */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
          <Radio className="h-3.5 w-3.5" />
        </div>
        <span className="font-bold text-xs tracking-tight text-foreground uppercase">
          {tenantName}
        </span>
      </div>

      {/* Search */}
      <div className="relative flex-1 max-w-sm hidden md:flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search customers, invoices, routers..."
          className="h-8 w-full rounded-lg border border-input bg-muted/40 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
        />
      </div>

      <div className="flex items-center gap-2.5 ml-auto">
        {/* Active Tenant / User Badge */}
        {user && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-lg border border-border text-xs">
            <div className="w-5 h-5 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-[10px]">
              {user.username?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex flex-col text-left">
              <span className="font-semibold text-foreground leading-none">{user.username}</span>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5 font-mono">
                {tenantName}
              </span>
            </div>
          </div>
        )}

        {/* Notifications */}
        <NotificationPopover />

        {/* Dark / Light mode toggle */}
        <ThemeToggle />

        {/* Logout Button */}
        {user && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout("/login")}
            className="h-8 px-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
            title="Sign out of current session"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline ml-1.5 text-xs">Sign Out</span>
          </Button>
        )}
      </div>
    </header>
  );
}

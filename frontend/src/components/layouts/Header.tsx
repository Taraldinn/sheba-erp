"use client";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Search, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationPopover } from "@/components/notifications/NotificationPopover";
import { useAuth } from "@/lib/auth";

export function Header() {
  const { user, logout, tenantId } = useAuth();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-4 lg:px-6">
      {/* Search */}
      <div className="relative flex-1 max-w-sm hidden md:flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search…"
          className="h-8 w-full rounded-lg border border-input bg-muted/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
        />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Active Tenant / User Badge */}
        {user && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-lg border border-border text-xs">
            <div className="w-5 h-5 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-[10px]">
              {user.username?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex flex-col text-left">
              <span className="font-semibold text-foreground leading-none">{user.username}</span>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5 font-mono">
                {user.tenant_id || tenantId || "shebafi"}
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

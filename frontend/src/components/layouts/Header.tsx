"use client";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationPopover } from "@/components/notifications/NotificationPopover";

export function Header() {
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

      <div className="flex items-center gap-2 ml-auto">
        {/* Notifications */}
        <NotificationPopover />

        {/* Dark / Light mode toggle */}
        <ThemeToggle />
      </div>
    </header>
  );
}

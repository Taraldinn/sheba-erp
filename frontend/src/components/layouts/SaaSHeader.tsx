"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/lib/auth";

export function SaaSHeader() {
  const [query, setQuery] = useState("");
  const { user, logout } = useAuth();

  return (
    <header className="h-16 border-b border-border bg-card/60 backdrop-blur-md px-6 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Search Input */}
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search all tenants, domains, packages, or master users..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-slate-50 dark:bg-muted/40 border-slate-200 dark:border-border/80 text-slate-900 dark:text-foreground placeholder:text-slate-400 focus-visible:ring-violet-500"
          />
        </div>
      </div>

      {/* Right Telemetry & Actions */}
      <div className="flex items-center gap-3">
        {/* Real-time Telemetry Pill */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-muted/40 border border-slate-200 dark:border-border text-xs text-slate-700 dark:text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Cluster: <span className="text-foreground font-semibold">Active</span></span>
          <span className="text-slate-300 dark:text-border">|</span>
          <span>SLA: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">99.98%</span></span>
          <span className="text-slate-300 dark:text-border">|</span>
          <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">admin.shebafi.xyz</span>
        </div>

        {/* Quick Launch Tenant Onboard */}
        <Link href="/saas-admin?action=onboard">
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white shadow-xs shadow-violet-600/30 font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Onboard Tenant</span>
          </Button>
        </Link>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Super Admin Avatar & Info */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-border">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center font-bold text-xs shadow-sm">
            {user?.username ? user.username.slice(0, 2).toUpperCase() : "SA"}
          </div>
          <div className="hidden md:flex flex-col text-left leading-tight">
            <span className="text-xs font-bold text-foreground">
              {user?.username || "Control Plane"}
            </span>
            <span className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold">
              {user?.is_superuser ? "Super Admin" : "SaaS Operator"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout("/login")}
            className="h-8 px-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
            title="Sign out of control plane"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  ShieldCheck,
  Building2,
  Plus,
  Bell,
  Sun,
  Moon,
  Database,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function SaaSHeader() {
  const [query, setQuery] = useState("");

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
            className="pl-9 h-9 text-xs bg-muted/40 border-border/80 focus-visible:ring-violet-500"
          />
        </div>
      </div>

      {/* Right Telemetry & Actions */}
      <div className="flex items-center gap-3">
        {/* Real-time Telemetry Pill */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-muted/40 border border-border text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Cluster: <span className="text-foreground font-semibold">Active</span></span>
          <span className="text-border">|</span>
          <span>SLA: <span className="text-emerald-400 font-semibold">99.98%</span></span>
          <span className="text-border">|</span>
          <span className="font-mono text-indigo-400 font-semibold">admin.shebafi.xyz</span>
        </div>

        {/* Quick Launch Tenant Onboard */}
        <Link href="/saas-admin?action=onboard">
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white shadow-xs shadow-violet-600/30"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Onboard Tenant</span>
          </Button>
        </Link>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Super Admin Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 text-white flex items-center justify-center font-bold text-xs shadow-sm">
            SA
          </div>
          <div className="hidden md:flex flex-col text-left leading-tight">
            <span className="text-xs font-bold text-foreground">Super Admin</span>
            <span className="text-[10px] text-violet-400 font-medium">SaaS Overseer</span>
          </div>
        </div>
      </div>
    </header>
  );
}

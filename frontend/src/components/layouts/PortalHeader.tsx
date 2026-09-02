"use client";

import Link from "next/link";
import { Radio, Zap, Shield, LogOut, Bell, LayoutDashboard, UserCheck, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PortalHeader({ onPayClick }: { onPayClick?: () => void }) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/80 bg-card/80 backdrop-blur-md px-4 sm:px-8">
      {/* Brand & Client ID */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 text-white shadow-md shadow-indigo-600/30">
          <Radio className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-foreground">
              Sheba <span className="text-indigo-400">SelfCare</span>
            </span>
            <Badge variant="success" className="text-[10px] px-1.5 py-0 h-4">
              Online
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Subscriber Portal • <span className="font-mono text-foreground font-semibold">SB-1001</span>
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {onPayClick && (
          <Button
            size="sm"
            onClick={onPayClick}
            className="hidden sm:inline-flex bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white font-bold gap-1.5 shadow-md shadow-indigo-600/20 text-xs h-8"
          >
            <Zap className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
            Quick Recharge
          </Button>
        )}

        <div className="h-4 w-px bg-border/80 mx-1 hidden sm:block" />

        <Link href="/">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-border text-muted-foreground hover:text-foreground"
            title="Switch to Admin Dashboard"
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-indigo-400" />
            <span className="hidden md:inline">Admin Panel</span>
          </Button>
        </Link>

        <ThemeToggle />

        <Link href="/login">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 gap-1 px-2.5"
            title="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </Link>
      </div>
    </header>
  );
}

"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = (status || "Unknown").toLowerCase();

  let variantClass = "bg-muted text-muted-foreground border-border";

  if (
    normalized === "active" ||
    normalized === "online" ||
    normalized === "paid" ||
    normalized === "resolved" ||
    normalized === "success"
  ) {
    variantClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  } else if (
    normalized === "suspended" ||
    normalized === "expired" ||
    normalized === "offline" ||
    normalized === "overdue" ||
    normalized === "failed" ||
    normalized === "los" ||
    normalized === "dyinggasp"
  ) {
    variantClass = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
  } else if (
    normalized === "due" ||
    normalized === "unpaid" ||
    normalized === "pending" ||
    normalized === "in_progress" ||
    normalized === "warning"
  ) {
    variantClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
  } else if (
    normalized === "promiseactive" ||
    normalized === "free"
  ) {
    variantClass = "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border",
        variantClass,
        className
      )}
    >
      {status || "Unknown"}
    </span>
  );
}

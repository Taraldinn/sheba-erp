"use client";

import React from "react";
import { Chip as HeroChip } from "@heroui/react";
import { cn } from "@/lib/utils";

type ChipColor = "default" | "success" | "danger" | "warning" | "secondary" | "primary";
type ChipVariant = "primary" | "secondary" | "soft" | "tertiary";

interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}

function resolve(status: string): { color: ChipColor; variant: ChipVariant } | null {
  const normalized = (status || "Unknown").toLowerCase();

  if (
    normalized === "active" ||
    normalized === "online" ||
    normalized === "paid" ||
    normalized === "resolved" ||
    normalized === "success"
  ) {
    return { color: "success", variant: "soft" };
  }
  if (
    normalized === "suspended" ||
    normalized === "expired" ||
    normalized === "offline" ||
    normalized === "overdue" ||
    normalized === "failed" ||
    normalized === "los" ||
    normalized === "dyinggasp"
  ) {
    return { color: "danger", variant: "soft" };
  }
  if (
    normalized === "due" ||
    normalized === "unpaid" ||
    normalized === "pending" ||
    normalized === "in_progress" ||
    normalized === "warning"
  ) {
    return { color: "warning", variant: "soft" };
  }
  if (normalized === "promiseactive" || normalized === "free") {
    return { color: "secondary", variant: "soft" };
  }
  return null;
}

export function StatusBadge({ status, className, size = "sm" }: StatusBadgeProps) {
  const r = resolve(status || "Unknown");
  const color: ChipColor = r?.color ?? "default";
  const variant: ChipVariant = r?.variant ?? "soft";

  return (
    <HeroChip
      data-slot="status-badge"
      color={color as any}
      variant={variant as any}
      size={size}
      className={cn(
        "shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded-full",
        className
      )}
    >
      {status || "Unknown"}
    </HeroChip>
  );
}

"use client";

import * as React from "react";
import { Chip as HeroChip } from "@heroui/react";
import { cn } from "cn";

type ChipColor = "default" | "danger" | "success" | "warning" | "accent" | "primary" | "secondary";
type ChipVariant = "solid" | "soft" | "outline" | "dot";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "success"
    | "warning"
    | "outline"
    | "ghost"
    | "link";
}

export function Badge({
  className,
  variant = "default",
  children,
  ...props
}: BadgeProps) {
  let chipColor: ChipColor = "accent";
  let chipVariant: ChipVariant = "soft";

  if (variant === "secondary" || variant === "ghost") {
    chipColor = "default";
    chipVariant = "soft";
  } else if (variant === "success") {
    chipColor = "success";
    chipVariant = "soft";
  } else if (variant === "warning") {
    chipColor = "warning";
    chipVariant = "soft";
  } else if (variant === "destructive") {
    chipColor = "danger";
    chipVariant = "soft";
  } else if (variant === "outline") {
    chipVariant = "outline";
    chipColor = "default";
  }

  return (
    <HeroChip
      color={chipColor}
      variant={chipVariant}
      size="sm"
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className
      )}
      {...(props as any)}
    >
      {children}
    </HeroChip>
  );
}

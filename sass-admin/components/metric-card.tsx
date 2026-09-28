"use client";

import type { ReactNode } from "react";
import { Card } from "@heroui/react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  subtitle?: string;
  sparklineData?: number[];
  icon?: ReactNode;
  className?: string;
  badgeText?: string;
};

export function MetricCard({
  label,
  value,
  change,
  isPositive = true,
  subtitle,
  sparklineData,
  icon,
  className,
  badgeText,
}: Props) {
  // Generate SVG path for sparkline
  const sparklinePath = sparklineData && sparklineData.length > 1 ? (() => {
    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;
    const width = 100;
    const height = 28;
    const padding = 2;
    const usableHeight = height - padding * 2;

    const points = sparklineData.map((val, idx) => {
      const x = (idx / (sparklineData.length - 1)) * width;
      const y = height - padding - ((val - min) / range) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return `M ${points.join(" L ")}`;
  })() : null;

  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-2xl border border-separator/80 bg-surface p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-separator",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-default/60 text-foreground">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {value}
        </span>
        {change && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold select-none",
              isPositive
                ? "bg-success/15 text-success"
                : "bg-danger/15 text-danger",
            )}
          >
            <span>{isPositive ? "↑" : "↓"}</span>
            {change}
          </span>
        )}
        {badgeText && !change && (
          <span className="inline-flex items-center rounded-full bg-default px-2.5 py-0.5 text-xs font-medium text-muted">
            {badgeText}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        {subtitle && (
          <span className="text-xs text-muted font-medium">{subtitle}</span>
        )}
        {sparklinePath && (
          <div className="ml-auto w-24 h-7 overflow-hidden">
            <svg
              viewBox="0 0 100 28"
              className={cn(
                "w-full h-full stroke-2 fill-none overflow-visible",
                isPositive ? "stroke-success" : "stroke-danger",
              )}
            >
              <path
                d={sparklinePath}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
    </Card>
  );
}

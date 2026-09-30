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
  const sparklinePath =
    sparklineData && sparklineData.length > 1
      ? (() => {
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
        })()
      : null;

  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-2xl border border-separator/60 bg-surface p-5 shadow-xs transition-all duration-200 hover:shadow-sm hover:border-separator/80",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-default/60 text-foreground">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <span className="text-2xl sm:text-[26px] font-bold tracking-tight text-foreground">
          {value}
        </span>
        {change && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold select-none",
              isPositive
                ? "bg-[#ECFDF3] text-[#12B76A] dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-[#FEF3F2] text-[#F04438] dark:bg-rose-950/40 dark:text-rose-400",
            )}
          >
            <span>{isPositive ? "↑" : "↓"}</span>
            {change}
          </span>
        )}
        {badgeText && !change && (
          <span className="inline-flex items-center rounded-full bg-default/80 px-2 py-0.5 text-xs font-medium text-muted">
            {badgeText}
          </span>
        )}
      </div>

      {(subtitle || sparklinePath) && (
        <div className="mt-2 flex items-center justify-between">
          {subtitle && (
            <span className="text-xs text-muted font-medium">{subtitle}</span>
          )}
          {sparklinePath && (
            <div className="ml-auto w-24 h-7 overflow-hidden">
              <svg
                className={cn(
                  "w-full h-full stroke-2 fill-none overflow-visible",
                  isPositive ? "stroke-success" : "stroke-danger",
                )}
                viewBox="0 0 100 28"
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
      )}
    </Card>
  );
}

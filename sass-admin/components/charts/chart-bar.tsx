"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export type BarDataPoint = {
  label: string;
  value: number;
  formatted?: string;
};

type Props = {
  data: BarDataPoint[];
  height?: number;
  barColor?: string;
  className?: string;
  unit?: string;
  yTicks?: string[];
};

export function ChartBar({
  data,
  height = 180,
  barColor = "fill-foreground",
  className,
  unit = "",
  yTicks,
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-muted">
        No chart data available.
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const maxValue = Math.max(...values, 10);
  const chartHeight = 140;
  const paddingBottom = 24;
  const paddingLeft = yTicks && yTicks.length > 0 ? 28 : 8;
  const paddingRight = 8;
  const totalSvgHeight = chartHeight + paddingBottom;

  const barWidth = 14;
  const totalWidth = Math.max(data.length * 36, 320);
  const usableWidth = totalWidth - paddingLeft - paddingRight;

  return (
    <div
      className={cn("relative w-full overflow-x-auto select-none", className)}
    >
      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 pointer-events-none rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-accent-foreground shadow-md transition-opacity duration-150">
          {data[hoveredIdx].label}:{" "}
          {data[hoveredIdx].formatted || `${unit}${data[hoveredIdx].value}`}
        </div>
      )}

      <svg
        className="w-full overflow-visible"
        preserveAspectRatio="none"
        style={{ height: `${height}px` }}
        viewBox={`0 0 ${totalWidth} ${totalSvgHeight}`}
      >
        {/* Horizontal gridlines and optional Y-ticks */}
        {[0, 0.33, 0.66, 1].map((pct, idx) => {
          const y = chartHeight - pct * (chartHeight - 12);
          const tickLabel =
            yTicks && yTicks[yTicks.length - 1 - idx]
              ? yTicks[yTicks.length - 1 - idx]
              : null;

          return (
            <g key={pct}>
              <line
                className="text-separator"
                stroke="currentColor"
                strokeDasharray="2 3"
                strokeWidth="1"
                x1={paddingLeft}
                x2={totalWidth - paddingRight}
                y1={y}
                y2={y}
              />
              {tickLabel && (
                <text
                  className="fill-muted text-[10px] font-medium"
                  textAnchor="end"
                  x={paddingLeft - 6}
                  y={y + 3}
                >
                  {tickLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Vertical bars */}
        {data.map((item, index) => {
          const barHeight = Math.max(
            (item.value / maxValue) * (chartHeight - 16),
            item.value > 0 ? 6 : 0,
          );
          const x =
            paddingLeft +
            (index + 0.5) * (usableWidth / data.length) -
            barWidth / 2;
          const y = chartHeight - barHeight;
          const isHovered = hoveredIdx === index;

          return (
            <g
              key={item.label + index}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(index)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Invisible wider hit area */}
              <rect
                fill="transparent"
                height={chartHeight}
                width={barWidth + 12}
                x={x - 6}
                y={0}
              />
              {/* The visible bar */}
              <rect
                className={cn(
                  "transition-all duration-200",
                  barColor,
                  isHovered
                    ? "opacity-100 scale-y-[1.02] origin-bottom filter drop-shadow-sm"
                    : "opacity-85 hover:opacity-100",
                )}
                height={barHeight}
                rx={barWidth / 2}
                ry={barWidth / 2}
                width={barWidth}
                x={x}
                y={y}
              />
              {/* X Axis Label */}
              <text
                className="fill-muted text-[10px] font-medium"
                textAnchor="middle"
                x={x + barWidth / 2}
                y={chartHeight + 16}
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

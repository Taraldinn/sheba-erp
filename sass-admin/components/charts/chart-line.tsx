"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type LineSeries = {
  name: string;
  data: number[];
  color?: string; // CSS stroke color class or hex
  gradientId?: string;
  dashed?: boolean;
};

type Props = {
  series: LineSeries[];
  labels: string[];
  height?: number;
  className?: string;
  yTicks?: string[];
  unit?: string;
};

// Generates smooth SVG cubic bezier path from discrete points
function createSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return d;
}

export function ChartLine({
  series,
  labels,
  height = 180,
  className,
  yTicks,
  unit = "",
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!series || series.length === 0 || !labels || labels.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-muted">
        No line chart data available.
      </div>
    );
  }

  const allValues = series.flatMap((s) => s.data);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 10);
  const range = maxVal - minVal || 1;

  const totalWidth = 540;
  const chartHeight = 140;
  const paddingLeft = yTicks && yTicks.length > 0 ? 32 : 12;
  const paddingRight = 12;
  const usableWidth = totalWidth - paddingLeft - paddingRight;

  return (
    <div className={cn("relative w-full overflow-hidden select-none", className)}>
      <svg
        viewBox={`0 0 ${totalWidth} ${chartHeight + 24}`}
        className="w-full overflow-visible"
        style={{ height: `${height}px` }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="areaGradientPrimary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" className="text-foreground" stopOpacity="0.12" />
            <stop offset="100%" stopColor="currentColor" className="text-foreground" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="areaGradientAccent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" className="text-muted" stopOpacity="0.08" />
            <stop offset="100%" stopColor="currentColor" className="text-muted" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.33, 0.66, 1].map((pct, idx) => {
          const y = chartHeight - pct * (chartHeight - 12);
          const tickLabel = yTicks && yTicks[idx] ? yTicks[idx] : null;
          return (
            <g key={pct}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={totalWidth - paddingRight}
                y2={y}
                stroke="currentColor"
                className="text-separator"
                strokeDasharray="2 3"
                strokeWidth="1"
              />
              {tickLabel && (
                <text
                  x={paddingLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted text-[9px] font-medium"
                >
                  {tickLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Series paths */}
        {series.map((s, sIdx) => {
          const points = s.data.map((val, idx) => {
            const x =
              paddingLeft + (idx / Math.max(s.data.length - 1, 1)) * usableWidth;
            const y =
              chartHeight - ((val - minVal) / range) * (chartHeight - 16) - 4;
            return { x, y };
          });

          const pathD = createSmoothPath(points);
          const firstPt = points[0];
          const lastPt = points[points.length - 1];
          const areaD = `${pathD} L ${lastPt.x} ${chartHeight} L ${firstPt.x} ${chartHeight} Z`;

          const strokeClass =
            s.color || (sIdx === 0 ? "stroke-foreground" : "stroke-muted");

          return (
            <g key={s.name + sIdx}>
              {/* Optional area fill for the first series */}
              {sIdx === 0 && (
                <path
                  d={areaD}
                  fill="url(#areaGradientPrimary)"
                  className="transition-opacity duration-300"
                />
              )}
              {/* The smooth line */}
              <path
                d={pathD}
                fill="none"
                stroke="currentColor"
                className={cn("stroke-2 transition-all duration-300", strokeClass)}
                strokeDasharray={s.dashed ? "4 3" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Data points */}
              {points.map((pt, pIdx) => (
                <circle
                  key={pIdx}
                  cx={pt.x}
                  cy={pt.y}
                  r={hoveredIdx === pIdx ? 4 : 2}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className={cn(
                    "fill-surface transition-all duration-150 cursor-pointer",
                    strokeClass,
                    hoveredIdx === pIdx ? "scale-125 stroke-[2.5]" : "",
                  )}
                  onMouseEnter={() => setHoveredIdx(pIdx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              ))}
            </g>
          );
        })}

        {/* X Axis Labels */}
        {labels.map((lbl, idx) => {
          // Show every 2nd or 3rd label if too many
          const step = labels.length > 8 ? Math.ceil(labels.length / 6) : 1;
          if (idx % step !== 0 && idx !== labels.length - 1) return null;

          const x =
            paddingLeft + (idx / Math.max(labels.length - 1, 1)) * usableWidth;
          return (
            <text
              key={lbl + idx}
              x={x}
              y={chartHeight + 16}
              textAnchor="middle"
              className="fill-muted text-[10px] font-medium"
            >
              {lbl}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

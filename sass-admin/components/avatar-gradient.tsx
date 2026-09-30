"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-blue-500 via-indigo-500 to-purple-500",
  "from-pink-500 via-rose-500 to-orange-400",
  "from-emerald-400 via-teal-500 to-cyan-500",
  "from-amber-400 via-orange-500 to-red-500",
  "from-violet-500 via-purple-600 to-pink-500",
  "from-cyan-400 via-blue-500 to-indigo-600",
  "from-fuchsia-500 via-pink-500 to-rose-400",
  "from-teal-400 via-emerald-500 to-green-600",
];

type Props = {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  showInitials?: boolean;
};

const SIZE_CLASSES = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-14 h-14 text-lg",
};

export function AvatarGradient({
  name,
  size = "md",
  className,
  showInitials = true,
}: Props) {
  const gradient = useMemo(() => {
    let hash = 0;

    for (let i = 0; i < (name || "").length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % GRADIENTS.length;

    return GRADIENTS[index];
  }, [name]);

  const initials = useMemo(() => {
    if (!name) return "?";
    const parts = name.trim().split(/[\s_-]+/);

    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    return name.slice(0, 2).toUpperCase();
  }, [name]);

  return (
    <div
      aria-label={name}
      className={cn(
        "relative inline-flex items-center justify-center shrink-0 rounded-full bg-gradient-to-tr font-semibold text-white shadow-xs overflow-hidden select-none",
        gradient,
        SIZE_CLASSES[size],
        className,
      )}
    >
      <div className="absolute inset-0 bg-white/15 backdrop-blur-[1px] rounded-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent opacity-60 rounded-full" />
      {showInitials && (
        <span className="relative z-10 text-[11px] font-bold drop-shadow-xs">
          {initials}
        </span>
      )}
    </div>
  );
}

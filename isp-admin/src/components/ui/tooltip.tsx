"use client";

import * as React from "react";
import { Tooltip as HeroTooltip } from "@heroui/react";
import { cn } from "cn";

interface TooltipProps {
  children?: React.ReactNode;
  content?: React.ReactNode;
  text?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delay?: number;
  closeDelay?: number;
  placement?:
    | "top"
    | "right"
    | "bottom"
    | "left"
    | "top-start"
    | "top-end"
    | "right-start"
    | "right-end"
    | "bottom-start"
    | "bottom-end"
    | "left-start"
    | "left-end";
  showArrow?: boolean;
  offset?: number;
}

function TooltipProvider({ children }: { children?: React.ReactNode; delay?: number }) {
  return <>{children}</>;
}

function Tooltip({
  children,
  content,
  text,
  open,
  defaultOpen,
  onOpenChange,
  delay = 0,
  closeDelay = 0,
  placement = "top",
  showArrow = true,
  offset = 8,
}: TooltipProps) {
  return (
    <HeroTooltip
      delay={delay}
      closeDelay={closeDelay}
      isOpen={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange as any}
      // @ts-expect-error placement on trigger primitive
      placement={placement}
      offset={offset}
    >
      {children}
      <HeroTooltip.Content
        className={cn(
          "z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs text-background font-medium shadow-md",
          "data-[entering=true]:animate-in data-[entering=true]:fade-in-0 data-[entering=true]:zoom-in-95",
          "data-[exiting=true]:animate-out data-[exiting=true]:fade-out-0 data-[exiting=true]:zoom-out-95"
        )}
      >
        {content ?? text}
        {showArrow && <HeroTooltip.Arrow className="fill-foreground" />}
      </HeroTooltip.Content>
    </HeroTooltip>
  );
}

function TooltipTrigger({ children, asChild, ...props }: { children?: React.ReactNode; asChild?: boolean; className?: string }) {
  return (
    <HeroTooltip.Trigger data-slot="tooltip-trigger" {...(props as any)}>
      {children}
    </HeroTooltip.Trigger>
  );
}

function TooltipContent({
  className,
  children,
  sideOffset = 4,
}: {
  className?: string;
  children?: React.ReactNode;
  sideOffset?: number;
}) {
  return (
    <HeroTooltip.Content
      data-slot="tooltip-content"
      className={cn(
        "z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs text-background font-medium shadow-md",
        className
      )}
      offset={sideOffset}
    >
      {children}
    </HeroTooltip.Content>
  );
}

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent };

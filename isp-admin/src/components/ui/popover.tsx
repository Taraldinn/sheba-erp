"use client";

import * as React from "react";
import { Popover as HeroPopover } from "@heroui/react";
import { cn } from "cn";

interface PopoverRootProps {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
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
}

function Popover({ children, ...props }: PopoverRootProps) {
  return (
    <HeroPopover
      data-slot="popover"
      placement={props.placement as any}
      {...(props as any)}
    >
      {children}
    </HeroPopover>
  );
}

function PopoverTrigger({ children, asChild, ...props }: { children?: React.ReactNode; asChild?: boolean; className?: string }) {
  return (
    <HeroPopover.Trigger data-slot="popover-trigger" {...(props as any)}>
      {children}
    </HeroPopover.Trigger>
  );
}

interface PopoverContentProps {
  className?: string;
  children?: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  showArrow?: boolean;
}

function PopoverContent({
  className,
  children,
  align = "center",
  sideOffset = 6,
  showArrow = false,
  ...props
}: PopoverContentProps) {
  const placement =
    align === "start"
      ? "bottom-start"
      : align === "end"
        ? "bottom-end"
        : "bottom";

  return (
    <HeroPopover.Content
      data-slot="popover-content"
      className={cn(
        "z-50 flex w-72 max-w-xs origin-(--trigger-anchor-point) flex-col gap-4 rounded-3xl bg-popover border border-border p-4 text-sm text-popover-foreground shadow-xl outline-hidden",
        "data-[enter=true]:animate-in data-[enter=true]:fade-in-0 data-[enter=true]:zoom-in-95",
        "data-[exit=true]:animate-out data-[exit=true]:fade-out-0 data-[exit=true]:zoom-out-95",
        className
      )}
      {...(props as any)}
    >
      {children}
      {showArrow && (
        <HeroPopover.Arrow className="fill-popover">
          <svg width={12} height={12} viewBox="0 0 12 12">
            <path d="M0 0L6 6L12 0" fill="currentColor" />
          </svg>
        </HeroPopover.Arrow>
      )}
    </HeroPopover.Content>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <HeroPopover.Heading
      data-slot="popover-title"
      className={cn("text-base font-semibold leading-none tracking-tight text-foreground", className)}
      {...(props as any)}
    />
  );
}

function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
};
"use client";

import * as React from "react";
import { Dropdown as HeroDropdown } from "@heroui/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "cn";

interface DropdownMenuRootProps {
  children?: React.ReactNode;
  className?: string;
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

function DropdownMenu({ children, className, placement = "bottom-start" }: DropdownMenuRootProps) {
  return (
    <HeroDropdown
      data-slot="dropdown-menu"
      className={cn(className)}
      // @ts-expect-error placement is supported via underlying primitive but not in declared props
      placement={placement}
    >
      {children}
    </HeroDropdown>
  );
}

interface DropdownMenuTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  children?: React.ReactNode;
}

function DropdownMenuTrigger({ children, asChild, ...props }: DropdownMenuTriggerProps) {
  return (
    <HeroDropdown.Trigger data-slot="dropdown-menu-trigger" {...(props as any)}>
      {children}
    </HeroDropdown.Trigger>
  );
}

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
}

function DropdownMenuContent({ children, className, sideOffset = 4, ...props }: DropdownMenuContentProps) {
  return (
    <HeroDropdown.Popover
      data-slot="dropdown-menu-content"
      offset={sideOffset}
      className={cn(
        "z-50 isolate max-h-(--available-height) min-w-48 overflow-hidden rounded-3xl bg-popover border border-border text-popover-foreground shadow-lg ring-1 ring-foreground/5",
        "data-[entering=true]:animate-in data-[entering=true]:fade-in-0 data-[entering=true]:zoom-in-95",
        "data-[exiting=true]:animate-out data-[exiting=true]:fade-out-0 data-[exiting=true]:zoom-out-95",
        className
      )}
      {...(props as any)}
    >
      <HeroDropdown.Menu
        aria-label="Dropdown menu"
        className="max-h-96 overflow-auto p-1.5 outline-none"
      >
        {children}
      </HeroDropdown.Menu>
    </HeroDropdown.Popover>
  );
}

interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  variant?: "default" | "destructive";
  onSelect?: () => void;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  onSelect,
  onClick,
  children,
  ...props
}: DropdownMenuItemProps) {
  return (
    <HeroDropdown.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      onAction={() => {
        onSelect?.();
        if (onClick) onClick({} as any);
      }}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium outline-hidden select-none",
        "data-[hover=true]:bg-accent data-[hover=true]:text-accent-foreground",
        "data-[focus=true]:bg-accent data-[focus=true]:text-accent-foreground",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        variant === "destructive" && "text-danger data-[hover=true]:text-danger data-[hover=true]:bg-danger/10",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...(props as any)}
    >
      {children}
    </HeroDropdown.Item>
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-[focus=true]:text-accent-foreground",
        className
      )}
      {...props}
    />
  );
}

interface DropdownMenuLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
}

function DropdownMenuLabel({ className, inset, ...props }: DropdownMenuLabelProps) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        inset && "pl-9",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <div
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border/50", className)}
    />
  );
}

interface DropdownMenuCheckboxItemProps extends React.HTMLAttributes<HTMLDivElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  inset?: boolean;
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onCheckedChange,
  inset,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <HeroDropdown.Item
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      onAction={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-2xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none",
        "data-[hover=true]:bg-accent data-[hover=true]:text-accent-foreground",
        "data-[focus=true]:bg-accent data-[focus=true]:text-accent-foreground",
        className
      )}
      {...(props as any)}
    >
      {checked ? (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4 text-primary" />
      ) : (
        <span className="size-4" />
      )}
      {children}
    </HeroDropdown.Item>
  );
}

interface DropdownMenuRadioItemProps extends React.HTMLAttributes<HTMLDivElement> {
  checked?: boolean;
  value?: string;
  inset?: boolean;
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <HeroDropdown.Item
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-2xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none",
        "data-[hover=true]:bg-accent data-[hover=true]:text-accent-foreground",
        "data-[focus=true]:bg-accent data-[focus=true]:text-accent-foreground",
        className
      )}
      {...(props as any)}
    >
      <span className="size-4" />
      {children}
    </HeroDropdown.Item>
  );
}

function DropdownMenuGroup({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="dropdown-menu-group" {...props}>
      {children}
    </div>
  );
}

function DropdownMenuRadioGroup({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="dropdown-menu-radio-group" {...props}>
      {children}
    </div>
  );
}

function DropdownMenuIndicator({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function DropdownMenuSubTrigger({ children }: { children?: React.ReactNode; inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-sub-trigger"
      className="flex cursor-default items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium"
    >
      {children}
      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="ml-auto size-4" />
    </div>
  );
}

function DropdownMenuSubContent({ children }: { children?: React.ReactNode; className?: string }) {
  return (
    <div
      data-slot="dropdown-menu-sub-content"
      className="z-50 w-auto min-w-36 rounded-3xl bg-popover p-1.5 text-popover-foreground shadow-lg"
    >
      {children}
    </div>
  );
}

function DropdownMenuSub({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function DropdownMenuPortal(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dropdown-menu-portal" {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuIndicator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};

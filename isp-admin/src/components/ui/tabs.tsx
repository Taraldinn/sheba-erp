"use client";

import * as React from "react";
import { Tabs as HeroTabs } from "@heroui/react";
import { cn } from "cn";

interface TabsRootProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
  children?: React.ReactNode;
}

function Tabs({
  defaultValue,
  value,
  onValueChange,
  orientation = "horizontal",
  className,
  children,
}: TabsRootProps) {
  return (
    <HeroTabs
      aria-label="tabs"
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation as any}
      selectedKey={value as any}
      defaultSelectedKey={defaultValue as any}
      onSelectionChange={(k: any) => onValueChange?.(k as string)}
      className={cn("flex flex-col gap-3", className)}
    >
      {children}
    </HeroTabs>
  );
}

interface TabsListProps extends React.HTMLAttributes<"div"> {
  variant?: "default" | "line" | "pill";
  children?: React.ReactNode;
}

function TabsList({ children, className, variant = "pill" }: TabsListProps) {
  const variantClasses = {
    pill:
      "inline-flex w-fit items-center justify-center rounded-full p-1 bg-default-100 text-muted-foreground",
    line:
      "inline-flex h-9 w-fit items-center justify-center gap-1 bg-transparent rounded-none",
    default:
      "inline-flex h-9 w-fit items-center justify-center rounded-3xl bg-default-100 text-muted-foreground p-1",
  } as const;

  return (
    <HeroTabs.ListContainer
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(variantClasses[variant], className)}
    >
      <HeroTabs.List className="inline-flex items-center gap-1 outline-none">
        {children}
      </HeroTabs.List>
    </HeroTabs.ListContainer>
  );
}

interface TabsTriggerProps {
  value: string;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

function TabsTrigger({ value, className, disabled, children }: TabsTriggerProps) {
  return (
    <HeroTabs.Tab
      id={value}
      data-slot="tabs-trigger"
      isDisabled={disabled}
      className={cn(
        "relative inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all outline-none cursor-pointer",
        "hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring/30",
        "data-[selected=true]:bg-background data-[selected=true]:text-foreground data-[selected=true]:shadow-sm",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
    >
      {children}
    </HeroTabs.Tab>
  );
}

interface TabsContentProps {
  value: string;
  className?: string;
  children?: React.ReactNode;
}

function TabsContent({ value, className, children }: TabsContentProps) {
  return (
    <HeroTabs.Panel
      id={value}
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
    >
      {children}
    </HeroTabs.Panel>
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
};

"use client";

import * as React from "react";
import {
  Select as HeroSelect,
  ListBox as HeroListBox,
  ListBoxItem as HeroListBoxItem,
  ListBoxSection as HeroListBoxSection,
} from "@heroui/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UnfoldMoreIcon,
  Tick02Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "cn";

type ItemLike = string | { value: string; label?: React.ReactNode };

interface SelectProps {
  items?: ItemLike[];
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  onChange?: (e: { target: { value: string | string[] } }) => void;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  name?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "flat" | "bordered" | "faded" | "underlined";
  selectionMode?: "single" | "multiple";
  children?: React.ReactNode;
  required?: boolean;
}

function filterDecorators(children: React.ReactNode): React.ReactNode {
  // Drop the legacy compound wrappers from consumer code; HeroSelect renders Trigger/Content internally.
  const out: React.ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      if (child !== null && child !== undefined && child !== false) out.push(child);
      return;
    }
    const t: any = child.type;
    if (t && (t === SelectTrigger || t === SelectContent)) return;
    if (t && (t as any).displayName === "SelectTrigger") return;
    if (t && (t as any).displayName === "SelectContent") return;
    out.push(child);
  });
  return out;
}

function flattenChildren(children: React.ReactNode): { value: string; label: React.ReactNode }[] {
  const items: { value: string; label: React.ReactNode }[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const type: any = child.type;
    if (type && (type as any).displayName === "SelectItem") {
      const props: any = child.props;
      items.push({ value: props.value, label: props.children ?? props.textLabel ?? props.value });
    } else if (type && (type as any).displayName === "SelectGroup") {
      const gp: any = child.props;
      React.Children.forEach(gp.children, (sub: any) => {
        if (React.isValidElement(sub) && (sub.type as any).displayName === "SelectItem") {
          const sp: any = sub.props;
          items.push({ value: sp.value, label: sp.children ?? sp.textLabel ?? sp.value });
        }
      });
    }
  });
  return items;
}

function Select({
  items: itemsProp,
  value,
  defaultValue,
  onValueChange,
  onChange,
  placeholder,
  disabled,
  className,
  size = "md",
  variant = "bordered",
  selectionMode = "single",
  children,
  ...rest
}: SelectProps) {
  const isMultiple = selectionMode === "multiple";

  const flattened = React.useMemo(() => {
    if (itemsProp && itemsProp.length > 0) {
      return (itemsProp as ItemLike[]).map((it) =>
        typeof it === "string" ? { value: it, label: it } : { value: it.value, label: it.label ?? it.value }
      );
    }
    return flattenChildren(filterDecorators(children));
  }, [itemsProp, children]);

  const triggerPlaceholder = React.useMemo(() => {
    let ph: React.ReactNode = placeholder;
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const t: any = child.type;
      if (t === SelectTrigger || (t as any)?.displayName === "SelectTrigger") {
        React.Children.forEach((child.props as any).children, (c: any) => {
          if (!React.isValidElement(c)) return;
          const ct: any = c.type;
          if (ct === SelectValue || (ct as any)?.displayName === "SelectValue") {
            const pp: any = (c.props as any).placeholder;
            if (pp !== undefined) ph = pp;
          }
        });
      }
    });
    return ph;
  }, [children, placeholder]);

  const handleSelectionChange = (keys: any) => {
    if (!keys) return;
    let result: string | string[];
    if (isMultiple) {
      result = Array.from(keys instanceof Set ? keys : new Set(keys));
    } else {
      const k =
        keys instanceof Set
          ? Array.from(keys)[0]
          : typeof keys === "string"
            ? keys
            : Array.from(keys)[0];
      result = k as string;
    }
    onValueChange?.(result as any);
    if (onChange) onChange({ target: { value: result as any } });
  };

  const selectedKeys = React.useMemo(() => {
    if (value == null) return undefined;
    if (isMultiple) return new Set(Array.isArray(value) ? value : [value]);
    return new Set([value as string]);
  }, [value, isMultiple]);

  const defaultSelectedKeys = React.useMemo(() => {
    if (defaultValue == null) return undefined;
    if (isMultiple) return new Set(Array.isArray(defaultValue) ? defaultValue : [defaultValue]);
    return new Set([defaultValue as string]);
  }, [defaultValue, isMultiple]);

  const heroSize = size === "sm" ? "sm" : size === "lg" ? "lg" : "md";

  return (
    <HeroSelect
      data-slot="select"
      data-size={size}
      isDisabled={disabled}
      selectionMode={selectionMode}
      variant={variant as any}
      // @ts-expect-error size is supported by HeroUI but missing from SelectRootProps type
      size={heroSize}
      selectedKeys={selectedKeys as any}
      defaultSelectedKeys={defaultSelectedKeys as any}
      onSelectionChange={handleSelectionChange as any}
      name={rest.name}
      isRequired={rest.required}
      className={cn("w-full", className)}
    >
      <HeroSelect.Trigger
        data-slot="select-trigger"
        className={cn(
          "flex w-full items-center justify-between gap-1.5 rounded-medium border border-input bg-input/40 px-3 text-sm text-foreground whitespace-nowrap transition-colors outline-none",
          "data-[focus-visible=true]:border-ring data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-ring/30",
          "data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50",
          "data-placeholder:text-muted-foreground",
          size === "sm" && "h-8",
          size === "md" && "h-9",
          size === "lg" && "h-10"
        )}
      >
        <HeroSelect.Value
          data-slot="select-value"
          // @ts-expect-error placeholder is supported via React Aria SelectValue but missing from declared props
          placeholder={triggerPlaceholder}
          className="flex flex-1 text-left truncate"
        />
        <HeroSelect.Indicator className="shrink-0 text-muted-foreground">
          <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} className="size-4" />
        </HeroSelect.Indicator>
      </HeroSelect.Trigger>
      <HeroSelect.Popover
        data-slot="select-content"
        className="isolate z-50"
        offset={6}
      >
        <HeroListBox
          aria-label="Select options"
          data-slot="select-listbox"
          className="min-w-(--trigger-width) max-h-96 overflow-auto rounded-3xl border border-border bg-popover p-1.5 outline-none shadow-lg ring-1 ring-foreground/5"
        >
          {renderItems(filterDecorators(children), flattened)}
        </HeroListBox>
      </HeroSelect.Popover>
    </HeroSelect>
  );
}

function renderItems(items: React.ReactNode, fallback: { value: string; label: React.ReactNode }[]) {
  const arr: React.ReactNode[] = [];
  React.Children.forEach(items, (child) => arr.push(child));
  if (arr.length === 0) {
    return fallback.map((it) => (
      <SelectItem key={it.value} value={it.value}>
        {it.label}
      </SelectItem>
    ));
  }
  return arr;
}

interface SelectItemProps {
  value: string;
  children?: React.ReactNode;
  textLabel?: string;
  className?: string;
  disabled?: boolean;
}

function SelectItem({ value, children, textLabel, className, disabled }: SelectItemProps) {
  ;(SelectItem as any).displayName = "SelectItem";
  return (
    <HeroListBoxItem
      id={value}
      data-slot="select-item"
      textValue={textLabel ?? (typeof children === "string" ? children : value)}
      isDisabled={disabled}
      className={cn(
        "group/select-item relative flex w-full cursor-default items-center gap-2.5 rounded-2xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none",
        "data-[hover=true]:bg-accent data-[hover=true]:text-accent-foreground",
        "data-[focus=true]:bg-accent data-[focus=true]:text-accent-foreground",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
    >
      <span className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">{children}</span>
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center opacity-0 group-data-[selected=true]/select-item:opacity-100">
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="text-primary" />
      </span>
    </HeroListBoxItem>
  );
}

interface SelectGroupProps {
  children?: React.ReactNode;
  className?: string;
  label?: string;
}

function SelectGroup({ children, className, label }: SelectGroupProps) {
  ;(SelectGroup as any).displayName = "SelectGroup";
  return (
    <HeroListBoxSection
      data-slot="select-group"
      className={cn("scroll-my-1.5 p-1.5", className)}
    >
      {label && (
        <HeroListBoxSection
          aria-label={label}
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-1"
        >
          {label}
        </HeroListBoxSection>
      )}
      {children}
    </HeroListBoxSection>
  );
}

function SelectValue({
  className,
  placeholder,
}: {
  className?: string;
  placeholder?: React.ReactNode;
}) {
  return (
    <HeroSelect.Value
      data-slot="select-value"
      // @ts-expect-error placeholder is supported via React Aria SelectValue but missing from declared props
      placeholder={placeholder}
      className={cn("flex flex-1 text-left truncate", className)}
    />
  );
}

interface SelectLabelProps extends React.HTMLAttributes<HTMLDivElement> {}

function SelectLabel({ className, children, ...props }: SelectLabelProps) {
  return (
    <div
      data-slot="select-label"
      className={cn("px-3 py-2.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function SelectSeparator({ className }: { className?: string }) {
  return <div data-slot="select-separator" className={cn("-mx-1.5 my-1.5 h-px bg-border", className)} />;
}

function SelectScrollUpButton({ className }: { className?: string }) {
  return (
    <div
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1",
        className
      )}
    >
      <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
    </div>
  );
}

function SelectScrollDownButton({ className }: { className?: string }) {
  return (
    <div
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1",
        className
      )}
    >
      <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
    </div>
  );
}

function SelectTrigger({ children, _className, _rest }: { children?: React.ReactNode; className?: string } & Record<string, unknown>) {
  // Decorative wrapper — the real Trigger is rendered inside <Select>
  return <>{children}</>;
}

function SelectContent({ children, _className, _rest }: { children?: React.ReactNode; className?: string } & Record<string, unknown>) {
  // Decorative wrapper — the real Content/Popover is rendered inside <Select>
  return <>{children}</>;
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};

"use client";

import * as React from "react";
import { Button as HeroButton } from "@heroui/react";
import { cn } from "cn";

type HeroVariant = "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "danger";
type HeroSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  variant?:
    | "default"
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "danger"
    | "link";
  size?: "default" | "md" | "sm" | "xs" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  asChild?: boolean;
  isDisabled?: boolean;
  isIconOnly?: boolean;
  onPress?: () => void;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      disabled,
      isDisabled,
      isIconOnly,
      onClick,
      onPress,
      title,
      type = "button",
      children,
      ...props
    },
    ref
  ) => {
    // Map legacy variants to HeroUI v3 semantic variants
    let heroVariant: HeroVariant = "primary";
    if (variant === "secondary") heroVariant = "secondary";
    else if (variant === "outline") heroVariant = "outline";
    else if (variant === "ghost" || variant === "link") heroVariant = "ghost";
    else if (variant === "destructive" || variant === "danger") heroVariant = "danger";

    // Map legacy sizes to HeroUI v3 sizes
    let heroSize: HeroSize = "md";
    let isIcon = false;
    if (size === "sm" || size === "xs") heroSize = "sm";
    else if (size === "lg") heroSize = "lg";
    else if (size === "icon" || size === "icon-xs" || size === "icon-sm" || size === "icon-lg") {
      isIcon = true;
      if (size === "icon-xs" || size === "icon-sm") heroSize = "sm";
      else if (size === "icon-lg") heroSize = "lg";
    }

    const actuallyDisabled = Boolean(disabled || isDisabled);

    const handlePress = onPress
      ? () => onPress()
      : onClick
        ? (e: any) => {
            // Build a synthetic-ish event for React onClick listeners
            onClick(e as unknown as React.MouseEvent<HTMLButtonElement>);
          }
        : undefined;

    return (
      <HeroButton
        ref={ref as any}
        variant={heroVariant}
        size={heroSize}
        isDisabled={actuallyDisabled}
        isIconOnly={isIcon || isIconOnly}
        onPress={handlePress}
        className={cn(
          "font-medium whitespace-nowrap transition-all outline-none select-none",
          variant === "link" &&
            "bg-transparent shadow-none text-primary underline-offset-4 hover:underline data-[hover=true]:underline",
          isIcon && "p-0",
          size === "icon-xs" && "size-6",
          size === "icon-sm" && "size-8",
          size === "icon" && "size-9",
          size === "icon-lg" && "size-10",
          size === "xs" && "h-7 text-xs px-2",
          className
        )}
        title={title}
        type={type as any}
        {...(props as any)}
      >
        {children}
      </HeroButton>
    );
  }
);

Button.displayName = "Button";

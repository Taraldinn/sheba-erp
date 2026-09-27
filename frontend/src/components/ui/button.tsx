import * as React from "react"
import { Button as HeroButton } from "@heroui/react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        primary: "",
        secondary: "",
        outline: "",
        ghost: "",
        destructive: "",
        danger: "",
        link: "text-primary underline-offset-4 hover:underline bg-transparent shadow-none",
      },
      size: {
        default: "",
        md: "",
        xs: "text-xs h-7 px-2",
        sm: "",
        lg: "",
        icon: "size-9 p-0",
        "icon-xs": "size-6 p-0 text-xs",
        "icon-sm": "size-8 p-0",
        "icon-lg": "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isDisabled?: boolean;
  onPress?: () => void;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      disabled,
      isDisabled,
      onClick,
      onPress,
      title,
      type = "button",
      children,
      ...props
    },
    ref
  ) => {
    // Map variant to HeroUI semantics
    let heroVariant: "primary" | "secondary" | "outline" | "ghost" | "danger" = "primary";
    if (variant === "secondary") heroVariant = "secondary";
    else if (variant === "outline") heroVariant = "outline";
    else if (variant === "ghost" || variant === "link") heroVariant = "ghost";
    else if (variant === "destructive" || variant === "danger") heroVariant = "danger";

    let heroSize: "sm" | "md" | "lg" = "md";
    if (size === "sm" || size === "xs" || size === "icon-xs" || size === "icon-sm") heroSize = "sm";
    else if (size === "lg" || size === "icon-lg") heroSize = "lg";

    const actuallyDisabled = Boolean(disabled || isDisabled);

    return (
      <HeroButton
        ref={ref}
        variant={heroVariant}
        size={heroSize}
        isDisabled={actuallyDisabled}
        onPress={onPress || (onClick as any)}
        className={cn(buttonVariants({ variant, size }), className)}
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

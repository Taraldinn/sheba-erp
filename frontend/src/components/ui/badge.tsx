import * as React from "react"
import { Chip as HeroChip } from "@heroui/react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

export const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all",
  {
    variants: {
      variant: {
        default: "bg-primary/15 text-primary border border-primary/20",
        secondary: "bg-muted text-muted-foreground border border-border",
        destructive: "bg-destructive/15 text-destructive border border-destructive/20",
        success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
        warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
        outline: "border border-border text-foreground bg-transparent",
        ghost: "hover:bg-muted text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

type ChipColor = "default" | "danger" | "success" | "warning" | "accent";

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  let chipColor: ChipColor = "accent";
  let chipVariant: "solid" | "soft" | "outline" = "soft";

  if (variant === "secondary" || variant === "ghost") {
    chipColor = "default";
    chipVariant = "soft";
  } else if (variant === "success") {
    chipColor = "success";
    chipVariant = "soft";
  } else if (variant === "warning") {
    chipColor = "warning";
    chipVariant = "soft";
  } else if (variant === "destructive") {
    chipColor = "danger";
    chipVariant = "soft";
  } else if (variant === "outline") {
    chipVariant = "outline";
    chipColor = "default";
  }

  return (
    <HeroChip
      color={chipColor as any}
      variant={chipVariant as any}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {children}
    </HeroChip>
  );
}

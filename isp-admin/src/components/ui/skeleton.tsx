import { Skeleton as HeroSkeleton } from "@heroui/react";
import { cn } from "cn";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <HeroSkeleton
      data-slot="skeleton"
      className={cn("rounded-md bg-default-200", className)}
      {...(props as any)}
    />
  );
}

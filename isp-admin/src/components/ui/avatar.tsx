"use client";

import * as React from "react";
import { Avatar as HeroAvatar, AvatarGroup as HeroAvatarGroup } from "@heroui/react";
import { cn } from "cn";

type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  name?: string;
  alt?: string;
  size?: AvatarSize;
}

function AvatarRoot({
  className,
  size = "md",
  src,
  name,
  alt,
  children,
  ...props
}: AvatarProps & { children?: React.ReactNode }) {
  const heroSize = size === "sm" ? "sm" : size === "lg" ? "lg" : "md";

  return (
    <HeroAvatar
      data-slot="avatar"
      data-size={size}
      src={src}
      name={name}
      alt={alt}
      size={heroSize}
      isBordered
      color="default"
      className={cn(
        "shrink-0",
        size === "sm" && "size-6",
        size === "md" && "size-8",
        size === "lg" && "size-10",
        className
      )}
      {...(props as any)}
    >
      {children}
    </HeroAvatar>
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<"img">) {
  return (
    <HeroAvatar.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...(props as any)}
    />
  );
}

function AvatarFallback({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <HeroAvatar.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center bg-default-200 text-default-700 text-sm font-medium",
        className
      )}
      {...(props as any)}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-success text-success-foreground ring-2 ring-background size-2.5",
        className
      )}
      {...props}
    />
  );
}

function AvatarGroupComponent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <HeroAvatarGroup
      data-slot="avatar-group"
      className={cn("flex -space-x-2", className)}
      {...(props as any)}
    />
  );
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-default-200 text-default-700 text-sm ring-2 ring-background",
        className
      )}
      {...props}
    />
  );
}

export const Avatar = Object.assign(AvatarRoot, {
  Image: AvatarImage,
  Fallback: AvatarFallback,
  Badge: AvatarBadge,
  Group: AvatarGroupComponent,
  GroupCount: AvatarGroupCount,
});

export {
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  AvatarGroupComponent as AvatarGroup,
  AvatarGroupCount,
};

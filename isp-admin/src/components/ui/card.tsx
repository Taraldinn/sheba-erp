"use client";

import * as React from "react";
import { Card as HeroCard } from "@heroui/react";
import { cn } from "cn";

interface CardProps extends React.ComponentProps<"div"> {
  size?: "default" | "sm";
  variant?: "default" | "transparent" | "outline";
}

function CardRoot({ className, ...props }: CardProps) {
  return (
    <HeroCard
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 border border-border bg-card p-6 text-sm text-card-foreground shadow-sm transition-all",
        className
      )}
      {...(props as any)}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <HeroCard.Header
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...(props as any)}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <HeroCard.Title
      data-slot="card-title"
      className={cn(
        "font-heading text-base font-semibold leading-none tracking-tight text-foreground",
        className
      )}
      {...(props as any)}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <HeroCard.Description
      data-slot="card-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...(props as any)}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <HeroCard.Content
      data-slot="card-content"
      className={cn("flex-1", className)}
      {...(props as any)}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <HeroCard.Footer
      data-slot="card-footer"
      className={cn("flex items-center pt-2", className)}
      {...(props as any)}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("self-start justify-self-end", className)}
      {...props}
    />
  );
}

// Compound component pattern (HeroUI v3 style)
const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Action: CardAction,
  Content: CardContent,
  Body: CardContent,
  Footer: CardFooter,
});

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
